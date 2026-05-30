import type { Reel } from '../core/Reel.js';
import type { ReelViewport } from '../core/ReelViewport.js';
import type { SymbolPosition } from '../events/ReelEvents.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { Disposable } from '../utils/Disposable.js';

export interface SpotlightOptions {
  /** Opacity of the dim overlay (0-1). Default: 0.5. */
  dimAmount?: number;
  /** Whether to play win animation on spotlighted symbols. Default: true. */
  playWinAnimation?: boolean;
  /** Whether to re-parent symbols above the mask. Default: true. */
  promoteAboveMask?: boolean;
}

export interface WinLine {
  positions: SymbolPosition[];
}

export interface CycleOptions extends SpotlightOptions {
  /** Milliseconds to display each win line. Default: 2000. */
  displayDuration?: number;
  /** Milliseconds between lines. Default: 300. */
  gapDuration?: number;
  /** Number of cycles (-1 for infinite). Default: 1. */
  cycles?: number;
}

interface PromotedSymbol {
  symbol: ReelSymbol;
  originalParent: any;
  position: SymbolPosition;
}

/**
 * The "we just won" visual primitive.
 *
 * The spotlight is what turns a landed grid into a celebration. Given a
 * list of winning cell positions, it:
 *
 *   1. Fades in the dim overlay behind everything (everything that is
 *      not winning visually sinks into the background).
 *   2. Re-parents each winning `ReelSymbol` into the viewport's
 *      spotlight layer so its animation isn't clipped by the reel mask.
 *   3. Calls `playWin()` on each winner (your symbol class's one-shot).
 *   4. When you call `hide()` or the cycle ends, it puts every symbol
 *      back where it came from and removes the dim overlay.
 *
 * Two modes:
 *   - `show(positions, options)`. one-shot. Cell highlight + promote +
 *     play win. Returns when the animation fully ends.
 *   - `cycle(lines, options)`. iterate multiple win lines with a
 *     configurable per-line duration and gap, optionally repeating.
 *
 * Win detection is NOT part of this. pixi-reels never computes wins.
 * your server / game code decides which cells are winners and passes
 * them here. See [ADR 007](../../docs/adr/007-scope.md).
 */
export class SymbolSpotlight implements Disposable {
  private _reels: Reel[];
  private _viewport: ReelViewport;
  private _promoted: PromotedSymbol[] = [];
  private _isActive = false;
  private _isDestroyed = false;
  private _cycleAbort: AbortController | null = null;

  constructor(reels: Reel[], viewport: ReelViewport) {
    this._reels = reels;
    this._viewport = viewport;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** Show spotlight on specific positions. */
  async show(positions: SymbolPosition[], options: SpotlightOptions = {}): Promise<void> {
    this.hide(); // Cancel any running cycle and clear the previous spotlight
    await this._showInternal(positions, options);
  }

  /**
   * Promote + play win for one set of positions. Unlike the public `show()`,
   * this does NOT call `hide()` first, so it never aborts a running cycle.
   */
  private async _showInternal(
    positions: SymbolPosition[],
    options: SpotlightOptions = {},
  ): Promise<void> {
    const {
      dimAmount = 0.5,
      playWinAnimation = true,
      promoteAboveMask = true,
    } = options;

    this._isActive = true;

    // Show dim overlay
    this._viewport.showDim(dimAmount);

    // Promote symbols
    const winPromises: Promise<void>[] = [];

    const seen = new Set<string>();
    for (const pos of positions) {
      const reel = this._reels[pos.reelIndex];
      if (!reel) continue;

      const symbol = reel.getSymbolAt(pos.rowIndex);
      if (!symbol) continue;

      // Avoid promoting the same physical symbol twice (e.g. a 2×2 big
      // symbol's anchor cell + its OCCUPIED cells all resolve to one symbol).
      const key = `${pos.reelIndex}:${reel.getAnchorRow(pos.rowIndex)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Track for hide() only when we're actually moving the view.
      // otherwise the entry's `originalParent` would become stale if the
      // shared symbol pool recycles this instance into a different reel
      // before the next hide(), and `hide()` would reparent it back to a
      // reel that no longer owns it (leaving a hole on the new owner).
      if (promoteAboveMask) {
        const originalParent = symbol.view.parent;
        this._promoted.push({ symbol, originalParent, position: pos });
        const globalPos = symbol.view.getGlobalPosition();
        this._viewport.spotlightContainer.addChild(symbol.view);
        const localPos = this._viewport.spotlightContainer.toLocal(globalPos);
        symbol.view.x = localPos.x;
        symbol.view.y = localPos.y;
      }

      if (playWinAnimation) {
        winPromises.push(symbol.playWin());
      }
    }

    if (winPromises.length > 0) {
      await Promise.all(winPromises);
    }
  }

  /** Hide the spotlight and return symbols to their original positions. */
  hide(): void {
    // Cancel any running cycle
    if (this._cycleAbort) {
      this._cycleAbort.abort();
      this._cycleAbort = null;
    }
    this._teardownVisual();
  }

  /**
   * Return promoted symbols and remove the dim overlay, WITHOUT aborting a
   * running cycle. The cycle loop calls this between lines; `hide()` adds the
   * abort on top for the public stop-everything behaviour.
   */
  private _teardownVisual(): void {
    // Return promoted symbols. Skip any whose view has been moved out of
    // the spotlight container. that means the shared symbol pool has
    // recycled them into another reel since show(), and reparenting back
    // to `originalParent` would steal them from their new owner.
    for (const { symbol, originalParent } of this._promoted) {
      if (symbol.view.parent !== this._viewport.spotlightContainer) continue;
      if (originalParent) {
        const globalPos = symbol.view.getGlobalPosition();
        originalParent.addChild(symbol.view);
        const localPos = originalParent.toLocal(globalPos);
        symbol.view.x = localPos.x;
        symbol.view.y = localPos.y;
      }
      symbol.stopAnimation();
    }
    this._promoted = [];

    // Hide dim overlay
    this._viewport.hideDim();
    this._isActive = false;
  }

  /**
   * Cycle through win lines, showing each for a duration.
   * Returns when all cycles complete or when hide() is called.
   */
  async cycle(winLines: WinLine[], options: CycleOptions = {}): Promise<void> {
    const {
      displayDuration = 2000,
      gapDuration = 300,
      cycles = 1,
    } = options;

    if (winLines.length === 0) return;

    // Stop anything already showing/cycling, then start a fresh controller.
    this.hide();
    const abort = new AbortController();
    this._cycleAbort = abort;
    const signal = abort.signal;

    let cycleCount = 0;
    while (cycles === -1 || cycleCount < cycles) {
      for (const line of winLines) {
        if (signal.aborted) return;
        // Use the internal show/teardown so the cycle does not abort itself.
        await this._showInternal(line.positions, options);
        await this._wait(displayDuration, signal);
        if (signal.aborted) return;
        this._teardownVisual();
        await this._wait(gapDuration, signal);
      }
      cycleCount++;
    }

    // Normal completion: clear only our own controller (a newer cycle/show
    // that pre-empted us would have aborted this signal and returned above).
    if (this._cycleAbort === abort) this._cycleAbort = null;
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this.hide();
    this._isDestroyed = true;
  }

  private _wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }
}
