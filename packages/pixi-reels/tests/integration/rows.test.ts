/**
 * Growing the board taller: `addRows()`, `removeRows()`, and rows that grow
 * between the steps of an `expand()` chain.
 *
 * Steps land through the natural stop on a fast profile; GSAP runs on the
 * wall clock in node, so a `setInterval` pumps the FakeTicker alongside it
 * (the same arrangement as `expand.test.ts`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createTestReelSet, captureEvents } from '../../src/testing/index.js';
import type { TestReelSetOptions } from '../../src/testing/testHarness.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
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
  h.reelSet.setSpeed(FAST.name);
  const pump = setInterval(() => h.ticker.tick(16), 8);
  const handle = { ...h, stopPump: () => clearInterval(pump) };
  harnesses.push(handle);
  return handle;
}

const col = (...visible: string[]): ColumnTarget => ({ visible });
const board = (reels: number, rows: number): ColumnTarget[] =>
  Array.from({ length: reels }, (_, r) => col(...Array.from({ length: rows }, (_, c) => IDS[(r + c) % 4])));

async function land(h: ReturnType<typeof makeHarness>, grid: ColumnTarget[]) {
  const spin = h.reelSet.spin();
  h.reelSet.setResult(grid);
  return spin;
}

describe('addRows()', () => {
  it('grows every reel at its cell size, keeps what it showed, and grows the viewport and mask', async () => {
    const h = makeHarness({ symbolGap: { x: 10, y: 4 } });
    await land(h, board(5, 3));
    const before = h.reelSet.getVisibleGrid();
    const log = captureEvents(h.reelSet, ['rows:added']);

    h.reelSet.addRows(2, { cells: Array.from({ length: 5 }, (_, r) => ['wild', IDS[r % 4]]) });

    // 100px cells, 4px gap: five rows are 5 * 100 + 4 * 4 = 516px.
    for (const reel of h.reelSet.reels) {
      expect(reel.visibleCells).toBe(5);
      expect(reel.cellMain).toBe(100);
      expect(reel.extent).toBe(516);
    }
    expect(h.reelSet.viewport.maskHeight).toBe(516);
    expect(h.reelSet.viewport.maskRects.every((rect) => rect.height === 516)).toBe(true);
    expect(h.reelSet.getVisibleGrid()).toEqual(before.map((cells, r) => [...cells, 'wild', IDS[r % 4]]));
    const last = h.reelSet.getCellBounds(0, 4);
    expect(last.y + last.height).toBe(516);
    expect(log).toEqual([{ event: 'rows:added', args: [{ count: 2, rows: [5, 5, 5, 5, 5] }] }]);
  });

  it('a spin on the taller board lands columns of the new height', async () => {
    const h = makeHarness();
    h.reelSet.addRows(1);
    const result = await land(h, board(5, 4));
    expect(result.symbols).toEqual(board(5, 4).map((c) => c.visible));
  });

  it('fills the new rows at random without cells', () => {
    const h = makeHarness();
    h.reelSet.addRows(1);
    expect(h.reelSet.getVisibleGrid().every((cells) => cells.length === 4 && cells.every(Boolean))).toBe(true);
  });

  it('keeps a jagged board anchored, and re-anchors reels whose boxes grow by different amounts', () => {
    const pyramid = makeHarness({ reels: 3, visibleCells: [3, 5, 3] });
    const offsets = pyramid.reelSet.reels.map((r) => r.mainOffset);
    pyramid.reelSet.addRows(1);
    // Every reel grew by the same pitch: the centred pyramid stays where it was.
    expect(pyramid.reelSet.reels.map((r) => r.mainOffset)).toEqual(offsets);

    // A fit-to-box set: 100px cells on reel 0, 75px on reel 1. A row adds 100
    // to one and 75 to the other, so reel 1 re-centres in the taller board.
    const ticker = new FakeTicker();
    const boxed = new ReelSetBuilder()
      .reels(2)
      .visibleCellsPerReel([3, 4])
      .reelExtents([300, 300])
      .symbolSize(100, 100)
      .ticker(ticker as unknown as Ticker)
      .symbols((r) => {
        for (const id of IDS) r.register(id, HeadlessSymbol, {});
      })
      .build();
    try {
      boxed.addRows(1);
      expect(boxed.reels.map((r) => r.extent)).toEqual([400, 375]);
      expect(boxed.reels[1].mainOffset).toBe(12.5);
      expect(boxed.viewport.maskRects[1]).toMatchObject({ y: 12.5, height: 375 });
      expect(boxed.getCellBounds(1, 4).y).toBeCloseTo(12.5 + 4 * 75, 9);
    } finally {
      boxed.destroy();
      ticker.destroy();
    }
  });

  it('validates its arguments, and refuses MultiWays and a board in motion', async () => {
    const h = makeHarness();
    expect(() => h.reelSet.addRows(0)).toThrow(/at least 1/);
    expect(() => h.reelSet.addRows(1, { cells: [['a']] })).toThrow(/1 columns for 5 reels/);
    expect(() => h.reelSet.addRows(2, { cells: board(5, 1).map((c) => c.visible) })).toThrow(/column 0 has 1 ids for 2/);
    expect(() => h.reelSet.addRows(1, { cells: board(5, 1).map(() => ['nope']) })).toThrow(/'nope' is not registered/);
    expect(h.reelSet.reels.every((r) => r.visibleCells === 3)).toBe(true);

    const spin = h.reelSet.spin();
    expect(() => h.reelSet.addRows(1)).toThrow(/while the reels spin/);
    h.reelSet.setResult(board(5, 3));
    await spin;

    const mw = makeHarness({ multiways: { minCells: 2, maxCells: 7, reelExtent: 700 } });
    expect(() => mw.reelSet.addRows(1)).toThrow(/MultiWays set's rows are its reels' shapes/);
  });
});

describe('removeRows()', () => {
  it('goes back to the rows the builder made, expires pins on removed rows, and is a no-op with none added', async () => {
    const h = makeHarness();
    const removed = captureEvents(h.reelSet, ['rows:removed']);
    h.reelSet.removeRows();
    expect(removed).toEqual([]);

    h.reelSet.addRows(1);
    h.reelSet.addRows(1);
    h.reelSet.pin(1, 0, 'wild', { turns: 3 });
    h.reelSet.pin(2, 4, 'wild', { turns: 3 });
    const expired = captureEvents(h.reelSet, ['pin:expired']);

    h.reelSet.removeRows();

    expect(h.reelSet.reels.every((r) => r.visibleCells === 3)).toBe(true);
    expect(h.reelSet.viewport.maskHeight).toBe(300);
    expect(h.reelSet.getPin(1, 0)).toBeDefined();
    expect(h.reelSet.getPin(2, 4)).toBeUndefined();
    expect(expired).toHaveLength(1);
    expect(removed).toEqual([{ event: 'rows:removed', args: [{ count: 2, rows: [3, 3, 3, 3, 3] }] }]);
    // The board spins on its old size again, the kept pin landing on its cell.
    const result = await land(h, board(5, 3));
    expect(result.symbols.map((cells) => cells.length)).toEqual([3, 3, 3, 3, 3]);
    expect(result.symbols[1][0]).toBe('wild');
  });

  it('keeps at least one row and refuses bad counts', () => {
    const h = makeHarness();
    expect(() => h.reelSet.removeRows(3)).toThrow(/from 1 to 2/);
    h.reelSet.removeRows(2);
    expect(h.reelSet.reels.every((r) => r.visibleCells === 1)).toBe(true);
  });
});

describe('rows inside an expand() chain', () => {
  it('grows the rows between steps, and later steps add reels as tall as the board is then', async () => {
    const h = makeHarness();
    await land(h, board(5, 3));
    const log = captureEvents(h.reelSet, ['rows:added', 'expand:stepAdded']);
    const result = await h.reelSet.expand({
      // Step 0 adds a 3-row reel; the board then grows a row; step 1 adds a 4-row one.
      columns: [col('a', 'a', 'a'), col('b', 'b', 'b', 'b')],
      onStepLanded: (step) => {
        if (step.index === 0) h.reelSet.addRows(1, { cells: Array.from({ length: 6 }, () => ['wild']) });
      },
    });
    expect(result.reelCount).toBe(7);
    expect(h.reelSet.reels.map((r) => r.visibleCells)).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(h.reelSet.getVisibleGrid()[5]).toEqual(['a', 'a', 'a', 'wild']);
    expect(h.reelSet.getVisibleGrid()[6]).toEqual(['b', 'b', 'b', 'b']);
    expect(log.map((e) => e.event)).toEqual(['expand:stepAdded', 'rows:added', 'expand:stepAdded']);
  });

  it('refuses a row change while a step is in flight', async () => {
    const h = makeHarness();
    await land(h, board(5, 3));
    let refused: unknown = null;
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a')],
      onStepAdded: () => {
        try {
          h.reelSet.addRows(1);
        } catch (err) {
          refused = err;
        }
      },
    });
    expect(String(refused)).toMatch(/an expand\(\) step is in flight/);
    expect(h.reelSet.reels.every((r) => r.visibleCells === 3)).toBe(true);
  });

  it('a column taller than the board fails at its step, before that step adds a reel', async () => {
    const h = makeHarness();
    await land(h, board(5, 3));
    await expect(
      h.reelSet.expand({ columns: [col('a', 'a', 'a'), col('b', 'b', 'b', 'b')] }),
    ).rejects.toThrow(/expand\(\) column 1: 4 cells .* Grow the board first with addRows\(\)/);
    // Step 0 landed; step 1 never added its reel.
    expect(h.reelSet.reels).toHaveLength(6);
  });
});

describe('expand() events and state', () => {
  it('isExpanding spans the chain, and expand:end closes it whichever way it ends', async () => {
    const h = makeHarness();
    await land(h, board(5, 3));
    const log = captureEvents(h.reelSet, ['expand:complete', 'expand:end']);
    const during: boolean[] = [];
    await h.reelSet.expand({
      columns: [col('a', 'a', 'a')],
      onStepAdded: () => {
        during.push(h.reelSet.isExpanding);
      },
    });
    expect(during).toEqual([true]);
    expect(h.reelSet.isExpanding).toBe(false);
    expect(log.map((e) => [e.event, e.args[0] === 'complete' ? 'complete' : ''])).toEqual([
      ['expand:complete', ''],
      ['expand:end', 'complete'],
    ]);

    log.length = 0;
    await expect(
      h.reelSet.expand({
        columns: [col('b', 'b', 'b')],
        onStepLanded: () => {
          throw new Error('hook bug');
        },
      }),
    ).rejects.toThrow('hook bug');
    expect(log).toEqual([{ event: 'expand:end', args: ['failed'] }]);
    expect(h.reelSet.isExpanding).toBe(false);
  });
});
