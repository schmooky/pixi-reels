/**
 * Steps: the built-in phases run a named list, and a game edits that list by
 * re-registering the same class with `{ steps }`.
 *
 * What has to hold: an inserted step runs where it was put and is waited on;
 * a replaced step replaces; a removed step is gone; a `cut` step is skipped
 * by a quicken and the rest still play; a slam cancels the step in flight;
 * a stale name fails loud; an instant step chains without a microtask, so a
 * reel with no start delay begins to move inside `spin()` as it always did.
 */
import type { Ticker } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { StartPhase } from '../../src/spin/phases/StartPhase.js';
import { StopPhase } from '../../src/spin/phases/StopPhase.js';
import { ReelPhase } from '../../src/spin/phases/ReelPhase.js';
import { step, insertAfter, insertBefore, replaceStep, removeStep, runStep } from '../../src/spin/phases/steps.js';
import type { PhaseStep, StepContext } from '../../src/spin/phases/steps.js';
import type { StopPhaseConfig } from '../../src/spin/phases/StopPhase.js';
import type { PhaseFactory } from '../../src/spin/phases/PhaseFactory.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ReelSet } from '../../src/index.js';

const PROFILE: SpeedProfile = {
  name: 'steps',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 300,
  anticipationDelay: 0,
  bounceDistance: 12,
  bounceDuration: 200,
  accelerationDuration: 60,
  minimumSpinTime: 0,
};

const RESULT = [{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'b', 'b'] }];

function build(phases: (f: PhaseFactory) => void, profile: SpeedProfile = PROFILE): { reelSet: ReelSet; ticker: FakeTicker } {
  const ticker = new FakeTicker();
  const reelSet = new ReelSetBuilder()
    .reels(2)
    .visibleCells(3)
    .symbolSize(80, 80)
    .symbols((r) => {
      r.register('a', HeadlessSymbol, {});
      r.register('b', HeadlessSymbol, {});
    })
    .speed(profile.name, profile)
    .initialSpeed(profile.name)
    .phases(phases)
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

describe("f.register('stop', StopPhase, { steps })", () => {
  it('runs an inserted step where it was put, and waits for it', async () => {
    const order: string[] = [];
    const { reelSet, ticker } = build((f) =>
      f.register('stop', StopPhase, {
        steps: (steps) => insertAfter(
          steps,
          'land',
          step('flash', (ctx) => {
            order.push(`flash:${ctx.reel.reelIndex}`);
            // A promise step: the bounce must not start until it settles.
            return new Promise<void>((resolve) => setTimeout(() => {
              order.push(`flashed:${ctx.reel.reelIndex}`);
              resolve();
            }, 40));
          }),
        ),
      }),
    );
    reelSet.reels[0].events.on('landing', () => order.push('landing:0'));
    reelSet.reels[0].events.on('landed', () => order.push('landed:0'));
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin);
    const reel0 = order.filter((e) => e.endsWith(':0'));
    expect(reel0).toEqual(['landing:0', 'flash:0', 'flashed:0', 'landed:0']);
    reelSet.destroy();
    ticker.destroy();
  });

  it('replaces a step and removes one', async () => {
    const bounces: number[] = [];
    const { reelSet, ticker } = build((f) => {
      f.register('stop', StopPhase, {
        steps: (steps) => replaceStep(
          steps,
          'bounce',
          step('bounce', (ctx) => {
            bounces.push(ctx.reel.reelIndex);
            return ctx.phase.bounce({ duration: 40 });
          }),
        ),
      });
      f.register('start', StartPhase, { steps: (steps) => removeStep(steps, 'pull') });
    });
    let minSpeed = Infinity;
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin, () => {
      for (const reel of reelSet.reels) minSpeed = Math.min(minSpeed, reel.speed);
    });
    expect(bounces.sort()).toEqual([0, 1]);
    // No pull: the reel never ran backwards.
    expect(minSpeed).toBeGreaterThanOrEqual(0);
    for (const reel of reelSet.reels) expect(reel.container.y).toBe(0);
    reelSet.destroy();
    ticker.destroy();
  });

  it('fails loud on a step name the phase does not have', () => {
    const steps: PhaseStep[] = [step('one', () => {}), step('two', () => {})];
    expect(() => insertBefore(steps, 'three', step('x', () => {}))).toThrow(/no step named 'three'.*one, two/);
    expect(() => removeStep(steps, 'nope')).toThrow(/no step named 'nope'/);
    expect(insertAfter(steps, 'one', step('x', () => {})).map((s) => s.name)).toEqual(['one', 'x', 'two']);
  });

  it('begins to move inside spin() when there is no start delay, as before', () => {
    const { reelSet, ticker } = build(() => {});
    let launched = false;
    reelSet.reels[0].symbols[1].resetLanding = () => { launched = true; };
    void reelSet.spin();
    // `delay` is instant at 0 ms and `launch` chains synchronously, so
    // `beginMotion` (which resets every symbol's landing) has already run.
    expect(launched).toBe(true);
    reelSet.setResult(RESULT);
    reelSet.slamStop();
    reelSet.destroy();
    ticker.destroy();
  });
});

