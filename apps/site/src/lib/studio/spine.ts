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

import { Assets, type Texture } from 'pixi.js';
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
 * Rewrite an atlas text so every page filename becomes the supplied URL.
 * Used at load time to point the atlas at blob URLs instead of unresolvable
 * relative filenames.
 */
export function rewriteAtlasTextureUrls(
  atlasText: string,
  filenameToUrl: Record<string, string>,
): string {
  const lines = atlasText.split(/\r?\n/);
  return lines
    .map((line) => {
      if (line.length === 0 || line !== line.trimStart() || line.includes(':')) return line;
      const trimmed = line.trim();
      if (!/\.(png|webp|jpe?g)$/i.test(trimmed)) return line;
      return filenameToUrl[trimmed] ?? line;
    })
    .join('\n');
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
 * the aliases SpineReelSymbol expects. Caller revokes `blobUrls` on cleanup.
 *
 * `runId` namespaces the aliases so successive Runs don't fight over a
 * cached alias from the previous run.
 */
export async function loadStudioSpine(
  symbol: SpineSymbolConfig,
  runId: string,
): Promise<SpineLoadResult> {
  // 1. Load and rewrite the atlas.
  const atlasAsset = await getAsset(symbol.atlasHash);
  if (!atlasAsset) throw new Error(`Spine atlas blob missing: ${symbol.atlasHash}`);
  const atlasText = await atlasAsset.blob.text();

  const blobUrls: string[] = [];
  const textureUrls: Record<string, string> = {};
  for (const [filename, hash] of Object.entries(symbol.textureHashes)) {
    const tex = await getAsset(hash);
    if (!tex) throw new Error(`Spine texture page missing: ${filename} (hash ${hash})`);
    const url = URL.createObjectURL(tex.blob);
    blobUrls.push(url);
    textureUrls[filename] = url;
  }

  // Make sure every page the atlas references has a matching texture.
  const expected = parseAtlasTexturePages(atlasText);
  for (const page of expected) {
    if (!textureUrls[page]) {
      throw new Error(
        `Spine symbol "${symbol.id}" is missing texture page "${page}". ` +
        `Upload it under that exact filename in the Symbols tab.`,
      );
    }
  }

  const rewrittenAtlas = rewriteAtlasTextureUrls(atlasText, textureUrls);
  const atlasBlob = new Blob([rewrittenAtlas], { type: 'text/plain' });
  const atlasUrl = URL.createObjectURL(atlasBlob);
  blobUrls.push(atlasUrl);

  // 2. Load the skeleton JSON.
  const skelAsset = await getAsset(symbol.skeletonHash);
  if (!skelAsset) throw new Error(`Spine skeleton blob missing: ${symbol.skeletonHash}`);
  const skelUrl = URL.createObjectURL(skelAsset.blob);
  blobUrls.push(skelUrl);

  // 3. Register with PixiJS Assets under unique aliases so two runs don't
  //    collide. We use the runId as a namespace prefix.
  const skeletonAlias = `studio-${runId}-${symbol.id}.json`;
  const atlasAlias = `studio-${runId}-${symbol.id}.atlas`;

  Assets.add({ alias: skeletonAlias, src: skelUrl });
  Assets.add({ alias: atlasAlias, src: atlasUrl });
  await Assets.load<unknown>([skeletonAlias, atlasAlias]);

  return { skeletonAlias, atlasAlias, blobUrls };
}

/** Unique-enough namespace for this Run's spine aliases. */
export function newRunId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// `Texture` re-export keeps consumers from needing two pixi.js imports.
export type { Texture };
