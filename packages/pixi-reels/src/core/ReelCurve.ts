import type { ReelCellInset, ReelCellQuad } from '../config/types.js';
import type { ReelAxis } from './ReelAxis.js';

/**
 * Fake the curvature of a spinning reel cylinder.
 *
 * A physical slot reel is a drum, and the cells you see are wrapped around it.
 * The one in the middle of the window faces you square-on; the ones near the
 * top and bottom edges have rotated away, so they sit further from your eye and
 * their far edge is further still. Under a real camera that does not squash a
 * cell into a smaller rectangle - it turns it into a TRAPEZOID, narrower on the
 * edge that has rotated away.
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
   * How far round the drum the window sees, `0` (dead flat, the default) to
   * `1` (a hard barrel). This is the only knob most games need: it drives both
   * how much the cells bunch up toward the window edges and how hard they
   * keystone.
   */
  amount: number;
  /**
   * How strong the perspective is - how much smaller a cell at the window edge
   * is than the one facing you. `0.25` puts the edge of the window a fifth
   * further from the camera, so it renders a fifth smaller. `0` gives a flat
   * (orthographic) drum: cells still bunch up, but nothing recedes and nothing
   * keystones. Defaults to `amount * 0.5`.
   *
   * Clamped below `cos(arc)`, past which the projection would fold cells back
   * over each other, so it saturates as `amount` approaches `1`.
   */
  depth?: number;
}

/** `curve(0.35)` and `curve({ amount: 0.35 })` mean the same thing. */
export type ReelCurveInput = number | ReelCurveConfig;

/**
 * Where the camera looking at the drum sits, across the strip.
 *
 *   - `'reel'` (default). one camera per reel, dead ahead of it. Every reel is
 *     its own little drum and looks identical to its neighbours. This is the
 *     right answer when the reels are visually separate - framed columns, wide
 *     gaps, a cabinet with five physical drums in it.
 *   - `'set'`. a single camera in front of the middle of the board. Cells that
 *     rotate away also lean IN toward the centre of the set, so the whole grid
 *     reads as one wide cylinder rather than five identical ones. The outer
 *     reels do most of the leaning; the middle one barely moves.
 *   - `'set-lean'`. halfway between. Keeps a hint of the one-big-drum read
 *     without the outer reels visibly tilting into their neighbours, which is
 *     usually what you want on a 5-wide board with real art in it.
 */
export type CurveFocus = 'reel' | 'set-lean' | 'set';

/**
 * How the curve is drawn.
 *
 *   - `'symbol'` (default). project each cell on its own. Crisp, free, and a
 *     real keystone - but only for symbols whose content IS a texture, because
 *     a `Container` transform is affine and can displace a Spine skeleton or a
 *     composite subtree without ever bending it.
 *   - `'warp'`. render each reel to a texture and draw it through a mesh whose
 *     VERTICES are displaced by the projection. Everything inside bends
 *     identically and no symbol has to cooperate, at the cost of one render
 *     pass per reel per frame and one resample.
 */
export type CurveMode = 'symbol' | 'warp';

/** How far each focus mode leans from the reel's centreline toward the set's. */
export const CURVE_FOCUS_WEIGHT: Record<CurveFocus, number> = {
  reel: 0,
  'set-lean': 0.5,
  set: 1,
};

/**
 * Widest arc `amount: 1` maps to, in radians (~57 degrees of drum). Kept well
 * under `PI / 2` both so `sin` stays monotonic across the window and so
 * `cos(arc)` leaves a usable `depth` range - the fold-over limit is
 * `depth < cos(arc)`, which at 90 degrees would be zero.
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
 * The strip is wrapped on a cylinder whose radius is chosen so the visible
 * window covers `2 * arc` radians of it, and a camera sits far enough in front
 * that the window edge renders `depth` smaller than the middle. Every cell edge
 * is projected through that one model, so what comes out is a genuine
 * perspective quad rather than a rectangle that has been scaled.
 *
 * ## What this deliberately does NOT do
 *
 * It never writes a symbol's `position`. Every symbol view's main coordinate is
 * load-bearing: `Reel` reads it back out in `beginMotion`, `notifyLanded` and
 * `_replaceSymbol` to recover which slot a symbol is in, and a bent value taken
 * for a flat one would compound a little more on every round trip. The
 * projection is handed to the symbol as a view-LOCAL quad instead, so the
 * coordinate the engine wrote stays exactly where it put it.
 */
