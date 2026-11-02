import type { Quantized } from './quantize.js';

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function norm(a: ArrayLike<number>): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: ArrayLike<number>): Float32Array {
  const n = norm(a) || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! / n;
  return out;
}

/** Cosine similarity of two float vectors of any norm. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

export interface Hit {
  index: number;
  score: number;
}

/**
 * Top-k by cosine of a float query against int8 unit vectors. The stored
 * vectors are unit length, so `dot(query, q) * scale / |query|` is the cosine
 * without dequantizing every row into a new array.
 */
export function topK(query: ArrayLike<number>, vectors: Quantized[], k: number): Hit[] {
  const qn = norm(query) || 1;
  const hits: Hit[] = [];
  for (let i = 0; i < vectors.length; i++) {
    const { q, scale } = vectors[i]!;
    const score = (dot(query, q) * scale) / qn;
    if (hits.length < k) {
      hits.push({ index: i, score });
      if (hits.length === k) hits.sort((a, b) => b.score - a.score);
      continue;
    }
    if (score <= hits[k - 1]!.score) continue;
    // Insert in place of the weakest hit, keeping the array sorted.
    let pos = k - 1;
    while (pos > 0 && hits[pos - 1]!.score < score) pos--;
    hits.splice(k - 1, 1);
    hits.splice(pos, 0, { index: i, score });
  }
  if (hits.length < k) hits.sort((a, b) => b.score - a.score);
  return hits;
}
