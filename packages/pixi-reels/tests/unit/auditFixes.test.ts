import { describe, expect, it, vi } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { SpeedPresets, createTestReelSet } from '../../src/index.js';
import { computeDropOffsets } from '../../src/cascade/tumbleAlgorithm.js';
import type { Cell, ReelSet } from '../../src/index.js';

// Shared headless tumble harness — zero-duration tweens so phases settle
// on a single FakeTicker frame and tests are deterministic.
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

// ── refill() input validation ────────────────────────────────────────────
describe('ReelSet.refill — input validation', () => {
  it('throws RangeError when grid column count mismatches reel count', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    await expect(
      reelSet.refill({
        winners: [{ reel: 0, row: 0 }],
        grid: [
          ['d', 'a', 'b'],
          ['d', 'a', 'b'],
        ],
      }),
    ).rejects.toThrow(/grid has 2 column.* but the reel set has 3/);
    // Engine left idle so caller can retry.
    expect(reelSet.isSpinning).toBe(false);
    destroy();
  });

  it('throws RangeError when a column has wrong row count', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    await expect(
      reelSet.refill({
        winners: [{ reel: 0, row: 0 }],
        grid: [
          ['d', 'a'],
          ['d', 'a', 'b'],
          ['d', 'a', 'b'],
        ],
      }),
    ).rejects.toThrow(/grid column 0 has 2 row.* but reel 0 has 3/);
    expect(reelSet.isSpinning).toBe(false);
    destroy();
  });

  it('throws RangeError when winner.reel is out of range', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    await expect(
      reelSet.refill({
        winners: [{ reel: 5, row: 0 }],
        grid: [
          ['d', 'a', 'b'],
          ['d', 'a', 'b'],
          ['d', 'a', 'b'],
        ],
      }),
    ).rejects.toThrow(/winner\.reel 5 out of range \[0, 3\)/);
    expect(reelSet.isSpinning).toBe(false);
    destroy();
  });

  it('throws RangeError when winner.row is out of range', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    await expect(
      reelSet.refill({
        winners: [{ reel: 0, row: 99 }],
        grid: [
          ['d', 'a', 'b'],
          ['d', 'a', 'b'],
          ['d', 'a', 'b'],
        ],
      }),
    ).rejects.toThrow(/winner\.row 99 out of range \[0, 3\) for reel 0/);
    expect(reelSet.isSpinning).toBe(false);
    destroy();
  });

  it('accepts valid input and resolves normally', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    const result = await reelSet.refill({
      winners: [{ reel: 0, row: 0 }],
      grid: [
        ['d', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ],
    });
    expect(result.wasSkipped).toBe(false);
    destroy();
  });
});

// ── skip() pre-setResult guard ───────────────────────────────────────────
describe('ReelSet.skip — pre-setResult guard', () => {
  it('throws if called in standard mode before setResult', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    const promise = h.reelSet.spin();
    expect(() => h.reelSet.skip()).toThrow(/skip\(\) called before setResult/);
    // Recovery: result + slamStop ends the spin cleanly.
    h.reelSet.setResult([['a', 'a'], ['a', 'a']]);
    h.reelSet.slamStop();
    await promise;
    h.destroy();
  });

  it('throws if called in cascade mode before setResult', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'a'],
      ['a', 'a'],
    ]);
    const promise = reelSet.spin({ mode: 'cascade' });
    expect(() => reelSet.skip()).toThrow(/skip\(\) called before setResult/);
    reelSet.setResult([['b', 'a'], ['b', 'a']]);
    reelSet.slamStop();
    await promise;
    destroy();
  });

  it('still works the moment setResult arrives', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    const promise = h.reelSet.spin();
    h.reelSet.setResult([['a', 'a'], ['a', 'a']]);
    expect(() => h.reelSet.skip()).not.toThrow();
    await promise;
    h.destroy();
  });
});