export class ReelCurve {
  private readonly _arc: number;
  /** Cylinder radius over camera distance. Drives the perspective divide. */
  private readonly _k: number;
  /** Perspective factor at the window edge. */
  private readonly _edgeScale: number;
  /** Divisor that pins the window edges. See the note in the constructor. */
  private readonly _norm: number;
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
    // Raw perspective pulls the ends of the strip INWARD, which would leave a
    // three-row window showing three shrunken rows plus a sliver of buffer at
    // each end. `visibleCells: 3` has to keep meaning three rows filling the
    // window, so normalize the projection to land exactly on the window edges.
    // Only a positive constant, so it cannot affect monotonicity - it rescales
    // the drum rather than changing its shape.
    this._norm = this._arc > 0 ? sinArc * this._edgeScale : 1;
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
   * (Re)bind the reel geometry the projection is defined against. Called on
   * build and again from `Reel.reshape()`, because a MultiWays reshape changes
   * both the cell size and how many cells the window holds.
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
   * Point the camera at a reel-local cross coordinate other than this reel's
   * own centreline. Cells then converge on THAT point as they recede, which is
   * what turns five separate drums into one wide one.
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

    // Project the rectangle the ART is really in, which for a trimmed atlas
    // frame is a good deal smaller than the cell. Stretching a small symbol
    // across the whole cell quad would both inflate it and hand it the cell's
    // keystone rather than the milder one its own position earns.
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
    // Everything converges on the camera's optical axis. By default that is
    // the reel's own centreline (a reel is exactly one cell wide), so a cell
    // narrows in place; aimed at the middle of the board instead, a receding
    // cell also LEANS toward it, and the reels read as one drum.
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

    // Clockwise from screen top-left. On a vertical reel the smaller main
    // coordinate is the TOP edge, so the near pair is (TL, TR). On a horizontal
    // one it is the LEFT edge, so the near pair is (TL, BL) instead - the art
    // stays upright either way, so the texture's top-left must keep landing on
    // the screen's top-left.
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
   * `ReelSet.getCellBounds()` and any overlay a game draws itself can follow
   * the curve instead of the flat grid behind it.
   */
  mapMain(main: number): number {
    return this._project(main).main;
  }

  /**
   * How much smaller the drum renders whatever sits at flat main coordinate
   * `main`. `1` at the middle of the window, falling to `1 / (1 + depth)` at
   * its edges. Public for the same reason as {@link ReelCurve.mapMain}.
   */
  scaleAt(main: number): number {
    return this._project(main).scale;
  }

  /**
   * Project one flat reel-local main coordinate: where it lands, and how much
   * the perspective divide shrinks whatever is there.
   *
   * Inside the window this is the real thing - a point wrapped on the cylinder
   * at arc length `t`, pushed through the perspective divide. Outside it (the
   * buffer cells) the projection continues as a straight line at the edge
   * slope, holding the edge's perspective factor, because carrying `sin` past
   * its peak would fold the buffer back on itself and march wrapping symbols
   * the wrong way.
   */
  private _project(main: number): { main: number; scale: number } {
    if (this.isFlat || this._halfExtent <= 0) return { main, scale: 1 };
    const h = this._halfExtent;
    const phi = (main - h) / this._radius;
    // Past the window the projection continues as a straight line at the edge
    // slope, holding the edge's perspective factor. Carrying `sin` beyond its
    // peak would fold the buffer back over itself and march wrapping symbols
    // the wrong way.
    if (phi > this._arc) {
      return { main: 2 * h + (main - 2 * h) * this._edgeSlope, scale: this._edgeScale };
    }
    if (phi < -this._arc) {
      return { main: main * this._edgeSlope, scale: this._edgeScale };
    }
    const scale = this._perspectiveAt(phi);
    return { main: h + (h * Math.sin(phi) * scale) / this._norm, scale };
  }

  /**
   * The perspective divide at arc angle `phi`. A point that has rotated `phi`
   * round the drum has receded `R * (1 - cos phi)` from the front surface, and
   * a camera makes it that much smaller.
   */
  private _perspectiveAt(phi: number): number {
    return 1 / (1 + this._k * (1 - Math.cos(phi)));
  }
}
