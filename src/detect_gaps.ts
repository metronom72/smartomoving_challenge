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
  FINDING_CATEGORIES,
  gapFindingsTool,
  normalizeFindingsPayload,
  SUBMIT_GAP_FINDINGS_TOOL_NAME,
  type FindingsPayload,
} from "./findings";
import { buildCrmDigest, parseSmartMovingOpportunity } from "./smartmoving";

function printFindings(payload: FindingsPayload): void {
  const out = { findings: payload.findings };
  process.stdout.write(`${JSON.stringify(out)}\n`);
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
  process.stderr.write(`${context}\n${prettifyError(err)}\n`);
  process.exit(1);
}

/**
 * Prompt design (see README for full trade-offs): compact CRM digest + line-shaped
 * transcript reduce tokens; structured tool output + Zod validation; “gaps only”
 * and fixed categories reduce false positives; Haiku chosen for cost/latency at volume.
 */
function buildSystemPrompt(): string {
  const cats = FINDING_CATEGORIES.join(", ");
  return [
    "You are an analyst for a moving company CRM quality check.",
    "Compare operational facts explicitly stated in the CALL TRANSCRIPT against what is recorded or clearly implied in the CRM DIGEST.",
    "Only report GAPS: facts mentioned on the call that are missing, contradicted, or not reasonably reflected in the CRM digest.",
    "If the agent said they would note something but the CRM digest does not show it, that is still a gap.",
    "Do NOT report items that are already adequately captured in CRM notes, stops, inventory, or other fields.",
    "Inbound calls often supplement a Booked job; outbound calls may reveal changes vs a Quoted snapshot — same gap rules apply.",
    "",
    `Each finding must use category exactly one of: ${cats}.`,
    'confidence must be exactly "high", "medium", or "low".',
    "quote must be a verbatim substring copied from the transcript (one utterance or contiguous substring), used as evidence.",
    "summary must be a short factual description of the gap (one or two sentences max).",
    "",
    `Call ${SUBMIT_GAP_FINDINGS_TOOL_NAME} with: reasoning — short step-by-step comparison of transcript vs CRM digest (what you verified, what differs); findings — the gap list.`,
    "If there are no gaps, use an empty findings array; reasoning should still briefly state what you compared and that nothing was missing or contradicted.",
  ].join("\n");
}

function buildUserPrompt(transcript: string, crmDigest: string, callMeta: string): string {
  return [
    callMeta,
    "",
    "CALL TRANSCRIPT (speaker-prefixed lines):",
    transcript,
    "",
    "CRM DIGEST:",
    crmDigest,
  ].join("\n");
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
    const raw = inputFromSubmitGapFindingsTool(resp.content);
    return normalizeFindingsPayload(raw);
  };

  try {
    return await run(user);
  } catch (e) {
    if (!retryOnBadJson) throw e;
    const fixUser = [
      user,
      "",
      `Your previous response was not usable: missing or invalid ${SUBMIT_GAP_FINDINGS_TOOL_NAME} arguments.`,
      `Call ${SUBMIT_GAP_FINDINGS_TOOL_NAME} again with arguments that match the tool schema: non-empty reasoning string and findings array (empty array if none).`,
    ].join("\n");
    return await run(fixUser);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    process.stderr.write(
      "Usage: bun src/detect_gaps.ts <aircall.json> <smartmoving.json>\n",
    );
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
    printFindings({ findings: [] });
    process.exit(0);
  }

  if (shouldSkipShortOutbound(call, cfg.filters.shortOutboundMaxDurationSeconds)) {
    printFindings({ findings: [] });
    process.exit(0);
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || !apiKey.trim()) {
    process.stderr.write(
      "ANTHROPIC_API_KEY is required in the environment when the LLM path runs (transcript present and outbound duration guard passed).\n",
    );
    process.exit(1);
  }

  const transcript = shapeTranscript(call, cfg.shaping.transcriptMaxChars);
  const crmDigest = buildCrmDigest(opp);
  const dir = typeof call.direction === "string" ? call.direction : "unknown";
  const dur =
    typeof call.duration === "number" && Number.isFinite(call.duration) ? String(call.duration) : "unknown";
  const callMeta = `CALL_META: direction=${dir}, duration_seconds=${dur}`;

  const client = new Anthropic({
    apiKey: apiKey.trim(),
    timeout: cfg.anthropic.timeoutMs,
  });

  const system = buildSystemPrompt();
  const user = buildUserPrompt(transcript, crmDigest, callMeta);

  let payload: FindingsPayload;
  try {
    payload = await callAnthropic(
      client,
      cfg.anthropic.model,
      cfg.anthropic.maxTokens,
      system,
      user,
      true,
    );
  } catch (e) {
    if (e instanceof ZodError) {
      process.stderr.write(`Model output failed schema validation:\n${prettifyError(e)}\n`);
      process.exit(1);
    }
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Anthropic request or JSON validation failed: ${msg}\n`);
    process.exit(1);
  }

  printFindings(payload);
  process.exit(0);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`Unexpected error: ${msg}\n`);
  process.exit(1);
});
