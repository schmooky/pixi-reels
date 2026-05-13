/**
 * Spine-specific loading utilities for the studio.
 *
 * Loading a Spine bundle from user-uploaded blobs needs three things to
 * line up: the skeleton JSON, the atlas text, and one texture page per
 * filename the atlas references. The atlas references pages by relative
 * filename — those won't resolve from a blob URL — so we rewrite each
 * texture line to point at the matching blob URL before handing the
 * atlas to PixiJS Assets.
 */

import { Assets, ImageSource, type TextureSource } from 'pixi.js';
import type { SpineSymbolConfig } from './types.js';
import { getAsset } from './db.js';

/**
 * Pull the texture-page filenames out of an atlas text. The atlas format
 * starts each page with the texture filename on its own non-indented line
 * (e.g. `wild.webp`), followed by indented metadata. Region blocks within
 * a page have arbitrary names that may contain dots, but they're always
 * indented or contain a colon — so the heuristic below is reliable for
 * standard Spine atlas output.
 */
export function parseAtlasTexturePages(atlasText: string): string[] {
  const out: string[] = [];
  const lines = atlasText.split(/\r?\n/);
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line !== line.trimStart()) continue; // indented = not a page header
    if (line.includes(':')) continue;        // metadata like "size: 256, 128"
    if (/\.(png|webp|jpe?g)$/i.test(line.trim())) {
      out.push(line.trim());
    }
  }
  return out;
}

/**
 * Pull the animation names out of a Spine skeleton JSON.
 * The runtime JSON format keeps animations under `.animations` keyed by name.
 */
export function parseSpineAnimations(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText) as { animations?: Record<string, unknown> };
    return Object.keys(parsed.animations ?? {});
  } catch {
    return [];
  }
}

/**
 * Studio's event vocabulary maps onto SpineReelSymbol's overrides:
 *
 *   studio.spin    → engine.blur
 *   studio.destroy → engine.out
 *   (idle, landing, win match by name)
 */
export function studioEventsToEngineOverrides(
  events: SpineSymbolConfig['events'],
): { idle?: string; blur?: string; landing?: string; win?: string; out?: string } {
  return {
    idle: events.idle,
    blur: events.spin,
    landing: events.landing,
    win: events.win,
    out: events.destroy,
  };
}

interface SpineLoadResult {
  /** Alias the SpineReelSymbol's `spineMap.<id>.skeleton` should reference. */
  skeletonAlias: string;
  /** Alias the SpineReelSymbol's `spineMap.<id>.atlas` should reference. */
  atlasAlias: string;
  /** All blob URLs created during load — caller revokes them on teardown. */
  blobUrls: string[];
}

/**
 * Load a single studio spine symbol's assets into PixiJS Assets and return
 * the aliases `SpineReelSymbol` (and `Spine.from`) consume. Caller revokes
 * `blobUrls` on cleanup.
 *
 * Why the dance — the spine-pixi-v8 loaders match by file extension
 * (`.atlas`, `.json`), which blob URLs don't have. So we sidestep extension
 * detection entirely:
 *
 *   - Atlas: pre-load each texture page as a PixiJS `Texture`, pass their
 *     `TextureSource`s to the atlas loader via `data.images` keyed by
 *     atlas page name. The loader skips relative-path resolution and uses
 *     the supplied sources directly. We force the parser via
 *     `loadParser: 'spineTextureAtlasLoader'` because the URL no longer
 *     tells the loader it's an atlas.
 *
 *   - Skeleton: `Spine.from` calls `Assets.get(skeletonAlias)` and feeds
 *     the result to `SkeletonJson.readSkeletonData`, which expects the
 *     parsed JSON object. We `JSON.parse` ourselves and seed the cache
 *     directly — cleaner than coercing the JSON loader past its `.json`
 *     extension check.
 *
 * `runId` namespaces the aliases so successive Runs don't reuse stale
 * cache entries.
 */
export async function loadStudioSpine(
  symbol: SpineSymbolConfig,
  runId: string,
): Promise<SpineLoadResult> {
  const blobUrls: string[] = [];

  // 1. Build a TextureSource per page directly from the blob — bypasses
  //    the PixiJS texture loader's extension/MIME sniffing (blob URLs
  //    have no extension and the default loader's `test` rejects them).
  //    `ImageSource` extends `TextureSource`; the spine atlas parser
  //    accepts either via `data.images`.
  const images: Record<string, TextureSource> = {};
  for (const [filename, hash] of Object.entries(symbol.textureHashes)) {
    const asset = await getAsset(hash);
    if (!asset) throw new Error(`Spine texture page missing: ${filename} (hash ${hash})`);
    const bitmap = await createImageBitmap(asset.blob);
    images[filename] = new ImageSource({
      resource: bitmap,
      alphaMode: 'premultiply-alpha-on-upload',
    });
  }

  // 2. Atlas: validate every page the atlas references has a matching
  //    texture, then load with the explicit parser + pre-bound sources.
  const atlasAsset = await getAsset(symbol.atlasHash);
  if (!atlasAsset) throw new Error(`Spine atlas blob missing: ${symbol.atlasHash}`);
  const atlasText = await atlasAsset.blob.text();
  for (const page of parseAtlasTexturePages(atlasText)) {
    if (!(page in images)) {
      throw new Error(
        `Spine symbol "${symbol.id}" is missing texture page "${page}". ` +
        `Upload it under that exact filename in the Symbols tab.`,
      );
    }
  }
  const atlasUrl = URL.createObjectURL(atlasAsset.blob);
  blobUrls.push(atlasUrl);

  const atlasAlias = `studio-${runId}-${symbol.id}-atlas`;
  Assets.add({
    alias: atlasAlias,
    src: atlasUrl,
    loadParser: 'spineTextureAtlasLoader',
    data: { images },
  });
  await Assets.load(atlasAlias);

  // 3. Skeleton JSON: parse ourselves, seed the cache so Assets.get returns
  //    the object Spine.from expects.
  const skelAsset = await getAsset(symbol.skeletonHash);
  if (!skelAsset) throw new Error(`Spine skeleton blob missing: ${symbol.skeletonHash}`);
  const skelText = await skelAsset.blob.text();
  let skelData: unknown;
  try {
    skelData = JSON.parse(skelText);
  } catch (e) {
    throw new Error(
      `Spine symbol "${symbol.id}" skeleton is not valid JSON: ${(e as Error).message}`,
    );
  }
  const skeletonAlias = `studio-${runId}-${symbol.id}-skeleton`;
  Assets.cache.set(skeletonAlias, skelData);

  return { skeletonAlias, atlasAlias, blobUrls };
}

/** Unique-enough namespace for this Run's spine aliases. */
export function newRunId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// `Texture` re-export keeps consumers from needing two pixi.js imports.
export type { Texture };
