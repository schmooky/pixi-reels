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
});
