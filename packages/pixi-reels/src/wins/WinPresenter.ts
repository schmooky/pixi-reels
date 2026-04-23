import type { Win } from '../config/types.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { SymbolPosition } from '../events/ReelEvents.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { Disposable } from '../utils/Disposable.js';
import { sortByValueDesc } from './Win.js';

/**
 * What to play on each cell being highlighted.
 *
 *   - `'win'` — default. Calls `symbol.playWin()` (your subclass's hook).
 *   - `string` — a named animation. If the symbol exposes a
 *     `playAnimation(name)` method (e.g. SpineSymbol), it's invoked; else
 *     it falls back to `playWin()`.
 *   - `(symbol, cell, win) => Promise<void>` — drive the animation
 *     yourself. Good for GSAP bounces, line-specific pulses, etc.
 */
export type WinSymbolAnim =
  | 'win'
  | string
  | ((symbol: ReelSymbol, cell: SymbolPosition, win: Win) => Promise<void>);

export interface WinPresenterOptions {
  /**
   * Fade non-winning symbols to this alpha while a win is active.
   *  - `true` (default) → alpha 0.35
   *  - number → that alpha
   *  - `false` → don't touch non-winners
   *
   * Restored on `win:end`.
   */
  dimLosers?: boolean | { alpha?: number };
  /** See {@link WinSymbolAnim}. Default `'win'`. */
  symbolAnim?: WinSymbolAnim;
  /**
   * Delay between cells *within* a single win (ms).
   * - `0` (default) → all cells animate simultaneously
   * - `> 0` → cells start one after another in array order (e.g. a
   *   left-to-right sweep across a payline's cells)
   */
  stagger?: number;
  /** Delay between successive wins in the sequence (ms). Default 400. */
  cycleGap?: number;
  /** Number of full cycles through the wins list. `-1` for infinite. Default 1. */
  cycles?: number;
  /** Sort wins by `value` descending before cycling. Default true. */
  sortByValue?: boolean;
}

interface ResolvedOptions {
  dimAlpha: number | null;
  symbolAnim: WinSymbolAnim;
  stagger: number;
  cycleGap: number;
  cycles: number;
  sortByValue: boolean;
}

/**
 * Highlights winning cells on a reel set. One job: animate the symbols.
 *
 * The presenter doesn't draw lines, outlines, or any per-win visual — it
 * emits `win:start` / `win:group` / `win:symbol` / `win:end` events so
 * your code can hook anything it wants (polylines, Spine line rigs,
 * popup numbers, sound cues) by subscribing and using
 * `reelSet.getCellBounds(col, row)` to place graphics.
 *
 * Two knobs cover the common presentation modes:
 *
 *   - `stagger: 0` → all cells in a win pulse together
 *   - `stagger: 60` → cells start one after another — a left-to-right
 *     sweep if you pass cells in reel order
 *
 * ```ts
 * const presenter = new WinPresenter(reelSet, { stagger: 80 });
 *
 * reelSet.events.on('spin:complete', async () => {
 *   const wins = await server.wins(result);  // your wins, your shape
 *   await presenter.show(wins);
 * });
 * reelSet.events.on('spin:start', () => presenter.abort());
 * ```
 *
 * Cascades: drive `presenter.show([{ cells: winners }])` from
 * `runCascade`'s `onWinnersVanish` hook — cluster pops and payline hits
 * are the same shape to the presenter.
 */
export class WinPresenter implements Disposable {
  private _reelSet: ReelSet;
  private _options: ResolvedOptions;
  private _abort: AbortController | null = null;
  private _isActive = false;
  private _isDestroyed = false;

