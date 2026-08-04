/**
 * Configuration for tumble cascade phases. Passed to
 * `ReelSetBuilder.tumble(config)` and baked into the three phase classes at
 * build time. Pure animation values. every callback you want is an event
 * (`reelSet.events.on('cascade:...', ...)`), never a config field.
 */
import type { Direction } from '../core/ReelAxis.js';

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
   * Delay between successive cells starting their fall, in ms. `0` makes
   * every cell fall together. Default 0.
   */
  cellStagger?: number;

  /**
   * Which cell of each reel begins its fall first.
   *
   *   - `'auto'` (default). the cell at the gravity-EXIT end goes first, so
   *     the column drains from the edge symbols are leaving by. Under the
   *     usual downward gravity that is the bottom cell, which pairs with the
   *     per-reel left-to-right stagger from `speed.spinDelay` to give the
   *     canonical "bottom-left falls first, top-right last" feel of
   *     commercial tumble slots. Flip gravity and the stagger flips with it.
   *   - `'endFirst'`. always the cell at the larger main coordinate (bottom /
   *     right) first, whichever way gravity points.
   *   - `'startFirst'`. always the cell at the smaller main coordinate (top /
   *     left) first. Reads as the column "peeling" away from that edge.
   *
   * `'endFirst'` and `'startFirst'` are geometric, like the buffers: they name
   * an end of the strip, not a direction of travel. Only `'auto'` follows
   * gravity.
   */
  cellOrder?: 'auto' | 'endFirst' | 'startFirst';
}

export interface TumbleDropInConfig {
  /**
   * How long each symbol's drop-in tween runs, in ms. Default 600.
   */
  duration?: number;

  /**
   * GSAP easing string for the drop-in trajectory. Default `'power2.out'`
   *. symbols decelerate cleanly into their slot with NO overshoot, which
   * matches the canonical commercial-slot pattern: fall straight in, then
   * play a per-symbol landing spine animation. Use `'back.out(1.5)'` for a
   * soft overshoot, `'bounce.out'` for cartoon bounce, `'sine.in'` for
   * gravity, `'expo.in'` for slam.
   */
  ease?: string;

  /**
   * Delay between successive cells starting their drop, in ms. Default 60.
   * `0` makes every animated cell drop in simultaneously. the most common
   * choice for cascade refills.
   */
  cellStagger?: number;

  /**
   * Which cell lands first when `cellStagger > 0`.
   *
   *   - `'auto'` (default). the cell at the gravity-EXIT end arrives first,
   *     the way a settling stack fills from the floor up. Under the usual
   *     downward gravity that is the bottom cell, which paired with
   *     `setDropOrder('ltr')` gives the canonical "bottom-left first,
   *     top-right last" reveal every commercial tumble slot ships with. A
   *     reel that drains upward fills from the top instead, with no further
   *     config.
   *   - `'endFirst'`. always the cell at the larger main coordinate (bottom /
   *     right) first, whichever way gravity points.
   *   - `'startFirst'`. always the cell at the smaller main coordinate (top /
   *     left) first.
   *
   * `'endFirst'` and `'startFirst'` are geometric, like the buffers: they name
   * an end of the strip, not a direction of travel. Only `'auto'` follows
   * gravity.
   */
  cellOrder?: 'auto' | 'endFirst' | 'startFirst';

  /**
   * How far symbols fall, in cells.
   *
   *   - `'perHole'` (default). gravity-correct. Each symbol falls exactly
   *     as far as its hole demands: new symbols from above, survivors slide
   *     down the count of holes below them, untouched symbols don't move.
   *   - `'auto'`. every symbol falls the full visible-cells distance. Best
   *     for Moment A (initial drop, "the entire column drops in unison")
   *     and for refills made up entirely of new symbols. For refills with
   *     SURVIVORS the engine silently falls back to per-hole geometry for
   *     those movers. `'auto'` would teleport a sliding survivor above
   *     the viewport before dropping it back down, which reads as a flash.
   *   - `number`. explicit pixel distance applied uniformly to every
   *     animated symbol.
   */
  distance?: 'perHole' | 'auto' | number;
}

export interface TumbleConfig {
  /** Fall-out animation (existing symbols leaving on `spin()` click). */
  fall?: TumbleFallConfig;
  /** Drop-in animation (new symbols arriving after `setResult` or in `refill`). */
  dropIn?: TumbleDropInConfig;
  /**
   * Which way symbols settle along the strip. Default `'auto'`.
   *
   *   - `'auto'` (default). follow each reel's own travel direction, so a
   *     reel built with `.direction('reverse')` cascades upward (or leftward,
   *     on a horizontal set) without any further configuration. This is what
   *     you want almost always.
   *   - `'forward'`. always settle toward the larger main coordinate (down /
   *     right), whichever way the reel spins.
   *   - `'reverse'`. always settle toward the smaller main coordinate (up /
   *     left).
   *
   * Gravity is independent of direction so a reel can spin one way and drop
   * the other, but the default ties them together because that is the
   * physically coherent case. Orientation never enters into it: gravity picks
   * an END of the strip, and the axis decides which screen edge that is.
   *
   * Whichever edge gravity exits by is also the edge the server must pack
   * survivors against in the grids it sends -- the engine animates the
   * result, it does not reorder it.
   */
  gravity?: 'auto' | Direction;
}

