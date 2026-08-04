import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { Reel } from '../core/Reel.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';

/**
 * A single visual debug layer.
 *
 *   - `mask`       Mask bounding box + per-reel rects.
 *   - `cells`      Every visible cell from `getCellBounds`, with `reel,cell` labels.
 *   - `buffers`    The off-window strip cells (bufferStart / bufferEnd), dimmer.
 *   - `axis`       One arrow per reel along the travel axis, pointing the way
 *                  it goes. The whole point of the v2 refactor is invisible in
 *                  a canvas otherwise: reverse polarity and horizontal
 *                  orientation become obvious instead of inferred.
 *   - `feed`       A marker on the strip edge new symbols enter from.
 *                  Confirms `feedEdge` derives from polarity rather than
 *                  being set twice.
 *   - `thresholds` The wrap lines. a symbol crossing one wraps to the other
 *                  end of the array (contract law L7 / L9, watchable).
 *   - `bounds`     Actual `view.getBounds()` per visible symbol (spine overrun).
 *   - `blocks`     `getBlockBounds` outline for big symbols.
 *   - `pins`       Pin cells and pin-overlay positions.
 *   - `hud`        Per-reel text: orientation, direction, speed, phase, cells.
 */
export type DebugOverlayLayer =
  | 'mask'
  | 'cells'
  | 'buffers'
  | 'axis'
  | 'feed'
  | 'thresholds'
  | 'bounds'
  | 'blocks'
  | 'pins'
  | 'hud';

/** Every layer, in draw order. `'all'` resolves to this list. */
const ALL_LAYERS: readonly DebugOverlayLayer[] = [
  'mask',
  'cells',
  'buffers',
  'thresholds',
  'axis',
  'feed',
  'bounds',
  'blocks',
  'pins',
  'hud',
];

/** Per-layer stroke colors. Distinct hues so overlapping layers stay legible. */
const COLORS: Record<DebugOverlayLayer, number> = {
  mask: 0xff3b30, // red     mask box
  cells: 0x32ade6, // cyan    visible cells
  buffers: 0xff9500, // amber   off-window buffer cells
  axis: 0x30d158, // green   travel arrow
  feed: 0x64d2ff, // sky     feed edge
  thresholds: 0xff453a, // red     wrap lines
  bounds: 0xff2d95, // pink    real symbol bounds
  blocks: 0xffcc00, // yellow  big-symbol blocks
  pins: 0xaf52de, // purple  pins
  hud: 0xffffff, // white   hud text
};

/** Container / layer label prefix. Used by the Pixi devtools and by tests. */
export const OVERLAY_LABEL = 'pixi-reels:debugOverlay';

/** Mask per-reel rect color (green), separate from the red mask box. */
const MASK_RECT_COLOR = 0x34c759;
/** Pin-overlay marker color (green), separate from the purple pin cell. */
const PIN_OVERLAY_COLOR = 0x34c759;

/** hud line metrics. One line per reel, stacked inside the mask's top-left. */
const HUD_FONT_SIZE = 10;
const HUD_LINE_HEIGHT = 11;
/** Inset from the mask's top-left corner to the first hud line. */
const HUD_PAD = 4;
/** Backing plate behind the hud lines, so white text survives bright art. */
const HUD_BACKING_COLOR = 0x000000;
const HUD_BACKING_ALPHA = 0.7;
/**
 * Advance per character, as a fraction of the font size. The plate is sized
 * from the longest line's LENGTH rather than from `Text.width`, because
 * measuring needs a canvas to rasterize against and throws in a headless
 * test. The font is monospace, so a character count is exact up to this
 * ratio, and the plate only has to be roughly right.
 */
const HUD_CHAR_ADVANCE = 0.62;

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

/** What the axis-family layers drew for one reel, as plain numbers. */
export interface DebugOverlayReelInfo {
  reel: number;
  orientation: 'vertical' | 'horizontal';
  direction: 'forward' | 'reverse';
  /** Which strip edge new symbols arrive at. Derived from polarity. */
  feedEdge: 'start' | 'end';
  /**
   * The travel arrow in reel-local MAIN coordinates. `to - from` is signed,
   * so its sign is the reel's travel direction - which a bounding box
   * cannot tell you, because a mirrored arrow has identical bounds.
   */
  axisArrow: { fromMain: number; toMain: number };
  /** Main coordinate of the feed marker. */
  feedMain: number;
  /** The two wrap lines, in main coordinates. */
  thresholds: { start: number; end: number };
  visibleCells: number;
  /** Last phase seen on this reel's bus, or 'idle'. */
  phase: string;
}

