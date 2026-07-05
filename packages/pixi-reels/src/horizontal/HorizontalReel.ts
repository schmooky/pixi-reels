import { Container, Graphics } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import { EventEmitter } from '../events/EventEmitter.js';
import { SymbolFactory } from '../symbols/SymbolFactory.js';
import { SymbolRegistry } from '../symbols/SymbolRegistry.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import { TickerRef } from '../utils/TickerRef.js';
import type { Disposable } from '../utils/Disposable.js';
import type { ColumnTarget } from '../frame/ColumnTarget.js';
import type { SpinResult } from '../events/ReelEvents.js';
import type {
  HorizontalDirection,
  HorizontalReelConfig,
  HorizontalReelEvents,
} from './HorizontalReelTypes.js';

/** A symbol tweening from `fromX` to its resting `toX` during a cascade. */
interface CascadeMove {
  inst: ReelSymbol;
  fromX: number;
  toX: number;
}

/**
 * A single horizontal reel — the banner reel that sits **above** the reels
 * announcing which symbols pay this round.
 *
 * It is one row, oriented sideways, and it follows the same contract as
 * {@link ReelSet}:
 *
 *   - `spin()` starts it and returns a promise.
 *   - `setResult(ids)` hands it the round's paying symbols (one per visible
 *     cell) and triggers the stop; the `spin()` promise resolves on land.
 *   - `cascade(winners, newIds?)` is the tumble: the winning cells **fall
 *     away** and replacements **drop in**, exactly like the main reels'
 *     cascade. Pass every cell for a full "they all drop", or just the cells
 *     that were part of a winning combination.
 *
 * The engine's {@link Reel} wraps on the Y axis and bakes that in throughout, so
 * this is its own small mechanism on the shared primitives (the
 * {@link SymbolFactory} pool, {@link TickerRef}, the typed {@link EventEmitter})
 * rather than a rotated reel.
 *
 * ```ts
 * const spin = strip.spin();
 * strip.setResult([{ visible: ['A','K','Q','J'] }]); // one ColumnTarget (this reel)
 * await spin;
 * // main reel reports A and Q were in a win → those cells tumble:
 * await strip.cascade([0, 2], ['WILD','K']);
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
  private _state: 'idle' | 'spinning' | 'stopping' | 'landing' | 'cascading' = 'idle';
  private _queue: string[] = [];
  private _resolve: ((r: SpinResult) => void) | null = null;
  private _spinStart = 0;
  private _wasSkipped = false;
  private _landFrom = 0;
  private _landT = 0;
  private _destroyed = false;

  // Cascade state.
  private _cascadeT = 0;
  private _cascadeRemoving: ReelSymbol[] = []; // winners being destroyed
  private _cascadeMoving: CascadeMove[] = []; // survivors collapsing + new symbols refilling
  private _cascadeFinalWindow: ReelSymbol[] = []; // the window instances after the tumble
  private _cascadeWinners: number[] = [];
  private _cascadeResolve: (() => void) | null = null;

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
    if (cfg.initialFrame.length !== 1) {
      throw new Error(
        `HorizontalReel: initialFrame takes exactly one ColumnTarget (this reel); got ${cfg.initialFrame.length}.`,
      );
    }
    const initialIds = cfg.initialFrame[0].visible;
    for (const id of initialIds) this._assertRegistered(id);
    if (initialIds.length !== cfg.visibleCount) {
      throw new Error(
        `HorizontalReel: initialFrame visible must have exactly ${cfg.visibleCount} ids (got ${initialIds.length}).`,
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

    this._layout(initialIds);
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
    return this._state === 'spinning' || this._state === 'stopping' || this._state === 'landing';
  }
  get isCascading(): boolean {
    return this._state === 'cascading';
  }
  get isDestroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Start spinning. Resolves with the landed result once {@link setResult} has
   * been called and the strip settles (or {@link skipSpin} slams it). Mirrors
   * `ReelSet.spin()`. Throws if not idle.
   */
  spin(): Promise<SpinResult> {
    if (this._state !== 'idle') {
      throw new Error('HorizontalReel: not idle — await the previous spin()/cascade() first.');
    }
    this._state = 'spinning';
    this._queue = [];
    this._wasSkipped = false;
    this._spinStart = performance.now();
    this.events.emit('spin:start');
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /**
   * Hand the reel the round's paying symbols and trigger the stop. Takes the
   * same `ColumnTarget[]` as `ReelSet.setResult` — this reel is a single column,
   * so pass exactly one entry whose `visible` holds `visibleCount` ids,
   * left-to-right. Mirrors `ReelSet.setResult(...)`. Throws if not spinning.
   */
  setResult(symbols: ColumnTarget[]): void {
    if (this._state !== 'spinning') {
      throw new Error('HorizontalReel: call spin() before setResult().');
    }
    if (symbols.length !== 1) {
      throw new Error(
        `HorizontalReel: setResult takes exactly one ColumnTarget (this reel); got ${symbols.length}.`,
      );
    }
    const target = symbols[0];
    if (target.bufferAbove?.some((v) => v !== undefined) || target.bufferBelow?.some((v) => v !== undefined)) {
      throw new Error('HorizontalReel: setResult does not support bufferAbove/bufferBelow (single-row reel).');
    }
    const ids = target.visible;
    this._assertResultShape(ids);
    // The last `visibleCount` symbols to feed must be the result, in the order
    // that lands them left-to-right, plus one trailing buffer feed. rtl feeds
    // the window in order; ltr feeds it reversed (see _doShift).
    const windowFeeds = this._direction === 'rtl' ? [...ids] : [...ids].reverse();
    this._queue = [...windowFeeds, this._randomId()];
    this._state = 'stopping';
  }

  /**
   * Slam to the result immediately. Mirrors `ReelSet.skipSpin()`. Requires a
   * result to have been set.
   */
  skipSpin(): void {
    if (this._state !== 'stopping' && this._state !== 'landing') {
      throw new Error('HorizontalReel: skipSpin() needs a pending result — call setResult() first.');
    }
    this._wasSkipped = true;
    while (this._queue.length > 0) this._doShift(this._queue.shift() as string);
    this._off = 0;
    this._render();
    this._land();
  }

  /**
   * Tumble the winning cells — a real cascade with removal, the same mechanic
   * the main reels run, one row wide:
   *
   *   1. the `winners` symbols are **removed** (destroyed, they poof out);
   *   2. the survivors **collapse** toward the settle edge to close the gaps,
   *      keeping their left-to-right order;
   *   3. `winners.length` **new symbols slide in from the feed edge** — the same
   *      side the spin brings symbols from (`rtl` from the right, `ltr` from the
   *      left) — to fill the freed slots.
   *
   * `winners` are visible indices (left-to-right from 0); pass every index for a
   * full "they all drop". `newIds` are the incoming symbols (one per winner, in
   * feed order); defaults to random. Resolves once the tumble settles and fires
   * `cascade:complete`. Throws unless idle (a spin must have landed first).
   */
  cascade(winners: number[], newIds?: string[]): Promise<void> {
    if (this._state !== 'idle') {
      throw new Error('HorizontalReel: cascade() needs the reel idle — await spin()/cascade() first.');
    }
    const unique = [...new Set(winners)];
    if (unique.length !== winners.length) {
      throw new Error('HorizontalReel: cascade() winners must be unique.');
    }
    for (const w of winners) {
      if (w < 0 || w >= this.visibleCount) {
        throw new Error(`HorizontalReel: cascade() winner ${w} is outside 0..${this.visibleCount - 1}.`);
      }
    }
    const replacements = newIds ?? winners.map(() => this._randomId());
    if (replacements.length !== winners.length) {
      throw new Error('HorizontalReel: cascade() newIds must match winners length.');
    }
    for (const id of replacements) this._assertRegistered(id);
    if (winners.length === 0) return Promise.resolve();

    const winnerSet = new Set(winners);
    const window = this._slots.slice(1, 1 + this.visibleCount); // current visible instances
    const removed = winners.map((w) => window[w]);
    const survivors = window.filter((_, i) => !winnerSet.has(i)); // kept, in order

    // New symbols enter from the feed edge; acquire them now.
    const news = replacements.map((id) => {
      const inst = this._factory.acquire(id);
      inst.resize(this._cellW, this._cellH);
      inst.view.y = 0;
      this.container.addChild(inst.view); // added last → draws over what it crosses
      return inst;
    });

    // Post-tumble window: survivors collapse to the settle side, new symbols
    // fill the feed side. rtl feeds from the right (settle left); ltr the mirror.
    const finalWindow =
      this._direction === 'rtl' ? [...survivors, ...news] : [...news, ...survivors];
    this._cascadeFinalWindow = finalWindow;

    // Off-window start, one full window to the feed side, so the new symbols
    // slide in as a rigid train from off-screen without crossing survivors.
    const offset = this.visibleCount * this._span;
    this._cascadeMoving = finalWindow.map((inst, j) => {
      const toX = j * this._span;
      const isNew = news.includes(inst);
      const fromX = isNew ? toX - this._feedSign() * offset : inst.view.x;
      if (isNew) {
        inst.view.x = fromX;
        inst.view.alpha = 1;
      }
      return { inst, fromX, toX };
    });
    this._cascadeRemoving = removed;
    this._cascadeWinners = [...winners];
    this._cascadeT = 0;
    this._state = 'cascading';
    return new Promise((resolve) => {
      this._cascadeResolve = resolve;
    });
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
    // Destroy any cascade-in-flight instances not yet folded into _slots
    // (removing winners + incoming new symbols). destroy() is idempotent, so
    // survivors already in _slots are safe to hit again below.
    for (const c of this._cascadeRemoving) if (!c.isDestroyed) c.destroy();
    for (const m of this._cascadeMoving) if (!m.inst.isDestroyed) m.inst.destroy();
    this._cascadeRemoving = [];
    this._cascadeMoving = [];
    this._cascadeFinalWindow = [];
    for (const s of this._slots) s.destroy();
    this._slots.length = 0;
    this._factory.destroy();
    this.container.destroy({ children: true });
    // A spin in flight when destroyed resolves so awaiters don't hang forever.
    this._resolve?.({ symbols: [[]], wasSkipped: true, duration: 0 });
    this._resolve = null;
    this._cascadeResolve?.();
    this._cascadeResolve = null;
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
    if (this._state === 'cascading') {
      this._advanceCascade(ticker.deltaMS);
      return;
    }
    if (this._state === 'landing') {
      this._advanceLanding(ticker.deltaMS);
      return;
    }
    this._advanceSpin(ticker.deltaTime);
  }

  private _advanceSpin(dt: number): void {
    // Ease speed down as the stop queue drains, so it decelerates into the land.
    const drain =
      this._state === 'stopping' ? Math.max(0.28, this._queue.length / (this.visibleCount + 1)) : 1;
    this._off += this._cfg.speed * dt * drain;
    while (this._off >= this._span) {
      this._off -= this._span;
      this._doShift(this._nextFeed());
      if (this._state === 'landing') break; // finalized inside _nextFeed
    }
    this._render();
  }

  private _nextFeed(): string {
    if (this._state === 'stopping') {
      const id = this._queue.shift() as string;
      if (this._queue.length === 0) this._beginLanding();
      return id;
    }
    return this._randomId();
  }

  /** Move the conveyor one cell in the travel direction, feeding `id` at the tail. */
  private _doShift(id: string): void {
    if (this._direction === 'rtl') {
      const leaving = this._slots.shift() as ReelSymbol; // leftmost leaves
      this._slots.push(this._repaint(leaving, id)); // enters at the right
    } else {
      const leaving = this._slots.pop() as ReelSymbol; // rightmost leaves
      this._slots.unshift(this._repaint(leaving, id)); // enters at the left
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
    this._landFrom = this._off; // leftover sub-cell offset after the final shift
    this._landT = 0;
  }

  private _advanceLanding(deltaMS: number): void {
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
    // Single-reel SpinResult: a one-column grid, same shape as ReelSet's.
    const result: SpinResult = {
      symbols: [this._windowIds()],
      wasSkipped: this._wasSkipped,
      duration: performance.now() - this._spinStart,
    };
    const resolve = this._resolve;
    this._resolve = null;
    this.events.emit('spin:complete', result);
    resolve?.(result);
  }

  private _advanceCascade(deltaMS: number): void {
    this._cascadeT += deltaMS;
    const fall = this._cfg.cascade.fall;
    const drop = this._cfg.cascade.drop;
    // Phase 1: winners are removed (shrink + fade out).
    const rt = Math.min(1, this._cascadeT / fall);
    for (const out of this._cascadeRemoving) {
      out.view.alpha = 1 - rt;
      out.view.scale.set(1 - 0.4 * rt);
    }
    // Phase 2: survivors collapse into the gaps and new symbols slide in from
    // the feed edge, both easing to their resting slots.
    const mt = this._cascadeT <= fall ? 0 : Math.min(1, (this._cascadeT - fall) / drop);
    const eased = 1 - (1 - mt) * (1 - mt);
    for (const mv of this._cascadeMoving) {
      mv.inst.view.x = mv.fromX + (mv.toX - mv.fromX) * eased;
    }
    if (this._cascadeT >= fall + drop) this._finishCascade();
  }

  private _finishCascade(): void {
    // Winners are gone.
    for (const out of this._cascadeRemoving) {
      this.container.removeChild(out.view);
      this._factory.release(out);
    }
    // Snap the collapsed + refilled window to rest and rebuild the conveyor
    // (buffers at either end are untouched).
    this._cascadeFinalWindow.forEach((inst, j) => {
      inst.view.x = j * this._span;
      inst.view.y = 0;
      inst.view.alpha = 1;
      inst.view.scale.set(1);
      this._slots[j + 1] = inst;
    });
    const winners = this._cascadeWinners;
    this._cascadeRemoving = [];
    this._cascadeMoving = [];
    this._cascadeFinalWindow = [];
    this._cascadeWinners = [];
    this._state = 'idle';
    const resolve = this._cascadeResolve;
    this._cascadeResolve = null;
    this.events.emit('cascade:complete', { winners, symbols: this._windowIds() });
    resolve?.();
  }

  private _windowIds(): string[] {
    return this._slots.slice(1, 1 + this.visibleCount).map((s) => s.symbolId);
  }

  /** Motion sign of the spin: `-1` (rtl, symbols feed from the right) or `+1` (ltr). */
  private _feedSign(): number {
    return this._direction === 'rtl' ? -1 : 1;
  }

  private _randomId(): string {
    return this._registeredIds[Math.floor(this._rng() * this._registeredIds.length)];
  }

  private _assertResultShape(ids: string[]): void {
    if (ids.length !== this.visibleCount) {
      throw new Error(
        `HorizontalReel: setResult needs exactly ${this.visibleCount} ids (got ${ids.length}).`,
      );
    }
    for (const id of ids) this._assertRegistered(id);
  }

  private _assertRegistered(id: string): void {
    if (!this._registeredIds.includes(id)) {
      throw new Error(`HorizontalReel: id '${id}' is not registered by .symbols(...).`);
    }
  }
}
