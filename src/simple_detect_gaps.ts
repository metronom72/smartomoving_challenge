/**
 * Standalone minimal CLI: two JSON files → Anthropic (forced tool) → stdout `{ findings }`.
 * No other project imports, no Zod, no config files — env + JSON.parse only.
 *
 * Env: ANTHROPIC_API_KEY (required). Optional: ANTHROPIC_MODEL, ANTHROPIC_MAX_TOKENS,
 * ANTHROPIC_TIMEOUT_MS, TRANSCRIPT_MAX_CHARS.
 *
 * Usage: bun src/simple_detect_gaps.ts <aircall.json> <smartmoving.json>
 */
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const SUBMIT_GAP_FINDINGS_TOOL_NAME = "submit_gap_findings";

const FINDING_CATEGORIES = [
  "HEAVY_ITEMS",
  "SPECIAL_HANDLING",
  "ACCESS",
  "BUILDING_MGMT",
  "ADDRESS_CHANGE",
  "TIMING",
  "PAYMENT",
  "COMMUNICATION_PREFS",
  "INVENTORY_OR_CONTENTS",
  "PARKING_OR_LOADING",
  "OTHER",
] as const;

const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

const gapFindingsTool = {
  name: SUBMIT_GAP_FINDINGS_TOOL_NAME,
  description:
    "Submit the final CRM-vs-transcript gap analysis. Include brief reasoning (transcript vs digest), then findings; call once — use an empty findings array when there are none.",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning: {
        type: "string",
        description:
          "Step-by-step comparison of the transcript vs the CRM digest: what you checked and where they diverge, before listing gaps. Be concise; do not paste the full call.",
      },
      findings: {
        type: "array",
        description: "Gaps only: transcript facts missing or contradicted in the CRM digest.",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [...FINDING_CATEGORIES],
              description: "Taxonomy bucket for the gap.",
            },
            summary: {
              type: "string",
              description: "Short factual description of the gap (one or two sentences max).",
            },
            quote: {
              type: "string",
              description: "Verbatim substring from the transcript supporting the gap.",
            },
            confidence: {
              type: "string",
              enum: [...CONFIDENCE_LEVELS],
              description: "How sure you are this is a real gap.",
            },
          },
          required: ["category", "summary", "quote", "confidence"],
        },
      },
    },
    required: ["reasoning", "findings"],
  },
};

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

function readJsonLoose(path: string): unknown {
  const text = readFileSync(path, "utf8");
  return JSON.parse(text) as unknown;
}

function shapeTranscriptLoose(aircall: unknown, maxChars: number): string {
  const root = aircall as Record<string, unknown> | null;
  const transcription = root?.["transcription"] as Record<string, unknown> | undefined;
  const content = transcription?.["content"] as Record<string, unknown> | undefined;
  const utterances = content?.["utterances"];
  const list = Array.isArray(utterances) ? utterances : [];
  const lines: string[] = [];
  for (const u of list) {
    const row = u as Record<string, unknown>;
    const speaker =
      typeof row["speaker"] === "string" && row["speaker"].trim() ? row["speaker"].trim() : "unknown";
    const text = typeof row["text"] === "string" ? row["text"].trim() : "";
    if (!text) continue;
    lines.push(`${speaker}: ${text}`);
  }
  const full = lines.join("\n");
  if (full.length <= maxChars) return full;
  const suffix = "\n...[transcript truncated]";
  const cut = maxChars - suffix.length;
  return full.slice(0, Math.max(0, cut)) + suffix;
}

function omitNullish(label: string, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return `${label}: ${String(value)}`;
}

function flattenNotes(notes: Record<string, string | null | undefined> | null | undefined): string[] {
  if (!notes || typeof notes !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(notes)) {
    if (typeof v === "string" && v.trim()) out.push(`notes.${k}: ${v.trim()}`);
  }
  return out;
}

function summarizeInventoryLoose(
  items: Array<Record<string, unknown>> | undefined,
): string[] {
  if (!items?.length) return ["inventory.items: (none listed)"];
  return items.map((it) => {
    const name = typeof it["name"] === "string" ? it["name"] : "item";
    const qty =
      typeof it["quantity"] === "number" && Number.isFinite(it["quantity"]) ? it["quantity"] : 1;
    const w = it["estimatedWeightLbs"];
    const wpart = typeof w === "number" && Number.isFinite(w) ? `, ~${w} lbs ea` : "";
    return `${name} × ${qty}${wpart}`;
  });
}

