import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { normalizeFindingsPayload, SUBMIT_GAP_FINDINGS_TOOL_NAME } from "./findings";

describe("normalizeFindingsPayload", () => {
  test("strips reasoning and returns findings", () => {
    const out = normalizeFindingsPayload({
      reasoning: "compared transcript to CRM",
      findings: [
        {
          category: "OTHER",
          summary: " gap ",
          quote: " said on call ",
          confidence: "high",
        },
      ],
    });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]!.summary).toBe("gap");
    expect(out.findings[0]!.quote).toBe("said on call");
  });

  test("accepts empty findings with non-empty reasoning", () => {
    const out = normalizeFindingsPayload({
      reasoning: "nothing missing",
      findings: [],
    });
    expect(out.findings).toEqual([]);
  });

  test("rejects bad category", () => {
    expect(() =>
      normalizeFindingsPayload({
        reasoning: "x",
        findings: [{ category: "Nope", summary: "s", quote: "q", confidence: "low" }],
      }),
    ).toThrow(ZodError);
  });

  test("rejects empty summary after trim", () => {
    expect(() =>
      normalizeFindingsPayload({
        reasoning: "x",
        findings: [{ category: "OTHER", summary: "  ", quote: "q", confidence: "low" }],
      }),
    ).toThrow(ZodError);
  });

  test("rejects missing reasoning", () => {
    expect(() =>
      normalizeFindingsPayload({
        findings: [],
      } as unknown),
    ).toThrow(ZodError);
  });
});

describe("tool contract", () => {
  test("submit tool name is stable", () => {
    expect(SUBMIT_GAP_FINDINGS_TOOL_NAME).toBe("submit_gap_findings");
  });
});
