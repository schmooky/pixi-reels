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
} from './HorizontalReelTypes.js';

/**
 * A single horizontal strip of symbols that scrolls sideways — the banner
 * that sits **above** the reels announcing which symbols pay this round.
 *
 * It is deliberately not a matrix and not a reel-set: one row, no spin
 * lifecycle, no win lines. The engine's {@link Reel} wraps on the Y axis and
 * bakes that in throughout; a horizontal marquee is a different axis, so this
 * is its own small mechanism built on the same shared primitives — the
 * {@link SymbolFactory} pool, {@link TickerRef}, {@link EventEmitter} and the
 * {@link Disposable} contract — rather than a rotated reel.
 *
 * `content` is the looping sequence of symbol ids to show; the strip cycles it
 * forever. It travels either `ltr` or `rtl`, in one of two modes: `scroll`
 * (smooth marquee) or `cascade` (discrete one-cell steps, the tumble reveal on
 * its side). Symbols recycle through the pool as they wrap, so a long content
 * list costs no more instances than a short one.
 *
 * ```ts
 * const strip = new HorizontalReelBuilder()
 *   .visibleCount(4).cellSize(72, 72, { gap: 6 })
 *   .direction('rtl').scroll(1.4)
 *   .symbols((r) => { for (const id of PAY_IDS) r.register(id, PaySymbol, opts); })
 *   .content(PAY_IDS)
 *   .ticker(app.ticker)
 *   .build();
 * app.stage.addChild(strip.container);
 *
 * strip.events.on('symbol:entered', ({ id }) => hud.flash(id));
 * // later, when the paying set changes:
 * strip.setContent(nextRoundPayIds);
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
  private readonly _factory: SymbolFactory;
  private readonly _tickerRef: TickerRef;
  private readonly _cfg: HorizontalReelConfig;
  private readonly _registeredIds: Set<string>;

  /** Live instances on the strip, in creation order (not visual order). */
  private readonly _strip: ReelSymbol[] = [];
  private _content: string[];
  private _feedIndex = 0;
  private _direction: HorizontalDirection;
  private _running = false;
  private _destroyed = false;

  // Cascade stepping state.
  private _phase: 'wait' | 'step' = 'wait';
  private _acc = 0; // ms accumulated in the current phase
  private _stepApplied = 0; // px of the current step already displaced
  private _stepCount = 0;

  constructor(cfg: HorizontalReelConfig) {
    if (!cfg.ticker) throw new Error('HorizontalReel: a ticker is required.');
    if (cfg.content.length === 0) {
      throw new Error('HorizontalReel: .content(...) needs at least one symbol id.');
    }
    this._cfg = cfg;
    this.visibleCount = cfg.visibleCount;
    this._cellW = cfg.cellWidth;
    this._cellH = cfg.cellHeight;
    this._span = cfg.cellWidth + cfg.gap;
    this._windowWidth = cfg.visibleCount * this._span - cfg.gap;
    this._direction = cfg.direction;
    this._content = [...cfg.content];

    this.container = new Container();

    const registry = new SymbolRegistry();
    cfg.configurator(registry);
    this._registeredIds = new Set(registry.symbolIds);
    for (const id of this._content) this._assertRegistered(id);
    this._factory = new SymbolFactory(registry);

    if (cfg.chrome) {
      const bg = new Graphics();
      cfg.chrome(bg, this._windowWidth, this._cellH);
      this.container.addChild(bg);
    }

    // Mask the strip to the visible window so wrapped/buffer symbols never
    // paint past the edges.
    const mask = new Graphics().rect(0, 0, this._windowWidth, this._cellH).fill(0xffffff);
    this.container.addChild(mask);
    this.container.mask = mask;

    this._layout();
    this._tickerRef = new TickerRef(cfg.ticker);
    this._tickerRef.add((t) => this._tick(t));
    if (cfg.autoStart) this.start();
  }

  /** Pixel width of the visible window. */
  get width(): number {
    return this._windowWidth;
  }
  /** Pixel height of the strip. */
  get height(): number {
    return this._cellH;
  }
  get isRunning(): boolean {
    return this._running;
  }
  get direction(): HorizontalDirection {
    return this._direction;
  }
  get isDestroyed(): boolean {
    return this._destroyed;
  }

  /** Begin (or resume) motion. Idempotent. */
  start(): void {
    this._running = true;
  }

  /** Freeze the strip in place. Idempotent. Keeps the ticker subscription. */
  stop(): void {
    this._running = false;
  }

  /** Flip travel direction. The feed edge swaps; the strip self-corrects on the next wrap. */
  setDirection(direction: HorizontalDirection): void {
    this._direction = direction;
  }

  /**
   * Replace the looping symbol sequence — the new "these pay this round" set.
   * Symbols already on the strip keep scrolling until they recycle, so the new
   * set fades in naturally over one loop rather than snapping.
   */
  setContent(ids: string[]): void {
    if (ids.length === 0) {
      throw new Error('HorizontalReel: setContent(...) needs at least one symbol id.');
    }
    for (const id of ids) this._assertRegistered(id);
    this._content = [...ids];
    this._feedIndex = 0;
  }

  /**
   * The live symbol instance at visible slot `index`, counted left→right from 0.
   * Mid-scroll the slots are between grid positions; this returns the instance
   * whose left edge currently sits in that slot band. Throws for out-of-range.
   */
  symbolAt(index: number): ReelSymbol {
    if (index < 0 || index >= this.visibleCount) {
      throw new Error(`HorizontalReel: slot ${index} is outside 0..${this.visibleCount - 1}.`);
    }
    const visible = this._strip
      .filter((s) => s.view.x + this._cellW > 0 && s.view.x < this._windowWidth)
      .sort((a, b) => a.view.x - b.view.x);
    const hit = visible[index];
    if (!hit) throw new Error(`HorizontalReel: no symbol currently in slot ${index}.`);
    return hit;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._running = false;
    this._tickerRef.destroy();
    this.events.removeAllListeners();
    for (const s of this._strip) s.destroy();
    this._strip.length = 0;
    this._factory.destroy();
    this.container.destroy({ children: true });
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Seed `visibleCount + 1` instances: the visible row plus one off-edge buffer. */
  private _layout(): void {
    const n = this.visibleCount + 1;
    // ltr feeds from the left, so park the buffer one span off the left edge;
    // rtl feeds from the right, buffer parked one span off the right edge.
    const shift = this._direction === 'ltr' ? -this._span : 0;
    for (let i = 0; i < n; i++) {
      const id = this._content[this._feedIndex % this._content.length];
      this._feedIndex++;
      const symbol = this._factory.acquire(id);
      symbol.resize(this._cellW, this._cellH);
      symbol.view.x = i * this._span + shift;
      symbol.view.y = 0;
      this.container.addChild(symbol.view);
      this._strip.push(symbol);
    }
  }

  private _tick(ticker: Ticker): void {
    if (!this._running || this._destroyed) return;
    if (this._cfg.mode === 'scroll') {
      const sign = this._direction === 'rtl' ? -1 : 1;
      this._displace(sign * this._cfg.speed * ticker.deltaTime);
      return;
    }
    this._tickCascade(ticker.deltaMS);
  }

  private _tickCascade(deltaMS: number): void {
    const sign = this._direction === 'rtl' ? -1 : 1;
    this._acc += deltaMS;
    if (this._phase === 'wait') {
      if (this._acc < this._cfg.cascade.interval) return;
      this._acc -= this._cfg.cascade.interval;
      this._phase = 'step';
      this._stepApplied = 0;
    }
    // step phase
    const t = Math.min(1, this._acc / this._cfg.cascade.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease-in-out quad
    const target = eased * this._span * sign;
    this._displace(target - this._stepApplied);
    this._stepApplied = target;
    if (t >= 1) {
      this._phase = 'wait';
      this._acc = 0;
      this._stepCount++;
      this.events.emit('cascade:step', { step: this._stepCount });
    }
  }

  /** Move every instance by `dx` px and wrap any that leave the window. */
  private _displace(dx: number): void {
    if (dx === 0) return;
    for (const s of this._strip) s.view.x += dx;
    if (dx < 0) {
      // Moving left: symbols fall off the left edge, re-enter from the right.
      while (true) {
        const left = this._minByX();
        if (left.view.x > -this._cellW) break;
        this._wrap(left, this._maxX() + this._span, 'right');
      }
    } else {
      // Moving right: symbols fall off the right edge, re-enter from the left.
      while (true) {
        const right = this._maxByX();
        if (right.view.x < this._windowWidth) break;
        this._wrap(right, this._minX() - this._span, 'left');
      }
    }
  }

  /** Recycle `outgoing` to a new position + next feed id, keeping pool churn minimal. */
  private _wrap(outgoing: ReelSymbol, x: number, edge: 'left' | 'right'): void {
    const id = this._content[this._feedIndex % this._content.length];
    this._feedIndex++;
    const idx = this._strip.indexOf(outgoing);
    this.container.removeChild(outgoing.view);
    this._factory.release(outgoing);
    const next = this._factory.acquire(id);
    next.resize(this._cellW, this._cellH);
    next.view.x = x;
    next.view.y = 0;
    this.container.addChild(next.view);
    this._strip[idx] = next;
    this.events.emit('symbol:entered', { id, edge });
  }

  private _minByX(): ReelSymbol {
    return this._strip.reduce((m, s) => (s.view.x < m.view.x ? s : m));
  }
  private _maxByX(): ReelSymbol {
    return this._strip.reduce((m, s) => (s.view.x > m.view.x ? s : m));
  }
  private _minX(): number {
    return this._minByX().view.x;
  }
  private _maxX(): number {
    return this._maxByX().view.x;
  }

  private _assertRegistered(id: string): void {
    if (!this._registeredIds.has(id)) {
      throw new Error(`HorizontalReel: content id '${id}' is not registered by .symbols(...).`);
    }
  }
}
