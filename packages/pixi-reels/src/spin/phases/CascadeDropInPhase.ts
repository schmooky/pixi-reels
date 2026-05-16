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

    events.emit('cascade:dropIn:start', { reelIndex });

    const offsets = computeDropOffsets(visible, config.winnerRows, { initial: config.initial });

    // Build jobs and reset view.y to the pre-drop position. Survivors that
    // don't move (offsetRows === 0) are revealed where placeSymbols left
    // them. Movers are repositioned above the viewport, THEN revealed —
    // this avoids a single-frame flash at the grid position between
    // CascadePlacePhase (snaps view.y) and the first tween frame.
    const jobs: DropJob[] = [];
    for (const off of offsets) {
      const sym = reel.getSymbolAt(off.row);
      sym.view.visible = true;

      if (off.offsetRows === 0) {
        // Survivor — already at grid Y from placeSymbols; just ensure visible.
        sym.view.alpha = 1;
        continue;
      }

      const finalY = sym.view.y;
      let startY: number;

      switch (this._drop.distance) {
        case 'auto': {
          // Uniform full-column distance applied to every animated symbol.
          startY = finalY - visible * cellHeight;
          break;
        }
        case 'perHole':
          // Gravity-correct: each symbol falls exactly its own offset.
          startY = off.originalRow * cellHeight;
          break;
        default:
          // Numeric pixel distance.
          startY = finalY - this._drop.distance;
      }

      // Move FIRST, then reveal — so the symbol never appears at the grid
      // position during the place→drop handover.
      sym.view.y = startY;
      sym.view.alpha = 1;
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
      events.emit('cascade:dropIn:end', { reelIndex });
      reel.notifyLanded();
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
        () => events.emit('cascade:dropIn:symbol', {
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
  }
}
