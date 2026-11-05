import { Assets, type Texture } from 'pixi.js';

/**
 * The generic slot set: eleven flat stickers for a 5x3 line game, seven
 * 9-slice frames for the big and growing symbols, and a 5-slice WILD pillar
 * for an expanded wild. Each sticker is a 384 px square WebP with the piece
 * already placed in its cell.
 *
 * Served from `/generic-symbols/` on the docs site. Drawn with a flat
 * cartoon brief on stiva.ai and cut to stickers; the frames and the pillar
 * are cut from the same sheets so every size shares one rim.
 */
export const GENERIC_SYMBOL_IDS = ['W', 'S', 'H1', 'H2', 'H3', 'H4', 'L5', 'L4', 'L3', 'L2', 'L1'] as const;
export type GenericSymbolId = (typeof GENERIC_SYMBOL_IDS)[number];

export const GENERIC_SYMBOL_NAMES: Record<GenericSymbolId, string> = {
  W: 'Wild', S: 'Scatter', H1: 'Seven', H2: 'Diamond', H3: 'Bell', H4: 'Clover',
  L5: 'A', L4: 'K', L3: 'Q', L2: 'J', L1: '10',
};

/** Reel weights that read as a slot: royals often, highs rarer, specials rare. */
export const GENERIC_WEIGHTS: Record<GenericSymbolId, number> = {
  L1: 9, L2: 9, L3: 9, L4: 9, L5: 8, H4: 6, H3: 5, H2: 4, H1: 3, W: 2, S: 2,
};

/** Each symbol's colour, for the tile it sits on. */
export const GENERIC_HUES: Record<GenericSymbolId, number> = {
  W: 0x1fc8b4, S: 0xff4fa3, H1: 0xe8333a, H2: 0x2ec4ff, H3: 0xffb81c, H4: 0x2fbf4f,
  L5: 0xe8333a, L4: 0x2f6bff, L3: 0x8d5cff, L2: 0x7cf04a, L1: 0xff8a1f,
};

/**
 * The card deck's ids and the other names the docs recipes register, each
 * mapped onto a sticker, so a recipe written for `CardSymbol` keeps its ids
 * and its readouts and only changes the art.
 */
export const GENERIC_ALIASES: Record<string, GenericSymbolId> = {
  '7': 'H1', '8': 'H2', '9': 'H3', '10': 'L1', J: 'L2', Q: 'L3', K: 'L4', A: 'L5',
  wild: 'W', WILD: 'W', SCAT: 'S', scatter: 'S', F: 'S', bonus: 'S', seven: 'H1', diamond: 'H2', bell: 'H3', clover: 'H4',
  // The block ids the big-symbol recipes register, each on a high sticker.
  tall: 'H1', mega: 'H1', big: 'H2', giant: 'H3', wide: 'H3', square: 'H4', match: 'H4', block: 'W', bigwild: 'W',
  // The other ids the recipes place: a teaser or a coin reads as the scatter, a mystery too.
  tease: 'S', coin: 'S', mystery: 'S', gold: 'H3', multi: 'H2', off: 'L1', base: 'L1', plate: 'L5',
};

/** The sticker behind any id the set knows, or null. */
export function genericIdOf(id: string): GenericSymbolId | null {
  if ((GENERIC_SYMBOL_IDS as readonly string[]).includes(id)) return id as GenericSymbolId;
  return GENERIC_ALIASES[id] ?? null;
}

export const FRAME_COLORS = ['red', 'blue', 'gold', 'lime', 'green', 'pink', 'teal'] as const;
export type FrameColor = (typeof FRAME_COLORS)[number];

/** The frame each symbol wears when it is a block. */
export const FRAME_OF: Record<GenericSymbolId, FrameColor> = {
  H1: 'red', H2: 'blue', H3: 'gold', H4: 'green', W: 'teal', S: 'pink',
  L5: 'red', L4: 'blue', L3: 'pink', L2: 'lime', L1: 'gold',
};

/** A frame's source size and its 9-slice cuts: top, right, bottom, left, in source pixels. */
export const FRAME_METRICS: Record<FrameColor, { width: number; height: number; slice: readonly [number, number, number, number] }> = {
  red: { width: 360, height: 358, slice: [88, 93, 93, 91] },
  blue: { width: 360, height: 358, slice: [88, 93, 93, 91] },
  gold: { width: 360, height: 359, slice: [88, 93, 93, 91] },
  lime: { width: 360, height: 357, slice: [88, 93, 93, 90] },
  green: { width: 360, height: 357, slice: [88, 93, 93, 90] },
  pink: { width: 360, height: 357, slice: [88, 93, 93, 91] },
  teal: { width: 360, height: 358, slice: [88, 93, 93, 91] },
};
/** The frame's 360 px source spans this share of two cells, so the rim is about 15 % of a cell at every block size. */
export const FRAME_SCALE = 0.62;

export type PillarVariant = 'a' | 'b';
export const PILLAR_PARTS = ['top', 'band', 'wild', 'bottom'] as const;
export type PillarPart = (typeof PILLAR_PARTS)[number];
/** The two pillar cuts: `a` reads WILD across, `b` stacks the letters once the reel is tall enough. */
export const PILLAR_METRICS: Record<PillarVariant, { width: number; body: number; top: number; word: number; bottom: number }> = {
  a: { width: 320, body: 188, top: 90, word: 180, bottom: 98 },
  b: { width: 320, body: 247, top: 131, word: 759, bottom: 140 },
};

export interface GenericSymbolSet {
  /** The stickers, keyed by their id and by every alias in `GENERIC_ALIASES`. */
  textures: Record<string, Texture>;
  frames: Record<FrameColor, Texture>;
  pillars: Record<PillarVariant, Record<PillarPart, Texture>>;
  ids: readonly GenericSymbolId[];
}

/** Load the set through `PIXI.Assets`; cached, so every demo on a page shares it. */
export async function loadGenericSymbols(basePath = '/generic-symbols/'): Promise<GenericSymbolSet> {
  const url = (name: string) => `${basePath}${name}.webp`;
  const names = [
    ...GENERIC_SYMBOL_IDS,
    ...FRAME_COLORS.map((c) => `frame-${c}`),
    ...(['a', 'b'] as const).flatMap((v) => PILLAR_PARTS.map((p) => `pillar-${v}-${p}`)),
  ];
  const loaded = (await Assets.load(names.map(url))) as Record<string, Texture>;
  const get = (name: string): Texture => {
    const tex = loaded[url(name)];
    if (!tex) throw new Error(`loadGenericSymbols: ${url(name)} did not load.`);
    return tex;
  };
  const textures: Record<string, Texture> = {};
  for (const id of GENERIC_SYMBOL_IDS) textures[id] = get(id);
  for (const [alias, id] of Object.entries(GENERIC_ALIASES)) textures[alias] = textures[id]!;
  const frames = {} as Record<FrameColor, Texture>;
  for (const c of FRAME_COLORS) frames[c] = get(`frame-${c}`);
  const pillars = { a: {}, b: {} } as Record<PillarVariant, Record<PillarPart, Texture>>;
  for (const v of ['a', 'b'] as const) for (const p of PILLAR_PARTS) pillars[v][p] = get(`pillar-${v}-${p}`);
  return { textures, frames, pillars, ids: GENERIC_SYMBOL_IDS };
}
