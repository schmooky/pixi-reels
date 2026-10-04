/**
 * One reel growing at rest: `setColumn()`, `splitBlock()` (a stacked symbol
 * that splits into more cells when it wins, as in "expanding stacked
 * symbols") and `resetColumns()`, alone and between `expand()` steps.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';
import { onNotice, resetNoticesForTest } from '../../src/utils/notify.js';
import type { TestReelSetOptions } from '../../src/testing/testHarness.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 20,
  anticipationDelay: 120,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

const OCC = '__pixi_reels_occupied__';
const IDS = ['q', 'k', 'w', 'wild', 'q2', 'q3', 'q4', 'big'];
const DATA = {
  q2: { weight: 0, size: { reels: 1, cells: 2 } },
  q3: { weight: 0, size: { reels: 1, cells: 3 } },
  q4: { weight: 0, size: { reels: 1, cells: 4 } },
  big: { weight: 0, size: { reels: 2, cells: 2 } },
};

const harnesses: Array<{ destroy(): void; stopPump(): void }> = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.stopPump();
    h.destroy();
  }
});

function make(opts: TestReelSetOptions = {}) {
  const h = createTestReelSet({ reels: 3, visibleCells: 4, symbolIds: IDS, symbolData: DATA, ...opts });
  h.reelSet.speed.addProfile(FAST.name, FAST);
  h.reelSet.setSpeed(FAST.name);
  const pump = setInterval(() => h.ticker.tick(16), 8);
  const handle = { ...h, stopPump: () => clearInterval(pump) };
  harnesses.push(handle);
  return handle;
}

const col = (...visible: string[]): ColumnTarget => ({ visible });
// The video's board: a 1x3 Q on reel 0, two Qs on reel 1, a 1x2 Q on reel 2.
const BUFFALO = [col('q3', 'q3', 'q3', 'w'), col('w', 'q', 'q', 'w'), col('w', 'q2', 'q2', 'w')];
const land = (h: ReturnType<typeof make>, grid: ColumnTarget[]) => {
  const spin = h.reelSet.spin();
  h.reelSet.setResult(grid);
  return spin;
};
const window = (h: ReturnType<typeof make>, r: number) => {
  const reel = h.reelSet.reels[r];
  return reel.symbols.slice(reel.bufferStart, reel.bufferStart + reel.visibleCells).map((s) => s.symbolId);
};

describe('setColumn()', () => {
  it('grows one reel at its cell size, re-centres the board, and leaves the other reels as they were', async () => {
    const h = make({ symbolGap: { x: 10, y: 4 } });
    await land(h, BUFFALO);
    const others = [1, 2].map((r) => h.reelSet.reels[r].symbols.slice());
    const log = captureEvents(h.reelSet, ['column:set']);

    h.reelSet.setColumn(0, col('q', 'q', 'q', 'q', 'q', 'q', 'w'));

    const [r0, r1] = h.reelSet.reels;
    expect(r0.visibleCells).toBe(7);
    expect(r0.cellMain).toBe(100);
    expect(r0.extent).toBe(7 * 100 + 6 * 4);
    // The tallest reel sizes the board; the others centre in it.
    expect(h.reelSet.viewport.maskHeight).toBe(r0.extent);
    expect(r1.mainOffset).toBeCloseTo((r0.extent - r1.extent) / 2, 9);
    expect(h.reelSet.viewport.maskRects[1].y).toBeCloseTo(r1.mainOffset, 9);
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q', 'q', 'q', 'q', 'q', 'q', 'w']);
    // Reels 1 and 2 were not re-placed: the same symbol instances.
    [1, 2].forEach((r, i) => expect(h.reelSet.reels[r].symbols).toEqual(others[i]));
    expect(log).toEqual([{ event: 'column:set', args: [{ reelIndex: 0, fromCells: 4, toCells: 7 }] }]);
  });

  it('shrinks a reel, expires pins past its new length, and refuses a big symbol that does not fit', async () => {
    const h = make();
    await land(h, BUFFALO);
    h.reelSet.pin(1, 3, 'wild');
    h.reelSet.setColumn(1, col('k', 'q'));
    expect(h.reelSet.reels[1].visibleCells).toBe(2);
    expect(h.reelSet.getPin(1, 3)).toBeUndefined();

    expect(() => h.reelSet.setColumn(2, col('w', 'w', 'q3'))).toThrow(/'q3' \(1x3\) .* extends past the bottom/);
    expect(h.reelSet.reels[2].visibleCells).toBe(4);
    expect(() => h.reelSet.setColumn(5, col('q'))).toThrow(/reel 5 out of range/);
    expect(() => h.reelSet.setColumn(0, col('nope'))).toThrow(/'nope' is not registered/);
  });

  it('a spin on the reshaped board lands columns of its new heights', async () => {
    const h = make();
    h.reelSet.setColumn(0, col('q', 'q', 'q', 'q', 'q', 'q'));
    const grid = [col('k', 'k', 'k', 'k', 'k', 'k'), col('q', 'q', 'q', 'q'), col('w', 'w', 'w', 'w')];
    const result = await land(h, grid);
    expect(result.symbols.map((c) => c.length)).toEqual([6, 4, 4]);
    expect(result.symbols[0]).toEqual(['k', 'k', 'k', 'k', 'k', 'k']);
  });
});

describe('splitBlock()', () => {
  it('splits a 1x3 into six cells of its own, the reel growing by three', async () => {
    const h = make();
    await land(h, BUFFALO);
    h.reelSet.pin(0, 3, 'wild');
    const moves = captureEvents(h.reelSet, ['pin:moved']);

    const res = h.reelSet.splitBlock(0, 1, ['q', 'q', 'q', 'q', 'q', 'q']);

    expect(res).toEqual({ reelIndex: 0, from: 0, count: 6 });
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q', 'q', 'q', 'q', 'q', 'q', 'wild']);
    expect(window(h, 0)).not.toContain(OCC);
    // The pin below the block rode down with its symbol.
    expect(h.reelSet.getPin(0, 3)).toBeUndefined();
    expect(h.reelSet.getPin(0, 6)?.symbolId).toBe('wild');
    expect(moves).toHaveLength(1);
    expect(moves[0].args[1]).toEqual({ reel: 0, cell: 3 });

    // Then the 1x2 on reel 2 into four: 6 x 2 x 4 cells of q now.
    h.reelSet.splitBlock(2, 2, ['q', 'q', 'q', 'q']);
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([7, 4, 6]);
    expect(h.reelSet.getVisibleGrid()[2]).toEqual(['w', 'q', 'q', 'q', 'q', 'w']);
  });

  it('keeps other blocks on the reel whole, and may place a new block that fits', async () => {
    const h = make();
    await land(h, [col('q2', 'q2', 'q2', 'q2'), col('w', 'w', 'w', 'w'), col('w', 'w', 'w', 'w')]);
    // Two 1x2s on reel 0: split the lower one.
    h.reelSet.splitBlock(0, 3, ['q', 'q2', 'q2']);
    expect(window(h, 0)).toEqual(['q2', OCC, 'q', 'q2', OCC]);
  });

  it('refuses what is not a stacked symbol in full view', async () => {
    const h = make();
    await land(h, [col('big', 'big', 'w', 'w'), col('big', 'big', 'w', 'w'), col('q', 'q', 'w', 'w')]);
    expect(() => h.reelSet.splitBlock(2, 0, ['q', 'q'])).toThrow(/holds no stacked symbol/);
    expect(() => h.reelSet.splitBlock(0, 0, ['q', 'q', 'q'])).toThrow(/holds no stacked symbol/);
    await land(h, [col('w', 'w', 'w', 'w'), col('w', 'w', 'w', 'w'), col('w', 'w', 'w', 'q2')]);
    // The 1x2 anchored on the last cell runs into the buffer below.
    expect(() => h.reelSet.splitBlock(2, 3, ['q', 'q', 'q'])).toThrow(/runs past the reel's window/);

    const spin = h.reelSet.spin();
    expect(() => h.reelSet.splitBlock(0, 0, ['q'])).toThrow(/while the reels spin/);
    h.reelSet.setResult(BUFFALO);
    await spin;
  });

  it('is not for MultiWays, where a reel cell count is its shape', () => {
    // Big symbols are not allowed on MultiWays, so this set registers none.
    const h = make({ multiways: { minCells: 2, maxCells: 7, reelExtent: 700 }, symbolData: {}, symbolIds: ['q', 'k'] });
    expect(() => h.reelSet.setColumn(0, col('q', 'q'))).toThrow(/MultiWays set's rows are its reels' shapes/);
  });
});

describe('resetColumns()', () => {
  it('takes every reel back to the cells it was built with, and is a no-op otherwise', async () => {
    const h = make();
    await land(h, BUFFALO);
    const log = captureEvents(h.reelSet, ['column:set']);
    h.reelSet.resetColumns();
    expect(log).toEqual([]);

    h.reelSet.splitBlock(0, 0, ['q', 'q', 'q', 'q', 'q']);
    h.reelSet.addRows(1);
    h.reelSet.resetColumns();
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([4, 4, 4]);
    expect(h.reelSet.viewport.maskHeight).toBe(h.reelSet.reels[1].extent);
    // addRows() is undone too, so removeRows() has nothing left to take.
    const removed = captureEvents(h.reelSet, ['rows:removed']);
    h.reelSet.removeRows();
    expect(removed).toEqual([]);
  });
});

describe('splits inside an expand() chain', () => {
  it('a reel splits between steps, and the next step adds a reel at its own height', async () => {
    const h = make();
    await land(h, BUFFALO);
    const order = captureEvents(h.reelSet, ['column:set', 'expand:stepAdded']);
    const result = await h.reelSet.expand({
      columns: [col('q2', 'q2', 'w', 'w'), col('q', 'w', 'w', 'w')],
      onStepLanded: ({ index, from }) => {
        if (index === 0) h.reelSet.splitBlock(from, 0, ['q', 'q', 'q']);
      },
    });
    expect(result.reelCount).toBe(5);
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([4, 4, 4, 5, 4]);
    expect(h.reelSet.getVisibleGrid()[3]).toEqual(['q', 'q', 'q', 'w', 'w']);
    expect(order.map((e) => e.event)).toEqual(['expand:stepAdded', 'column:set', 'expand:stepAdded']);

    // Next round: both resets together put the board back to 3 x 4.
    h.reelSet.removeReels();
    h.reelSet.resetColumns();
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([4, 4, 4]);
  });

  it('refuses a split while a step is in flight', async () => {
    const h = make();
    await land(h, BUFFALO);
    let refused: unknown = null;
    await h.reelSet.expand({
      columns: [col('q', 'w', 'w', 'w')],
      onStepAdded: () => {
        try {
          h.reelSet.splitBlock(0, 0, ['q', 'q', 'q', 'q']);
        } catch (err) {
          refused = err;
        }
      },
    });
    expect(String(refused)).toMatch(/an expand\(\) step is in flight/);
  });
});

describe('masks on a board whose reels change height', () => {
  it('keeps per-reel masks for stacks one reel wide, so a short reel shows no buffer cells', async () => {
    // Stacks only: no block wider than a reel, so no shared mask is auto-picked.
    const { big: _wide, ...stacks } = DATA;
    const h = make({ symbolGap: { x: 6, y: 6 }, symbolData: stacks });
    await land(h, BUFFALO);
    h.reelSet.splitBlock(0, 0, ['q', 'q', 'q', 'q', 'q', 'q']);
    // One mask rect per reel, each its own reel's height.
    const rects = h.reelSet.viewport.maskRects;
    expect(rects.map((r) => Math.round(r.height))).toEqual(h.reelSet.reels.map((r) => Math.round(r.extent)));
    expect(h.reelSet.viewport.maskGraphics.getLocalBounds().height).toBeCloseTo(h.reelSet.reels[0].extent, 6);
    expect(h.reelSet.viewport.maskStrategy.constructor.name).toBe('RectMaskStrategy');
  });

  it('warns once when a shared mask has to cover reels of different heights', async () => {
    resetNoticesForTest();
    const seen: string[] = [];
    const off = onNotice((n) => seen.push(n.code));
    try {
      // A 2x2 block plus a reel gap: the builder picks one shared mask.
      const h = make({ symbolGap: { x: 6, y: 6 } });
      await land(h, BUFFALO);
      h.reelSet.splitBlock(0, 0, ['q', 'q', 'q', 'q']);
      h.reelSet.splitBlock(2, 1, ['q', 'q', 'q']);
      expect(seen.filter((code) => code === 'shared-mask-jagged')).toHaveLength(1);
    } finally {
      off();
    }
  });
});
