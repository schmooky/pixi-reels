import type { Ticker } from 'pixi.js';

type TickerCallback = (ticker: Ticker) => void;

/**
 * Minimal drop-in replacement for `PIXI.Ticker` for tests.
 *
 * Exposes the exact surface `pixi-reels` uses internally (`add`, `remove`,
 * `deltaMS`) plus a manual `tick(deltaMs)` method so tests can advance time
 * deterministically without depending on requestAnimationFrame.
 *
 * ```ts
 * const ticker = new FakeTicker();
 * const reelSet = new ReelSetBuilder()
 *   .ticker(ticker as unknown as PIXI.Ticker)
 *   ...
 *   .build();
 *
 * ticker.tick(16);  // advance one frame
 * ticker.tickFor(500);  // advance 500ms in 16ms frames
 * ```
 */
export class FakeTicker {
  public deltaMS = 16;
  public deltaTime = 1;
  public elapsedMS = 0;
  public lastTime = 0;
  public speed = 1;
  public started = false;
  public FPS = 60;
  public minFPS = 10;
  public maxFPS = 0;

  private _callbacks: TickerCallback[] = [];

  add(fn: TickerCallback): this {
    this._callbacks.push(fn);
    return this;
  }

  addOnce(fn: TickerCallback): this {
    const wrapped: TickerCallback = (t) => {
      this.remove(wrapped);
      fn(t);
    };
    return this.add(wrapped);
  }

  remove(fn: TickerCallback): this {
    const i = this._callbacks.indexOf(fn);
    if (i !== -1) this._callbacks.splice(i, 1);
    return this;
  }

  start(): this {
    this.started = true;
    return this;
  }

  stop(): this {
    this.started = false;
    return this;
  }

  destroy(): void {
    this._callbacks.length = 0;
    this.started = false;
  }

  /** Manually advance time by `deltaMs` milliseconds and fire all listeners. */
  tick(deltaMs = 16): void {
    this.deltaMS = deltaMs;
    this.deltaTime = deltaMs / (1000 / 60);
    this.elapsedMS += deltaMs;
    this.lastTime += deltaMs;
    const snapshot = this._callbacks.slice();
    for (const cb of snapshot) {
      cb(this as unknown as Ticker);
    }
  }

  /** Advance time by `totalMs`, chopped into `stepMs` frames. */
  tickFor(totalMs: number, stepMs = 16): void {
    let remaining = totalMs;
    while (remaining > 0) {
      const step = Math.min(stepMs, remaining);
      this.tick(step);
      remaining -= step;
    }
  }

  get listenerCount(): number {
    return this._callbacks.length;
  }
}
