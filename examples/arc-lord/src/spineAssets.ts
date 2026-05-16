import { Assets } from 'pixi.js';

/**
 * Spine asset names (matching the file basenames in `/arc-lord/spine/`).
 *
 *   - Symbols 0, 12, 13 ship with their OWN `.avif` page → `.avif.atlas`.
 *   - Symbols 1–5 share `allTexturesLow.png` → bare `.atlas`.
 *   - Symbols 6–9 share `allTextures.png`    → bare `.atlas`.
 *
 * The shared PNGs live in the same directory as the atlas files; Pixi's
 * Spine loader resolves the page-name reference inside the atlas against
 * the atlas's own URL, so co-location is all we need.
 */
export const SYMBOL_IDS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type ArcSymbolId = (typeof SYMBOL_IDS)[number];

/** Pretty names — order is high (premium) → low (commons). */
export const SYMBOL_NAMES: Record<ArcSymbolId, string> = {
  '0': 'sceptre',
  '1': 'spade',
  '2': 'heart',
  '3': 'club',
  '4': 'diamond',
  '5': 'mark',
  '6': 'helmet',
  '7': 'shield',
  '8': 'crown',
  '9': 'ring',
};

/** Which atlas extension each symbol uses. Derived from the directory listing. */
const ATLAS_EXT: Record<ArcSymbolId, string> = {
  '0': '.avif.atlas',   // own page (symbol-0.avif)
  '1': '.atlas',        // shared allTexturesLow.png
  '2': '.atlas',
  '3': '.atlas',
  '4': '.atlas',
  '5': '.atlas',
  '6': '.atlas',        // shared allTextures.png
  '7': '.atlas',
  '8': '.atlas',
  '9': '.atlas',
};

const BASE = '/arc-lord/spine/';

let loadPromise: Promise<void> | null = null;

/** Idempotent — safe to call from multiple boot() invocations. */
export function loadArcLordSpines(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    for (const id of SYMBOL_IDS) {
      const atlasAlias = `arclord-${id}-atlas`;
      const skelAlias  = `arclord-${id}-skel`;
      await Assets.load({ alias: atlasAlias, src: `${BASE}symbol-${id}${ATLAS_EXT[id]}` });
      await Assets.load({ alias: skelAlias,  src: `${BASE}symbol-${id}.skel` });
    }
  })();
  return loadPromise;
}

export function buildArcLordSpineMap(): Record<string, { skeleton: string; atlas: string }> {
  const out: Record<string, { skeleton: string; atlas: string }> = {};
  for (const id of SYMBOL_IDS) {
    out[id] = {
      skeleton: `arclord-${id}-skel`,
      atlas:    `arclord-${id}-atlas`,
    };
  }
  return out;
}
