import { describe, it, expect, vi } from 'vitest';
import {
  runCascade,
  diffCells,
  tumbleToGrid,
  type Cell,
} from '../../../../examples/shared/cascadeLoop.js';
import {
  CheatEngine,
  cascadingStages,
} from '../../../../examples/shared/cheats.js';
import { createTestReelSet } from '../../src/testing/index.js';

// Instant animator — collapses any tween to its final frame for sync tests.
const instant = async (_d: number, onFrame: (t: number) => void): Promise<void> => {
  onFrame(1);
};

describe('diffCells', () => {
  it('identifies changed cells', () => {
    const a = [['x','y'],['y','x']];
    const b = [['z','y'],['y','z']];
    expect(diffCells(a, b)).toEqual<Cell[]>([
      { reel: 0, row: 0 }, { reel: 1, row: 1 },
    ]);
  });

  it('returns empty when grids are identical', () => {
    const a = [['x'], ['y']];
    expect(diffCells(a, a)).toEqual([]);
  });

  it('handles mismatched column lengths gracefully', () => {
    const a = [['x']];
    const b = [['x', 'y']];
    expect(diffCells(a, b)).toEqual([{ reel: 0, row: 1 }]);
  });
});

describe('tumbleToGrid', () => {
  it('drops new symbols in and leaves the next grid visible', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b', 'c'] });
    try {
      const stage0 = [
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
        ['a', 'a', 'a'],
      ];
      await h.spinAndLand(stage0);
      const stage1 = [
        ['b', 'a', 'a'],   // reel 0 row 0 changed
        ['a', 'a', 'a'],
        ['b', 'a', 'a'],   // reel 2 row 0 changed
      ];
      const winners = diffCells(stage0, stage1);
      await tumbleToGrid(h.reelSet, stage1, winners, { animate: instant });

      const out = h.reelSet.reels.map((r) => r.getVisibleSymbols());
      expect(out).toEqual(stage1);
    } finally {
      h.destroy();
    }
  });

  it('is a no-op on columns with no winners', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a', 'b'] });
    try {
      const stage0 = [['a', 'a'], ['a', 'a']];
      await h.spinAndLand(stage0);
      const stage1 = [['b', 'a'], ['a', 'a']];     // only reel 0 changes
      const ySnapsBefore = h.reelSet.reels.map((r) => r.getSymbolAt(0).view.y);

      await tumbleToGrid(h.reelSet, stage1, diffCells(stage0, stage1), { animate: instant });

      const ySnapsAfter = h.reelSet.reels.map((r) => r.getSymbolAt(0).view.y);
      expect(ySnapsAfter).toEqual(ySnapsBefore);
      expect(h.reelSet.reels.map((r) => r.getVisibleSymbols())).toEqual(stage1);
    } finally {
      h.destroy();
    }
  });

  // ── real cascade physics ──────────────────────────────────────────────

  /**
   * Returns the rows whose view.y is ABOVE (less than) their natural grid
   * position — i.e. were offset by tumbleToGrid for animation. Rows that
   * should NOT move won't appear in this list.
   */
  async function snapshotMovedRows(reelSet: import('pixi-reels').ReelSet, reelIndex: number, visible: number): Promise<number[]> {
    const reel = reelSet.getReel(reelIndex);
    // Read the slot height from a cell that wasn't touched by tumbleToGrid.
    // placeSymbols snaps every cell to grid first, so row 0's y is the "top
    // grid y" and slot height = (getSymbolAt(1).y - getSymbolAt(0).y) WHEN
    // neither has been offset. Safest: compute from a known-untouched row
    // if possible. In these tests visible >= 2 and at least one row is
    // untouched, so we use the largest row's y (survivors at the bottom
    // rarely move) as a reference for slotHeight × (row).
    // Simplest: compute slotHeight from the reel's known dimension, passed in.
    const moved: number[] = [];
    // We rely on the grid-snapping behavior: after tumbleToGrid begins, each
    // cell's y is either its target (unmodified) or below zero (offset up).
    // For a 100px symbol height (our default), target y = row * 100.
    for (let row = 0; row < visible; row++) {
      const y = reel.getSymbolAt(row).view.y;
      if (y < row * 100 - 0.5) moved.push(row);
    }
    return moved;
  }

  it('survivors at the bottom do NOT move when the winner is above them', async () => {
    const h = createTestReelSet({ reels: 1, visibleRows: 3, symbolIds: ['a', 'b', 'c', 'x'] });
    try {
      await h.spinAndLand([['a', 'b', 'c']]);
      const semanticWinners = [{ reel: 0, row: 0 }];
      const stage1 = [['x', 'b', 'c']];

      let movedRows: number[] = [];
      await tumbleToGrid(h.reelSet, stage1, semanticWinners, {
        animate: async (_d, onFrame) => {
          movedRows = await snapshotMovedRows(h.reelSet, 0, 3);
          onFrame(1);
        },
      });

      // Only the new symbol at row 0 should have been offset.
      expect(movedRows.sort()).toEqual([0]);
      expect(h.reelSet.reels[0].getVisibleSymbols()).toEqual(['x', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });

  it('winner in the middle: survivors above fall 1; survivors below do NOT move', async () => {
    const h = createTestReelSet({ reels: 1, visibleRows: 5, symbolIds: ['a', 'b', 'c', 'd', 'e', 'x'] });
    try {
      await h.spinAndLand([['a', 'b', 'c', 'd', 'e']]);
      const semanticWinners = [{ reel: 0, row: 2 }];
      const stage1 = [['x', 'a', 'b', 'd', 'e']];

      let movedRows: number[] = [];
      await tumbleToGrid(h.reelSet, stage1, semanticWinners, {
        animate: async (_d, onFrame) => {
          movedRows = await snapshotMovedRows(h.reelSet, 0, 5);
          onFrame(1);
        },
      });

      // 0 = new symbol; 1, 2 = survivors that fell 1 slot.
      // 3, 4 = survivors that did NOT move.
      expect(movedRows.sort((a, b) => a - b)).toEqual([0, 1, 2]);
      expect(h.reelSet.reels[0].getVisibleSymbols()).toEqual(['x', 'a', 'b', 'd', 'e']);
    } finally {
      h.destroy();
    }
  });

  it('multiple winners stacked at the top: only new symbols move', async () => {
    const h = createTestReelSet({ reels: 1, visibleRows: 5, symbolIds: ['a', 'b', 'c', 'd', 'e', 'x'] });
    try {
      await h.spinAndLand([['a', 'b', 'c', 'd', 'e']]);
      const semanticWinners = [
        { reel: 0, row: 0 },
        { reel: 0, row: 1 },
      ];
      const stage1 = [['x', 'x', 'c', 'd', 'e']];

      let movedRows: number[] = [];
      await tumbleToGrid(h.reelSet, stage1, semanticWinners, {
        animate: async (_d, onFrame) => {
          movedRows = await snapshotMovedRows(h.reelSet, 0, 5);
          onFrame(1);
        },
      });

      // Only the 2 new symbols fall in. Survivors c, d, e stay put.
      expect(movedRows.sort((a, b) => a - b)).toEqual([0, 1]);
      expect(h.reelSet.reels[0].getVisibleSymbols()).toEqual(['x', 'x', 'c', 'd', 'e']);
    } finally {
      h.destroy();
    }
  });

  it('winner at the bottom: every survivor falls exactly 1 slot', async () => {
    const h = createTestReelSet({ reels: 1, visibleRows: 4, symbolIds: ['a', 'b', 'c', 'd', 'x'] });
    try {
      await h.spinAndLand([['a', 'b', 'c', 'd']]);
      const semanticWinners = [{ reel: 0, row: 3 }];
      const stage1 = [['x', 'a', 'b', 'c']];

      let movedRows: number[] = [];
      await tumbleToGrid(h.reelSet, stage1, semanticWinners, {
        animate: async (_d, onFrame) => {
          movedRows = await snapshotMovedRows(h.reelSet, 0, 4);
          onFrame(1);
        },
      });

      expect(movedRows.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
      expect(h.reelSet.reels[0].getVisibleSymbols()).toEqual(['x', 'a', 'b', 'c']);
    } finally {
      h.destroy();
    }
  });
});

describe('runCascade', () => {
  it('fires onWinnersVanish with the correct cells per stage', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a', 'b', 'c', 'd'] });
    try {
      const stages: string[][][] = [
        [['a', 'b'], ['a', 'b']],
        [['a', 'c'], ['a', 'c']],       // row 1 changes in both reels
        [['d', 'c'], ['a', 'c']],       // reel 0 row 0 changes
      ];
      await h.spinAndLand(stages[0]);

      const calls: Array<{ stageIndex: number; winners: Cell[] }> = [];
      const result = await runCascade(h.reelSet, stages, {
        vanishDuration: 0,
        pauseBetween: 0,
        dropDuration: 0,
        animate: instant,
        onWinnersVanish: async (_rs, winners, stageIndex) => {
          calls.push({ stageIndex, winners: winners.slice() });
        },
      });

      expect(result.stageCount).toBe(3);
      expect(result.totalWinners).toBe(3);
      expect(calls).toEqual([
        { stageIndex: 1, winners: [{ reel: 0, row: 1 }, { reel: 1, row: 1 }] },
        { stageIndex: 2, winners: [{ reel: 0, row: 0 }] },
      ]);
      expect(h.reelSet.reels.map((r) => r.getVisibleSymbols())).toEqual(stages[2]);
    } finally {
      h.destroy();
    }
  });

  it('accepts an async generator stream (server-streamed stages)', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a', 'b', 'c'] });
    try {
      const stages: string[][][] = [
        [['a', 'a'], ['a', 'a']],
        [['b', 'a'], ['a', 'a']],
        [['c', 'a'], ['a', 'a']],
      ];
      async function* stream() { for (const g of stages) yield g; }

      await h.spinAndLand(stages[0]);

      const landedAt: number[] = [];
      await runCascade(h.reelSet, stream(), {
        vanishDuration: 0, pauseBetween: 0, dropDuration: 0,
        animate: instant,
        onWinnersVanish: async () => {},
        onStageLanded: (_g, i) => { landedAt.push(i); },
      });

      expect(landedAt).toEqual([0, 1, 2]);
      expect(h.reelSet.reels.map((r) => r.getVisibleSymbols())).toEqual(stages[2]);
    } finally {
      h.destroy();
    }
  });

  it('uses the custom `winners` callback instead of diffCells', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 3, symbolIds: ['a', 'b', 'x'] });
    try {
      const stages: string[][][] = [
        [['a', 'b', 'x'], ['b', 'a', 'x']],   // 'x' winners at bottom
        [['x', 'a', 'b'], ['x', 'b', 'a']],   // survivors slid down, new 'x' at top
      ];
      await h.spinAndLand(stages[0]);

      const semanticWinners = (prev: string[][]) => {
        const out: Array<{ reel: number; row: number }> = [];
        for (let r = 0; r < prev.length; r++) {
          for (let row = 0; row < prev[r].length; row++) {
            if (prev[r][row] === 'x') out.push({ reel: r, row });
          }
        }
        return out;
      };

      const vanishedCells: Array<{ reel: number; row: number }> = [];
      await runCascade(h.reelSet, stages, {
        vanishDuration: 0, pauseBetween: 0, dropDuration: 0,
        animate: instant,
        winners: semanticWinners,
        onWinnersVanish: async (_rs, cells) => { vanishedCells.push(...cells); },
      });

      // Only the two 'x' cells were the semantic winners; diffCells would have
      // reported all 6 cells as changed.
      expect(vanishedCells).toEqual([
        { reel: 0, row: 2 },
        { reel: 1, row: 2 },
      ]);
      expect(h.reelSet.reels.map((r) => r.getVisibleSymbols())).toEqual(stages[1]);
    } finally {
      h.destroy();
    }
  });

  it('never calls reelSet.spin() between stages — pure tumble', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a', 'b'] });
    try {
      const stages: string[][][] = [
        [['a', 'a'], ['a', 'a']],
        [['b', 'a'], ['a', 'a']],
      ];
      await h.spinAndLand(stages[0]);
      const spy = vi.spyOn(h.reelSet, 'spin');
      await runCascade(h.reelSet, stages, {
        vanishDuration: 0, pauseBetween: 0, dropDuration: 0,
        animate: instant,
        onWinnersVanish: async () => {},
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      h.destroy();
    }
  });
});

