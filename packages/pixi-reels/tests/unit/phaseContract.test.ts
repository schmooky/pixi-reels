/**
 * The phase-authoring contract: what a phase written on `ReelPhase` can reach
 * without a cast.
 *
 * Before this, every method a stop phase needs to land a reel was `@internal`
 * and stripped from the published typings, so a custom `'stop'` phase could
 * place symbols and still never play a landing, never lift an unmask symbol
 * and never raise `spin:reelLanding`. `land()` and `bounce()` on the base are
 * the two moments such a phase has to express; these tests drive a stop phase
 * written from scratch against the real engine through them, and pin the
 * profile generic that lets a phase read timing of its own off the profile.
 */
import type { Ticker } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { ReelPhase } from '../../src/spin/phases/ReelPhase.js';
import type { ReelBounce } from '../../src/spin/phases/ReelPhase.js';
import type { StopPhaseConfig } from '../../src/spin/phases/StopPhase.js';
import type { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ReelSet } from '../../src/index.js';

const BOUNCE_MS = 320;

const PROFILE: SpeedProfile = {
  name: 'contract',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 0,
  bounceDistance: 12,
  bounceDuration: BOUNCE_MS,
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

/** Timing a phase carries on the profile instead of in its config. */
interface InstantProfile extends SpeedProfile {
  slideMs: number;
}

class LandedSymbol extends HeadlessSymbol {
  landedCount = 0;
  override onReelLanded(): void {
    this.landedCount++;
  }
}

/**
 * A stop phase that never spins its frame in: place the result outright, land,
 * bounce, done. The shape of a legacy "instant stop", written on the base
 * class alone.
 */
class InstantStopPhase extends ReelPhase<StopPhaseConfig> {
  readonly name = 'stop';
  readonly skippable = true;
  private _bounce: ReelBounce | null = null;

  protected onEnter(config: StopPhaseConfig): void {
    this.reel.placeStrip(config.targetFrame);
    this.land();
    this._bounce = this.bounce();
    void this._bounce.done.then(() => this._complete());
  }

  update(): void {}

  protected onSkip(): void {
    this._bounce?.cancel();
  }
}

function build(phases: (f: PhaseFactory) => void, profile: SpeedProfile = PROFILE): {
  reelSet: ReelSet;
  ticker: FakeTicker;
} {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(3)
    .visibleCells(3)
    .symbolSize(100, 100)
    .symbols((r) => {
      r.register('a', LandedSymbol, {});
      r.register('b', LandedSymbol, {});
    })
    .speed(profile.name, profile)
    .initialSpeed(profile.name)
    .phases(phases)
    .ticker(ticker as unknown as Ticker)
    .build();
  return { reelSet, ticker };
}

/** Pump frames until `p` settles, counting the frames it took. */
async function pump(ticker: FakeTicker, p: Promise<unknown>, onTick?: (frame: number) => void): Promise<void> {
  let done = false;
  void p.then(() => { done = true; }, () => { done = true; });
  for (let frame = 0; frame < 5000 && !done; frame++) {
    ticker.tick(16);
    onTick?.(frame);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!done) throw new Error('spin never settled');
}

const RESULT = [
  { visible: ['a', 'b', 'a'] },
  { visible: ['b', 'b', 'b'] },
  { visible: ['a', 'a', 'a'] },
];

describe('a stop phase written on ReelPhase', () => {
  it('lands the frame through land() and settles a bounce later through bounce()', async () => {
    const { reelSet, ticker } = build((f) => f.register('stop', InstantStopPhase));
    let frame = 0;
    const landingAt = new Map<number, number>();
    const landedAt = new Map<number, number>();
    reelSet.events.on('spin:reelLanding', (reel, symbols) => {
      landingAt.set(reel, frame);
      expect(symbols).toEqual(RESULT[reel].visible);
    });
    reelSet.events.on('spin:reelLanded', (reel) => landedAt.set(reel, frame));

    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    const result = await pump(ticker, spin, (f) => { frame = f; }).then(() => spin);

    expect(result.symbols).toEqual(RESULT.map((c) => c.visible));
    expect([...landingAt.keys()].sort()).toEqual([0, 1, 2]);
    for (const reel of [0, 1, 2]) {
      // The landing frame comes a whole bounce before the settle, exactly as
      // on the built-in stop.
      expect(landedAt.get(reel)! - landingAt.get(reel)!).toBeGreaterThanOrEqual(BOUNCE_MS / 16 - 2);
      // Every visible symbol was told it landed, once.
      for (const symbol of reelSet.reels[reel].symbols.slice(1, 4)) {
        expect((symbol as LandedSymbol).landedCount).toBe(1);
      }
      // And the reel is back where it rests.
      expect(reelSet.reels[reel].container.y).toBe(0);
    }
    reelSet.destroy();
    ticker.destroy();
  });

  it('is skippable mid-bounce: cancel() rests the reel where the bounce began', async () => {
    const { reelSet, ticker } = build((f) => f.register('stop', InstantStopPhase));
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    // Into the stop phase and far enough into the bounce that every reel has
    // visibly left its resting position. GSAP runs on the real clock here, so
    // wait for the movement rather than counting frames.
    const moved = new Set<number>();
    for (let i = 0; i < 2000 && moved.size < 3; i++) {
      ticker.tick(16);
      await new Promise((r) => setTimeout(r, 2));
      for (const reel of reelSet.reels) if (reel.container.y !== 0) moved.add(reel.reelIndex);
    }
    expect(moved.size).toBe(3);

    reelSet.slamStop();
    for (const reel of reelSet.reels) expect(reel.container.y).toBe(0);
    await spin;
    reelSet.destroy();
    ticker.destroy();
  });

  it('bounce() with no distance is already settled, so the phase can await it either way', async () => {
    const { reelSet, ticker } = build(
      (f) => f.register('stop', InstantStopPhase),
      { ...PROFILE, bounceDistance: 0 },
    );
    let frame = 0;
    const landingAt = new Map<number, number>();
    const landedAt = new Map<number, number>();
    reelSet.events.on('spin:reelLanding', (reel) => landingAt.set(reel, frame));
    reelSet.events.on('spin:reelLanded', (reel) => landedAt.set(reel, frame));
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin, (f) => { frame = f; });
    for (const reel of [0, 1, 2]) {
      // No bounce to wait out: the settle follows the landing within a frame.
      expect(landedAt.get(reel)! - landingAt.get(reel)!).toBeLessThanOrEqual(1);
    }
    reelSet.destroy();
    ticker.destroy();
  });
});

describe('a phase typed against a wider profile', () => {
  it('reads its own fields off the profile instance the game registered', async () => {
    const seen: number[] = [];
    class SlidingStopPhase extends ReelPhase<StopPhaseConfig, InstantProfile> {
      readonly name = 'stop';
      readonly skippable = true;
      protected onEnter(config: StopPhaseConfig): void {
        seen.push(this._speed.slideMs);
        this.reel.placeStrip(config.targetFrame);
        this.land();
        this._complete();
      }
      update(): void {}
      protected onSkip(): void {}
    }
    const instant: InstantProfile = { ...PROFILE, name: 'instant', bounceDistance: 0, slideMs: 90 };
    // `register` accepts the class as-is: the profile parameter is inferred
    // from the constructor, no cast at the seam.
    const { reelSet, ticker } = build((f) => f.register('stop', SlidingStopPhase), instant);
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin);
    expect(seen).toEqual([90, 90, 90]);
    reelSet.destroy();
    ticker.destroy();
  });
});