// ── distance: 'auto' falls back to per-hole for survivors ────────────────
describe('CascadeDropInPhase — distance: auto fallback for survivors', () => {
  it('survivors slide from their old row, not from above the viewport (distance: auto, Moment B)', async () => {
    // The bug: with `distance: 'auto'`, a survivor (originalRow >= 0) was
    // teleported to `finalY - visibleRows * cellHeight` (above the viewport)
    // before being dropped — visible discontinuity. The fix: fall back to
    // perHole geometry for survivors in non-initial mode.
    //
    // The phase mutates `view.y` to its computed `startY` IMMEDIATELY in
    // `onEnter` (synchronous, before any tween ticks). We sample that.
    const { CascadeDropInPhase } = await import('../../src/spin/phases/CascadeDropInPhase.js');
    const { EventEmitter } = await import('../../src/events/EventEmitter.js');

    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    const localBus = new EventEmitter<import('../../src/events/ReelEvents.js').ReelSetEvents>();

    const reel = reelSet.getReel(0);
    const cellHeight = reel.motion.slotHeight;

    const phase = new CascadeDropInPhase(reel, SpeedPresets.NORMAL, {
      duration: 1000,        // non-zero so the snap-and-finish early-return doesn't kick in
      ease: 'none',
      rowStagger: 0,
      rowOrder: 'topToBottom',
      distance: 'auto',
    });

    // Kick off but don't await — we want to read view.y right after the
    // synchronous onEnter runs.
    void phase.run({
      winnerRows: [2],   // bottom row destroyed → row 0 = new, rows 1,2 = survivors from 0,1
      initial: false,
      events: localBus,
    });

    // Survivor row 1 originated from old row 0 → perHole startY = 0
    // (NOT auto's `finalY - 3*cellHeight = -2*cellHeight`).
    // Survivor row 2 originated from old row 1 → perHole startY = cellHeight
    // (NOT auto's `finalY - 3*cellHeight = -cellHeight`).
    // New row 0 (originalRow < 0) still uses auto: `finalY - 3*cellHeight = -3*cellHeight`.
    expect(reel.getSymbolAt(1).view.y).toBe(0);              // perHole for survivor
    expect(reel.getSymbolAt(2).view.y).toBe(cellHeight);     // perHole for survivor
    expect(reel.getSymbolAt(0).view.y).toBe(-3 * cellHeight); // auto for new symbol

    // Cleanup: kill the in-flight tween so the test exits.
    (phase as unknown as { forceComplete: () => void }).forceComplete();
    destroy();
  });

  it('still uses auto distance for the initial drop (Moment A)', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    // The initial path uses 'auto' for every row regardless of originalRow.
    // We test this indirectly via computeDropOffsets — on initial drop with
    // empty winners, every row is treated as new (originalRow < 0). The
    // 'auto' branch fires for all of them, not the perHole fallback.
    const offsets = computeDropOffsets(3, [], { initial: true });
    expect(offsets.every((o) => o.originalRow < 0)).toBe(true);
    destroy();
  });
});

// ── manual setSpeed clears the boost-restore intent ──────────────────────
describe('ReelSet.skip — manual setSpeed survives restore', () => {
  it('does NOT restore pre-boost speed when user manually re-set to boosted name', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    h.reelSet.speed.addProfile('superTurbo', SpeedPresets.SUPER_TURBO);

    // Round 1: skip boost from normal → superTurbo.
    const first = h.reelSet.spin();
    h.reelSet.setResult([['a', 'a'], ['a', 'a']]);
    h.reelSet.skip();
    await first;
    expect(h.reelSet.speed.activeName).toBe('superTurbo');

    // App "manually" calls setSpeed to the SAME name as the boost target.
    // This is the edge case that the previous activeName-comparison
    // implementation got wrong: it would see activeName === boostedTo and
    // restore to 'normal', clobbering the user's explicit choice.
    h.reelSet.setSpeed('superTurbo');
    expect(h.reelSet.speed.activeName).toBe('superTurbo');

    // Round 2: spin() must NOT restore — the user chose superTurbo.
    const second = h.reelSet.spin();
    expect(h.reelSet.speed.activeName).toBe('superTurbo');
    h.reelSet.setResult([['a', 'a'], ['a', 'a']]);
    h.reelSet.slamStop();
    await second;
    h.destroy();
  });

  it('still restores when the user did NOT touch setSpeed between rounds', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    h.reelSet.speed.addProfile('superTurbo', SpeedPresets.SUPER_TURBO);

    const first = h.reelSet.spin();
    h.reelSet.setResult([['a', 'a'], ['a', 'a']]);
    h.reelSet.skip();
    await first;
    expect(h.reelSet.speed.activeName).toBe('superTurbo');

    // No manual setSpeed — restore should fire.
    const second = h.reelSet.spin();
    expect(h.reelSet.speed.activeName).toBe('normal');
    h.reelSet.setResult([['a', 'a'], ['a', 'a']]);
    h.reelSet.slamStop();
    await second;
    h.destroy();
  });
});

