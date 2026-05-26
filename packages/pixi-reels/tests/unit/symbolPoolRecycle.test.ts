import type { Filter } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SymbolRegistry } from '../../src/index.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { SymbolFactory } from '../../src/symbols/SymbolFactory.js';

// Stub. real filters need document/WebGL.
const stubFilter = {} as Filter;

describe('ReelSymbol pool recycle. view state reset', () => {
  it('clears alpha, scale, rotation, filters, zIndex on deactivate', () => {
    const symbol = new HeadlessSymbol();
    symbol.activate('a');

    symbol.view.alpha = 0.35;
    symbol.view.scale.set(1.4, 0.8);
    symbol.view.rotation = 0.5;
    symbol.view.filters = [stubFilter];
    symbol.view.zIndex = 7;

    symbol.deactivate();

    expect(symbol.view.alpha).toBe(1);
    expect(symbol.view.scale.x).toBe(1);
    expect(symbol.view.scale.y).toBe(1);
    expect(symbol.view.rotation).toBe(0);
    expect(symbol.view.filters).toBeNull();
    expect(symbol.view.zIndex).toBe(0);
  });

  it('clears alpha, scale, rotation, filters, zIndex on activate', () => {
    const symbol = new HeadlessSymbol();

    symbol.view.alpha = 0.5;
    symbol.view.scale.set(2, 0.5);
    symbol.view.rotation = 1.2;
    symbol.view.filters = [stubFilter];
    symbol.view.zIndex = 9;

    symbol.activate('a');

    expect(symbol.view.alpha).toBe(1);
    expect(symbol.view.scale.x).toBe(1);
    expect(symbol.view.scale.y).toBe(1);
    expect(symbol.view.rotation).toBe(0);
    expect(symbol.view.filters).toBeNull();
    expect(symbol.view.zIndex).toBe(0);
  });

  it('does not leak filter / transform state across acquire/release cycles', () => {
    const registry = new SymbolRegistry();
    registry.register('a', HeadlessSymbol, {});
    const factory = new SymbolFactory(registry);

    const first = factory.acquire('a');
    first.view.filters = [stubFilter];
    first.view.alpha = 0.2;
    first.view.scale.set(2, 2);
    factory.release(first);

    const second = factory.acquire('a');
    expect(second).toBe(first);
    expect(second.view.filters).toBeNull();
    expect(second.view.alpha).toBe(1);
    expect(second.view.scale.x).toBe(1);
    expect(second.view.scale.y).toBe(1);
  });
});
