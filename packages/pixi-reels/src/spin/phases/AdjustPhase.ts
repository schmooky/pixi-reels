import { gsap } from 'gsap';
import { ReelPhase } from './ReelPhase.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';

export interface AdjustPhaseConfig {
  /** Target visible-row count for this reel. */
  targetRows?: number;
  /** Target cell height for this reel. */
  targetSymbolHeight?: number;
  /**
   * Pin overlays on this reel that need to tween to their new cell during
   * the reshape. Populated by SpinController from `ReelSet`'s pin map.
   * Each entry's overlay symbol is alive in `viewport.unmaskedContainer` —
   * the underlying reel cell is owned by the spinning reel and snapped
   * instantly by `reel.reshape()`.
   */
  pinOverlays?: PinOverlayTween[];
}

/**
 * Descriptor for one pin overlay's animation across a MultiWays reshape.
 * The overlay started life sized at `oldCellHeight` and positioned at
 * `oldRow * oldSlotHeight + reel.offsetY`. After the reshape commits we
 * want it at `newRow * newSlotHeight + reel.offsetY`, sized to
 * `newCellHeight`.
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
 * Bridge between SPIN and STOP for MultiWays slots.
 *
 * Snaps the reel geometry (visible-row count + cell height) instantly via
 * `reel.reshape()`, then tweens any pin overlays from their pre-reshape
 * cell to their post-reshape cell. Cell symbols on the strip are NOT
 * tweened — the reel is still spinning at full speed when AdjustPhase
 * runs, and tweening individual symbol scale/position would conflict with
 * the motion layer that's continuously updating Y. The pin overlay lives
 * in the unmasked container, doesn't move with the reel motion, and is
 * the one element that visibly migrates between cells — so it's the only
 * thing the reshape needs to animate.
 *
 * Inserted into the phase chain ONLY when `builder.multiways(...)` is
 * called. Non-MultiWays slots never see this phase.
 *
 * AdjustPhase plays on top of whatever stop staggering you've configured;
 * its duration is independent of `stopDelay`.
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
    const reel = this._reel;
    const targetRows = config.targetRows ?? reel.visibleRows;
    const targetCellH = config.targetSymbolHeight ?? reel.symbolHeight;
    const overlays = config.pinOverlays ?? [];
    const hasReshape =
      targetRows !== reel.visibleRows || targetCellH !== reel.symbolHeight;

    if (!hasReshape && overlays.length === 0) {
      this._complete();
      return;
    }

    // Commit reel geometry instantly. The motion layer keeps spinning at
    // its new slotHeight; the player's eye is on the pin overlays, which
    // we tween below.
    if (hasReshape) {
      reel.reshape(targetRows, targetCellH, reel.bufferAbove, reel.bufferBelow);
    }

    if (overlays.length === 0 || this._durationMs <= 0) {
      // No pins on this reel (or instant snap requested) — finalize and exit.
      this._snapPinOverlays(overlays);
      this._complete();
      return;
    }

    // Pose every overlay at its OLD cell visually so the tween starts
    // from where the player last saw it. The overlay's underlying view is
    // already at `newCellHeight` after reshape (we resize it below); we
    // use scale.y to make it look its old size during the tween.
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
