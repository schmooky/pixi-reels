import { Container, Rectangle, Text, Ticker } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import type { ReelSet } from '../core/ReelSet.js';
import type { Reel } from '../core/Reel.js';
import type { Disposable } from '../utils/Disposable.js';
import { TickerRef } from '../utils/TickerRef.js';
import { PHASE_CARD_COLORS } from '../symbols/PhaseCardSymbol.js';
import { DebugPlaque, DEBUG_FONT } from './DebugPlaque.js';
import type { DebugPlaqueRow } from './DebugPlaque.js';
import { SpinMetrics } from './SpinMetrics.js';
import type { DebugRound } from './SpinMetrics.js';
import { roundRectPath } from './roundRectPath.js';

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
 *   - `hud`        A plaque inside the mask: one row per reel with its
 *                  orientation, direction, feed edge, speed, phase and cells,
 *                  a phase-colored swatch and a speed meter.
 *   - `metrics`    A plaque under the mask: the current round's length, time
 *                  to the first stop, landing order, tease and skip windows,
 *                  symbols the pool had to build, events, fps.
 *   - `timeline`   A panel under the mask: every reel's phases for the current
 *                  round on one time axis, with its speed trace, the moment it
 *                  was asked to stop, the moment it landed and every skip press.
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
  | 'hud'
  | 'metrics'
  | 'timeline';

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
  'metrics',
  'timeline',
];

/** Per-layer colors. Distinct hues so overlapping layers stay legible. */
const COLORS = {
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
  metrics: 0x64d2ff, // sky     metrics accent
  timeline: 0xffffff, // white   timeline accent
} as const satisfies Record<DebugOverlayLayer, number>;

/** Container / layer label prefix. Used by the Pixi devtools and by tests. */
export const OVERLAY_LABEL = 'pixi-reels:debugOverlay';

/** Mask per-reel rect color (green), separate from the red mask box. */
const MASK_RECT_COLOR = 0x34c759;
/** Pin-overlay marker color (green), separate from the purple pin cell. */
const PIN_OVERLAY_COLOR = 0x34c759;
/** Landed marker on the timeline. */
const LANDED_COLOR = 0x30d158;
/** Skip-press marker per mode. */
const SKIP_COLORS = { slam: 0xff453a, quicken: 0xffd60a } as const;
/** Dim text on the info panels. */
const DIM = 0x9ca3af;
/** Pink for a nudge: not a phase PhaseCardSymbol paints, so not in its map. */
const NUDGE_COLOR = 0xf472b6;

/** Info-panel metrics. */
const HUD_FONT_SIZE = 10;
const LABEL_FONT_SIZE = 9;
/** Inset of the hud from the mask's top-left corner. */
const HUD_PAD = 4;
/** Gap between the mask and the panels under it, and between the panels. */
const PANEL_GAP = 8;
/**
 * A timeline narrower than this is not worth reading: it goes under the
 * metrics instead. A classic 5 x 90 px set leaves just over 200 beside them.
 */
const TIMELINE_MIN_WIDTH = 200;
/**
 * The metrics plaque's fixed width. Fixed so the panels do not reflow from
 * frame to frame as the numbers change length: a long row wraps instead.
 */
const METRICS_WIDTH = 232;
const LANE_H = 7;
const LANE_GAP = 4;

export interface DebugOverlayOptions {
  /**
   * Which layers to draw. An explicit list, or `'all'` for every layer.
   * Defaults to `'all'`.
   */
  layers?: DebugOverlayLayer[] | 'all';
  /**
   * When `true`, the live layers (`bounds` / `blocks` / `pins` / `hud` /
   * `metrics` / `timeline`) redraw every tick. When `false` (default) the
   * overlay draws once, redraws the geometry on `redraw()` / `setLayers()`
   * and reshape events, and the info panels on the set's spin events.
   */
  live?: boolean;
  /**
   * Ticker driving the live redraw when `live: true`. Defaults to
   * `Ticker.shared`. Pass the reel set's own ticker (e.g. `app.ticker`, or a
   * `FakeTicker` in tests) to keep the overlay in lock-step with it. Ignored
   * when `live` is falsy.
   */
  ticker?: Ticker;
  /**
   * The recorder the `metrics` and `timeline` layers read. Pass one that has
   * been running since the reel set was built and the panels show the rounds
   * before the overlay existed; the caller keeps ownership of it. Without one
   * the overlay records its own from now on, sampling speed on the live
   * ticker, and destroys it with itself.
   */
  metrics?: SpinMetrics;
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
  /** The round the `metrics` and `timeline` layers show, `null` before the first. */
  round: DebugRound | null;
}