/** Resolved config with defaults applied. Internal type. */
export interface ResolvedTumbleConfig {
  fall: Required<TumbleFallConfig>;
  dropIn: Required<TumbleDropInConfig>;
  gravity: 'auto' | Direction;
}

/**
 * Resolve `'auto'` against a reel's own travel direction. Phases call this
 * rather than reading `axis.polarity`, because gravity and travel are
 * separable (ADR 016 section 3.6) and only coincide under the default.
 */
export function resolveGravity(gravity: 'auto' | Direction, direction: Direction): Direction {
  return gravity === 'auto' ? direction : gravity;
}

/** `+1` when gravity settles toward the larger main coordinate, `-1` otherwise. */
export function gravitySign(gravity: Direction): 1 | -1 {
  return gravity === 'forward' ? 1 : -1;
}

/**
 * Resolve `'auto'` cell order against the reel's resolved gravity. `'auto'`
 * means "the gravity-EXIT end goes first": the column drains from, and
 * refills toward, the edge symbols are settling against. Explicit
 * `'endFirst'` / `'startFirst'` stay geometric and pass through untouched.
 *
 * Without this, a reel draining upward still staggered from the bottom cell
 * - the one FURTHEST from the exit edge - so the cell nearest the drain
 * waited for the whole column to leave ahead of it.
 */
export function resolveCellOrder(
  cellOrder: 'auto' | 'endFirst' | 'startFirst',
  gravity: Direction,
): 'endFirst' | 'startFirst' {
  if (cellOrder !== 'auto') return cellOrder;
  return gravity === 'forward' ? 'endFirst' : 'startFirst';
}

export function resolveTumbleConfig(config: TumbleConfig | undefined): ResolvedTumbleConfig {
  return {
    gravity: config?.gravity ?? 'auto',
    fall: {
      duration: config?.fall?.duration ?? 300,
      ease: config?.fall?.ease ?? 'sine.in',
      cellStagger: config?.fall?.cellStagger ?? 0,
      cellOrder: config?.fall?.cellOrder ?? 'auto',
    },
    dropIn: {
      duration: config?.dropIn?.duration ?? 600,
      // No overshoot in the default: most commercial cascade slots have
      // symbols fall straight into their slot, then play a per-symbol
      // landing spine animation. `power2.out` is a clean decelerating
      // ease that lands without an overshoot bounce. Recipes that want
      // the springy feel can opt into `back.out(...)` explicitly.
      ease: config?.dropIn?.ease ?? 'power2.out',
      cellStagger: config?.dropIn?.cellStagger ?? 60,
      cellOrder: config?.dropIn?.cellOrder ?? 'auto',
      distance: config?.dropIn?.distance ?? 'perHole',
    },
  };
}

/**
 * Merge a partial `TumbleFallConfig` over a fully-resolved base. Used by
 * `CascadeFallPhase` at `onEnter` time to apply per-speed-profile
 * overrides without losing the build-time defaults. Returns a new object
 *. the base is never mutated.
 */
export function mergeFallConfig(
  base: Required<TumbleFallConfig>,
  override: TumbleFallConfig | undefined,
): Required<TumbleFallConfig> {
  if (!override) return base;
  return {
    duration: override.duration ?? base.duration,
    ease: override.ease ?? base.ease,
    cellStagger: override.cellStagger ?? base.cellStagger,
    cellOrder: override.cellOrder ?? base.cellOrder,
  };
}

/**
 * Merge a partial `TumbleDropInConfig` over a fully-resolved base. Used by
 * `CascadeDropInPhase` at `onEnter` time to apply per-speed-profile
 * overrides without losing the build-time defaults. Returns a new object
 *. the base is never mutated.
 */
export function mergeDropInConfig(
  base: Required<TumbleDropInConfig>,
  override: TumbleDropInConfig | undefined,
): Required<TumbleDropInConfig> {
  if (!override) return base;
  return {
    duration: override.duration ?? base.duration,
    ease: override.ease ?? base.ease,
    cellStagger: override.cellStagger ?? base.cellStagger,
    cellOrder: override.cellOrder ?? base.cellOrder,
    distance: override.distance ?? base.distance,
  };
}
