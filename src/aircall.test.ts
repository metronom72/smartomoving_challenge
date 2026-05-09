import { describe, expect, test } from "bun:test";
import { PayloadBuilder, shouldSkipCall } from "./aircall";

describe("shouldSkipCall", () => {
  test("returns true when outbound duration is strictly below threshold", () => {
    expect(shouldSkipCall("outbound", 10, 30)).toBe(true);
  });

  test("returns false when not a short outbound (inbound or duration at/above threshold)", () => {
    expect(shouldSkipCall("inbound", 5, 30)).toBe(false);
    expect(shouldSkipCall("outbound", 30, 30)).toBe(false);
    expect(shouldSkipCall("outbound", 45, 30)).toBe(false);
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
});
