/** Fixed taxonomy (11 values) for ops routing and validation. */
export const FINDING_CATEGORIES = [
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

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export type ConfidenceLevel = "high" | "medium" | "low";

export interface GapFinding {
  category: FindingCategory;
  summary: string;
  quote: string;
  confidence: ConfidenceLevel;
}

export interface FindingsPayload {
  findings: GapFinding[];
}

const CATEGORY_SET = new Set<string>(FINDING_CATEGORIES);

function isConfidence(s: string): s is ConfidenceLevel {
  return s === "high" || s === "medium" || s === "low";
}

export function normalizeFindingsPayload(raw: unknown): FindingsPayload {
  if (typeof raw !== "object" || raw === null || !("findings" in raw)) {
    throw new Error('Model output must be a JSON object with a "findings" array');
  }
  const findingsRaw = (raw as { findings: unknown }).findings;
  if (!Array.isArray(findingsRaw)) throw new Error('"findings" must be an array');

  const findings: GapFinding[] = [];
  for (let i = 0; i < findingsRaw.length; i++) {
    const item = findingsRaw[i];
    if (typeof item !== "object" || item === null) {
      throw new Error(`findings[${i}] must be an object`);
    }
    const o = item as Record<string, unknown>;
    const category = o["category"];
    const summary = o["summary"];
    const quote = o["quote"];
    const confidence = o["confidence"];
    if (typeof category !== "string" || !CATEGORY_SET.has(category)) {
      throw new Error(`findings[${i}].category must be one of: ${FINDING_CATEGORIES.join(", ")}`);
    }
    if (typeof summary !== "string" || !summary.trim()) {
      throw new Error(`findings[${i}].summary must be a non-empty string`);
    }
    if (typeof quote !== "string" || !quote.trim()) {
      throw new Error(`findings[${i}].quote must be a non-empty verbatim substring from the transcript`);
    }
    if (typeof confidence !== "string" || !isConfidence(confidence)) {
      throw new Error(`findings[${i}].confidence must be "high", "medium", or "low"`);
    }
    findings.push({
      category: category as FindingCategory,
      summary: summary.trim(),
      quote: quote.trim(),
      confidence,
    });
  }
  return { findings };
}

export function extractJsonObject(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  if (fence?.[1]) return fence[1]!.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}