/** Serializable summary of the overlay. the text half of a visual debugger. */
export interface DebugOverlaySnapshot {
  layers: DebugOverlayLayer[];
  reels: DebugOverlayReelInfo[];
}

/** Handle returned by {@link debugOverlay}. Owns its display objects. */
export interface DebugOverlayHandle extends Disposable {
  /** Swap the active layer set and redraw. Accepts a list or `'all'`. */
  setLayers(layers: DebugOverlayLayer[] | 'all'): void;
  /** Force a full redraw (static + live layers). */
  redraw(): void;
  /**
   * Plain-JSON description of what the axis / feed / thresholds layers
   * represent, per reel. PixiJS renders to a canvas, which CLAUDE.md notes
   * AI agents and CI cannot see; this is the same information in a form
   * they (and `expect`) can read. No PixiJS types, safe to `JSON.stringify`.
   */
  describe(): DebugOverlaySnapshot;
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
    this._root.label = OVERLAY_LABEL;
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

  describe(): DebugOverlaySnapshot {
    return {
      layers: [...this._active],
      reels: this._reelSet.reels.map((reel: Reel, i: number) => {
        const axis = reel.axis;
        const arrow = this._arrowMains(reel);
        const pitch = reel.motion.slotPitch;
        return {
          reel: i,
          orientation: axis.orientation,
          direction: axis.direction,
          feedEdge: axis.feedEdge,
          axisArrow: arrow,
          feedMain: this._feedMain(reel),
          thresholds: {
            start: -(reel.bufferStart + 1) * pitch,
            end: (reel.visibleCells + reel.bufferEnd) * pitch,
          },
          visibleCells: reel.visibleCells,
          phase: this._phase[i],
        };
      }),
    };
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
    if (this._active.has('thresholds')) this._drawThresholds();
    if (this._active.has('axis')) this._drawAxis();
    if (this._active.has('feed')) this._drawFeed();
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
      // Labelled so it is identifiable in the Pixi devtools tree and in
      // tests, which is the only way to assert a layer drew where it should.
      g.label = `${OVERLAY_LABEL}:${layer}`;
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
    this._reelSet.reels.forEach((reel: Reel, reelIndex: number) => {
      for (let cell = 0; cell < reel.visibleCells; cell++) {
        const b = this._reelSet.getCellBounds(reelIndex, cell);
        // On a curved reel outline the TRAPEZOID the drum actually draws, not
        // the bounding box `getCellBounds` has to widen to. The overlay is how
        // you check the projection landed where you think it did, so it has to
        // show the bend rather than a rectangle around it.
        const quad = this._reelSet.getCellQuad(reelIndex, cell);
        if (quad) {
          g.poly(quad).stroke({ color: COLORS.cells, width: 1 });
        } else {
          g.rect(b.x, b.y, b.width, b.height).stroke({ color: COLORS.cells, width: 1 });
        }
        const label = this._text(this._cellLabels, labelIndex++, COLORS.cells, 10);
        label.text = `${reelIndex},${cell}`;
        // Anchor the label on the quad's own leading corner so it tracks the
        // bend instead of floating off in the bounding box's dead space.
        label.x = (quad ? quad[0].x : b.x) + 3;
        label.y = (quad ? quad[0].y : b.y) + 3;
      }
    });
    this._hideTextsFrom(this._cellLabels, labelIndex);
  }

  private _drawBuffers(): void {
    const g = this._layer('buffers');
    for (const reel of this._reelSet.reels) {
      const pitch = reel.motion.slotPitch;
      const draw = (main: number): void => {
        const r = this._reelRect(reel, 0, main, reel.cellCross, reel.cellMain);
        g.rect(r.x, r.y, r.width, r.height).stroke({
          color: COLORS.buffers,
          width: 1,
          alpha: 0.45,
        });
      };
      // bufferStart cells sit at negative main offsets, before visible cell 0.
      for (let k = 1; k <= reel.bufferStart; k++) draw(-k * pitch);
      // bufferEnd cells sit past the last visible cell.
      for (let k = 0; k < reel.bufferEnd; k++) draw((reel.visibleCells + k) * pitch);
    }
  }

