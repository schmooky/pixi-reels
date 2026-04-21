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

  /** Set the target result symbols. Triggers the stop sequence. */
  setResult(symbols: string[][]): void {
    this._spinController.setResult(symbols);
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
    this._events.emit('destroyed');
    this._events.removeAllListeners();

    super.destroy({ children: true });
  }
}
