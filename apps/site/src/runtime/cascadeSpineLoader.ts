import { Assets } from 'pixi.js';
import type { SpineSymbolSource } from 'pixi-reels/spine';

/**
 * Loads the Thunderkick cascade symbol spine bundle (Spine 4.2 skeletons
 * migrated from the game's original 4.1 exports, used with permission).
 *
 * Nine regular symbols across two skeletons: `lowMidSymbols` carries skins
 * `low1`..`low5` and `mid1`..`mid3`, plus a single-skin `high`. Both share
 * one three-page atlas. Every skeleton has the same animation vocabulary:
 * `idle`, `land`, `win`, and an authored `explode` destruction (a baked
 * 23-frame explosion sequence). ideal as the cascade `out` animation.
 *
 * The authored symbol plates differ per tier: `lowMidSymbols` is 88x101.6,
 * `high` is 124x143.2. authored 1.41x bigger ON PURPOSE (its 310x358
 * plate attachment vs the tiers' 220x254 at the same bone scale), so the
 * premium symbol overflows its cell and pops out of the grid like in the
 * original game. Register every id at the same uniform scale.
 *
 * Served from `cascade-spine/` under the active publicDir
 * (`apps/site/public/` for the docs site).
 */
export const CASCADE_ATLAS = 'cascade-symbols-atlas';

export const CASCADE_SKELETONS = ['lowMidSymbols', 'high'] as const;

export type CascadeSkeleton = (typeof CASCADE_SKELETONS)[number];

export const CASCADE_SYMBOL_IDS = [
  'low1', 'low2', 'low3', 'low4', 'low5',
  'mid1', 'mid2', 'mid3',
  'high',
] as const;

export type CascadeSymbolId = (typeof CASCADE_SYMBOL_IDS)[number];

/** Setup-pose plate of the low/mid tier. cells are sized from this. */
export const CASCADE_PLATE_W = 88;
export const CASCADE_PLATE_H = 101.6;

const skeletonAlias = (name: CascadeSkeleton): string => `cascade-${name}`;

const DEFAULT_BASE = '/cascade-spine/';

const loaded = new Map<string, Promise<void>>();

/** Idempotent per basePath: safe to call from multiple boot() invocations. */
export async function loadCascadeSpines(basePath: string = DEFAULT_BASE): Promise<void> {
  const cached = loaded.get(basePath);
  if (cached) return cached;
  const work = (async () => {
    await Assets.load({ alias: CASCADE_ATLAS, src: `${basePath}symbols.atlas` });
    for (const name of CASCADE_SKELETONS) {
      await Assets.load({ alias: skeletonAlias(name), src: `${basePath}${name}.json` });
    }
  })();
  loaded.set(basePath, work);
  return work;
}

/** symbolId -> tier skeleton and, for the multi-skin tier, its skin. */
const MAIN_SOURCE: Record<CascadeSymbolId, { skeleton: CascadeSkeleton; skin?: string }> = {
  low1: { skeleton: 'lowMidSymbols', skin: 'low1' },
  low2: { skeleton: 'lowMidSymbols', skin: 'low2' },
  low3: { skeleton: 'lowMidSymbols', skin: 'low3' },
  low4: { skeleton: 'lowMidSymbols', skin: 'low4' },
  low5: { skeleton: 'lowMidSymbols', skin: 'low5' },
  mid1: { skeleton: 'lowMidSymbols', skin: 'mid1' },
  mid2: { skeleton: 'lowMidSymbols', skin: 'mid2' },
  mid3: { skeleton: 'lowMidSymbols', skin: 'mid3' },
  high: { skeleton: 'high' },
};

/**
 * Build the `spineMap` for `SpineReelSymbol`: every symbol resolves to its
 * tier skeleton, the multi-skin tier each with its own skin.
 */
export function buildCascadeSpineMap(): Record<string, SpineSymbolSource> {
  const out: Record<string, SpineSymbolSource> = {};
  for (const id of CASCADE_SYMBOL_IDS) {
    const main = MAIN_SOURCE[id];
    out[id] = {
      skeleton: skeletonAlias(main.skeleton),
      atlas: CASCADE_ATLAS,
      ...(main.skin ? { skin: main.skin } : {}),
    };
  }
  return out;
}
