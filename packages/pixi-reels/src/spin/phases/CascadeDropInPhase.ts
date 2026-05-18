import type { gsap } from 'gsap';
import type { Container } from 'pixi.js';
import { getGsap } from '../../utils/gsapRef.js';
import { ReelPhase } from './ReelPhase.js';
import type { Reel } from '../../core/Reel.js';
import type { SpeedProfile } from '../../config/types.js';
import type { ReelSymbol } from '../../symbols/ReelSymbol.js';
import type { EventEmitter } from '../../events/EventEmitter.js';
import type { ReelSetEvents } from '../../events/ReelEvents.js';
import type { TumbleDropInConfig } from '../../cascade/TumbleConfig.js';
import { computeDropOffsets } from '../../cascade/tumbleAlgorithm.js';

export interface CascadeDropInPhaseConfig {
  /** Visible rows whose old symbols were winners — drives per-row drop
   *  geometry. Empty AND `initial: false` ⇒ no animation on this reel. */
  winnerRows: number[];
  /** `true` for Moment A (initial spin: every row drops from above);
   *  `false` for Moment B (refill: only winner-displaced rows animate). */
  initial: boolean;
  /**
   * Two-stage refill filter.
   *
   *   - `'all'` (default) — animate every mover: survivors-sliding-down AND
   *     new-symbols-from-above. The classic single-phase refill.
   *   - `'gravity'` — animate only survivors that slide down to fill holes
   *     (originalRow ≥ 0 with offsetRows > 0). New-symbol movers stay
   *     repositioned above the viewport with alpha=0 — invisible, awaiting
   *     the second stage. Emits `cascade:gravity:*` events.
   *   - `'new'` — animate only new-symbol movers (originalRow < 0).
   *     Survivors are already at their grid Y from the prior gravity stage,
   *     so this phase reveals them at alpha=1 and only tweens the new
   *     arrivals down from above. Emits `cascade:dropIn:*` events.
   *
   * Used by `mode: 'gravity-then-drop'` on `refill()` to split one refill
   * into two animated beats with a hold in between.
   */
  role?: 'all' | 'gravity' | 'new';
  /** Reel-set event bus, injected by SpinController. */
  events: EventEmitter<ReelSetEvents>;
}

interface DropJob {
  row: number;
  symbol: ReelSymbol;
  view: Container;
  startY: number;
  finalY: number;
  offsetRows: number;
}

/**
 * Drop-in half of the tumble cascade. Animates each visible symbol from
 * its computed origin (above the viewport for new symbols, its old grid
 * row for survivors) down to its current grid position.
 *
 * Geometry comes from `computeDropOffsets`. Symbols whose `offsetRows`
 * resolves to zero (untouched survivors) skip the tween entirely.
 *
 * Resolves when every animated tween completes, then calls
 * `reel.notifyLanded()`.
 */
export class CascadeDropInPhase extends ReelPhase<CascadeDropInPhaseConfig> {
  readonly name = 'cascade:dropIn';
  readonly skippable = true;

  private readonly _drop: Required<TumbleDropInConfig>;
  private _timeline: gsap.core.Timeline | null = null;
  private _jobs: DropJob[] = [];
  /** Captured on enter so `onSkip` can emit the paired `:end` event
   *  without needing the config closure. */
  private _events: EventEmitter<ReelSetEvents> | null = null;
  private _endEvent: 'cascade:dropIn:end' | 'cascade:gravity:end' = 'cascade:dropIn:end';

  constructor(reel: Reel, speed: SpeedProfile, drop: Required<TumbleDropInConfig>) {
    super(reel, speed);
    this._drop = drop;
  }

