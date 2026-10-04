/**
 * Growing the board: `addReels()`, `removeReels()` and the `expand()` chain.
 *
 * The mechanic this is for is "infinity reels": the base spin lands, the
 * server says the board grows to N reels, and the extra reels arrive a step
 * at a time, each one spinning and landing on its own while everything
 * before it stays put. These tests walk every axis that touches it: layout,
 * mask, pool, events, MultiWays shapes, big symbols that need a wider step,
 * pins across steps, skip and abort, the guards, and shrinking back.
 *
 * Steps land through the NATURAL stop on a fast profile: GSAP runs on wall
 * clock in Node, so a `setInterval` pumps the FakeTicker alongside it (the
 * same arrangement as `reelGroups.test.ts`).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Container, type Ticker } from 'pixi.js';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import type { TestReelSetOptions } from '../../src/testing/testHarness.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';
import type { SymbolFactory } from '../../src/symbols/SymbolFactory.js';
import type { ExpandStep, ExpandStepLanded } from '../../src/core/expand.js';

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

const TURBO: SpeedProfile = { ...FAST, name: 'turbo', spinSpeed: 60, stopDelay: 0 };

const IDS = ['a', 'b', 'c', 'd', 'wild'];

const harnesses: Array<{ destroy(): void; stopPump(): void }> = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.stopPump();
    h.destroy();
  }
});

function makeHarness(opts: TestReelSetOptions = {}) {
  const h = createTestReelSet({ reels: 5, visibleCells: 3, symbolIds: IDS, ...opts });
  h.reelSet.speed.addProfile(FAST.name, FAST);
  h.reelSet.speed.addProfile(TURBO.name, TURBO);
  h.reelSet.setSpeed(FAST.name);
  const pump = setInterval(() => h.ticker.tick(16), 8);
  const handle = { ...h, stopPump: () => clearInterval(pump) };
  harnesses.push(handle);
  return handle;
}

const col = (...visible: string[]): ColumnTarget => ({ visible });
const base = (cells = 3): ColumnTarget[] =>
  Array.from({ length: 5 }, (_, r) => col(...Array.from({ length: cells }, (_, c) => IDS[(r + c) % 4])));

/** Land the base board through a natural stop. */
async function landBase(h: ReturnType<typeof makeHarness>, grid: ColumnTarget[] = base()) {
  const spin = h.reelSet.spin();
  h.reelSet.setResult(grid);
  return spin;
}

const factoryOf = (h: ReturnType<typeof makeHarness>) =>
  (h.reelSet as unknown as { _symbolFactory: SymbolFactory })._symbolFactory;

