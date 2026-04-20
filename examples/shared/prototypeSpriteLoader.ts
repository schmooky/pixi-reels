import { Assets, type Spritesheet, type Texture } from 'pixi.js';

/**
 * Load the `prototype-symbols` TexturePacker atlas into `PIXI.Assets`.
 *
 * Source: https://github.com/schmooky/prototype-symbols
 *
 * Atlas layout: 84 frames keyed like `round/round_1`, `royal/royal_3`,
 * `wild/wild_2`, etc., each with an optional `_blur` variant for the
 * fast-spin motion-blur pattern.
 *
 * Served from `public/prototype-symbols/prototype.{json,webp}` on the
 * docs site; `examples/assets/prototype-symbols/...` on the filesystem.
 */
export interface PrototypeTextureSet {
  /** Base textures, keyed by the atlas frame name (`family/name`). */
  textures: Record<string, Texture>;
  /** Pre-rendered motion-blur variants, keyed by the BASE name (no `_blur` suffix). */
  blurTextures: Record<string, Texture>;
  /** The full atlas as `PIXI.Assets` returned it — advanced access. */
  sheet: Spritesheet;
}

export async function loadPrototypeSymbols(basePath = '/prototype-symbols/'): Promise<PrototypeTextureSet> {
  const sheet = (await Assets.load(basePath + 'prototype.json')) as Spritesheet;

  const textures: Record<string, Texture> = {};
  const blurTextures: Record<string, Texture> = {};

  for (const [key, tex] of Object.entries(sheet.textures)) {
    if (key.endsWith('_blur')) {
      blurTextures[key.slice(0, -'_blur'.length)] = tex;
    } else {
      textures[key] = tex;
    }
  }

  return { textures, blurTextures, sheet };
}

/** Every frame id in the atlas (for discovery / enumeration). */
export const PROTOTYPE_SYMBOL_IDS = {
  round: ['round/round_1', 'round/round_2', 'round/round_3', 'round/round_4', 'round/round_5', 'round/round_6', 'round/round_7', 'round/round_8', 'round/round_9'],
  royal: ['royal/royal_1', 'royal/royal_2', 'royal/royal_3', 'royal/royal_4', 'royal/royal_5', 'royal/royal_6', 'royal/royal_7', 'royal/royal_8', 'royal/royal_9'],
  square: ['square/square_1', 'square/square_2', 'square/square_3', 'square/square_4', 'square/square_5', 'square/square_6', 'square/square_7', 'square/square_8', 'square/square_9'],
  wild: ['wild/wild_1', 'wild/wild_2', 'wild/wild_3', 'wild/wild_4'],
  bonus: ['bonus/bonus_1', 'bonus/bonus_2', 'bonus/bonus_3', 'bonus/bonus_4'],
  feature: ['feature/feature_1', 'feature/feature_2', 'feature/feature_3', 'feature/feature_4'],
} as const;