describe('a custom phase on runSteps()', () => {
  class ScriptedStop extends ReelPhase<StopPhaseConfig> {
    readonly name = 'stop';
    readonly skippable = true;
    override readonly quickenable = true;
    static log: string[] = [];
    protected onEnter(config: StopPhaseConfig): void {
      const reel = this.reel;
      this.runSteps([
        step('hold', (ctx) => ctx.wait(400), { cut: true }),
        step('place', () => {
          reel.forceSpeed(0);
          reel.placeStrip(config.targetFrame);
          ScriptedStop.log.push(`place:${reel.reelIndex}`);
        }),
        step('land', () => {
          this.land();
          ScriptedStop.log.push(`land:${reel.reelIndex}`);
        }),
      ]);
    }
    update(): void {
      this.tickSteps();
    }
    protected onSkip(): void {
      ScriptedStop.log.push(`skip:${this.reel.reelIndex}`);
    }
  }

  it('skips a cut step on a quicken and plays the rest', async () => {
    ScriptedStop.log = [];
    const { reelSet, ticker } = build((f) => f.register('stop', ScriptedStop));
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    const pressed = performance.now();
    // Every reel is in SPIN; the quicken reaches the stop phase as it is created.
    reelSet.requestSkip({ mode: 'quicken' });
    await pump(ticker, spin);
    // The 400 ms hold was skipped on both reels: placed and landed within it.
    expect(performance.now() - pressed).toBeLessThan(400);
    expect(ScriptedStop.log.filter((e) => e.startsWith('place'))).toHaveLength(2);
    expect(ScriptedStop.log.filter((e) => e.startsWith('land'))).toHaveLength(2);
    reelSet.destroy();
    ticker.destroy();
  });

  it('never starts a cut step when the stop is created for a reel already quickened', async () => {
    // Before the press reaches a stop that exists, the runner is primed: a
    // `cut` wait is skipped outright, not started and cut a moment later.
    let holdStarted = 0;
    class CountingStop extends ScriptedStop {
      protected override onEnter(config: StopPhaseConfig): void {
        const reel = this.reel;
        ScriptedStop.log.push(`enter:${reel.reelIndex}`);
        this.runSteps([
          step('hold', (ctx) => { holdStarted++; return ctx.wait(400); }, { cut: true }),
          step('place', () => { reel.forceSpeed(0); reel.placeStrip(config.targetFrame); }),
          // A beat that is not a wait, so the phase is still running when
          // the controller asks it after `run()`.
          step('settle', (ctx) => ctx.wait(30)),
          step('land', () => this.land()),
        ]);
      }
    }
    ScriptedStop.log = [];
    const { reelSet, ticker } = build((f) => f.register('stop', CountingStop));
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    reelSet.requestSkip({ mode: 'quicken' });
    await pump(ticker, spin);
    expect(holdStarted).toBe(0);
    // `onSkip` still ran on both reels, and after `onEnter`.
    for (const i of [0, 1]) {
      const enter = ScriptedStop.log.indexOf(`enter:${i}`);
      const skip = ScriptedStop.log.indexOf(`skip:${i}`);
      expect(enter).toBeGreaterThanOrEqual(0);
      expect(skip).toBeGreaterThan(enter);
    }
    reelSet.destroy();
    ticker.destroy();
  });

  it('cancels the step in flight on a slam, then runs the pose', async () => {
    ScriptedStop.log = [];
    let aborted = 0;
    class AbortAwareStop extends ScriptedStop {
      protected override onEnter(config: StopPhaseConfig): void {
        this.runSteps([
          step('hold', (ctx) => new Promise<void>((resolve) => {
            ctx.signal.addEventListener('abort', () => {
              aborted += 1;
              resolve();
            });
          })),
          step('place', () => this.reel.placeStrip(config.targetFrame)),
        ]);
      }
    }
    const { reelSet, ticker } = build((f) => f.register('stop', AbortAwareStop));
    let inStop = 0;
    for (const reel of reelSet.reels) {
      reel.events.on('phase:enter', (name) => { if (name === 'stop') inStop += 1; });
    }
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    // Into the stop phases (the hold never ends on its own). GSAP runs the
    // start ramp on the real clock, so wait for the phases rather than count.
    for (let i = 0; i < 2000 && inStop < 2; i++) {
      ticker.tick(16);
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(inStop).toBe(2);
    reelSet.slamStop();
    expect(aborted).toBe(2);
    expect(ScriptedStop.log.filter((e) => e.startsWith('skip'))).toHaveLength(2);
    // `place` never ran: the runner stopped at the cancelled step.
    expect(ScriptedStop.log.filter((e) => e.startsWith('place'))).toHaveLength(0);
    await spin;
    reelSet.destroy();
    ticker.destroy();
  });
});

describe('runStep()', () => {
  const ctx = {} as Omit<StepContext, 'signal'>;

  it('settles at once for an instant step, and reports it', async () => {
    const running = runStep(() => {}, ctx);
    expect(running.settled).toBe(true);
    await expect(running.done).resolves.toBeUndefined();
  });

  it('aborts a promise step through the signal and settles', async () => {
    let signalled = false;
    const running = runStep(
      (c) => new Promise<void>((resolve) => {
        c.signal.addEventListener('abort', () => {
          signalled = true;
          resolve();
        });
      }),
      ctx,
    );
    expect(running.settled).toBe(false);
    running.cancel();
    expect(signalled).toBe(true);
    await expect(running.done).resolves.toBeUndefined();
    expect(running.settled).toBe(true);
  });

  it('cancels a cancellable result through its own cancel()', async () => {
    let cancelled = false;
    const running = runStep(() => ({ done: new Promise<void>(() => {}), cancel: () => { cancelled = true; } }), ctx);
    running.cancel();
    expect(cancelled).toBe(true);
    await expect(running.done).resolves.toBeUndefined();
  });
});
