import { Assets, type Texture } from 'pixi.js';

/**
 * Load the pixellab-generated animation frames into `PIXI.Assets`.
 *
 * Asset layout on disk (also served under `/pixellab-symbols/` on the site):
 *
 * ```
 * examples/assets/pixellab-symbols/
 *   cherry/
 *     base.png
 *     frame_00.png
 *     frame_01.png
 *     ...
 *   seven/
 *     base.png
 *     frame_00.png
 *     ...
 * ```
 *
 * `base.png` is the still image used as the reference when the sequence
 * was generated — useful as a single-frame fallback or a spin placeholder.
 * `frame_NN.png` is one frame of the win animation, ready to feed into
 * `AnimatedSpriteSymbol.frames[symbolId]`.
 *
 * The `frame_NN.png` files are discovered by probing sequential indices
 * until a 404 — avoids baking a frame count into code, so regenerating
 * with a different `PIXELAB_FRAMES` just works.
 */
export interface PixellabSymbolSet {
  /** Per-symbol frame texture arrays, keyed by symbol id. Ready for `AnimatedSpriteSymbol`. */
  frames: Record<string, Texture[]>;
  /** Per-symbol still/base texture, keyed by symbol id. */
  base: Record<string, Texture>;
  /** Discovered symbol ids, in requested order. */
  ids: string[];
}

export interface LoadPixellabOptions {
  /** URL prefix where the assets are served. Default `/pixellab-symbols/`. */
  basePath?: string;
  /** Max frames to probe per symbol before giving up. Default 16 (pixellab's ceiling). */
  maxFrames?: number;
}

/**
 * Load a set of pixellab-generated symbols.
 *
 * ```ts
 * const { frames } = await loadPixellabSymbols(['cherry', 'seven']);
 * builder.symbols((r) => {
 *   r.register('cherry', AnimatedSpriteSymbol, { frames });
 *   r.register('seven',  AnimatedSpriteSymbol, { frames });
 * });
 * ```
 *
 * `frames` maps **every** id to **every** symbol's frames — pass the
 * same map to each registration. `AnimatedSpriteSymbol.onActivate` picks
 * the right sub-array by symbolId on each symbol swap.
 */
export async function loadPixellabSymbols(
  ids: readonly string[],
  options: LoadPixellabOptions = {},
): Promise<PixellabSymbolSet> {
  const basePath = options.basePath ?? '/pixellab-symbols/';
  const maxFrames = options.maxFrames ?? 16;

  const frames: Record<string, Texture[]> = {};
  const base: Record<string, Texture> = {};

  for (const id of ids) {
    base[id] = (await Assets.load(`${basePath}${id}/base.png`)) as Texture;
    frames[id] = await loadFrames(`${basePath}${id}`, maxFrames);
    if (frames[id].length === 0) {
      throw new Error(`loadPixellabSymbols: no frames found for "${id}" at ${basePath}${id}/`);
    }
  }

  return { frames, base, ids: [...ids] };
}

/** Probe `frame_00.png`, `frame_01.png`, ... until a load errors. */
async function loadFrames(dir: string, maxFrames: number): Promise<Texture[]> {
  const out: Texture[] = [];
  for (let i = 0; i < maxFrames; i++) {
    const url = `${dir}/frame_${String(i).padStart(2, '0')}.png`;
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) break;
    out.push((await Assets.load(url)) as Texture);
  }
  return out;
}
