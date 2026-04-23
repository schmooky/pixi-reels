import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { CellBounds, Payline } from '../config/types.js';
import type { SymbolPosition } from '../events/ReelEvents.js';
import type { LineRenderer } from './LineRenderer.js';

export interface GraphicsLineRendererOptions {
  /**
   * Stroke colour. Number, or a callback receiving the payline (for per-line
   * colouring). Defaults to a built-in 6-colour cycle keyed by `lineId`.
   */
  color?: number | ((payline: Payline) => number);
  /** Stroke width in pixels. Default 4. */
  width?: number;
  /** Stroke alpha. Default 1. */
  alpha?: number;
  /** Draw-on animation duration (ms). 0 for instant. Default 220. */
  drawOnMs?: number;
  /** Fade-out duration (ms) on clear. 0 for instant. Default 160. */
  fadeOutMs?: number;
  /**
   * zIndex applied to each drawn line in the parent layer. Constant or a
   * per-payline callback. Default: `payline.lineId` (so line 1 sits above
   * line 0 — arbitrary but stable).
   */
  zIndex?: number | ((payline: Payline) => number);
}

const DEFAULT_COLOUR_CYCLE = [
  0xff3366, 0x33d17a, 0x3aa9ff, 0xffb400, 0xa667ff, 0xff6b35,
];

/**
 * Built-in {@link LineRenderer} that draws a polyline through cell centres
 * using PixiJS `Graphics`. Zero external assets.
 *
 * Good default for prototypes, debug overlays, and games without a line
 * sprite sheet. For premium looks (per-line Spine, particles, glow),
 * implement a custom {@link LineRenderer}.
 */
export class GraphicsLineRenderer implements LineRenderer {
  private _options: GraphicsLineRendererOptions;
  private _current: Graphics | null = null;
  private _tween: gsap.core.Tween | null = null;
  private _isDestroyed = false;

  constructor(options: GraphicsLineRendererOptions = {}) {
    this._options = options;
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  async render(
    payline: Payline,
    cells: readonly SymbolPosition[],
    getCellBounds: (col: number, row: number) => CellBounds,
    parent: Container,
  ): Promise<void> {
    this.clear();
    if (cells.length < 2) return;

    const color = this._resolveColor(payline);
    const width = this._options.width ?? 4;
    const alpha = this._options.alpha ?? 1;
    const drawOnMs = this._options.drawOnMs ?? 220;
    const zIndex = this._resolveZIndex(payline);

    const points = cells.map((c) => {
      const b = getCellBounds(c.reelIndex, c.rowIndex);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });

    const gfx = new Graphics();
    gfx.zIndex = zIndex;
    parent.addChild(gfx);
    this._current = gfx;

    if (drawOnMs <= 0) {
      this._drawPolyline(gfx, points, color, width, alpha);
      return;
    }

    // Per-segment length so draw-on speed is uniform across a zig-zag line.
    const segLens: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segLens.push(l);
      total += l;
    }

    const state = { t: 0 };
    await new Promise<void>((resolve) => {
      this._tween = gsap.to(state, {
        t: 1,
        duration: drawOnMs / 1000,
        ease: 'power1.out',
        onUpdate: () => {
          const g = this._current;
          if (!g) return;
          const drawn = total * state.t;
          g.clear();
          g.moveTo(points[0].x, points[0].y);
          let remaining = drawn;
          for (let i = 0; i < segLens.length; i++) {
            const l = segLens[i];
            if (remaining >= l) {
              g.lineTo(points[i + 1].x, points[i + 1].y);
              remaining -= l;
            } else {
              const r = l > 0 ? remaining / l : 0;
              const x = points[i].x + (points[i + 1].x - points[i].x) * r;
              const y = points[i].y + (points[i + 1].y - points[i].y) * r;
              g.lineTo(x, y);
              break;
            }
          }
          g.stroke({ color, width, alpha });
        },
        onComplete: () => {
          this._tween = null;
          resolve();
        },
      });
    });
  }

  clear(): void {
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
    const gfx = this._current;
    if (!gfx) return;
    this._current = null;

    const fadeOutMs = this._options.fadeOutMs ?? 160;
    if (fadeOutMs <= 0) {
      gfx.destroy();
      return;
    }
    gsap.to(gfx, {
      alpha: 0,
      duration: fadeOutMs / 1000,
      ease: 'power1.in',
      onComplete: () => gfx.destroy(),
    });
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    if (this._tween) {
      this._tween.kill();
      this._tween = null;
    }
    if (this._current) {
      this._current.destroy();
      this._current = null;
    }
  }

  private _drawPolyline(
    gfx: Graphics,
    points: { x: number; y: number }[],
    color: number,
    width: number,
    alpha: number,
  ): void {
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    gfx.stroke({ color, width, alpha });
  }

  private _resolveColor(payline: Payline): number {
    const c = this._options.color;
    if (typeof c === 'function') return c(payline);
    if (typeof c === 'number') return c;
    return DEFAULT_COLOUR_CYCLE[payline.lineId % DEFAULT_COLOUR_CYCLE.length];
  }

  private _resolveZIndex(payline: Payline): number {
    const z = this._options.zIndex;
    if (typeof z === 'function') return z(payline);
    if (typeof z === 'number') return z;
    return payline.lineId;
  }
}
