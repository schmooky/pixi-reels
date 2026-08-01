import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { Reel } from '../core/Reel.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';

/**
 * A single visual debug layer. C3 ships the static / at-rest subset; the
 * axis / feed / thresholds layers arrive with A11b once `ReelAxis` is wired
 * through `Reel`.
 *
 *   - `mask`    Mask bounding box + per-reel rects.
 *   - `cells`   Every visible cell from `getCellBounds`, with `col,row` labels.
 *   - `buffers` The off-window strip cells (bufferStart / bufferEnd), dimmer.
 *   - `bounds`  Actual `view.getBounds()` per visible symbol (spine overrun).
 *   - `blocks`  `getBlockBounds` outline for big symbols.
 *   - `pins`    Pin cells and pin-overlay positions.
 *   - `hud`     Per-reel text: speed, phase, visibleCells.
 */
export type DebugOverlayLayer =
  | 'mask'
  | 'cells'
  | 'buffers'
  | 'bounds'
  | 'blocks'
  | 'pins'
  | 'hud';

/** Every C3 layer, in draw order. `'all'` resolves to this list. */
const ALL_LAYERS: readonly DebugOverlayLayer[] = [
  'mask',
  'cells',
  'buffers',
  'bounds',
  'blocks',
  'pins',
  'hud',
];

/** Per-layer stroke colors. Distinct hues so overlapping layers stay legible. */
const COLORS: Record<DebugOverlayLayer, number> = {
  mask: 0xff3b30, // red    mask box
  cells: 0x32ade6, // cyan   visible cells
  buffers: 0xff9500, // amber  off-window buffer cells
  bounds: 0xff2d95, // pink   real symbol bounds
  blocks: 0xffcc00, // yellow big-symbol blocks
  pins: 0xaf52de, // purple pins
  hud: 0xffffff, // white  hud text
};

/** Mask per-reel rect color (green), separate from the red mask box. */
const MASK_RECT_COLOR = 0x34c759;
/** Pin-overlay marker color (green), separate from the purple pin cell. */
const PIN_OVERLAY_COLOR = 0x34c759;

export interface DebugOverlayOptions {
  /**
   * Which layers to draw. An explicit list, or `'all'` for every C3 layer.
   * Defaults to `'all'`.
   */
  layers?: DebugOverlayLayer[] | 'all';
  /**
   * When `true`, the live layers (`bounds` / `blocks` / `pins` / `hud`)
   * redraw every tick. When `false` (default) the overlay draws once and
   * only updates on `redraw()` / `setLayers()` and reshape events.
   */
  live?: boolean;
  /**
   * Ticker driving the live redraw when `live: true`. Defaults to
   * `Ticker.shared`. Pass the reel set's own ticker (e.g. `app.ticker`, or a
   * `FakeTicker` in tests) to keep the overlay in lock-step with it. Ignored
   * when `live` is falsy.
   */
  ticker?: Ticker;
}

/** Handle returned by {@link debugOverlay}. Owns its display objects. */
export interface DebugOverlayHandle extends Disposable {
  /** Swap the active layer set and redraw. Accepts a list or `'all'`. */
  setLayers(layers: DebugOverlayLayer[] | 'all'): void;
  /** Force a full redraw (static + live layers). */
  redraw(): void;
  /** Remove the overlay from the reel set and dispose every allocation. */
  destroy(): void;
  readonly isDestroyed: boolean;
}

function resolveLayers(
  layers: DebugOverlayLayer[] | 'all' | undefined,
): Set<DebugOverlayLayer> {
  if (layers === undefined || layers === 'all') return new Set(ALL_LAYERS);
  return new Set(layers);
}

/**
 * A layered visual debug overlay for a {@link ReelSet}. Draws mask, cell,
 * buffer, symbol-bounds, big-symbol-block, pin and hud layers into a
 * `Container` added to the reel set itself. because `ReelSet extends
 * Container`, that renders the overlay above the viewport (including the
 * spotlight container), unlike the older `showMask` which drew inside the
 * viewport and was covered by the spotlight.
 *
 * Dev-only. It reads engine internals through the public accessors, is not
 * semver-protected, and must not reach a production bundle.
 *
 * ```ts
 * const overlay = debugOverlay(reelSet, { layers: ['cells', 'bounds'], live: true });
 * overlay.setLayers(['cells', 'pins']);
 * overlay.redraw();
 * overlay.destroy();
 * ```
 */
export function debugOverlay(
  reelSet: ReelSet,
  options: DebugOverlayOptions = {},
): DebugOverlayHandle {
  return new DebugOverlay(reelSet, options);
}

class DebugOverlay implements DebugOverlayHandle {
  private _root = new Container();
  private _graphics = new Map<DebugOverlayLayer, Graphics>();
  private _cellLabels: Text[] = [];
  private _hudTexts: Text[] = [];
  private _active: Set<DebugOverlayLayer>;
  private _tickerRef: TickerRef | null = null;
  private _isDestroyed = false;

  /** Current phase name per reel, tracked off the reel bus for the hud layer. */
  private _phase: string[];
  /** Detach callbacks for the per-reel phase listeners. */
  private _reelDetach: Array<() => void> = [];
  private _onStatic = (): void => this._redrawStatic();

