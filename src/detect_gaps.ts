import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { prettifyError, ZodError } from "zod";
import {
  hasUsableTranscript,
  parseAircallCall,
  shapeTranscript,
  shouldSkipShortOutbound,
} from "./aircall";
import { loadConfig } from "./config";
import {
  gapFindingsTool,
  normalizeFindingsPayload,
  SUBMIT_GAP_FINDINGS_TOOL_NAME,
  type FindingsPayload,
} from "./findings";
import {
  effectiveHaikuMaxOutputTokens,
  HAIKU_MAX_OUTPUT_TOKENS,
  isHaikuModel,
  resolveHaikuTranscriptMaxChars,
} from "./haiku_model_limits";
import {
  appendInvalidGapFindingsToolRetryHint,
  buildSystemPrompt,
  buildUserPrompt,
} from "./prompts";
import { buildCrmDigest, parseSmartMovingOpportunity } from "./smartmoving";

/** Haiku-tier list pricing (USD per million tokens), aligned with README. */
const USD_PER_MILLION_INPUT_TOKENS = 1;
const USD_PER_MILLION_OUTPUT_TOKENS = 5;

function logInfo(message: string): void {
  console.error(`[INFO] ${message}`);
}

function logError(message: string): void {
  console.error(`[ERROR] ${message}`);
}

function logEstimatedApiCost(usage: { input_tokens?: number; output_tokens?: number } | null | undefined): void {
  if (!usage) {
    logInfo("Anthropic response had no usage field; cost estimate unavailable.");
    return;
  }
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const usd =
    (inputTokens / 1_000_000) * USD_PER_MILLION_INPUT_TOKENS +
    (outputTokens / 1_000_000) * USD_PER_MILLION_OUTPUT_TOKENS;
  logInfo(
    `Estimated API cost: $${usd.toFixed(4)} (input_tokens=${inputTokens}, output_tokens=${outputTokens})`,
  );
}

function printFindings(payload: FindingsPayload): void {
  const out = { findings: payload.findings };
  console.log(JSON.stringify(out, null, 2));
}