describe('addReels()', () => {
  it('appends reels at the next cross position and grows viewport, mask and reelCount', () => {
    const h = makeHarness({ symbolGap: { x: 10, y: 4 } });
    const log = captureEvents(h.reelSet, ['reels:added']);
    const added = h.reelSet.addReels(2);

    expect(added).toHaveLength(2);
    expect(h.reelSet.reels).toHaveLength(7);
    expect(added.map((r) => r.reelIndex)).toEqual([5, 6]);
    for (const reel of h.reelSet.reels) expect(reel.reelCount).toBe(7);
    // 120px cells, 10px gap: reel i sits at i * 130.
    expect(h.reelSet.reels[6].container.x).toBe(6 * 130);
    expect(h.reelSet.viewport.maskWidth).toBe(7 * 130 - 10);
    expect(h.reelSet.viewport.maskRects).toHaveLength(7);
    expect(h.reelSet.viewport.maskRects[6]).toMatchObject({ x: 780, width: 120 });
    expect(h.reelSet.getVisibleGrid()).toHaveLength(7);
    expect(h.reelSet.getVisibleGrid()[6]).toHaveLength(3);
    expect(log).toEqual([{ event: 'reels:added', args: [{ from: 5, count: 2 }] }]);
  });

  it('seeds new reels from initialFrame', () => {
    const h = makeHarness();
    h.reelSet.addReels(2, { initialFrame: [col('wild', 'a', 'b'), col('c', 'c', 'wild')] });
    expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['wild', 'a', 'b'], ['c', 'c', 'wild']]);
  });

  it('new reels take part in the next full spin', async () => {
    const h = makeHarness();
    h.reelSet.addReels(2);
    const grid = [...base(), col('wild', 'wild', 'wild'), col('a', 'b', 'c')];
    const result = await landBase(h, grid);
    expect(result.symbols).toHaveLength(7);
    expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['wild', 'wild', 'wild'], ['a', 'b', 'c']]);
  });

  it('marches downward on a horizontal set', () => {
    const h = makeHarness({ orientation: 'horizontal' });
    h.reelSet.addReels(1);
    // Horizontal: the cross axis is y and a reel is one 100px row.
    expect(h.reelSet.reels[5].container.y).toBe(5 * 100);
    expect(h.reelSet.viewport.maskHeight).toBe(6 * 100);
  });

  it('a jagged set takes per-reel counts, centred, and refuses a reel taller than the tallest', () => {
    const h = makeHarness({ visibleCells: [3, 5, 5, 5, 3] });
    h.reelSet.addReels(2, { visibleCells: [3, 5] });
    expect(h.reelSet.reels[5].visibleCells).toBe(3);
    expect(h.reelSet.reels[5].mainOffset).toBe(h.reelSet.reels[0].mainOffset);
    expect(h.reelSet.reels[6].mainOffset).toBe(0);
    expect(() => h.reelSet.addReels(1, { visibleCells: 6 })).toThrow(/taller than the board's tallest reel/);
    expect(h.reelSet.reels).toHaveLength(7);
  });

  it('a reel added without a count takes the last reel\'s', () => {
    const h = makeHarness({ visibleCells: [3, 4, 5, 4, 2] });
    h.reelSet.addReels(1);
    expect(h.reelSet.reels[5].visibleCells).toBe(2);
  });

  it('MultiWays: adds at maxCells, or reshapes to a given count inside the range', () => {
    const h = makeHarness({ multiways: { minCells: 2, maxCells: 7, reelExtent: 700 } });
    h.reelSet.addReels(1);
    expect(h.reelSet.reels[5].visibleCells).toBe(7);
    h.reelSet.addReels(1, { visibleCells: 2 });
    expect(h.reelSet.reels[6].visibleCells).toBe(2);
    expect(h.reelSet.reels[6].cellMain).toBe(350);
    expect(() => h.reelSet.addReels(1, { visibleCells: 8 })).toThrow(/outside multiways \[2, 7\]/);
  });

  it('extends a reel-group layout with one trailing group', () => {
    const h = makeHarness();
    h.reelSet.setReelGroups([[0, 1, 2], [3, 4]]);
    h.reelSet.addReels(2);
    expect(h.reelSet.reelGroups).toEqual([[0, 1, 2], [3, 4], [5, 6]]);
  });

  it('grows the symbol pool with the strip', () => {
    const h = makeHarness();
    const before = factoryOf(h).capacityPerKey;
    h.reelSet.addReels(10);
    expect(factoryOf(h).capacityPerKey).toBeGreaterThan(before);
  });

  it('validates its arguments', () => {
    const h = makeHarness();
    expect(() => h.reelSet.addReels(0)).toThrow(/at least 1/);
    expect(() => h.reelSet.addReels(1.5)).toThrow(/whole number/);
    expect(() => h.reelSet.addReels(2, { visibleCells: [3] })).toThrow(/1 entries for 2 new reels/);
    expect(() => h.reelSet.addReels(1, { visibleCells: 0 })).toThrow(/at least 1/);
    expect(() => h.reelSet.addReels(1, { initialFrame: [] })).toThrow(/0 columns for 1 new reels/);
    expect(h.reelSet.reels).toHaveLength(5);
  });

  it('checks every id and key of initialFrame before it builds a reel', () => {
    const h = makeHarness();
    const log = captureEvents(h.reelSet, ['reels:added']);
    expect(() =>
      h.reelSet.addReels(2, { initialFrame: [col('a', 'b', 'c'), col('nope', 'a', 'b')] }),
    ).toThrow(/addReels initialFrame column 1: symbol 'nope' is not registered/);
    expect(() =>
      h.reelSet.addReels(1, {
        initialFrame: [{ visible: ['a', 'b', 'c'], bufferAbove: ['wild'] } as unknown as ColumnTarget],
      }),
    ).toThrow(/bufferAbove/);
    // Nothing half-built: no reel, no mask rect, no count, no event.
    expect(h.reelSet.reels).toHaveLength(5);
    expect(h.reelSet.viewport.maskRects).toHaveLength(5);
    for (const reel of h.reelSet.reels) expect(reel.reelCount).toBe(5);
    expect(log).toEqual([]);
  });

  it('without a count, follows the last reel as the board is now, not as it was built', () => {
    const h = makeHarness({ visibleCells: [3, 4, 4, 4, 3] });
    h.reelSet.addReels(1, { visibleCells: 4 });
    h.reelSet.addReels(1);
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([3, 4, 4, 4, 3, 4, 4]);
  });

  it('takes the curve setCurve() set, not the one the builder was given', () => {
    const h = makeHarness({ curve: 0.4 });
    h.reelSet.setCurve(0.8);
    const [curved] = h.reelSet.addReels(1);
    expect(curved.curve?.config.amount).toBe(0.8);
    h.reelSet.setCurve(0);
    const [flat] = h.reelSet.addReels(1);
    expect(flat.curve).toBeUndefined();
  });

  it('follows reelExtents(): an added reel takes the last box and divides it', () => {
    const ticker = new FakeTicker();
    const reelSet = new ReelSetBuilder()
      .reels(5)
      .visibleCellsPerReel([3, 4, 5, 4, 3])
      .reelExtents([300, 300, 300, 300, 300])
      .symbolSize(100, 100)
      .ticker(ticker as unknown as Ticker)
      .symbols((r) => {
        for (const id of IDS) r.register(id, HeadlessSymbol, {});
      })
      .build();
    try {
      // Reel 1 already shows 4 cells in 300px; a 4-cell reel is not taller.
      const [four] = reelSet.addReels(1, { visibleCells: 4 });
      expect(four.extent).toBe(300);
      expect(four.cellMain).toBe(reelSet.reels[1].cellMain);
      expect(reelSet.viewport.maskRects[5]).toMatchObject({ y: 0, height: 300 });
    } finally {
      reelSet.destroy();
      ticker.destroy();
    }
  });

  it('throws while the reels spin', async () => {
    const h = makeHarness();
    const spin = h.reelSet.spin();
    expect(() => h.reelSet.addReels(1)).toThrow(/while the reels spin/);
    h.reelSet.setResult(base());
    await spin;
  });
});