// ── destroySymbols honors AbortSignal ────────────────────────────────────
describe('ReelSet.destroySymbols — AbortSignal', () => {
  it('snaps cells to alpha=0 on pre-aborted signal without running tweens', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    const controller = new AbortController();
    controller.abort();

    const cells: Cell[] = [{ reel: 0, row: 0 }, { reel: 1, row: 1 }];
    const t0 = performance.now();
    await reelSet.destroySymbols(cells, { signal: controller.signal, zIndex: null });
    const elapsed = performance.now() - t0;

    // Pre-abort path skips the tween entirely — should complete in <50 ms
    // even though the default playDestroy timeline is ~320 ms.
    expect(elapsed).toBeLessThan(50);
    expect(reelSet.getReel(0).getSymbolAt(0).view.alpha).toBe(0);
    expect(reelSet.getReel(1).getSymbolAt(1).view.alpha).toBe(0);
    destroy();
  });
});

// ── destroySymbols Promise.allSettled + failed payload ──────────────────
describe('ReelSet.destroySymbols — Promise.allSettled', () => {
  it('continues when one cell rejects and surfaces it in cascade:destroy:end', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    // Patch one symbol's playDestroy to reject.
    const targetSym = reelSet.getReel(1).getSymbolAt(1);
    const original = targetSym.playDestroy.bind(targetSym);
    targetSym.playDestroy = vi.fn(() => Promise.reject(new Error('boom')));

    let endPayload: { cells: readonly Cell[]; failed?: readonly Cell[] } | null = null;
    reelSet.events.on('cascade:destroy:end', (info) => { endPayload = info; });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cells: Cell[] = [
      { reel: 0, row: 0 },
      { reel: 1, row: 1 },
      { reel: 2, row: 2 },
    ];
    // Should resolve normally even though one tween rejected.
    await expect(reelSet.destroySymbols(cells, { zIndex: null })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    targetSym.playDestroy = original;

    expect(endPayload).not.toBeNull();
    expect(endPayload!.cells).toHaveLength(3);
    expect(endPayload!.failed).toBeDefined();
    expect(endPayload!.failed).toHaveLength(1);
    expect(endPayload!.failed![0]).toEqual({ reel: 1, row: 1 });
    destroy();
  });

  it('omits the failed field when every destroy succeeds', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    let endPayload: { cells: readonly Cell[]; failed?: readonly Cell[] } | null = null;
    reelSet.events.on('cascade:destroy:end', (info) => { endPayload = info; });

    const controller = new AbortController();
    controller.abort();  // fast-path: synchronous resolution
    await reelSet.destroySymbols(
      [{ reel: 0, row: 0 }],
      { signal: controller.signal, zIndex: null },
    );
    expect(endPayload!.failed).toBeUndefined();
    destroy();
  });
});

// ── _runReelTask recovery from a per-reel rejection ──────────────────────
describe('SpinController — per-reel rejection recovery', () => {
  it('a rejected refill phase chain does NOT hang refill() — it slams instead', async () => {
    const { reelSet, destroy } = buildTumbleHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);

    // Register a phase that rejects on entry for cascade:dropIn — simulate
    // a bug in a user-supplied phase override that nukes one reel's chain.
    // We can't easily inject mid-test on the wired factory; instead we
    // mock the reel's notifyLanded to throw on a specific reel, which
    // makes _refillReel reject. (notifyLanded is called inside the dropIn
    // phase's finish callback.)
    const targetReel = reelSet.getReel(1);
    const originalNotifyLanded = targetReel.notifyLanded.bind(targetReel);
    let throws = 1;
    targetReel.notifyLanded = vi.fn(() => {
      if (throws > 0) { throws--; throw new Error('chain failure'); }
      originalNotifyLanded();
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Refill: expect resolve (not hang, not reject) thanks to _runReelTask
    // catching the per-reel rejection and slamming.
    const result = await reelSet.refill({
      winners: [{ reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 }],
      grid: [
        ['d', 'a', 'b'],
        ['d', 'a', 'b'],
        ['d', 'a', 'b'],
      ],
    });
    expect(result.wasSkipped).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    targetReel.notifyLanded = originalNotifyLanded;
    destroy();
  });
});
