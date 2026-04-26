import { Container } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import type { Disposable } from '../utils/Disposable.js';
import type { SpeedProfile, ReelSetInternalConfig, CellBounds, SymbolData } from '../config/types.js';
import { EventEmitter } from '../events/EventEmitter.js';
import type { ReelSetEvents, SpinResult, SymbolPosition } from '../events/ReelEvents.js';
import { Reel, OCCUPIED_SENTINEL } from './Reel.js';
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
  /**
   * zIndex applied to pin overlays so they render above the reel strip.
   *
   * **The library's z-index budget**, for reference if you author symbols
   * that need to layer above defaults:
   *
   * | Layer | zIndex | Source |
   * |---|---|---|
   * | 1×1 symbol, default | `0 * 100 + arrayIndex` (~0–10) | `symbolData.zIndex ?? 0` |
   * | 1×1 symbol, elevated (`zIndex: 1` on `symbolData`) | `1 * 100 + arrayIndex` (~100) | `symbolData.zIndex` |
   * | Big-symbol anchor, default registration | `5 * 100 + arrayIndex` (~500) | recipe convention |
   * | Pin overlay (sticky/expanding wild during spin) | `10000` | `PIN_OVERLAY_Z_INDEX` |
   *
   * The 100× multiplier on `symbolData.zIndex` leaves room for per-row
   * stacking inside a layer (bottom rows render in front of top rows on
   * the same layer). The 10000 ceiling on pin overlays is set very high
   * so a consumer who sets `symbolData.zIndex: 50` (= 5000) still sits
   * below pins. If you need to stack ABOVE pin overlays — e.g. a win-
   * presenter symbol promotion — re-parent the symbol to
   * `viewport.spotlightContainer`, which is its own DisplayObject layer
   * above pin overlays.
   */
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

  /**
   * MultiWays: target row counts for the next AdjustPhase. Recorded by
   * `setShape()`, consumed by `SpinController` when it builds AdjustPhase
   * configs. `null` means "no shape change pending".
   */
  private _targetShape: number[] | null = null;

  /**
   * True once `setResult()` has been called for the current spin. Reset on
   * every `spin:start`. Used to enforce the contract that `setShape()`
   * must be called BEFORE `setResult()` — calling it after corrupts the
   * cached frames (pins were applied at their pre-migration rows; a later
   * setShape would migrate them but the frames are already built).
   */
  private _resultSetForCurrentSpin = false;

  /** Set at construction by the builder when `.multiways(...)` was called. */
  private _isMultiWaysSlot: boolean;
  private _multiwaysMinRows = 0;
  private _multiwaysMaxRows = 0;
  private _multiwaysReelPixelHeight = 0;

  /** Resolved per-symbol metadata (size, zIndex, etc). */
  private _symbolsData: Record<string, SymbolData>;

  constructor(params: ReelSetParams) {
    super();

    this._reels = params.reels;
    this._viewport = params.viewport;
    this._symbolFactory = params.symbolFactory;
    this._frameBuilder = params.frameBuilder;
    this._symbolsData = params.config.symbols;
    this._isMultiWaysSlot = !!params.config.grid.multiways;
    if (params.config.grid.multiways) {
      this._multiwaysMinRows = params.config.grid.multiways.minRows;
      this._multiwaysMaxRows = params.config.grid.multiways.maxRows;
      this._multiwaysReelPixelHeight = params.config.grid.multiways.reelPixelHeight;
    }

    // Wire each reel's cross-reel resolver so `Reel.getVisibleSymbols()`
    // returns the anchor's id even when the OCCUPIED cell's anchor lives
    // on a different reel. Without this, per-reel surface returns the
    // sentinel for cross-reel cells — making it inconsistent with
    // `ReelSet.getVisibleGrid()`.
    for (const reel of this._reels) {
      reel.setCrossReelResolver((col, row) => {
        const fp = this.getSymbolFootprint(col, row);
        const anchorReel = this._reels[fp.anchor.col];
        // Anchor row is on its OWN reel — read its symbolId directly to
        // avoid recursing back through this resolver.
        return anchorReel.symbols[anchorReel.bufferAbove + fp.anchor.row].symbolId;
      });
    }

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
      {
        isMultiWaysSlot: this._isMultiWaysSlot,
        symbolsData: this._symbolsData,
        peekTargetShape: () => this._peekTargetShape(),
        clearTargetShape: () => this._clearTargetShape(),
        multiwaysReelPixelHeight: this._multiwaysReelPixelHeight,
        symbolGapY: params.config.grid.symbolGap.y,
        getPinsOnReel: (reelIndex) => this._pinsOnReel(reelIndex),
        migratePinsForReel: (reelIndex, newRows) => this._migratePinsForReel(reelIndex, newRows),
        refreshPinOverlaysForReel: (reelIndex) => this.refreshPinOverlaysForReel(reelIndex),
        buildPinOverlayTweens: (reelIndex, targetSymbolHeight, symbolGapY) =>
          this._buildPinOverlayTweens(reelIndex, targetSymbolHeight, symbolGapY),
      },
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
    this._resultSetForCurrentSpin = true;
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

  /** Whether this slot was built with `.multiways(...)`. */
  get isMultiWaysSlot(): boolean {
    return this._isMultiWaysSlot;
  }

  // ─── MultiWays API ─────────────────────────────────────────

  /**
   * MultiWays: record the row count each reel should land on this spin. The
   * AdjustPhase between SPIN and STOP will reshape reels (resize symbols,
   * reshape motion) before the stop sequence runs.
   *
   * Must be called between `spin()` and `setResult()`. The shape stays in
   * effect for the current spin only — call again on every spin.
   *
   * Throws if:
   *  - this slot was not built with `.multiways(...)`
   *  - `rowsPerReel.length !== reelCount`
   *  - any entry falls outside `[multiways.minRows, multiways.maxRows]`
   */
  setShape(rowsPerReel: number[]): void {
    if (!this._isMultiWaysSlot) {
      throw new Error('setShape(): slot was not built with .multiways(...) — call ReelSetBuilder.multiways() first.');
    }
    if (this._resultSetForCurrentSpin) {
      throw new Error(
        'setShape(): must be called BEFORE setResult() in the current spin. ' +
        'Calling setShape after setResult corrupts the cached frames (pins were ' +
        'overlaid at their pre-migration rows). Reorder: spin() → setShape() → setResult().',
      );
    }
    if (rowsPerReel.length !== this._reels.length) {
      throw new Error(
        `setShape(): rowsPerReel length ${rowsPerReel.length} must equal reelCount ${this._reels.length}.`,
      );
    }
    for (let i = 0; i < rowsPerReel.length; i++) {
      const r = rowsPerReel[i];
      if (r < this._multiwaysMinRows || r > this._multiwaysMaxRows) {
        throw new Error(
          `setShape(): rowsPerReel[${i}] = ${r} out of range [${this._multiwaysMinRows}, ${this._multiwaysMaxRows}].`,
        );
      }
    }
    // Fast-path: if the requested shape matches the current shape per-reel,
    // there's nothing to do. Avoids spurious `shape:changed` events and
    // pointless migration loops in defensive callers that always invoke
    // `setShape` per spin even when the shape didn't actually change.
    let isUnchanged = true;
    for (let i = 0; i < this._reels.length; i++) {
      if (this._reels[i].visibleRows !== rowsPerReel[i]) {
        isUnchanged = false;
        break;
      }
    }
    if (isUnchanged) {
      return;
    }

    this._targetShape = [...rowsPerReel];
    this._events.emit('shape:changed', [...rowsPerReel]);

    // Migrate pins to their post-reshape rows EAGERLY — before any
    // `setResult` overlay or frame build runs. Otherwise a pin at row=4
    // on a 7-row reel is silently dropped when setResult overlays it onto
    // a 3-row grid (row 4 is out of bounds for the new shape).
    //
    // AdjustPhase later commits the geometry; the pin map is already at
    // the post-migration rows by then, so AdjustPhase only needs to
    // refresh overlays + tween (when implemented).
    for (let i = 0; i < this._reels.length; i++) {
      this._migratePinsForReel(i, rowsPerReel[i]);
    }
  }

  /**
   * Internal: read the pending MultiWays target shape (does not clear).
   * Used by `SpinController` via the hooks interface. Not part of the
   * public API — call `setShape()` to change shape.
   *
   * @internal
   */
  private _peekTargetShape(): number[] | null {
    return this._targetShape;
  }

  /**
   * Internal: clear the pending MultiWays target shape after the spin lands.
   *
   * @internal
   */
  private _clearTargetShape(): void {
    this._targetShape = null;
  }

  /**
   * Resolved grid, with all OCCUPIED cells (same-reel and cross-reel)
   * replaced by their anchor's symbol id. A 2×2 bonus reads as four
   * `'bonus'` cells.
   *
   * Equivalent to `reelSet.reels.map(r => r.getVisibleSymbols())` because
   * each reel has a cross-reel resolver wired in by ReelSet's constructor —
   * the per-reel surface and the grid surface are the same.
   */
  getVisibleGrid(): string[][] {
    return this._reels.map((r) => r.getVisibleSymbols());
  }

  /**
   * Footprint of the symbol at `(col, row)`.
   *
   *   - 1×1 symbols: `{ anchor: { col, row }, size: { w: 1, h: 1 } }`.
   *   - Big symbols: returns the anchor cell and block size.
   *   - OCCUPIED cells: resolves transparently to the anchor.
   *
   * Useful for win presenters that need to highlight a whole NxM block.
   */
  getSymbolFootprint(
    col: number,
    row: number,
  ): { anchor: { col: number; row: number }; size: { w: number; h: number } } {
    if (col < 0 || col >= this._reels.length) {
      throw new RangeError(`getSymbolFootprint: col ${col} out of range [0, ${this._reels.length})`);
    }
    const reel = this._reels[col];
    if (row < 0 || row >= reel.visibleRows) {
      throw new RangeError(`getSymbolFootprint: row ${row} out of range [0, ${reel.visibleRows})`);
    }

    // Resolve OCCUPIED → anchor row on this reel. Cross-reel OCCUPIED
    // requires walking left to find the anchoring column with size.w > col.
    const anchorRow = reel._getAnchorRow(row);
    const anchorSym = reel.getSymbolAt(row);
    const meta = this._symbolsData[anchorSym.symbolId];
    const size = meta?.size && (meta.size.w > 1 || meta.size.h > 1)
      ? meta.size
      : { w: 1, h: 1 };

    // Resolve cross-reel anchor column: if the anchor symbol on THIS reel
    // is itself an OCCUPIED stub painted by a big symbol on a leftward
    // reel, walk left until we find a column where the row matches a big
    // symbol whose width covers our column.
    let anchorCol = col;
    for (let c = col - 1; c >= 0; c--) {
      const leftReel = this._reels[c];
      if (anchorRow >= leftReel.visibleRows) break;
      const leftAnchorRow = leftReel._getAnchorRow(anchorRow);
      const leftSym = leftReel.getSymbolAt(anchorRow);
      const leftMeta = this._symbolsData[leftSym.symbolId];
      if (leftMeta?.size && leftMeta.size.w > col - c) {
        anchorCol = c;
        return {
          anchor: { col: anchorCol, row: leftAnchorRow },
          size: leftMeta.size,
        };
      }
    }

    return { anchor: { col: anchorCol, row: anchorRow }, size };
  }

  /**
   * Pixel rectangle covering a big symbol's whole `N×M` block, in
   * ReelSet-local coordinates. Returns the anchor cell's bounds for 1×1
   * symbols. Pass any cell of a block — anchor or non-anchor — and you
   * get the same rect.
   *
   * Useful for win presenters drawing an outline around a whole bonus, or
   * any overlay aligned to the visible footprint of a big symbol:
   *
   * ```ts
   * const rect = reelSet.getBlockBounds(2, 1);
   * gfx.rect(rect.x, rect.y, rect.width, rect.height)
   *    .stroke({ color: 0xff6b35, width: 4 });
   * reelSet.addChild(gfx);
   * ```
   *
   * For 1×1 cells this is equivalent to `getCellBounds(col, row)`. For
   * big-symbol cells it multiplies width/height by the block size and
   * starts from the anchor cell's bounds.
   */
  getBlockBounds(col: number, row: number): CellBounds {
    const fp = this.getSymbolFootprint(col, row);
    const anchorBounds = this.getCellBounds(fp.anchor.col, fp.anchor.row);
    return {
      x: anchorBounds.x,
      y: anchorBounds.y,
      width: fp.size.w * anchorBounds.width,
      height: fp.size.h * anchorBounds.height,
    };
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
      y: this._viewport.y + reel.offsetY + row * reel.motion.slotHeight,
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
      originRow: options?.originRow ?? row,
      migration: options?.migration ?? 'origin',
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
    const movedPin: CellPin = { ...pin, col: to.col, row: to.row, originRow: to.row };
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

  /** Pins on a given reel, in row order. Used by AdjustPhase migration. */
  private _pinsOnReel(reelIndex: number): CellPin[] {
    const result: CellPin[] = [];
    for (const pin of this._pins.values()) {
      if (pin.col === reelIndex) result.push(pin);
    }
    return result;
  }

  /**
   * MultiWays: relocate pins on a reel for a new visible-row count. The new
   * row is computed as `min(originRow, newRows - 1)` — clamped only when
   * the origin no longer fits. Returns the migrated pins so AdjustPhase
   * can build tween descriptors. Mutates the pins map in place.
   */
  private _migratePinsForReel(reelIndex: number, newRows: number): {
    pin: CellPin;
    fromRow: number;
    toRow: number;
    clamped: boolean;
  }[] {
    const migrations: {
      pin: CellPin;
      fromRow: number;
      toRow: number;
      clamped: boolean;
    }[] = [];

    const reelPins = this._pinsOnReel(reelIndex);
    for (const pin of reelPins) {
      const fromRow = pin.row;

      // Compute target row based on migration policy.
      //   'origin'  → clamp to min(originRow, newRows - 1). Restores on grow.
      //   'frozen'  → stay at current row if it fits, else clamp to last
      //              visible row AND update originRow so future grows
      //              don't restore. "Lock at current position" semantics.
      let target: number;
      let clamped: boolean;
      let nextOriginRow = pin.originRow;
      if (pin.migration === 'frozen') {
        if (fromRow < newRows) {
          target = fromRow;
          clamped = false;
        } else {
          target = newRows - 1;
          clamped = true;
          nextOriginRow = target; // freeze the new row as the new "origin"
        }
      } else {
        // 'origin' (default)
        target = Math.min(pin.originRow, newRows - 1);
        clamped = target !== pin.originRow;
      }

      if (target === fromRow && nextOriginRow === pin.originRow) continue;

      const fromKey = pinKey(pin.col, fromRow);
      const toKey = pinKey(pin.col, target);

      this._pins.delete(fromKey);
      const moved: CellPin = { ...pin, row: target, originRow: nextOriginRow };
      this._pins.set(toKey, moved);

      // Keep overlay map keyed by the new cell.
      const overlayEntry = this._pinOverlays.get(fromKey);
      if (overlayEntry) {
        this._pinOverlays.delete(fromKey);
        this._pinOverlays.set(toKey, { pin: moved, overlay: overlayEntry.overlay });
      }

      migrations.push({ pin: moved, fromRow, toRow: target, clamped });
      this._events.emit('pin:migrated', moved, {
        fromRow,
        toRow: target,
        clamped,
        reelIndex,
      });
    }
    return migrations;
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
    // Fresh spin — setResult hasn't been called yet, so setShape() is
    // allowed again until setResult() flips this back.
    this._resultSetForCurrentSpin = false;

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
    // local space as maskedContainer. Reel x lives on the reel container;
    // symbol-view y is reel-local; pyramid layouts add `reel.container.y`
    // (the per-reel offsetY) so overlays line up with the actual cell.
    overlay.view.x = reel.container.x;
    overlay.view.y = reel.container.y + reel.getSymbolAt(pin.row).view.y;
    overlay.view.zIndex = ReelSet.PIN_OVERLAY_Z_INDEX;
    this._viewport.unmaskedContainer.addChild(overlay.view);
    this._pinOverlays.set(key, { pin, overlay });
    this._events.emit('pin:overlayCreated', pin, overlay);
  }

  /**
   * Reposition + resize every pin overlay on the given reel.
   *
   * The engine calls this automatically after every MultiWays AdjustPhase
   * reshape (and from the skip path), so applications that just use
   * `setShape()` / `setResult()` never need to invoke it. **Call it
   * yourself only if** you mutate `Reel.symbolWidth`, `Reel.symbolHeight`,
   * or a pin's row outside the normal MultiWays flow — e.g. a custom
   * mid-spin layout swap that bypasses `AdjustPhase`.
   *
   * No-op for reels with no active pin overlays.
   */
  refreshPinOverlaysForReel(reelIndex: number): void {
    const reel = this._reels[reelIndex];
    for (const [, entry] of this._pinOverlays) {
      if (entry.pin.col !== reelIndex) continue;
      const { pin, overlay } = entry;
      overlay.resize(reel.symbolWidth, reel.symbolHeight);
      overlay.view.x = reel.container.x;
      overlay.view.y = reel.container.y + pin.row * reel.motion.slotHeight;
    }
  }

  /**
   * Internal: build AdjustPhase pin-overlay tween descriptors for a reel.
   * Captures the overlays' CURRENT on-screen Y + size as the tween's
   * `from` state, then computes the post-reshape `to` state from the
   * pin's already-migrated row + the upcoming cell height. Called BEFORE
   * AdjustPhase commits the reshape, so the snapshot reflects what the
   * player actually sees.
   */
  private _buildPinOverlayTweens(
    reelIndex: number,
    targetSymbolHeight: number,
    symbolGapY: number,
  ): import('../spin/phases/AdjustPhase.js').PinOverlayTween[] {
    const reel = this._reels[reelIndex];
    const out: import('../spin/phases/AdjustPhase.js').PinOverlayTween[] = [];
    const newSlot = targetSymbolHeight + symbolGapY;
    for (const [, entry] of this._pinOverlays) {
      if (entry.pin.col !== reelIndex) continue;
      const { pin, overlay } = entry;
      out.push({
        symbol: overlay,
        cellWidth: reel.symbolWidth,
        oldCellHeight: reel.symbolHeight,
        newCellHeight: targetSymbolHeight,
        fromY: overlay.view.y,
        toY: reel.container.y + pin.row * newSlot,
        x: reel.container.x,
      });
    }
    return out;
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
