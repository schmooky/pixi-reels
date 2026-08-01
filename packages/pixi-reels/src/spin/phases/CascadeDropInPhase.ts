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
import { mergeDropInConfig } from '../../cascade/TumbleConfig.js';
import { computeDropOffsets } from '../../cascade/tumbleAlgorithm.js';

export interface CascadeDropInPhaseConfig {
  /** Visible cells whose old symbols were winners. drives per-row drop
   *  geometry. Empty AND `initial: false` ⇒ no animation on this reel. */
  winnerCells: number[];
  /** `true` for Moment A (initial spin: every row drops from above);
   *  `false` for Moment B (refill: only winner-displaced cells animate). */
  initial: boolean;
  /**
   * Two-stage refill filter.
   *
   *   - `'all'` (default). animate every mover: survivors-sliding-down AND
   *     new-symbols-from-above. The classic single-phase refill.
   *   - `'gravity'`. animate only survivors that slide down to fill holes
   *     (originalCell ≥ 0 with offsetCells > 0). New-symbol movers stay
   *     repositioned above the viewport with alpha=0. invisible, awaiting
   *     the second stage. Emits `cascade:gravity:*` events.
   *   - `'new'`. animate only new-symbol movers (originalCell < 0).
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
  startMain: number;
  finalMain: number;
  offsetCells: number;
}

/**
 * Drop-in half of the tumble cascade. Animates each visible symbol from
 * its computed origin (above the viewport for new symbols, its old grid
 * row for survivors) down to its current grid position.
 *
 * Geometry comes from `computeDropOffsets`. Symbols whose `offsetCells`
 * resolves to zero (untouched survivors) skip the tween entirely.
 *
 * Resolves when every animated tween completes, then calls
 * `reel.notifyLanded()`.
 */
export class CascadeDropInPhase extends ReelPhase<CascadeDropInPhaseConfig> {
  readonly name = 'cascade:dropIn';
  readonly skippable = true;

  private readonly _baseDrop: Required<TumbleDropInConfig>;
  /** Resolved at `onEnter` time by merging the active speed profile's
   *  `tumble.dropIn` override (if any) over `_baseDrop`. Lives only for
   *  the duration of a single run so a `setSpeed` between phases is
   *  honoured on the next entry. */
  private _drop: Required<TumbleDropInConfig>;
  private _timeline: gsap.core.Timeline | null = null;
  private _jobs: DropJob[] = [];
  /** Captured on enter so `onSkip` can emit the paired `:end` event
   *  without needing the config closure. */
  private _events: EventEmitter<ReelSetEvents> | null = null;
  private _endEvent: 'cascade:dropIn:end' | 'cascade:gravity:end' = 'cascade:dropIn:end';
  /** Per-run abort controller exposed on `cascade:dropIn:symbol` (or
   *  `cascade:gravity:symbol`) as `signal`. Aborts on `onSkip` so
   *  listener-scheduled tweens (landing squish, badge fade) can clean up
   *  alongside the library's own timeline. Stays un-aborted on natural
   *  completion. */
  private _skipAbort: AbortController | null = null;

  constructor(reel: Reel, speed: SpeedProfile, drop: Required<TumbleDropInConfig>) {
    super(reel, speed);
    this._baseDrop = drop;
    this._drop = drop;
  }