describe('removeReels()', () => {
  it('destroys the last reels and shrinks viewport, mask, pool and reelCount back', () => {
    const h = makeHarness();
    const width = h.reelSet.viewport.maskWidth;
    const capacity = factoryOf(h).capacityPerKey;
    const added = h.reelSet.addReels(20);
    const log = captureEvents(h.reelSet, ['reels:removed']);

    h.reelSet.removeReels(20);

    expect(h.reelSet.reels).toHaveLength(5);
    for (const reel of added) expect(reel.isDestroyed).toBe(true);
    for (const reel of h.reelSet.reels) expect(reel.reelCount).toBe(5);
    expect(h.reelSet.viewport.maskWidth).toBe(width);
    expect(h.reelSet.viewport.maskRects).toHaveLength(5);
    expect(factoryOf(h).capacityPerKey).toBe(capacity);
    expect(log).toEqual([{ event: 'reels:removed', args: [{ from: 5, count: 20 }] }]);
  });

  it('expires pins on removed reels and keeps the rest', () => {
    const h = makeHarness();
    h.reelSet.addReels(2);
    h.reelSet.pin(1, 0, 'wild', { turns: 3 });
    h.reelSet.pin(6, 2, 'wild', { turns: 3 });
    const log = captureEvents(h.reelSet, ['pin:expired']);
    h.reelSet.removeReels(2);
    expect(h.reelSet.getPin(1, 0)).toBeDefined();
    expect(h.reelSet.pins.size).toBe(1);
    expect(log).toHaveLength(1);
    expect(log[0].args[1]).toBe('explicit');
  });

  it('drops removed reels from a group layout', () => {
    const h = makeHarness();
    h.reelSet.addReels(2);
    h.reelSet.setReelGroups([[0, 1], [2, 3, 4, 5], [6]]);
    h.reelSet.removeReels(2);
    expect(h.reelSet.reelGroups).toEqual([[0, 1], [2, 3, 4]]);
  });

  it('the board spins normally after shrinking', async () => {
    const h = makeHarness();
    h.reelSet.addReels(3);
    h.reelSet.removeReels(3);
    const result = await landBase(h);
    expect(result.symbols).toEqual(base().map((c) => c.visible));
  });

  it('symbols a removed reel released to the pool stay usable', async () => {
    const h = makeHarness();
    h.reelSet.addReels(5);
    const wide = [...base(), ...base()];
    // Natural spins wrap symbols through the pool, so the pool holds symbols
    // this reel released: its teardown must not reach them.
    await landBase(h, wide);
    await landBase(h, wide);
    h.reelSet.removeReels(5);
    for (let i = 0; i < 3; i++) await landBase(h);
    expect(h.reelSet.getVisibleGrid()).toEqual(base().map((c) => c.visible));
  });

  it("hands a removed reel's symbols back to the pool, stopped, and destroys what a game added to it", () => {
    const h = makeHarness();
    const [reel] = h.reelSet.addReels(1);
    const live = [...reel.symbols];
    const stopped = live.map((symbol) => vi.spyOn(symbol, 'stopAnimation'));
    const extra = new Container();
    reel.container.addChild(extra);

    h.reelSet.removeReels(1);

    for (const symbol of live) {
      // Released, not destroyed: deactivated (its animation stopped) and out
      // of the reel's container, ready for another cell.
      expect(symbol.isDestroyed).toBe(false);
      expect(symbol.symbolId).toBe('');
      expect(symbol.view.parent).toBeNull();
    }
    for (const spy of stopped) expect(spy).toHaveBeenCalled();
    expect(extra.destroyed).toBe(true);
  });

  it('without a count, removes every reel added since build, and is a no-op when there are none', () => {
    const h = makeHarness();
    const log = captureEvents(h.reelSet, ['reels:removed']);
    h.reelSet.removeReels();
    expect(log).toEqual([]);
    h.reelSet.addReels(2);
    h.reelSet.addReels(3);
    h.reelSet.removeReels();
    expect(h.reelSet.reels).toHaveLength(5);
    expect(log).toEqual([{ event: 'reels:removed', args: [{ from: 5, count: 5 }] }]);
    // Shrunk below the built board: nothing to put back, nothing to remove.
    h.reelSet.removeReels(2);
    h.reelSet.removeReels();
    expect(h.reelSet.reels).toHaveLength(3);
  });

  it('keeps at least one reel and refuses bad counts', () => {
    const h = makeHarness();
    expect(() => h.reelSet.removeReels(5)).toThrow(/from 1 to 4/);
    expect(() => h.reelSet.removeReels(0)).toThrow(/from 1 to 4/);
    h.reelSet.removeReels(4);
    expect(h.reelSet.reels).toHaveLength(1);
  });
});