function buildCrmDigestLoose(opp: unknown): string {
  const o = opp as Record<string, unknown>;
  const blocks: string[] = [];
  const header = [
    omitNullish("opportunity.quoteNumber", o["quoteNumber"]),
    omitNullish("opportunity.statusName", o["statusName"]),
    omitNullish("opportunity.serviceDate", o["serviceDate"]),
  ].filter(Boolean) as string[];
  if (header.length) blocks.push(header.join("\n"));

  const jobs = Array.isArray(o["jobs"]) ? (o["jobs"] as Record<string, unknown>[]) : [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]!;
    const jb: string[] = [];
    const jobLines = [
      omitNullish("quoteNumber", j["quoteNumber"] ?? o["quoteNumber"]),
      omitNullish("jobNumber", j["jobNumber"]),
      omitNullish("statusName", j["statusName"] ?? o["statusName"]),
      omitNullish("typeName", j["typeName"]),
      omitNullish("arrivalWindow", j["arrivalWindow"]),
      omitNullish("serviceDate", j["serviceDate"]),
    ].filter(Boolean) as string[];
    jb.push(`Job ${i + 1}:`);
    jb.push(...jobLines);

    const stops = Array.isArray(j["stops"]) ? (j["stops"] as Record<string, unknown>[]) : [];
    for (const s of stops) {
      const stopLines = [
        omitNullish("stop.type", s["type"]),
        omitNullish("stop.addressFullAddress", s["addressFullAddress"]),
        omitNullish("stop.addressUnit", s["addressUnit"]),
        omitNullish("stop.propertyTypeName", s["propertyTypeName"]),
        omitNullish("stop.stairs", s["stairs"]),
        omitNullish("stop.hasElevator", s["hasElevator"]),
        omitNullish("stop.parkingDescription", s["parkingDescription"]),
        omitNullish("stop.notes", s["notes"]),
      ].filter(Boolean) as string[];
      if (stopLines.length) {
        jb.push(`  Stop:`);
        for (const line of stopLines) jb.push(`    ${line}`);
      }
    }

    jb.push(`  notes:`);
    const jNotes = j["notes"] as Record<string, string | null | undefined> | undefined;
    for (const n of flattenNotes(jNotes ?? undefined)) jb.push(`    ${n}`);

    jb.push(`  inventory.summary:`);
    const inv = j["inventory"] as Record<string, unknown> | undefined;
    const invItems = Array.isArray(inv?.["items"])
      ? (inv!["items"] as Record<string, unknown>[])
      : undefined;
    for (const line of summarizeInventoryLoose(invItems)) jb.push(`    - ${line}`);

    blocks.push(jb.join("\n"));
  }

  return blocks.join("\n\n") || "(empty CRM digest)";
}

function inputFromSubmitGapFindingsTool(content: Anthropic.Messages.ContentBlock[]): unknown {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === SUBMIT_GAP_FINDINGS_TOOL_NAME) {
      return block.input;
    }
  }
  throw new Error(`Missing tool_use block for ${SUBMIT_GAP_FINDINGS_TOOL_NAME}`);
}

/** Pass through model tool payload; no schema validation. */
function findingsFromToolInput(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  const f = (raw as Record<string, unknown>)["findings"];
  return Array.isArray(f) ? f : [];
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error("Usage: bun src/simple_detect_gaps.ts <aircall.json> <smartmoving.json>");
    process.exit(2);
  }

  const [aircallPath, smartmovingPath] = argv;
  const apiKey = process.env["ANTHROPIC_API_KEY"]?.trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required.");
    process.exit(1);
  }

  const model = process.env["ANTHROPIC_MODEL"]?.trim() || "claude-haiku-4-5-20251001";
  const maxTokens = Math.max(
    1,
    Number.parseInt(process.env["ANTHROPIC_MAX_TOKENS"] || "8192", 10) || 8192,
  );
  const timeoutMs = Math.max(
    1000,
    Number.parseInt(process.env["ANTHROPIC_TIMEOUT_MS"] || "120000", 10) || 120000,
  );
  const transcriptMaxChars = Math.max(
    1,
    Number.parseInt(process.env["TRANSCRIPT_MAX_CHARS"] || "100000", 10) || 100000,
  );

  const aircallRaw = readJsonLoose(aircallPath!);
  const smRaw = readJsonLoose(smartmovingPath!);

  const transcript = shapeTranscriptLoose(aircallRaw, transcriptMaxChars);
  const crmDigest = buildCrmDigestLoose(smRaw);
  const root = aircallRaw as Record<string, unknown>;
  const dir = typeof root?.["direction"] === "string" ? root["direction"] : "unknown";
  const durRaw = root?.["duration"];
  const dur =
    typeof durRaw === "number" && Number.isFinite(durRaw) ? String(durRaw) : "unknown";
  const callMeta = `CALL_META: direction=${dir}, duration_seconds=${dur}`;

  const system = buildSystemPrompt();
  const user = buildUserPrompt(transcript, crmDigest, callMeta);

  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    tools: [gapFindingsTool],
    tool_choice: {
      type: "tool",
      name: SUBMIT_GAP_FINDINGS_TOOL_NAME,
      disable_parallel_tool_use: true,
    },
  });

  const rawInput = inputFromSubmitGapFindingsTool(resp.content);
  const findings = findingsFromToolInput(rawInput);
  console.log(JSON.stringify({ findings }, null, 2));
}

export function handleSimpleMainRejection(e: unknown): void {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

if (import.meta.main) {
  main().catch(handleSimpleMainRejection);
}
