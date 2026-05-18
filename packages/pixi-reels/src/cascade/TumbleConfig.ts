/**
 * Configuration for tumble cascade phases. Passed to
 * `ReelSetBuilder.tumble(config)` and baked into the three phase classes at
 * build time. Pure animation values — every callback you want is an event
 * (`reelSet.events.on('cascade:...', ...)`), never a config field.
 */

export interface TumbleFallConfig {
  /**
   * How long each symbol's fall-out tween runs, in ms. Default 300.
   */
  duration?: number;

  /**
   * GSAP easing string for the fall trajectory. Default `'sine.in'`
   * (gravity feel). Anything from gsap.com/docs/v3/Eases works.
   */
  ease?: string;

  /**
   * Delay between successive rows starting their fall, in ms. `0` makes
   * every row fall together. Default 0.
   */
  rowStagger?: number;

  /**
   * Which row of each reel begins its fall first.
   *
   *   - `'bottomToTop'` (default) — bottom row falls first, top row last.
   *     Pairs with the per-reel left-to-right stagger from `speed.spinDelay`
   *     to give the canonical "bottom-left falls first, top-right last"
   *     feel of commercial tumble slots.
   *   - `'topToBottom'` — top row falls first. Reads as the column
   *     "peeling" downward; useful for theme-specific effects.
   */
  rowOrder?: 'bottomToTop' | 'topToBottom';
}

export interface TumbleDropInConfig {
  /**
   * How long each symbol's drop-in tween runs, in ms. Default 600.
   */
  duration?: number;

  /**
   * GSAP easing string for the drop-in trajectory. Default `'power2.out'`
   * — symbols decelerate cleanly into their slot with NO overshoot, which
   * matches the canonical commercial-slot pattern: fall straight in, then
   * play a per-symbol landing spine animation. Use `'back.out(1.5)'` for a
   * soft overshoot, `'bounce.out'` for cartoon bounce, `'sine.in'` for
   * gravity, `'expo.in'` for slam.
   */
  ease?: string;

  /**
   * Delay between successive rows starting their drop, in ms. Default 60.
   * `0` makes every animated row drop in simultaneously — the most common
   * choice for cascade refills.
   */
  rowStagger?: number;

  /**
   * Which row lands first when `rowStagger > 0`.
   *
   *   - `'bottomToTop'` (default) — bottom row arrives first, top row last.
   *     Paired with `setDropOrder('ltr')` per-reel stagger this gives the
   *     canonical "bottom-left first, top-right last" reveal that every
   *     commercial tumble slot ships with.
   *   - `'topToBottom'` — top row arrives first. Reads as "new symbols
   *     pour from above"; fits gravity-themed or rain-style slots.
   */
  rowOrder?: 'bottomToTop' | 'topToBottom';

  /**
   * How far symbols fall, in cells.
   *
   *   - `'perHole'` (default) — gravity-correct. Each symbol falls exactly
   *     as far as its hole demands: new symbols from above, survivors slide
   *     down the count of holes below them, untouched symbols don't move.
   *   - `'auto'` — every symbol falls the full visible-rows distance. Best
   *     for Moment A (initial drop, "the entire column drops in unison")
   *     and for refills made up entirely of new symbols. For refills with
   *     SURVIVORS the engine silently falls back to per-hole geometry for
   *     those movers — `'auto'` would teleport a sliding survivor above
   *     the viewport before dropping it back down, which reads as a flash.
   *   - `number` — explicit pixel distance applied uniformly to every
   *     animated symbol.
   */
  distance?: 'perHole' | 'auto' | number;
}

export interface TumbleConfig {
  /** Fall-out animation (existing symbols leaving on `spin()` click). */
  fall?: TumbleFallConfig;
  /** Drop-in animation (new symbols arriving after `setResult` or in `refill`). */
  dropIn?: TumbleDropInConfig;
}

/** Resolved config with defaults applied. Internal type. */
export interface ResolvedTumbleConfig {
  fall: Required<TumbleFallConfig>;
  dropIn: Required<TumbleDropInConfig>;
}

export function resolveTumbleConfig(config: TumbleConfig | undefined): ResolvedTumbleConfig {
  return {
    fall: {
      duration: config?.fall?.duration ?? 300,
      ease: config?.fall?.ease ?? 'sine.in',
      rowStagger: config?.fall?.rowStagger ?? 0,
      rowOrder: config?.fall?.rowOrder ?? 'bottomToTop',
    },
    dropIn: {
      duration: config?.dropIn?.duration ?? 600,
      // No overshoot in the default: most commercial cascade slots have
      // symbols fall straight into their slot, then play a per-symbol
      // landing spine animation. `power2.out` is a clean decelerating
      // ease that lands without an overshoot bounce. Recipes that want
      // the springy feel can opt into `back.out(...)` explicitly.
      ease: config?.dropIn?.ease ?? 'power2.out',
      rowStagger: config?.dropIn?.rowStagger ?? 60,
      rowOrder: config?.dropIn?.rowOrder ?? 'bottomToTop',
      distance: config?.dropIn?.distance ?? 'perHole',
    },
  };
}

/**
 * Merge a partial `TumbleFallConfig` over a fully-resolved base. Used by
 * `CascadeFallPhase` at `onEnter` time to apply per-speed-profile
 * overrides without losing the build-time defaults. Returns a new object
 * — the base is never mutated.
 */
export function mergeFallConfig(
  base: Required<TumbleFallConfig>,
  override: TumbleFallConfig | undefined,
): Required<TumbleFallConfig> {
  if (!override) return base;
  return {
    duration: override.duration ?? base.duration,
    ease: override.ease ?? base.ease,
    rowStagger: override.rowStagger ?? base.rowStagger,
    rowOrder: override.rowOrder ?? base.rowOrder,
  };
}

/**
 * Merge a partial `TumbleDropInConfig` over a fully-resolved base. Used by
 * `CascadeDropInPhase` at `onEnter` time to apply per-speed-profile
 * overrides without losing the build-time defaults. Returns a new object
 * — the base is never mutated.
 */
export function mergeDropInConfig(
  base: Required<TumbleDropInConfig>,
  override: TumbleDropInConfig | undefined,
): Required<TumbleDropInConfig> {
  if (!override) return base;
  return {
    duration: override.duration ?? base.duration,
    ease: override.ease ?? base.ease,
    rowStagger: override.rowStagger ?? base.rowStagger,
    rowOrder: override.rowOrder ?? base.rowOrder,
    distance: override.distance ?? base.distance,
  };
}