  constructor(reelSet: ReelSet, options: WinPresenterOptions = {}) {
    this._reelSet = reelSet;
    this._options = WinPresenter._resolve(options);
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Present the given wins. Cancels any in-flight sequence first.
   * Resolves when all cycles complete or when `abort()` is called.
   *
   * Empty input resolves immediately without firing any events.
   */
  async show(wins: readonly Win[]): Promise<void> {
    this.abort();
    if (this._isDestroyed) return;
    if (wins.length === 0) return;

    const ordered = this._options.sortByValue
      ? sortByValueDesc(wins)
      : [...wins];

    const abort = new AbortController();
    this._abort = abort;
    this._isActive = true;
    this._reelSet.events.emit('win:start', ordered);

    let loop = 0;
    try {
      while (this._options.cycles === -1 || loop < this._options.cycles) {
        for (const win of ordered) {
          if (abort.signal.aborted) return;
          await this._showOne(win, abort.signal);
          if (abort.signal.aborted) return;
          await this._wait(this._options.cycleGap, abort.signal);
        }
        loop++;
      }
    } finally {
      this._restoreAlpha();
      const wasAborted = abort.signal.aborted;
      if (this._abort === abort) this._abort = null;
      this._isActive = false;
      this._reelSet.events.emit('win:end', wasAborted ? 'aborted' : 'complete');
    }
  }

  /** Abort any in-flight `show()`. */
  abort(): void {
    if (this._abort) this._abort.abort();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this.abort();
  }

  private async _showOne(win: Win, signal: AbortSignal): Promise<void> {
    const cells = [...win.cells];
    if (cells.length === 0) return;

    // Apply dim before firing win:group so listeners observe the live
    // visual state (e.g. a UI snapshot sees losers already faded).
    this._applyDim(cells);
    this._reelSet.events.emit('win:group', win, cells);

    const stagger = this._options.stagger;
    const animPromises: Promise<void>[] = [];

    for (let i = 0; i < cells.length; i++) {
      if (signal.aborted) break;
      if (i > 0 && stagger > 0) await this._wait(stagger, signal);
      if (signal.aborted) break;
      const cell = cells[i];
      const reel = this._reelSet.getReel(cell.reelIndex);
      if (!reel) continue;
      const symbol = reel.getSymbolAt(cell.rowIndex);
      if (!symbol) continue;
      this._reelSet.events.emit('win:symbol', symbol, cell, win);
      animPromises.push(this._playAnim(symbol, cell, win));
    }

    await Promise.all(animPromises);
  }

  private async _playAnim(
    symbol: ReelSymbol,
    cell: SymbolPosition,
    win: Win,
  ): Promise<void> {
    const anim = this._options.symbolAnim;
    if (typeof anim === 'function') return anim(symbol, cell, win);
    if (anim === 'win') return symbol.playWin();
    const withPlay = symbol as unknown as { playAnimation?: (name: string) => Promise<void> };
    if (typeof withPlay.playAnimation === 'function') return withPlay.playAnimation(anim);
    return symbol.playWin();
  }

  private _applyDim(winCells: readonly SymbolPosition[]): void {
    const alpha = this._options.dimAlpha;
    if (alpha === null) return;

    const winKeys = new Set<string>();
    for (const c of winCells) winKeys.add(`${c.reelIndex}:${c.rowIndex}`);

    const reels = this._reelSet.reels;
    for (let r = 0; r < reels.length; r++) {
      const reel = reels[r];
      for (let row = 0; row < reel.visibleRows; row++) {
        const view = reel.getSymbolAt(row).view;
        view.alpha = winKeys.has(`${r}:${row}`) ? 1 : alpha;
      }
    }
  }

  private _restoreAlpha(): void {
    const reels = this._reelSet.reels;
    for (const reel of reels) {
      for (let row = 0; row < reel.visibleRows; row++) {
        reel.getSymbolAt(row).view.alpha = 1;
      }
    }
  }

  private _wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const t = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
  }

  private static _resolve(opts: WinPresenterOptions): ResolvedOptions {
    let dimAlpha: number | null;
    if (opts.dimLosers === false) {
      dimAlpha = null;
    } else if (typeof opts.dimLosers === 'object' && opts.dimLosers !== null) {
      dimAlpha = opts.dimLosers.alpha ?? 0.35;
    } else {
      dimAlpha = 0.35;
    }

    return {
      dimAlpha,
      symbolAnim: opts.symbolAnim ?? 'win',
      stagger: Math.max(0, opts.stagger ?? 0),
      cycleGap: opts.cycleGap ?? 400,
      cycles: opts.cycles ?? 1,
      sortByValue: opts.sortByValue ?? true,
    };
  }
}
