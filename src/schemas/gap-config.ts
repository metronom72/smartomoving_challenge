import { z } from "zod";

export const GapDetectorConfigSchema = z.object({
  anthropic: z.object({
    model: z.string().trim().min(1),
    /** API `max_tokens` budget (capped per model, e.g. Haiku — see HAIKU_DESC.json). */
    maxTokens: z.number().finite().positive(),
    /** Context window input limit used for transcript budgeting (Haiku: HAIKU_DESC.json `max_input_tokens`). */
    maxInputTokens: z.number().finite().positive(),
    timeoutMs: z.number().finite().positive(),
  }),
  filters: z.object({
    shortOutboundMaxDurationSeconds: z.number().finite().nonnegative(),
  }),
  shaping: z.object({
    transcriptMaxChars: z.number().finite().positive(),
  }),
});

export type GapDetectorConfig = z.infer<typeof GapDetectorConfigSchema>;
