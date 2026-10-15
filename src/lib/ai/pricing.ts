/**
 * Credits mirror the provider's cost shape: output tokens cost ~5x input.
 *   1 credit = 1,000 input tokens or 200 output tokens (rounded up, min 1).
 */
export const INPUT_TOKENS_PER_CREDIT = 1000;
export const OUTPUT_TOKENS_PER_CREDIT = 200;
export const MAX_OUTPUT_TOKENS = 2500;
export const MAX_INPUT_CHARS = 20_000;
const PROMPT_OVERHEAD_TOKENS = 400;

export function creditsFor(usage: { inputTokens: number; outputTokens: number }): number {
  const exact = usage.inputTokens / INPUT_TOKENS_PER_CREDIT + usage.outputTokens / OUTPUT_TOKENS_PER_CREDIT;
  return Math.max(1, Math.ceil(exact));
}

/** Upper bound reserved before the call: a generous input estimate + max output. */
export function reservationFor(inputChars: number): number {
  const inputTokens = Math.ceil(inputChars / 3) + PROMPT_OVERHEAD_TOKENS;
  return creditsFor({ inputTokens, outputTokens: MAX_OUTPUT_TOKENS });
}
