import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';

function buildTumbleHarness(initialFrame: string[][]) {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(initialFrame.length)
    .visibleRows(initialFrame[0].length)
    .symbolSize(50, 50)
    .symbols((r) => {
      for (const id of ['a', 'b', 'c', 'd']) r.register(id, HeadlessSymbol, {});
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

// Build a controllable promise + its resolver. Lets the test drive when
// the "anticipation animation" finishes from outside the engine.
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('refill — gravityHold promise', () => {
  it('drop-in waits for the gravityHold promise (no gravityHoldMs)', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const { promise: hold, resolve: releaseHold } = deferred();
    const order: string[] = [];
    reelSet.events.on('cascade:gravity:end',  (info) => order.push(`gravity:end:${info.reelIndex}`));
    reelSet.events.on('cascade:dropIn:start', (info) => order.push(`dropIn:start:${info.reelIndex}`));

    const refilling = reelSet.refill({
      winners: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }],
      grid: [
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
      ],
      mode: 'gravity-then-drop',
      gravityHoldMs: 0,        // no fixed pause — only the promise gates
      gravityHold: hold,
    });

    // Yield so gravity stage runs to completion.
    await new Promise((r) => setTimeout(r, 5));

    // Gravity should have ended on every reel; drop-in should NOT have
    // started yet because the promise hasn't resolved.
    expect(order.filter((e) => e.startsWith('gravity:end')).length).toBe(3);
    expect(order.filter((e) => e.startsWith('dropIn:start')).length).toBe(0);

    // Release the promise — drop-in must start now.
    releaseHold();
    await refilling;
    expect(order.filter((e) => e.startsWith('dropIn:start')).length).toBe(3);
    destroy();
  });

  it('drop-in waits for the LATER of gravityHoldMs and gravityHold (Promise.all semantics)', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const { promise: hold, resolve: releaseHold } = deferred();
    const order: string[] = [];
    reelSet.events.on('cascade:gravity:end',  () => order.push('gravity:end'));
    reelSet.events.on('cascade:dropIn:start', () => order.push('dropIn:start'));

    const refilling = reelSet.refill({
      winners: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }],
      grid: [
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
      ],
      mode: 'gravity-then-drop',
      gravityHoldMs: 20,       // short fixed floor
      gravityHold: hold,       // long-running async (test holds it)
    });

    // Wait long enough for gravityHoldMs to elapse on its own.
    await new Promise((r) => setTimeout(r, 60));

    // Even though setTimeout has fired, the promise is still pending
    // → drop-in must not have started.
    expect(order.filter((e) => e === 'gravity:end').length).toBe(3);
    expect(order.filter((e) => e === 'dropIn:start').length).toBe(0);

    releaseHold();
    await refilling;
    expect(order.filter((e) => e === 'dropIn:start').length).toBe(3);
    destroy();
  });

  it('a fast gravityHold still respects gravityHoldMs as a floor', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    let dropInTime = 0;
    let gravityEndTime = 0;
    reelSet.events.on('cascade:gravity:end',  () => { gravityEndTime = performance.now(); });
    reelSet.events.on('cascade:dropIn:start', () => {
      if (dropInTime === 0) dropInTime = performance.now();
    });

    await reelSet.refill({
      winners: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }],
      grid: [
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
      ],
      mode: 'gravity-then-drop',
      gravityHoldMs: 80,
      // Already-resolved promise — finishes immediately. The MS floor
      // must still apply.
      gravityHold: Promise.resolve(),
    });

    // The hold should be >= 80ms (the floor), not ~0ms (the promise).
    expect(dropInTime - gravityEndTime).toBeGreaterThanOrEqual(70);
    destroy();
  });

  it('onGravityComplete fires AFTER both gravityHoldMs and gravityHold resolve', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const order: string[] = [];
    const { promise: hold, resolve: releaseHold } = deferred();
    reelSet.events.on('cascade:gravity:end',  () => order.push('gravity:end'));
    reelSet.events.on('cascade:dropIn:start', () => order.push('dropIn:start'));

    const refilling = reelSet.refill({
      winners: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }],
      grid: [
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
        ['d', 'a', 'a'],
      ],
      mode: 'gravity-then-drop',
      gravityHoldMs: 10,
      gravityHold: hold,
      onGravityComplete: () => { order.push('callback'); },
    });

    await new Promise((r) => setTimeout(r, 50));
    // ms has fired but promise is pending → callback hasn't run, drop-in not started.
    expect(order).not.toContain('callback');
    expect(order.filter((e) => e === 'dropIn:start').length).toBe(0);

    releaseHold();
    await refilling;

    // Order: every gravity:end → callback → every dropIn:start.
    const callbackIdx = order.indexOf('callback');
    const firstDropIn = order.indexOf('dropIn:start');
    const lastGravity = order.lastIndexOf('gravity:end');
    expect(callbackIdx).toBeGreaterThanOrEqual(0);
    expect(lastGravity).toBeLessThan(callbackIdx);
    expect(callbackIdx).toBeLessThan(firstDropIn);
    destroy();
  });
});

