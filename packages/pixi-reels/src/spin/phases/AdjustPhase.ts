import { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';

export interface AdjustPhaseConfig {
  /**
   * Pin overlays on this reel that need to tween from their pre-reshape
   * cell to the post-reshape cell. Populated by `SpinController` BEFORE
   * the reshape commits — `fromY` captures each overlay's on-screen Y at
   * the moment the snapshot was taken, `toY` is computed from the new
   * geometry.
   *
   * AdjustPhase no longer commits geometry — `SpinController._applyReshape`
   * does that synchronously before the phase runs. The phase's only job is
   * the tween.
   */
  pinOverlays: PinOverlayTween[];
}

/**
 * Descriptor for one pin overlay's animation across a MultiWays reshape.
 *
 * @internal — constructed by `SpinController.buildPinOverlayTweens`. Not
 * meant to be hand-built by consumers.
 */
export interface PinOverlayTween {
  /** The pin overlay symbol — its view is what we animate. */
  symbol: ReelSymbol;
  /** Width to resize to after the tween (cell width — usually unchanged). */
  cellWidth: number;
  /** Cell height before reshape (the overlay's current size). */
  oldCellHeight: number;
  /** Cell height after reshape. */
  newCellHeight: number;
  /** Pre-tween Y in viewport-local coords. */
  fromY: number;
  /** Post-tween target Y in viewport-local coords. */
  toY: number;
  /** Reel container X (unchanged across reshape). */
  x: number;
}

/**
 * Tween-only phase between SPIN and STOP for MultiWays slots.
 *
 * The geometry commit (resize symbols, reshape motion) happens in
 * `SpinController._applyReshape` before this phase runs. AdjustPhase only
 * tweens any pin overlays from their pre-reshape cell to the new cell —
 * cell symbols on the strip snap instantly because the reel is still
 * spinning at full speed when this phase runs (tweening cell scale would
 * fight the motion layer).
 *
 * Inserted into the phase chain ONLY when `builder.multiways(...)` is
 * called. Non-MultiWays slots never see this phase.
 *
 * Plays on top of whatever stop staggering you've configured; duration
 * is independent of `stopDelay`.
 */
export class AdjustPhase extends ReelPhase<AdjustPhaseConfig> {
  readonly name = 'adjust';
  readonly skippable = true;

  private _durationMs: number;
  private _ease: string;
  private _tween: gsap.core.Timeline | null = null;
  private _settle: (() => void) | null = null;

  constructor(
    reel: Reel,
    speed: SpeedProfile,
    opts: { durationMs: number; ease?: string },
  ) {
    super(reel, speed);
    this._durationMs = opts.durationMs;
    this._ease = opts.ease ?? 'power2.out';
  }

  protected onEnter(config: AdjustPhaseConfig): void {
    const overlays = config.pinOverlays;

    if (overlays.length === 0) {
      // SpinController shouldn't construct the phase in this case, but
      // defend in depth.
      this._complete();
      return;
    }

    if (this._durationMs <= 0) {
      // Instant snap path — match user's `pinMigrationDuration(0)`.
      this._snapPinOverlays(overlays);
      this._complete();
      return;
    }

    // Pose every overlay at its OLD cell visually so the tween starts
    // from where the player last saw it. The overlay's underlying view is
    // already at `newCellHeight` after the upstream reshape; we use
    // scale.y to make it look its old size during the tween.
    for (const o of overlays) {
      o.symbol.resize(o.cellWidth, o.newCellHeight);
      o.symbol.view.x = o.x;
      o.symbol.view.y = o.fromY;
      o.symbol.view.scale.y =
        o.newCellHeight > 0 ? o.oldCellHeight / o.newCellHeight : 1;
      o.symbol.view.scale.x = 1;
    }

    this._settle = () => {
      for (const o of overlays) {
        o.symbol.view.scale.set(1, 1);
        o.symbol.view.y = o.toY;
        o.symbol.view.x = o.x;
      }
    };

    const dur = this._durationMs / 1000;
    const ease = this._ease;
    this._tween = gsap.timeline({
      onComplete: () => {
        this._settle?.();
        this._settle = null;
        this._tween = null;
        this._complete();
      },
    });

    for (const o of overlays) {
      this._tween.to(o.symbol.view, { y: o.toY, duration: dur, ease }, 0);
      this._tween.to(o.symbol.view.scale, { y: 1, duration: dur, ease }, 0);
    }
  }

  update(_deltaMs: number): void {
    // GSAP-driven; no per-frame work needed.
  }

  protected onSkip(): void {
    if (this._tween) {
      this._tween.progress(1);
      this._tween.kill();
      this._tween = null;
    }
    if (this._settle) {
      this._settle();
      this._settle = null;
    }
  }

  private _snapPinOverlays(overlays: PinOverlayTween[]): void {
    for (const o of overlays) {
      o.symbol.resize(o.cellWidth, o.newCellHeight);
      o.symbol.view.x = o.x;
      o.symbol.view.y = o.toY;
      o.symbol.view.scale.set(1, 1);
    }
  }
}
