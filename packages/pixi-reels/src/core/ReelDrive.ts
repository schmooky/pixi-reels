/**
 * Nominal frame length in ms. `Reel.speed` is pixels per FRAME, not per
 * millisecond, so a drive expressed in px/frame^2 has to know what a frame is
 * worth in order to integrate against a real `deltaMs`. 60fps, matching the
 * unit the speed profiles are already written in.
 */
export const DRIVE_FRAME_MS = 1000 / 60;

/** Speeds closer together than this count as arrived. */
const DRIVE_EPS = 1e-4;

/**
 * Acceleration bounds for a reel under the `'drive'` motion model.
 *
 * The default model tweens `reel.speed` directly, so every speed change is
 * shaped by whatever ease the phase picked. An ease applied to a SPEED is a
 * step in acceleration: `power2.out` puts peak deceleration on the first frame
 * and decays from there, which reads as the setting changing rather than the
 * reel slowing down. Bounding acceleration instead is the physical model - the
 * reel can only change speed so fast, whatever it is asked for, and every
 * transition inherits the same feel without being individually authored.
 *
 * The bounds come in two flavours, and you must pick one:
 *
 * **Profile-relative** (`accelFrames`, recommended). "Reach the ACTIVE
 * profile's full spin speed in N frames." Re-resolved every spin against
 * whatever profile is running, so Turbo accelerates harder than Normal in
 * proportion to how much faster it spins.
 *
 * **Absolute** (`accel`). Fixed px/frame^2 at {@link DRIVE_FRAME_MS}, ignoring
 * the profile. Only correct for a single-profile game: the presets ship
 * `spinSpeed` 30 / 50 / 80, so one absolute bound makes SuperTurbo take 53
 * frames to reach speed where Normal takes 20 - a turbo that starts SLOWER
 * than normal, which is the opposite of the intent.
 *
 * Mixing the two forms throws.
 */
export interface ReelDriveConfig {
  /**
   * Frames from rest to the active profile's full spin speed. `20` is a
   * reasonable starting point (~330ms at 60fps). Profile-relative: prefer this
   * over {@link accel} in any game with more than one speed profile.
   */
  accelFrames?: number;
  /**
   * Frames to shed a full spin speed when slowing. Defaults to
   * {@link accelFrames}. Larger = softer stops.
   */
  decelFrames?: number;
  /**
   * Jerk limit, expressed as `spinSpeed / jerkFrames`. Larger = gentler
   * S-curve. Omit for a snappier, more mechanical response. See {@link jerk}.
   */
  jerkFrames?: number;

  /** Max acceleration when the target speed is FASTER than the current one, px/frame^2. */
  accel?: number;
  /** Max deceleration when the target is SLOWER. Defaults to `accel`. */
  decel?: number;
  /**
   * Optional bound on how fast the acceleration itself may change, px/frame^3.
   *
   * Without it, acceleration steps to its bound the instant a new target
   * arrives - smoother than an ease on speed, but still a hard edge at the
   * start of every move. With it, the acceleration ramps too, which is the
   * S-curve: the pedal goes down over time instead of being stamped. The drive
   * starts easing off early enough to arrive without overshoot (it compares the
   * remaining speed gap against `accel^2 / (2 * jerk)`, the speed it would still
   * gain while returning the acceleration to zero).
   *
   * Leave unset for a snappier, more mechanical response.
   */
  jerk?: number;
}

/** Acceleration bounds with every default filled in. px/frame^2, px/frame^3. */
export interface ResolvedDriveConfig {
  accel: number;
  decel: number;
  jerk: number;
}

/** A drive's live state. Owned by `Reel`; stepped once per tick. */
export interface ReelDriveState {
  /** Current speed, px/frame. Mirrors `reel.speed`. */
  speed: number;
  /** Current acceleration, px/frame^2. Only non-zero while jerk-limited. */
  accel: number;
}

/** True when `config` expresses its bounds relative to the active profile. */
export function isRelativeDriveConfig(config: ReelDriveConfig): boolean {
  return (
    config.accelFrames != null || config.decelFrames != null || config.jerkFrames != null
  );
}

function positiveFrames(value: unknown, field: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(
      `motionModel('drive'): ${field} must be a positive number of frames, got ${String(value)}.`,
    );
  }
  return value as number;
}

/**
 * Check a drive config's SHAPE without needing a speed profile.
 *
 * Called from the builder so a bad number names the `motionModel(...)` call
 * that produced it, rather than surfacing three phases later as a motionless
 * reel. The relative form cannot be turned into numbers until a profile is
 * known, so this validates what it can and {@link resolveDriveConfig} does the
 * rest per spin.
 */
export function assertDriveConfig(config: ReelDriveConfig): void {
  const relative = isRelativeDriveConfig(config);
  const absolute = config.accel != null || config.decel != null || config.jerk != null;
  if (relative && absolute) {
    throw new Error(
      "motionModel('drive'): pass EITHER the profile-relative bounds " +
        '(accelFrames/decelFrames/jerkFrames) OR the absolute ones (accel/decel/jerk), ' +
        'not both. The relative form rescales itself per speed profile; mixing the two ' +
        'would leave half the drive pinned to one profile.',
    );
  }
  if (!relative && !absolute) {
    throw new Error(
      "motionModel('drive'): an acceleration bound is required, e.g. " +
        '{ accelFrames: 20 } (frames from rest to the active profile\'s spin speed).',
    );
  }
  if (relative) {
    positiveFrames(config.accelFrames, 'accelFrames');
    if (config.decelFrames != null) positiveFrames(config.decelFrames, 'decelFrames');
    if (config.jerkFrames != null) positiveFrames(config.jerkFrames, 'jerkFrames');
    return;
  }
  resolveDriveConfig(config);
}

