import { describe, it, expect } from 'vitest';
import { coordinateBigSymbols } from '../../src/spin/bigSymbolBlocks.js';

const OCC = '__pixi_reels_occupied__';
const symbolsData = { big: { weight: 0, size: { reels: 2, cells: 2 } }, tall: { weight: 0, size: { reels: 1, cells: 3 } } };
const opts = (mode?: 'land' | 'rest') => ({ visibleCellsForReel: () => 3, symbolsData, bufferStart: 1, bufferEnd: 1, mode });

describe('coordinateBigSymbols', () => {
  it('paints the stubs of a block and leaves the input alone', () => {
    const grid = [{ visible: ['big', 'a', 'b'] }, { visible: ['c', 'a', 'b'] }];
    const out = coordinateBigSymbols(grid, opts());
    expect(out[0].visible).toEqual(['big', OCC, 'b']);
    expect(out[1].visible).toEqual([OCC, OCC, 'b']);
    expect(grid[0].visible).toEqual(['big', 'a', 'b']);
  });

  it('reads a repeated anchor id inside a block as one block, the way getTargets() replays it', () => {
    const out = coordinateBigSymbols([{ visible: ['big', 'big', 'a'] }, { visible: ['big', 'big', 'b'] }], opts());
    expect(out[0].visible).toEqual(['big', OCC, 'a']);
    expect(out[1].visible).toEqual([OCC, OCC, 'b']);
  });

  it("throws on a block that does not fit when landing, and 'rest' cuts or refills it instead", () => {
    const pastReels = [{ visible: ['a', 'b', 'c'] }, { visible: ['big', 'a', 'b'] }];
    expect(() => coordinateBigSymbols(pastReels, opts())).toThrow(/exceeds reel count 2/);
    expect(coordinateBigSymbols(pastReels, opts('rest'))[1].visible).toEqual(['big', OCC, 'b']);

    const pastBottom = [{ visible: ['a', 'b', 'tall'] }];
    expect(() => coordinateBigSymbols(pastBottom, opts())).toThrow(/extends past the bottom/);
    expect(coordinateBigSymbols(pastBottom, opts('rest'))[0].visible[2]).toBeUndefined();
  });
});
