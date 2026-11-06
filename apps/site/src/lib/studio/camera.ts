import type { Application, Container } from 'pixi.js';

/**
 * Studio's view of the recipe: fit to the content until the user zooms or
 * pans, then leave it where they put it until they ask for the fit back.
 *
 * Auto-fit follows the content. A reel that grows on landing, or a debug
 * panel that appears, moves the bounds; once they have held still for a few
 * checks the view refits. Waiting for them to settle keeps a win animation
 * that scales symbols past the grid from pumping the zoom.
 */
export interface StudioCamera {
  /** Refit now if auto-fit is on (a canvas resize, the debug pane toggle). */
  refit(): void;
  /** Turn auto-fit back on and fit. */
  fit(): void;
  /** Zoom around the canvas centre; leaves auto-fit. */
  zoomBy(factor: number): void;
  destroy(): void;
}

export interface StudioCameraOptions {
  padding: number;
  /** Height kept free under the content (the recipe's tap cue). */
  bottomStrip: number;
  /** Called when auto-fit turns on or off. */
  onAutoChange(auto: boolean): void;
}

interface Box { x: number; y: number; w: number; h: number }

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;
/** CSS px a press moves before it is a pan and not a tap. */
const DRAG_THRESHOLD = 6;
/** Bounds are read every this many frames while auto-fit is on. */
const CHECK_EVERY = 6;
/** Equal readings in a row before the bounds count as settled. */
const SETTLED_AFTER = 3;

const same = (a: Box | null, b: Box | null): boolean =>
  !!a && !!b &&
  Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 &&
  Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;

export function attachCamera(app: Application, target: Container, opts: StudioCameraOptions): StudioCamera {
  const canvas = app.canvas;
  let auto = true;
  let fitted: Box | null = null;
  let last: Box | null = null;
  let steady = 0;
  let frame = 0;

  const setAuto = (next: boolean): void => {
    if (auto === next) return;
    auto = next;
    opts.onAutoChange(next);
  };

  const bounds = (): Box => {
    const b = target.getLocalBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };

  const fitTo = (b: Box): void => {
    if (!(b.w > 0) || !(b.h > 0)) return;
    const { padding, bottomStrip } = opts;
    const availW = Math.max(40, app.screen.width - padding * 2);
    const availH = Math.max(40, app.screen.height - bottomStrip - padding * 2);
    const scale = Math.min(availW / b.w, availH / b.h);
    target.scale.set(scale);
    target.x = (app.screen.width - b.w * scale) / 2 - b.x * scale;
    target.y = padding + (availH - b.h * scale) / 2 - b.y * scale;
    fitted = b;
  };

  const watch = (): void => {
    if (!auto || ++frame % CHECK_EVERY !== 0) return;
    const b = bounds();
    steady = same(b, last) ? steady + 1 : 0;
    last = b;
    if (steady >= SETTLED_AFTER && !same(b, fitted)) fitTo(b);
  };
  app.ticker.add(watch);

  const zoomAt = (px: number, py: number, factor: number): void => {
    const s = target.scale.x;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
    const k = next / s;
    target.x = px - (px - target.x) * k;
    target.y = py - (py - target.y) * k;
    target.scale.set(next);
    setAuto(false);
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    // A trackpad pinch arrives as a wheel with ctrlKey and small deltas.
    const rate = e.ctrlKey ? 0.01 : 0.0015;
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * rate));
  };

  // A drag pans. Pixi still sees the press, so a drag that ended on the
  // canvas would also be a tap and spin the reels: while the pan runs the
  // stage takes no events, and Pixi's own pointerup (a capture listener on
  // window, added before this one) finds nothing to tap.
  let press: { id: number; x: number; y: number; ox: number; oy: number } | null = null;
  let panning = false;
  let stageMode = app.stage.eventMode;

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: target.x, oy: target.y };
  };
  const onMove = (e: PointerEvent): void => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!panning) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      panning = true;
      stageMode = app.stage.eventMode;
      app.stage.eventMode = 'none';
      canvas.style.cursor = 'grabbing';
      setAuto(false);
    }
    target.x = press.ox + dx;
    target.y = press.oy + dy;
  };
  const onUp = (e: PointerEvent): void => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    if (!panning) return;
    panning = false;
    app.stage.eventMode = stageMode;
    canvas.style.cursor = '';
  };

  const touchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  fitTo(bounds());

  return {
    refit() {
      if (auto) fitTo(bounds());
    },
    fit() {
      setAuto(true);
      fitTo(bounds());
    },
    zoomBy(factor) {
      zoomAt(app.screen.width / 2, (app.screen.height - opts.bottomStrip) / 2, factor);
    },
    destroy() {
      app.ticker.remove(watch);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.style.touchAction = touchAction;
      canvas.style.cursor = '';
      if (panning) app.stage.eventMode = stageMode;
    },
  };
}