/**
 * Turn a drive config into concrete bounds.
 *
 * @param config    The builder's config.
 * @param spinSpeed The ACTIVE profile's full spin speed, px/frame. Required for
 *                  the profile-relative form; ignored by the absolute one.
 */
export function resolveDriveConfig(
  config: ReelDriveConfig,
  spinSpeed?: number,
): ResolvedDriveConfig {
  if (isRelativeDriveConfig(config)) {
    if (!Number.isFinite(spinSpeed) || (spinSpeed as number) <= 0) {
      throw new Error(
        "motionModel('drive'): the profile-relative form needs the active profile's " +
          `spinSpeed to resolve against, got ${String(spinSpeed)}.`,
      );
    }
    const speed = spinSpeed as number;
    const accelFrames = positiveFrames(config.accelFrames, 'accelFrames');
    const decelFrames =
      config.decelFrames != null
        ? positiveFrames(config.decelFrames, 'decelFrames')
        : accelFrames;
    const jerkFrames =
      config.jerkFrames != null ? positiveFrames(config.jerkFrames, 'jerkFrames') : 0;
    return {
      accel: speed / accelFrames,
      decel: speed / decelFrames,
      jerk: jerkFrames > 0 ? speed / jerkFrames : 0,
    };
  }

  const accel = config?.accel;
  if (!Number.isFinite(accel) || (accel as number) <= 0) {
    throw new Error(
      `motionModel('drive'): accel must be a positive number of px/frame^2, got ${String(accel)}.`,
    );
  }
  const decel = config.decel ?? (accel as number);
  if (!Number.isFinite(decel) || decel <= 0) {
    throw new Error(
      `motionModel('drive'): decel must be a positive number of px/frame^2, got ${String(decel)}.`,
    );
  }
  const jerk = config.jerk ?? 0;
  if (!Number.isFinite(jerk) || jerk < 0) {
    throw new Error(
      `motionModel('drive'): jerk must be a non-negative number of px/frame^3, got ${String(jerk)}.`,
    );
  }
  return { accel: accel as number, decel, jerk };
}

/**
 * Advance one drive tick: move `state.speed` toward `target` without exceeding
 * the configured acceleration (and, if set, jerk) bounds.
 *
 * Writes into `state` and returns it, rather than allocating a new object.
 * `Reel.update` calls this every tick for every reel, so a fresh object per
 * call is 2 allocations x reels x 60fps of pure garbage for the life of the
 * session. Pure in every other sense: the result depends only on the
 * arguments, which is what lets it be property-tested off a ticker the way
 * `ReelMotion` is. Pass a copy if you need the old state.
 *
 * @param state    Current speed / acceleration. MUTATED.
 * @param target   Speed the reel is being asked for, px/frame.
 * @param config   Resolved bounds (see {@link resolveDriveConfig}).
 * @param deltaMs  Elapsed time for this tick.
 */
export function stepDrive(
  state: ReelDriveState,
  target: number,
  config: ResolvedDriveConfig,
  deltaMs: number,
): ReelDriveState {
  const dt = deltaMs / DRIVE_FRAME_MS;
  if (dt <= 0) return state;

  const gap = target - state.speed;
  if (Math.abs(gap) < DRIVE_EPS) {
    state.speed = target;
    state.accel = 0;
    return state;
  }

  const dir = gap > 0 ? 1 : -1;
  // `accel` vs `decel` is about MAGNITUDE, not sign: a reel dropping from
  // +8 to +2 is decelerating, and so is one climbing from -8 to -2. Comparing
  // the absolute speeds keeps the step-back pull in StartPhase (which drives
  // the speed negative) on the right bound.
  const speedingUp = Math.abs(target) > Math.abs(state.speed);
  const bound = speedingUp ? config.accel : config.decel;

  let accel: number;
  if (config.jerk > 0) {
    // Speed still gained while walking the acceleration back to zero. Once the
    // remaining gap is no bigger than that, easing off is the only way to
    // arrive without sailing past the target.
    const brakingGap = (state.accel * state.accel) / (2 * config.jerk);
    const wantAccel = Math.abs(gap) <= brakingGap ? 0 : dir * bound;
    const maxDelta = config.jerk * dt;
    const accelGap = wantAccel - state.accel;
    accel =
      Math.abs(accelGap) <= maxDelta ? wantAccel : state.accel + Math.sign(accelGap) * maxDelta;
  } else {
    accel = dir * bound;
  }

  const speed = state.speed + accel * dt;

  // Arrival clamp. With jerk the braking prediction gets close but not exact,
  // and without jerk the last tick almost always overshoots by a fraction of a
  // step. Either way, crossing the target means we are there.
  if ((target - speed) * dir <= 0) {
    state.speed = target;
    state.accel = 0;
    return state;
  }
  state.speed = speed;
  state.accel = accel;
  return state;
}
