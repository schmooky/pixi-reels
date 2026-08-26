/**
 * The four phase-extension patterns the docs and recipes teach, run against
 * the real engine.
 *
 * These exist because the failure mode is silent and total: a phase that never
 * reaches `_complete()` leaves its reel un-landed forever, so the spin promise
 * never settles and the game hangs with no error anywhere. A parse check
 * cannot see it and a mounted demo does not exercise it. Each test below
 * awaits the spin, so a pattern that cannot finish fails as a timeout rather
 * than shipping.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestReelSet } from '../../src/testing/index.js';
import { ReelPhase } from '../../src/spin/phases/ReelPhase.js';
import { SpinPhase } from '../../src/spin/phases/SpinPhase.js';
import { AnticipationPhase } from '../../src/spin/phases/AnticipationPhase.js';
import { CascadeDropInPhase } from '../../src/spin/phases/CascadeDropInPhase.js';
import { resolveTumbleConfig } from '../../src/cascade/TumbleConfig.js';
import { SpeedPresets } from '../../src/config/SpeedPresets.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ColumnTarget } from '../../src/frame/ColumnTarget.js';
import type { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';

const FAST: SpeedProfile = {
  name: 'fast',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 120,
  bounceDistance: 0,
  bounceDuration: 20,
  accelerationEase: 'power1.in',
  decelerationEase: 'power1.out',
  accelerationDuration: 20,
  minimumSpinTime: 0,
};

const GRID: ColumnTarget[] = Array.from({ length: 5 }, () => ({ visible: ['a', 'b', 'c'] }));

function makeHarness(phases: (f: PhaseFactory) => void, tumble = false) {
  const h = createTestReelSet({
    reels: 5,
    visibleCells: 3,
    symbolIds: ['a', 'b', 'c'],
    ...(tumble ? { tumble: {} } : {}),
    phases,
  });
  if (!tumble) {
    h.reelSet.speed.addProfile(FAST.name, FAST);
    h.reelSet.setSpeed(FAST.name);
  }
  const pump = setInterval(() => h.ticker.tick(16), 16);
  const landed: number[] = [];
  h.reelSet.events.on('spin:reelLanded', (i) => { if (!landed.includes(i)) landed.push(i); });
  return { ...h, landed, stopPump: () => clearInterval(pump) };
}

describe('phase extension patterns', () => {
  let active: ReturnType<typeof makeHarness> | null = null;

  afterEach(() => {
    if (active) {
      active.stopPump();
      active.destroy();
      active = null;
    }
  });

  it('a from-scratch ReelPhase can own a lifecycle key and finish the spin', async () => {
    // The `phase-from-scratch-start` recipe, minus the PixiJS dressing: a flat
    // linear ramp replacing StartPhase, driven entirely off `update(deltaMs)`.
    const ramped: number[] = [];
    class LinearStartPhase extends ReelPhase<{ spinningMode: unknown; delay?: number }> {
      readonly name = 'start';
      readonly skippable = true;
      private _elapsed = 0;
      private _waited = 0;
      private _delay = 0;
      private _launched = false;

      protected onEnter(config: { spinningMode: unknown; delay?: number }): void {
        this._elapsed = 0;
        this._waited = 0;
        this._delay = config.delay ?? 0;
        this._launched = false;
        (this.reel as unknown as { spinningMode: unknown }).spinningMode = config.spinningMode;
        this.reel.speed = 0;
      }

      update(deltaMs: number): void {
        if (this._waited < this._delay) { this._waited += deltaMs; return; }
        if (!this._launched) { this._launched = true; this.reel.beginMotion(); }
        this._elapsed += deltaMs;
        const t = Math.min(1, this._elapsed / 200);
        this.reel.speed = this._speed.spinSpeed * t;
        if (t >= 1) {
          ramped.push(this.reel.reelIndex);
          this.reel.notifySpinStart();
          this._complete();
        }
      }

      protected onSkip(): void {
        this.reel.speed = this._speed.spinSpeed;
        this.reel.notifySpinStart();
      }
    }

    const h = (active = makeHarness((f) => f.register('start', LinearStartPhase)));
    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p;

    // Every reel ramped through the custom phase AND every reel landed. the
    // second half is what proves `_complete()` was reached.
    expect([...ramped].sort()).toEqual([0, 1, 2, 3, 4]);
    expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('a SpinPhase subclass can set a per-reel floor through the config', async () => {
    const floorFor = (i: number) => i * 120;
    class StaircaseSpinPhase extends SpinPhase {
      protected onEnter(config: { minimumSpinTime?: number }): void {
        // Merge, don't replace. the recipe says so and this pins it.
        super.onEnter({ ...config, minimumSpinTime: floorFor(this.reel.reelIndex) });
      }
    }

    const h = (active = makeHarness((f) => f.register('spin', StaircaseSpinPhase)));
    const at = new Map<number, number>();
    h.reelSet.events.on('spin:reelLanded', (i) => { if (!at.has(i)) at.set(i, performance.now()); });

    const p = h.reelSet.spin();
    const t0 = performance.now();
    h.reelSet.setResult(GRID);
    await p;

    // Reel 0 has no floor; reel 4's is 480ms and it cannot land before it.
    expect(at.get(0)! - t0).toBeLessThan(300);
    expect(at.get(4)! - t0).toBeGreaterThan(400);
  });

  it('a slam collapses the subclass staircase, by design', async () => {
    // The floor governs NATURAL landings. A slam force-completes every phase
    // and places the result, so it ignores `minimumSpinTime` however that
    // floor was set - profile, `setMinimumSpinTime`, or a `SpinPhase`
    // subclass. Worth pinning because a demo that shows a per-reel staircase
    // looks broken when a stray skip press flattens it, and the flat reading
    // is the correct one.
    const floorFor = (i: number) => i * 400;
    class StaircaseSpinPhase extends SpinPhase {
      protected onEnter(config: { minimumSpinTime?: number }): void {
        super.onEnter({ ...config, minimumSpinTime: floorFor(this.reel.reelIndex) });
      }
    }

    const h = (active = makeHarness((f) => f.register('spin', StaircaseSpinPhase)));
    const at = new Map<number, number>();
    h.reelSet.events.on('spin:reelLanded', (i) => { if (!at.has(i)) at.set(i, performance.now()); });

    const p = h.reelSet.spin();
    const t0 = performance.now();
    h.reelSet.setResult(GRID);
    await new Promise((r) => setTimeout(r, 150));
    h.reelSet.slamStop();
    await p;

    // Reel 4's own floor is 1600ms; the slam lands it in a fraction of that,
    // together with reel 0, which has no floor at all.
    const spread = Math.max(...at.values()) - Math.min(...at.values());
    expect(at.get(4)! - t0).toBeLessThan(600);
    expect(spread).toBeLessThan(100);
  });

  it('an AnticipationPhase subclass sees update() and onSkip()', async () => {
    let ticks = 0;
    let skipped = 0;
    class CountdownAnticipationPhase extends AnticipationPhase {
      update(deltaMs: number): void {
        super.update(deltaMs);
        ticks += 1;
      }
      protected onSkip(): void {
        skipped += 1;
        super.onSkip();
      }
    }

    const h = (active = makeHarness((f) => f.register('anticipation', CountdownAnticipationPhase)));
    const p = h.reelSet.spin();
    h.reelSet.setAnticipation([3, 4], { duration: 400 });
    h.reelSet.setResult(GRID);

    await new Promise((r) => setTimeout(r, 150));
    expect(ticks).toBeGreaterThan(0);

    // A slam force-completes the phase, which is the path `onSkip` covers.
    h.reelSet.slamStop();
    await p;
    expect(skipped).toBeGreaterThan(0);
  });

  it('a cascade subclass registered with registerFactory + resolveTumbleConfig runs', async () => {
    const resolved = resolveTumbleConfig({});
    let built = 0;
    class CountingDropInPhase extends CascadeDropInPhase {
      constructor(...args: ConstructorParameters<typeof CascadeDropInPhase>) {
        super(...args);
        built += 1;
      }
    }

    const h = (active = makeHarness(
      (f) =>
        f.registerFactory(
          'cascade:dropIn',
          (reel, speed) => new CountingDropInPhase(reel, speed, resolved.dropIn, resolved.gravity),
        ),
      true,
    ));

    const p = h.reelSet.spin();
    h.reelSet.setResult(GRID);
    await p;

    expect(built).toBe(5);
    expect([...h.landed].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
