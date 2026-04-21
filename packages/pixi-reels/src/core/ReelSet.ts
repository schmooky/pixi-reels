import { Container } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { SpeedProfile, ReelSetInternalConfig } from '../config/types.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSetEvents, SpinResult, SymbolPosition } from '../events/ReelEvents.js';
import { Reel } from './Reel.js';
import { ReelViewport } from './ReelViewport.js';
import { SpinController } from '../spin/SpinController.js';
import { SpeedManager } from '../speed/SpeedManager.js';
import { SymbolSpotlight, type SpotlightOptions, type WinLine, type CycleOptions } from '../spotlight/SymbolSpotlight.js';
import type { SymbolFactory } from '../symbols/SymbolFactory.js';
import type { FrameBuilder } from '../frame/FrameBuilder.js';
import type { PhaseFactory } from '../spin/phases/PhaseFactory.js';
import type { SpinningMode } from '../spin/modes/SpinningMode.js';
import type { CellPin, CellPinOptions, PinExpireReason } from '../pins/CellPin.js';
import { pinKey } from '../pins/CellPin.js';

export interface ReelSetParams {
  config: ReelSetInternalConfig;
  reels: Reel[];
  viewport: ReelViewport;
  symbolFactory: SymbolFactory;
  frameBuilder: FrameBuilder;
  phaseFactory: PhaseFactory;
  spinningMode: SpinningMode;
}

/**
 * The whole slot board as one object.
 *
 * A `ReelSet` is a PixiJS `Container` that owns every reel, the spin
 * controller, the speed manager, and the win spotlight. You `addChild` it
 * to your stage and then drive it from the four public verbs below:
 *
 *   - `spin()` — start the reels moving, returns a promise that resolves
 *     when every reel has landed (or been slam-stopped)
 *   - `setResult(grid)` — tell the reels what to land on; the spin
 *     controller consumes this and each reel queues its target symbols
 *   - `setAnticipation(reelIndices)` — slow the given reels before they
 *     stop, for "will the third scatter land?" tension
 *   - `skip()` — land immediately; useful for slam-stop UX
 *
 * Everything else is subsystems: `speed`, `spotlight`, `events`, `viewport`.
 * Construction goes through {@link ReelSetBuilder}, never `new ReelSet()`
 * directly — the builder enforces that every required piece is wired.
 *
 * ```ts
 * const reelSet = new ReelSetBuilder()
 *   .reels(5).visibleSymbols(3).symbolSize(140, 140)
 *   .symbols((r) => r.register('cherry', SpriteSymbol, { textures }))
 *   .ticker(app.ticker)
 *   .build();
 * app.stage.addChild(reelSet);
 *
 * const spin = reelSet.spin();
 * reelSet.setResult(await server.spin());
 * await spin;
 * ```
 *
 * Teardown cascades: one `reelSet.destroy()` disposes every child.
 */
export class ReelSet extends Container implements Disposable {
  private _events = new EventEmitter<ReelSetEvents>();
  private _reels: Reel[];
  private _viewport: ReelViewport;
  private _spinController: SpinController;
  private _speedManager: SpeedManager;
  private _spotlight: SymbolSpotlight;
  private _symbolFactory: SymbolFactory;
  private _isDestroyed = false;
  private _pins = new Map<string, CellPin>();

  constructor(params: ReelSetParams) {
    super();

    this._reels = params.reels;
    this._viewport = params.viewport;
    this._symbolFactory = params.symbolFactory;

    // Speed manager
    this._speedManager = new SpeedManager(
      params.config.speeds,
      params.config.initialSpeed,
    );

    // Spin controller
    this._spinController = new SpinController(
      params.reels,
      this._speedManager,
      params.frameBuilder,
      params.phaseFactory,
      this._events,
      params.config.ticker,
      params.spinningMode,
    );

    // Spotlight
    this._spotlight = new SymbolSpotlight(params.reels, params.viewport);

    // Add viewport to display
    this.addChild(this._viewport);

    // Pin lifecycle: decrement numeric turns when the spin lands; clear 'eval'
    // pins when the next spin starts.
    this._events.on('spin:allLanded', () => this._onSpinLanded());
    this._events.on('spin:start', () => this._onSpinStart());
  }

  // ─── Event system ──────────────────────────────────────────
  // Uses a dedicated emitter to avoid collision with PixiJS Container events.

  /** The event emitter for reel-specific events. */
  get events(): EventEmitter<ReelSetEvents> {
    return this._events;
  }

  // ─── Spin API ─────────────────────────────────────────────

