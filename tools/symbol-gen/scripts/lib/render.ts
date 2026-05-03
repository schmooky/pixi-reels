import { Canvas } from 'skia-canvas';
import type { SymbolDef } from '../symbols.config';

const FALLBACK_FAMILY = 'sans-serif';

export type RenderedSymbol = {
  frame: Buffer;
  icon: Buffer;
};

/**
 * Renders one symbol into two separate textures:
 *   - frame: tile background + border, no glyph
 *   - icon:  glyph on a fully transparent background
 *
 * Splitting the visual lets the skeleton animate the icon independently
 * from the frame (idle should leave the border perfectly stationary).
 */
export function renderSymbol(def: SymbolDef): RenderedSymbol {
  return {
    frame: renderFrame(def),
    icon: renderIcon(def),
  };
}

function renderFrame(def: SymbolDef): Buffer {
  const c = new Canvas(def.size, def.size);
  const ctx = c.getContext('2d');

  // tile fill
  ctx.fillStyle = def.bgColor;
  ctx.fillRect(0, 0, def.size, def.size);

  // soft inner shadow via two strokes
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, def.size - 6, def.size - 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, def.size - 16, def.size - 16);

  return c.toBufferSync('png');
}

function renderIcon(def: SymbolDef): Buffer {
  // Icon canvas can be larger than the frame — `iconSize` defaults to
  // `size`, but a wild that wants its glyph to bleed past the frame
  // border sets a larger iconSize and the spine attachment matches.
  const iconSize = def.iconSize ?? def.size;
  const c = new Canvas(iconSize, iconSize);
  const ctx = c.getContext('2d');

  // transparent background; only the glyph is drawn
  ctx.fillStyle = def.glyphColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fontSize = Math.round(iconSize * def.fontScale);
  ctx.font = `${def.fontWeight} ${fontSize}px "${def.fontFamily}", ${FALLBACK_FAMILY}`;

  ctx.fillText(def.glyph, iconSize / 2, iconSize / 2);

  return c.toBufferSync('png');
}
