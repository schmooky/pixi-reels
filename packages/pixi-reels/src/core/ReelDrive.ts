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
 * Units are pixels per frame per frame, where a frame is
 * {@link DRIVE_FRAME_MS}. `spinSpeed` is pixels per frame, so
 * `accel = spinSpeed / 20` reaches full speed in about 20 frames (~330 ms).
 */
export interface ReelDriveConfig {
  /** Max acceleration when the target speed is FASTER than the current one, px/frame^2. */
  accel: number;
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

/** A drive's live state. Owned by `Reel`; stepped once per tick. */
export interface ReelDriveState {
  /** Current speed, px/frame. Mirrors `reel.speed`. */
  speed: number;
  /** Current acceleration, px/frame^2. Only non-zero while jerk-limited. */
  accel: number;
}

/** Validate and fill in a drive config. Throws on nonsense rather than limping. */
export function resolveDriveConfig(config: ReelDriveConfig): Required<Omit<ReelDriveConfig, 'jerk'>> & {
  jerk: number;
} {
  const accel = config?.accel;
  if (!Number.isFinite(accel) || accel <= 0) {
    throw new Error(
      `motionModel('drive'): accel must be a positive number of px/frame^2, got ${String(accel)}.`,
    );
  }
  const decel = config.decel ?? accel;
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
  return { accel, decel, jerk };
}

/**
 * Advance one drive tick: move `state.speed` toward `target` without exceeding
 * the configured acceleration (and, if set, jerk) bounds.
 *
 * Pure: takes the state, returns the next state. That is what lets the same
 * function be property-tested off a ticker, the way `ReelMotion` is.
 *
 * @param state    Current speed / acceleration.
 * @param target   Speed the reel is being asked for, px/frame.
 * @param config   Resolved bounds (see {@link resolveDriveConfig}).
 * @param deltaMs  Elapsed time for this tick.
 */
export function stepDrive(
  state: ReelDriveState,
  target: number,
  config: { accel: number; decel: number; jerk: number },
  deltaMs: number,
): ReelDriveState {
  const dt = deltaMs / DRIVE_FRAME_MS;
  if (dt <= 0) return state;

  const gap = target - state.speed;
  if (Math.abs(gap) < DRIVE_EPS) return { speed: target, accel: 0 };

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
      Math.abs(accelGap) <= maxDelta
        ? wantAccel
        : state.accel + Math.sign(accelGap) * maxDelta;
  } else {
    accel = dir * bound;
  }

  let speed = state.speed + accel * dt;

  // Arrival clamp. With jerk the braking prediction gets close but not exact,
  // and without jerk the last tick almost always overshoots by a fraction of a
  // step. Either way, crossing the target means we are there.
  if ((target - speed) * dir <= 0) {
    return { speed: target, accel: 0 };
  }
  return { speed, accel };
}