/** Handle returned by {@link debugOverlay}. Owns its display objects. */
export interface DebugOverlayHandle extends Disposable {
  /** Swap the active layer set and redraw. Accepts a list or `'all'`. */
  setLayers(layers: DebugOverlayLayer[] | 'all'): void;
  /** Force a full redraw (static + live layers). */
  redraw(): void;
  /**
   * Plain-JSON description of what the axis / feed / thresholds layers
   * represent, per reel, plus the round the info panels show. PixiJS renders
   * to a canvas, which CLAUDE.md notes AI agents and CI cannot see; this is
   * the same information in a form they (and `expect`) can read. No PixiJS
   * types, safe to `JSON.stringify`.
   */
  describe(): DebugOverlaySnapshot;
  /** The recorder behind the `metrics` and `timeline` layers. */
  readonly metrics: SpinMetrics;
  /** Remove the overlay from the reel set and dispose every allocation. */
  destroy(): void;
  readonly isDestroyed: boolean;
}

/**
 * Stacking slot of a layer inside the overlay: its place in {@link ALL_LAYERS}.
 * A layer switched on later is created later, and without this it would land
 * on top of the hud and the panels instead of under them.
 */
function layerZ(layer: DebugOverlayLayer): number {
  return ALL_LAYERS.indexOf(layer) * 10;
}

function resolveLayers(
  layers: DebugOverlayLayer[] | 'all' | undefined,
): Set<DebugOverlayLayer> {
  if (layers === undefined || layers === 'all') return new Set(ALL_LAYERS);
  return new Set(layers);
}

/** The color a phase paints with everywhere in the debug kit. */
function phaseColor(phase: string): number {
  if (phase === 'nudge') return NUDGE_COLOR;
  return PHASE_CARD_COLORS[phase] ?? PHASE_CARD_COLORS.other;
}

