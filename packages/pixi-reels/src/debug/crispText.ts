import { Matrix, type Renderer, type Text } from 'pixi.js';

/** Upper bound on the raster resolution, so a deep zoom cannot allocate a huge texture. */
const MAX_RESOLUTION = 8;

/**
 * Keep a debug label sharp at whatever scale it is drawn. Pixi rasterises a
 * `Text` once, at the renderer's resolution, so a label inside a container
 * scaled up two or three times (a host fitting the reels to its canvas, a
 * camera zoom) is a stretched bitmap next to the vector plates around it.
 * Before each render this re-rasterises the label when its on-screen scale
 * has moved to a new half step, so the cost is paid on a zoom, not per frame.
 */
export function crispText(text: Text): void {
  const m = new Matrix();
  text.onRender = (renderer: Renderer) => {
    // Walk the parents rather than read `worldTransform`, which the renderer
    // has not refreshed yet when `onRender` runs.
    text.getGlobalTransform(m, false);
    const onScreen = Math.hypot(m.a, m.b) * renderer.resolution;
    const target = Math.min(MAX_RESOLUTION, Math.max(1, Math.ceil(onScreen * 2) / 2));
    if (text.resolution !== target) text.resolution = target;
  };
}
