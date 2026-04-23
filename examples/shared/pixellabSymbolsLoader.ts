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
 *     frame_00.png         // idle / win pulse sequence
 *     frame_01.png
 *     ...
 *     disintegrate_00.png  // optional cascade-vanish sequence
 *     disintegrate_01.png
 *     ...
 * ```
 *
 * `base.png` is the still image used as the reference when the sequences
 * were generated — useful as a single-frame fallback.
 *
 * `frame_NN.png` is one frame of the win animation, ready to feed into
 * `AnimatedSpriteSymbol.frames[symbolId]`.
 *
 * `disintegrate_NN.png` is an optional second sequence for cascade pops —
 * the symbol crumbling/shattering/bursting. If the files don't exist the
 * loader still succeeds; `disintegrateFrames[id]` is just an empty array.
 *
 * Frame files are discovered by probing sequential indices until a 404,
 * so regenerating with a different `PIXELAB_FRAMES` count just works.
 */
export interface PixellabSymbolSet {
  /** Per-symbol idle/win frame texture arrays, keyed by symbol id. Ready for `AnimatedSpriteSymbol`. */
  frames: Record<string, Texture[]>;
  /**
   * Per-symbol cascade-vanish frames, keyed by symbol id. Empty array
   * when no disintegrate sequence exists for that symbol.
   */
  disintegrateFrames: Record<string, Texture[]>;
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
 * const { frames, disintegrateFrames } = await loadPixellabSymbols(['cherry', 'seven']);
 * builder.symbols((r) => {
 *   r.register('cherry', AnimatedSpriteSymbol, { frames });
 *   r.register('seven',  AnimatedSpriteSymbol, { frames });
 * });
 *
 * // During a cascade, play the disintegrate frames on each winner:
 * onWinnersVanish: async (rs, winners) => {
 *   for (const w of winners) {
 *     playSequenceOverCell(rs, w, disintegrateFrames[idAt(w)]);
 *   }
 * }
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
  const disintegrateFrames: Record<string, Texture[]> = {};
  const base: Record<string, Texture> = {};

  for (const id of ids) {
    base[id] = (await Assets.load(`${basePath}${id}/base.png`)) as Texture;
    frames[id] = await loadSequence(`${basePath}${id}`, 'frame', maxFrames);
    if (frames[id].length === 0) {
      throw new Error(`loadPixellabSymbols: no frames found for "${id}" at ${basePath}${id}/`);
    }
    // Disintegrate is optional — empty array is fine.
    disintegrateFrames[id] = await loadSequence(`${basePath}${id}`, 'disintegrate', maxFrames);
  }

  return { frames, disintegrateFrames, base, ids: [...ids] };
}

/** Probe `<prefix>_00.png`, `<prefix>_01.png`, ... until a fetch 404s. */
async function loadSequence(dir: string, prefix: string, maxFrames: number): Promise<Texture[]> {
  const out: Texture[] = [];
  for (let i = 0; i < maxFrames; i++) {
    const url = `${dir}/${prefix}_${String(i).padStart(2, '0')}.png`;
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) break;
    out.push((await Assets.load(url)) as Texture);
  }
  return out;
}
