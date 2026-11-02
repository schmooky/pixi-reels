/**
 * Cheap token estimate used for chunk sizing. A word-piece tokenizer lands
 * near 4 chars per token on English prose and closer to 3 on code; chunk
 * bounds are soft, so the prose figure is good enough for both.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
