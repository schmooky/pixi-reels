import type { CurveSpec } from './types';

/**
 * Standard cubic-bezier presets in CSS-style coords (cx1, cy1, cx2, cy2).
 * These match common easing curves used in motion design.
 */
const PRESETS: Record<Exclude<CurveSpec, 'linear' | 'stepped' | readonly number[] | number[]>, [number, number, number, number]> = {
  easeIn:    [0.42, 0.0, 1.0, 1.0],
  easeOut:   [0.0,  0.0, 0.58, 1.0],
  easeInOut: [0.42, 0.0, 0.58, 1.0],
};

/**
 * Convert a CurveSpec to the value Spine JSON expects on a key:
 *   - linear        → omit the field entirely (undefined here, caller drops it)
 *   - stepped       → 'stepped'
 *   - bezier preset → [c1x, c1y, c2x, c2y]
 *   - raw [4]       → as-is
 */
export function curveToSpine(curve: CurveSpec): undefined | 'stepped' | [number, number, number, number] {
  if (curve === 'linear') return undefined;
  if (curve === 'stepped') return 'stepped';
  if (Array.isArray(curve)) return curve;
  return PRESETS[curve];
}
