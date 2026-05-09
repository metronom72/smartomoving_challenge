import haikuDesc from "../HAIKU_DESC.json";
import { gapFindingsTool } from "./findings";

export const HAIKU_MODEL_ID: string = haikuDesc.id;
export const HAIKU_MAX_INPUT_TOKENS: number = haikuDesc.max_input_tokens;
export const HAIKU_MAX_OUTPUT_TOKENS: number = haikuDesc.max_tokens;

/** Conservative upper bound on tokens from UTF-16-ish text length (English-ish). */
const CHARS_PER_TOKEN_ESTIMATE = 3;

function approxTokensFromText(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function toolDefinitionOverheadTokens(): number {
  return approxTokensFromText(JSON.stringify(gapFindingsTool));
}

export function isHaikuModel(model: string): boolean {
  return model.trim() === HAIKU_MODEL_ID;
}

/** Ensures `max_tokens` never exceeds the model’s documented cap. */
export function effectiveHaikuMaxOutputTokens(requestedMax: number): number {
  return Math.min(requestedMax, HAIKU_MAX_OUTPUT_TOKENS);
}

/**
 * Max transcript characters so system + user framing + CRM digest + tool schema
 * stay within `max_input_tokens` (conservative length→token estimate).
 */
export function resolveHaikuTranscriptMaxChars(
  system: string,
  callMeta: string,
  crmDigest: string,
  maxInputTokenBudget: number,
  configuredMax: number,
): number {
  const head = `${callMeta}\n\nCALL TRANSCRIPT (speaker-prefixed lines):\n`;
  const tail = `\n\nCRM DIGEST:\n${crmDigest}`;
  const overheadTokens =
    approxTokensFromText(system + head + tail) + toolDefinitionOverheadTokens();
  const budgetTokens = maxInputTokenBudget - overheadTokens;
  if (budgetTokens <= 0) return 0;
  const maxTranscriptChars = Math.floor(budgetTokens * CHARS_PER_TOKEN_ESTIMATE);
  return Math.min(configuredMax, maxTranscriptChars);
}
