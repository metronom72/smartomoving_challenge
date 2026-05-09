import { describe, expect, test } from "bun:test";
import {
  effectiveHaikuMaxOutputTokens,
  HAIKU_MAX_OUTPUT_TOKENS,
  HAIKU_MODEL_ID,
  isHaikuModel,
  resolveHaikuTranscriptMaxChars,
} from "./haiku_model_limits";
import { buildSystemPrompt } from "./prompts";

describe("isHaikuModel", () => {
  test("true when trimmed model id matches Haiku baseline", () => {
    expect(isHaikuModel(HAIKU_MODEL_ID)).toBe(true);
    expect(isHaikuModel(`  ${HAIKU_MODEL_ID}  `)).toBe(true);
    expect(isHaikuModel("claude-3-opus")).toBe(false);
  });
});

describe("effectiveHaikuMaxOutputTokens", () => {
  test("clamps to Haiku max", () => {
    expect(effectiveHaikuMaxOutputTokens(HAIKU_MAX_OUTPUT_TOKENS + 1)).toBe(HAIKU_MAX_OUTPUT_TOKENS);
    expect(effectiveHaikuMaxOutputTokens(100)).toBe(100);
  });
});

describe("resolveHaikuTranscriptMaxChars", () => {
  const system = buildSystemPrompt();
  const callMeta = "CALL_META: direction=inbound, duration_seconds=1";
  const crm = "CRM digest line";

  test("returns min of configured max and budget-derived chars", () => {
    const configured = 50_000;
    const n = resolveHaikuTranscriptMaxChars(system, callMeta, crm, 200_000, configured);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(configured);
  });

  test("returns 0 when token budget is exhausted", () => {
    const n = resolveHaikuTranscriptMaxChars(system, callMeta, crm, 1, 50_000);
    expect(n).toBe(0);
  });
});