  /**
   * Project a reel-local `(cross, main)` point into overlay space.
   *
   * Every layer below goes through this rather than touching `container.x`
   * and `.y`, which is what lets the same code draw a sideways or reversed
   * reel correctly - and what makes a mistake in the projection show up on
   * screen instead of hiding in a diff.
   */
  private _reelPoint(reel: Reel, cross: number, main: number): { x: number; y: number } {
    const axis = reel.axis;
    const p = axis.toScreen(
      axis.getCross(reel.container) + cross,
      axis.getMain(reel.container) + main,
    );
    return { x: this._reelSet.viewport.x + p.x, y: this._reelSet.viewport.y + p.y };
  }

  /** A reel-local rect in (cross, main) space, as screen `x/y/width/height`. */
  private _reelRect(
    reel: Reel,
    cross: number,
    main: number,
    crossSize: number,
    mainSize: number,
  ): { x: number; y: number; width: number; height: number } {
    const origin = this._reelPoint(reel, cross, main);
    const size = reel.axis.toScreen(crossSize, mainSize);
    return { x: origin.x, y: origin.y, width: size.x, height: size.y };
  }

  /**
   * One arrow per reel, drawn along the travel axis and pointing the way the
   * strip actually moves. Reads polarity, so a `direction('reverse')` reel
   * points back at you.
   */
  /**
   * The arrow's tail and head in reel-local main coordinates. Shared by the
   * draw and by `describe()` so the picture and the numbers cannot disagree.
   */
  private _arrowMains(reel: Reel): { fromMain: number; toMain: number } {
    const span = reel.visibleCells * reel.motion.slotPitch;
    const forward = reel.axis.polarity > 0;
    return {
      fromMain: forward ? span * 0.2 : span * 0.8,
      toMain: forward ? span * 0.8 : span * 0.2,
    };
  }

  /** Main coordinate of the feed marker: just outside the feeding edge. */
  private _feedMain(reel: Reel): number {
    const pitch = reel.motion.slotPitch;
    return reel.axis.feedEdge === 'start'
      ? -reel.bufferStart * pitch
      : reel.visibleCells * pitch;
  }

  private _drawAxis(): void {
    const g = this._layer('axis');
    for (const reel of this._reelSet.reels) {
      const span = reel.visibleCells * reel.motion.slotPitch;
      const midCross = reel.cellCross / 2;
      const { fromMain: tailMain, toMain: headMain } = this._arrowMains(reel);
      const forward = reel.axis.polarity > 0;
      const tail = this._reelPoint(reel, midCross, tailMain);
      const head = this._reelPoint(reel, midCross, headMain);
      g.moveTo(tail.x, tail.y).lineTo(head.x, head.y).stroke({
        color: COLORS.axis,
        width: 3,
      });
      // Arrowhead: two barbs, each pulled back along travel and out to the
      // sides on the cross axis.
      const barb = Math.min(span * 0.12, reel.cellCross * 0.4) || 8;
      const backMain = headMain - (forward ? barb : -barb);
      for (const side of [-1, 1]) {
        const b = this._reelPoint(reel, midCross + side * barb * 0.6, backMain);
        g.moveTo(head.x, head.y).lineTo(b.x, b.y).stroke({
          color: COLORS.axis,
          width: 3,
        });
      }
    }
  }

  /**
   * A bar on the edge new symbols enter from. `feedEdge` is derived from
   * polarity, so this and the axis arrow must always agree; if they ever
   * disagree on screen, the derivation broke.
   */
  private _drawFeed(): void {
    const g = this._layer('feed');
    for (const reel of this._reelSet.reels) {
      const pitch = reel.motion.slotPitch;
      const r = this._reelRect(reel, 0, this._feedMain(reel), reel.cellCross, pitch * 0.18);
      g.rect(r.x, r.y, r.width, r.height).fill({ color: COLORS.feed, alpha: 0.55 });
    }
  }

  /**
   * The two wrap lines. A symbol that crosses one is rotated to the other
   * end of the strip array, which is contract law L7 (periodicity) and L9
   * (boundedness) made watchable: drive a spin with this layer on and no
   * symbol should ever be drawn past a line.
   */
  private _drawThresholds(): void {
    const g = this._layer('thresholds');
    for (const reel of this._reelSet.reels) {
      const pitch = reel.motion.slotPitch;
      const mains = [
        -(reel.bufferStart + 1) * pitch,
        (reel.visibleCells + reel.bufferEnd) * pitch,
      ];
      for (const main of mains) {
        const a = this._reelPoint(reel, 0, main);
        const bEnd = this._reelPoint(reel, reel.cellCross, main);
        g.moveTo(a.x, a.y).lineTo(bEnd.x, bEnd.y).stroke({
          color: COLORS.thresholds,
          width: 2,
          alpha: 0.9,
        });
      }
    }
  }

