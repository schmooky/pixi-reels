import { gsap as defaultGsap } from 'gsap';

/**
 * The gsap instance every phase, motion tween, and cascade animation in
 * the engine reads from.
 *
 * **Why this indirection exists:** under tools that resolve modules through
 * symlinked workspaces (vite + a locally-linked pixi-reels, pnpm dev
 * setups, esbuild plugin chains), the gsap import inside the lib's
 * compiled `dist/index.js` and the gsap import in the consumer's source
 * can resolve to *different module instances*. each with its own root
 * timeline. The consumer drives one, the lib's tweens live on the other,
 * and reels stall at progress 0.
 *
 * The fix: every internal animation site reads gsap through `getGsap()`
 * instead of importing the `'gsap'` module directly. The builder method
 * `ReelSetBuilder.gsap(myGsap)` rebinds the singleton so the consumer's
 * gsap is the one the engine uses.
 *
 * Defaults to the gsap import resolved at lib-load time, so consumers
 * who don't hit the dual-instance trap don't have to do anything.
 */
let currentGsap: typeof defaultGsap = defaultGsap;

/**
 * Replace the gsap instance the engine drives. Call this BEFORE
 * `ReelSetBuilder.build()` (the builder does this for you when you call
 * `.gsap(instance)`).
 *
 * Process-global: there's only one bound instance at a time. If you
 * build several ReelSets with different gsap instances, the last
 * `setGsap` call wins.
 */
export function setGsap(g: typeof defaultGsap): void {
  currentGsap = g;
}

/** The currently-bound gsap instance. */
export function getGsap(): typeof defaultGsap {
  return currentGsap;
}