/** `1234` as `1234ms`, `12345` as `12.3s`: short enough for a plaque column. */
function fmtMs(ms: number): string {
  return ms < 10_000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** The step of a readable time axis over `range` ms: about five ticks. */
function niceStep(range: number): number {
  for (const step of [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000]) {
    if (range / step <= 6) return step;
  }
  return 20_000;
}

/**
 * A layered visual debug overlay for a {@link ReelSet}, drawn with
 * `pixi-silk`: mask, cell, buffer, axis, symbol-bounds, big-symbol-block and
 * pin geometry, a per-reel hud, and a metrics plaque and phase timeline for
 * the current round. It lives in a `Container` added to the reel set itself.
 * because `ReelSet extends Container`, that renders the overlay above the
 * viewport, including the spotlight container.
 *
 * The geometry and the hud stay inside the mask. The `metrics` and
 * `timeline` panels sit under it, so they add to the reel set's bounds: fit
 * your camera after enabling them, or leave them out.
 *
 * Dev-only. It reads engine internals through the public accessors, is not
 * semver-protected, and must not reach a production bundle.
 *
 * ```ts
 * import { debugOverlay } from 'pixi-reels/debug';
 *
 * const overlay = debugOverlay(reelSet, { layers: ['cells', 'timeline'], live: true, ticker: app.ticker });
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
  private _graphics = new Map<DebugOverlayLayer, SilkGraphics>();
  private _cellLabels: Text[] = [];
  private _hud: DebugPlaque | null = null;
  private _metricsPlaque: DebugPlaque | null = null;
  private _timeline: Container | null = null;
  private _timelineGfx: SilkGraphics | null = null;
  private _timelineTexts: Text[] = [];
  private _active: Set<DebugOverlayLayer>;
  private _ticker: Ticker | null = null;
  private _tickerRef: TickerRef | null = null;
  private _metrics: SpinMetrics;
  private _ownsMetrics: boolean;
  private _isDestroyed = false;

  /** Current phase name per reel, tracked off the reel bus for the hud layer. */
  private _phase: string[];
  /** Detach callbacks for the per-reel phase listeners. */
  private _reelDetach: Array<() => void> = [];
  private _onStatic = (): void => this._redrawStatic();
  /** Not live: the info panels follow the set's own events instead of the ticker. */
  private _onSetEvent = (event: string): void => {
    if (event !== 'destroyed') this._redrawInfo();
  };
  /**
   * The set is going away: let go of the ticker and the buses now. A live
   * overlay left behind would tick on into reels that no longer exist.
   */
  private _onDestroyed = (): void => this.destroy();
  /** The board grew: follow the new reels' phases and redraw the static layers over them. */
  private _onReelsAdded = (info: { from: number; count: number }): void => {
    for (let i = info.from; i < info.from + info.count; i++) {
      this._phase[i] = 'idle';
      this._trackPhase(this._reelSet.reels[i], i);
    }
    this._redrawStatic();
  };
  /** The board shrank: the removed reels' listeners died with them. */
  private _onReelsRemoved = (info: { from: number }): void => {
    this._phase.length = info.from;
    this._redrawStatic();
  };

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
    this._root.sortableChildren = true;
    _reelSet.addChild(this._root);

    _reelSet.reels.forEach((reel: Reel, i: number) => this._trackPhase(reel, i));

    // Static layers redraw only on reshape, not per tick.
    _reelSet.events.on('shape:changed', this._onStatic);
    _reelSet.events.on('adjust:complete', this._onStatic);
    _reelSet.events.on('reels:added', this._onReelsAdded);
    _reelSet.events.on('reels:removed', this._onReelsRemoved);
    _reelSet.events.on('destroyed', this._onDestroyed);

    if (options.live) {
      this._ticker = options.ticker ?? Ticker.shared;
    }
    this._ownsMetrics = !options.metrics;
    this._metrics = options.metrics ?? new SpinMetrics(_reelSet, { ticker: this._ticker ?? undefined });

    if (this._ticker) {
      this._tickerRef = new TickerRef(this._ticker);
      this._tickerRef.add(() => this._redrawLive());
    } else {
      _reelSet.events.onAny(this._onSetEvent);
    }

    this.redraw();
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Track one reel's phase for the hud layer via the reel bus. There is no
   * `reel.phase` accessor. phases are only observable as events.
   */
  private _trackPhase(reel: Reel, i: number): void {
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
  }

  get metrics(): SpinMetrics {
    return this._metrics;
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
    if (this._hud) this._hud.visible = this._active.has('hud');
    if (this._metricsPlaque) this._metricsPlaque.visible = this._active.has('metrics');
    if (this._timeline) this._timeline.visible = this._active.has('timeline');
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
      round: this._metrics.current
        ? (JSON.parse(JSON.stringify(this._metrics.current)) as DebugRound)
        : null,
    };
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;

    this._tickerRef?.destroy();
    this._tickerRef = null;

    this._reelSet.events.off('shape:changed', this._onStatic);
    this._reelSet.events.off('adjust:complete', this._onStatic);
    this._reelSet.events.off('reels:added', this._onReelsAdded);
    this._reelSet.events.off('reels:removed', this._onReelsRemoved);
    this._reelSet.events.off('destroyed', this._onDestroyed);
    this._reelSet.events.offAny(this._onSetEvent);
    for (const detach of this._reelDetach) detach();
    this._reelDetach.length = 0;
    if (this._ownsMetrics) this._metrics.destroy();

    if (this._root.parent) this._root.parent.removeChild(this._root);
    // Destroys every pooled SilkGraphics, plaque and Text child in one call.
    this._root.destroy({ children: true });
    this._graphics.clear();
    this._cellLabels.length = 0;
    this._timelineTexts.length = 0;
    this._hud = null;
    this._metricsPlaque = null;
    this._timeline = null;
    this._timelineGfx = null;
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
   * The live layers. `bounds` / `pins` / `hud` track per-frame state;
   * `blocks` joins them because a big symbol's block outline tracks landed
   * content (which changes on every result), not just reshapes.
   */
  private _redrawLive(): void {
    if (this._isDestroyed) return;
    if (this._active.has('bounds')) this._drawBounds();
    if (this._active.has('blocks')) this._drawBlocks();
    if (this._active.has('pins')) this._drawPins();
    this._redrawInfo();
  }

  /** The info panels: hud, metrics and timeline. */
  private _redrawInfo(): void {
    if (this._isDestroyed) return;
    if (this._active.has('hud')) this._drawHud();
    if (this._active.has('metrics')) this._drawMetrics();
    if (this._active.has('timeline')) this._drawTimeline();
    this._layoutPanels();
  }

  // --- pooling helpers -----------------------------------------------------

  /** One persistent SilkGraphics per layer, created on first use, cleared per draw. */
  private _layer(layer: DebugOverlayLayer): SilkGraphics {
    let g = this._graphics.get(layer);
    if (!g) {
      // Labelled so it is identifiable in the Pixi devtools tree and in
      // tests, which is the only way to assert a layer drew where it should.
      g = new SilkGraphics({ label: `${OVERLAY_LABEL}:${layer}` });
      g.zIndex = layerZ(layer);
      this._graphics.set(layer, g);
      this._root.addChild(g);
    }
    g.visible = true;
    g.clear();
    return g;
  }

  /** Reuse (or lazily grow) a text pool slot. Never measured. positioned only. */
  private _text(pool: Text[], index: number, color: number, size: number, parent: Container): Text {
    let t = pool[index];
    if (!t) {
      t = new Text({
        text: '',
        style: { fontFamily: DEBUG_FONT, fontSize: size, fill: color },
      });
      pool[index] = t;
      parent.addChild(t);
    }
    t.style.fill = color;
    t.visible = true;
    return t;
  }

  private _hideTextsFrom(pool: Text[], from: number): void {
    for (let i = from; i < pool.length; i++) pool[i].visible = false;
  }

  // --- geometry layers -----------------------------------------------------

  private _drawMask(): void {
    const g = this._layer('mask');
    const vp = this._reelSet.viewport;
    // Cell bounds are ReelSet-local (they add viewport.x/y); mirror that here
    // since the overlay root sits in ReelSet-local space, not viewport-local.
    const vx = vp.x;
    const vy = vp.y;
    g.rect(vx, vy, vp.maskWidth, vp.maskHeight).stroke({ color: COLORS.mask, width: 2 });
    for (const rect of vp.maskRects) {
      roundRectPath(g, vx + rect.x, vy + rect.y, rect.width, rect.height).stroke({
        color: MASK_RECT_COLOR,
        width: 1.5,
        dash: [6, 4],
      });
    }
  }

  private _drawCells(): void {
    const g = this._layer('cells');
    const advance = LABEL_FONT_SIZE * 0.6;
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
          g.poly(quad, true).stroke({ color: COLORS.cells, width: 1, alpha: 0.85 });
        } else {
          g.roundRect(b.x + 0.5, b.y + 0.5, b.width - 1, b.height - 1, 3).stroke({
            color: COLORS.cells,
            width: 1,
            alpha: 0.85,
          });
        }
        const text = `${reelIndex},${cell}`;
        // Anchor the label on the quad's own leading corner so it tracks the
        // bend instead of floating off in the bounding box's dead space.
        const lx = (quad ? quad[0].x : b.x) + 3;
        const ly = (quad ? quad[0].y : b.y) + 3;
        // A dark chip under the label, so it reads over any art.
        g.roundRect(lx - 2, ly - 1, text.length * advance + 4, LABEL_FONT_SIZE + 3, 3).fill({
          color: 0x000000,
          alpha: 0.55,
        });
        const label = this._text(this._cellLabels, labelIndex++, COLORS.cells, LABEL_FONT_SIZE, this._root);
        label.zIndex = layerZ('cells') + 1;
        label.text = text;
        label.x = lx;
        label.y = ly;
      }
    });
    this._hideTextsFrom(this._cellLabels, labelIndex);
  }

  private _drawBuffers(): void {
    const g = this._layer('buffers');
    for (const reel of this._reelSet.reels) {
      const pitch = reel.motion.slotPitch;
      const draw = (main: number): void => {
        // Follow the drum. A buffer box left on the flat grid sits nowhere
        // near the symbol it is labelling once the reel is curved, and the
        // buffers are exactly the cells the curve moves furthest.
        const curve = reel.curve;
        const from = curve ? curve.mapMain(main) : main;
        const to = curve ? curve.mapMain(main + reel.cellMain) : main + reel.cellMain;
        const cross = curve ? reel.cellCross * curve.scaleAt(main + reel.cellMain / 2) : reel.cellCross;
        const r = this._reelRect(reel, (reel.cellCross - cross) / 2, from, cross, to - from);
        roundRectPath(g, r.x, r.y, r.width, r.height).stroke({
          color: COLORS.buffers,
          width: 1,
          alpha: 0.6,
          dash: [4, 3],
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

  /**
   * One arrow per reel, drawn along the travel axis and pointing the way the
   * strip actually moves. Reads polarity, so a `direction('reverse')` reel
   * points back at you.
   */
  private _drawAxis(): void {
    const g = this._layer('axis');
    for (const reel of this._reelSet.reels) {
      const span = reel.visibleCells * reel.motion.slotPitch;
      const midCross = reel.cellCross / 2;
      const { fromMain: tailMain, toMain: headMain } = this._arrowMains(reel);
      const forward = reel.axis.polarity > 0;
      // Arrowhead: a triangle pulled back along travel and out to both sides
      // on the cross axis. The shaft stops at its base so the tip stays sharp.
      const barb = Math.min(span * 0.12, reel.cellCross * 0.4) || 8;
      const backMain = headMain - (forward ? barb : -barb);
      const tail = this._reelPoint(reel, midCross, tailMain);
      const base = this._reelPoint(reel, midCross, backMain);
      const head = this._reelPoint(reel, midCross, headMain);
      const left = this._reelPoint(reel, midCross - barb * 0.6, backMain);
      const right = this._reelPoint(reel, midCross + barb * 0.6, backMain);
      g.line(tail.x, tail.y, base.x, base.y).stroke({ color: COLORS.axis, width: 3, cap: 'round' });
      g.triangle(head.x, head.y, left.x, left.y, right.x, right.y, 1).fill(COLORS.axis);
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
      g.roundRect(r.x, r.y, r.width, r.height, Math.min(r.width, r.height) / 2).fill({
        color: COLORS.feed,
        alpha: 0.55,
      });
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
        g.line(a.x, a.y, bEnd.x, bEnd.y).stroke({
          color: COLORS.thresholds,
          width: 2,
          alpha: 0.9,
          dash: [6, 4],
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
        g.roundRect(rect.x, rect.y, rect.width, rect.height, 6)
          .fill({ color: COLORS.blocks, alpha: 0.08 })
          .stroke({ color: COLORS.blocks, width: 3, alignment: 'inside' });
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
        g.roundRect(b.x, b.y, b.width, b.height, 4).stroke({
          color: COLORS.pins,
          width: 3,
          alignment: 'inside',
        });
        // A diagonal cross marks the pin-overlay cell, so a movePin /
        // pin-overlay disagreement (A1) shows as a cross off its cell.
        g.line(b.x, b.y, b.x + b.width, b.y + b.height)
          .line(b.x + b.width, b.y, b.x, b.y + b.height)
          .stroke({ color: PIN_OVERLAY_COLOR, width: 1, alpha: 0.8 });
      }
    });
  }

  // --- info layers ---------------------------------------------------------

  /**
   * One plaque, one row per reel, stacked as a single left-aligned column.
   *
   * Each line used to be anchored at its own reel's top-left corner, which
   * assumed a line fits inside a reel. It does not: ~40 characters at 10px
   * monospace is ~240px against a cell that is typically ~100px wide, so on
   * any set past two reels every line overprinted its neighbours. A column
   * reads at any reel count and in either orientation; the `r<n>` prefix
   * still ties a row to its reel, and the `cells` layer labels each cell
   * `reel,cell` on the canvas.
   *
   * Anchored INSIDE the mask's top-left, not outside it: a host that sized
   * its camera to the reel set before the overlay existed would otherwise
   * render the whole block off-screen, and an invisible hud is worse than a
   * cluttered one. A debug layer you opted into may cover art; drop `hud` if
   * it is in the way.
   */
  private _drawHud(): void {
    const rows: DebugPlaqueRow[] = this._reelSet.reels.map((reel: Reel, reelIndex: number) => {
      const axis = reel.axis;
      // Single letters keep the row short: V/H orientation, F/R direction,
      // then the runtime state.
      const o = axis.orientation === 'vertical' ? 'V' : 'H';
      const d = axis.direction === 'forward' ? 'F' : 'R';
      const phase = this._phase[reelIndex];
      return {
        text:
          `r${reelIndex} ${o}${d} feed=${axis.feedEdge} ` +
          `spd=${reel.speed.toFixed(1)} ${phase} cells=${reel.visibleCells}`,
        swatch: phase === 'idle' ? PHASE_CARD_COLORS.rest : phaseColor(phase),
        meter: Math.abs(reel.speedNormalized),
        meterColor: phase === 'idle' ? DIM : phaseColor(phase),
      };
    });
    if (!this._hud) {
      this._hud = new DebugPlaque({ fontSize: HUD_FONT_SIZE, padding: [6, 4], shadow: false });
      this._hud.label = `${OVERLAY_LABEL}:hud`;
      this._hud.zIndex = layerZ('hud');
      this._root.addChild(this._hud);
    }
    this._hud.visible = true;
    this._hud.update({ rows });
    const vp = this._reelSet.viewport;
    this._hud.position.set(vp.x + HUD_PAD, vp.y + HUD_PAD);
  }

  private _drawMetrics(): void {
    if (!this._metricsPlaque) {
      this._metricsPlaque = new DebugPlaque({
        fontSize: HUD_FONT_SIZE,
        accent: COLORS.metrics,
        minWidth: METRICS_WIDTH,
        maxWidth: METRICS_WIDTH,
      });
      this._metricsPlaque.label = `${OVERLAY_LABEL}:metrics`;
      this._metricsPlaque.zIndex = layerZ('metrics');
      this._root.addChild(this._metricsPlaque);
    }
    this._metricsPlaque.visible = true;
    const round = this._metrics.current;
    if (!round) {
      // The same rows a round fills in, so the plaque keeps its height when
      // the first spin arrives: the host fitted its camera to this size.
      this._metricsPlaque.update({
        title: 'ROUND -  waiting for a spin',
        rows: ['time', 'land', 'tease', 'skip', 'pool', 'fps', 'wins'].map((k) => ({
          text: `${k.padEnd(6)} -`,
          color: DIM,
        })),
      });
      return;
    }
    const live = this._metrics.isActive;
    const length = this._metrics.length;
    const stops = round.reels.map((r) => r.stoppingAt).filter((t): t is number => t !== null);
    const firstStop = stops.length ? Math.min(...stops) : null;
    const landed = round.landOrder
      .map((i) => round.reels[i].landedAt)
      .filter((t): t is number => t !== null);
    const gaps = landed.slice(1).map((t, i) => t - landed[i]);
    const teases = round.reels.filter((r) => r.tease !== null);
    const created = round.reels.reduce((sum, r) => sum + r.symbolsCreated, 0);
    const lastSkip = round.skips[round.skips.length - 1];
    const fps = this._ticker ? `${Math.round(this._ticker.FPS)}` : '-';

    const rows: DebugPlaqueRow[] = [
      {
        text:
          `time   ${fmtMs(length)}` +
          (firstStop !== null ? `   first stop +${fmtMs(firstStop)}` : ''),
      },
      {
        text:
          `land   ${round.landOrder.length ? round.landOrder.join(' ') : '-'}` +
          (gaps.length ? `   max gap ${fmtMs(Math.max(...gaps))}` : ''),
        color: round.landOrder.length ? undefined : DIM,
      },
      {
        text:
          'tease  ' +
          (teases.length
            ? teases
                .map((r) => {
                  const t = r.tease!;
                  return `r${r.reel} ${fmtMs((t.end ?? length) - t.start)}`;
                })
                .join('  ')
            : '-'),
        color: teases.length ? PHASE_CARD_COLORS.anticipation : DIM,
      },
      {
        text: lastSkip
          ? `skip   ${lastSkip.mode} r${lastSkip.reels.join(',')}` +
            `${lastSkip.partial ? ' partial' : ''} @${fmtMs(lastSkip.at)}` +
            (round.skips.length > 1 ? ` (x${round.skips.length})` : '')
          : round.queuedSkipAt !== null
            ? `skip   queued @${fmtMs(round.queuedSkipAt)}`
            : 'skip   -',
        color: lastSkip ? SKIP_COLORS[lastSkip.mode] : round.queuedSkipAt !== null ? SKIP_COLORS.quicken : DIM,
      },
      { text: `pool   +${created} symbols   events ${round.events}` },
      {
        text:
          `fps    ${fps}   pins ${this._reelSet.pins.size}   ` +
          `spotlight ${this._reelSet.spotlight.isActive ? 'on' : 'off'}`,
      },
    ];
    rows.push({
      text: `wins   ${round.wins}   chains ${round.cascadeChains}`,
      color: round.wins > 0 || round.cascadeChains > 0 ? undefined : DIM,
    });
    this._metricsPlaque.update({
      title:
        `ROUND ${round.index}  ${round.profile}  ` +
        (live ? 'live' : round.wasSkipped ? 'skipped' : 'done') +
        (round.boosted ? '  boosted' : ''),
      rows,
    });
  }

  /**
   * Every reel's phases for the current round on one time axis: which phase
   * each reel was in when, the speed trace on top, a tick where the
   * controller asked it to stop, a dot where it came to rest, and a dashed
   * line at every skip press. Stagger, tease holds, a slam that cut a stop
   * short: all of them are shapes here instead of numbers in a log.
   */
  private _drawTimeline(): void {
    if (!this._timeline) {
      this._timeline = new Container();
      this._timeline.label = `${OVERLAY_LABEL}:timeline`;
      this._timeline.zIndex = layerZ('timeline');
      this._timelineGfx = new SilkGraphics({ label: `${OVERLAY_LABEL}:timeline:gfx` });
      this._timeline.addChild(this._timelineGfx);
      this._root.addChild(this._timeline);
    }
    this._timeline.visible = true;
    const g = this._timelineGfx!;
    g.clear();

    const round = this._metrics.current;
    const reels = this._reelSet.reels.length;
    const width = this._timelineWidth();
    const pad = 8;
    const labelW = 24;
    const legendH = 14;
    const axisH = 13;
    const lanesTop = pad + legendH;
    const lanesH = reels * (LANE_H + LANE_GAP) - LANE_GAP;
    const height = lanesTop + lanesH + 4 + axisH + pad - 4;
    const x0 = pad + labelW;
    const x1 = width - pad;

    g.roundRect(0, 1.5, width, height, 8, 0.6).fill({ color: 0x000000, alpha: 0.35, blur: 3 });
    g.roundRect(0, 0, width, height, 8, 0.6)
      .fill({ color: 0x0b0e14, alpha: 0.84 })
      .stroke({ color: 0xffffff, alpha: 0.1, width: 1, alignment: 'inside' });
    // Measured as its plate, like a DebugPlaque, not as the shadow's blur.
    this._timeline.boundsArea = new Rectangle(0, 0, width, height);

    let ti = 0;
    const text = (s: string, x: number, y: number, color: number): Text => {
      const t = this._text(this._timelineTexts, ti++, color, LABEL_FONT_SIZE, this._timeline!);
      t.text = s;
      t.x = Math.round(x);
      t.y = Math.round(y);
      return t;
    };

    // Legend: the phases this round ran, in first-seen order.
    const seen: string[] = [];
    for (const reel of round?.reels ?? []) {
      for (const span of reel.phases) if (!seen.includes(span.phase)) seen.push(span.phase);
    }
    let lx = pad;
    const advance = LABEL_FONT_SIZE * 0.6;
    if (seen.length === 0) {
      text('timeline  (waiting for a spin)', lx, pad - 2, DIM);
    }
    for (const phase of seen) {
      const entry = 10 + phase.length * advance;
      // A cascade round names six phases; stop at the panel edge rather than
      // run past it. The lanes still show every phase in its color.
      if (lx + entry > width - pad) break;
      g.roundRect(lx, pad + 1, 7, 7, 2).fill(phaseColor(phase));
      text(phase, lx + 10, pad - 2, DIM);
      lx += entry + 10;
    }

    const length = Math.max(this._metrics.length, 500);
    const step = niceStep(length);
    const range = Math.ceil(length / step) * step;
    const k = (x1 - x0) / range;
    const tx = (t: number): number => x0 + Math.min(t, range) * k;

    // Grid + axis labels.
    for (let t = 0; t <= range; t += step) {
      const x = tx(t);
      g.line(x, lanesTop - 2, x, lanesTop + lanesH + 2).stroke({
        color: 0xffffff,
        alpha: 0.14,
        width: 1,
        dash: [1, 3],
      });
      const label = t === 0 ? '0' : step >= 1000 ? `${t / 1000}s` : `${t}`;
      text(label, x - (label.length * advance) / 2, lanesTop + lanesH + 4, DIM);
    }

    for (let i = 0; i < reels; i++) {
      const y = lanesTop + i * (LANE_H + LANE_GAP);
      text(`r${i}`, pad, y - 2, DIM);
      g.roundRect(x0, y, x1 - x0, LANE_H, 2).fill({ color: 0xffffff, alpha: 0.05 });
      const reel = round?.reels[i];
      if (!reel) continue;
      for (const span of reel.phases) {
        const xs = tx(span.start);
        const xe = tx(span.end ?? length);
        g.roundRect(xs, y, Math.max(1.5, xe - xs), LANE_H, 2).fill({
          color: phaseColor(span.phase),
          alpha: 0.9,
        });
      }
      if (reel.tease) {
        g.line(tx(reel.tease.start), y + LANE_H + 1.5, tx(reel.tease.end ?? length), y + LANE_H + 1.5).stroke({
          color: PHASE_CARD_COLORS.anticipation,
          width: 1.5,
          cap: 'round',
        });
      }
      if (reel.speed.length >= 4) {
        // About one point per pixel of lane: a long round holds far more
        // samples than the lane can show, and every point is a segment to
        // rebuild each frame.
        const samples = reel.speed.length / 2;
        const stride = Math.max(1, Math.ceil(samples / (x1 - x0))) * 2;
        const pts: number[] = [];
        for (let s = 0; s < reel.speed.length; s += stride) {
          const v = Math.min(1.25, Math.max(0, reel.speed[s + 1]));
          pts.push(tx(reel.speed[s]), y + LANE_H - (v / 1.25) * LANE_H);
        }
        g.polyline(pts).stroke({ color: 0xffffff, alpha: 0.85, width: 1, cap: 'round' });
      }
      if (reel.stoppingAt !== null) {
        const x = tx(reel.stoppingAt);
        g.line(x, y - 1.5, x, y + LANE_H + 1.5).stroke({ color: 0xffffff, alpha: 0.7, width: 1 });
      }
      if (reel.landedAt !== null) {
        g.circle(tx(reel.landedAt), y + LANE_H / 2, 3)
          .fill(LANDED_COLOR)
          .stroke({ color: 0x0b0e14, width: 1 });
      }
    }

    for (const skip of round?.skips ?? []) {
      const x = tx(skip.at);
      g.line(x, lanesTop - 3, x, lanesTop + lanesH + 3).stroke({
        color: SKIP_COLORS[skip.mode],
        width: 1.5,
        dash: [3, 2],
      });
    }

    // The live cursor.
    if (round && this._metrics.isActive) {
      const x = tx(length);
      g.line(x, lanesTop - 3, x, lanesTop + lanesH + 3).stroke({ color: 0xffffff, alpha: 0.6, width: 1 });
    }

    this._hideTextsFrom(this._timelineTexts, ti);
  }

  /** The timeline spans the mask, less the metrics plaque when they share a row. */
  private _timelineWidth(): number {
    const maskW = this._reelSet.viewport.maskWidth;
    const beside = this._panelsSideBySide();
    const metricsW = beside && this._metricsPlaque ? this._metricsPlaque.plateWidth + PANEL_GAP : 0;
    return Math.max(TIMELINE_MIN_WIDTH, maskW - metricsW);
  }

  private _panelsSideBySide(): boolean {
    if (!this._active.has('metrics') || !this._metricsPlaque) return false;
    const maskW = this._reelSet.viewport.maskWidth;
    return maskW - this._metricsPlaque.plateWidth - PANEL_GAP >= TIMELINE_MIN_WIDTH;
  }

  /** Metrics and timeline sit under the mask: side by side when it is wide enough, stacked otherwise. */
  private _layoutPanels(): void {
    const vp = this._reelSet.viewport;
    const left = vp.x;
    const top = vp.y + vp.maskHeight + PANEL_GAP;
    const metrics = this._active.has('metrics') ? this._metricsPlaque : null;
    const timeline = this._active.has('timeline') ? this._timeline : null;
    if (metrics) metrics.position.set(left, top);
    if (!timeline) return;
    if (!metrics) {
      timeline.position.set(left, top);
    } else if (this._panelsSideBySide()) {
      timeline.position.set(left + metrics.plateWidth + PANEL_GAP, top);
    } else {
      timeline.position.set(left, top + metrics.plateHeight + PANEL_GAP);
    }
  }
}
