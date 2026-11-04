import { loadPrototypeSymbols, type PrototypeTextureSet } from './prototypeSpriteLoader.js';
import { loadSpineSet, type LoadedSpineSet, type SpineSetId } from './spineSets.js';
import { loadHoldAndWinSprites, type HoldAndWinSprites } from './holdAndWinSprites.js';
import { loadHwClover, type HwCloverArt } from './hwClover.js';
import { loadGenericSymbols, type GenericSymbolSet } from './genericSymbols.js';

/**
 * The asset kits a recipe can ask its host for, by name. Every method
 * returns exactly what the underlying loader returns; the facade only fixes
 * the base URL once, so the same recipe module runs on the docs site (`/`),
 * on another origin, or in a game that serves the kits from a CDN path.
 *
 * Each kit loads once per page however many recipes ask for it; the loaders
 * cache through `PIXI.Assets`.
 */
export interface RecipeAssets {
  /** Where the kits are served from. `/` on the docs site. */
  readonly baseUrl: string;
  /** The `prototype-symbols` sprite atlas: 84 frames, each with a motion-blur variant. */
  prototypeAtlas(): Promise<PrototypeTextureSet>;
  /** The generic slot set: eleven flat stickers for `StickerSymbol`. */
  genericSymbols(): Promise<GenericSymbolSet>;
  /** A bundled Spine symbol set (`generated`, `thunderkick`, `cascade`) with its `spineMap`. */
  spineSet<I extends SpineSetId>(id: I): Promise<LoadedSpineSet<I>>;
  /** The sprite-based Hold & Win sheets (Supercharged Diamonds 3 art). */
  holdAndWinSprites(): Promise<HoldAndWinSprites>;
  /** The clover Hold & Win sheets (Four Charged Clovers art). */
  clover(): Promise<HwCloverArt>;
  /** The clover sheets plus the Spine 4.2 skeletons authored over them. */
  cloverSpines(): Promise<HwCloverArt>;
}

/** Build the facade for one base URL. The docs site passes nothing. */
export function createAssets(baseUrl = '/'): RecipeAssets {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return {
    baseUrl: base,
    prototypeAtlas: () => loadPrototypeSymbols(`${base}prototype-symbols/`),
    genericSymbols: () => loadGenericSymbols(`${base}generic-symbols/`),
    spineSet: (id) => loadSpineSet(id, `${base}${SPINE_SET_DIRS[id]}/`),
    holdAndWinSprites: () => loadHoldAndWinSprites(`${base}hw-sprites/`),
    clover: () => loadHwClover(`${base}hw-clover/`),
    // Dynamic on purpose: the clover skeletons extend `SpineReelSymbol`, and
    // a static import here would pull the Spine runtime into every page
    // that touches the kit. See `@pixi-reels/kit/spine`.
    cloverSpines: async () => (await import('./hwCloverSpine.js')).loadHwCloverSpines(`${base}hw-clover/`),
  };
}

/** The folder each bundled Spine set is served from, under the base URL. */
const SPINE_SET_DIRS: Record<SpineSetId, string> = {
  generated: 'generated-symbols',
  thunderkick: 'thunderkick-spine',
  cascade: 'cascade-spine',
};
