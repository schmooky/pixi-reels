import type { Container } from 'pixi.js';
import { gsap } from 'gsap';

/**
 * Studio motion for static art: a piece of flat art on a two-container
 * rig (`move` for where it is, `body` for its shape) and a handful of
 * primitives written in frames at 60 fps, the way the animation playbook
 * states them. A symbol lands with `impact`, wins with `wowL`, a title
 * slams in with `slam`; the same table drives a sticker on a reel, a card
 * on a paytable and a word over the board.
 *
 * Every number here is the playbook's. Change the primitives, not the
 * callers.
 */

/** The frame counts a beat is made of, at 60 fps. */
export const FRAMES = { tick: 5, quick: 8, snappy: 13, base: 21, settle: 34, slow: 55, beat: 89 } as const;
export type FrameName = keyof typeof FRAMES;
const FPS = 60;

export const frames = (f: FrameName | number): number => (typeof f === 'number' ? f : FRAMES[f]);
/** A frame count as seconds, for a tween duration. */
export const seconds = (f: FrameName | number): number => frames(f) / FPS;

function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t;
  const Y = (t: number) => ((ay * t + by) * t + cy) * t;
  const DX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x;
      const d = DX(t);
      if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    if (Math.abs(X(t) - x) > 1e-4) {
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        if (X(t) < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return Y(t);
  };
}

/** The wobble settle: an overshoot that rings down in four glides. */
const WOBBLE: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.173, 1.275], [0.373, 0.931], [0.574, 1.017], [0.773, 0.996], [1, 1]];
const glide = bezier(0.364, 0, 0.636, 1);

/** The playbook's eases, as functions GSAP takes as `ease`. */
export const EASE = {
  out: bezier(0.333, 1, 0.667, 1),
  in: bezier(0.333, 0, 0.667, 0),
  glide,
  pop: bezier(0.333, 1.6, 0.667, 1),
  linear: (t: number) => t,
  wobble: (t: number): number => {
    for (let i = 1; i < WOBBLE.length; i++) {
      const [t1, v1] = WOBBLE[i]!;
      if (t <= t1) {
        const [t0, v0] = WOBBLE[i - 1]!;
        return v0 + (v1 - v0) * glide((t - t0) / (t1 - t0));
      }
    }
    return 1;
  },
} as const;
export type EaseName = keyof typeof EASE;

/** Where a piece is: offsets in cells, degrees, and the shape of its body. */
export interface MotionState {
  x: number;
  y: number;
  angle: number;
  alpha: number;
  scale: number;
  sx: number;
  sy: number;
}
export const REST: Readonly<MotionState> = { x: 0, y: 0, angle: 0, alpha: 1, scale: 1, sx: 1, sy: 1 };

export interface MotionStep {
  /** How long, in frames or a named count. */
  f: FrameName | number;
  e: EaseName;
  to: Partial<MotionState>;
  /** Tweens that start with this step and run alongside it. */
  with?: ReadonlyArray<{ f: FrameName | number; e: EaseName; to: Partial<MotionState> }>;
  /** A beat the caller may answer: `impact`, `pop`. Fires when the step starts. */
  call?: 'impact' | 'pop';
}

export interface MotionPrimitive {
  /** The point the body scales and turns about, as fractions of the cell. Default the centre. */
  origin?: { x: number; y: number };
  /** The state the primitive starts from, over what the rig is at. */
  from?: Partial<MotionState>;
  steps: ReadonlyArray<MotionStep>;
}

const BOTTOM = { x: 0.5, y: 0.92 };

