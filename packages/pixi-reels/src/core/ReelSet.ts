import { Container } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { SpeedProfile, ReelSetInternalConfig, CellBounds } from '../config/types.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSetEvents, SpinResult, SymbolPosition } from '../events/ReelEvents.js';
import { Reel } from './Reel.js';
import { ReelViewport } from './ReelViewport.js';
import { SpinController } from '../spin/SpinController.js';
import { SpeedManager } from '../speed/SpeedManager.js';
import { SymbolSpotlight, type SpotlightOptions, type WinLine, type CycleOptions } from '../spotlight/SymbolSpotlight.js';
import type { SymbolFactory } from '../symbols/SymbolFactory.js';
import type { ReelSymbol } from '../symbols/ReelSymbol.js';
import type { FrameBuilder } from '../frame/FrameBuilder.js';
import type { PhaseFactory } from '../spin/phases/PhaseFactory.js';
import type { SpinningMode } from '../spin/modes/SpinningMode.js';
import type { CellPin, CellPinOptions, PinExpireReason, MovePinOptions, CellCoord } from '../pins/CellPin.js';
import { pinKey } from '../pins/CellPin.js';
import { gsap } from 'gsap';
import type { FrameMiddleware } from '../frame/FrameBuilder.js';

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
 * The runtime-mutable frame-builder pipeline exposed on `reelSet.frame`.
 * Matches `FrameBuilder.use/remove` — the internal machinery that already
 * exists; this is the ergonomic surface.
 */
export interface FrameAPI {
  /** Add a middleware. Sorted by `priority` on next frame build. */
  use(middleware: FrameMiddleware): void;
  /** Remove a middleware by `name`. No-op if absent. */
  remove(name: string): void;
  /** Current middleware list in registration order. */
  readonly middleware: ReadonlyArray<FrameMiddleware>;
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
  /** zIndex applied to pin overlays so they render above the reel strip. */
  private static readonly PIN_OVERLAY_Z_INDEX = 10000;

  private _events = new EventEmitter<ReelSetEvents>();
  private _reels: Reel[];
  private _viewport: ReelViewport;
  private _spinController: SpinController;
  private _speedManager: SpeedManager;
  private _spotlight: SymbolSpotlight;
  private _symbolFactory: SymbolFactory;
  private _frameBuilder: FrameBuilder;
  private _frameAPI: FrameAPI;
  private _isDestroyed = false;
  private _pins = new Map<string, CellPin>();
  /**
   * Visual overlays rendered above the reel viewport while a spin is in
   * motion. Each overlay is a pooled ReelSymbol sitting in the viewport's
   * unmaskedContainer at the pin's cell position — it keeps the pinned
   * symbol visible while the underlying reel scrolls. Created on
   * spin:start, destroyed on spin:allLanded. The pin is co-stored so
   * _destroyPinOverlay always has it available even after the pin is
   * removed from `_pins` (e.g. during unpin()).
   */
  private _pinOverlays = new Map<string, { pin: CellPin; overlay: ReelSymbol }>();

