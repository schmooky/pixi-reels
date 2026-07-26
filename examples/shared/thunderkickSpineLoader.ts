import { Assets } from 'pixi.js';
import type { SpineSymbolSource } from 'pixi-reels/spine';

/**
 * Loads the Thunderkick symbol spine bundle (Spine 4.2 skeletons migrated
 * from the game's original 4.0 exports, used with permission).
 *
 * One multi-skin skeleton per symbol tier - `lowSymbols` carries skins
 * `low1`..`low5`, `midSymbols` carries `mid1`..`mid4` - plus single-skin
 * `high`, `wild`, `scatter`, and `mystery`. Everything shares one
 * two-page atlas.
 *
 * Served from `thunderkick-spine/` under the active publicDir
 * (`examples/assets/` for examples, `apps/site/public/` for the docs site).
 */
export const THUNDERKICK_ATLAS = 'thunderkick-symbols-atlas';

export const THUNDERKICK_SKELETONS = [
  'lowSymbols', 'midSymbols', 'high', 'wild', 'scatter', 'mystery',
] as const;

export type ThunderkickSkeleton = (typeof THUNDERKICK_SKELETONS)[number];

export const THUNDERKICK_SYMBOL_IDS = [
  'low1', 'low2', 'low3', 'low4', 'low5',
  'mid1', 'mid2', 'mid3', 'mid4',
  'high', 'wild', 'mystery', 'scatter',
] as const;

export type ThunderkickSymbolId = (typeof THUNDERKICK_SYMBOL_IDS)[number];

const skeletonAlias = (name: ThunderkickSkeleton): string => `thunderkick-${name}`;

const DEFAULT_BASE = '/thunderkick-spine/';

const loaded = new Map<string, Promise<void>>();

/** Idempotent per basePath: safe to call from multiple boot() invocations. */
export async function loadThunderkickSpines(basePath: string = DEFAULT_BASE): Promise<void> {
  const cached = loaded.get(basePath);
  if (cached) return cached;
  const work = (async () => {
    await Assets.load({ alias: THUNDERKICK_ATLAS, src: `${basePath}symbols.atlas` });
    for (const name of THUNDERKICK_SKELETONS) {
      await Assets.load({ alias: skeletonAlias(name), src: `${basePath}${name}.json` });
    }
  })();
  loaded.set(basePath, work);
  return work;
}

/** symbolId -> tier skeleton and, for the multi-skin tiers, its skin. */
const MAIN_SOURCE: Record<ThunderkickSymbolId, { skeleton: ThunderkickSkeleton; skin?: string }> = {
  low1: { skeleton: 'lowSymbols', skin: 'low1' },
  low2: { skeleton: 'lowSymbols', skin: 'low2' },
  low3: { skeleton: 'lowSymbols', skin: 'low3' },
  low4: { skeleton: 'lowSymbols', skin: 'low4' },
  low5: { skeleton: 'lowSymbols', skin: 'low5' },
  mid1: { skeleton: 'midSymbols', skin: 'mid1' },
  mid2: { skeleton: 'midSymbols', skin: 'mid2' },
  mid3: { skeleton: 'midSymbols', skin: 'mid3' },
  mid4: { skeleton: 'midSymbols', skin: 'mid4' },
  high: { skeleton: 'high' },
  wild: { skeleton: 'wild' },
  mystery: { skeleton: 'mystery' },
  scatter: { skeleton: 'scatter' },
};

/**
 * Build the `spineMap` for `SpineReelSymbol`: every symbol resolves to its
 * tier skeleton, the multi-skin tiers each with their own skin.
 */
export function buildThunderkickSpineMap(): Record<string, SpineSymbolSource> {
  const out: Record<string, SpineSymbolSource> = {};
  for (const id of THUNDERKICK_SYMBOL_IDS) {
    const main = MAIN_SOURCE[id];
    out[id] = {
      skeleton: skeletonAlias(main.skeleton),
      atlas: THUNDERKICK_ATLAS,
      ...(main.skin ? { skin: main.skin } : {}),
    };
  }
  return out;
}