  protected onEnter(config: CascadeDropInPhaseConfig): void {
    const reel = this._reel;
    const visible = reel.visibleRows;
    const cellHeight = reel.motion.slotHeight;
    const events = config.events;
    const reelIndex = reel.reelIndex;
    const role = config.role ?? 'all';

    // Pick the event triplet for this role. Gravity uses its own channel so
    // listeners can distinguish "survivors slid into the holes" from "new
    // symbols entered". 'all' and 'new' both emit `cascade:dropIn:*` — they
    // are semantically the same drop-in beat (the 'new' role is just a
    // filtered variant where survivors already landed in stage 1).
    const startEvent = role === 'gravity' ? 'cascade:gravity:start' : 'cascade:dropIn:start';
    const symbolEvent = role === 'gravity' ? 'cascade:gravity:symbol' : 'cascade:dropIn:symbol';
    const endEvent = role === 'gravity' ? 'cascade:gravity:end' : 'cascade:dropIn:end';

    // Capture for `onSkip` — the `:start` event was just emitted, so any
    // skip from here must produce the paired `:end` to keep listeners
    // balanced.
    this._events = events;
    this._endEvent = endEvent;

    events.emit(startEvent, { reelIndex });

    const offsets = computeDropOffsets(visible, config.winnerRows, { initial: config.initial });

    // Build jobs and reset view.y to the pre-drop position. Survivors that
    // don't move (offsetRows === 0) are revealed where placeSymbols left
    // them. Movers are repositioned above the viewport, THEN revealed —
    // this avoids a single-frame flash at the grid position between
    // CascadePlacePhase (snaps view.y) and the first tween frame.
    //
    // Two-stage refill (`role === 'gravity' | 'new'`) skips a subset of
    // movers depending on origin:
    //   - 'gravity'  — animate survivor-shifters (originalRow ≥ 0). Keep
    //                  new-symbol movers (originalRow < 0) repositioned
    //                  above the viewport with alpha = 0 so they're ready
    //                  to drop in stage 2 without a flash.
    //   - 'new'      — animate new-symbol movers (originalRow < 0).
    //                  Survivors that slid in stage 1 are already at
    //                  their grid Y; reveal them at alpha = 1.
    const jobs: DropJob[] = [];
    for (const off of offsets) {
      const sym = reel.getSymbolAt(off.row);

      if (off.offsetRows === 0) {
        // Untouched survivor — placeSymbols left it at finalY visible.
        sym.view.visible = true;
        sym.view.alpha = 1;
        continue;
      }

      // Compute startY for any mover (gravity-correct origin).
      const finalY = sym.view.y;
      let startY: number;
      switch (this._drop.distance) {
        case 'auto':
          // `'auto'` = "every mover falls the full visible-rows distance,"
          // which is correct for Moment A (every row is new) and for new
          // arrivals in Moment B (originalRow < 0). For a Moment B SURVIVOR
          // (originalRow >= 0), 'auto' would teleport the symbol from its
          // actual prior row up above the viewport, then back down — a
          // visible discontinuity. Fall back to perHole geometry for those
          // movers so the survivor really does slide from its old row.
          if (!config.initial && off.originalRow >= 0) {
            startY = off.originalRow * cellHeight;
          } else {
            startY = finalY - visible * cellHeight;
          }
          break;
        case 'perHole':
          startY = off.originalRow * cellHeight;
          break;
        default:
          startY = finalY - this._drop.distance;
      }

      const isNewSymbol = off.originalRow < 0;
      const skipForRole =
        (role === 'gravity' && isNewSymbol) ||
        (role === 'new' && !isNewSymbol);

      if (skipForRole) {
        if (role === 'gravity' && isNewSymbol) {
          // New symbol awaiting stage 2 — invisible (alpha = 0) but parked
          // at the FINAL grid Y, not at startY. placeSymbols already snapped
          // view.y to grid Y; we leave it there so stage 2's `finalY =
          // sym.view.y` read picks up the correct landing position. (Stage 2
          // will reposition to startY for the actual drop-in tween.)
          sym.view.alpha = 0;
          sym.view.visible = true;
        } else if (role === 'new' && !isNewSymbol) {
          // Survivor already animated by the gravity stage — reveal it
          // where placeSymbols originally targeted (the final grid Y).
          sym.view.y = finalY;
          sym.view.alpha = 1;
          sym.view.visible = true;
        }
        continue;
      }

      // Move FIRST, then reveal — so the symbol never appears at the grid
      // position during the place→drop handover.
      sym.view.y = startY;
      sym.view.alpha = 1;
      sym.view.visible = true;
      jobs.push({
        row: off.row,
        symbol: sym,
        view: sym.view,
        startY,
        finalY,
        offsetRows: off.offsetRows,
      });
    }
    this._jobs = jobs;

    const finish = (): void => {
      this._timeline = null;
      this._jobs = [];
      events.emit(endEvent, { reelIndex });
      // Null the stored events ref so `onSkip` (if `forceComplete` is
      // called after natural completion) doesn't re-emit `:end` and
      // double-fire on balanced listeners.
      this._events = null;
      // Only stage that lands the reel: 'all' (combined) and 'new' (final
      // stage of two-stage). The gravity stage hands off to the drop-in
      // stage; that's where `notifyLanded` belongs.
      if (role !== 'gravity') reel.notifyLanded();
      this._complete();
    };

    const dropSec = this._drop.duration / 1000;
    const staggerSec = this._drop.rowStagger / 1000;

    if (jobs.length === 0 || dropSec <= 0) {
      // Nothing to animate, or zero-duration recipe — snap and complete.
      for (const job of jobs) job.view.y = job.finalY;
      finish();
      return;
    }

    const tl = getGsap().timeline({ onComplete: finish });
    this._timeline = tl;

    // For 'bottomToTop' order: walk jobs in reverse so the bottom-row job
    // gets staggerIndex 0 (fires first), the next one up gets 1, etc.
    // Note: `jobs` is already in row order (top-to-bottom) because offsets
    // are built in that order, so reversing the iteration is correct.
    const reverseOrder = this._drop.rowOrder === 'bottomToTop';

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const staggerIndex = reverseOrder ? jobs.length - 1 - i : i;
      const offset = staggerIndex * staggerSec;

      tl.call(
        () => events.emit(symbolEvent, {
          symbol: job.symbol,
          view: job.view,
          reelIndex,
          rowIndex: job.row,
          duration: this._drop.duration,
          ease: this._drop.ease,
          offsetRows: job.offsetRows,
        }),
        undefined,
        offset,
      );

      tl.to(job.view, {
        y: job.finalY,
        duration: dropSec,
        ease: this._drop.ease,
      }, offset);
    }
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {
    if (this._timeline) {
      this._timeline.kill();
      this._timeline = null;
    }
    // Snap every animating view to its final grid position.
    for (const job of this._jobs) {
      job.view.y = job.finalY;
      job.view.alpha = 1;
      job.view.visible = true;
    }
    this._jobs = [];

    // Defensive reveal: the two-stage `role === 'gravity'` path parks
    // new-symbol movers off-viewport at alpha = 0, and those aren't in
    // `_jobs`. A skip during the gravity beat must still reveal the final
    // landed state, so force every visible row to its grid Y / alpha 1.
    // Cheap belt-and-braces — for `role === 'all' | 'new'` this is a no-op
    // because non-job rows are already revealed.
    const reel = this._reel;
    for (let row = 0; row < reel.visibleRows; row++) {
      const sym = reel.getSymbolAt(row);
      sym.view.alpha = 1;
      sym.view.visible = true;
    }

    // Emit the paired `:end` event so listeners that count start/end
    // events stay balanced across skips. `:start` was already emitted at
    // the top of `onEnter`, so a skip here always has a matching `:start`
    // — no guard needed (unlike `CascadeFallPhase`, where `:start` fires
    // after a configurable delay).
    if (this._events) {
      this._events.emit(this._endEvent, { reelIndex: this._reel.reelIndex });
      this._events = null;
    }
  }
}
