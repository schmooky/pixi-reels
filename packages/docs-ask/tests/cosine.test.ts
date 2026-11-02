import { describe, expect, it } from 'vitest';
import { cosine, normalize, topK } from '../src/cosine.js';
import { dequantize, fromBase64, quantize, toBase64 } from '../src/quantize.js';

describe('cosine', () => {
  it('is 1 for parallel, 0 for orthogonal, -1 for opposite vectors', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });
});

describe('quantize', () => {
  it('round-trips a unit vector within int8 precision and through base64', () => {
    const v = normalize(Float32Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.37)));
    const q = quantize(v);
    const back = dequantize({ q: fromBase64(toBase64(q.q)), scale: q.scale });
    expect(cosine(v, back)).toBeGreaterThan(0.9999);
    expect(toBase64(q.q)).toHaveLength(512);
  });
});

describe('topK', () => {
  const rows = [
    normalize([1, 0, 0]),
    normalize([0.9, 0.1, 0]),
    normalize([0, 1, 0]),
    normalize([0, 0, 1]),
    normalize([-1, 0, 0]),
  ].map(quantize);

  it('returns the k best matches in descending order', () => {
    const hits = topK([1, 0, 0], rows, 2);
    expect(hits.map((h) => h.index)).toEqual([0, 1]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(hits[0]!.score).toBeCloseTo(1, 2);
  });

  it('handles k larger than the corpus and an unnormalized query', () => {
    const hits = topK([0, 5, 0], rows, 10);
    expect(hits).toHaveLength(5);
    expect(hits[0]!.index).toBe(2);
    expect(hits.at(-1)!.index === 4 || hits.at(-1)!.score <= hits[0]!.score).toBe(true);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
  });
});
