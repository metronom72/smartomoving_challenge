import { z } from "zod";

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

export const FindingCategorySchema = z.enum(FINDING_CATEGORIES);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceSchema>;

const trimmedNonempty = z.string().transform((s) => s.trim()).pipe(z.string().min(1));

const GapFindingSchema = z.object({
  category: FindingCategorySchema,
  summary: trimmedNonempty,
  quote: trimmedNonempty,
  confidence: ConfidenceSchema,
});

export type GapFinding = z.infer<typeof GapFindingSchema>;

export const FindingsPayloadSchema = z.object({
  findings: z.array(GapFindingSchema),
});

export type FindingsPayload = z.infer<typeof FindingsPayloadSchema>;

export function normalizeFindingsPayload(raw: unknown): FindingsPayload {
  return FindingsPayloadSchema.parse(raw);
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
