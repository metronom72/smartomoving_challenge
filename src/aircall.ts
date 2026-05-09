import { AircallCallSchema, type AircallCall } from "./schemas/aircall";

export type { AircallCall };

export function parseAircallCall(raw: unknown): AircallCall {
  return AircallCallSchema.parse(raw);
}

export function hasUsableTranscript(call: AircallCall): boolean {
  const utterances = call.transcription?.content?.utterances;
  if (!Array.isArray(utterances) || utterances.length === 0) return false;
  for (const u of utterances) {
    const t = typeof u?.text === "string" ? u.text.trim() : "";
    if (t.length > 0) return true;
  }
  return false;
}

/** Pure filter: skip LLM for short outbound calls (voicemail / no-answer). */
export function shouldSkipCall(
  direction: string | null | undefined,
  duration: number | null | undefined,
  thresholdSeconds: number,
): boolean {
  const dir = typeof direction === "string" ? direction.toLowerCase() : "";
  const dur = typeof duration === "number" && Number.isFinite(duration) ? duration : null;
  if (dir !== "outbound" || dur === null) return false;
  return dur < thresholdSeconds;
}

export function shouldSkipShortOutbound(call: AircallCall, thresholdSeconds: number): boolean {
  return shouldSkipCall(call.direction, call.duration ?? undefined, thresholdSeconds);
}

export class PayloadBuilder {
  /**
   * Join utterances as `speaker: text` lines. Truncate with a documented suffix
   * when exceeding maxChars (production safety valve; samples stay well under cap).
   */
  static formatUtterances(
    utterances: Array<{ speaker?: string; text?: string }>,
    maxChars: number,
  ): string {
    const lines: string[] = [];
    for (const u of utterances) {
      const speaker = typeof u.speaker === "string" && u.speaker.trim() ? u.speaker.trim() : "unknown";
      const text = typeof u.text === "string" ? u.text.trim() : "";
      if (!text) continue;
      lines.push(`${speaker}: ${text}`);
    }
    const full = lines.join("\n");
    if (full.length <= maxChars) return full;
    const suffix = "\n...[transcript truncated]";
    const cut = maxChars - suffix.length;
    return full.slice(0, Math.max(0, cut)) + suffix;
  }
}

/**
 * Join utterances as `speaker: text` lines. Truncate with a documented suffix
 * when exceeding maxChars (production safety valve; samples stay well under cap).
 */
export function shapeTranscript(call: AircallCall, maxChars: number): string {
  return PayloadBuilder.formatUtterances(call.transcription?.content?.utterances ?? [], maxChars);
}
