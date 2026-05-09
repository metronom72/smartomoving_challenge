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

const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type ConfidenceLevel = z.infer<typeof ConfidenceSchema>;

/** Tool name for Anthropic Messages API (forced tool_choice). */
export const SUBMIT_GAP_FINDINGS_TOOL_NAME = "submit_gap_findings" as const;

/**
 * Single structured-output tool: model must call this with gap findings (see Zod schemas below).
 */
export const gapFindingsTool = {
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

/** Raw tool_use input from the model (includes hidden chain-of-thought). */
const GapFindingsToolInputSchema = z
  .object({
    reasoning: trimmedNonempty,
    findings: z.array(GapFindingSchema),
  })
  .transform(({ findings }) => ({ findings }));

export function normalizeFindingsPayload(raw: unknown): FindingsPayload {
  return GapFindingsToolInputSchema.parse(raw);
}
