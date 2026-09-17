/**
 * Phase moves: the animated beats of the built-in phases, replaceable per
 * set through `builder.moves()` without replacing the phase.
 *
 * `StartPhase` plays `start.pull` and `start.accelerate`, `StopPhase` (and
 * `ReelPhase.bounce()`) plays `stop.bounce`, the legacy tease plays
 * `anticipation.slowdown`. A move gets the reel, the profile, the numbers the
 * default uses and an abort signal; it returns a gsap animation, a promise or
 * nothing. `null` removes a beat.
 */
import type { Ticker } from 'pixi.js';
import { describe, it, expect } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';
import { defaultMoves, resolveMoves, runMove } from '../../src/spin/phases/moves.js';
import type { BounceMoveContext, PhaseMoves, PullMoveContext } from '../../src/spin/phases/moves.js';
import type { SpeedProfile } from '../../src/config/types.js';
import type { ReelSet } from '../../src/index.js';

const PROFILE: SpeedProfile = {
  name: 'moves',
  spinDelay: 0,
  spinSpeed: 30,
  stopDelay: 0,
  anticipationDelay: 0,
  bounceDistance: 12,
  bounceDuration: 200,
  accelerationDuration: 60,
  minimumSpinTime: 0,
};

const RESULT = [{ visible: ['a', 'b', 'a'] }, { visible: ['b', 'b', 'b'] }];

function build(moves: PhaseMoves, profile: SpeedProfile = PROFILE): { reelSet: ReelSet; ticker: FakeTicker } {
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
    .moves(moves)
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

describe('builder.moves()', () => {
  it('plays a replaced bounce with the numbers the default would have used', async () => {
    const seen: Array<Pick<BounceMoveContext, 'distance' | 'duration' | 'ease' | 'base'>> = [];
    const { reelSet, ticker } = build({
      stop: {
        bounce: (ctx) => {
          seen.push({ distance: ctx.distance, duration: ctx.duration, ease: ctx.ease, base: ctx.base });
          // Half the default's time, one leg only: a custom beat.
          return ctx.gsap.to(ctx.reel.container, {
            [ctx.reel.axis.mainProp]: ctx.base,
            duration: ctx.duration / 4000,
            onUpdate: ctx.followLifted,
          });
        },
      },
    });
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin);
    expect(seen).toEqual([
      { distance: 12, duration: 200, ease: 'power1.out', base: 0 },
      { distance: 12, duration: 200, ease: 'power1.out', base: 0 },
    ]);
    for (const reel of reelSet.reels) expect(reel.container.y).toBe(0);
    reelSet.destroy();
    ticker.destroy();
  });

  it('removes a beat with null: no pull means the reel never runs backwards', async () => {
    const { reelSet, ticker } = build({ start: { pull: null } });
    let minSpeed = Infinity;
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin, () => {
      for (const reel of reelSet.reels) minSpeed = Math.min(minSpeed, reel.speed);
    });
    expect(minSpeed).toBeGreaterThanOrEqual(0);
    reelSet.destroy();
    ticker.destroy();

    // With the default pull the same profile (it bounces) dips below zero.
    const withPull = build({});
    minSpeed = Infinity;
    const spin2 = withPull.reelSet.spin();
    withPull.reelSet.setResult(RESULT);
    await pump(withPull.ticker, spin2, () => {
      for (const reel of withPull.reelSet.reels) minSpeed = Math.min(minSpeed, reel.speed);
    });
    expect(minSpeed).toBeLessThan(0);
    withPull.reelSet.destroy();
    withPull.ticker.destroy();
  });

  it('a removed accelerate jumps to spin speed at once, and a pull still plays first', async () => {
    const pulls: number[] = [];
    const { reelSet, ticker } = build({
      start: {
        pull: (ctx: PullMoveContext) => {
          pulls.push(ctx.pullSpeed);
        },
        accelerate: null,
      },
    });
    let sawFullSpeed = false;
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    await pump(ticker, spin, () => {
      if (reelSet.reels[0].speed === PROFILE.spinSpeed) sawFullSpeed = true;
    });
    expect(pulls).toEqual([-2, -2]);
    expect(sawFullSpeed).toBe(true);
    reelSet.destroy();
    ticker.destroy();
  });

  it('aborts a promise-returning move through its signal when a slam cuts it', async () => {
    let aborted = false;
    const { reelSet, ticker } = build({
      start: {
        // No pull, so the accelerate is the beat in flight when the slam lands.
        pull: null,
        accelerate: (ctx) =>
          new Promise<void>((resolve) => {
            ctx.signal.addEventListener('abort', () => {
              aborted = true;
              resolve();
            });
          }),
      },
    });
    const spin = reelSet.spin();
    reelSet.setResult(RESULT);
    // The accelerate never finishes on its own; the slam has to cut it.
    ticker.tick(16);
    reelSet.slamStop();
    expect(aborted).toBe(true);
    await spin;
    reelSet.destroy();
    ticker.destroy();
  });
});

describe('resolveMoves() and runMove()', () => {
  it('keeps every default a caller leaves out and honours null', () => {
    const custom = (): void => {};
    const resolved = resolveMoves({ start: { pull: null }, stop: { bounce: custom } });
    expect(resolved.start.pull).toBeNull();
    expect(resolved.start.accelerate).toBe(defaultMoves.start.accelerate);
    expect(resolved.stop.bounce).toBe(custom);
    expect(resolved.anticipation.slowdown).toBe(defaultMoves.anticipation.slowdown);
  });

  it('settles at once for a null or instant move, and cancels a promise through the signal', async () => {
    const instant = runMove(null, {} as never);
    await expect(instant.done).resolves.toBeUndefined();

    let signalled = false;
    const running = runMove(
      (ctx) =>
        new Promise<void>((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            signalled = true;
            resolve();
          });
        }),
      {} as never,
    );
    running.cancel();
    expect(signalled).toBe(true);
    await expect(running.done).resolves.toBeUndefined();
  });
});
