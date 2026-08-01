import type { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';

export interface AdjustPhaseConfig {
  /**
   * Pin overlays on this reel that need to tween from their pre-reshape
   * cell to the post-reshape cell. Populated by `SpinController` BEFORE
   * the reshape commits. `fromMain` captures each overlay's on-screen main
   * coordinate at the moment the snapshot was taken, `toMain` is computed from the new
   * geometry.
   *
   * AdjustPhase no longer commits geometry. `SpinController._applyReshape`
   * does that synchronously before the phase runs. The phase's only job is
   * the tween.
   */
  pinOverlays: PinOverlayTween[];
}

/**
 * Descriptor for one pin overlay's animation across a MultiWays reshape.
 *
 * @internal. constructed by `SpinController.buildPinOverlayTweens`. Not
 * meant to be hand-built by consumers.
 */
export interface PinOverlayTween {
  /** The pin overlay symbol. its view is what we animate. */
  symbol: ReelSymbol;
  /** Cross-axis cell extent. unchanged by a reshape. */
  cellCross: number;
  /** Main-axis cell extent before the reshape (the overlay's current size). */
  oldCellMain: number;
  /** Main-axis cell extent after the reshape. */
  newCellMain: number;
  /** Pre-tween main coordinate, viewport-local. */
  fromMain: number;
  /** Post-tween target main coordinate, viewport-local. */
  toMain: number;
  /** Reel container cross coordinate (unchanged across reshape). */
  cross: number;
}

/**
 * Tween-only phase between SPIN and STOP for MultiWays slots.
 *
 * The geometry commit (resize symbols, reshape motion) happens in
 * `SpinController._applyReshape` before this phase runs. AdjustPhase only
 * tweens any pin overlays from their pre-reshape cell to the new cell.
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
      // Instant snap path. match user's `pinMigrationDuration(0)`.
      this._snapPinOverlays(overlays);
      this._complete();
      return;
    }

    // Pose every overlay at its OLD cell visually so the tween starts
    // from where the player last saw it. The overlay's underlying view is
    // already at `newCellMain` after the upstream reshape; we squash the
    // main-axis scale to make it look its old size during the tween.
    const axis = this._reel.axis;
    for (const o of overlays) {
      const size = axis.toScreen(o.cellCross, o.newCellMain);
      o.symbol.resize(size.x, size.y);
      axis.setCross(o.symbol.view, o.cross);
      axis.setMain(o.symbol.view, o.fromMain);
      o.symbol.view.scale[axis.mainProp] =
        o.newCellMain > 0 ? o.oldCellMain / o.newCellMain : 1;
      o.symbol.view.scale[axis.crossProp] = 1;
    }

    this._settle = () => {
      for (const o of overlays) {
        o.symbol.view.scale.set(1, 1);
        axis.setMain(o.symbol.view, o.toMain);
        axis.setCross(o.symbol.view, o.cross);
      }
    };

    const dur = this._durationMs / 1000;
    const ease = this._ease;
    this._tween = this._reel.gsap.timeline({
      onComplete: () => {
        this._settle?.();
        this._settle = null;
        this._tween = null;
        this._complete();
      },
    });

    for (const o of overlays) {
      this._tween.to(o.symbol.view, { [axis.mainProp]: o.toMain, duration: dur, ease }, 0);
      this._tween.to(o.symbol.view.scale, { [axis.mainProp]: 1, duration: dur, ease }, 0);
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
    const axis = this._reel.axis;
    for (const o of overlays) {
      const size = axis.toScreen(o.cellCross, o.newCellMain);
      o.symbol.resize(size.x, size.y);
      axis.setCross(o.symbol.view, o.cross);
      axis.setMain(o.symbol.view, o.toMain);
      o.symbol.view.scale.set(1, 1);
    }
  }
}
