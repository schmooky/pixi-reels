import { Assets, type Texture } from 'pixi.js';

/**
 * The generic slot set: eleven flat stickers for a 5x3 line game. Wild,
 * Scatter, four highs (seven, diamond, bell, clover) and the five royals,
 * each a 384 px square WebP with the piece already placed in its cell.
 *
 * Served from `/generic-symbols/<id>.webp` on the docs site. Drawn with a
 * flat cartoon brief on stiva.ai and cut to stickers; see the credits page.
 */
export const GENERIC_SYMBOL_IDS = ['W', 'S', 'H1', 'H2', 'H3', 'H4', 'L5', 'L4', 'L3', 'L2', 'L1'] as const;
export type GenericSymbolId = (typeof GENERIC_SYMBOL_IDS)[number];

export const GENERIC_SYMBOL_NAMES: Record<GenericSymbolId, string> = {
  W: 'Wild', S: 'Scatter', H1: 'Seven', H2: 'Diamond', H3: 'Bell', H4: 'Clover',
  L5: 'A', L4: 'K', L3: 'Q', L2: 'J', L1: '10',
};

/** Reel weights that read as a slot: royals often, highs rarer, specials rare. */
export const GENERIC_WEIGHTS: Record<GenericSymbolId, number> = {
  L1: 9, L2: 9, L3: 9, L4: 9, L5: 8, H4: 6, H3: 5, H2: 4, H1: 3, W: 2, S: 2,
};

export interface GenericSymbolSet {
  textures: Record<GenericSymbolId, Texture>;
  ids: readonly GenericSymbolId[];
}

/** Load the eleven stickers through `PIXI.Assets`; cached, so every demo on a page shares them. */
export async function loadGenericSymbols(basePath = '/generic-symbols/'): Promise<GenericSymbolSet> {
  const urls = GENERIC_SYMBOL_IDS.map((id) => `${basePath}${id}.webp`);
  const loaded = (await Assets.load(urls)) as Record<string, Texture>;
  const textures = {} as Record<GenericSymbolId, Texture>;
  GENERIC_SYMBOL_IDS.forEach((id, i) => {
    const tex = loaded[urls[i]!];
    if (!tex) throw new Error(`loadGenericSymbols: ${urls[i]} did not load.`);
    textures[id] = tex;
  });
  return { textures, ids: GENERIC_SYMBOL_IDS };
}
