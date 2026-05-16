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
   * GSAP easing string for the drop-in trajectory. Default `'back.out(1.5)'`
   * — a soft overshoot. Use `'bounce.out'` for cartoon bounce, `'sine.in'`
   * for gravity, `'expo.in'` for slam.
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
   *   - `'topToBottom'` (default) — top row arrives first, bottom row last.
   *     Reads as "new symbols pour from above" — the natural drop-in feel.
   *   - `'bottomToTop'` — bottom row arrives first. Reads as "stacking up
   *     from below"; rare but occasionally fits puzzle / match-3 themes.
   */
  rowOrder?: 'topToBottom' | 'bottomToTop';

  /**
   * How far symbols fall, in cells.
   *
   *   - `'perHole'` (default) — gravity-correct. Each symbol falls exactly
   *     as far as its hole demands: new symbols from above, survivors slide
   *     down the count of holes below them, untouched symbols don't move.
   *   - `'auto'` — every symbol falls the full visible-rows distance. Useful
   *     when you want the entire column to drop in unison.
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
      ease: config?.dropIn?.ease ?? 'back.out(1.5)',
      rowStagger: config?.dropIn?.rowStagger ?? 60,
      rowOrder: config?.dropIn?.rowOrder ?? 'topToBottom',
      distance: config?.dropIn?.distance ?? 'perHole',
    },
  };
}
