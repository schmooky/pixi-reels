import type { Ticker } from 'pixi.js';
import { getGsap } from './gsapRef.js';

/**
 * Drive GSAP from a PixiJS ticker instead of its own requestAnimationFrame
 * loop, and return a disposer that restores GSAP's default loop.
 *
 * **Why this matters:** GSAP's default ticker runs on `requestAnimationFrame`,
 * which browsers throttle — and often freeze entirely — in hidden tabs and many
 * iframes. Casino lobbies and iframed clients are routinely backgrounded. When
 * that happens GSAP stalls while the PixiJS ticker keeps running, so every
 * engine animation (spin easing, the landing bounce, spotlight pulses) freezes
 * mid-flight. Pinning GSAP to the same ticker keeps animation and rendering in
 * lockstep everywhere, foreground or background.
 *
 * This is the one line every integration has to remember
 * (`gsap.ticker.remove(gsap.updateRoot); ticker.add(...)`); calling this
 * function instead removes that footgun. The bound GSAP instance is the one the
 * engine actually uses (see {@link ReelSetBuilder.gsap}), so it stays correct
 * even under the dual-instance module-resolution trap.
 *
 * Call it **once per app**, after creating the PixiJS `Application` and before
 * the first spin. Do NOT also detach `gsap.updateRoot` yourself — driving GSAP
 * from two sources advances it twice per frame (animations run at double speed).
 *
 * @param ticker - The PixiJS ticker to drive GSAP from (usually `app.ticker`).
 * @returns A disposer that detaches the driver and restores GSAP's own ticker.
 *
 * @example
 * import { Application } from 'pixi.js';
 * import { driveGsapWithTicker } from 'pixi-reels';
 *
 * const app = new Application();
 * await app.init({ ... });
 * const stopGsapSync = driveGsapWithTicker(app.ticker);
 * // ...on teardown:
 * stopGsapSync();
 */
export function driveGsapWithTicker(ticker: Ticker): () => void {
  const gsap = getGsap();
  gsap.ticker.remove(gsap.updateRoot);
  const driver = (): void => {
    gsap.updateRoot(ticker.lastTime / 1000);
  };
  ticker.add(driver);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    ticker.remove(driver);
    gsap.ticker.add(gsap.updateRoot);
  };
}