  constructor(
    private _reelSet: ReelSet,
    options: DebugOverlayOptions,
  ) {
    this._active = resolveLayers(options.layers);
    this._phase = _reelSet.reels.map(() => 'idle');

    // Above the viewport (and its spotlight container), never interactive.
    this._root.zIndex = 1_000_000;
    this._root.eventMode = 'none';
    this._root.label = 'pixi-reels:debugOverlay';
    _reelSet.addChild(this._root);

    // Track per-reel phase for the hud layer via the reel bus. There is no
    // `reel.phase` accessor. phases are only observable as events.
    _reelSet.reels.forEach((reel: Reel, i: number) => {
      const onEnter = (name: string): void => {
        this._phase[i] = name;
      };
      const onExit = (name: string): void => {
        if (this._phase[i] === name) this._phase[i] = 'idle';
      };
      reel.events.on('phase:enter', onEnter);
      reel.events.on('phase:exit', onExit);
      this._reelDetach.push(() => {
        reel.events.off('phase:enter', onEnter);
        reel.events.off('phase:exit', onExit);
      });
    });

    // Static layers redraw only on reshape, not per tick.
    _reelSet.events.on('shape:changed', this._onStatic);
    _reelSet.events.on('adjust:complete', this._onStatic);

    if (options.live) {
      const ticker = options.ticker ?? Ticker.shared;
      this._tickerRef = new TickerRef(ticker);
      this._tickerRef.add(() => this._redrawLive());
    }

    this.redraw();
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  setLayers(layers: DebugOverlayLayer[] | 'all'): void {
    if (this._isDestroyed) return;
    this._active = resolveLayers(layers);
    // Clear + hide anything no longer active so stale strokes vanish.
    for (const [layer, g] of this._graphics) {
      if (!this._active.has(layer)) {
        g.clear();
        g.visible = false;
      } else {
        g.visible = true;
      }
    }
    if (!this._active.has('cells')) this._hideTextsFrom(this._cellLabels, 0);
    if (!this._active.has('hud')) this._hideTextsFrom(this._hudTexts, 0);
    this.redraw();
  }

  redraw(): void {
    if (this._isDestroyed) return;
    this._redrawStatic();
    this._redrawLive();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;

    this._tickerRef?.destroy();
    this._tickerRef = null;

    this._reelSet.events.off('shape:changed', this._onStatic);
    this._reelSet.events.off('adjust:complete', this._onStatic);
    for (const detach of this._reelDetach) detach();
    this._reelDetach.length = 0;

    if (this._root.parent) this._root.parent.removeChild(this._root);
    // Destroys every pooled Graphics + Text child in one call.
    this._root.destroy({ children: true });
    this._graphics.clear();
    this._cellLabels.length = 0;
    this._hudTexts.length = 0;
  }

  // --- redraw dispatch -----------------------------------------------------

  /**
   * The static layers: `mask` / `cells` / `buffers` are pure geometry that
   * only shifts on a MultiWays reshape, so they redraw on `shape:changed` /
   * `adjust:complete` rather than every tick.
   */
  private _redrawStatic(): void {
    if (this._isDestroyed) return;
    if (this._active.has('mask')) this._drawMask();
    if (this._active.has('cells')) this._drawCells();
    if (this._active.has('buffers')) this._drawBuffers();
  }

  /**
   * The live layers. `bounds` / `pins` / `hud` are the plan's named live
   * layers; `blocks` joins them because a big symbol's block outline tracks
   * landed content (which changes on every result), not just reshapes.
   */
  private _redrawLive(): void {
    if (this._isDestroyed) return;
    if (this._active.has('bounds')) this._drawBounds();
    if (this._active.has('blocks')) this._drawBlocks();
    if (this._active.has('pins')) this._drawPins();
    if (this._active.has('hud')) this._drawHud();
  }

  // --- pooling helpers -----------------------------------------------------

  /** One persistent Graphics per layer, created on first use, cleared per draw. */
  private _layer(layer: DebugOverlayLayer): Graphics {
    let g = this._graphics.get(layer);
    if (!g) {
      g = new Graphics();
      this._graphics.set(layer, g);
      this._root.addChild(g);
    }
    g.visible = true;
    g.clear();
    return g;
  }

  /** Reuse (or lazily grow) a text pool slot. Never measured. positioned only. */
  private _text(pool: Text[], index: number, color: number, size: number): Text {
    let t = pool[index];
    if (!t) {
      t = new Text({
        text: '',
        style: { fontFamily: 'monospace', fontSize: size, fill: color },
      });
      pool[index] = t;
      this._root.addChild(t);
    }
    t.visible = true;
    return t;
  }

  private _hideTextsFrom(pool: Text[], from: number): void {
    for (let i = from; i < pool.length; i++) pool[i].visible = false;
  }

  // --- layer draws ---------------------------------------------------------

  private _drawMask(): void {
    const g = this._layer('mask');
    const vp = this._reelSet.viewport;
    // Cell bounds are ReelSet-local (they add viewport.x/y); mirror that here
    // since the overlay root sits in ReelSet-local space, not viewport-local.
    const vx = vp.x;
    const vy = vp.y;
    g.rect(vx, vy, vp.maskWidth, vp.maskHeight).stroke({ color: COLORS.mask, width: 2 });
    for (const rect of vp.maskRects) {
      g.rect(vx + rect.x, vy + rect.y, rect.width, rect.height).stroke({
        color: MASK_RECT_COLOR,
        width: 2,
      });
    }
  }

  private _drawCells(): void {
    const g = this._layer('cells');
    let labelIndex = 0;
    this._reelSet.reels.forEach((reel: Reel, col: number) => {
      for (let row = 0; row < reel.visibleCells; row++) {
        const b = this._reelSet.getCellBounds(col, row);
        g.rect(b.x, b.y, b.width, b.height).stroke({ color: COLORS.cells, width: 1 });
        const label = this._text(this._cellLabels, labelIndex++, COLORS.cells, 10);
        label.text = `${col},${row}`;
        label.x = b.x + 3;
        label.y = b.y + 3;
      }
    });
    this._hideTextsFrom(this._cellLabels, labelIndex);
  }

  private _drawBuffers(): void {
    const g = this._layer('buffers');
    this._reelSet.reels.forEach((reel: Reel) => {
      const slotH = reel.motion.slotPitch;
      const x = this._reelSet.viewport.x + reel.container.x;
      const baseY = this._reelSet.viewport.y + reel.mainOffset;
      const w = reel.symbolWidth;
      const h = reel.symbolHeight;
      // bufferStart cells sit at negative row offsets above visible row 0.
      for (let k = 1; k <= reel.bufferStart; k++) {
        const y = baseY + -k * slotH;
        g.rect(x, y, w, h).stroke({ color: COLORS.buffers, width: 1, alpha: 0.45 });
      }
      // bufferEnd cells sit below the last visible row.
      for (let k = 0; k < reel.bufferEnd; k++) {
        const y = baseY + (reel.visibleCells + k) * slotH;
        g.rect(x, y, w, h).stroke({ color: COLORS.buffers, width: 1, alpha: 0.45 });
      }
    });
  }

  private _drawBounds(): void {
    const g = this._layer('bounds');
    this._reelSet.reels.forEach((reel: Reel) => {
      for (let row = 0; row < reel.visibleCells; row++) {
        const view = reel.getSymbolAt(row).view;
        // getBounds() is world-space; map the AABB corners into overlay-local
        // (ReelSet-local) space so the rect aligns regardless of stage offset.
        const wb = view.getBounds();
        const tl = this._root.toLocal({ x: wb.x, y: wb.y });
        const br = this._root.toLocal({ x: wb.x + wb.width, y: wb.y + wb.height });
        g.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y).stroke({
          color: COLORS.bounds,
          width: 1,
        });
      }
    });
  }

