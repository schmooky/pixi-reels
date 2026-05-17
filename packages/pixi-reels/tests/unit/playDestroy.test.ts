import { describe, expect, it, vi } from 'vitest';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

class TestSymbol extends HeadlessSymbol {}

describe('ReelSymbol.playDestroy', () => {
  it('resolves and leaves the view at alpha 0', async () => {
    const sym = new TestSymbol('a');
    expect(sym.view.alpha).toBe(1);
    await sym.playDestroy();
    expect(sym.view.alpha).toBe(0);
    sym.destroy();
  });

  it('restores pivot, position, rotation and scale (alpha stays 0)', async () => {
    const sym = new TestSymbol('a');
    sym.view.x = 50;
    sym.view.y = 60;
    sym.view.pivot.set(7, 8);
    await sym.playDestroy();
    expect(sym.view.x).toBe(50);
    expect(sym.view.y).toBe(60);
    expect(sym.view.pivot.x).toBe(7);
    expect(sym.view.pivot.y).toBe(8);
    expect(sym.view.rotation).toBe(0);
    expect(sym.view.scale.x).toBe(1);
    expect(sym.view.scale.y).toBe(1);
    expect(sym.view.alpha).toBe(0);
    sym.destroy();
  });

  it('accepts a direction option (Math.random not consulted)', async () => {
    const sym = new TestSymbol('a');
    const rand = vi.spyOn(Math, 'random');
    await sym.playDestroy({ direction: 1 });
    expect(rand).not.toHaveBeenCalled();
    rand.mockRestore();
    sym.destroy();
  });
});
