import type { Container } from 'pixi.js';

/**
 * Which screen axis a reel's strip travels along. `'vertical'` runs the strip
 * on Y with reels marched along X; `'horizontal'` runs the strip on X with
 * reels marched along Y. ReelSet-level: one shared orientation per set.
 */
export type Orientation = 'vertical' | 'horizontal';

/**
 * Which way along the travel axis symbols move. `'forward'` heads toward the
 * larger coordinate (down / right), `'reverse'` toward the smaller (up / left).
 * Per-reel, overridable per spin.
 */
export type Direction = 'forward' | 'reverse';

/**
 * Immutable projection between screen space and a reel's travel/cross axes.
 *
 * One per reel, built by the builder and injected into `ReelMotion`, `Reel`,
 * and every phase. It carries no per-frame allocation on the hot path -
 * `addMain` is one property lookup and one `+=`. See ADR 016 sections 3.1-3.2.
 *
 * The point is to keep direction ("which way is backwards for this reel") out
 * of the sign of a raw delta, and orientation ("which screen axis") out of a
 * hardcoded `.y`. Public geometry stays screen-space (see `toLocal`/`toScreen`),
 * so third-party `ReelSymbol` subclasses are unaffected.
 */
export interface ReelAxis {
  readonly orientation: Orientation;
  readonly direction: Direction;
  /** +1 for 'forward', -1 for 'reverse'. */
  readonly polarity: 1 | -1;
  /** Pixi / GSAP property key for the travel axis. */
  readonly mainProp: 'x' | 'y';
  /** Pixi / GSAP property key for the reel-marching axis. */
  readonly crossProp: 'x' | 'y';
  /** Which strip edge new symbols enter from: 'start' when polarity > 0. */
  readonly feedEdge: 'start' | 'end';

  getMain(view: Container): number;
  setMain(view: Container, v: number): void;
  addMain(view: Container, d: number): void;
  getCross(view: Container): number;
  setCross(view: Container, v: number): void;
  /** Screen-space (width, height) to (cross size, main size). */
  toLocal(width: number, height: number): { cross: number; main: number };
  /** (cross, main) to screen-space (x, y). */
  toScreen(cross: number, main: number): { x: number; y: number };
  /** A sibling axis with the same orientation and a new travel direction. */
  withDirection(d: Direction): ReelAxis;
}

class Axis implements ReelAxis {
  readonly polarity: 1 | -1;
  readonly mainProp: 'x' | 'y';
  readonly crossProp: 'x' | 'y';
  readonly feedEdge: 'start' | 'end';
  private readonly _vertical: boolean;

  constructor(
    readonly orientation: Orientation,
    readonly direction: Direction,
  ) {
    this._vertical = orientation === 'vertical';
    this.mainProp = this._vertical ? 'y' : 'x';
    this.crossProp = this._vertical ? 'x' : 'y';
    this.polarity = direction === 'forward' ? 1 : -1;
    this.feedEdge = this.polarity > 0 ? 'start' : 'end';
  }

  getMain(view: Container): number {
    return view[this.mainProp];
  }
  setMain(view: Container, v: number): void {
    view[this.mainProp] = v;
  }
  addMain(view: Container, d: number): void {
    view[this.mainProp] += d;
  }
  getCross(view: Container): number {
    return view[this.crossProp];
  }
  setCross(view: Container, v: number): void {
    view[this.crossProp] = v;
  }

  toLocal(width: number, height: number): { cross: number; main: number } {
    return this._vertical ? { cross: width, main: height } : { cross: height, main: width };
  }
  toScreen(cross: number, main: number): { x: number; y: number } {
    return this._vertical ? { x: cross, y: main } : { x: main, y: cross };
  }

  withDirection(d: Direction): ReelAxis {
    return d === this.direction ? this : new Axis(this.orientation, d);
  }
}

/** Build a `ReelAxis` for the given orientation and travel direction. */
export function reelAxis(orientation: Orientation, direction: Direction): ReelAxis {
  return new Axis(orientation, direction);
}

/** The v1 default: a vertical strip travelling downward. */
export const VERTICAL_FORWARD: ReelAxis = reelAxis('vertical', 'forward');