  constructor(params: ReelSetParams) {
    super();

    this._reels = params.reels;
    this._viewport = params.viewport;
    this._symbolFactory = params.symbolFactory;
    this._frameBuilder = params.frameBuilder;

    const fb = this._frameBuilder;
    this._frameAPI = {
      use(mw: FrameMiddleware): void { fb.use(mw); },
      remove(name: string): void { fb.remove(name); },
      get middleware(): ReadonlyArray<FrameMiddleware> { return fb.middleware; },
    };

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

  /**
   * Returns the bounding box of a visible grid cell in ReelSet-local
   * coordinates (i.e. relative to this Container, before any parent
   * transforms). Row 0 is the top visible row.
   *
   * Use this to place payline graphics, hit areas, or debug overlays
   * that must align with a specific symbol cell:
   *
   * ```ts
   * const b = reelSet.getCellBounds(2, 1);
   * gfx.rect(b.x, b.y, b.width, b.height).stroke({ color: 0xff6b35 });
   * reelSet.addChild(gfx);
   * ```
   *
   * To convert to stage / global coordinates use PixiJS:
   * ```ts
   * const global = reelSet.toGlobal({ x: b.x, y: b.y });
   * ```
   */
  getCellBounds(col: number, row: number): CellBounds {
    if (col < 0 || col >= this._reels.length) {
      throw new RangeError(`getCellBounds: col ${col} out of range [0, ${this._reels.length})`);
    }
    const reel = this._reels[col];
    if (row < 0 || row >= reel.visibleRows) {
      throw new RangeError(`getCellBounds: row ${row} out of range [0, ${reel.visibleRows})`);
    }
    return {
      x: this._viewport.x + reel.container.x,
      y: this._viewport.y + row * reel.motion.slotHeight,
      width: reel.symbolWidth,
      height: reel.symbolHeight,
    };
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

    const key = pinKey(col, row);
    // If we're replacing an existing pin, drop its overlay so a fresh one
    // with the new symbolId can be created.
    if (this._pins.has(key)) {
      this._destroyPinOverlay(key);
    }
    this._pins.set(key, pin);

    if (!this._spinController.isSpinning) {
      // Reel is idle: apply the pin visually on the reel itself so
      // `getVisibleSymbols()` matches what `pins` reports.
      this._applyPinVisually(col, row, symbolId);
    } else {
      // Mid-spin: create an overlay so the pinned symbol is visible
      // immediately even while the reel scrolls.
      this._ensurePinOverlay(pin);
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
    this._destroyPinOverlay(key);
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

  /**
   * Move an existing pin from one cell to another. Animates a flight symbol
   * between the two cells, updates pin state atomically, and resolves when
   * the animation completes.
   *
   * This is the engine-native replacement for ghost sprites in walking-wild
   * recipes. The flight symbol is a pooled `ReelSymbol` acquired from the
   * factory, parented briefly to the viewport's `unmaskedContainer` so it
   * can travel across reel boundaries without being clipped.
   *
   * Constraints:
   *  - Only callable at rest (throws if `isSpinning === true`).
   *  - `to` must be within the grid; no pin may already exist there.
   *  - Calling with `from === to` is a no-op that still fires `pin:moved`.
   *
   * @example
   * // Walking wild — move the pinned wild one column left each spin
   * reelSet.events.on('spin:complete', async () => {
   *   for (const pin of [...reelSet.pins.values()]) {
   *     if (pin.col > 0) {
   *       await reelSet.movePin(
   *         { col: pin.col, row: pin.row },
   *         { col: pin.col - 1, row: pin.row },
   *       );
   *     } else {
   *       reelSet.unpin(pin.col, pin.row);
   *     }
   *   }
   * });
   */
  async movePin(
    from: CellCoord,
    to: CellCoord,
    opts?: MovePinOptions,
  ): Promise<void> {
    if (this._spinController.isSpinning) {
      throw new Error('movePin(): cannot move pin while spinning');
    }

    const fromKey = pinKey(from.col, from.row);
    const pin = this._pins.get(fromKey);
    if (!pin) {
      throw new Error(
        `movePin(): no pin at (${from.col}, ${from.row})`,
      );
    }

    // Validate `to` bounds (same rules as pin()).
    if (to.col < 0 || to.col >= this._reels.length) {
      throw new Error(
        `movePin(): to col ${to.col} out of range [0, ${this._reels.length})`,
      );
    }
    const toReel = this._reels[to.col];
    if (to.row < 0 || to.row >= toReel.visibleRows) {
      throw new Error(
        `movePin(): to row ${to.row} out of range [0, ${toReel.visibleRows})`,
      );
    }

    // No-op self-move: still fire the event so callers can treat it uniformly.
    if (from.col === to.col && from.row === to.row) {
      this._events.emit('pin:moved', pin, { col: from.col, row: from.row });
      return;
    }

    const toKey = pinKey(to.col, to.row);
    if (this._pins.has(toKey)) {
      throw new Error(
        `movePin(): a pin already exists at (${to.col}, ${to.row})`,
      );
    }

    // Update pin state first (atomic). The map now reflects the new position
    // immediately — any subsequent spin sees the pin at `to`.
    this._pins.delete(fromKey);
    const movedPin: CellPin = { ...pin, col: to.col, row: to.row };
    this._pins.set(toKey, movedPin);

    // An overlay at the old cell (from a prior spin-interrupted state)
    // is no longer accurate — drop it; the flight symbol takes over.
    this._destroyPinOverlay(fromKey);

    // Gather viewport-local coordinates for both cells. The flight symbol
    // will be parented to `viewport.unmaskedContainer`, whose local space
    // matches `maskedContainer` (both sit at (0,0) inside viewport) — so
    // `reel.container.x + symbol.view.x/y` gives us the right offset.
    const fromReel = this._reels[from.col];
    const fromCellY = fromReel.getSymbolAt(from.row).view.y;
    const toCellY = toReel.getSymbolAt(to.row).view.y;
    const fromX = fromReel.container.x;
    const toX = toReel.container.x;

    // Backfill the vacated cell with a filler. Takes effect immediately —
    // the vacated cell visually swaps to the backfill while the flight
    // symbol is still in motion.
    const backfill =
      opts?.backfill ?? this._frameBuilder.randomProvider.next(false);
    const fromVisible = fromReel.getVisibleSymbols();
    fromVisible[from.row] = backfill;
    fromReel.placeSymbols(fromVisible);

    // Spawn the flight symbol on the unmasked container so it renders above
    // the reels and can cross column boundaries.
    const flight = this._symbolFactory.acquire(pin.symbolId);
    flight.resize(fromReel.symbolWidth, fromReel.symbolHeight);
    flight.view.x = fromX;
    flight.view.y = fromCellY;
    this._viewport.unmaskedContainer.addChild(flight.view);

    // onFlightCreated hook — fires after the flight symbol is in place but
    // before the tween begins. This is where consumers switch a Spine
    // symbol onto a `run` animation for the flight duration.
    try {
      opts?.onFlightCreated?.(flight);
    } catch { /* caller bug — don't let a hook kill the animation */ }

    // Tween.
    const duration = (opts?.duration ?? 400) / 1000;
    const easing = opts?.easing ?? 'power2.inOut';
    await new Promise<void>((resolve) => {
      gsap.to(flight.view, {
        x: toX,
        y: toCellY,
        duration,
        ease: easing,
        onComplete: () => resolve(),
      });
    });

    // onFlightCompleted hook — fires before releasing the flight symbol,
    // so consumers can return a Spine to `idle` or play a landing animation.
    try {
      opts?.onFlightCompleted?.(flight);
    } catch { /* ignore */ }

    // Apply the pin visually at the destination cell.
    const toVisible = toReel.getVisibleSymbols();
    toVisible[to.row] = pin.symbolId;
    toReel.placeSymbols(toVisible);

    // Release the flight symbol.
    this._viewport.unmaskedContainer.removeChild(flight.view);
    this._symbolFactory.release(flight);

    this._events.emit('pin:moved', movedPin, {
      col: from.col,
      row: from.row,
    });
  }

  // ─── Frame pipeline (strip generation) ────────────────────
  //
  // Exposes the runtime-mutable FrameBuilder middleware pipeline on ReelSet
  // so recipes can add/remove frame middleware after build — the entry
  // point for mode-specific strip changes (feature weights, mystery
  // injection, positional overrides) without a full rebuild.
  //
  // The internal machinery was already present on FrameBuilder; this is
  // pure exposure — no behaviour change for recipes that don't call it.

  /**
   * Runtime-mutable middleware pipeline for symbol-frame generation.
   *
   * @example
   * // Feature entry — swap to a middleware that injects more wilds
   * reelSet.frame.use(moreWildsMiddleware);
   *
   * // Feature exit
   * reelSet.frame.remove('more-wilds');
   */
  get frame(): FrameAPI {
    return this._frameAPI;
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

    this._destroyAllPinOverlays();
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
   * Fires on `spin:allLanded`. Destroys visual pin overlays (the actual reel
   * cells now show the pinned symbols via setResult overlay), then
   * decrements numeric-turns pins and expires pins that hit zero.
   */
  private _onSpinLanded(): void {
    // Overlays are only needed during spin motion — destroy them all.
    this._destroyAllPinOverlays();

    if (this._pins.size === 0) return;

    const expired: CellPin[] = [];
    for (const pin of this._pins.values()) {
      if (typeof pin.turns === 'number') {
        // turns is readonly on the public interface; the engine owns the
        // mutation here — cast to the mutable internal representation.
        (pin as { turns: number }).turns -= 1;
        if (pin.turns <= 0) expired.push(pin);
      }
    }

    for (const pin of expired) {
      this._pins.delete(pinKey(pin.col, pin.row));
      this._events.emit('pin:expired', pin, 'turns' as PinExpireReason);
    }
  }

  /**
   * Fires on `spin:start`. Clears every `'eval'` pin from the previous spin,
   * then creates a visual overlay for every remaining pin so its symbol
   * stays visible while the reel scrolls underneath.
   */
  private _onSpinStart(): void {
    if (this._pins.size > 0) {
      const expired: CellPin[] = [];
      for (const pin of this._pins.values()) {
        if (pin.turns === 'eval') expired.push(pin);
      }

      for (const pin of expired) {
        this._pins.delete(pinKey(pin.col, pin.row));
        this._events.emit('pin:expired', pin, 'eval' as PinExpireReason);
      }
    }

    // Create overlays for all remaining pins. The overlay is what the player
    // sees during the spin motion phase — the underlying reel cell scrolls
    // normally but is visually covered.
    for (const pin of this._pins.values()) {
      this._ensurePinOverlay(pin);
    }
  }

  /**
   * Create an overlay ReelSymbol for a pin in the viewport's unmasked
   * container. No-op if one already exists at that cell. Fires
   * `pin:overlayCreated` after the overlay is positioned and added to the
   * display list — that's the hook consumers use to drive animation state
   * (e.g. setting a Spine track).
   */
  private _ensurePinOverlay(pin: CellPin): void {
    const key = pinKey(pin.col, pin.row);
    if (this._pinOverlays.has(key)) return;

    const reel = this._reels[pin.col];
    const overlay = this._symbolFactory.acquire(pin.symbolId);
    overlay.resize(reel.symbolWidth, reel.symbolHeight);
    // Viewport.unmaskedContainer sits at (0,0) inside the viewport — same
    // local space as maskedContainer. Reel x is on maskedContainer;
    // symbol-view y is reel-local; the sum gives correct position.
    overlay.view.x = reel.container.x;
    overlay.view.y = reel.getSymbolAt(pin.row).view.y;
    overlay.view.zIndex = ReelSet.PIN_OVERLAY_Z_INDEX;
    this._viewport.unmaskedContainer.addChild(overlay.view);
    this._pinOverlays.set(key, { pin, overlay });
    this._events.emit('pin:overlayCreated', pin, overlay);
  }

  /**
   * Destroy a single pin's overlay, if present. Fires
   * `pin:overlayDestroyed` BEFORE the overlay is released to the pool, so
   * consumers can stop animations / remove listeners on a still-valid
   * instance.
   */
  private _destroyPinOverlay(key: string): void {
    const entry = this._pinOverlays.get(key);
    if (!entry) return;
    const { pin, overlay } = entry;
    this._events.emit('pin:overlayDestroyed', pin, overlay);
    this._viewport.unmaskedContainer.removeChild(overlay.view);
    this._symbolFactory.release(overlay);
    this._pinOverlays.delete(key);
  }

  /** Destroy every active pin overlay. Called on spin land and on destroy. */
  private _destroyAllPinOverlays(): void {
    const keys = [...this._pinOverlays.keys()];
    for (const key of keys) this._destroyPinOverlay(key);
  }
}
