/**
 * Build engine-injectable artifacts from a StudioConfig + an asset getter.
 *
 * This is the single funnel between "what the user configured in the
 * Symbols tab" and "what the runtime injects when their code runs". v2
 * (share-by-id) will hit the same function once it has decrypted the
 * shared bundle.
 *
 * Returns:
 *   - `textures`: Record<symbolId, Texture> — for sprite/animated lookups
 *     in user code that wants direct texture access.
 *   - `userSymbols`: Record<symbolId, UserSymbolBinding> — { Class, options }
 *     pairs the user code references via `userSymbols.<id>.Class`.
 */

import { Assets, Texture, type Renderer } from 'pixi.js';
import {
  SpriteSymbol,
  AnimatedSpriteSymbol,
  type SpriteSymbolOptions,
  type AnimatedSpriteSymbolOptions,
} from 'pixi-reels';
import { SpineReelSymbol, type SpineReelSymbolOptions } from 'pixi-reels/spine';
import { getAsset as getAssetFromIDB } from './db.js';
import { loadStudioSpine, newRunId, studioEventsToEngineOverrides } from './spine.js';
import type { StudioConfig, StoredAsset, SymbolConfig } from './types.js';

/** Asset resolver function. Default = IndexedDB lookup. The share
 *  viewer passes an in-memory Map's `get` so shared assets don't need
 *  to touch the visitor's local IDB. */
export type AssetGetter = (hash: string) => Promise<StoredAsset | null>;

export interface UserSymbolBinding {
  /** The symbol class to register via `r.register(id, Class, options)`. */
  Class: unknown;
  /** Options to pass to `r.register(...)`. */
  options: Record<string, unknown>;
}

export interface StudioInjectables {
  textures: Record<string, Texture>;
  userSymbols: Record<string, UserSymbolBinding>;
  /**
   * Per-symbol-id metadata to pass into `builder.symbolData(...)`. Currently
   * carries the `unmask` flag from the studio config; the engine reads it
   * to render that symbol above the reel mask, and auto-switches to
   * `SharedRectMaskStrategy` when at least one symbol is unmasked.
   */
  userSymbolData: Record<string, { unmask?: boolean }>;
  /** All blob URLs created during apply; caller revokes after teardown. */
  blobUrls: string[];
}

export interface ApplyOpts {
  /** Optional renderer for any pre-upload texture work. Currently unused. */
  renderer?: Renderer;
  /** Override the asset resolver. Defaults to the studio's IDB getAsset. */
  getAsset?: AssetGetter;
}

export async function applyStudioConfig(
  config: StudioConfig,
  opts: ApplyOpts = {},
): Promise<StudioInjectables> {
  const getAsset: AssetGetter = opts.getAsset ?? getAssetFromIDB;
  const textures: Record<string, Texture> = {};
  const userSymbols: Record<string, UserSymbolBinding> = {};
  const userSymbolData: Record<string, { unmask?: boolean }> = {};
  const blobUrls: string[] = [];
  const runId = newRunId();

  for (const symbol of config.symbols) {
    if (symbol.unmask) {
      userSymbolData[symbol.id] = { unmask: true };
    }
    if (symbol.type === 'sprite') {
      const tex = await loadTextureFromHash(symbol.textureHash, blobUrls, getAsset);
      textures[symbol.id] = tex;
      userSymbols[symbol.id] = {
        Class: SpriteSymbol,
        options: { textures: { [symbol.id]: tex } } satisfies SpriteSymbolOptions,
      };
    } else if (symbol.type === 'animatedSprite') {
      // v1: slice the sheet into frames at upload time. Engine takes an
      // array of Textures via AnimatedSpriteSymbolOptions.frames.
      const frames = await sliceSheet(
        symbol.sheetHash,
        symbol.frameWidth,
        symbol.frameHeight,
        symbol.frameCount,
        blobUrls,
        getAsset,
      );
      userSymbols[symbol.id] = {
        Class: AnimatedSpriteSymbol,
        options: {
          frames: { [symbol.id]: frames },
          fps: symbol.fps,
        } satisfies AnimatedSpriteSymbolOptions,
      };
    } else if (symbol.type === 'spine') {
      const { skeletonAlias, atlasAlias, blobUrls: spineUrls } = await loadStudioSpine(
        symbol,
        runId,
        getAsset,
      );
      blobUrls.push(...spineUrls);

      const overrides = studioEventsToEngineOverrides(symbol.events);
      const options: SpineReelSymbolOptions = {
        spineMap: { [symbol.id]: { skeleton: skeletonAlias, atlas: atlasAlias } },
        // Apply user-picked names as the engine defaults so every method
        // (playWin, playBlur, …) targets the right animation without
        // per-symbol-id overrides.
        idleAnimation: overrides.idle,
        winAnimation: overrides.win,
        landingAnimation: overrides.landing,
        outAnimation: overrides.out,
        blurAnimation: overrides.blur,
        autoPlayBlur: Boolean(overrides.blur),
        autoPlayLanding: Boolean(overrides.landing),
        // `scale` is auto-computed at save time from the skeleton's
        // natural bounds (see generateSpinePreview). Fallback 1.
        scale: symbol.scale ?? 1,
      };
      userSymbols[symbol.id] = { Class: SpineReelSymbol, options: options as Record<string, unknown> };
    }
  }

  return { textures, userSymbols, userSymbolData, blobUrls };
}

async function loadTextureFromHash(
  hash: string,
  blobUrls: string[],
  getAsset: AssetGetter,
): Promise<Texture> {
  const asset = await getAsset(hash);
  if (!asset) throw new Error(`Studio asset not found: ${hash}`);
  const url = URL.createObjectURL(asset.blob);
  blobUrls.push(url);
  const texture = await Assets.load(url);
  return texture as Texture;
}

async function sliceSheet(
  sheetHash: string,
  frameW: number,
  frameH: number,
  frameCount: number,
  blobUrls: string[],
  getAsset: AssetGetter,
): Promise<Texture[]> {
  const sheet = await loadTextureFromHash(sheetHash, blobUrls, getAsset);
  const perRow = Math.max(1, Math.floor(sheet.width / frameW));
  const frames: Texture[] = [];
  for (let i = 0; i < frameCount; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    frames.push(new Texture({
      source: sheet.source,
      frame: { x: col * frameW, y: row * frameH, width: frameW, height: frameH },
    }));
  }
  return frames;
}

/**
 * Tear down any object URLs the apply step created. Call from the
 * canvas/reelSet cleanup path to avoid blob-URL leaks across Run cycles.
 */
export function revokeBlobUrls(blobUrls: string[]): void {
  for (const url of blobUrls) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}

/**
 * @internal All three types are supported now. Kept as a hook for future
 * runtime gating (e.g. browser-feature checks).
 */
export function isSymbolTypeSupported(_t: SymbolConfig['type']): boolean {
  return true;
}
