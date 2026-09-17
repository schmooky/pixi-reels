/**
 * `PhaseCardSymbol`: a card that shows the phase its reel is running.
 *
 * The card does not know its reel, so the interesting part is the watcher:
 * it has to follow the reel's own `phase:enter` / `landed` / `symbol:created`
 * events, paint a card that arrives mid-phase, leave other symbol classes
 * alone, and stop cleanly when released.
 */
import type { Ticker } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { PhaseCardSymbol, PHASE_CARD_COLORS } from '../../src/symbols/PhaseCardSymbol.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ReelSet } from '../../src/index.js';

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 150,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationDuration: 20,
  // A floor, so SPIN lasts a few frames: at 0 it resolves into the tease
  // between two ticks and a per-frame sample never sees it.
  minimumSpinTime: 120,
};

const RESULT = [{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'b', 'b'] }];

function build(landedMs = 0): { reelSet: ReelSet; ticker: FakeTicker } {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(2)
    .visibleCells(3)
    .symbolSize(80, 80)
    .symbols((r) => {
      r.register('a', PhaseCardSymbol, { label: 'a', landedMs });
      // A plain symbol on the same reels, to prove the watcher leaves it alone.
      r.register('b', HeadlessSymbol, {});
    })
    .speed(FAST.name, FAST)
    .initialSpeed(FAST.name)
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, ticker };
}

/** Pump frames until `p` settles, sampling after every frame. */
async function pump(ticker: FakeTicker, p: Promise<unknown>, onTick?: () => void): Promise<void> {
  let done = false;
  void p.then(() => { done = true; }, () => { done = true; });
  for (let frame = 0; frame < 5000 && !done; frame++) {
    ticker.tick(16);
    onTick?.();
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!done) throw new Error('spin never settled');
}

function cards(reelSet: ReelSet, reel: number): PhaseCardSymbol[] {
  return reelSet.reels[reel].symbols.filter((s): s is PhaseCardSymbol => s instanceof PhaseCardSymbol);
}

describe('PhaseCardSymbol', () => {
  it('is grey at rest and takes a phase colour through setPhase()', () => {
    const card = new PhaseCardSymbol({ label: 'A', colors: { custom: 0x123456 } });
    card.resize(80, 80);
    expect(card.phase).toBe('rest');
    card.setPhase('spin');
    expect(card.phase).toBe('spin');
    card.setPhase('custom');
    expect(card.phase).toBe('custom');
    card.setPhase('nobody-registered-this');
    expect(card.phase).toBe('nobody-registered-this');
    // `landedMs: 0` is not the default; the default beat rests later, on gsap.
    expect(PHASE_CARD_COLORS.rest).not.toBe(PHASE_CARD_COLORS.spin);
    card.destroy();
  });

  it('follows the reel through start, spin, anticipation, stop and back to rest', async () => {
    const { reelSet, ticker } = build();
    const stop = PhaseCardSymbol.watch(reelSet.reels);
    const seen = new Set<string>();
    const sample = (): void => {
      for (const card of cards(reelSet, 1)) seen.add(card.phase);
    };

    const spin = reelSet.spin();
    reelSet.setAnticipation([1]);
    reelSet.setResult(RESULT);
    await pump(ticker, spin, sample);

    for (const phase of ['start', 'spin', 'anticipation', 'stop']) expect(seen.has(phase)).toBe(true);
    // Landed with a zero beat: every card on the reel is grey again.
    for (const card of cards(reelSet, 1)) expect(card.phase).toBe('rest');
    // The plain symbol was never touched.
    for (const s of reelSet.reels[1].symbols) {
      if (!(s instanceof PhaseCardSymbol)) expect('phase' in s).toBe(false);
    }
    stop();
    reelSet.destroy();
    ticker.destroy();
  });

  it('paints a card that arrives mid-phase, and stops painting once released', async () => {
    const { reelSet, ticker } = build();
    const stop = PhaseCardSymbol.watch(reelSet.reels);
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    let sawArrivalPainted = false;
    await pump(ticker, spin, () => {
      // Cards swapped in while the strip wraps are painted on arrival, so at
      // no point mid-spin does a card on a spinning reel sit grey.
      const onReel = cards(reelSet, 0);
      if (onReel.length > 0 && reelSet.reels[0].speed !== 0) {
        sawArrivalPainted = onReel.every((c) => c.phase !== 'rest');
      }
    });
    expect(sawArrivalPainted).toBe(true);

    stop();
    const spin2 = reelSet.spin();
    reelSet.setResult(RESULT);
    const phasesAfterRelease = new Set<string>();
    await pump(ticker, spin2, () => {
      for (const card of cards(reelSet, 0)) phasesAfterRelease.add(card.phase);
    });
    // Released: nothing painted the second spin.
    expect([...phasesAfterRelease]).toEqual(['rest']);
    reelSet.destroy();
    ticker.destroy();
  });
});
