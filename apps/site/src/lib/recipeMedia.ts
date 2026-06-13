import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Recipe preview media: convention-first, zero-config.
 *
 * Drop a file at `public/recipes/<slug>/card.<ext>` and it shows up as the
 * recipe's card thumbnail automatically. no registry edit. Supported
 * extensions are tried in {@link CARD_EXTS} order (animated `gif` / `webp`
 * win over a static `png`). When nothing is found, the card renders a
 * generated placeholder derived from the recipe title.
 *
 * Inline body images work the same way: `<RecipeImage src="/recipes/x/foo.gif" />`
 * renders the file if it exists under `public/`, else a placeholder that
 * surfaces the `alt` text and the exact path you need to provide.
 *
 * All probing happens at build time (these helpers are only called from
 * `.astro` components), so the rendered HTML is static. no client cost.
 */

const CARD_EXTS = ['gif', 'webp', 'avif', 'png', 'jpg', 'jpeg', 'mp4', 'webm'] as const;
const VIDEO_EXTS = new Set(['mp4', 'webm']);

let _publicDir: string | null = null;
function publicDir(): string {
  if (_publicDir) return _publicDir;
  const candidates = [
    path.join(process.cwd(), 'public'),
    fileURLToPath(new URL('../../public/', import.meta.url)),
  ];
  _publicDir = candidates.find((c) => {
    try {
      return fs.statSync(c).isDirectory();
    } catch {
      return false;
    }
  }) ?? candidates[0];
  return _publicDir;
}

export interface RecipeMediaAsset {
  /** Public URL, e.g. `/recipes/hold-and-win/card.png`. */
  src: string;
  kind: 'image' | 'video';
}

function toAsset(src: string): RecipeMediaAsset {
  const ext = src.split('.').pop()?.toLowerCase() ?? '';
  return { src, kind: VIDEO_EXTS.has(ext) ? 'video' : 'image' };
}

/** True if the public-rooted URL (`/foo/bar.png`) maps to a real file. */
export function publicAssetExists(urlPath: string | undefined): boolean {
  if (!urlPath || !urlPath.startsWith('/')) return false;
  try {
    return fs.statSync(path.join(publicDir(), urlPath.slice(1))).isFile();
  } catch {
    return false;
  }
}

/** Resolve a public URL to a media asset, or null if the file is missing. */
export function resolvePublicMedia(urlPath: string | undefined): RecipeMediaAsset | null {
  return publicAssetExists(urlPath) ? toAsset(urlPath as string) : null;
}

/**
 * Find a recipe's card asset: an explicit `override` if it exists, then the
 * conventional `/recipes/<slug>/card.<ext>` paths. Returns null for a
 * placeholder fallback.
 */
export function findCardMedia(slug: string, override?: string): RecipeMediaAsset | null {
  if (override && publicAssetExists(override)) return toAsset(override);
  for (const ext of CARD_EXTS) {
    const rel = `/recipes/${slug}/card.${ext}`;
    if (publicAssetExists(rel)) return toAsset(rel);
  }
  return null;
}

/** The conventional card path to show in "drop a file here" placeholder hints. */
export function cardHintPath(slug: string): string {
  return `public/recipes/${slug}/card.gif`;
}

// ─────────────────────────────────────────────────────────────────────────
// Placeholder generation — deterministic from the title so each recipe
// gets a stable, distinct tint, and the art reads as a slot board.

/** Stable hue in [0, 360). */
export function hueFor(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 1-2 letter monogram from the most significant words of a title. */
export function monogram(title: string): string {
  const words = title
    .replace(/[:&·—-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(the|a|an|and|with|to|of|in|on|win)$/i.test(w));
  if (words.length === 0) return title.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
