/**
 * The acceleration-bounded motion model.
 *
 * `stepDrive` is a function of (speed, target, bounds, dt) alone - it writes
 * the answer into the state it is handed rather than allocating, but the answer
 * depends on nothing else - which is what lets the laws below be stated
 * directly rather than inferred from a rendered reel. The point of the whole model is the second derivative: an ease applied
 * to a SPEED steps the acceleration, a drive bounds it.
 */
import { describe, it, expect } from 'vitest';
import {
  stepDrive,
  resolveDriveConfig,
  assertDriveConfig,
  DRIVE_FRAME_MS,
  type ReelDriveState,
} from '../../src/core/ReelDrive.js';

const BOUNDS = { accel: 2, decel: 1, jerk: 0 };

/** Run the drive to arrival (or `maxTicks`), returning every state it passed. */
function run(
  from: number,
  target: number,
  bounds: { accel: number; decel: number; jerk: number },
  dtMs = DRIVE_FRAME_MS,
  maxTicks = 2000,
): ReelDriveState[] {
  const state: ReelDriveState = { speed: from, accel: 0 };
  // `stepDrive` writes into the state it is given (it runs per reel per frame,
  // so it does not allocate). A trace therefore has to snapshot each tick.
  const trace: ReelDriveState[] = [{ ...state }];
  for (let i = 0; i < maxTicks; i++) {
    stepDrive(state, target, bounds, dtMs);
    trace.push({ ...state });
    if (state.speed === target) break;
  }
  return trace;
}

describe('resolveDriveConfig', () => {
  it('defaults decel to accel and jerk to unbounded', () => {
    expect(resolveDriveConfig({ accel: 3 })).toEqual({ accel: 3, decel: 3, jerk: 0 });
  });

  it.each([
    ['accel', { accel: 0 }, /accel must be a positive/],
    ['accel', { accel: Number.NaN }, /accel must be a positive/],
    ['decel', { accel: 1, decel: -1 }, /decel must be a positive/],
    ['jerk', { accel: 1, jerk: -1 }, /jerk must be a non-negative/],
  ])('rejects a bad %s at config time, not at first tick', (_field, config, message) => {
    expect(() => resolveDriveConfig(config)).toThrow(message);
  });
});

describe('stepDrive', () => {
  it('never changes speed faster than the acceleration bound allows', () => {
    const trace = run(0, 30, BOUNDS);
    for (let i = 1; i < trace.length; i++) {
      const dv = Math.abs(trace[i].speed - trace[i - 1].speed);
      // One frame of dt, so the per-tick budget is the bound itself.
      expect(dv).toBeLessThanOrEqual(BOUNDS.accel + 1e-9);
    }
  });

  it('uses accel speeding up and decel slowing down', () => {
    const up = run(0, 20, BOUNDS);
    const down = run(20, 0, BOUNDS);
    // decel is half of accel, so coming back down takes about twice as long.
    expect(up.length).toBe(11);
    expect(down.length).toBe(21);
  });

  it('picks the bound off absolute speed, so a reverse pull still accelerates', () => {
    // StartPhase drives the speed NEGATIVE for its step-back pull. Going from 0
    // to -2 is speeding up, not slowing down, and must use `accel`.
    const trace = run(0, -2, BOUNDS);
    expect(trace.length).toBe(2);
  });

  it('arrives exactly on the target rather than oscillating around it', () => {
    const trace = run(0, 7.3, BOUNDS);
    expect(trace[trace.length - 1].speed).toBe(7.3);
    expect(trace[trace.length - 1].accel).toBe(0);
  });

  it('is frame-rate independent: the same elapsed time gives the same speed', () => {
    const fine = run(0, 30, BOUNDS, DRIVE_FRAME_MS / 4);
    const coarse = run(0, 30, BOUNDS, DRIVE_FRAME_MS);
    // 15 frames of headroom either way; both reach 30 after the same ~15 frames.
    const fineFrames = (fine.length - 1) / 4;
    const coarseFrames = coarse.length - 1;
    expect(Math.abs(fineFrames - coarseFrames)).toBeLessThanOrEqual(1);
  });

  it('is a no-op for a non-positive dt', () => {
    const state = { speed: 5, accel: 1 };
    expect(stepDrive(state, 30, BOUNDS, 0)).toBe(state);
    expect(stepDrive(state, 30, BOUNDS, -16)).toBe(state);
  });

  it('reports arrival immediately when already at the target', () => {
    expect(stepDrive({ speed: 12, accel: 3 }, 12, BOUNDS, DRIVE_FRAME_MS)).toEqual({
      speed: 12,
      accel: 0,
    });
  });

  it('follows a retarget mid-move without a discontinuity', () => {
    // The interruption story: no tween to kill, so the speed stays continuous.
    let state: ReelDriveState = { speed: 0, accel: 0 };
    for (let i = 0; i < 5; i++) state = stepDrive(state, 30, BOUNDS, DRIVE_FRAME_MS);
    const atSwitch = state.speed;
    const next = stepDrive(state, 0, BOUNDS, DRIVE_FRAME_MS);
    expect(Math.abs(next.speed - atSwitch)).toBeLessThanOrEqual(BOUNDS.decel + 1e-9);
  });
});