  private _drawBounds(): void {
    const g = this._layer('bounds');
    this._reelSet.reels.forEach((reel: Reel) => {
      for (let cell = 0; cell < reel.visibleCells; cell++) {
        const view = reel.getSymbolAt(cell).view;
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
    this._reelSet.reels.forEach((reel: Reel, reelIndex: number) => {
      for (let cell = 0; cell < reel.visibleCells; cell++) {
        const fp = this._reelSet.getSymbolFootprint(reelIndex, cell);
        if (fp.size.reels <= 1 && fp.size.cells <= 1) continue;
        if (fp.anchor.reel !== reelIndex || fp.anchor.cell !== cell) continue;
        const rect = this._reelSet.getBlockBounds(reelIndex, cell);
        g.rect(rect.x, rect.y, rect.width, rect.height).stroke({
          color: COLORS.blocks,
          width: 3,
        });
      }
    });
  }

  private _drawPins(): void {
    const g = this._layer('pins');
    this._reelSet.reels.forEach((reel: Reel, reelIndex: number) => {
      for (let cell = 0; cell < reel.visibleCells; cell++) {
        const pin = this._reelSet.getPin(reelIndex, cell);
        if (!pin) continue;
        const b = this._reelSet.getCellBounds(reelIndex, cell);
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
    // One Text per reel, stacked as a single left-aligned column.
    //
    // Each line used to be anchored at its own reel's top-left corner, which
    // assumed a line fits inside a reel. It does not: ~40 characters at 11px
    // monospace is ~230px against a cell that is typically ~100px wide, so on
    // any set past two reels every line overprinted its neighbours into an
    // unreadable smear -- worse the more reels you had, which is exactly when
    // you want the hud. A column reads at any reel count and in either
    // orientation; the `r<n>` prefix still ties a line to its reel, and the
    // `cells` layer labels each cell `reel,cell` on the canvas.
    //
    // Anchored INSIDE the mask's top-left, not outside it. Stacking below the
    // mask would keep the reels clear, but a host that sized its camera to the
    // reel set before the overlay existed then renders the whole block
    // off-screen, and an invisible hud is worse than a cluttered one. A debug
    // layer you opted into may cover art; drop `hud` if it is in the way.
    const g = this._layer('hud');
    const vp = this._reelSet.viewport;
    const left = vp.x + HUD_PAD;
    const top = vp.y + HUD_PAD;
    let i = 0;
    let widest = 0;
    this._reelSet.reels.forEach((reel: Reel, reelIndex: number) => {
      const t = this._text(this._hudTexts, i, COLORS.hud, HUD_FONT_SIZE);
      // Render at 1x rather than devicePixelRatio: at 10px the glyphs come out
      // blocky and aliased instead of grey-smeared, which is both the pixel
      // look and the more legible one over busy art. Guarded because assigning
      // resolution dirties the texture and would re-rasterize every live tick.
      if (t.resolution !== 1) t.resolution = 1;
      const axis = reel.axis;
      // Single letters keep the line short: V/H orientation, F/R direction,
      // then the runtime state.
      const o = axis.orientation === 'vertical' ? 'V' : 'H';
      const d = axis.direction === 'forward' ? 'F' : 'R';
      t.text =
        `r${reelIndex} ${o}${d} feed=${axis.feedEdge} ` +
        `spd=${reel.speed.toFixed(1)} ${this._phase[reelIndex]} cells=${reel.visibleCells}`;
      t.x = left;
      t.y = top + i * HUD_LINE_HEIGHT;
      widest = Math.max(widest, t.text.length);
      i++;
    });
    this._hideTextsFrom(this._hudTexts, i);
    // Backing plate, so white text survives bright art. `_layer` added this
    // Graphics before the pool's Texts, so child order already puts it under
    // them.
    if (i > 0) {
      g.rect(
        left - HUD_PAD,
        top - HUD_PAD,
        widest * HUD_FONT_SIZE * HUD_CHAR_ADVANCE + HUD_PAD * 2,
        i * HUD_LINE_HEIGHT + HUD_PAD * 2,
      ).fill({ color: HUD_BACKING_COLOR, alpha: HUD_BACKING_ALPHA });
    }
  }
}