describe('refill — gravityHold rejection surfacing', () => {
  it('emits cascade:gravity:error with the rejection reason when gravityHold rejects', async () => {
    // The rejection used to be silently swallowed (logged to console
    // only). Now it's also surfaced via a structured event so a HUD /
    // error reporter can hook it without scraping the console.
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const errors: unknown[] = [];
    reelSet.events.on('cascade:gravity:error', (info) => errors.push(info.error));

    const sentinel = new Error('multiplier-roll-blew-up');
    // Silence the console.error the engine emits — we're explicitly
    // exercising the error path.
    const originalError = console.error;
    console.error = (): void => {};
    try {
      // Refill resolves with wasSkipped=true (engine slams to recover);
      // the original rejection comes through via the event.
      await reelSet.refill({
        winners: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }],
        grid: [['d', 'a', 'a'], ['d', 'a', 'a'], ['d', 'a', 'a']],
        mode: 'gravity-then-drop',
        gravityHoldMs: 0,
        gravityHold: Promise.reject(sentinel),
      });
    } finally {
      console.error = originalError;
    }

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(sentinel);
    destroy();
  });
});

describe('runCascade — gravityHold per-cascade promise builder', () => {
  it('invokes the builder AT gravity-end (after every reel reports cascade:gravity:end), not at refill-start', async () => {
    // The docstring promises the builder fires "at the gravity-end
    // boundary" — i.e. AFTER every reel has reported `cascade:gravity:end`.
    // Before the fix, the runCascade body called the builder while
    // assembling the refill args, which lined the side effects up with
    // refill-START, not refill gravity-END. This test pins the contract.
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const timeline: string[] = [];
    reelSet.events.on('cascade:fall:end',     (info) => timeline.push(`fall:end:${info.reelIndex}`));
    reelSet.events.on('cascade:gravity:end',  (info) => timeline.push(`gravity:end:${info.reelIndex}`));
    reelSet.events.on('cascade:dropIn:start', (info) => timeline.push(`dropIn:start:${info.reelIndex}`));

    let detects = 0;
    await reelSet.runCascade({
      detectWinners: () => {
        detects += 1;
        if (detects > 1) return [];
        return [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
      },
      nextGrid: (grid) => grid.map((c) => ['d', c[0], c[1]]),
      pauseAfterDestroyMs: 0,
      refillMode: 'gravity-then-drop',
      gravityHoldMs: 0,
      gravityHold: () => {
        timeline.push('builder:invoked');
        return Promise.resolve();
      },
    });

    // Find the builder marker. It must appear AFTER every reel's
    // `cascade:gravity:end` and BEFORE every reel's `cascade:dropIn:start`.
    const builderIdx = timeline.indexOf('builder:invoked');
    expect(builderIdx).toBeGreaterThan(-1);

    const lastGravityEndIdx = timeline.lastIndexOf('gravity:end:2');
    const firstDropInStartIdx = timeline.indexOf('dropIn:start:0');
    expect(lastGravityEndIdx).toBeGreaterThan(-1);
    expect(firstDropInStartIdx).toBeGreaterThan(-1);

    // Builder fires AFTER the last gravity:end and BEFORE the first dropIn:start.
    expect(builderIdx).toBeGreaterThan(lastGravityEndIdx);
    expect(builderIdx).toBeLessThan(firstDropInStartIdx);

    destroy();
  });

  it('invokes gravityHold once per chain stage and awaits the result', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ]);

    const holdsBuilt: Array<{ chain: number; winnersCount: number }> = [];
    let callsDetect = 0;

    await reelSet.runCascade({
      detectWinners: () => {
        callsDetect += 1;
        if (callsDetect > 2) return [];
        return [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }];
      },
      nextGrid: (grid) => grid.map((c) => ['d', c[0], c[1]]),
      pauseAfterDestroyMs: 0,
      refillMode: 'gravity-then-drop',
      gravityHoldMs: 0,
      gravityHold: ({ chain, winners }) => {
        holdsBuilt.push({ chain, winnersCount: winners.length });
        // Tiny delay so the await is observably non-trivial.
        return new Promise((r) => setTimeout(r, 5));
      },
    });

    // Two refill stages → gravityHold called twice with chain 1 and 2.
    expect(holdsBuilt).toEqual([
      { chain: 1, winnersCount: 3 },
      { chain: 2, winnersCount: 3 },
    ]);
    destroy();
  });
});
