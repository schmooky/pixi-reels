import { describe, expect, it } from 'vitest';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { CascadeFallPhase } from '../../src/spin/phases/CascadeFallPhase.js';
import { CascadeDropInPhase } from '../../src/spin/phases/CascadeDropInPhase.js';
import { EventEmitter } from '../../src/events/EventEmitter.js';
import { SpeedPresets } from '../../src/config/SpeedPresets.js';
import { StandardMode } from '../../src/spin/modes/StandardMode.js';
import {
  resolveTumbleConfig,
  mergeFallConfig,
  mergeDropInConfig,
} from '../../src/cascade/TumbleConfig.js';
import type { ReelSet, ReelSetEvents, SpeedProfile } from '../../src/index.js';

/**
 * Three contracts under test:
 *   1. The pure `mergeFallConfig` / `mergeDropInConfig` helpers do the
 *      right partial-merge over a fully-resolved base.
 *   2. A speed profile with `tumble: {...}` actually flows through the
 *      cascade phases to the symbol-event payload (i.e. the phase reads
 *      `this._speed.tumble` at onEnter, not the build-time base).
 *   3. The per-symbol `signal: AbortSignal` aborts on `phase.forceComplete()`
 *      and stays un-aborted on natural completion — letting listener-side
 *      squish / bounce tweens hang off it via `signal.addEventListener`.
 *
 * Note on GSAP in tests: `tl.call(...)` callbacks at offset 0 don't fire
 * synchronously inside `tl` construction; GSAP renders on its own ticker.
 * The `await new Promise(r => setTimeout(r, 50))` lines below give the
 * GSAP ticker one or two real frames to render the timeline so the
 * per-symbol events actually emit before we slam.
 */

interface Harness {
  reelSet: ReelSet;
  ticker: FakeTicker;
  destroy: () => void;
}

function buildHarness(initialFrame: string[][]): Harness {
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
      fall:   { duration: 300, ease: 'sine.in',    rowStagger: 0 },
      dropIn: { duration: 600, ease: 'power2.out', rowStagger: 60, distance: 'perHole' },
    })
    .initialFrame(initialFrame.map((visible) => ({ visible })))
    .ticker(ticker as unknown as Ticker)
    .build();
  return {
    reelSet,
    ticker,
    destroy: () => { reelSet.destroy(); ticker.destroy(); },
  };
}

/** Yields long enough for GSAP's own ticker to render at least one frame. */
const yieldToGsap = (ms = 50): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

describe('mergeFallConfig / mergeDropInConfig', () => {
  const base = resolveTumbleConfig({
    fall:   { duration: 300, ease: 'sine.in', rowStagger: 0 },
    dropIn: { duration: 600, ease: 'power2.out', rowStagger: 60, distance: 'perHole' },
  });

  it('mergeFallConfig returns the base when override is undefined', () => {
    const merged = mergeFallConfig(base.fall, undefined);
    expect(merged).toEqual(base.fall);
  });

  it('mergeFallConfig deep-merges with Partial semantics', () => {
    const merged = mergeFallConfig(base.fall, { duration: 80 });
    expect(merged).toEqual({
      duration: 80,
      ease: 'sine.in',
      rowStagger: 0,
      rowOrder: 'bottomToTop',
    });
  });

  it('mergeDropInConfig returns the base when override is undefined', () => {
    const merged = mergeDropInConfig(base.dropIn, undefined);
    expect(merged).toEqual(base.dropIn);
  });

  it('mergeDropInConfig deep-merges with Partial semantics', () => {
    const merged = mergeDropInConfig(base.dropIn, {
      duration: 220,
      ease: 'expo.out',
    });
    expect(merged).toEqual({
      duration: 220,
      ease: 'expo.out',
      rowStagger: 60,
      rowOrder: 'bottomToTop',
      distance: 'perHole',
    });
  });

  it('does not mutate the base config', () => {
    const original = { ...base.fall };
    mergeFallConfig(base.fall, { duration: 1, ease: 'none', rowStagger: 1, rowOrder: 'topToBottom' });
    expect(base.fall).toEqual(original);
  });
});

