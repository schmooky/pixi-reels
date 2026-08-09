import type { ReelCellInset, ReelCellQuad } from '../config/types.js';
import type { ReelAxis } from './ReelAxis.js';

/**
 * Fake the curvature of a spinning reel cylinder.
 *
 * The middle cell faces you; the outer ones have rotated away, so their far
 * edge sits further from your eye. A camera turns those into TRAPEZOIDS, not
 * smaller rectangles.
 *
 * ```
 *   amount: 0            amount: 0.5
 *  +-----------+        +-----------+
 *  |  A  A  A  |        |  /-\ /-\  |   <- far edge narrower: keystone
 *  |  B  B  B  |        | | B | B | |   <- faces you, full size
 *  |  C  C  C  |        |  \-/ \-/  |
 *  +-----------+        +-----------+
 * ```
 *
 * @example
 * ```ts
 * builder.curve(0.35);                               // whole set
 * builder.curvePerReel([0.2, 0.35, 0.5, 0.35, 0.2]); // deeper in the middle
 * ```
 */
export interface ReelCurveConfig {
  /**
   * How far round the drum the window sees. `0` flat (default), `1` hard
   * barrel. Drives both the bunching toward the edges and the keystone.
   */
  amount: number;
  /**
   * Perspective strength: how much smaller an edge cell is than the middle one.
   * `0.25` renders the window edge a fifth smaller. `0` is orthographic - cells
   * bunch, nothing recedes, nothing keystones. Defaults to `amount * 0.5`.
   *
   * Clamped below `cos(arc)`, past which the projection folds cells back over
   * each other, so it saturates as `amount` approaches `1`.
   */
  depth?: number;
}

/** `curve(0.35)` and `curve({ amount: 0.35 })` mean the same thing. */
export type ReelCurveInput = number | ReelCurveConfig;

/**
 * Where the camera sits across the strip.
 *
 *   - `'reel'` (default). One per reel, dead ahead. Every reel its own drum.
 *     Right when the reels read as separate - framed columns, wide gaps.
 *   - `'set'`. One in front of the middle of the board. Receding cells also
 *     lean IN, so the grid reads as one wide cylinder. Outer reels do the
 *     leaning; the middle one barely moves.
 *   - `'set-lean'`. Halfway. Usually the sweet spot on a 5-wide board.
 */
export type CurveFocus = 'reel' | 'set-lean' | 'set';

/**
 * How the curve is drawn.
 *
 *   - `'symbol'` (default). Project each cell alone. Crisp, free, a real
 *     keystone - but only for content that IS a texture, because a `Container`
 *     transform is affine and can displace a Spine skeleton without bending it.
 *   - `'warp'`. Render each reel to a texture, draw it through a mesh whose
 *     VERTICES are displaced. Everything inside bends, no symbol cooperates.
 *     Costs one render pass per reel per frame and one resample.
 */
export type CurveMode = 'symbol' | 'warp';

/** How far each focus mode leans from the reel's centreline toward the set's. */
export const CURVE_FOCUS_WEIGHT: Record<CurveFocus, number> = {
  reel: 0,
  'set-lean': 0.5,
  set: 1,
};

/**
 * Widest arc `amount: 1` maps to, in radians (~57 degrees). Well under `PI / 2`
 * so `sin` stays monotonic AND `cos(arc)` leaves a usable `depth` range - the
 * fold-over limit is `depth < cos(arc)`, zero at 90 degrees.
 */
const MAX_ARC = 1.0;

/** Below this the curve is indistinguishable from flat and the math degenerates. */
const MIN_ARC = 1e-4;

/** Fraction of the fold-over limit `depth` is allowed to reach. */
const DEPTH_SAFETY = 0.9;

