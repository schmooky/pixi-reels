import { gsap as resolvedGsap } from 'gsap';

/** The gsap namespace type, as the engine passes it around. */
export type Gsap = typeof resolvedGsap;

/**
 * The gsap instance resolved at lib-load time. Used by any `ReelSet` whose
 * builder did not call `.gsap(...)`, and by any symbol not yet bound to a
 * set.
 *
 * **Why the engine passes gsap around at all:** under tools that resolve
 * modules through symlinked workspaces (vite + a locally-linked pixi-reels,
 * pnpm dev setups, esbuild plugin chains), the gsap import inside the lib's
 * compiled `dist/index.js` and the gsap import in the consumer's source can
 * resolve to *different module instances*. each with its own root timeline.
 * The consumer drives one, the lib's tweens live on the other, and reels
 * stall at progress 0. `ReelSetBuilder.gsap(myGsap)` hands the engine the
 * consumer's instance so both live on the same timeline.
 *
 * Held PER REEL SET, not process-wide: two sets on one stage can be driven
 * by different gsap instances, which is what a composed stage (a banner reel
 * above a main grid, a bonus board beside it) needs.
 */
export const DEFAULT_GSAP: Gsap = resolvedGsap;
