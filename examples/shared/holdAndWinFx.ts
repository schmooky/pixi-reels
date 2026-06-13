import type { Container } from 'pixi.js';
import { gsap } from 'gsap';
// Type-only on purpose: examples/shared has no own package.json, so the bare
// spine-pixi specifier doesn't resolve from here at runtime (it's a site/lib
// dependency). Types are erased; the instances arrive from the caller.
import type { Spine, TrackEntry } from '@esotericsoftware/spine-pixi-v8';
import { SpineReelSymbol, type SpineReelSymbolOptions } from 'pixi-reels/spine';

/**
 * Presentation kit for the Hold & Win demo recipes. Everything here is
 * game-layer choreography on top of `HoldAndWinBuilder`'s events and
 * geometry: wave ordering, curved coin flights, and the settle mechanics
 * for the demo's coin skeleton.
 *
 * The settle helpers are specific to the demo's converted skeleton (slot
 * `jp_coin_top`, reveal anims ending on the money face) - the PATTERNS
 * (freeze-at-end, settle-and-refit) port to any skeleton.
 */

// ─────────────────────────────────────────────────────────────────────────
// Wave ordering - "launch stuff on the coins" in a chosen pattern.

export interface HwWaveCell {
  cell: { col: number; row: number };
}

export type WaveMode =
  | 'all'
  | 'sequence'
  | 'by-row'
  | 'by-col'
  | { chunk: number }
  | ((item: never, index: number) => number);

/**
 * Group coins/cells into waves for staggered effects.
 *
 * - `'all'` - one wave, everything together
 * - `'sequence'` - one wave per coin, reading order
 * - `'by-row'` / `'by-col'` - one wave per row / column
 * - `{ chunk: n }` - reading order in chunks of n (indices 0-4, 5-9, ...)
 * - `(item, index) => waveIndex` - custom assignment
 *
 * Items inside each wave keep reading order (top-left first).
 */