describe('cascadingStages cheat', () => {
  it('returns stage 0 as symbols and the full array in meta', () => {
    const stages: string[][][] = [
      [['a', 'a'], ['a', 'a']],
      [['b', 'b'], ['b', 'b']],
      [['c', 'c'], ['c', 'c']],
    ];
    const engine = new CheatEngine({
      reelCount: 2, visibleRows: 2, symbolIds: ['a', 'b', 'c'], seed: 1,
    });
    engine.register({ id: 'cs', label: 'cs', enabled: true, cheat: cascadingStages(stages) });

    const r = engine.next();
    expect(r.symbols).toEqual(stages[0]);
    expect(r.meta?.stages).toEqual(stages);
    expect(r.meta?.stageCount).toBe(3);
  });

  it('clones deeply so mutations do not leak', () => {
    const stages: string[][][] = [[['a']], [['b']]];
    const engine = new CheatEngine({
      reelCount: 1, visibleRows: 1, symbolIds: ['a', 'b'], seed: 1,
    });
    engine.register({ id: 'cs', label: 'cs', enabled: true, cheat: cascadingStages(stages) });

    const r1 = engine.next();
    (r1.symbols[0][0] as string) = 'MUTATED';
    (r1.meta!.stages as string[][][])[0][0][0] = 'MUTATED';

    const r2 = engine.next();
    expect(r2.symbols[0][0]).toBe('a');
    expect((r2.meta!.stages as string[][][])[0][0][0]).toBe('a');
  });
});