function readJson(path: string): unknown {
  try {
    const text = readFileSync(path, "utf8");
    return JSON.parse(text) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to read JSON from ${path}: ${msg}`);
  }
}

function exitWithZodIssue(context: string, err: ZodError): never {
  logError(context);
  console.error(prettifyError(err));
  process.exit(1);
}

function inputFromSubmitGapFindingsTool(content: Anthropic.Messages.ContentBlock[]): unknown {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === SUBMIT_GAP_FINDINGS_TOOL_NAME) {
      return block.input;
    }
  }
  throw new Error(`Missing tool_use block for ${SUBMIT_GAP_FINDINGS_TOOL_NAME}`);
}

async function callAnthropic(
  client: Anthropic,
  model: string,
  maxTokens: number,
  system: string,
  user: string,
  retryOnBadJson: boolean,
): Promise<FindingsPayload> {
  const run = async (userContent: string): Promise<FindingsPayload> => {
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
      tools: [gapFindingsTool],
      tool_choice: {
        type: "tool",
        name: SUBMIT_GAP_FINDINGS_TOOL_NAME,
        disable_parallel_tool_use: true,
      },
    });
    logEstimatedApiCost(resp.usage);
    const raw = inputFromSubmitGapFindingsTool(resp.content);
    return normalizeFindingsPayload(raw);
  };

  try {
    return await run(user);
  } catch (e) {
    if (!retryOnBadJson) throw e;
    const fixUser = appendInvalidGapFindingsToolRetryHint(user);
    return await run(fixUser);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    logError("Usage: bun src/detect_gaps.ts <aircall.json> <smartmoving.json>");
    process.exit(2);
  }

  const [aircallPath, smartmovingPath] = argv;

  let cfg;
  try {
    cfg = loadConfig(process.cwd());
  } catch (e) {
    if (e instanceof ZodError) exitWithZodIssue("Invalid configuration JSON shape:", e);
    throw e;
  }

  const aircallRaw = readJson(aircallPath!);
  const smRaw = readJson(smartmovingPath!);

  let call;
  try {
    call = parseAircallCall(aircallRaw);
  } catch (e) {
    if (e instanceof ZodError) exitWithZodIssue(`Invalid Aircall JSON shape (${aircallPath}):`, e);
    throw e;
  }

  let opp;
  try {
    opp = parseSmartMovingOpportunity(smRaw);
  } catch (e) {
    if (e instanceof ZodError) exitWithZodIssue(`Invalid SmartMoving JSON shape (${smartmovingPath}):`, e);
    throw e;
  }

  if (!hasUsableTranscript(call)) {
    logInfo("Skipping LLM: no usable transcript");
    printFindings({ findings: [] });
    process.exit(0);
  }

  if (shouldSkipShortOutbound(call, cfg.filters.shortOutboundMaxDurationSeconds)) {
    const d =
      typeof call.duration === "number" && Number.isFinite(call.duration) ? call.duration : "unknown";
    logInfo(
      `Skipping LLM: outbound duration below threshold (duration_seconds=${d}, threshold_seconds=${cfg.filters.shortOutboundMaxDurationSeconds})`,
    );
    printFindings({ findings: [] });
    process.exit(0);
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || !apiKey.trim()) {
    logError(
      "ANTHROPIC_API_KEY is required in the environment when the LLM path runs (transcript present and outbound duration guard passed).",
    );
    process.exit(1);
  }

  const crmDigest = buildCrmDigest(opp);
  const dir = typeof call.direction === "string" ? call.direction : "unknown";
  const dur =
    typeof call.duration === "number" && Number.isFinite(call.duration) ? String(call.duration) : "unknown";
  const callMeta = `CALL_META: direction=${dir}, duration_seconds=${dur}`;

  const system = buildSystemPrompt();

  let transcriptMaxChars = cfg.shaping.transcriptMaxChars;
  if (isHaikuModel(cfg.anthropic.model)) {
    const resolved = resolveHaikuTranscriptMaxChars(
      system,
      callMeta,
      crmDigest,
      cfg.anthropic.maxInputTokens,
      cfg.shaping.transcriptMaxChars,
    );
    if (resolved < cfg.shaping.transcriptMaxChars) {
      logInfo(
        `Transcript cap lowered to ${resolved} characters to stay within configured max_input_tokens=${cfg.anthropic.maxInputTokens} (default from HAIKU_DESC.json unless overridden).`,
      );
    }
    transcriptMaxChars = resolved;
  }

  const transcript = shapeTranscript(call, transcriptMaxChars);

  const maxTokensRequest = isHaikuModel(cfg.anthropic.model)
    ? effectiveHaikuMaxOutputTokens(cfg.anthropic.maxTokens)
    : cfg.anthropic.maxTokens;
  if (maxTokensRequest < cfg.anthropic.maxTokens) {
    logInfo(
      `max_tokens clamped from ${cfg.anthropic.maxTokens} to ${maxTokensRequest} (Haiku max_tokens=${HAIKU_MAX_OUTPUT_TOKENS} per HAIKU_DESC.json).`,
    );
  }

  // Anthropic may return HTTP 529 (overloaded) or other 5xx; the official SDK retries
  // those responses (and e.g. 429) with backoff. maxRetries: 3 is explicit resilience
  // beyond the SDK default (2).
  const client = new Anthropic({
    apiKey: apiKey.trim(),
    timeout: cfg.anthropic.timeoutMs,
    maxRetries: 3,
  });

  const user = buildUserPrompt(transcript, crmDigest, callMeta);

  logInfo(`Calling Anthropic model: ${cfg.anthropic.model}`);

  let payload: FindingsPayload;
  try {
    payload = await callAnthropic(
      client,
      cfg.anthropic.model,
      maxTokensRequest,
      system,
      user,
      true,
    );
  } catch (e) {
    if (e instanceof ZodError) {
      logError("Model output failed schema validation:");
      console.error(prettifyError(e));
      process.exit(1);
    }
    const msg = e instanceof Error ? e.message : String(e);
    logError(`Anthropic request or JSON validation failed: ${msg}`);
    process.exit(1);
  }

  printFindings(payload);
  process.exit(0);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  logError(`Unexpected error: ${msg}`);
  process.exit(1);
});
