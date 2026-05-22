/**
 * Studio configuration shape.
 *
 * The whole studio state is one of these objects plus a content-addressed
 * blob store. v1 keeps the config in IndexedDB and never touches the
 * network; v2 will serialize this same shape, encrypt the asset blobs with
 * a user-supplied password, and upload via the schmooky proxy. The split
 * between `StudioConfig` (pure JSON) and the blob store (binary) is what
 * makes that v2 plug-in clean.
 */

export type SymbolType = 'sprite' | 'animatedSprite' | 'spine';

/**
 * Lifecycle events a Spine symbol class can drive. Names match what
 * `SpineReelSymbol` consumes. see `examples/shared/SpineReelSymbol.ts`.
 * The studio UI lets users pick one animation per event from the
 * skeleton's available animations.
 */
export type SpineEvent = 'idle' | 'spin' | 'landing' | 'win' | 'destroy';

export interface SpriteSymbolConfig {
  type: 'sprite';
  /** User-given symbol id, e.g. "wild". Must be unique within a config. */
  id: string;
  /** SHA-256 hex of the texture blob (PNG/WebP). */
  textureHash: string;
  /**
   * Maps to `SymbolData.unmask: true` on the engine. renders this symbol
   * above the reel mask so its visuals can spill outside the cell. The
   * builder auto-switches to `SharedRectMaskStrategy` when any symbol has
   * this flag.
   */
  unmask?: boolean;
}

export interface AnimatedSpriteSymbolConfig {
  type: 'animatedSprite';
  id: string;
  /** SHA-256 hex of the sprite sheet PNG. */
  sheetHash: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  /** Frames per second. */
  fps: number;
  /** See SpriteSymbolConfig.unmask. */
  unmask?: boolean;
}

export interface SpineSymbolConfig {
  type: 'spine';
  id: string;
  /** SHA-256 hex of the .json skeleton. */
  skeletonHash: string;
  /** SHA-256 hex of the .atlas file. */
  atlasHash: string;
  /**
   * Texture pages referenced by the atlas, keyed by the filename the atlas
   * uses (e.g. `wild.webp` or `wild_atlas.png`). One hash per page; on load
   * the studio rewrites the atlas to point at blob URLs.
   */
  textureHashes: Record<string, string>;
  /**
   * Animation name to play for each lifecycle event. Missing keys mean the
   * slot is unbound (engine default behaviour: no animation for that event).
   */
  events: Partial<Record<SpineEvent, string>>;
  /**
   * PNG data URL of the symbol rendered offscreen at setup pose (or one
   * frame of `idle`, when available). Generated at save time so the
   * Symbols-tab row shows a real thumbnail and not just a bone icon.
   * Optional. preview generation is best-effort and may fail on
   * malformed bundles.
   */
  previewDataUrl?: string;
  /**
   * Spine scale to pass to `SpineReelSymbol`'s `scale` option. Auto-
   * computed at save time: the spine's natural bounds get fit into a
   * ~160px reference box (same math the preview render uses). Without
   * this, spines render at their setup-pose size regardless of the
   * builder's cell dimensions. scatter at 400px natural width spills
   * everywhere in a 190px cell, even masked, just hidden by the mask.
   */
  scale?: number;
  /** See SpriteSymbolConfig.unmask. Spine especially benefits. win/celebrate
   * animations almost always need to spill outside the cell. */
  unmask?: boolean;
}

export type SymbolConfig =
  | SpriteSymbolConfig
  | AnimatedSpriteSymbolConfig
  | SpineSymbolConfig;

export interface StudioConfig {
  /** The TypeScript source the user is editing. */
  code: string;
  /** User-defined symbols. The runtime exposes each as `userSymbols.<id>`. */
  symbols: SymbolConfig[];
}

/**
 * One entry in the IndexedDB asset store. The key is the SHA-256 hex of
 * `blob`'s bytes. content-addressed so the same upload deduplicates,
 * regardless of filename. `name` is the original filename, kept only for UI.
 */
export interface StoredAsset {
  hash: string;
  blob: Blob;
  mime: string;
  name: string;
  size: number;
  createdAt: number;
}

export const STUDIO_CONFIG_KEY = 'current';

export const EMPTY_STUDIO_CONFIG: StudioConfig = {
  code: '',
  symbols: [],
};
