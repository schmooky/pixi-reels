import type { AnimationIR, BoneIR, CurveSpec, SlotIR } from './types';
import { curveToSpine } from './curves';

/**
 * Compile an AnimationIR to the JSON shape Spine 4.x expects under
 * skeleton.animations[name]. Each key is sorted by time. Linear curves
 * are emitted as omitted curve fields (Spine's default).
 *
 * Curve format note (Spine 4.x): Bezier control points are stored in
 * ABSOLUTE coords — `cx` in seconds, `cy` in the value's coordinate
 * space (not normalized 0..1). For a translate going 0 -> -1.5 over 1.2s
 * with easeInOut, the four numbers are
 *   [time1 + 0.42 * dur, value1 + 0 * dValue,
 *    time1 + 0.58 * dur, value1 + 1 * dValue]
 * not the segment-agnostic [0.42, 0, 0.58, 1]. Two-value timelines
 * (translate, scale, shear) take 8 numbers — 4 per component.
 */
export function compile(anim: AnimationIR): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // ── bones ───────────────────────────────────────────────────────
  if (anim.bones.size > 0) {
    const bones: Record<string, unknown> = {};
    for (const [name, ir] of anim.bones) {
      const boneOut = compileBone(ir);
      if (Object.keys(boneOut).length > 0) bones[name] = boneOut;
    }
    if (Object.keys(bones).length > 0) out.bones = bones;
  }

  // ── slots ───────────────────────────────────────────────────────
  if (anim.slots.size > 0) {
    const slots: Record<string, unknown> = {};
    for (const [name, ir] of anim.slots) {
      const slotOut = compileSlot(ir);
      if (Object.keys(slotOut).length > 0) slots[name] = slotOut;
    }
    if (Object.keys(slots).length > 0) out.slots = slots;
  }

  return out;
}

function compileBone(ir: BoneIR): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (ir.scale.length > 0) {
    const sorted = sortByTime(ir.scale);
    out.scale = sorted.map((k, i) => stripUndef({
      time: round(k.time),
      x: k.x,
      y: k.y,
      curve: nextCurve2(sorted, i, (s) => s.x, (s) => s.y),
    }));
  }
  if (ir.translate.length > 0) {
    const sorted = sortByTime(ir.translate);
    out.translate = sorted.map((k, i) => stripUndef({
      time: round(k.time),
      x: k.x,
      y: k.y,
      curve: nextCurve2(sorted, i, (s) => s.x, (s) => s.y),
    }));
  }
  if (ir.rotate.length > 0) {
    const sorted = sortByTime(ir.rotate);
    out.rotate = sorted.map((k, i) => stripUndef({
      time: round(k.time),
      angle: k.angle,
      curve: nextCurve1(sorted, i, (s) => s.angle),
    }));
  }

  return out;
}

function compileSlot(ir: SlotIR): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (ir.rgba.length > 0) {
    const sorted = sortByTime(ir.rgba);
    out.rgba = sorted.map((k, i) => stripUndef({
      time: round(k.time),
      color: k.color,
      // RGBA timelines are 4-value (r, g, b, a). Build one Bezier per
      // component using each component's own start/end value so a curve
      // that fades alpha doesn't distort the rgb channels alongside it.
      curve: nextCurveRgba(sorted, i),
    }));
  }
  if (ir.attachment.length > 0) {
    out.attachment = sortByTime(ir.attachment).map((k) => ({
      time: round(k.time),
      name: k.name,
    }));
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────
// Curve emission
// ─────────────────────────────────────────────────────────────────

/**
 * Resolve the Bezier control points for the segment leaving keys[i].
 * Returns null for linear (caller omits the field), the literal string
 * 'stepped', or the four normalized control points [cx1, cy1, cx2, cy2]
 * — caller scales them into absolute (time, value) space per component.
 */
function resolveCurve(c: CurveSpec): null | 'stepped' | [number, number, number, number] {
  const cs = curveToSpine(c);
  if (cs === undefined) return null;
  if (cs === 'stepped') return 'stepped';
  return cs;
}

/** Per-component Bezier in absolute coords. */
function bezierForSegment(
  cx1: number, cy1: number, cx2: number, cy2: number,
  time1: number, time2: number,
  value1: number, value2: number,
): [number, number, number, number] {
  const dt = time2 - time1;
  const dv = value2 - value1;
  return [
    round(time1 + cx1 * dt),
    round(value1 + cy1 * dv),
    round(time1 + cx2 * dt),
    round(value1 + cy2 * dv),
  ];
}

/** Curve out of keys[i] for a single-value timeline (rotate, alpha). */
function nextCurve1<T extends { time: number; curve: CurveSpec }>(
  keys: ReadonlyArray<T>, i: number, getV: (k: T) => number,
): undefined | 'stepped' | number[] {
  const k1 = keys[i];
  const k2 = keys[i + 1];
  if (!k2) return undefined;                     // last key — Spine ignores
  const c = resolveCurve(k1.curve);
  if (c === null) return undefined;              // linear default
  if (c === 'stepped') return 'stepped';
  return bezierForSegment(c[0], c[1], c[2], c[3], k1.time, k2.time, getV(k1), getV(k2));
}

/** Curve out of keys[i] for a two-value timeline (translate, scale). */
function nextCurve2<T extends { time: number; curve: CurveSpec }>(
  keys: ReadonlyArray<T>, i: number,
  getX: (k: T) => number, getY: (k: T) => number,
): undefined | 'stepped' | number[] {
  const k1 = keys[i];
  const k2 = keys[i + 1];
  if (!k2) return undefined;
  const c = resolveCurve(k1.curve);
  if (c === null) return undefined;
  if (c === 'stepped') return 'stepped';
  return [
    ...bezierForSegment(c[0], c[1], c[2], c[3], k1.time, k2.time, getX(k1), getX(k2)),
    ...bezierForSegment(c[0], c[1], c[2], c[3], k1.time, k2.time, getY(k1), getY(k2)),
  ];
}

/** Curve out of keys[i] for an RGBA slot timeline (4 components: r, g, b, a). */
function nextCurveRgba<T extends { time: number; curve: CurveSpec; color: string }>(
  keys: ReadonlyArray<T>, i: number,
): undefined | 'stepped' | number[] {
  const k1 = keys[i];
  const k2 = keys[i + 1];
  if (!k2) return undefined;
  const c = resolveCurve(k1.curve);
  if (c === null) return undefined;
  if (c === 'stepped') return 'stepped';
  const v1 = parseRgba(k1.color);
  const v2 = parseRgba(k2.color);
  return [
    ...bezierForSegment(c[0], c[1], c[2], c[3], k1.time, k2.time, v1[0], v2[0]),
    ...bezierForSegment(c[0], c[1], c[2], c[3], k1.time, k2.time, v1[1], v2[1]),
    ...bezierForSegment(c[0], c[1], c[2], c[3], k1.time, k2.time, v1[2], v2[2]),
    ...bezierForSegment(c[0], c[1], c[2], c[3], k1.time, k2.time, v1[3], v2[3]),
  ];
}

function parseRgba(hex: string): [number, number, number, number] {
  // 8-char hex 'rrggbbaa' -> [r, g, b, a] in 0..1
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const a = parseInt(hex.slice(6, 8), 16) / 255;
  return [r, g, b, a];
}

function sortByTime<T extends { time: number }>(keys: T[]): T[] {
  return [...keys].sort((a, b) => a.time - b.time);
}

function round(n: number): number {
  // Round to 6 decimals to keep JSON stable across platforms.
  return Math.round(n * 1e6) / 1e6;
}

function stripUndef<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}
