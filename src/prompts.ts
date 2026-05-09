import { FINDING_CATEGORIES, SUBMIT_GAP_FINDINGS_TOOL_NAME } from "./findings";

/**
 * Prompt design (see README for full trade-offs): compact CRM digest + line-shaped
 * transcript reduce tokens; structured tool output + Zod validation; “gaps only”
 * and fixed categories reduce false positives; Haiku chosen for cost/latency at volume.
 */
export function buildSystemPrompt(): string {
  const cats = FINDING_CATEGORIES.join(", ");
  return [
    "You are an analyst for a moving company CRM quality check.",
    "Compare operational facts explicitly stated in the CALL TRANSCRIPT against what is recorded or clearly implied in the CRM DIGEST.",
    "Only report GAPS: facts mentioned on the call that are missing, contradicted, or not reasonably reflected in the CRM digest.",
    "If the agent said they would note something but the CRM digest does not show it, that is still a gap.",
    "Do NOT report items that are already adequately captured in CRM notes, stops, inventory, or other fields.",
    "Inbound calls often supplement a Booked job; outbound calls may reveal changes vs a Quoted snapshot — same gap rules apply.",
    "",
    `Each finding must use category exactly one of: ${cats}.`,
    'confidence must be exactly "high", "medium", or "low".',
    "quote must be a verbatim substring copied from the transcript (one utterance or contiguous substring), used as evidence.",
    "summary must be a short factual description of the gap (one or two sentences max).",
    "",
    `Call ${SUBMIT_GAP_FINDINGS_TOOL_NAME} with: reasoning — short step-by-step comparison of transcript vs CRM digest (what you verified, what differs); findings — the gap list.`,
    "If there are no gaps, use an empty findings array; reasoning should still briefly state what you compared and that nothing was missing or contradicted.",
  ].join("\n");
}

export function buildUserPrompt(transcript: string, crmDigest: string, callMeta: string): string {
  return [
    callMeta,
    "",
    "CALL TRANSCRIPT (speaker-prefixed lines):",
    transcript,
    "",
    "CRM DIGEST:",
    crmDigest,
  ].join("\n");
}

/** Appended to the user message when the model returns unusable tool input and we retry once. */
export function appendInvalidGapFindingsToolRetryHint(userContent: string): string {
  const tool = SUBMIT_GAP_FINDINGS_TOOL_NAME;
  return [
    userContent,
    "",
    `Your previous response was not usable: missing or invalid ${tool} arguments.`,
    `Call ${tool} again with arguments that match the tool schema: non-empty reasoning string and findings array (empty array if none).`,
  ].join("\n");
}
