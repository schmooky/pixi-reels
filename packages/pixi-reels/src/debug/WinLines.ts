import { Container } from 'pixi.js';
import { SilkGraphics, type PolylineOptions } from 'pixi-silk';
import type { SymbolPosition } from '../config/types.js';
import type { ReelSet } from '../core/ReelSet.js';
import type { Disposable } from '../utils/Disposable.js';

/** How one line is drawn. Every field is optional. */
export interface WinLineStyle {
  /** Line color. Default: the next color of the palette. */
  color?: number;
  /** Stroke width, px. Default 5. */
  width?: number;
  /** Opacity, 0..1. Default 1. */
  alpha?: number;
  /** Blur of a soft glow drawn under the stroke, px. `0` for none. Default 8. */
  glow?: number;
  /** Radius of the dot on every cell the line joins, px. `0` for none. Default `width * 1.3`. */
  dot?: number;
  /** Round a payline's corners through the cell centres instead of meeting at points. Default false. */
  smooth?: boolean;
}

/** Options for a {@link WinLines} layer. */
export interface WinLinesOptions extends WinLineStyle {
  /** Colors handed out in turn to lines drawn without a `color`. */
  palette?: readonly number[];
}

/** Bright, distinct, readable on a dark board and on light card faces. */
const PALETTE = [0xffc94a, 0x4ad8ff, 0xff5c8a, 0x8cff6b, 0xb88cff, 0xff9f43];

/**
 * Win lines drawn over a reel set with pixi-silk: a payline through one cell
 * per reel, or a payway as every winning cell joined to every winning cell on
 * the next reel.
 *
 * The library never computes wins (ADR 007); this only draws the cells it is
 * handed, at their `getCellBounds()` centres. It lives in the reel set's own
 * coordinates, so it pans and scales with the set, and it reads the cells at
 * draw time: a board that grew since (`expand()`) is drawn where it is now.
 * Each call adds one `SilkGraphics` and returns it, so a line can be faded or
 * pulsed on its own; `clear()` removes them all.
 *
 * ```ts
 * import { WinLines } from 'pixi-reels/debug';
 *
 * const lines = new WinLines(reelSet);
 * lines.line([{ reelIndex: 0, cellIndex: 1 }, { reelIndex: 1, cellIndex: 0 }, ...]); // a payline
 * lines.ways(win.perReel);        // a payway: [[0, 2], [1], [0, 1, 2]] = cells per reel
 * reelSet.events.on('spin:start', () => lines.clear());
 * ```
 */
export class WinLines extends Container implements Disposable {
  private _style: Required<Omit<WinLineStyle, 'color' | 'dot'>> & Pick<WinLineStyle, 'color' | 'dot'>;
  private _palette: readonly number[];
  private _next = 0;

  constructor(
    private _reelSet: ReelSet,
    options: WinLinesOptions = {},
  ) {
    super();
    this.label = 'pixi-reels:winLines';
    this.eventMode = 'none';
    this._palette = options.palette?.length ? options.palette : PALETTE;
    this._style = {
      color: options.color,
      width: options.width ?? 5,
      alpha: options.alpha ?? 1,
      glow: options.glow ?? 8,
      dot: options.dot,
      smooth: options.smooth ?? false,
    };
    // Added after the viewport, so it draws over the board and its spotlight.
    _reelSet.addChild(this);
  }

  /**
   * A payline: one polyline through the centres of `cells`, in the order
   * given (normally one cell per reel, left to right).
   */
  line(cells: readonly SymbolPosition[], style: WinLineStyle = {}): SilkGraphics {
    const s = this._resolve(style);
    const points = cells.map((c) => this._centre(c.reelIndex, c.cellIndex));
    const g = this._add();
    if (points.length >= 2) {
      const flat = points.flatMap((p) => [p.x, p.y]);
      const shape: PolylineOptions = { smooth: s.smooth ? 'catmull' : false };
      if (s.glow > 0) {
        g.polyline(flat, shape).stroke({ color: s.color, width: s.width * 2.4, alpha: s.alpha * 0.45, blur: s.glow, cap: 'round' });
      }
      g.polyline(flat, shape).stroke({ color: s.color, width: s.width, alpha: s.alpha, cap: 'round' });
    }
    this._dots(g, points, s);
    return g;
  }

  /**
   * A payway: `perReel[i]` holds the winning cell indices on reel
   * `fromReel + i`, and every one of them is joined to every one on the next
   * reel. That lattice is the whole win at once: its paths ARE the ways, so
   * a 3 x 2 x 3 win draws 6 + 6 segments for its 18 ways, and a win of
   * millions of ways stays a few dozen segments.
   */
  ways(perReel: readonly (readonly number[])[], style: WinLineStyle & { fromReel?: number } = {}): SilkGraphics {
    const s = this._resolve(style);
    const from = style.fromReel ?? 0;
    const columns = perReel.map((cells, i) => cells.map((cell) => this._centre(from + i, cell)));
    const g = this._add();
    for (let r = 0; r + 1 < columns.length; r++) {
      for (const a of columns[r]) {
        for (const b of columns[r + 1]) {
          if (s.glow > 0) {
            g.line(a.x, a.y, b.x, b.y).stroke({
              color: s.color,
              width: s.width * 2.4,
              alpha: s.alpha * 0.35,
              blur: s.glow,
              cap: 'round',
            });
          }
          g.line(a.x, a.y, b.x, b.y).stroke({ color: s.color, width: s.width, alpha: s.alpha, cap: 'round' });
        }
      }
    }
    this._dots(g, columns.flat(), s);
    return g;
  }

  /** Remove every line drawn so far. The palette starts over. */
  clear(): this {
    for (const child of this.removeChildren()) child.destroy();
    this._next = 0;
    return this;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Destroy every line with it. Calling it again does nothing. */
  override destroy(): void {
    if (this.destroyed) return;
    this.clear();
    super.destroy({ children: true });
  }

  private _add(): SilkGraphics {
    if (this.destroyed) {
      // A line drawn now would go on a detached container nothing frees.
      throw new Error('WinLines: line() / ways() called after destroy(). Make a new WinLines for the next win.');
    }
    const g = new SilkGraphics({ label: 'pixi-reels:winLine' });
    this.addChild(g);
    return g;
  }

  private _resolve(style: WinLineStyle): Required<WinLineStyle> {
    const color = style.color ?? this._style.color ?? this._palette[this._next++ % this._palette.length];
    const width = style.width ?? this._style.width;
    return {
      color,
      width,
      alpha: style.alpha ?? this._style.alpha,
      glow: style.glow ?? this._style.glow,
      dot: style.dot ?? this._style.dot ?? width * 1.3,
      smooth: style.smooth ?? this._style.smooth,
    };
  }

  private _dots(g: SilkGraphics, points: readonly { x: number; y: number }[], s: Required<WinLineStyle>): void {
    if (s.dot <= 0) return;
    for (const p of points) {
      g.circle(p.x, p.y, s.dot).fill({ color: s.color, alpha: s.alpha }).stroke({
        color: 0x000000,
        alpha: 0.35 * s.alpha,
        width: 1.5,
        alignment: 'outside',
      });
    }
  }

  private _centre(reel: number, cell: number): { x: number; y: number } {
    const b = this._reelSet.getCellBounds(reel, cell);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
}