  /** Start spinning all reels. Returns a promise that resolves when all reels land. */
  async spin(): Promise<SpinResult> {
    return this._spinController.spin();
  }

  /**
   * Set the target result symbols. Triggers the stop sequence.
   *
   * If any pins are active (`reelSet.pin(...)`), their symbols are overlaid
   * onto the result before it reaches the stop sequencer — so pinned cells
   * always land on the pin's `symbolId` regardless of what the server sent.
   */
  setResult(symbols: string[][]): void {
    const withPins = this._applyPinsToGrid(symbols);
    this._spinController.setResult(withPins);
  }

  /** Set which reels should show anticipation before stopping. */
  setAnticipation(reelIndices: number[]): void {
    this._spinController.setAnticipation(reelIndices);
  }

  /**
   * Override the per-reel stop delay for the current spin (in ms).
   * Pass one value per reel. Cleared at the start of each new spin.
   *
   * @example
   * // Stagger the last two reels more than the default for dramatic effect:
   * reelSet.setStopDelays([0, 140, 280, 600, 1100]);
   */
  setStopDelays(delays: number[]): void {
    this._spinController.setStopDelays(delays);
  }

  /** Skip/slam-stop: immediately land all reels on target. */
  skip(): void {
    this._spinController.skip();
  }

  /**
   * Set the drop order for cascade drop-in mechanics.
   *
   * A convenience wrapper over setStopDelays() for common patterns.
   * The stagger step defaults to the active speed profile's stopDelay
   * (or 150 ms if stopDelay is 0).
   *
   * Call this before or after setResult() — both work.
   *
   * @example
   * reelSet.setDropOrder('ltr');  // left-to-right
   * reelSet.setDropOrder('rtl');  // right-to-left
   * reelSet.setDropOrder('all');  // all columns simultaneously
   * reelSet.setDropOrder([0, 0, 200, 200, 400]); // custom per-reel delays
   */
  setDropOrder(order: 'ltr' | 'rtl' | 'all' | number[], stepMs?: number): void {
    if (Array.isArray(order)) {
      this._spinController.setStopDelays(order);
      return;
    }

    const n = this._reels.length;
    const step = stepMs ?? Math.max(this._speedManager.active.stopDelay, 150);
    let delays: number[];

    if (order === 'all') {
      delays = new Array(n).fill(0);
    } else if (order === 'ltr') {
      delays = Array.from({ length: n }, (_, i) => i * step);
    } else {
      delays = Array.from({ length: n }, (_, i) => (n - 1 - i) * step);
    }

    this._spinController.setStopDelays(delays);
  }

  get isSpinning(): boolean {
    return this._spinController.isSpinning;
  }

  // ─── Speed API ────────────────────────────────────────────

  /** Speed profile manager. */
  get speed(): SpeedManager {
    return this._speedManager;
  }

  /** Change speed and emit event. */
  setSpeed(name: string): void {
    const { previous, current } = this._speedManager.set(name);
    this._events.emit('speed:changed', current, previous);
  }

  // ─── Spotlight API ────────────────────────────────────────

  get spotlight(): SymbolSpotlight {
    return this._spotlight;
  }

  // ─── Reel access ──────────────────────────────────────────

  /** Get all reels. */
  get reels(): readonly Reel[] {
    return this._reels;
  }

  /** Get a reel by index. */
  getReel(index: number): Reel {
    return this._reels[index];
  }

  /** Get the viewport. */
  get viewport(): ReelViewport {
    return this._viewport;
  }

  // ─── Pins (persistent cell claims) ────────────────────────
  //
  // A `CellPin` claims a grid cell: the strip cannot overwrite it, and
  // `setResult()` overlays the pin's symbolId at that cell before the
  // stop sequence runs. Pins persist across spins according to their
  // `turns` field. See `CellPin` for the full semantics.

