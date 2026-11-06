/**
 * Draw one key from a weight table. The stand-in for a server RNG in the
 * recipes: `pickWeighted({ A: 10, wild: 1 })` returns `'A'` ten times in
 * eleven.
 */
export function pickWeighted(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [id, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return id;
  }
  return Object.keys(weights)[0];
}
