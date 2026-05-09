import { describe, expect, test } from "bun:test";
import {
  appendInvalidGapFindingsToolRetryHint,
  buildSystemPrompt,
  buildUserPrompt,
} from "./prompts";
import { SUBMIT_GAP_FINDINGS_TOOL_NAME } from "./findings";

describe("buildSystemPrompt", () => {
  test("includes taxonomy and tool name", () => {
    const s = buildSystemPrompt();
    expect(s).toContain("HEAVY_ITEMS");
    expect(s).toContain(SUBMIT_GAP_FINDINGS_TOOL_NAME);
    expect(s).toContain("Only report GAPS");
  });
});

describe("buildUserPrompt", () => {
  test("embeds meta, transcript, and digest sections", () => {
    const u = buildUserPrompt("t line", "digest block", "CALL_META: x=1");
    expect(u).toContain("CALL_META: x=1");
    expect(u).toContain("CALL TRANSCRIPT (speaker-prefixed lines):");
    expect(u).toContain("t line");
    expect(u).toContain("CRM DIGEST:");
    expect(u).toContain("digest block");
  });
});

describe("appendInvalidGapFindingsToolRetryHint", () => {
  test("appends corrective instruction", () => {
    const base = "original user";
    const next = appendInvalidGapFindingsToolRetryHint(base);
    expect(next.startsWith(base)).toBe(true);
    expect(next).toContain("not usable");
    expect(next).toContain(SUBMIT_GAP_FINDINGS_TOOL_NAME);
  });
});
