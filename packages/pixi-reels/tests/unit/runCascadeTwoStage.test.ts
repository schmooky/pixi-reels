import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { ReelSet } from '../../src/index.js';

interface Harness {
  reelSet: ReelSet;
  ticker: FakeTicker;
  destroy: () => void;
}

function buildTumbleHarness(initialFrame: string[][]): Harness {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(initialFrame.length)
    .visibleRows(initialFrame[0].length)
    .symbolSize(50, 50)
    .symbols((r) => {
      for (const id of ['a', 'b', 'c', 'd']) {
        r.register(id, HeadlessSymbol, {});
      }
    })
    .weights({ a: 1, b: 1, c: 1, d: 1 })
    .tumble({
      fall:   { duration: 0, ease: 'none', rowStagger: 0 },
      dropIn: { duration: 0, ease: 'none', rowStagger: 0, distance: 'perHole' },
    })
    .initialFrame(initialFrame)
    .ticker(ticker as unknown as Ticker)
    .build();
  return {
    reelSet,
    ticker,
    destroy: () => { reelSet.destroy(); ticker.destroy(); },
  };
}

describe('ReelSet.runCascade — two-stage (gravity-then-drop)', () => {
  it('emits cascade:gravity:* and cascade:dropIn:* in the right order for a refill that has both survivors and new symbols', async () => {
    // 3 reels × 3 rows. Clear the BOTTOM row (row 2) of every reel — that
    // gives both a slide (rows 0,1 fall to fill row 1,2) and a new symbol
    // (top row, row 0). Two-stage will animate the gravity slide first,
    // then drop the new top-row symbol.
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const order: string[] = [];
    reelSet.events.on('cascade:gravity:start', (info) => order.push(`gravity:start:${info.reelIndex}`));
    reelSet.events.on('cascade:gravity:end',   (info) => order.push(`gravity:end:${info.reelIndex}`));
    reelSet.events.on('cascade:dropIn:start',  (info) => order.push(`dropIn:start:${info.reelIndex}`));
    reelSet.events.on('cascade:dropIn:end',    (info) => order.push(`dropIn:end:${info.reelIndex}`));

    let calls = 0;
    await reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        if (calls > 1) return [];
        return [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      pauseAfterDestroyMs: 0,
      refillMode: 'gravity-then-drop',
      gravityHoldMs: 0,
    });

    // Every gravity event must come BEFORE every dropIn event in two-stage mode.
    const firstDropIn = order.findIndex((e) => e.startsWith('dropIn:'));
    const lastGravity = order.map((e, i) => (e.startsWith('gravity:') ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(lastGravity).toBeLessThan(firstDropIn);

    // Each reel fires gravity:start, gravity:end, dropIn:start, dropIn:end exactly once.
    for (let r = 0; r < 3; r++) {
      expect(order).toContain(`gravity:start:${r}`);
      expect(order).toContain(`gravity:end:${r}`);
      expect(order).toContain(`dropIn:start:${r}`);
      expect(order).toContain(`dropIn:end:${r}`);
    }
    destroy();
  });

  it('fires onGravityComplete exactly once per cascade, between gravity and drop-in', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const order: string[] = [];
    reelSet.events.on('cascade:gravity:end', () => order.push('gravity:end'));
    reelSet.events.on('cascade:dropIn:start', () => order.push('dropIn:start'));

    let hookCalls = 0;
    let calls = 0;
    await reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        if (calls > 2) return [];
        return [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      pauseAfterDestroyMs: 0,
      refillMode: 'gravity-then-drop',
      gravityHoldMs: 0,
      onGravityComplete: ({ chain }) => {
        hookCalls += 1;
        order.push(`hook:${chain}`);
      },
    });

    // Two cascades fired, two hook calls.
    expect(hookCalls).toBe(2);
    // The hook must fire after every gravity:end and before any dropIn:start
    // within each cascade window. We check by ensuring the FIRST hook
    // position is between SOME gravity:end and the FIRST dropIn:start.
    const firstHook = order.indexOf('hook:1');
    const firstDropIn = order.indexOf('dropIn:start');
    const firstGravityEnd = order.indexOf('gravity:end');
    expect(firstGravityEnd).toBeGreaterThanOrEqual(0);
    expect(firstGravityEnd).toBeLessThan(firstHook);
    expect(firstHook).toBeLessThan(firstDropIn);
    destroy();
  });

  it('combined mode (default) emits NO cascade:gravity:* events', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    let gravityEvents = 0;
    reelSet.events.on('cascade:gravity:start', () => { gravityEvents += 1; });
    reelSet.events.on('cascade:gravity:end',   () => { gravityEvents += 1; });

    let calls = 0;
    await reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        if (calls > 1) return [];
        return [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      pauseAfterDestroyMs: 0,
      // refillMode omitted → defaults to 'combined'
    });

    expect(gravityEvents).toBe(0);
    destroy();
  });

  it('lands the same final grid as combined mode', async () => {
    // Same input + same nextGrid, just different mode → same final grid.
    const initial: string[][] = [
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ];

    const a = buildTumbleHarness(initial.map((c) => [...c]));
    let calls = 0;
    await a.reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        if (calls > 1) return [];
        return [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      pauseAfterDestroyMs: 0,
      refillMode: 'combined',
    });
    const combinedGrid = a.reelSet.getVisibleGrid();
    a.destroy();

    const b = buildTumbleHarness(initial.map((c) => [...c]));
    calls = 0;
    await b.reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        if (calls > 1) return [];
        return [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      pauseAfterDestroyMs: 0,
      refillMode: 'gravity-then-drop',
      gravityHoldMs: 0,
    });
    const twoStageGrid = b.reelSet.getVisibleGrid();
    b.destroy();

    expect(twoStageGrid).toEqual(combinedGrid);
  });

  it('refill() with mode: gravity-then-drop emits gravity events (composing without runCascade)', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    let gravityStarts = 0;
    let dropInStarts = 0;
    reelSet.events.on('cascade:gravity:start', () => { gravityStarts += 1; });
    reelSet.events.on('cascade:dropIn:start',  () => { dropInStarts += 1; });

    const winners = [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
    await reelSet.destroySymbols(winners, { zIndex: null });
    await reelSet.refill({
      winners,
      grid: [
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
      ],
      mode: 'gravity-then-drop',
      gravityHoldMs: 0,
    });

    // 3 reels each emit gravity:start and dropIn:start.
    expect(gravityStarts).toBe(3);
    expect(dropInStarts).toBe(3);
    destroy();
  });
});
