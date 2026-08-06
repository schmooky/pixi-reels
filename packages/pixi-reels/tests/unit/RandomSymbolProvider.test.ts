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
    // Should be roughly 90% +/- 5%
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
    // cumulative weights [10,20,30]; rand = u*30 -> 0->a, 15->b, 29.7->c
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

  it('never draws a symbol whose weight is 0', () => {
    const provider = new RandomSymbolProvider({
      a: { weight: 10 },
      empty: { weight: 0 },
      b: { weight: 10 },
    });
    for (let i = 0; i < 500; i++) {
      expect(provider.next()).not.toBe('empty');
      expect(provider.next(true)).not.toBe('empty');
    }
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

describe('RandomSymbolProvider symbol pools', () => {
  const make = () =>
    new RandomSymbolProvider({
      a: { weight: 10 },
      b: { weight: 10 },
      coin: { weight: 10 },
    });

  const draw = (
    provider: RandomSymbolProvider,
    isBuffer: boolean,
    reel?: number,
  ): Set<string> => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(provider.next(isBuffer, reel));
    return seen;
  };

  it('a global pool excludes on every reel and in every slot', () => {
    const provider = make();
    provider.set({ exclude: ['coin'] });
    expect(draw(provider, false, 0).has('coin')).toBe(false);
    expect(draw(provider, false, 3).has('coin')).toBe(false);
    expect(draw(provider, true, 3).has('coin')).toBe(false);
  });

  it('a per-reel pool leaves the other reels alone', () => {
    const provider = make();
    provider.set({ exclude: ['coin'] }, { reel: 1 });
    expect(draw(provider, false, 1).has('coin')).toBe(false);
    expect(draw(provider, false, 0).has('coin')).toBe(true);
    expect(draw(provider, false, undefined).has('coin')).toBe(true);
  });

  it('a buffer pool narrows the buffer cells but not the spinning strip', () => {
    const provider = make();
    provider.set({ exclude: ['coin'] }, { slots: 'buffer' });
    expect(draw(provider, true, 0).has('coin')).toBe(false);
    expect(draw(provider, false, 0).has('coin')).toBe(true);
  });

  it('weight 0 in a pool is as final as an exclusion', () => {
    const provider = make();
    provider.set({ weights: { coin: 0 } }, { reel: 2 });
    expect(draw(provider, false, 2).has('coin')).toBe(false);
    expect(provider.weights({ reel: 2 }).coin).toBe(0);
  });

  it('per-reel weights bias that reel only', () => {
    const provider = make();
    provider.set({ weights: { coin: 980 } }, { reel: 0 });

    let hotCoins = 0;
    let coldCoins = 0;
    for (let i = 0; i < 2000; i++) {
      if (provider.next(false, 0) === 'coin') hotCoins++;
      if (provider.next(false, 1) === 'coin') coldCoins++;
    }
    expect(hotCoins).toBeGreaterThan(1800);
    expect(coldCoins).toBeLessThan(900);
  });

  it('buffer pools stack on top of the spinning pools, they do not replace them', () => {
    const provider = make();
    provider.set({ exclude: ['a'] });
    provider.set({ exclude: ['b'] }, { slots: 'buffer' });
    // Spinning: 'a' banned. Buffer: 'a' AND 'b' banned.
    expect(draw(provider, false, 0)).toEqual(new Set(['b', 'coin']));
    expect(draw(provider, true, 0)).toEqual(new Set(['coin']));
  });

  it('a narrower pool cannot re-admit what a wider one excluded', () => {
    const provider = make();
    provider.set({ exclude: ['coin'] });
    provider.set({ weights: { coin: 500 } }, { reel: 0 });
    expect(draw(provider, false, 0).has('coin')).toBe(false);
  });

  it('set(null) drops one layer and clear() drops them all', () => {
    const provider = make();
    provider.set({ exclude: ['coin'] }, { reel: 0 });
    provider.set({ exclude: ['a'] }, { slots: 'buffer' });

    provider.set(null, { reel: 0 });
    expect(draw(provider, false, 0).has('coin')).toBe(true);
    expect(draw(provider, true, 0).has('a')).toBe(false);

    provider.clear();
    expect(draw(provider, true, 0).has('a')).toBe(true);
  });

  it('reports the effective weights it will draw from', () => {
    const provider = make();
    provider.set({ weights: { a: 1 } });
    provider.set({ exclude: ['b'] }, { slots: 'buffer' });

    expect(provider.weights()).toEqual({ a: 1, b: 10, coin: 10 });
    expect(provider.weights({ slots: 'buffer' })).toEqual({ a: 1, b: 0, coin: 10 });
  });

  it('throws on an unregistered symbol id instead of silently doing nothing', () => {
    const provider = make();
    expect(() => provider.set({ exclude: ['coinn'] })).toThrow(/not registered/);
    expect(() => provider.set({ weights: { nope: 5 } }, { reel: 1 })).toThrow(/not registered/);
  });

  it('throws when a pool leaves a scope with nothing to draw, and keeps the old pool', () => {
    const provider = make();
    provider.set({ exclude: ['coin'] });
    expect(() => provider.set({ exclude: ['a', 'b', 'coin'] }, { reel: 1 })).toThrow(
      /No symbol left to draw for spinning cells on reel 1/,
    );
    // The rejected pool must not have been installed.
    expect(draw(provider, false, 1)).toEqual(new Set(['a', 'b']));
  });

  it('throws when the buffer pool empties the buffer, naming the buffer scope', () => {
    const provider = make();
    expect(() => provider.set({ exclude: ['a', 'b', 'coin'] }, { slots: 'buffer' })).toThrow(
      /No symbol left to draw for buffer cells on every reel/,
    );
  });

  it('drops pool entries for symbols a game-mode swap removed', () => {
    const provider = make();
    provider.set({ exclude: ['coin'] }, { reel: 0 });
    provider.updateWeights({ a: { weight: 10 }, b: { weight: 10 } });
    expect(provider.weights({ reel: 0 })).toEqual({ a: 10, b: 10 });
  });

  it('legacy setExcludeBuffer keeps the global buffer weights it was given', () => {
    const provider = make();
    provider.set({ weights: { a: 50 } }, { slots: 'buffer' });
    provider.setExcludeBuffer(['coin']);
    expect(provider.weights({ slots: 'buffer' })).toEqual({ a: 50, b: 10, coin: 0 });
  });
});
