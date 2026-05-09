import { z } from "zod";

export const GapDetectorConfigSchema = z.object({
  anthropic: z.object({
    model: z.string().trim().min(1),
    maxTokens: z.number().finite().positive(),
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
