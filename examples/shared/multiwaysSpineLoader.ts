import { Assets } from 'pixi.js';
import type { SpineSymbolSource } from 'pixi-reels/spine';

/**
 * Loads the Thunderkick MultiWays symbol spine bundle (native Spine 4.2
 * exports, used with permission).
 *
 * Eleven regular symbols across three skeletons: `lows` carries
 * `low1`..`low6`, `mids` carries `mid1`..`mid4`, plus a single-symbol
 * `high`. The remarkable part is the skin axis: every symbol is authored
 * once per ROW COUNT. skins are named `<id>/size<rows>` for rows 2..7,
 * each sized so a reel of N rows is exactly filled by N plates. That
 * matches pixi-reels' multiways model (cell height =
 * `reelPixelHeight / visibleRows[i]`) one to one: pick the skin from the
 * reel's row count and the art always fits the stretched cell.
 *
 * Geometry: every size ladder implies the same authored reel height
 * (2x308 = 3x206 = ... = 7x88 = ~617). so ONE uniform spine scale of
 * `reelPixelHeight / MULTIWAYS_AUTHORED_REEL_H` fits every skin on
 * every reel. Authored column width is ~109 (lows; mids/high overflow
 * their column by design).
 *
 * Animations are namespaced: `general/idle`, `general/land`,
 * `general/explode` (lows + mids only. `high` has no explode, so cascade
 * destroys on it fall back to the engine implode), `wins/win`.
 *
 * Served from `multiways-spine/` under the active publicDir.
 */
export const MULTIWAYS_ATLAS = 'multiways-symbols-atlas';

export const MULTIWAYS_SKELETONS = ['lows', 'mids', 'high'] as const;

export type MultiwaysSkeleton = (typeof MULTIWAYS_SKELETONS)[number];

export const MULTIWAYS_SYMBOL_IDS = [
  'low1', 'low2', 'low3', 'low4', 'low5', 'low6',
  'mid1', 'mid2', 'mid3', 'mid4',
  'high',
] as const;

export type MultiwaysSymbolId = (typeof MULTIWAYS_SYMBOL_IDS)[number];

/** Authored reel pixel-box height implied by every skin ladder (~617). */
export const MULTIWAYS_AUTHORED_REEL_H = 617;

/** Authored column width of the low tier (mids/high overflow by design). */
export const MULTIWAYS_AUTHORED_CELL_W = 109;

/** Row counts the art is authored for. clamp shapes into this range. */
export const MULTIWAYS_MIN_SIZE = 2;
export const MULTIWAYS_MAX_SIZE = 7;

const skeletonAlias = (name: MultiwaysSkeleton): string => `multiways-${name}`;

const DEFAULT_BASE = '/multiways-spine/';

const loaded = new Map<string, Promise<void>>();

/** Idempotent per basePath: safe to call from multiple boot() invocations. */
export async function loadMultiwaysSpines(basePath: string = DEFAULT_BASE): Promise<void> {
  const cached = loaded.get(basePath);
  if (cached) return cached;
  const work = (async () => {
    await Assets.load({ alias: MULTIWAYS_ATLAS, src: `${basePath}symbols.atlas` });
    for (const name of MULTIWAYS_SKELETONS) {
      await Assets.load({ alias: skeletonAlias(name), src: `${basePath}${name}.json` });
    }
  })();
  loaded.set(basePath, work);
  return work;
}

const TIER_OF: Record<MultiwaysSymbolId, MultiwaysSkeleton> = {
  low1: 'lows', low2: 'lows', low3: 'lows', low4: 'lows', low5: 'lows', low6: 'lows',
  mid1: 'mids', mid2: 'mids', mid3: 'mids', mid4: 'mids',
  high: 'high',
};

/** Skin name for a symbol at a given per-reel row count (clamped to 2..7). */
export function multiwaysSkinName(id: string, rows: number): string {
  const size = Math.max(MULTIWAYS_MIN_SIZE, Math.min(MULTIWAYS_MAX_SIZE, Math.round(rows)));
  return `${id}/size${size}`;
}

/**
 * Build the `spineMap` for `SpineReelSymbol`. `defaultRows` picks the
 * skin variant applied at instance creation; a per-reel re-skin (from
 * `resize()`, where the stretched cell height reveals the reel's row
 * count) should follow via `multiwaysSkinName`.
 */
export function buildMultiwaysSpineMap(defaultRows = 4): Record<string, SpineSymbolSource> {
  const out: Record<string, SpineSymbolSource> = {};
  for (const id of MULTIWAYS_SYMBOL_IDS) {
    out[id] = {
      skeleton: skeletonAlias(TIER_OF[id]),
      atlas: MULTIWAYS_ATLAS,
      skin: multiwaysSkinName(id, defaultRows),
    };
  }
  return out;
}