describe('expand()', () => {
  it('adds, spins and lands one reel per step, holding every earlier reel', async () => {
    const h = makeHarness();
    await landBase(h);
    const before = h.reelSet.getVisibleGrid();
    const log = captureEvents(h.reelSet, [
      'expand:start',
      'reels:added',
      'expand:stepAdded',
      'spin:reelLanded',
      'expand:stepLanded',
      'expand:complete',
    ]);
    const columns = [col('wild', 'a', 'a'), col('b', 'wild', 'b'), col('c', 'c', 'wild')];

    const result = await h.reelSet.expand({ columns });

    expect(result).toMatchObject({ from: 5, reelCount: 8, steps: 3, wasSkipped: false });
    expect(result.symbols).toEqual([...before, ...columns.map((c) => c.visible)]);
    expect(h.reelSet.getVisibleGrid().slice(0, 5)).toEqual(before);
    // Only the step's own reel lands each step: held reels never re-land.
    const landed = log.filter((e) => e.event === 'spin:reelLanded').map((e) => e.args[0]);
    expect(landed).toEqual([5, 6, 7]);
    expect(log.map((e) => e.event)).toEqual([
      'expand:start',
      ...['reels:added', 'expand:stepAdded', 'spin:reelLanded', 'expand:stepLanded'],
      ...['reels:added', 'expand:stepAdded', 'spin:reelLanded', 'expand:stepLanded'],
      ...['reels:added', 'expand:stepAdded', 'spin:reelLanded', 'expand:stepLanded'],
      'expand:complete',
    ]);
    expect(log[0].args[0]).toEqual({ from: 5, to: 8, steps: 3 });
  });

  it('takes a step size, or a step function', async () => {
    const h = makeHarness();
    await landBase(h);
    const columns = Array.from({ length: 5 }, () => col('a', 'b', 'c'));
    const sizes: number[] = [];
    h.reelSet.events.on('expand:stepAdded', (s) => sizes.push(s.count));
    await h.reelSet.expand({ columns, step: 2 });
    expect(sizes).toEqual([2, 2, 1]);

    sizes.length = 0;
    const seen: Array<{ index: number; from: number; remaining: number }> = [];
    await h.reelSet.expand({
      columns,
      step: (info) => {
        seen.push(info);
        return info.index === 0 ? 2 : 1;
      },
    });
    expect(sizes).toEqual([2, 1, 1, 1]);
    expect(seen[0]).toEqual({ index: 0, from: 10, remaining: 5 });
    expect(seen[1]).toEqual({ index: 1, from: 12, remaining: 3 });
    expect(h.reelSet.reels).toHaveLength(15);
  });

  it('awaits onStepAdded before the step spins and onStepLanded before the next step', async () => {
    const h = makeHarness();
    await landBase(h);
    const trace: string[] = [];
    h.reelSet.events.on('spin:start', () => trace.push('spin'));
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a'), col('b', 'b', 'b')],
      onStepAdded: async (step: ExpandStep) => {
        trace.push(`added ${step.from}`);
        await new Promise((r) => setTimeout(r, 30));
        trace.push(`panned ${step.from}`);
      },
      onStepLanded: async (step: ExpandStepLanded) => {
        trace.push(`landed ${step.from} ${step.result.symbols[step.from].join('')}`);
        await new Promise((r) => setTimeout(r, 30));
      },
    });
    expect(trace).toEqual([
      'added 5', 'panned 5', 'spin', 'landed 5 aaa',
      'added 6', 'panned 6', 'spin', 'landed 6 bbb',
    ]);
  });

  it('staggers a step by its own reels, not by index', async () => {
    const h = makeHarness();
    // A profile where index-based delays would be obvious: reel 40 would
    // wait 40 x 50ms to start and 40 x 50ms more to stop.
    h.reelSet.speed.addProfile('slowStagger', { ...FAST, name: 'slowStagger', spinDelay: 50, stopDelay: 50 });
    h.reelSet.setSpeed('slowStagger');
    h.reelSet.addReels(35);
    const t0 = Date.now();
    await h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('b', 'b', 'b')], step: 2 });
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('resolves at once with nothing to add', async () => {
    const h = makeHarness();
    const log = captureEvents(h.reelSet, ['expand:start', 'spin:start']);
    const result = await h.reelSet.expand({ columns: [] });
    expect(result).toMatchObject({ from: 5, reelCount: 5, steps: 0, wasSkipped: false });
    expect(log).toEqual([]);
  });

  it('teases the step reels when asked', async () => {
    const h = makeHarness();
    await landBase(h);
    const teased: number[] = [];
    h.reelSet.events.on('anticipation:reel', (info) => teased.push(info.reelIndex));
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a'), col('b', 'b', 'b'), col('c', 'c', 'c')],
      anticipation: (step) => step.index === 2,
    });
    expect(teased).toEqual([7]);
  });

  describe('MultiWays', () => {
    const MW = { minCells: 2, maxCells: 7, reelExtent: 700 };

    it('lands each new reel on its column length, multiplying the ways', async () => {
      const h = makeHarness({ multiways: MW });
      const shape = [7, 7, 7, 7, 7];
      h.reelSet.events.on('spin:start', () => undefined);
      const spin = h.reelSet.spin();
      h.reelSet.setShape(shape);
      h.reelSet.setResult(shape.map((n) => col(...Array.from({ length: n }, () => 'a'))));
      await spin;

      const shapes = [7, 2, 7];
      const columns = shapes.map((n) => col(...Array.from({ length: n }, () => 'b')));
      const result = await h.reelSet.expand({ columns });

      const cells = h.reelSet.reels.map((r) => r.visibleCells);
      expect(cells).toEqual([7, 7, 7, 7, 7, 7, 2, 7]);
      expect(result.symbols[6]).toEqual(['b', 'b']);
      // 7^7 * 2 ways on the final board, 7^6 = 117,649 after the first step.
      expect(cells.reduce((p, n) => p * n, 1)).toBe(1_647_086);
      expect(h.reelSet.reels[6].cellMain).toBe(350);
    });

    it('reaches millions of ways: 8 reels of 7 is 5,764,801', async () => {
      const h = makeHarness({ multiways: MW });
      const spin = h.reelSet.spin();
      h.reelSet.setShape([7, 7, 7, 7, 7]);
      h.reelSet.setResult(Array.from({ length: 5 }, () => col(...Array(7).fill('a'))));
      await spin;
      await h.reelSet.expand({ columns: Array.from({ length: 3 }, () => col(...Array(7).fill('c'))), step: 3 });
      expect(h.reelSet.reels.reduce((p, r) => p * r.visibleCells, 1)).toBe(5_764_801);
    });

    it('a setShape() pending when reels are added lands them at the shape they were added with', async () => {
      const h = makeHarness({ multiways: MW });
      // A fresh set takes setShape() before spin() (cascade's reshape-before-fall order).
      h.reelSet.setShape([3, 4, 2, 7, 7]);
      h.reelSet.addReels(1);
      const spin = h.reelSet.spin();
      h.reelSet.setResult([3, 4, 2, 7, 7, 7].map((n) => col(...Array(n).fill('a'))));
      h.reelSet.slamStop();
      const result = await spin;
      expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([3, 4, 2, 7, 7, 7]);
      expect(result.symbols[5]).toEqual(Array(7).fill('a'));
    });

    it('refuses a column outside the range before adding anything', async () => {
      const h = makeHarness({ multiways: MW });
      await expect(h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('a')] })).rejects.toThrow(
        /expand\(\) column 1: 1 cells is outside multiways \[2, 7\]/,
      );
      expect(h.reelSet.reels).toHaveLength(5);
    });
  });

  describe('big symbols', () => {
    const BIG = { symbolData: { bonus: { size: { reels: 2, cells: 2 }, weight: 0 } } };

    it('widens a one-reel step to take a 2-wide block whole', async () => {
      const h = makeHarness({ symbolIds: [...IDS, 'bonus'], ...BIG });
      await landBase(h);
      const sizes: number[] = [];
      h.reelSet.events.on('expand:stepAdded', (s) => sizes.push(s.count));
      // Column 1 anchors a 2x2 that reaches column 2.
      await h.reelSet.expand({
        columns: [col('a', 'b', 'c'), col('bonus', 'a', 'a'), col('b', 'b', 'b'), col('c', 'c', 'c')],
        step: 1,
      });
      expect(sizes).toEqual([1, 2, 1]);
      const grid = h.reelSet.getVisibleGrid();
      expect(grid[6].slice(0, 2)).toEqual(['bonus', 'bonus']);
      expect(grid[7].slice(0, 2)).toEqual(['bonus', 'bonus']);
      expect(h.reelSet.getSymbolFootprint(7, 1).anchor).toEqual({ reel: 6, cell: 0 });
    });

    it('reads a replayed block (the id repeated in its cells) as one block', async () => {
      const h = makeHarness({ symbolIds: [...IDS, 'bonus'], ...BIG });
      await landBase(h);
      const sizes: number[] = [];
      h.reelSet.events.on('expand:stepAdded', (s) => sizes.push(s.count));
      await h.reelSet.expand({
        columns: [col('bonus', 'bonus', 'a'), col('bonus', 'bonus', 'b'), col('c', 'c', 'c')],
        step: 1,
      });
      expect(sizes).toEqual([2, 1]);
    });

    it('refuses a block past the last new reel, or past the strip, before adding anything', async () => {
      const h = makeHarness({ symbolIds: [...IDS, 'bonus'], ...BIG });
      await expect(h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('bonus', 'a', 'a')] })).rejects.toThrow(
        /reaches reel 7, past the last reel this expansion adds \(6\)/,
      );
      // bufferEnd is 1, so a 2-tall block anchored on the last buffer slot overflows.
      await expect(
        h.reelSet.expand({ columns: [{ visible: ['a', 'a', 'a'], bufferEnd: ['bonus'] }, col('a', 'a', 'a')] }),
      ).rejects.toThrow(/runs past the bottom/);
      expect(h.reelSet.reels).toHaveLength(5);
    });
  });

  describe('pins', () => {
    it('does not spend pin turns or clear eval pins per step; the next round does', async () => {
      const h = makeHarness();
      h.reelSet.pin(2, 1, 'wild', { turns: 3 });
      h.reelSet.pin(3, 0, 'wild', { turns: 'eval' });
      await landBase(h);
      expect(h.reelSet.getPin(2, 1)?.turns).toBe(2);
      // An 'eval' pin placed after the land lives through the evaluation.
      h.reelSet.pin(4, 0, 'wild', { turns: 'eval' });

      await h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('b', 'b', 'b'), col('c', 'c', 'c')] });

      expect(h.reelSet.getPin(2, 1)?.turns).toBe(2);
      expect(h.reelSet.getPin(4, 0)).toBeDefined();
      expect(h.reelSet.getVisibleGrid()[2][1]).toBe('wild');

      h.reelSet.removeReels(3);
      await landBase(h);
      expect(h.reelSet.getPin(2, 1)?.turns).toBe(1);
      expect(h.reelSet.getPin(4, 0)).toBeUndefined();
    });
  });

  describe('skip and abort', () => {
    it('a press slams the step and boosts the rest of the round, which the next spin restores', async () => {
      const h = makeHarness();
      await landBase(h);
      const speeds: string[] = [];
      const stepSkipped: boolean[] = [];
      // The player presses skip once, during the first step.
      let pressed = false;
      h.reelSet.events.on('spin:allStarted', () => {
        if (pressed) return;
        pressed = true;
        h.reelSet.skipSpin();
      });
      const result = await h.reelSet.expand({
        columns: [col('a', 'a', 'a'), col('b', 'b', 'b'), col('c', 'c', 'c')],
        onStepAdded: () => {
          speeds.push(h.reelSet.speed.activeName);
        },
        onStepLanded: (step) => {
          stepSkipped.push(step.result.wasSkipped);
        },
      });
      expect(result.wasSkipped).toBe(true);
      expect(stepSkipped).toEqual([true, false, false]);
      expect(h.reelSet.skipStage).toBe(2);
      // The boost from step 0 carries through the round...
      expect(speeds).toEqual(['fast', 'turbo', 'turbo']);
      expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['a', 'a', 'a'], ['b', 'b', 'b'], ['c', 'c', 'c']]);

      // ...and the next round restores it.
      await landBase(h, [...base(), col('a', 'a', 'a'), col('a', 'a', 'a'), col('a', 'a', 'a')]);
      expect(h.reelSet.speed.activeName).toBe('fast');
      expect(h.reelSet.skipStage).toBe(0);
    });

    it('abort mid-chain slams the step and lands everything left in one fast-forward step', async () => {
      const h = makeHarness();
      await landBase(h);
      const controller = new AbortController();
      const steps: ExpandStep[] = [];
      const columns = Array.from({ length: 6 }, (_, i) => col(IDS[i % 4], 'a', 'b'));
      const result = await h.reelSet.expand({
        columns,
        signal: controller.signal,
        onStepAdded: (step) => {
          steps.push(step);
          if (step.index === 1) controller.abort();
        },
      });
      expect(steps.map((s) => [s.count, s.fastForward])).toEqual([
        [1, false],
        [1, false],
        [4, true],
      ]);
      expect(result).toMatchObject({ reelCount: 11, steps: 3, wasSkipped: true });
      expect(h.reelSet.getVisibleGrid().slice(5)).toEqual(columns.map((c) => c.visible));
    });

    it("lets go of the caller's signal when the set is destroyed mid-step, and never slams it", async () => {
      const h = makeHarness();
      await landBase(h);
      const controller = new AbortController();
      const added = vi.spyOn(controller.signal, 'addEventListener');
      const removed = vi.spyOn(controller.signal, 'removeEventListener');
      // Torn down mid-step: that step's spin never settles.
      h.reelSet.events.on('spin:start', () => queueMicrotask(() => h.reelSet.destroy()));
      void h.reelSet.expand({ columns: [col('a', 'a', 'a')], signal: controller.signal });
      await new Promise((r) => setTimeout(r, 30));

      expect(h.reelSet.isDestroyed).toBe(true);
      const listeners = added.mock.calls.filter(([type]) => type === 'abort').map(([, fn]) => fn);
      expect(listeners).toHaveLength(1);
      expect(removed.mock.calls.some(([type, fn]) => type === 'abort' && fn === listeners[0])).toBe(true);
      // The usual teardown order, destroy then abort, reaches nothing.
      expect(() => controller.abort()).not.toThrow();
    });

    it('an already-aborted signal is one fast-forward step', async () => {
      const h = makeHarness();
      await landBase(h);
      const controller = new AbortController();
      controller.abort();
      const columns = [col('a', 'a', 'a'), col('b', 'b', 'b'), col('c', 'c', 'c')];
      const result = await h.reelSet.expand({ columns, signal: controller.signal });
      expect(result).toMatchObject({ reelCount: 8, steps: 1, wasSkipped: true });
      expect(h.reelSet.getVisibleGrid().slice(5)).toEqual(columns.map((c) => c.visible));
    });
  });

  describe('guards', () => {
    it('cannot start while the reels spin, nor nest', async () => {
      const h = makeHarness();
      const spin = h.reelSet.spin();
      await expect(h.reelSet.expand({ columns: [col('a', 'a', 'a')] })).rejects.toThrow(/while the reels spin/);
      h.reelSet.setResult(base());
      await spin;

      let nested: Promise<unknown> = Promise.resolve(null);
      await h.reelSet.expand({
        columns: [col('a', 'a', 'a')],
        onStepAdded: () => {
          // Settled into a value at once, so the rejection is never unhandled.
          nested = h.reelSet.expand({ columns: [col('b', 'b', 'b')] }).then(
            () => null,
            (err: Error) => err.message,
          );
          expect(() => h.reelSet.addReels(1)).toThrow(/while expand\(\) is running/);
          expect(() => h.reelSet.removeReels(1)).toThrow(/while expand\(\) is running/);
        },
        onStepLanded: async () => {
          await expect(h.reelSet.spin()).rejects.toThrow(/while expand\(\) is running/);
        },
      });
      expect(await nested).toMatch(/while expand\(\) is running/);
    });

    it('a nudge left running by a hook fails the next step loudly, by name', async () => {
      const h = makeHarness();
      await landBase(h);
      let nudge: Promise<unknown> = Promise.resolve();
      await expect(
        h.reelSet.expand({
          columns: [col('a', 'a', 'a'), col('b', 'b', 'b')],
          onStepLanded: (step) => {
            if (step.index === 0) {
              nudge = h.reelSet.nudge(5, { distance: 1, direction: 'forward', incoming: ['wild'] }).catch(() => undefined);
            }
          },
        }),
      ).rejects.toThrow(/a nudge\(\) is still running as the next step starts/);
      await nudge;
    });

    it('validates the columns before adding anything', async () => {
      const h = makeHarness({ visibleCells: [3, 4, 4, 4, 3] });
      await expect(h.reelSet.expand({ columns: [['a', 'b', 'c']] as unknown as ColumnTarget[] })).rejects.toThrow(
        /ColumnTarget/,
      );
      await expect(
        h.reelSet.expand({ columns: [{ visible: ['a'], bufferStart: ['a', 'b'] }] }),
      ).rejects.toThrow(/bufferStart/);
      await expect(h.reelSet.expand({ columns: [col('a', 'a', 'a', 'a', 'a')] })).rejects.toThrow(
        /taller than the board's tallest reel/,
      );
      await expect(h.reelSet.expand({ columns: [col('a')], step: 0 })).rejects.toThrow(/at least 1/);
      await expect(h.reelSet.expand({ columns: [col('a')], mode: 'cascade' })).rejects.toThrow(/requires \.tumble/);
      expect(h.reelSet.reels).toHaveLength(5);
    });

    it('checks symbol ids and an anticipation object before adding anything', async () => {
      const h = makeHarness();
      await landBase(h);
      const log = captureEvents(h.reelSet, ['expand:start', 'reels:added']);
      await expect(
        h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('a', 'a', 'a'), col('nope', 'a', 'b')] }),
      ).rejects.toThrow(/expand\(\) column 2: symbol 'nope' is not registered/);
      await expect(
        h.reelSet.expand({ columns: [col('a', 'a', 'a')], anticipation: { curve: [] } }),
      ).rejects.toThrow(/expand\(\) anticipation: `curve` must have at least one segment/);
      expect(h.reelSet.reels).toHaveLength(5);
      expect(log).toEqual([]);
    });

    it("checks a function's anticipation for a step before that step's reels exist", async () => {
      const h = makeHarness();
      await landBase(h);
      await expect(
        h.reelSet.expand({
          columns: [col('a', 'a', 'a'), col('b', 'b', 'b')],
          anticipation: (step) => (step.index === 1 ? { cells: -1 } : false),
        }),
      ).rejects.toThrow(/expand\(\) anticipation for step 1: `cells` must be a positive number/);
      // Step 0 landed; step 1 never added its reel.
      expect(h.reelSet.reels).toHaveLength(6);
    });
  });

  describe('across orientations, directions and modes', () => {
    it('a horizontal set grows downward, a row per reel', async () => {
      const h = makeHarness({ orientation: 'horizontal' });
      await landBase(h);
      await h.reelSet.expand({ columns: [col('wild', 'a', 'b'), col('c', 'c', 'c')] });
      expect(h.reelSet.reels[6].container.y).toBe(6 * 100);
      expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['wild', 'a', 'b'], ['c', 'c', 'c']]);
    });

    it('a reverse set lands its new reels through the natural stop', async () => {
      const h = makeHarness({ direction: 'reverse' });
      await landBase(h);
      const result = await h.reelSet.expand({ columns: [col('a', 'b', 'c'), col('c', 'b', 'a')], step: 2 });
      expect(result.wasSkipped).toBe(false);
      expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['a', 'b', 'c'], ['c', 'b', 'a']]);
    });

    it('a per-reel direction array extends with its last entry', () => {
      const h = makeHarness({ directionPerReel: ['forward', 'forward', 'forward', 'forward', 'reverse'] });
      const [added] = h.reelSet.addReels(1);
      expect(added.axis.direction).toBe('reverse');
    });

    it('cascade mode drops the new reels in', async () => {
      const h = makeHarness({ tumble: {} });
      const spin = h.reelSet.spin();
      h.reelSet.setResult(base());
      await spin;
      const result = await h.reelSet.expand({ columns: [col('wild', 'wild', 'wild')], mode: 'cascade' });
      expect(result.reelCount).toBe(6);
      expect(h.reelSet.getVisibleGrid()[5]).toEqual(['wild', 'wild', 'wild']);
    });

    it('a group layout gains the step reels as one trailing group, and they land', async () => {
      const h = makeHarness();
      h.reelSet.setReelGroups([[0, 1, 2], [3, 4]]);
      await landBase(h);
      await h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('b', 'b', 'b')], step: 2 });
      expect(h.reelSet.reelGroups).toEqual([[0, 1, 2], [3, 4], [5, 6]]);
      expect(h.reelSet.getVisibleGrid().slice(5)).toEqual([['a', 'a', 'a'], ['b', 'b', 'b']]);
    });

    it('a queued requestSkip() lands the step the moment its result is set', async () => {
      const h = makeHarness();
      await landBase(h);
      // Pressed as the step's spin starts, before expand() hands it its
      // result: the press queues and fires on setResult().
      const press = (): void => {
        h.reelSet.events.off('spin:start', press);
        h.reelSet.requestSkip();
      };
      h.reelSet.events.on('expand:stepAdded', () => h.reelSet.events.on('spin:start', press));
      const result = await h.reelSet.expand({ columns: [col('a', 'a', 'a')] });
      expect(result.wasSkipped).toBe(true);
      expect(h.reelSet.getVisibleGrid()[5]).toEqual(['a', 'a', 'a']);
    });
  });

  it('a long chain: 60 reels one at a time, then back to five', async () => {
    const h = makeHarness();
    await landBase(h);
    const controller = new AbortController();
    const columns = Array.from({ length: 60 }, (_, i) => col(IDS[i % 5], IDS[(i + 1) % 5], IDS[(i + 2) % 5]));
    // Fast-forward after a few real steps so the test stays quick; the
    // fast-forward step still adds every remaining reel.
    const result = await h.reelSet.expand({
      columns,
      signal: controller.signal,
      onStepLanded: (step) => {
        if (step.index === 3) controller.abort();
      },
    });
    expect(result.reelCount).toBe(65);
    expect(h.reelSet.getVisibleGrid().slice(5)).toEqual(columns.map((c) => c.visible));
    expect(h.reelSet.viewport.maskRects).toHaveLength(65);

    h.reelSet.removeReels(60);
    expect(h.reelSet.reels).toHaveLength(5);
    const again = await landBase(h);
    expect(again.symbols).toHaveLength(5);
  });
});
