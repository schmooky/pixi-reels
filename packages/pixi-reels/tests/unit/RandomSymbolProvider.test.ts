import { describe, it, expect } from 'vitest';
import { RandomSymbolProvider } from '../../src/frame/RandomSymbolProvider.js';

describe('RandomSymbolProvider', () => {
  it('returns symbols from the registered set', () => {
    const provider = new RandomSymbolProvider({
      cherry: { weight: 10 },
      seven: { weight: 5 },
      bar: { weight: 15 },
    });

    const symbols = new Set<string>();
    for (let i = 0; i < 100; i++) {
      symbols.add(provider.next());
    }
    expect(symbols.size).toBeGreaterThanOrEqual(2);
    for (const s of symbols) {
      expect(['cherry', 'seven', 'bar']).toContain(s);
    }
  });

  it('respects weight distribution approximately', () => {
    const provider = new RandomSymbolProvider({
      common: { weight: 90 },
      rare: { weight: 10 },
    });

    let commonCount = 0;
    const total = 10000;
    for (let i = 0; i < total; i++) {
      if (provider.next() === 'common') commonCount++;
    }

    const ratio = commonCount / total;
    // Should be roughly 90% ± 5%
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.95);
  });

  it('excludes spinning symbols', () => {
    const provider = new RandomSymbolProvider({
      a: { weight: 10 },
      b: { weight: 10 },
      c: { weight: 10 },
    });
    provider.setExcludeSpinning(['b', 'c']);

    for (let i = 0; i < 50; i++) {
      expect(provider.next()).toBe('a');
    }
  });

  it('excludes buffer symbols when requested', () => {
    const provider = new RandomSymbolProvider({
      a: { weight: 10 },
      b: { weight: 10 },
    });
    provider.setExcludeBuffer(['b']);

    for (let i = 0; i < 50; i++) {
      expect(provider.next(true)).toBe('a');
    }
  });

  it('uses the injected rng so the strip is replayable from a seed', () => {
    const seq = [0, 0.5, 0.99];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    const provider = new RandomSymbolProvider(
      { a: { weight: 10 }, b: { weight: 10 }, c: { weight: 10 } },
      rng,
    );
    // cumulative weights [10,20,30]; rand = u*30 → 0→a, 15→b, 29.7→c
    expect(provider.next()).toBe('a');
    expect(provider.next()).toBe('b');
    expect(provider.next()).toBe('c');
  });

  it('two providers with the same seeded rng produce identical sequences', () => {
    const make = () => {
      let s = 1;
      const rng = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x80000000;
      };
      return new RandomSymbolProvider(
        { a: { weight: 5 }, b: { weight: 5 }, c: { weight: 5 }, d: { weight: 5 } },
        rng,
      );
    };
    const p1 = make();
    const p2 = make();
    const seqA = Array.from({ length: 50 }, () => p1.next());
    const seqB = Array.from({ length: 50 }, () => p2.next());
    expect(seqA).toEqual(seqB);
  });

  it('throws on empty symbol data', () => {
    expect(() => new RandomSymbolProvider({})).toThrow(/at least one symbol/);
  });

  it('throws when every symbol has weight 0 (strip cannot be filled)', () => {
    expect(
      () => new RandomSymbolProvider({ a: { weight: 0 }, b: { weight: 0 } }),
    ).toThrow(/weight > 0/);
  });

  it('reconciles exclusions across a game-mode swap', () => {
    const provider = new RandomSymbolProvider({
      a: { weight: 10 },
      b: { weight: 10 },
      c: { weight: 10 },
    });
    provider.setExcludeSpinning(['b', 'c']);
    expect(provider.next()).toBe('a');

    // Swap to a mode that drops 'c'; stale exclusions referencing it are cleared.
    provider.updateWeights({ a: { weight: 10 }, b: { weight: 10 } });
    provider.setExcludeSpinning(['a']);
    for (let i = 0; i < 20; i++) expect(provider.next()).toBe('b');
  });
});