  private _drawBlocks(): void {
    const g = this._layer('blocks');
    // Only outline each block once, at its anchor cell.
    this._reelSet.reels.forEach((reel: Reel, col: number) => {
      for (let row = 0; row < reel.visibleCells; row++) {
        const fp = this._reelSet.getSymbolFootprint(col, row);
        if (fp.size.w <= 1 && fp.size.h <= 1) continue;
        if (fp.anchor.col !== col || fp.anchor.row !== row) continue;
        const rect = this._reelSet.getBlockBounds(col, row);
        g.rect(rect.x, rect.y, rect.width, rect.height).stroke({
          color: COLORS.blocks,
          width: 3,
        });
      }
    });
  }

  private _drawPins(): void {
    const g = this._layer('pins');
    this._reelSet.reels.forEach((reel: Reel, col: number) => {
      for (let row = 0; row < reel.visibleCells; row++) {
        const pin = this._reelSet.getPin(col, row);
        if (!pin) continue;
        const b = this._reelSet.getCellBounds(col, row);
        // Pin cell outline.
        g.rect(b.x, b.y, b.width, b.height).stroke({ color: COLORS.pins, width: 3 });
        // A diagonal cross marks the pin-overlay cell, so a movePin /
        // pin-overlay disagreement (A1) shows as a cross off its cell.
        g.moveTo(b.x, b.y)
          .lineTo(b.x + b.width, b.y + b.height)
          .moveTo(b.x + b.width, b.y)
          .lineTo(b.x, b.y + b.height)
          .stroke({ color: PIN_OVERLAY_COLOR, width: 1, alpha: 0.8 });
      }
    });
  }

  private _drawHud(): void {
    // hud uses no Graphics layer. one Text per reel.
    let i = 0;
    this._reelSet.reels.forEach((reel: Reel, col: number) => {
      const t = this._text(this._hudTexts, i++, COLORS.hud, 11);
      t.text = `r${col} spd=${reel.speed.toFixed(1)} ${this._phase[col]} cells=${reel.visibleCells}`;
      t.x = this._reelSet.viewport.x + reel.container.x + 3;
      t.y = this._reelSet.viewport.y + reel.mainOffset + 3;
    });
    this._hideTextsFrom(this._hudTexts, i);
  }
}