describe('CascadeFallPhase — SpeedProfile.tumble override (snap path)', () => {
  it('profile with fall.duration: 0 routes through the snap path — no per-symbol events, paired :start/:end', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const events: string[] = [];
    bus.on('cascade:fall:start',  (i) => events.push(`start:${i.reelIndex}`));
    bus.on('cascade:fall:symbol', (i) => events.push(`sym:${i.reelIndex}:${i.rowIndex}`));
    bus.on('cascade:fall:end',    (i) => events.push(`end:${i.reelIndex}`));

    const reel = h.reelSet.getReel(0);
    const baseFall = resolveTumbleConfig({
      fall: { duration: 300, ease: 'sine.in', rowStagger: 0 },
    }).fall;
    const snap: SpeedProfile = {
      ...SpeedPresets.TURBO,
      tumble: { fall: { duration: 0 } },
    };
    const phase = new CascadeFallPhase(reel, snap, baseFall);

    await phase.run({ spinningMode: new StandardMode(), delay: 0, events: bus });
    expect(events).toEqual(['start:0', 'end:0']);
    h.destroy();
  });

  it('profile without tumble field keeps the base — snap path fires only when the base.duration is 0', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const events: string[] = [];
    bus.on('cascade:fall:end', (i) => events.push(`end:${i.reelIndex}`));

    const reel = h.reelSet.getReel(0);
    // Base.duration = 0 ⇒ snap path with a vanilla NORMAL profile (no tumble override).
    const baseFall = resolveTumbleConfig({
      fall: { duration: 0, ease: 'sine.in', rowStagger: 0 },
    }).fall;
    const phase = new CascadeFallPhase(reel, SpeedPresets.NORMAL, baseFall);

    await phase.run({ spinningMode: new StandardMode(), delay: 0, events: bus });
    expect(events).toEqual(['end:0']);
    h.destroy();
  });
});

describe('CascadeDropInPhase — SpeedProfile.tumble override (snap path)', () => {
  it('profile with dropIn.duration: 0 routes through the snap path — paired :start/:end, no per-symbol events', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const events: string[] = [];
    bus.on('cascade:dropIn:start',  (i) => events.push(`start:${i.reelIndex}`));
    bus.on('cascade:dropIn:symbol', (i) => events.push(`sym:${i.reelIndex}:${i.rowIndex}`));
    bus.on('cascade:dropIn:end',    (i) => events.push(`end:${i.reelIndex}`));

    const reel = h.reelSet.getReel(0);
    const baseDrop = resolveTumbleConfig({}).dropIn;
    const snap: SpeedProfile = {
      ...SpeedPresets.TURBO,
      tumble: { dropIn: { duration: 0 } },
    };
    const phase = new CascadeDropInPhase(reel, snap, baseDrop);

    await phase.run({ winnerRows: [], initial: true, events: bus });
    expect(events).toEqual(['start:0', 'end:0']);
    h.destroy();
  });
});

describe('CascadeFallPhase — SpeedProfile.tumble override (timeline path)', () => {
  it('emits the merged duration/ease on cascade:fall:symbol', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const symbols: Array<{ duration: number; ease: string }> = [];
    bus.on('cascade:fall:symbol', (info) => {
      symbols.push({ duration: info.duration, ease: info.ease });
    });

    const reel = h.reelSet.getReel(0);
    const baseFall = resolveTumbleConfig({
      fall: { duration: 300, ease: 'sine.in', rowStagger: 0 },
    }).fall;
    const turbo: SpeedProfile = {
      ...SpeedPresets.TURBO,
      tumble: { fall: { duration: 120, ease: 'power3.in' } },
    };
    const phase = new CascadeFallPhase(reel, turbo, baseFall);

    const done = phase.run({ spinningMode: new StandardMode(), delay: 0, events: bus });
    // Let GSAP render the offset-0 tl.call(s) so the events emit.
    await yieldToGsap();
    phase.forceComplete();
    await done;

    expect(symbols.length).toBeGreaterThan(0);
    for (const s of symbols) {
      expect(s.duration).toBe(120);
      expect(s.ease).toBe('power3.in');
    }
    h.destroy();
  });

  it('emits the base values when the profile has no tumble field', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const symbols: Array<{ duration: number; ease: string }> = [];
    bus.on('cascade:fall:symbol', (info) => {
      symbols.push({ duration: info.duration, ease: info.ease });
    });

    const reel = h.reelSet.getReel(0);
    const baseFall = resolveTumbleConfig({
      fall: { duration: 300, ease: 'sine.in', rowStagger: 0 },
    }).fall;
    const phase = new CascadeFallPhase(reel, SpeedPresets.NORMAL, baseFall);

    const done = phase.run({ spinningMode: new StandardMode(), delay: 0, events: bus });
    await yieldToGsap();
    phase.forceComplete();
    await done;

    expect(symbols.length).toBeGreaterThan(0);
    for (const s of symbols) {
      expect(s.duration).toBe(300);
      expect(s.ease).toBe('sine.in');
    }
    h.destroy();
  });
});

