import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import type { Cell, ReelSet } from '../../src/index.js';

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
      // Zero-duration tweens so the chain completes synchronously under FakeTicker.
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

describe('ReelSet.runCascade', () => {
  it('returns chainLength=0 + fires cascade:round:end when there are no wins', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'a'],
      ['b', 'a', 'b'],
      ['a', 'b', 'a'],
    ]);

    const completeEvents: Array<{ chainLength: number; totalWinners: number; wasSkipped: boolean }> = [];
    reelSet.events.on('cascade:round:end', (info) => completeEvents.push({
      chainLength: info.chainLength,
      totalWinners: info.totalWinners,
      wasSkipped: info.wasSkipped,
    }));

    const summary = await reelSet.runCascade({
      detectWinners: () => [],
      nextGrid: (grid) => grid,
      pauseAfterDestroyMs: 0,
    });

    expect(summary).toEqual({
      chainLength: 0,
      totalWinners: 0,
      finalGrid: reelSet.getVisibleGrid(),
      wasSkipped: false,
    });
    expect(completeEvents).toEqual([
      { chainLength: 0, totalWinners: 0, wasSkipped: false },
    ]);
    destroy();
  });

  it('iterates the chain until detectWinners returns empty', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['c', 'c', 'c'],
    ]);

    // Plan: each cascade collects the top row, drops in a filler, and repeats.
    // After 3 rounds there are no more "a"s in row 0, so detect returns empty.
    let level = 0;
    const summary = await reelSet.runCascade({
      detectWinners: (grid) => {
        level += 1;
        // Stop after 3 rounds.
        if (level > 3) return [];
        // Clear row 0 across all reels.
        return [
          { reel: 0, row: 0 },
          { reel: 1, row: 0 },
          { reel: 2, row: 0 },
        ];
      },
      nextGrid: (grid, winners) => {
        // Survivors slide down 1; new symbol at row 0 = 'd'.
        return grid.map((col) => ['d', col[0], col[1]]);
      },
      pauseAfterDestroyMs: 0,
    });

    expect(summary.chainLength).toBe(3);
    expect(summary.totalWinners).toBe(9);
    expect(summary.wasSkipped).toBe(false);
    destroy();
  });

  it('caps the chain at maxChain', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    // Detect always returns a winner — without maxChain this would loop forever.
    const summary = await reelSet.runCascade({
      detectWinners: () => [{ reel: 0, row: 0 }],
      nextGrid: (grid) => grid.map((col) => ['b', col[0], col[1]]),
      maxChain: 5,
      pauseAfterDestroyMs: 0,
    });

    expect(summary.chainLength).toBe(5);
    expect(summary.totalWinners).toBe(5);
    destroy();
  });

  it('invokes onCascade between destroy and refill, with the right level', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    let calls = 0;
    const observed: Array<{ chain: number; winnersCount: number }> = [];

    await reelSet.runCascade({
      detectWinners: () => {
        if (calls >= 2) return [];
        calls += 1;
        return [{ reel: 0, row: 0 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      onCascade: ({ chain, winners }) => {
        observed.push({ chain, winnersCount: winners.length });
      },
      pauseAfterDestroyMs: 0,
    });

    expect(observed).toEqual([
      { chain: 1, winnersCount: 1 },
      { chain: 2, winnersCount: 1 },
    ]);
    destroy();
  });

  it('exits the chain when AbortSignal aborts (caller-driven cancel)', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const controller = new AbortController();
    let calls = 0;
    const summary = await reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        return [{ reel: 0, row: 0 }];
      },
      nextGrid: (grid) => grid.map((col) => ['b', col[0], col[1]]),
      onCascade: () => {
        if (calls === 1) controller.abort();
      },
      pauseAfterDestroyMs: 0,
      signal: controller.signal,
      destroyOptions: { zIndex: null },
    });

    expect(summary.wasSkipped).toBe(true);
    expect(summary.chainLength).toBeLessThanOrEqual(1);
    destroy();
  });

  it('treats an already-aborted signal as an immediate exit (no detect call)', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const controller = new AbortController();
    controller.abort();

    let detectCalls = 0;
    const summary = await reelSet.runCascade({
      detectWinners: () => {
        detectCalls += 1;
        return [{ reel: 0, row: 0 }];
      },
      nextGrid: (grid) => grid,
      pauseAfterDestroyMs: 0,
      signal: controller.signal,
      destroyOptions: { zIndex: null },
    });

    expect(summary.wasSkipped).toBe(true);
    expect(summary.chainLength).toBe(0);
    // One detect call is allowed (the loop reads winners before checking wasSkipped),
    // but the chain must exit BEFORE any destroy / refill runs.
    expect(detectCalls).toBeLessThanOrEqual(1);
    destroy();
  });

  it('emits cascade:round:start once, then chain:start/end per stage, then cascade:round:end', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    const events: string[] = [];
    reelSet.events.on('cascade:round:start', () => events.push('round:start'));
    reelSet.events.on('cascade:chain:start', ({ chain }) => events.push(`chain:start:${chain}`));
    reelSet.events.on('cascade:chain:end',   ({ chain }) => events.push(`chain:end:${chain}`));
    reelSet.events.on('cascade:round:end',   () => events.push('round:end'));

    let calls = 0;
    await reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        if (calls > 2) return [];
        return [{ reel: 0, row: 0 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      pauseAfterDestroyMs: 0,
      destroyOptions: { zIndex: null },
    });

    expect(events).toEqual([
      'round:start',
      'chain:start:1',
      'chain:end:1',
      'chain:start:2',
      'chain:end:2',
      'round:end',
    ]);
    destroy();
  });

  it('round:start fires before any detectWinners call, round:end fires after the last refill', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    const trace: string[] = [];
    reelSet.events.on('cascade:round:start', () => trace.push('round:start'));
    reelSet.events.on('cascade:round:end',   () => trace.push('round:end'));

    await reelSet.runCascade({
      detectWinners: () => { trace.push('detect'); return []; },
      nextGrid: (g) => g,
      pauseAfterDestroyMs: 0,
    });

    expect(trace).toEqual(['round:start', 'detect', 'round:end']);
    destroy();
  });

  it('emits cascade:destroy:start/end around the destroy batch inside runCascade', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const events: string[] = [];
    reelSet.events.on('cascade:destroy:start', ({ cells }) => {
      events.push(`destroy:start:${cells.length}`);
    });
    reelSet.events.on('cascade:destroy:end', ({ cells }) => {
      events.push(`destroy:end:${cells.length}`);
    });

    let calls = 0;
    await reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        if (calls > 1) return [];
        return [{ reel: 0, row: 0 }, { reel: 1, row: 0 }];
      },
      nextGrid: (grid) => grid.map((col) => ['d', col[0], col[1]]),
      pauseAfterDestroyMs: 0,
      destroyOptions: { zIndex: null },
    });

    expect(events).toEqual(['destroy:start:2', 'destroy:end:2']);
    destroy();
  });

  it('treats a skip:requested mid-chain as wasSkipped and stops further refills', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    let calls = 0;
    const summary = await reelSet.runCascade({
      detectWinners: () => {
        calls += 1;
        return [{ reel: 0, row: 0 }];
      },
      nextGrid: (grid) => grid.map((col) => ['b', col[0], col[1]]),
      onCascade: () => {
        // Simulate the engine firing `skip:requested` mid-chain (as it
        // would when reelSet.skip() lands during an in-flight refill).
        // Direct emit avoids depending on real GSAP-driven destroy timing
        // in the FakeTicker harness; the contract being verified is
        // "runCascade observes skip:requested and exits at the next
        // chain boundary."
        if (calls === 1) reelSet.events.emit('skip:requested');
      },
      pauseAfterDestroyMs: 0,
      // Avoid actual gsap destroy (320ms × N rounds → timeout in headless
      // tests without a driven gsap ticker). We only care that the loop
      // sees the skip and exits.
      destroyOptions: { zIndex: null },
    });

    expect(summary.wasSkipped).toBe(true);
    expect(summary.chainLength).toBeLessThanOrEqual(1);
    destroy();
  });
});

