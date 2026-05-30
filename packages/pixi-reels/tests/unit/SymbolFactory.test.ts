/**
 * M2 — the symbol recycle pool is sized to the grid so large / MultiWays grids
 * don't churn through destroy()+recreate. SymbolFactory honors the per-key
 * capacity it is handed (which the builder derives from the strip size).
 */
import { describe, it, expect } from 'vitest';
import { SymbolFactory } from '../../src/symbols/SymbolFactory.js';
import { SymbolRegistry } from '../../src/symbols/SymbolRegistry.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

function registry(): SymbolRegistry {
  const r = new SymbolRegistry();
  r.register('a', HeadlessSymbol, {});
  return r;
}

describe('SymbolFactory pool capacity', () => {
  it('defaults the per-key capacity to 20', () => {
    expect(new SymbolFactory(registry()).capacityPerKey).toBe(20);
  });

  it('honors an explicit per-key capacity', () => {
    expect(new SymbolFactory(registry(), 66).capacityPerKey).toBe(66);
  });

  it('pools up to capacity and destroys the overflow', () => {
    const factory = new SymbolFactory(registry(), 2);
    const a = factory.acquire('a');
    const b = factory.acquire('a');
    const c = factory.acquire('a');
    factory.release(a);
    factory.release(b);
    factory.release(c); // exceeds capacity 2 → destroyed
    expect(c.isDestroyed).toBe(true);
    expect(a.isDestroyed).toBe(false);
    expect(b.isDestroyed).toBe(false);
  });

  it('recycles released instances instead of recreating', () => {
    const factory = new SymbolFactory(registry(), 8);
    const a = factory.acquire('a');
    factory.release(a);
    expect(factory.acquire('a')).toBe(a);
  });
});
