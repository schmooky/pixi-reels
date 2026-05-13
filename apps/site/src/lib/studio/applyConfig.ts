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
import { getAsset } from './db.js';
import type { StudioConfig, SymbolConfig } from './types.js';

export interface UserSymbolBinding {
  /** The symbol class to register via `r.register(id, Class, options)`. */
  Class: unknown;
  /** Options to pass to `r.register(...)`. */
  options: Record<string, unknown>;
}

export interface StudioInjectables {
  textures: Record<string, Texture>;
  userSymbols: Record<string, UserSymbolBinding>;
  /** All blob URLs created during apply; caller revokes after teardown. */
  blobUrls: string[];
}

export interface ApplyOpts {
  /** Optional renderer for any pre-upload texture work. Currently unused. */
  renderer?: Renderer;
}

export async function applyStudioConfig(
  config: StudioConfig,
  _opts: ApplyOpts = {},
): Promise<StudioInjectables> {
  const textures: Record<string, Texture> = {};
  const userSymbols: Record<string, UserSymbolBinding> = {};
  const blobUrls: string[] = [];

  for (const symbol of config.symbols) {
    if (symbol.type === 'sprite') {
      const tex = await loadTextureFromHash(symbol.textureHash, blobUrls);
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
      );
      userSymbols[symbol.id] = {
        Class: AnimatedSpriteSymbol,
        options: {
          frames: { [symbol.id]: frames },
          fps: symbol.fps,
        } satisfies AnimatedSpriteSymbolOptions,
      };
    } else if (symbol.type === 'spine') {
      // Spine binding is deferred to a follow-up — the atlas-rewrite path
      // needs more code than fits in this scaffold. The studio UI will
      // refuse to register a spine symbol until that lands; non-spine
      // symbols build fine.
      throw new Error(
        `Spine symbols are not yet wired in v1 of studio (symbol id='${symbol.id}'). ` +
        'Use sprite or animatedSprite for now.',
      );
    }
  }

  return { textures, userSymbols, blobUrls };
}

async function loadTextureFromHash(hash: string, blobUrls: string[]): Promise<Texture> {
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
): Promise<Texture[]> {
  const sheet = await loadTextureFromHash(sheetHash, blobUrls);
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
 * @internal Re-exported so the UI can probe whether a SymbolConfig type
 * is currently supported by the runtime — used to grey out the
 * Spine-symbol "add" path with a "coming soon" hint.
 */
export function isSymbolTypeSupported(t: SymbolConfig['type']): boolean {
  return t !== 'spine';
}
