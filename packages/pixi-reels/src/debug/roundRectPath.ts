import type { SilkGraphics } from 'pixi-silk';

/**
 * Add a rounded rectangle to `g` as one closed PATH instead of a shape, and
 * return `g` so the stroke chains on.
 *
 * pixi-silk 0.1 dashes paths and ellipses, but strokes `rect` / `roundRect`
 * solid whatever `dash` says. Stroke what this adds and the dashes come out,
 * running continuously round the corners:
 *
 * ```ts
 * roundRectPath(g, x, y, w, h, 4).stroke({ width: 1.5, color: 0xfef08a, dash: [7, 5] });
 * ```
 *
 * The corners are quadratic curves, which sit within a fraction of a pixel of
 * a circular arc at the radii a debug outline uses. Paths stroke centred on
 * the line, so inset by half the stroke width to keep it inside a box.
 */
export function roundRectPath(
  g: SilkGraphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0,
): SilkGraphics {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = x + width;
  const bottom = y + height;
  return g
    .moveTo(x + r, y)
    .lineTo(right - r, y)
    .quadraticCurveTo(right, y, right, y + r)
    .lineTo(right, bottom - r)
    .quadraticCurveTo(right, bottom, right - r, bottom)
    .lineTo(x + r, bottom)
    .quadraticCurveTo(x, bottom, x, bottom - r)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y)
    .closePath();
}
