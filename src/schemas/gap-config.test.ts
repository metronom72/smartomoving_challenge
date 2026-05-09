import { describe, expect, test } from "bun:test";
import { GapDetectorConfigSchema } from "./gap-config";

describe("GapDetectorConfigSchema", () => {
  test("accepts full valid object", () => {
    const cfg = GapDetectorConfigSchema.parse({
      anthropic: {
        model: "m",
        maxTokens: 1000,
        maxInputTokens: 2000,
        timeoutMs: 3000,
      },
      filters: { shortOutboundMaxDurationSeconds: 0 },
      shaping: { transcriptMaxChars: 100 },
    });
    expect(cfg.filters.shortOutboundMaxDurationSeconds).toBe(0);
  });

  test("rejects non-positive maxTokens", () => {
    expect(() =>
      GapDetectorConfigSchema.parse({
        anthropic: {
          model: "m",
          maxTokens: 0,
          maxInputTokens: 1,
          timeoutMs: 1,
        },
        filters: { shortOutboundMaxDurationSeconds: 0 },
        shaping: { transcriptMaxChars: 1 },
      }),
    ).toThrow();
  });
});