  /**
   * Pin a symbol to a grid cell. Applied immediately if the reel is idle;
   * applied at the next `setResult()` otherwise. Fires `pin:placed`.
   *
   * Passing the same `(col, row)` replaces the previous pin — the old one
   * is replaced silently (no `pin:expired` fires for replacement).
   *
   * @example
   * // Sticky wild for 3 spins
   * reelSet.pin(2, 1, 'wild', { turns: 3 })
   *
   * // Hold & Win coin with a payout value
   * reelSet.pin(col, row, 'coin', { turns: 'permanent', payload: { value: 50 } })
   *
   * // Expanding wild — fill column for the current spin's evaluation only
   * for (let r = 0; r < 3; r++) reelSet.pin(2, r, 'wild', { turns: 'eval' })
   */
  pin(col: number, row: number, symbolId: string, options?: CellPinOptions): CellPin {
    if (col < 0 || col >= this._reels.length) {
      throw new Error(`pin(): col ${col} out of range [0, ${this._reels.length})`);
    }
    const reel = this._reels[col];
    if (row < 0 || row >= reel.visibleRows) {
      throw new Error(`pin(): row ${row} out of range [0, ${reel.visibleRows})`);
    }

    const pin: CellPin = {
      col,
      row,
      symbolId,
      turns: options?.turns ?? 'permanent',
      payload: options?.payload,
    };

    this._pins.set(pinKey(col, row), pin);

    // If the reel is idle (not spinning), apply the pin visually now so the
    // grid matches what `pins` reports.
    if (!this._spinController.isSpinning) {
      this._applyPinVisually(col, row, symbolId);
    }

    this._events.emit('pin:placed', pin);
    return pin;
  }

  /**
   * Remove a pin at `(col, row)`. If no pin exists at that cell, this is a
   * no-op. Fires `pin:expired` with reason `'explicit'`.
   */
  unpin(col: number, row: number): void {
    const key = pinKey(col, row);
    const pin = this._pins.get(key);
    if (!pin) return;
    this._pins.delete(key);
    this._events.emit('pin:expired', pin, 'explicit');
  }

  /**
   * All active pins, keyed by `"col:row"`.
   *
   * Reads are safe at any time — during a spin the map reflects pins that
   * will apply to the NEXT `setResult()`, not the one already in flight.
   */
  get pins(): ReadonlyMap<string, CellPin> {
    return this._pins;
  }

  /** Convenience: get the pin at `(col, row)` or `undefined`. */
  getPin(col: number, row: number): CellPin | undefined {
    return this._pins.get(pinKey(col, row));
  }

  // ─── Lifecycle ────────────────────────────────────────────

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;

    this._spotlight.destroy();
    this._spinController.destroy();

    for (const reel of this._reels) {
      reel.destroy();
    }

    this._symbolFactory.destroy();
    this._viewport.destroy();
    this._pins.clear();
    this._events.emit('destroyed');
    this._events.removeAllListeners();

    super.destroy({ children: true });
  }

  // ─── Pin internals ────────────────────────────────────────

  /**
   * Return a deep copy of `symbols` with active pins overlaid. Pure — does
   * not mutate the input. When there are no pins, returns the input as-is
   * (fast path; identical behaviour to pre-pin code).
   */
  private _applyPinsToGrid(symbols: string[][]): string[][] {
    if (this._pins.size === 0) return symbols;

    const cloned = symbols.map((col) => [...col]);
    for (const pin of this._pins.values()) {
      if (pin.col < cloned.length && pin.row < cloned[pin.col].length) {
        cloned[pin.col][pin.row] = pin.symbolId;
      }
    }
    return cloned;
  }

  /**
   * Apply a pin to the idle reel's visible display immediately. Used when
   * `pin()` is called while no spin is in flight — the grid updates right
   * away so `getVisibleSymbols()` reflects the pin.
   */
  private _applyPinVisually(col: number, row: number, symbolId: string): void {
    const reel = this._reels[col];
    const current = reel.getVisibleSymbols();
    if (current[row] === symbolId) return; // already there
    current[row] = symbolId;
    reel.placeSymbols(current);
  }

  /**
   * Fires on `spin:allLanded`. Numeric-turns pins decrement; pins that hit
   * zero expire with reason `'turns'`. Non-numeric (`'eval'`, `'permanent'`)
   * are untouched here.
   */
  private _onSpinLanded(): void {
    if (this._pins.size === 0) return;

    const expired: CellPin[] = [];
    for (const pin of this._pins.values()) {
      if (typeof pin.turns === 'number') {
        pin.turns -= 1;
        if (pin.turns <= 0) expired.push(pin);
      }
    }

    for (const pin of expired) {
      this._pins.delete(pinKey(pin.col, pin.row));
      this._events.emit('pin:expired', pin, 'turns' as PinExpireReason);
    }
  }

  /**
   * Fires on `spin:start`. Clears every `'eval'` pin from the previous spin
   * — they served their purpose during that spin's evaluation.
   */
  private _onSpinStart(): void {
    if (this._pins.size === 0) return;

    const expired: CellPin[] = [];
    for (const pin of this._pins.values()) {
      if (pin.turns === 'eval') expired.push(pin);
    }

    for (const pin of expired) {
      this._pins.delete(pinKey(pin.col, pin.row));
      this._events.emit('pin:expired', pin, 'eval' as PinExpireReason);
    }
  }
}