describe('CascadeDropInPhase — SpeedProfile.tumble override (timeline path)', () => {
  it('emits the merged duration/ease on cascade:dropIn:symbol', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const symbols: Array<{ duration: number; ease: string }> = [];
    bus.on('cascade:dropIn:symbol', (info) => {
      symbols.push({ duration: info.duration, ease: info.ease });
    });

    const reel = h.reelSet.getReel(0);
    const baseDrop = resolveTumbleConfig({
      dropIn: { duration: 600, ease: 'power2.out', rowStagger: 60, distance: 'perHole' },
    }).dropIn;
    const turbo: SpeedProfile = {
      ...SpeedPresets.TURBO,
      tumble: { dropIn: { duration: 240, ease: 'expo.out', rowStagger: 0 } },
    };
    const phase = new CascadeDropInPhase(reel, turbo, baseDrop);

    const done = phase.run({ winnerRows: [], initial: true, events: bus });
    await yieldToGsap();
    phase.forceComplete();
    await done;

    expect(symbols.length).toBeGreaterThan(0);
    for (const s of symbols) {
      expect(s.duration).toBe(240);
      expect(s.ease).toBe('expo.out');
    }
    h.destroy();
  });
});

describe('cascade:fall:symbol — AbortSignal', () => {
  it('signal is not aborted at the time of emission', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const signals: AbortSignal[] = [];
    bus.on('cascade:fall:symbol', (info) => { signals.push(info.signal); });

    const reel = h.reelSet.getReel(0);
    const fall = resolveTumbleConfig({ fall: { duration: 300, rowStagger: 0 } }).fall;
    const phase = new CascadeFallPhase(reel, SpeedPresets.NORMAL, fall);

    const done = phase.run({ spinningMode: new StandardMode(), delay: 0, events: bus });
    await yieldToGsap();

    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) expect(s.aborted).toBe(false);

    phase.forceComplete();
    await done;
    h.destroy();
  });

  it('aborts every fall signal when the phase is skipped mid-tween', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const aborted: number[] = [];
    bus.on('cascade:fall:symbol', (info) => {
      info.signal.addEventListener('abort', () => aborted.push(info.rowIndex), { once: true });
    });

    const reel = h.reelSet.getReel(0);
    const fall = resolveTumbleConfig({ fall: { duration: 300, rowStagger: 0 } }).fall;
    const phase = new CascadeFallPhase(reel, SpeedPresets.NORMAL, fall);

    const done = phase.run({ spinningMode: new StandardMode(), delay: 0, events: bus });
    await yieldToGsap();
    expect(aborted).toEqual([]);

    phase.forceComplete();
    await done;
    expect(aborted.sort()).toEqual([0, 1, 2]);
    h.destroy();
  });
});

describe('cascade:dropIn:symbol — AbortSignal', () => {
  it('aborts every dropIn signal when the phase is skipped mid-tween', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const aborted: number[] = [];
    bus.on('cascade:dropIn:symbol', (info) => {
      info.signal.addEventListener('abort', () => aborted.push(info.rowIndex), { once: true });
    });

    const reel = h.reelSet.getReel(0);
    const drop = resolveTumbleConfig({
      dropIn: { duration: 300, rowStagger: 0, distance: 'perHole' },
    }).dropIn;
    const phase = new CascadeDropInPhase(reel, SpeedPresets.NORMAL, drop);

    const done = phase.run({ winnerRows: [], initial: true, events: bus });
    await yieldToGsap();
    expect(aborted).toEqual([]);

    phase.forceComplete();
    await done;
    expect(aborted.length).toBeGreaterThan(0);
    expect(aborted.length).toBe(new Set(aborted).size);
    h.destroy();
  });
});

describe('cascade:gravity:symbol — AbortSignal', () => {
  it('aborts gravity signals on skip when role=gravity', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const aborted: number[] = [];
    bus.on('cascade:gravity:symbol', (info) => {
      info.signal.addEventListener('abort', () => aborted.push(info.rowIndex), { once: true });
    });

    const reel = h.reelSet.getReel(0);
    const drop = resolveTumbleConfig({
      dropIn: { duration: 300, rowStagger: 0, distance: 'perHole' },
    }).dropIn;
    const phase = new CascadeDropInPhase(reel, SpeedPresets.NORMAL, drop);

    // winnerRows=[1] on a 3-row reel gives the survivor at row 0 an
    // offsetRows=1 slide — a real gravity-stage job the phase will animate.
    const done = phase.run({
      winnerRows: [1],
      initial: false,
      role: 'gravity',
      events: bus,
    });
    await yieldToGsap();
    expect(aborted).toEqual([]);

    phase.forceComplete();
    await done;
    expect(aborted.length).toBeGreaterThan(0);
    h.destroy();
  });
});