export function coinWaves<T extends HwWaveCell>(items: T[], mode: WaveMode): T[][] {
  const ordered = [...items].sort(
    (a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col,
  );
  if (mode === 'all') return ordered.length ? [ordered] : [];
  if (mode === 'sequence') return ordered.map((c) => [c]);

  const byKey = new Map<number, T[]>();
  const assign = (key: number, item: T): void => {
    const wave = byKey.get(key) ?? [];
    wave.push(item);
    byKey.set(key, wave);
  };
  if (mode === 'by-row') ordered.forEach((c) => assign(c.cell.row, c));
  else if (mode === 'by-col') ordered.forEach((c) => assign(c.cell.col, c));
  else if (typeof mode === 'function') {
    ordered.forEach((c, i) => assign((mode as (item: T, index: number) => number)(c as never, i), c));
  } else {
    const size = Math.max(1, mode.chunk);
    ordered.forEach((c, i) => assign(Math.floor(i / size), c));
  }
  return [...byKey.entries()].sort((a, b) => a[0] - b[0]).map(([, wave]) => wave);
}

// ─────────────────────────────────────────────────────────────────────────
// Curved flights - quadratic bezier, no MotionPath plugin needed.

export interface Point {
  x: number;
  y: number;
}

export interface BezierFlyOptions {
  /** Seconds. Default 0.55. */
  duration?: number;
  /** GSAP ease. Default 'power1.inOut'. */
  ease?: string;
  /** Seconds before the flight starts. Default 0. */
  delay?: number;
  /**
   * Where the arc bulges. `'up'` arcs over the top (classic coin toss),
   * `'down'` under, `'in'` bends toward `around`, `'out'` away from it.
   * Ignored when `control` is given.
   */
  lean?: 'up' | 'down' | 'in' | 'out';
  /** Reference point for `'in'` / `'out'`. Default: midpoint of the scene is unknowable here, so pass one. */
  around?: Point;
  /** 0 = straight line, 0.5 = pronounced arc. Default 0.35. */
  curvature?: number;
  /** Explicit bezier control point - full custom trajectory. */
  control?: Point;
  /** Scale multiplier at arrival (e.g. 0.4 to shrink into a meter). */
  arriveScale?: number;
}

/**
 * Fly a display object from A to B along a quadratic bezier. Returns a
 * promise that resolves on arrival. Pass `control` for a fully custom
 * trajectory (e.g. computed per coin index toward a feature meter).
 */
export function bezierFly(
  obj: Container,
  from: Point,
  to: Point,
  opts: BezierFlyOptions = {},
): Promise<void> {
  const duration = opts.duration ?? 0.55;
  const curvature = opts.curvature ?? 0.35;
  const lean = opts.lean ?? 'up';

  let control = opts.control;
  if (!control) {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    if (lean === 'up' || lean === 'down') {
      // perpendicular to the path, flipped to point up (or down)
      let px = -dy / dist;
      let py = dx / dist;
      if ((lean === 'up' && py > 0) || (lean === 'down' && py < 0)) {
        px = -px;
        py = -py;
      }
      control = { x: mid.x + px * dist * curvature, y: mid.y + py * dist * curvature };
    } else {
      const around = opts.around ?? to;
      const ax = around.x - mid.x;
      const ay = around.y - mid.y;
      const sign = lean === 'in' ? 1 : -1;
      control = { x: mid.x + ax * sign * curvature * 2, y: mid.y + ay * sign * curvature * 2 };
    }
  }
  const c = control;

  obj.position.set(from.x, from.y);
  const baseScaleX = obj.scale.x;
  const baseScaleY = obj.scale.y;
  const arriveScale = opts.arriveScale ?? 1;

  return new Promise((resolve) => {
    const progress = { t: 0 };
    gsap.to(progress, {
      t: 1,
      duration,
      delay: opts.delay ?? 0,
      ease: opts.ease ?? 'power1.inOut',
      onUpdate: () => {
        if (obj.destroyed) return; // cleanup may tear the target down mid-flight
        const t = progress.t;
        const u = 1 - t;
        obj.x = u * u * from.x + 2 * u * t * c.x + t * t * to.x;
        obj.y = u * u * from.y + 2 * u * t * c.y + t * t * to.y;
        if (arriveScale !== 1) {
          const s = 1 + (arriveScale - 1) * t;
          obj.scale.set(baseScaleX * s, baseScaleY * s);
        }
      },
      onComplete: () => resolve(),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Coin settle mechanics for the demo skeleton.

/**
 * Freeze a spine on an animation's final frame. A completed non-looping
 * entry is cleared back to the setup pose (degenerate on this skeleton),
 * so park the track just before the end with `timeScale 0` - it never
 * completes, never clears.
 */
export function freezeAtEnd(spine: Spine, animName: string): TrackEntry {
  const entry = spine.state.setAnimation(0, animName, false);
  entry.trackTime = Math.max(0, entry.animation!.duration - 0.0001);
  entry.timeScale = 0;
  return entry;
}

/**
 * Settle a coin on the money face (the reveal's final frame) at `size`
 * pixels. The final frame keys the coin bone far down (the source game
 * re-scaled it externally), so re-fit the spine from the bone's world
 * scale. World transforms are computed explicitly: on a freshly created
 * spine they haven't run yet, and reading scale before the first update
 * returns garbage (the "gigantic first coin" failure mode).
 */
export function settleMoneyFace(spine: Spine, size: number, animName = 'mini'): TrackEntry {
  const entry = freezeAtEnd(spine, animName);
  try {
    spine.state.apply(spine.skeleton);
    spine.skeleton.updateWorldTransform(2 as never); // Physics.update
    const bone = spine.skeleton.findSlot('jp_coin_top')!.bone;
    let ws = Math.abs(bone.getWorldScaleX ? bone.getWorldScaleX() : bone.scaleX);
    if (!Number.isFinite(ws) || ws < 0.01 || ws > 100) ws = 1;
    spine.scale.set(size / (250 * ws)); // jp_coin_top attachment is 242x250
  } catch {
    // keep the registration scale - a wrong-sized coin beats a crash
  }
  return entry;
}

export interface GoldCoinSymbolOptions extends SpineReelSymbolOptions {
  /** Pixel size the settled money face should fill (usually cell - padding). */
  settleSize: number;
  /**
   * Animation whose final frame is the rest pose. Default `'coin'` - the
   * plain gold coin without the jackpot ring (the tier reveals end on the
   * ringed variant; pass `'mini'` to settle on that instead).
   */
  settleAnimation?: string;
}

/**
 * The plain value coin: the demo skeleton posed on its money face, with
 * the lock beat played by the skeleton's own one-turn `coin` spin (no
 * tween fakery). Lands settled; `playWin` flourishes and re-settles.
 */
export class GoldCoinSymbol extends SpineReelSymbol {
  private _settleSize: number;
  private _settleAnim: string;

  constructor(options: GoldCoinSymbolOptions) {
    super(options);
    this._settleSize = options.settleSize;
    this._settleAnim = options.settleAnimation ?? 'coin';
  }

  protected override onActivate(symbolId: string): void {
    super.onActivate(symbolId);
    if (this.spine) settleMoneyFace(this.spine, this._settleSize, this._settleAnim);
  }

  override async playWin(): Promise<void> {
    const spine = this.spine;
    if (!spine || !spine.skeleton.data.findAnimation('coin')) return;
    await new Promise<void>((resolve) => {
      const flourish = spine.state.setAnimation(0, 'coin', false);
      flourish.listener = {
        complete: () => {
          settleMoneyFace(spine, this._settleSize, this._settleAnim);
          resolve();
        },
      };
    });
  }
}
