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
import { resolveTumbleConfig } from '../../src/cascade/TumbleConfig.js';
import type { ReelSet, ReelSetEvents } from '../../src/index.js';

/**
 * The phase-`onSkip` paths emitted no `:end` event before this fix, so
 * any consumer pairing `:start` / `:end` would drift out of balance on
 * every slam. These tests pin down the contract:
 *
 *   - A skip after `:start` MUST emit the matching `:end`.
 *   - A skip BEFORE `:start` (during the pre-fall delay window) must NOT
 *     emit `:end`. that would be unpaired.
 *   - Natural completion still emits `:end` exactly once (no double-fire
 *     when `forceComplete` runs after a phase has already finished).
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
      // Non-zero so the timeline doesn't auto-complete before the skip.
      fall:   { duration: 200, ease: 'none', rowStagger: 0 },
      dropIn: { duration: 200, ease: 'none', rowStagger: 0, distance: 'perHole' },
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

describe('CascadeFallPhase. skip event pairing', () => {
  it('emits cascade:fall:end on skip after :start has fired', async () => {
    const h = buildHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    const bus = new EventEmitter<ReelSetEvents>();
    const events: string[] = [];
    bus.on('cascade:fall:start', (info) => events.push(`start:${info.reelIndex}`));
    bus.on('cascade:fall:end',   (info) => events.push(`end:${info.reelIndex}`));

    const reel = h.reelSet.getReel(0);
    const fall = resolveTumbleConfig({}).fall;
    const phase = new CascadeFallPhase(reel, SpeedPresets.NORMAL, fall);

    // Run with delay=0 so :start fires synchronously inside onEnter.
    const done = phase.run({
      spinningMode: new StandardMode(),
      delay: 0,
      events: bus,
    });
    expect(events).toEqual(['start:0']);

    // Force-complete in the middle of the tween (gsap timeline still
    // running). this is the slam path the engine takes.
    phase.forceComplete();
    await done;
    expect(events).toEqual(['start:0', 'end:0']);
    h.destroy();
  });

  it('does NOT emit cascade:fall:end when skipped during the pre-fall delay (no paired :start)', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const events: string[] = [];
    bus.on('cascade:fall:start', (info) => events.push(`start:${info.reelIndex}`));
    bus.on('cascade:fall:end',   (info) => events.push(`end:${info.reelIndex}`));

    const reel = h.reelSet.getReel(0);
    const fall = resolveTumbleConfig({}).fall;
    const phase = new CascadeFallPhase(reel, SpeedPresets.NORMAL, fall);

    // Long delay so :start has not yet fired at the time we skip.
    const done = phase.run({
      spinningMode: new StandardMode(),
      delay: 5000,
      events: bus,
    });
    // No events yet. we're inside the delay window.
    expect(events).toEqual([]);

    phase.forceComplete();
    await done;
    // Critically: NO end event, because no start was emitted.
    expect(events).toEqual([]);
    h.destroy();
  });

  it('does not double-emit cascade:fall:end if forceComplete fires after natural completion', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const ends: number[] = [];
    bus.on('cascade:fall:end', (info) => ends.push(info.reelIndex));

    const reel = h.reelSet.getReel(0);
    // Zero-duration fall → onEnter fires :start AND :end synchronously.
    const phase = new CascadeFallPhase(
      reel,
      SpeedPresets.NORMAL,
      { duration: 0, ease: 'none', rowStagger: 0, rowOrder: 'bottomToTop' },
    );
    await phase.run({
      spinningMode: new StandardMode(),
      delay: 0,
      events: bus,
    });
    expect(ends).toEqual([0]);

    // forceComplete after natural finish. should NOT re-emit.
    phase.forceComplete();
    expect(ends).toEqual([0]);
    h.destroy();
  });
});

describe('CascadeDropInPhase. skip event pairing', () => {
  it('emits cascade:dropIn:end on skip (default role)', async () => {
    const h = buildHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    const bus = new EventEmitter<ReelSetEvents>();
    const events: string[] = [];
    bus.on('cascade:dropIn:start', (info) => events.push(`start:${info.reelIndex}`));
    bus.on('cascade:dropIn:end',   (info) => events.push(`end:${info.reelIndex}`));
    bus.on('cascade:gravity:end',  (info) => events.push(`gravity:end:${info.reelIndex}`));

    const reel = h.reelSet.getReel(0);
    const drop = resolveTumbleConfig({}).dropIn;
    const phase = new CascadeDropInPhase(reel, SpeedPresets.NORMAL, drop);

    const done = phase.run({
      winnerRows: [],
      initial: true,
      events: bus,
    });
    expect(events).toEqual(['start:0']);

    phase.forceComplete();
    await done;
    expect(events).toEqual(['start:0', 'end:0']);
    h.destroy();
  });

  it('emits cascade:gravity:end on skip when role=gravity', async () => {
    const h = buildHarness([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    const bus = new EventEmitter<ReelSetEvents>();
    const events: string[] = [];
    bus.on('cascade:gravity:start', (info) => events.push(`gstart:${info.reelIndex}`));
    bus.on('cascade:gravity:end',   (info) => events.push(`gend:${info.reelIndex}`));
    bus.on('cascade:dropIn:end',    (info) => events.push(`dend:${info.reelIndex}`));

    const reel = h.reelSet.getReel(0);
    const drop = resolveTumbleConfig({}).dropIn;
    const phase = new CascadeDropInPhase(reel, SpeedPresets.NORMAL, drop);

    // winnerRows=[1] on a 3-row reel gives the survivor at row 0 an
    // `offsetRows=1` slide. i.e. a real gravity-stage job that produces
    // a non-trivial gsap timeline. Without this, every winner config we
    // could choose either leaves no work (the phase finishes
    // synchronously in onEnter before forceComplete runs) or animates
    // new symbols (skipped under role='gravity'). The mid-flight skip
    // path needs both: a running timeline AND a job that role='gravity'
    // actually animates.
    const done = phase.run({
      winnerRows: [1],
      initial: false,
      role: 'gravity',
      events: bus,
    });
    expect(events).toEqual(['gstart:0']);

    phase.forceComplete();
    await done;
    // gravity end fires, dropIn:end does NOT.
    expect(events).toEqual(['gstart:0', 'gend:0']);
    h.destroy();
  });

  it('does not double-emit cascade:dropIn:end if forceComplete fires after natural completion', async () => {
    const h = buildHarness([['a', 'b', 'c']]);
    const bus = new EventEmitter<ReelSetEvents>();
    const ends: number[] = [];
    bus.on('cascade:dropIn:end', (info) => ends.push(info.reelIndex));

    const reel = h.reelSet.getReel(0);
    // Zero-duration → finish runs synchronously and emits :end once.
    const phase = new CascadeDropInPhase(
      reel,
      SpeedPresets.NORMAL,
      { duration: 0, ease: 'none', rowStagger: 0, rowOrder: 'bottomToTop', distance: 'perHole' },
    );
    await phase.run({
      winnerRows: [],
      initial: true,
      events: bus,
    });
    expect(ends).toEqual([0]);

    phase.forceComplete();
    expect(ends).toEqual([0]);
    h.destroy();
  });
});
