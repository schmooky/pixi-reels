/**
 * One reel changing its cells at rest: `setColumn()`, `splitSymbol()` (a
 * symbol that splits into more cells when it wins, as in "expanding stacked
 * symbols") and `resetColumns()`, alone and between `expand()` steps. The
 * reel grows (`height: 'grow'`) or keeps its height and shrinks its cells
 * (`height: 'keep'`, as on MultiWays).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Renderer, Ticker } from 'pixi.js';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { RoundedRectMaskStrategy } from '../../src/core/maskStrategies.js';
import { ReelWarp } from '../../src/core/ReelWarp.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
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

// A set the harness has no option for (a mask strategy, a warp renderer).
function custom(configure: (builder: ReelSetBuilder) => ReelSetBuilder) {
  const ticker = new FakeTicker();
  const builder = new ReelSetBuilder()
    .reels(3)
    .visibleCells(4)
    .symbolSize(120, 100)
    .symbols((r) => {
      for (const id of ['q', 'k', 'w']) r.register(id, HeadlessSymbol, {});
    })
    .ticker(ticker as unknown as Ticker);
  const reelSet = configure(builder).build();
  harnesses.push({ destroy: () => { reelSet.destroy(); ticker.destroy(); }, stopPump: () => {} });
  return reelSet;
}

function notices(): { seen: string[]; off: () => void } {
  resetNoticesForTest();
  const seen: string[] = [];
  return { seen, off: onNotice((n) => seen.push(n.code)) };
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

  it("keeps the reel's height under height: 'keep', its cells shrinking to share it", async () => {
    const h = make({ symbolGap: { x: 10, y: 4 } });
    await land(h, BUFFALO);
    const offsets = h.reelSet.reels.map((r) => r.mainOffset);
    const maskHeight = h.reelSet.viewport.maskHeight;
    const others = [1, 2].map((r) => h.reelSet.reels[r].symbols.slice());
    const log = captureEvents(h.reelSet, ['column:set']);

    h.reelSet.setColumn(0, col('q', 'q', 'q', 'q', 'q', 'q'), { height: 'keep' });

    const r0 = h.reelSet.reels[0];
    const extent = 4 * 100 + 3 * 4;
    expect(r0.visibleCells).toBe(6);
    expect(r0.cellMain).toBeCloseTo((extent - 5 * 4) / 6, 9);
    expect(r0.extent).toBe(extent);
    for (const symbol of r0.symbols) expect((symbol as HeadlessSymbol).height).toBeCloseTo(r0.cellMain, 9);
    // Nothing else moved, and nothing else was re-placed.
    expect(h.reelSet.viewport.maskHeight).toBe(maskHeight);
    h.reelSet.reels.forEach((r, i) => expect(r.mainOffset).toBe(offsets[i]));
    [1, 2].forEach((r, i) => expect(h.reelSet.reels[r].symbols).toEqual(others[i]));
    expect(log).toEqual([{ event: 'column:set', args: [{ reelIndex: 0, fromCells: 4, toCells: 6 }] }]);

    // A spin lands the reel at its new count and size.
    const result = await land(h, [col('k', 'k', 'k', 'k', 'k', 'k'), col('q', 'q', 'q', 'q'), col('w', 'w', 'w', 'w')]);
    expect(result.symbols.map((c) => c.length)).toEqual([6, 4, 4]);
    expect(h.reelSet.reels[0].extent).toBeCloseTo(extent, 9);
  });

  it("keeps a horizontal reel's width, its cells narrowing along the travel axis", async () => {
    // Reels are rows here: the main axis is x, so a cell's width is what shrinks.
    const h = make({ orientation: 'horizontal', symbolGap: { x: 6, y: 10 } });
    const r0 = h.reelSet.reels[0];
    const extent = r0.extent;
    expect(extent).toBe(4 * 120 + 3 * 6);
    h.reelSet.setColumn(0, col('q', 'k', 'q', 'k', 'q'), { height: 'keep' });
    expect(r0.extent).toBeCloseTo(extent, 9);
    expect(r0.cellMain).toBeCloseTo((extent - 4 * 6) / 5, 9);
    const symbol = r0.getSymbolAt(0) as HeadlessSymbol;
    expect(symbol.width).toBeCloseTo(r0.cellMain, 9);
    expect(symbol.height).toBe(100);
  });

  it("refuses a 'keep' that leaves no room for the cells, and an unknown height", () => {
    const h = make({ symbolGap: { x: 10, y: 4 } });
    // 412px of reel cannot hold 104 cells and their 103 gaps of 4px.
    expect(() => h.reelSet.setColumn(0, col(...new Array<string>(104).fill('q')), { height: 'keep' })).toThrow(
      /104 cells with 4px gaps do not fit reel 0's 412px/,
    );
    // @ts-expect-error: a height the API does not name.
    expect(() => h.reelSet.setColumn(0, col('q'), { height: 'shrink' })).toThrow(/height must be 'grow' or 'keep'/);
    expect(h.reelSet.reels[0].visibleCells).toBe(4);
  });

  it("keeps a kept height exact, so a 'keep' round trip leaves nothing for resetColumns()", () => {
    // 400 / 11 does not round-trip: 11 cells of it come to 400.00000000000006.
    const h = make();
    h.reelSet.setColumn(0, col(...new Array<string>(11).fill('q')), { height: 'keep' });
    expect(h.reelSet.reels[0].extent).toBe(400);
    h.reelSet.setColumn(0, col('q', 'q', 'q', 'q'), { height: 'keep' });
    const log = captureEvents(h.reelSet, ['column:set']);
    h.reelSet.resetColumns();
    expect(log).toEqual([]);
  });

  it('refuses a column that drops a pinned symbol, and keeps one that shows it', async () => {
    const h = make();
    await land(h, BUFFALO);
    h.reelSet.pin(1, 2, 'wild');
    expect(() => h.reelSet.setColumn(1, col('w', 'q', 'k', 'w'))).toThrow(
      /\(reel 1, cell 2\) is pinned to 'wild', but the column shows 'k' there/,
    );
    expect(h.reelSet.getVisibleGrid()[1]).toEqual(['w', 'q', 'wild', 'w']);
    h.reelSet.setColumn(1, col('k', 'q', 'wild', 'w', 'k'));
    expect(h.reelSet.getPin(1, 2)?.symbolId).toBe('wild');
    expect(h.reelSet.getVisibleGrid()[1]).toEqual(['k', 'q', 'wild', 'w', 'k']);
  });

  it('replaces only the cells that change: every other symbol keeps its instance and animation', async () => {
    const h = make();
    await land(h, BUFFALO);
    const reel = h.reelSet.reels[1];
    const before = reel.symbols.slice();
    const stops = before.map((symbol) => vi.spyOn(symbol, 'stopAnimation'));
    const created: number[] = [];
    reel.events.on('symbol:created', (_id, index) => created.push(index));

    h.reelSet.splitSymbol(1, 1, ['q', 'q', 'q']); // w q q w becomes w q q q q w

    for (const symbol of before) expect(reel.symbols).toContain(symbol);
    expect(created).toHaveLength(2);
    for (const spy of stops) expect(spy).not.toHaveBeenCalled();
    expect(h.reelSet.getVisibleGrid()[1]).toEqual(['w', 'q', 'q', 'q', 'q', 'w']);
  });

  it('warns once for any mask that covers the board as one box, and not for a per-reel one', () => {
    const { seen, off } = notices();
    try {
      const perReel = custom((b) => b.maskStrategy(new RoundedRectMaskStrategy({ radius: 12, scope: 'reel' })));
      perReel.setColumn(0, col('q', 'q', 'q', 'q', 'q', 'q'));
      expect(seen).not.toContain('shared-mask-jagged');
      const oneBox = custom((b) => b.maskStrategy(new RoundedRectMaskStrategy({ radius: 12 })));
      oneBox.setColumn(0, col('q', 'q', 'q', 'q', 'q', 'q'));
      expect(seen).toContain('shared-mask-jagged');
    } finally {
      off();
    }
  });

  it('moves a warped reel with its offset when the board re-centres', () => {
    // The warp draws the reel; a stub renderer is enough to build it.
    const renderer = { resolution: 1, render: () => {} } as unknown as Renderer;
    const rs = custom((b) => b.curve(0.3).curveMode('warp').renderer(renderer));
    rs.setColumn(0, col('q', 'q', 'q', 'q', 'q', 'q'));
    const warps = rs.viewport.maskedContainer.children.filter((c): c is ReelWarp => c instanceof ReelWarp);
    expect(warps).toHaveLength(3);
    expect(rs.reels[1].mainOffset).toBe(100);
    rs.reels.forEach((reel, i) => expect(warps[i].y).toBe(reel.mainOffset));
  });
});

describe('splitSymbol()', () => {
  it('splits a 1x3 into six cells of its own, the reel growing by three', async () => {
    const h = make();
    await land(h, BUFFALO);
    h.reelSet.pin(0, 3, 'wild');
    const moves = captureEvents(h.reelSet, ['pin:moved']);

    const res = h.reelSet.splitSymbol(0, 1, ['q', 'q', 'q', 'q', 'q', 'q']);

    expect(res).toEqual({ reelIndex: 0, from: 0, count: 6 });
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q', 'q', 'q', 'q', 'q', 'q', 'wild']);
    expect(window(h, 0)).not.toContain(OCC);
    // The pin below the block rode down with its symbol.
    expect(h.reelSet.getPin(0, 3)).toBeUndefined();
    expect(h.reelSet.getPin(0, 6)?.symbolId).toBe('wild');
    expect(moves).toHaveLength(1);
    expect(moves[0].args[1]).toEqual({ reel: 0, cell: 3 });

    // Then the 1x2 on reel 2 into four: 6 x 2 x 4 cells of q now.
    h.reelSet.splitSymbol(2, 2, ['q', 'q', 'q', 'q']);
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([7, 4, 6]);
    expect(h.reelSet.getVisibleGrid()[2]).toEqual(['w', 'q', 'q', 'q', 'q', 'w']);
  });

  it('keeps other blocks on the reel whole, and may place a new block that fits', async () => {
    const h = make();
    await land(h, [col('q2', 'q2', 'q2', 'q2'), col('w', 'w', 'w', 'w'), col('w', 'w', 'w', 'w')]);
    // Two 1x2s on reel 0: split the lower one.
    h.reelSet.splitSymbol(0, 3, ['q', 'q2', 'q2']);
    expect(window(h, 0)).toEqual(['q2', OCC, 'q', 'q2', OCC]);
  });

  it('splits any symbol one reel wide, a 1x1 too', async () => {
    const h = make();
    await land(h, BUFFALO);
    // One q on reel 1 into three: the reel grows by two.
    expect(h.reelSet.splitSymbol(1, 2, ['q', 'k', 'q'])).toEqual({ reelIndex: 1, from: 2, count: 3 });
    expect(h.reelSet.getVisibleGrid()[1]).toEqual(['w', 'q', 'q', 'k', 'q', 'w']);
    // Into one: a swap that keeps the count.
    h.reelSet.splitSymbol(1, 0, ['k']);
    expect(h.reelSet.getVisibleGrid()[1]).toEqual(['k', 'q', 'q', 'k', 'q', 'w']);
  });

  it("splits in place under height: 'keep', the reel as tall as before", async () => {
    const h = make({ symbolGap: { x: 10, y: 4 } });
    await land(h, BUFFALO);
    const extent = h.reelSet.reels[0].extent;
    h.reelSet.pin(0, 3, 'wild');

    h.reelSet.splitSymbol(0, 0, ['q', 'q', 'q', 'q', 'q', 'q'], { height: 'keep' });

    const r0 = h.reelSet.reels[0];
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q', 'q', 'q', 'q', 'q', 'q', 'wild']);
    expect(r0.extent).toBeCloseTo(extent, 9);
    expect(r0.cellMain).toBeCloseTo((extent - 6 * 4) / 7, 9);
    expect(h.reelSet.getPin(0, 6)?.symbolId).toBe('wild');
    // A stack left on a kept reel is sized from the reel's new cells.
    h.reelSet.splitSymbol(2, 1, ['q2', 'q2', 'q'], { height: 'keep' });
    const r2 = h.reelSet.reels[2];
    const stack = r2.getSymbolAt(1) as HeadlessSymbol;
    expect(stack.symbolId).toBe('q2');
    expect(stack.height).toBeCloseTo(2 * r2.cellMain + 4, 9);
  });

  it('refuses what is not one reel wide and in full view', async () => {
    const h = make();
    await land(h, [col('big', 'big', 'w', 'w'), col('big', 'big', 'w', 'w'), col('q', 'q', 'w', 'w')]);
    expect(() => h.reelSet.splitSymbol(0, 0, ['q', 'q', 'q'])).toThrow(/is part of a 2x2 block/);
    expect(() => h.reelSet.splitSymbol(1, 1, ['q', 'q', 'q'])).toThrow(/is part of a 2x2 block/);
    await land(h, [col('w', 'w', 'w', 'w'), col('w', 'w', 'w', 'w'), col('w', 'w', 'w', 'q2')]);
    // The 1x2 anchored on the last cell runs into the buffer below.
    expect(() => h.reelSet.splitSymbol(2, 3, ['q', 'q', 'q'])).toThrow(/runs past the reel's window/);

    const spin = h.reelSet.spin();
    expect(() => h.reelSet.splitSymbol(0, 0, ['q'])).toThrow(/while the reels spin/);
    h.reelSet.setResult(BUFFALO);
    await spin;
  });

  it('keeps a stack hanging in from above where it is when another cell on its reel splits', async () => {
    const h = make();
    await land(h, [{ bufferStart: ['q3'], visible: ['k', 'k', 'w', 'k'] }, col('w', 'w', 'w', 'w'), col('w', 'w', 'w', 'w')]);
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q3', 'q3', 'w', 'k']);
    h.reelSet.splitSymbol(0, 3, ['q', 'q']);
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q3', 'q3', 'w', 'q', 'q']);
  });

  it('refuses ids whose last block runs past them, a pinned symbol, and a cell out of range', async () => {
    const h = make();
    await land(h, BUFFALO);
    expect(() => h.reelSet.splitSymbol(1, 1, ['q', 'q2'])).toThrow(/'q2' at ids\[1\] covers 2 cells/);
    h.reelSet.pin(1, 2, 'wild');
    expect(() => h.reelSet.splitSymbol(1, 2, ['q', 'k'])).toThrow(/\(reel 1, cell 2\) is pinned to 'wild'/);
    expect(() => h.reelSet.splitSymbol(1, 9, ['q'])).toThrow(/splitSymbol: cell 9 out of range \[0, 4\)/);
    expect(h.reelSet.getVisibleGrid()[1]).toEqual(['w', 'q', 'wild', 'w']);
    // A block that ends inside the ids is fine.
    h.reelSet.splitSymbol(1, 1, ['q2', 'q2', 'k']);
    expect(window(h, 1)).toEqual(['w', 'q2', OCC, 'k', 'wild', 'w']);
    expect(h.reelSet.getPin(1, 4)?.symbolId).toBe('wild');
  });

  it('warns once when a block wider than a reel lands across reels a split resized', async () => {
    const { seen, off } = notices();
    try {
      const h = make();
      await land(h, BUFFALO);
      h.reelSet.splitSymbol(1, 1, ['q', 'q'], { height: 'keep' });
      await land(h, [col('big', 'big', 'w', 'w'), col('big', 'big', 'w', 'w', 'w'), col('w', 'w', 'w', 'w')]);
      expect(seen).toContain('wide-block-misaligned');
    } finally {
      off();
    }
  });

  it('adds a reel at its built cells after a split on the last reel', async () => {
    const h = make();
    await land(h, BUFFALO);
    h.reelSet.splitSymbol(2, 1, ['q', 'q', 'q'], { height: 'keep' });
    expect(h.reelSet.addReels(1)[0].visibleCells).toBe(4);
    h.reelSet.addRows(1);
    expect(h.reelSet.addReels(1)[0].visibleCells).toBe(5);
    h.reelSet.removeReels();
    h.reelSet.resetColumns();
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([4, 4, 4]);
  });

  it('refuses a reel a block wider than one reel covers, or a column that holds one', async () => {
    const h = make();
    await land(h, [col('w', 'w', 'q2', 'q2'), col('big', 'big', 'w', 'w'), col('big', 'big', 'w', 'w')]);
    // The 2x2 on reels 1-2 would stop lining up with one of its reels.
    expect(() => h.reelSet.splitSymbol(1, 3, ['q', 'q'])).toThrow(/reel 1 is covered by a 2x2 block anchored at \(reel 1, cell 0\)/);
    expect(() => h.reelSet.splitSymbol(2, 2, ['q', 'q'], { height: 'keep' })).toThrow(/reel 2 is covered by a 2x2 block/);
    expect(() => h.reelSet.setColumn(0, col('big', 'big', 'w', 'w'))).toThrow(/'big' \(2x2\) spans 2 reels/);
    // A reel the block does not touch still splits.
    h.reelSet.splitSymbol(0, 2, ['q', 'q', 'q']);
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([5, 4, 4]);
  });
});

describe('on MultiWays', () => {
  // Big symbols are not allowed on MultiWays, so these sets register none.
  const WAYS: TestReelSetOptions = {
    multiways: { minCells: 2, maxCells: 7, reelExtent: 700 },
    symbolData: {},
    symbolIds: ['q', 'k'],
  };

  it("splits a symbol in place, 'keep' being the default, and the next shape lands from there", async () => {
    const h = make(WAYS);
    const spin = h.reelSet.spin();
    h.reelSet.setShape([3, 4, 5]);
    h.reelSet.setResult([col('q', 'k', 'q'), col('k', 'k', 'k', 'k'), col('q', 'q', 'q', 'q', 'q')]);
    await spin;

    h.reelSet.splitSymbol(0, 1, ['k', 'k']);
    const r0 = h.reelSet.reels[0];
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q', 'k', 'k', 'q']);
    expect(r0.cellMain).toBeCloseTo(175, 9);
    expect(r0.extent).toBeCloseTo(700, 9);

    const next = h.reelSet.spin();
    h.reelSet.setShape([2, 2, 2]);
    h.reelSet.setResult([col('k', 'k'), col('q', 'q'), col('k', 'q')]);
    const result = await next;
    expect(result.symbols.map((c) => c.length)).toEqual([2, 2, 2]);
    expect(h.reelSet.reels[0].cellMain).toBeCloseTo(350, 9);
  });

  it('keeps the count within [minCells, maxCells], and refuses to grow or reset', () => {
    const h = make(WAYS);
    // Every reel starts at maxCells, so one more cell is out of range.
    expect(() => h.reelSet.splitSymbol(0, 0, ['q', 'q'])).toThrow(/8 cells is outside the MultiWays range \[2, 7\]/);
    expect(() => h.reelSet.setColumn(0, col('q', 'q'), { height: 'grow' })).toThrow(/MultiWays reel's height is fixed/);
    expect(() => h.reelSet.resetColumns()).toThrow(/MultiWays set's rows are its reels' shapes/);
    h.reelSet.setColumn(0, col('q', 'k'));
    expect(h.reelSet.reels[0].visibleCells).toBe(2);
  });

  it('shares out reelExtent, as a landing does, even before the first spin', () => {
    // Seven 100px cells and six 10px gaps would be 760px; the reel is 700.
    const h = make({ ...WAYS, symbolGap: { x: 0, y: 10 } });
    h.reelSet.setColumn(0, col('q', 'k'));
    expect(h.reelSet.reels[0].cellMain).toBeCloseTo((700 - 10) / 2, 9);
    expect(h.reelSet.reels[0].extent).toBeCloseTo(700, 9);
  });
});

describe('resetColumns()', () => {
  it('takes every reel back to the cells it was built with, and is a no-op otherwise', async () => {
    const h = make();
    await land(h, BUFFALO);
    const log = captureEvents(h.reelSet, ['column:set']);
    h.reelSet.resetColumns();
    expect(log).toEqual([]);

    h.reelSet.splitSymbol(0, 0, ['q', 'q', 'q', 'q', 'q']);
    h.reelSet.addRows(1);
    h.reelSet.resetColumns();
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([4, 4, 4]);
    expect(h.reelSet.viewport.maskHeight).toBe(h.reelSet.reels[1].extent);
    // addRows() is undone too, so removeRows() has nothing left to take.
    const removed = captureEvents(h.reelSet, ['rows:removed']);
    h.reelSet.removeRows();
    expect(removed).toEqual([]);
  });

  it("puts a kept reel's cell size back as well as its count", async () => {
    const h = make();
    await land(h, BUFFALO);
    h.reelSet.splitSymbol(0, 0, ['q', 'q', 'q', 'q', 'q'], { height: 'keep' });
    h.reelSet.resetColumns();
    const r0 = h.reelSet.reels[0];
    expect(r0.visibleCells).toBe(4);
    expect(r0.cellMain).toBe(100);
    expect(h.reelSet.getVisibleGrid()[0]).toEqual(['q', 'q', 'q', 'q']);
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
        if (index === 0) h.reelSet.splitSymbol(from, 0, ['q', 'q', 'q']);
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
          h.reelSet.splitSymbol(0, 0, ['q', 'q', 'q', 'q']);
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
    h.reelSet.splitSymbol(0, 0, ['q', 'q', 'q', 'q', 'q', 'q']);
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
      h.reelSet.splitSymbol(0, 0, ['q', 'q', 'q', 'q']);
      h.reelSet.splitSymbol(2, 1, ['q', 'q', 'q']);
      expect(seen.filter((code) => code === 'shared-mask-jagged')).toHaveLength(1);
    } finally {
      off();
    }
  });
});
