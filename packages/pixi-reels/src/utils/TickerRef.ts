import type { Ticker } from 'pixi.js';
import type { Disposable } from './Disposable.js';

type TickerCallback = (ticker: Ticker) => void;

/**
 * Safe wrapper around PixiJS Ticker subscriptions.
 *
 * Solves the #1 memory leak in the original library: dangling ticker callbacks.
 * When `destroy()` is called, ALL registered callbacks are automatically
 * removed from the ticker.
 *
 * Usage:
 * ```ts
 * const ref = new TickerRef(app.ticker);
 * ref.add((ticker) => reel.update(ticker));
 * // Later:
 * ref.destroy(); // all callbacks removed
 * ```
 */
export class TickerRef implements Disposable {
  private _callbacks: TickerCallback[] = [];
  private _isDestroyed = false;

  constructor(private _ticker: Ticker) {}

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  add(fn: TickerCallback): void {
    if (this._isDestroyed) return;
    this._callbacks.push(fn);
    this._ticker.add(fn);
  }

  remove(fn: TickerCallback): void {
    const idx = this._callbacks.indexOf(fn);
    if (idx !== -1) {
      this._callbacks.splice(idx, 1);
      this._ticker.remove(fn);
    }
  }

  destroy(): void {
    if (this._isDestroyed) return;
    for (const fn of this._callbacks) {
      this._ticker.remove(fn);
    }
    this._callbacks.length = 0;
    this._isDestroyed = true;
  }
}
