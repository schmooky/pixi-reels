/**
 * Configuration for cascade drop-in behavior.
 * Passed to ReelSetBuilder.cascade() to replace the default strip-spin mechanic.
 */
export interface CascadeDropConfig {
  /** Stagger between rows dropping in (ms). 0 = all rows arrive simultaneously. Default: 0. */
  rowDelay?: number;
  /** Stagger between rows falling out (ms). 0 = all rows fall simultaneously. Default: 0. */
  fallRowDelay?: number;
  /** Distance symbols travel (px) — both falling out and dropping in. Default: auto (full column height). */
  fromY?: number;
  /** GSAP easing for the drop-in animation. Default: 'bounce.out'. */
  easing?: string;
  /** Duration of each symbol's drop-in animation (ms). 0 = instant. Default: 600. */
  dropDuration?: number;
  /** Duration of each symbol's fall-out animation (ms). 0 = skip fall. Default: 300. */
  fallDuration?: number;
}

/**
 * Named presets for common cascade drop patterns.
 *
 * Pass one to ReelSetBuilder.cascade():
 *   builder.cascade(DropRecipes.cascadeDrop)
 *
 * Control reel order per-spin with reelSet.setDropOrder():
 *   reelSet.setDropOrder('ltr')  // left-to-right stagger
 *   reelSet.setDropOrder('rtl')  // right-to-left stagger
 *   reelSet.setDropOrder('all')  // all columns simultaneously
 */
export const DropRecipes = {
  /** Old symbols fall out, then new ones drop in row by row with bounce. Classic cascade feel. */
  cascadeDrop: { rowDelay: 80, dropDuration: 600, fallDuration: 300, easing: 'bounce.out' } as CascadeDropConfig,

  /** Stiff landing — no bounce. Symbols fall out then drop in cleanly with a hard stop. */
  stiffDrop: { rowDelay: 60, dropDuration: 450, fallDuration: 280, easing: 'power3.out' } as CascadeDropConfig,

  /** Old symbols fall out, then all new symbols in a column drop simultaneously. Good for refills. */
  simultaneousDrop: { rowDelay: 0, dropDuration: 500, fallDuration: 300, easing: 'bounce.out' } as CascadeDropConfig,

  /** Instant placement — no fall, no drop animation. Equivalent to slam-stop. */
  slamDrop: { rowDelay: 0, dropDuration: 0, fallDuration: 0 } as CascadeDropConfig,
} as const;