  protected onEnter(config: CascadeDropInPhaseConfig): void {
    const reel = this._reel;
    const axis = reel.axis;
    const visible = reel.visibleCells;
    const cellHeight = reel.motion.slotPitch;
    const events = config.events;
    const reelIndex = reel.reelIndex;
    const role = config.role ?? 'all';

    // Re-mask lifted unmask views before building drop jobs. Movers are
    // pre-positioned above the viewport; a lifted view would render that
    // whole approach outside the mask. CascadePlacePhase already does
    // this on the standard refill path; this covers direct drop-in
    // entries (two-stage refills re-enter here after the gravity hold,
    // during which notifyLanded may have re-lifted). Idempotent.
    reel.beginMotion();

    // Apply speed-profile tumble override. Falls back to the build-time
    // base when the profile doesn't define one.
    this._drop = mergeDropInConfig(this._baseDrop, this._speed.tumble?.dropIn);
    this._skipAbort = new AbortController();

    // Pick the event triplet for this role. Gravity uses its own channel so
    // listeners can distinguish "survivors slid into the holes" from "new
    // symbols entered". 'all' and 'new' both emit `cascade:dropIn:*`. they
    // are semantically the same drop-in beat (the 'new' role is just a
    // filtered variant where survivors already landed in stage 1).
    const startEvent = role === 'gravity' ? 'cascade:gravity:start' : 'cascade:dropIn:start';
    const symbolEvent = role === 'gravity' ? 'cascade:gravity:symbol' : 'cascade:dropIn:symbol';
    const endEvent = role === 'gravity' ? 'cascade:gravity:end' : 'cascade:dropIn:end';

    // Capture for `onSkip`. the `:start` event was just emitted, so any
    // skip from here must produce the paired `:end` to keep listeners
    // balanced.
    this._events = events;
    this._endEvent = endEvent;

    events.emit(startEvent, { reelIndex });

    const offsets = computeDropOffsets(visible, config.winnerCells, { initial: config.initial });

    // Build jobs and reset view.y to the pre-drop position. Survivors that
    // don't move (offsetCells === 0) are revealed where placeSymbols left
    // them. Movers are repositioned above the viewport, THEN revealed.
    // this avoids a single-frame flash at the grid position between
    // CascadePlacePhase (snaps view.y) and the first tween frame.
    //
    // Two-stage refill (`role === 'gravity' | 'new'`) skips a subset of
    // movers depending on origin:
    //   - 'gravity' . animate survivor-shifters (originalCell ≥ 0). Keep
    //                  new-symbol movers (originalCell < 0) repositioned
    //                  above the viewport with alpha = 0 so they're ready
    //                  to drop in stage 2 without a flash.
    //   - 'new'     . animate new-symbol movers (originalCell < 0).
    //                  Survivors that slid in stage 1 are already at
    //                  their grid Y; reveal them at alpha = 1.
    const jobs: DropJob[] = [];
    // Big symbols: every occupied cell of a block resolves (via getAnchorCell /
    // getSymbolAt) to the SAME anchor view. Animate that view ONCE, driven by
    // the first visible row of the block (top-to-bottom). Without this the
    // anchor gets one job per occupied row, so: multiple GSAP tweens fight
    // over its main position (the jitter), `finalMain` is re-read after a
    // sibling job already moved the view to its startMain (wrong landing pos), and
    // per-symbol listeners (landing squish/bounce) fire N times on one view.
    const handledAnchors = new Set<number>();
    for (const off of offsets) {
      const anchorCell = reel.getAnchorCell(off.row);
      if (anchorCell !== off.row && handledAnchors.has(anchorCell)) continue;
      handledAnchors.add(anchorCell);

      const sym = reel.getSymbolAt(off.row);

      if (off.offsetCells === 0) {
        // Untouched survivor. placeSymbols left it at its final position, visible.
        sym.view.visible = true;
        sym.view.alpha = 1;
        continue;
      }

      // Compute the main-axis start for any mover (gravity-correct origin).
      // Grid origins (`originalCell * cellHeight`) are absolute main
      // coordinates and stay direction-agnostic. Fall distances are
      // directional, so they carry `axis.polarity`: the mover always starts
      // on the gravity-entry side and travels toward the exit edge.
      const finalMain = axis.getMain(sym.view);
      let startMain: number;
      switch (this._drop.distance) {
        case 'auto':
          // `'auto'` = "every mover falls the full visible-cells distance,"
          // which is correct for Moment A (every row is new) and for new
          // arrivals in Moment B (originalCell < 0). For a Moment B SURVIVOR
          // (originalCell >= 0), 'auto' would teleport the symbol from its
          // actual prior row up above the viewport, then back down. a
          // visible discontinuity. Fall back to perHole geometry for those
          // movers so the survivor really does slide from its old row.
          if (!config.initial && off.originalCell >= 0) {
            startMain = off.originalCell * cellHeight;
          } else {
            startMain = finalMain - axis.polarity * visible * cellHeight;
          }
          break;
        case 'perHole':
          startMain = off.originalCell * cellHeight;
          break;
        default:
          startMain = finalMain - axis.polarity * this._drop.distance;
      }

      const isNewSymbol = off.originalCell < 0;
      const skipForRole =
        (role === 'gravity' && isNewSymbol) ||
        (role === 'new' && !isNewSymbol);

      if (skipForRole) {
        if (role === 'gravity' && isNewSymbol) {
          // New symbol awaiting stage 2. invisible (alpha = 0) but parked
          // at the FINAL grid position, not at startMain. placeSymbols already
          // snapped the view to grid; we leave it there so stage 2's
          // `finalMain = axis.getMain(view)` read picks up the correct landing
          // position. (Stage 2 will reposition to startMain for the drop-in tween.)
          sym.view.alpha = 0;
          sym.view.visible = true;
        } else if (role === 'new' && !isNewSymbol) {
          // Survivor already animated by the gravity stage. reveal it
          // where placeSymbols originally targeted (the final grid position).
          axis.setMain(sym.view, finalMain);
          sym.view.alpha = 1;
          sym.view.visible = true;
        }
        continue;
      }

      // Move FIRST, then reveal. so the symbol never appears at the grid
      // position during the place→drop handover.
      axis.setMain(sym.view, startMain);
      sym.view.alpha = 1;
      sym.view.visible = true;
      jobs.push({
        row: off.row,
        symbol: sym,
        view: sym.view,
        startMain,
        finalMain,
        offsetCells: off.offsetCells,
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
      // Natural completion: drop the controller un-aborted. Listener
      // tweens scheduled off `cascade:dropIn:symbol` (squish, bounce)
      // are expected to settle on their own timeline.
      this._skipAbort = null;
      // Only stage that lands the reel: 'all' (combined) and 'new' (final
      // stage of two-stage). The gravity stage hands off to the drop-in
      // stage; that's where `notifyLanded` belongs. Landing notification
      // is MOVERS-ONLY (this stage's job cells): untouched survivors must
      // not replay their landing animation on every cascade stage.
      // Gravity movers get their reaction the moment they settle. the
      // reel itself still lands at the final stage.
      if (role === 'gravity') {
        for (const job of jobs) job.symbol.onReelLanded();
      } else {
        reel.notifyLanded(jobs.map((j) => j.row));
      }
      this._complete();
    };

    const dropSec = this._drop.duration / 1000;
    const staggerSec = this._drop.cellStagger / 1000;

    if (jobs.length === 0 || dropSec <= 0) {
      // Nothing to animate, or zero-duration recipe. snap and complete.
      for (const job of jobs) axis.setMain(job.view, job.finalMain);
      finish();
      return;
    }

    const tl = getGsap().timeline({ onComplete: finish });
    this._timeline = tl;

    // For 'endFirst' order: walk jobs in reverse so the bottom-row job
    // gets staggerIndex 0 (fires first), the next one up gets 1, etc.
    // Note: `jobs` is already in row order (top-to-bottom) because offsets
    // are built in that order, so reversing the iteration is correct.
    const reverseOrder = this._drop.cellOrder === 'endFirst';

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const staggerIndex = reverseOrder ? jobs.length - 1 - i : i;
      const offset = staggerIndex * staggerSec;

      tl.call(
        () => {
          const signal = this._skipAbort?.signal;
          if (!signal) return;
          events.emit(symbolEvent, {
            symbol: job.symbol,
            view: job.view,
            reelIndex,
            cellIndex: job.row,
            duration: this._drop.duration,
            ease: this._drop.ease,
            offsetCells: job.offsetCells,
            signal,
          });
        },
        undefined,
        offset,
      );

      tl.to(job.view, {
        [axis.mainProp]: job.finalMain,
        duration: dropSec,
        ease: this._drop.ease,
      }, offset);
    }
  }

  update(_deltaMs: number): void {}

  protected onSkip(): void {
    const axis = this._reel.axis;
    if (this._timeline) {
      this._timeline.kill();
      this._timeline = null;
    }
    // Snap every animating view to its final grid position.
    for (const job of this._jobs) {
      axis.setMain(job.view, job.finalMain);
      job.view.alpha = 1;
      job.view.visible = true;
    }
    this._jobs = [];

    // Defensive reveal: the two-stage `role === 'gravity'` path parks
    // new-symbol movers off-viewport at alpha = 0, and those aren't in
    // `_jobs`. A skip during the gravity beat must still reveal the final
    // landed state, so force every visible row to its grid Y / alpha 1.
    // Cheap belt-and-braces. for `role === 'all' | 'new'` this is a no-op
    // because non-job cells are already revealed.
    const reel = this._reel;
    for (let row = 0; row < reel.visibleCells; row++) {
      const sym = reel.getSymbolAt(row);
      sym.view.alpha = 1;
      sym.view.visible = true;
    }

    // Abort BEFORE emitting `:end` so listeners registered on the
    // per-symbol `signal` get the cancellation first. squish/bounce
    // tweens they scheduled off `cascade:dropIn:symbol` must die before
    // `:end` consumers run any landed-state setup that would otherwise
    // collide with mid-air tweens.
    if (this._skipAbort && !this._skipAbort.signal.aborted) {
      this._skipAbort.abort();
    }
    this._skipAbort = null;

    // Emit the paired `:end` event so listeners that count start/end
    // events stay balanced across skips. `:start` was already emitted at
    // the top of `onEnter`, so a skip here always has a matching `:start`
    //. no guard needed (unlike `CascadeFallPhase`, where `:start` fires
    // after a configurable delay).
    if (this._events) {
      this._events.emit(this._endEvent, { reelIndex: this._reel.reelIndex });
      this._events = null;
    }
  }
}