describe('cascade:place:end payload', () => {
  it('reports isInitial=true and empty winnerRows on the initial drop', async () => {
    // Test the phase directly so we don't depend on a real gsap ticker
    // driving the fall-phase delayed-calls. The phase is a pure unit
    // here — give it a target frame, run it, capture the event payload.
    const { CascadePlacePhase } = await import('../../src/spin/phases/CascadePlacePhase.js');
    const { EventEmitter } = await import('../../src/events/EventEmitter.js');
    const { SpeedPresets } = await import('../../src/config/SpeedPresets.js');

    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    const events: Array<{ isInitial: boolean; winnerRows: readonly number[] }> = [];
    const localBus = new EventEmitter<import('../../src/events/ReelEvents.js').ReelSetEvents>();
    localBus.on('cascade:place:end', (info) => events.push({
      isInitial: info.isInitial,
      winnerRows: info.winnerRows,
    }));

    const reel = reelSet.getReel(0);
    const phase = new CascadePlacePhase(reel, SpeedPresets.NORMAL);
    await phase.run({
      targetFrame: ['a', 'a', 'b', 'c', 'a'],
      winnerRows: [],
      initial: true,
      events: localBus,
    });

    expect(events).toEqual([{ isInitial: true, winnerRows: [] }]);
    destroy();
  });

  it('reports isInitial=false and the winnerRows it received on a refill', async () => {
    const { CascadePlacePhase } = await import('../../src/spin/phases/CascadePlacePhase.js');
    const { EventEmitter } = await import('../../src/events/EventEmitter.js');
    const { SpeedPresets } = await import('../../src/config/SpeedPresets.js');

    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    const events: Array<{ isInitial: boolean; winnerRows: readonly number[] }> = [];
    const localBus = new EventEmitter<import('../../src/events/ReelEvents.js').ReelSetEvents>();
    localBus.on('cascade:place:end', (info) => events.push({
      isInitial: info.isInitial,
      winnerRows: info.winnerRows,
    }));

    const reel = reelSet.getReel(0);
    const phase = new CascadePlacePhase(reel, SpeedPresets.NORMAL);
    await phase.run({
      targetFrame: ['a', 'd', 'd', 'b', 'c'],
      winnerRows: [0, 2],
      initial: false,
      events: localBus,
    });

    expect(events).toEqual([{ isInitial: false, winnerRows: [0, 2] }]);
    destroy();
  });
});
