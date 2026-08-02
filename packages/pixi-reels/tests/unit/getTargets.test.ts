import { describe, expect, it } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';

/**
 * `getTargets()` exists because `getVisibleGrid()` cannot be handed back.
 *
 * A 1x3 block anchored at cell -2 (in `bufferStart`) shows only its tail at
 * visible cell 0. `getVisibleGrid()` reports `['tall','a','a']`, and replaying
 * that re-anchors the block at cell 0, where it expands to `['tall','tall',
 * 'tall']` -- a different board that raises no error.
 */
describe('getTargets round-trip', () => {
  const build = () =>
    createTestReelSet({
      reels: 2, visibleCells: 3, symbolIds: ['a', 'tall'],
      symbolData: { tall: { size: { reels: 1, cells: 3 }, weight: 0 } },
      bufferSymbols: 2,
    });

  const land = async (h: ReturnType<typeof build>) =>
    h.spinAndLand([
      { visible: ['a', 'a', 'a'], bufferStart: [undefined as unknown as string, 'tall'] },
      { visible: ['a', 'a', 'a'] },
    ]);

  it('replaying getTargets() keeps a buffer-anchored block where it was', async () => {
    const h = build();
    try {
      await land(h);
      const before = h.reelSet.getSymbolFootprint(0, 0);
      expect(before.anchor.cell, 'anchor starts outside the window').toBe(-2);

      await h.spinAndLand(h.reelSet.getTargets());

      const after = h.reelSet.getSymbolFootprint(0, 0);
      expect(after.anchor).toEqual(before.anchor);
      expect(after.size).toEqual(before.size);
      expect(h.reelSet.getVisibleGrid()).toEqual([['tall', 'a', 'a'], ['a', 'a', 'a']]);
    } finally {
      h.destroy();
    }
  });

  it('getVisibleGrid() cannot: replaying it relocates the block', async () => {
    const h = build();
    try {
      await land(h);
      await h.spinAndLand(h.reelSet.getVisibleGrid().map((visible) => ({ visible })));
      // Documents the lossiness that motivates getTargets(). If this ever
      // starts matching the original, getTargets() may be redundant.
      expect(h.reelSet.getSymbolFootprint(0, 0).anchor.cell).toBe(0);
      expect(h.reelSet.getVisibleGrid()[0]).toEqual(['tall', 'tall', 'tall']);
    } finally {
      h.destroy();
    }
  });

  it('never leaks the OCCUPIED sentinel', async () => {
    const h = build();
    try {
      await land(h);
      const flat = h.reelSet.getTargets().flatMap((t) => [
        ...t.visible, ...(t.bufferStart ?? []), ...(t.bufferEnd ?? []),
      ]);
      expect(flat.some((id) => id.includes('occupied'))).toBe(false);
    } finally {
      h.destroy();
    }
  });
});
