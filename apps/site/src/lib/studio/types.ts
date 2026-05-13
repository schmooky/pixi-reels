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
 * `SpineReelSymbol` consumes — see `examples/shared/SpineReelSymbol.ts`.
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
 * `blob`'s bytes — content-addressed so the same upload deduplicates,
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
