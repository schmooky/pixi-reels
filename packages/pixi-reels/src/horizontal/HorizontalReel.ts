import { Container, Graphics } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { EventEmitter } from '../events/EventEmitter.js';
import { SymbolFactory } from '../symbols/SymbolFactory.js';
import { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import { TickerRef } from '../utils/TickerRef.js';
import type { Disposable } from '../utils/Disposable.js';
import type {
  HorizontalDirection,
  HorizontalReelConfig,
  HorizontalReelEvents,
  HorizontalSpinResult,
} from './HorizontalReelTypes.js';

/**
 * A single horizontal strip of symbols that spins and lands — the banner reel
 * that sits **above** the reels announcing which symbols pay this round.
 *
 * It is one row (not a matrix), oriented sideways. The engine's {@link Reel}
 * wraps on the Y axis and bakes that in throughout, so this is its own small
 * mechanism on the same shared primitives (the {@link SymbolFactory} pool,
 * {@link TickerRef}, the typed {@link EventEmitter}) rather than a rotated reel.
 *
 * Its API mirrors {@link ReelSet}: `spin()` starts it, `setResult(ids)` hands it
 * the round's paying symbols and triggers the stop, and the `spin()` promise
 * resolves once it lands. Same shape, one row wide.
 *
 * ```ts
 * const strip = new HorizontalReelBuilder()
 *   .visibleCount(4).cellSize(72)
 *   .symbols((r) => { for (const id of ALL) r.register(id, PaySymbol, opts); })
 *   .ticker(app.ticker)
 *   .build();
 * app.stage.addChild(strip.container);
 *
 * const spin = strip.spin();          // starts scrolling
 * strip.setResult(await server.pay);  // ['A','K','Q','J'] — one per visible cell
 * const { symbols } = await spin;     // resolves when it lands
 * ```
 */
export class HorizontalReel implements Disposable {
  readonly container: Container;
  readonly events = new EventEmitter<HorizontalReelEvents>();
  readonly visibleCount: number;

  private readonly _cellW: number;
  private readonly _cellH: number;
  private readonly _span: number;
  private readonly _windowWidth: number;
  private readonly _direction: HorizontalDirection;
  private readonly _cfg: HorizontalReelConfig;
  private readonly _factory: SymbolFactory;
  private readonly _tickerRef: TickerRef;
  private readonly _registeredIds: string[];
  private readonly _rng: () => number;

  /** Conveyor of `visibleCount + 2` instances: 1 buffer, the window, 1 buffer. */
  private readonly _slots: ReelSymbol[] = [];
  private readonly _M: number;
  /** Scroll progress within the current cell, in `[0, span)`. */
  private _off = 0;
  private _state: 'idle' | 'spinning' | 'stopping' | 'landing' = 'idle';
  private _queue: string[] = [];
  private _result: string[] | null = null;
  private _resolve: ((r: HorizontalSpinResult) => void) | null = null;
  private _landFrom = 0;
  private _landT = 0;
  private _destroyed = false;

  // Cascade stepping state.
  private _acc = 0;
  private _stepApplied = 0;

  constructor(cfg: HorizontalReelConfig) {
    if (!cfg.ticker) throw new Error('HorizontalReel: a ticker is required.');
    this._cfg = cfg;
    this.visibleCount = cfg.visibleCount;
    this._cellW = cfg.cellWidth;
    this._cellH = cfg.cellHeight;
    this._span = cfg.cellWidth + cfg.gap;
    this._windowWidth = cfg.visibleCount * this._span - cfg.gap;
    this._direction = cfg.direction;
    this._M = cfg.visibleCount + 2;
    this._rng = cfg.rng ?? Math.random;

    this.container = new Container();

    const registry = new SymbolRegistry();
    cfg.configurator(registry);
    this._registeredIds = registry.symbolIds;
    if (this._registeredIds.length === 0) {
      throw new Error('HorizontalReel: .symbols(...) registered no symbol ids.');
    }
    for (const id of cfg.initialResult) this._assertRegistered(id);
    if (cfg.initialResult.length !== cfg.visibleCount) {
      throw new Error(
        `HorizontalReel: initialResult must have exactly ${cfg.visibleCount} ids (got ${cfg.initialResult.length}).`,
      );
    }
    this._factory = new SymbolFactory(registry);

    if (cfg.chrome) {
      const bg = new Graphics();
      cfg.chrome(bg, this._windowWidth, this._cellH);
      this.container.addChild(bg);
    }
    const mask = new Graphics().rect(0, 0, this._windowWidth, this._cellH).fill(0xffffff);
    this.container.addChild(mask);
    this.container.mask = mask;

    this._layout(cfg.initialResult);
    this._tickerRef = new TickerRef(cfg.ticker);
    this._tickerRef.add((t) => this._tick(t));
  }

  get width(): number {
    return this._windowWidth;
  }
  get height(): number {
    return this._cellH;
  }
  get direction(): HorizontalDirection {
    return this._direction;
  }
  get isSpinning(): boolean {
    return this._state !== 'idle';
  }
  get isDestroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Start spinning. Resolves with the landed result once {@link setResult} has
   * been called and the strip settles (or {@link skipSpin} slams it). Mirrors
   * `ReelSet.spin()`. Throws if already spinning.
   */
  spin(): Promise<HorizontalSpinResult> {
    if (this._state !== 'idle') {
      throw new Error('HorizontalReel: already spinning — await the previous spin() first.');
    }
    this._state = 'spinning';
    this._result = null;
    this._queue = [];
    this._acc = 0;
    this._stepApplied = 0;
    this.events.emit('spin:start');
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /**
   * Hand the strip the round's paying symbols and trigger the stop. `ids` is one
   * per visible cell, left-to-right (`visibleCount` long). Mirrors
   * `ReelSet.setResult(...)`. Throws if not currently spinning.
   */
  setResult(ids: string[]): void {
    if (this._state !== 'spinning') {
      throw new Error('HorizontalReel: call spin() before setResult().');
    }
    if (ids.length !== this.visibleCount) {
      throw new Error(
        `HorizontalReel: setResult needs exactly ${this.visibleCount} ids (got ${ids.length}).`,
      );
    }
    for (const id of ids) this._assertRegistered(id);
    this._result = [...ids];
    // The last `visibleCount` symbols to feed in must be the result, in the
    // order that lands them left-to-right, plus one trailing buffer feed.
    // rtl feeds the window in order; ltr feeds it reversed (see _doShift).
    const windowFeeds = this._direction === 'rtl' ? [...ids] : [...ids].reverse();
    this._queue = [...windowFeeds, this._randomId()];
    this._state = 'stopping';
  }

  /**
   * Slam to the result immediately — the strip lands on {@link setResult}'s
   * symbols this frame. Mirrors `ReelSet.skipSpin()`. Requires a result to have
   * been set.
   */
  skipSpin(): void {
    if (this._state !== 'stopping' && this._state !== 'landing') {
      throw new Error('HorizontalReel: skipSpin() needs a pending result — call setResult() first.');
    }
    while (this._queue.length > 0) this._doShift(this._queue.shift() as string);
    this._off = 0;
    this._render();
    this._land();
  }

  /** The live symbol instance in visible slot `index`, left-to-right from 0. */
  symbolAt(index: number): ReelSymbol {
    if (index < 0 || index >= this.visibleCount) {
      throw new Error(`HorizontalReel: slot ${index} is outside 0..${this.visibleCount - 1}.`);
    }
    return this._slots[index + 1]; // slot 0 is the left buffer
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._state = 'idle';
    this._tickerRef.destroy();
    this.events.removeAllListeners();
    for (const s of this._slots) s.destroy();
    this._slots.length = 0;
    this._factory.destroy();
    this.container.destroy({ children: true });
    if (this._resolve) {
      // A spin in flight when destroyed resolves with the last known window so
      // awaiters don't hang forever.
      this._resolve({ symbols: this._windowIds() });
      this._resolve = null;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Seed the conveyor: [left buffer, ...window, right buffer]. */
  private _layout(initial: string[]): void {
    const ids = [this._randomId(), ...initial, this._randomId()]; // length M
    for (let k = 0; k < this._M; k++) {
      const symbol = this._factory.acquire(ids[k]);
      symbol.resize(this._cellW, this._cellH);
      symbol.view.y = 0;
      this.container.addChild(symbol.view);
      this._slots.push(symbol);
    }
    this._render();
  }

  private _tick(ticker: Ticker): void {
    if (this._destroyed || this._state === 'idle') return;
    if (this._state === 'landing') {
      this._advanceLanding(ticker.deltaMS);
      return;
    }
    if (this._cfg.mode === 'scroll') this._advanceScroll(ticker.deltaTime);
    else this._advanceCascade(ticker.deltaMS);
  }

  private _advanceScroll(dt: number): void {
    // Ease speed down as the stop queue drains, so it decelerates into the land.
    const drain = this._state === 'stopping' ? Math.max(0.28, this._queue.length / (this.visibleCount + 1)) : 1;
    this._off += this._cfg.speed * dt * drain;
    this._consumeCells();
    this._render();
  }

  private _advanceCascade(deltaMS: number): void {
    this._acc += deltaMS;
    if (this._stepApplied === 0 && this._acc < this._cfg.cascade.interval) return;
    const elapsed = this._acc - (this._stepApplied === 0 ? this._cfg.cascade.interval : 0);
    const t = Math.min(1, elapsed / this._cfg.cascade.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const target = eased * this._span;
    this._off += target - this._stepApplied;
    this._stepApplied = target;
    if (t >= 1) {
      this._acc = 0;
      this._stepApplied = 0;
    }
    this._consumeCells();
    this._render();
  }

  /** Fold whole cells of progress into conveyor shifts. */
  private _consumeCells(): void {
    while (this._off >= this._span) {
      this._off -= this._span;
      this._doShift(this._nextFeed());
      if (this._state === 'landing') return; // finalized inside _nextFeed
    }
  }

  private _nextFeed(): string {
    if (this._state === 'stopping') {
      const id = this._queue.shift() as string;
      if (this._queue.length === 0) {
        // This was the final scheduled feed — the window now holds the result.
        this._beginLanding();
      }
      return id;
    }
    return this._randomId();
  }

  /** Move the conveyor one cell in the travel direction, feeding `id` at the tail. */
  private _doShift(id: string): void {
    if (this._direction === 'rtl') {
      const leaving = this._slots.shift() as ReelSymbol; // leftmost leaves
      const next = this._repaint(leaving, id);
      this._slots.push(next); // enters at the right
    } else {
      const leaving = this._slots.pop() as ReelSymbol; // rightmost leaves
      const next = this._repaint(leaving, id);
      this._slots.unshift(next); // enters at the left
    }
  }

  private _repaint(outgoing: ReelSymbol, id: string): ReelSymbol {
    this.container.removeChild(outgoing.view);
    this._factory.release(outgoing);
    const next = this._factory.acquire(id);
    next.resize(this._cellW, this._cellH);
    next.view.y = 0;
    this.container.addChild(next.view);
    return next;
  }

  /** Position every conveyor slot from its index + the current sub-cell offset. */
  private _render(): void {
    const sign = this._direction === 'rtl' ? -1 : 1;
    for (let k = 0; k < this._M; k++) {
      this._slots[k].view.x = (k - 1) * this._span + sign * this._off;
    }
  }

  private _beginLanding(): void {
    this._state = 'landing';
    this._landFrom = this._off; // remaining sub-cell offset after the final shift
    this._landT = 0;
  }

  private _advanceLanding(deltaMS: number): void {
    // Short ease of the leftover sub-cell offset to a grid-aligned rest.
    this._landT += deltaMS;
    const t = Math.min(1, this._landT / 120);
    this._off = this._landFrom * (1 - t);
    this._render();
    if (t >= 1) {
      this._off = 0;
      this._render();
      this._land();
    }
  }

  private _land(): void {
    this._state = 'idle';
    const result: HorizontalSpinResult = { symbols: this._windowIds() };
    const resolve = this._resolve;
    this._resolve = null;
    this.events.emit('spin:complete', result);
    resolve?.(result);
  }

  private _windowIds(): string[] {
    return this._slots.slice(1, 1 + this.visibleCount).map((s) => s.symbolId);
  }

  private _randomId(): string {
    return this._registeredIds[Math.floor(this._rng() * this._registeredIds.length)];
  }

  private _assertRegistered(id: string): void {
    if (!this._registeredIds.includes(id)) {
      throw new Error(`HorizontalReel: id '${id}' is not registered by .symbols(...).`);
    }
  }
}