/** The primitives, in the playbook's words. */
export const MOTION = {
  /** Drop in from above, hit, squash, settle. For a piece that enters on its own. */
  land: {
    origin: BOTTOM,
    from: { y: -1.6, sx: 0.9, sy: 1.12, alpha: 1 },
    steps: [
      { f: 'snappy', e: 'in', to: { y: 0 } },
      { f: 'tick', e: 'out', to: { sx: 1.2, sy: 0.8 }, call: 'impact' },
      { f: 'tick', e: 'out', to: { sx: 0.94, sy: 1.08 } },
      { f: 'settle', e: 'wobble', to: { sx: 1, sy: 1 } },
    ],
  },
  /** The hit alone: the squash a reel symbol plays as the reel lands, since the reel brought it there. */
  impact: {
    origin: BOTTOM,
    steps: [
      { f: 'tick', e: 'out', to: { sx: 1.2, sy: 0.8 }, call: 'impact' },
      { f: 'tick', e: 'out', to: { sx: 0.94, sy: 1.08 } },
      { f: 'settle', e: 'wobble', to: { sx: 1, sy: 1 } },
    ],
  },
  popIn: {
    from: { scale: 0, alpha: 1 },
    steps: [
      { f: 'quick', e: 'out', to: { scale: 1.15 } },
      { f: 'snappy', e: 'glide', to: { scale: 1.17 } },
      { f: 'settle', e: 'wobble', to: { scale: 1 } },
    ],
  },
  appear: {
    from: { scale: 0.6, alpha: 0 },
    steps: [{ f: 'base', e: 'pop', to: { scale: 1 }, with: [{ f: 'quick', e: 'out', to: { alpha: 1 } }] }],
  },
  slam: {
    from: { scale: 2.2, alpha: 0, angle: -8 },
    steps: [
      { f: 'quick', e: 'in', to: { scale: 1 }, with: [{ f: 'tick', e: 'out', to: { alpha: 1 } }] },
      { f: 'tick', e: 'out', to: { scale: 0.92 }, call: 'impact' },
      { f: 'settle', e: 'wobble', to: { scale: 1, angle: 0 } },
    ],
  },
  exit: {
    steps: [
      { f: 'tick', e: 'out', to: { scale: 1.06 } },
      { f: 'snappy', e: 'in', to: { scale: 0.5, alpha: 0 } },
    ],
  },
  wowS: {
    steps: [
      { f: 'quick', e: 'out', to: { scale: 1.08 } },
      { f: 'quick', e: 'glide', to: { scale: 1.09 } },
      { f: 'base', e: 'pop', to: { scale: 1 } },
    ],
  },
  wowM: {
    steps: [
      { f: 'tick', e: 'glide', to: { scale: 0.95 } },
      { f: 'quick', e: 'out', to: { scale: 1.15 }, call: 'pop' },
      { f: 'snappy', e: 'glide', to: { scale: 1.165 } },
      { f: 'settle', e: 'wobble', to: { scale: 1 } },
    ],
  },
  wowL: {
    steps: [
      { f: 'quick', e: 'glide', to: { scale: 0.9, angle: -3 } },
      { f: 'snappy', e: 'out', to: { scale: 1.25, angle: 4 }, call: 'pop' },
      { f: 'base', e: 'glide', to: { scale: 1.27, angle: 4.5 } },
      { f: 'slow', e: 'wobble', to: { scale: 1, angle: 0 } },
    ],
  },
} as const satisfies Record<string, MotionPrimitive>;
export type MotionName = keyof typeof MOTION;

/**
 * A piece on its rig. `move` sits at `at` (the centre of its cell); `body`
 * is its child and carries the shape. Put the art under `body`, centred on
 * (0, 0). `cell` is what the state's cell units mean.
 */
export interface MotionRig {
  move: Container;
  body: Container;
  cell: { width: number; height: number };
  /** Where `move` rests; the state's x and y are offsets from here, in cells. */
  at: { x: number; y: number };
}

export interface MotionHandle {
  /** Resolves when the primitive ends; a kill resolves it too. */
  finished: Promise<void>;
  kill(): void;
}

const DEG = Math.PI / 180;
const current = new WeakMap<Container, { state: MotionState; tl: gsap.core.Timeline | null }>();

function apply(rig: MotionRig, s: MotionState, origin: { x: number; y: number }): void {
  const { width, height } = rig.cell;
  const ox = (origin.x - 0.5) * width;
  const oy = (origin.y - 0.5) * height;
  rig.move.position.set(rig.at.x + s.x * width, rig.at.y + s.y * height);
  rig.move.rotation = s.angle * DEG;
  rig.move.alpha = s.alpha;
  rig.body.pivot.set(ox, oy);
  rig.body.position.set(ox, oy);
  rig.body.scale.set(s.scale * s.sx, s.scale * s.sy);
}

/**
 * Play a primitive on a rig. A new primitive starts from wherever the rig
 * is now, so a wow that interrupts a settle picks up mid-wobble rather than
 * snapping to rest first. `on` gets the beats the primitive calls out.
 */
export function playMotion(
  rig: MotionRig,
  name: MotionName,
  on: Partial<Record<'impact' | 'pop', () => void>> = {},
): MotionHandle {
  const prim: MotionPrimitive = MOTION[name];
  const entry = current.get(rig.move) ?? { state: { ...REST }, tl: null };
  entry.tl?.kill();
  const state: MotionState = { ...entry.state, ...(prim.from ?? {}) };
  entry.state = state;
  current.set(rig.move, entry);
  const origin = prim.origin ?? { x: 0.5, y: 0.5 };
  apply(rig, state, origin);

  let resolve: () => void = () => {};
  const finished = new Promise<void>((r) => { resolve = r; });
  const tl = gsap.timeline({
    onUpdate: () => apply(rig, state, origin),
    onComplete: () => { entry.tl = null; resolve(); },
  });
  let at = 0;
  for (const step of prim.steps) {
    const d = seconds(step.f);
    tl.to(state, { ...step.to, duration: d, ease: EASE[step.e] }, at);
    for (const w of step.with ?? []) tl.to(state, { ...w.to, duration: seconds(w.f), ease: EASE[w.e] }, at);
    if (step.call) {
      const beat = on[step.call];
      if (beat) tl.call(beat, undefined, at);
    }
    at += d;
  }
  entry.tl = tl;
  return {
    finished,
    kill() {
      if (entry.tl === tl) {
        tl.kill();
        entry.tl = null;
        resolve();
      }
    },
  };
}

/** Stop whatever is playing and put the rig back at rest. */
export function resetMotion(rig: MotionRig): void {
  const entry = current.get(rig.move);
  entry?.tl?.kill();
  current.set(rig.move, { state: { ...REST }, tl: null });
  apply(rig, REST, { x: 0.5, y: 0.5 });
}
