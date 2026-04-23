import { Container } from 'pixi.js';
import type { Payline } from '../config/types.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { SymbolPosition } from '../events/ReelEvents.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { Disposable } from '../utils/Disposable.js';
import type { LineRenderer } from './LineRenderer.js';
import { paylineToCells, sortByValueDesc } from './Payline.js';

/**
 * What to play on each winning symbol.
 *
 *   - `'win'` — default. Calls `symbol.playWin()` (your subclass's hook).
 *   - `string` — a named animation. If the symbol exposes a
 *     `playAnimation(name)` method (e.g. SpineSymbol), it's invoked; else
 *     it falls back to `playWin()`.
 *   - `(symbol, cell, payline) => Promise<void>` — drive the animation
 *     yourself. Good for GSAP bounces, line-specific pulses, etc.
 */
export type WinSymbolAnim =
  | 'win'
  | string
  | ((symbol: ReelSymbol, cell: SymbolPosition, payline: Payline) => Promise<void>);

export interface WinPresenterOptions {
  /** Optional renderer. If absent, no line is drawn — useful for events-only flows. */
  lineRenderer?: LineRenderer;
  /**
   * Fade non-winning symbols to this alpha while a payline is active.
   *  - `true` (default) → alpha 0.35
   *  - number → that alpha
   *  - `false` → don't touch non-winners
   *
   * Restored on `win:end`.
   */
  dimLosers?: boolean | { alpha?: number };
  /** See {@link WinSymbolAnim}. Default `'win'`. */
  symbolAnim?: WinSymbolAnim;
  /** Delay between paylines (ms). Default 400. */
  cycleGap?: number;
  /** Number of full cycles through the payline list. `-1` for infinite. Default 1. */
  cycles?: number;
  /** Sort paylines by `value` descending before cycling. Default true. */
  sortByValue?: boolean;
}

interface ResolvedOptions {
  lineRenderer?: LineRenderer;
  dimAlpha: number | null;
  symbolAnim: WinSymbolAnim;
  cycleGap: number;
  cycles: number;
  sortByValue: boolean;
}

/**
 * Orchestrates a win sequence: cycles paylines, renders each one (via an
 * optional {@link LineRenderer}), animates the winning symbols, dims the
 * losers, and fires `win:start` / `win:line` / `win:symbol` / `win:end`
 * on the ReelSet.
 *
 * Create once per `ReelSet`, call `show(paylines)` when your server
 * response arrives, call `abort()` on a new spin or slam-stop.
 *
 * ```ts
 * const presenter = new WinPresenter(reelSet, {
 *   lineRenderer: new GraphicsLineRenderer(),
 *   dimLosers: { alpha: 0.3 },
 *   cycleGap: 500,
 *   cycles: 2,
 * });
 *
 * reelSet.events.on('spin:complete', () => presenter.show(serverWins));
 * reelSet.events.on('spin:start', () => presenter.abort());
 * ```
 *
 * Lines are drawn onto a dedicated container added to the ReelSet at the
 * top of its child list — i.e. above the viewport (above symbols). If
 * you want lines drawn behind the winning symbols, supply your own
 * `LineRenderer` that adds to `reelSet.viewport.unmaskedContainer`.
 */
export class WinPresenter implements Disposable {
  private _reelSet: ReelSet;
  private _options: ResolvedOptions;
  private _lineLayer: Container;
  private _abort: AbortController | null = null;
  private _isActive = false;
  private _isDestroyed = false;

  constructor(reelSet: ReelSet, options: WinPresenterOptions = {}) {
    this._reelSet = reelSet;
    this._options = WinPresenter._resolve(options);

    this._lineLayer = new Container();
    this._lineLayer.sortableChildren = true;
    reelSet.addChild(this._lineLayer);
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** The Container the renderer draws into. Exposed for advanced composition. */
  get lineLayer(): Container {
    return this._lineLayer;
  }

  /**
   * Present the given paylines. Cancels any in-flight sequence first.
   * Resolves when all cycles complete or when `abort()` is called.
   *
   * Empty input resolves immediately without firing any events.
   */
  async show(paylines: readonly Payline[]): Promise<void> {
    this.abort();
    if (this._isDestroyed) return;
    if (paylines.length === 0) return;

    const ordered = this._options.sortByValue
      ? sortByValueDesc(paylines)
      : [...paylines];

    const abort = new AbortController();
    this._abort = abort;
    this._isActive = true;
    this._reelSet.events.emit('win:start', ordered);

    let loop = 0;
    try {
      while (this._options.cycles === -1 || loop < this._options.cycles) {
        for (const payline of ordered) {
          if (abort.signal.aborted) return;
          await this._showOne(payline, abort.signal);
          if (abort.signal.aborted) return;
          await this._wait(this._options.cycleGap, abort.signal);
        }
        loop++;
      }
    } finally {
      this._options.lineRenderer?.clear();
      this._restoreAlpha();
      const wasAborted = abort.signal.aborted;
      if (this._abort === abort) this._abort = null;
      this._isActive = false;
      this._reelSet.events.emit('win:end', wasAborted ? 'aborted' : 'complete');
    }
  }

  /** Abort any in-flight `show()` and tear down the current payline. */
  abort(): void {
    if (this._abort) this._abort.abort();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this.abort();
    this._options.lineRenderer?.destroy();
    if (this._lineLayer.parent) {
      this._lineLayer.parent.removeChild(this._lineLayer);
    }
    this._lineLayer.destroy({ children: true });
  }

  private async _showOne(payline: Payline, signal: AbortSignal): Promise<void> {
    const cells = paylineToCells(payline);
    if (cells.length === 0) return;

    // Apply dim before firing the event so listeners observe the live
    // visual state (e.g. a UI that freezes the winners into a screenshot
    // during win:line sees losers already faded).
    this._applyDim(cells);
    this._reelSet.events.emit('win:line', payline, cells);

    const linePromise = this._options.lineRenderer
      ? this._options.lineRenderer.render(
          payline,
          cells,
          (c, r) => this._reelSet.getCellBounds(c, r),
          this._lineLayer,
        )
      : Promise.resolve();

    const animPromises: Promise<void>[] = [];
    for (const cell of cells) {
      const reel = this._reelSet.getReel(cell.reelIndex);
      if (!reel) continue;
      const symbol = reel.getSymbolAt(cell.rowIndex);
      if (!symbol) continue;
      this._reelSet.events.emit('win:symbol', symbol, cell, payline);
      animPromises.push(this._playAnim(symbol, cell, payline));
    }

    await Promise.all([linePromise, ...animPromises]);
    if (signal.aborted) return;

    this._options.lineRenderer?.clear();
  }

  private async _playAnim(
    symbol: ReelSymbol,
    cell: SymbolPosition,
    payline: Payline,
  ): Promise<void> {
    const anim = this._options.symbolAnim;
    if (typeof anim === 'function') return anim(symbol, cell, payline);
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
      lineRenderer: opts.lineRenderer,
      dimAlpha,
      symbolAnim: opts.symbolAnim ?? 'win',
      cycleGap: opts.cycleGap ?? 400,
      cycles: opts.cycles ?? 1,
      sortByValue: opts.sortByValue ?? true,
    };
  }
}