/** Normalize the shorthand and fill in the derived, fold-safe default. */
export function resolveCurveConfig(input: ReelCurveInput): Required<ReelCurveConfig> {
  const cfg = typeof input === 'number' ? { amount: input } : input;
  const amount = clamp01(cfg.amount);
  const requested = clamp01(cfg.depth ?? amount * 0.5);
  // `cos(arc)` is where `d/dphi (sin phi / (1 + k(1 - cos phi)))` hits zero and
  // the projection stops being monotonic - past it, cells at the window edge
  // reverse and the strip visibly turns inside out.
  const limit = DEPTH_SAFETY * Math.cos(amount * MAX_ARC);
  return { amount, depth: Math.min(requested, limit) };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The curvature of one reel: a camera looking at a drum.
 *
 * The strip wraps a cylinder whose radius makes the window cover `2 * arc`
 * radians, with the camera far enough in front that the window edge renders
 * `depth` smaller than the middle. Every cell edge goes through that one
 * model, so the result is a real perspective quad, not a scaled rectangle.
 *
 * It never writes a symbol's `position`. That coordinate is load-bearing -
 * `Reel` reads it back in `beginMotion`, `notifyLanded` and `_replaceSymbol`
 * to recover which slot a symbol is in, and a bent value taken for a flat one
 * compounds on every round trip. The projection is handed over as a view-LOCAL
 * quad instead.
 */
export class ReelCurve {
  private readonly _arc: number;
  /** Cylinder radius over camera distance. Drives the perspective divide. */
  private readonly _k: number;
  /** Perspective factor at the window edge. */
  private readonly _edgeScale: number;
  /** Normalization divisor. See the note in the constructor. */
  private readonly _norm: number;
  /** Where the window edge lands, as a fraction of the half-extent. */
  private readonly _edgeMapped: number;
  /** Slope of the projection past the window edge, in flat-coordinate units. */
  private readonly _edgeSlope: number;

  private _cellMain = 0;
  private _cellCross = 0;
  private _halfExtent = 0;
  private _radius = 0;
  /**
   * Reel-local cross coordinate the perspective converges on. Defaults to the
   * reel's own centreline; `ReelSetBuilder.curveFocus()` can move it toward
   * the middle of the whole board.
   */
  private _focusCross: number | null = null;

  constructor(
    private readonly _config: Required<ReelCurveConfig>,
    private readonly _axis: ReelAxis,
  ) {
    this._arc = _config.amount * MAX_ARC;
    const sinArc = Math.sin(this._arc);
    const cosArc = Math.cos(this._arc);
    // `depth` is defined as the shrink at the window edge, so
    // `1 / (1 + k * (1 - cos arc)) = 1 / (1 + depth)` fixes k directly.
    const versine = 1 - cosArc;
    this._k = versine > 0 ? _config.depth / versine : 0;
    this._edgeScale = this._perspectiveAt(this._arc);
    // Normalize so the MIDDLE of the window is drawn at 1:1: `d/dm` at the
    // centre is `arc / norm`, so `norm = arc` leaves the cell facing the
    // camera at authored size, both axes, no keystone.
    //
    // Normalizing to `sin(arc) * s(arc)` would pin the ends to the window
    // instead, but magnifies the main axis at the centre and not the cross
    // axis - a visibly STRETCHED middle row. So the ends fall short, and the
    // buffer cells fill that band. Positive constant either way, so
    // monotonicity is unaffected.
    this._norm = this._arc > 0 ? this._arc : 1;
    // Where the drum's edge reaches, as a fraction of the half-extent. `1`
    // would touch the window edge; short of that is the band the buffer cells
    // (and your frame art) live in.
    this._edgeMapped = (sinArc * this._edgeScale) / this._norm;
    // d/dphi of `sin(phi) * s(phi)` reduces to `(cos phi (1 + k) - k) * s^2`;
    // normalized, then converted from radians to flat-coordinate units.
    this._edgeSlope =
      this._arc > 0
        ? (this._arc *
            (cosArc * (1 + this._k) - this._k) *
            this._edgeScale *
            this._edgeScale) /
          this._norm
        : 1;
  }

  /** The resolved config this curve was built from. */
  get config(): Required<ReelCurveConfig> {
    return this._config;
  }

  /** True when the curve is flat enough that projecting anything is a waste. */
  get isFlat(): boolean {
    return this._arc < MIN_ARC;
  }

  /**
   * (Re)bind the geometry the projection is defined against. Called on build
   * and from `Reel.reshape()`, which changes both cell size and cell count.
   *
   * @param cellMain   main-axis extent of one cell's art
   * @param cellCross  cross-axis extent of one cell's art
   * @param pitch      main-axis distance between two cell origins (cell + gap)
   * @param visibleCells how many cells the window shows
   */
  setGeometry(cellMain: number, cellCross: number, pitch: number, visibleCells: number): void {
    this._cellMain = cellMain;
    this._cellCross = cellCross;
    // The window spans the first cell's leading edge to the last cell's
    // trailing edge. the trailing gap is not part of it.
    this._halfExtent = (visibleCells * pitch - (pitch - cellMain)) / 2;
    // Wrap the window onto the drum: half the window is `arc` radians of arc
    // length, so `halfExtent = R * arc`.
    this._radius = this._arc > 0 ? this._halfExtent / this._arc : 0;
  }

  /**
   * Point the camera somewhere other than this reel's own centreline. Cells
   * converge on THAT point as they recede - what turns five drums into one.
   *
   * @param cross reel-local cross coordinate, or `null` for the reel's centre
   */
  setFocus(cross: number | null): void {
    this._focusCross = cross;
  }

  /** The cross coordinate the perspective converges on, reel-local. */
  get focusCross(): number {
    return this._focusCross ?? this._cellCross / 2;
  }

  /**
   * Project the cell whose flat leading edge sits at reel-local `mainStart`.
   *
   * Returns `null` when there is nothing to project, so callers can hand the
   * flat case straight through without allocating.
   */
  quadFor(mainStart: number, inset?: ReelCellInset | null): ReelCellQuad | null {
    if (this.isFlat || this._halfExtent <= 0) return null;

    // Project the rectangle the ART is really in - for a trimmed atlas frame,
    // much smaller than the cell. Using the whole cell would inflate a small
    // symbol and give it the cell's keystone instead of its own, milder one.
    let mainFrom = mainStart;
    let mainTo = mainStart + this._cellMain;
    let crossFrom = 0;
    let crossTo = this._cellCross;
    if (inset) {
      // The inset is screen-space; project it onto the reel's own axes so
      // "left/top" means the right thing on a sideways set too.
      const from = this._axis.toLocal(inset.left, inset.top);
      const to = this._axis.toLocal(inset.right, inset.bottom);
      mainFrom = mainStart + from.main * this._cellMain;
      mainTo = mainStart + to.main * this._cellMain;
      crossFrom = from.cross * this._cellCross;
      crossTo = to.cross * this._cellCross;
    }

    const near = this._project(mainFrom);
    const far = this._project(mainTo);
    // Converge on the camera's optical axis. Default is the reel's own
    // centreline, so a cell narrows in place; aimed at the board's middle, a
    // receding cell also LEANS toward it and the reels read as one drum.
    const centre = this.focusCross;
    const nearFrom = centre + (crossFrom - centre) * near.scale;
    const nearTo = centre + (crossTo - centre) * near.scale;
    const farFrom = centre + (crossFrom - centre) * far.scale;
    const farTo = centre + (crossTo - centre) * far.scale;
    // View-local: the view's origin is the flat cell's leading corner.
    const nearMain = near.main - mainStart;
    const farMain = far.main - mainStart;

    const a0 = this._axis.toScreen(nearFrom, nearMain);
    const a1 = this._axis.toScreen(nearTo, nearMain);
    const b0 = this._axis.toScreen(farFrom, farMain);
    const b1 = this._axis.toScreen(farTo, farMain);

    const origin = this._axis.toScreen(crossFrom, mainFrom - mainStart);
    const size = this._axis.toScreen(crossTo - crossFrom, mainTo - mainFrom);
    const box = { x: origin.x, y: origin.y, width: size.x, height: size.y };
    const vertical = this._axis.orientation === 'vertical';

    // Clockwise from screen top-left. Vertical: smaller main is the TOP edge,
    // so the near pair is (TL, TR). Horizontal: it is the LEFT edge, so the
    // near pair is (TL, BL). Art stays upright either way, so the texture's
    // top-left must keep landing on the screen's top-left.
    return vertical
      ? {
          ...box,
          x0: a0.x, y0: a0.y,
          x1: a1.x, y1: a1.y,
          x2: b1.x, y2: b1.y,
          x3: b0.x, y3: b0.y,
        }
      : {
          ...box,
          x0: a0.x, y0: a0.y,
          x1: b0.x, y1: b0.y,
          x2: b1.x, y2: b1.y,
          x3: a1.x, y3: a1.y,
        };
  }

  /**
   * Where a flat reel-local main coordinate lands on the drum. Public so
   * `getCellBounds()` and game-drawn overlays follow the curve, not the flat
   * grid behind it.
   */
  mapMain(main: number): number {
    return this._project(main).main;
  }

  /**
   * How much smaller the drum renders whatever sits at `main`. `1` at the
   * window's middle, `1 / (1 + depth)` at its edges. Public for the same
   * reason as {@link ReelCurve.mapMain}.
   */
  scaleAt(main: number): number {
    return this._project(main).scale;
  }

  /**
   * Project one flat reel-local main coordinate: where it lands, and how much
   * the perspective divide shrinks whatever is there.
   *
   * Inside the window: a point wrapped on the cylinder, pushed through the
   * perspective divide.
   *
   * POSITION continues as a straight line past the window - carrying `sin`
   * beyond its peak folds the buffer back on itself. SCALE does not need that:
   * `1 - cos(phi)` is still climbing out there and nothing folds. Pinning it
   * to the edge value gave every buffer cell two equal edges, i.e. a flat
   * rectangle beside a hard-curved neighbour.
   */
  private _project(main: number): { main: number; scale: number } {
    if (this.isFlat || this._halfExtent <= 0) return { main, scale: 1 };
    const h = this._halfExtent;
    const phi = (main - h) / this._radius;
    // Clamp only the ANGLE, and only at half a turn, where `cos` would turn
    // back on itself. Buffers never reach it at any sane arc; this is just so
    // a pathological strip length cannot un-shrink a cell.
    const scale = this._perspectiveAt(Math.min(Math.abs(phi), Math.PI));
    // Continue from where the window edge ACTUALLY lands - not the window
    // edge itself, now the centre is normalized to 1:1. Anchoring on `2h`/`0`
    // left a jump there and detached the buffer cells from the strip.
    const edge = h * this._edgeMapped;
    if (phi > this._arc) {
      return { main: h + edge + (main - 2 * h) * this._edgeSlope, scale };
    }
    if (phi < -this._arc) {
      return { main: h - edge + main * this._edgeSlope, scale };
    }
    return { main: h + (h * Math.sin(phi) * scale) / this._norm, scale };
  }

  /**
   * Perspective divide at arc angle `phi`. A point rotated `phi` round the
   * drum has receded `R * (1 - cos phi)`; the camera shrinks it by that.
   */
  private _perspectiveAt(phi: number): number {
    return 1 / (1 + this._k * (1 - Math.cos(phi)));
  }
}
