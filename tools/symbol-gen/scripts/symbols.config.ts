export type SymbolDef = {
  name: string;
  /** Frame texture size (square) and skeleton bounding box. */
  size: number;
  /**
   * Icon texture size (square). Defaults to `size`. Set larger than `size`
   * to render a glyph that visually overflows the frame — useful for chunky
   * wild characters that should bleed past the tile border.
   */
  iconSize?: number;
  bgColor: string;
  glyph: string;
  glyphColor: string;
  fontFamily: string;
  fontWeight: number;
  /** fontSize = round(iconSize * fontScale). */
  fontScale: number;
};

/**
 * Font registry. Keys are aliases used by symbols below.
 * Aliases decouple config from font metadata so you can swap files
 * without touching SYMBOLS.
 */
export const FONTS: Record<string, string[]> = {
  SymbolDisplay: ['./fonts/Inter-Black.ttf'],
  SymbolLabel: ['./fonts/Inter-Bold.ttf'],
  SymbolIcon: ['./fonts/NotoSansSymbols2-Regular.ttf'],
};

export const SYMBOLS: SymbolDef[] = [
  { name: 'low_a',   size: 140, bgColor: '#E85D3A', glyph: 'A',       glyphColor: '#FFFFFF', fontFamily: 'SymbolDisplay', fontWeight: 900, fontScale: 0.60 },
  { name: 'low_k',   size: 140, bgColor: '#7A3FA0', glyph: 'K',       glyphColor: '#FFFFFF', fontFamily: 'SymbolDisplay', fontWeight: 900, fontScale: 0.60 },
  { name: 'low_q',   size: 140, bgColor: '#E8B53A', glyph: 'Q',       glyphColor: '#2A1A00', fontFamily: 'SymbolDisplay', fontWeight: 900, fontScale: 0.60 },
  { name: 'low_j',   size: 140, bgColor: '#2FA862', glyph: 'J',       glyphColor: '#FFFFFF', fontFamily: 'SymbolDisplay', fontWeight: 900, fontScale: 0.60 },
  { name: 'mid_1',   size: 140, bgColor: '#3A6FE8', glyph: '◆',       glyphColor: '#FFFFFF', fontFamily: 'SymbolIcon',    fontWeight: 400, fontScale: 0.55 },
  { name: 'mid_2',   size: 140, bgColor: '#C8324A', glyph: '★',       glyphColor: '#FFE27A', fontFamily: 'SymbolIcon',    fontWeight: 400, fontScale: 0.55 },
  { name: 'mid_3',   size: 140, bgColor: '#1FA89F', glyph: '♣',       glyphColor: '#FFFFFF', fontFamily: 'SymbolIcon',    fontWeight: 400, fontScale: 0.55 },
  { name: 'high_1',  size: 140, bgColor: '#F2C14E', glyph: '♛',       glyphColor: '#5A2A00', fontFamily: 'SymbolIcon',    fontWeight: 400, fontScale: 0.60 },
  // Wild's frame stays at the standard 140 cell size, but the icon
  // canvas is 200 — the chunky "W" deliberately bleeds past the frame
  // border for a stronger premium-symbol read.
  { name: 'wild',    size: 140, iconSize: 200, bgColor: '#F2E14E', glyph: 'W',       glyphColor: '#1A1A1A', fontFamily: 'SymbolDisplay', fontWeight: 900, fontScale: 0.95 },
  { name: 'scatter', size: 140, bgColor: '#9B4DE8', glyph: 'SCATTER', glyphColor: '#FFFFFF', fontFamily: 'SymbolLabel',   fontWeight: 700, fontScale: 0.20 },
];

export const SPINE_VERSION = '4.2.43';
export const FPS = 60;