describe('stepDrive with a jerk bound', () => {
  const JERKY = { accel: 2, decel: 2, jerk: 0.25 };

  it('ramps the acceleration instead of stepping it', () => {
    const trace = run(0, 30, JERKY);
    // Without jerk the first tick is already at full acceleration; with it, the
    // acceleration climbs. That difference IS the pedal feel.
    expect(trace[1].accel).toBeLessThan(JERKY.accel);
    expect(trace[1].accel).toBeCloseTo(JERKY.jerk, 6);
    expect(trace[2].accel).toBeGreaterThan(trace[1].accel);
  });

  it('keeps the acceleration change inside the jerk bound on every tick', () => {
    const trace = run(0, 30, JERKY);
    for (let i = 1; i < trace.length - 1; i++) {
      const da = Math.abs(trace[i].accel - trace[i - 1].accel);
      expect(da).toBeLessThanOrEqual(JERKY.jerk + 1e-9);
    }
  });

  it('eases off early enough to arrive without a hard stop', () => {
    const trace = run(0, 30, JERKY);
    const peak = Math.max(...trace.map((s) => s.accel));
    const beforeArrival = trace[trace.length - 2].accel;
    // The acceleration comes back down on approach rather than being cut off
    // at its peak the instant the target is reached.
    expect(beforeArrival).toBeLessThan(peak);
  });

  it('never overshoots the target', () => {
    for (const target of [30, 7.5, 0.4]) {
      const trace = run(0, target, JERKY);
      expect(Math.max(...trace.map((s) => s.speed))).toBeLessThanOrEqual(target + 1e-9);
    }
  });

  it('never overshoots on the way down either', () => {
    const trace = run(30, 2, JERKY);
    expect(Math.min(...trace.map((s) => s.speed))).toBeGreaterThanOrEqual(2 - 1e-9);
  });
});

describe('profile-relative drive bounds', () => {
  it('resolves accelFrames against the profile it is given', () => {
    // The whole point: the same config produces a harder bound for a faster
    // profile, so a Turbo does not start SLOWER than Normal.
    expect(resolveDriveConfig({ accelFrames: 20 }, 30)).toEqual({
      accel: 1.5,
      decel: 1.5,
      jerk: 0,
    });
    expect(resolveDriveConfig({ accelFrames: 20 }, 80)).toEqual({
      accel: 4,
      decel: 4,
      jerk: 0,
    });
  });

  it('defaults decelFrames to accelFrames and leaves jerk off', () => {
    expect(resolveDriveConfig({ accelFrames: 10, jerkFrames: 100 }, 50)).toEqual({
      accel: 5,
      decel: 5,
      jerk: 0.5,
    });
  });

  it('refuses to resolve a relative config without a profile speed', () => {
    expect(() => resolveDriveConfig({ accelFrames: 20 })).toThrow(/spinSpeed to resolve against/);
  });

  it('refuses to mix the relative and absolute forms', () => {
    expect(() => assertDriveConfig({ accelFrames: 20, decel: 1 })).toThrow(/not both/);
  });

  it('refuses an empty config', () => {
    expect(() => assertDriveConfig({})).toThrow(/acceleration bound is required/);
  });

  it.each(['accelFrames', 'decelFrames', 'jerkFrames'])('refuses a non-positive %s', (field) => {
    expect(() => assertDriveConfig({ accelFrames: 20, [field]: 0 })).toThrow(
      /positive number of frames/,
    );
  });

  it('still accepts and validates the absolute form', () => {
    expect(resolveDriveConfig({ accel: 2 })).toEqual({ accel: 2, decel: 2, jerk: 0 });
    expect(() => assertDriveConfig({ accel: -1 })).toThrow(/positive number of px/);
  });
});
