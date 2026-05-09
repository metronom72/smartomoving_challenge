import { describe, expect, test } from "bun:test";
import {
  hasUsableTranscript,
  parseAircallCall,
  PayloadBuilder,
  shapeTranscript,
  shouldSkipCall,
  shouldSkipShortOutbound,
} from "./aircall";
import type { AircallCall } from "./aircall";

describe("shouldSkipCall", () => {
  test("returns true when outbound duration is strictly below threshold", () => {
    expect(shouldSkipCall("outbound", 10, 30)).toBe(true);
  });

  test("returns false when not a short outbound (inbound or duration at/above threshold)", () => {
    expect(shouldSkipCall("inbound", 5, 30)).toBe(false);
    expect(shouldSkipCall("outbound", 30, 30)).toBe(false);
    expect(shouldSkipCall("outbound", 45, 30)).toBe(false);
  });

  test("treats non-outbound direction and non-finite duration as not skippable", () => {
    expect(shouldSkipCall(undefined, 10, 30)).toBe(false);
    expect(shouldSkipCall("OUTBOUND", 10, 30)).toBe(true);
    expect(shouldSkipCall("outbound", NaN, 30)).toBe(false);
    expect(shouldSkipCall("outbound", undefined, 30)).toBe(false);
  });
});

describe("parseAircallCall", () => {
  test("parses minimal valid call", () => {
    const c = parseAircallCall({
      direction: "inbound",
      duration: 60,
      transcription: { content: { utterances: [{ text: "hi" }] } },
    });
    expect(c.direction).toBe("inbound");
    expect(c.duration).toBe(60);
    expect(c.transcription?.content?.utterances?.length).toBe(1);
  });

  test("normalizes nullish utterances to empty array", () => {
    const c = parseAircallCall({
      transcription: { content: { utterances: null } },
    });
    expect(c.transcription?.content?.utterances).toEqual([]);
  });

  test("throws on invalid shape", () => {
    expect(() => parseAircallCall({ duration: NaN })).toThrow();
  });
});

describe("hasUsableTranscript", () => {
  test("false when no utterances or empty text only", () => {
    expect(hasUsableTranscript(parseAircallCall({}))).toBe(false);
    expect(
      hasUsableTranscript(
        parseAircallCall({
          transcription: { content: { utterances: [{ text: "  " }, { text: "" }] } },
        }),
      ),
    ).toBe(false);
  });

  test("true when any utterance has non-empty trimmed text", () => {
    const call = parseAircallCall({
      transcription: { content: { utterances: [{ text: "  x  " }] } },
    });
    expect(hasUsableTranscript(call)).toBe(true);
  });
});

describe("shouldSkipShortOutbound", () => {
  test("delegates to shouldSkipCall with call fields", () => {
    const call = parseAircallCall({ direction: "outbound", duration: 5 });
    expect(shouldSkipShortOutbound(call, 30)).toBe(true);
  });
});

describe("PayloadBuilder.formatUtterances", () => {
  test("formats utterances as speaker-prefixed lines joined by newlines", () => {
    expect(
      PayloadBuilder.formatUtterances(
        [
          { speaker: "Alice", text: "hello" },
          { speaker: "Bob", text: "hi" },
        ],
        10_000,
      ),
    ).toBe("Alice: hello\nBob: hi");
  });

  test("uses unknown speaker and skips empty text", () => {
    expect(
      PayloadBuilder.formatUtterances(
        [{ speaker: "", text: "a" }, { text: "b" }, { speaker: "S", text: "   " }],
        10_000,
      ),
    ).toBe("unknown: a\nunknown: b");
  });

  test("truncates with documented suffix when over maxChars", () => {
    const long = "x".repeat(100);
    const out = PayloadBuilder.formatUtterances([{ speaker: "A", text: long }], 40);
    expect(out.endsWith("\n...[transcript truncated]")).toBe(true);
    expect(out.length).toBe(40);
  });
});

describe("shapeTranscript", () => {
  test("uses PayloadBuilder on call utterances", () => {
    const call: AircallCall = parseAircallCall({
      transcription: { content: { utterances: [{ speaker: "a", text: "one" }] } },
    });
    expect(shapeTranscript(call, 100)).toBe("a: one");
  });

  test("empty when no transcription", () => {
    const call: AircallCall = parseAircallCall({});
    expect(shapeTranscript(call, 100)).toBe("");
  });
});
