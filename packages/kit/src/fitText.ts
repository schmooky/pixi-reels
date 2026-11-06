import type { Container } from 'pixi.js';

/**
 * Scale a text object (`PIXI.Text` / `PIXI.BitmapText`) down to fit a max
 * width and height, preserving aspect - so an amount spans the coin face
 * like the source games (short values stay big, long ones shrink to fit)
 * and never overflows. No-op if it already fits. Returns the object so you
 * can chain: `fitText(goldText(amount), CELL * 0.84, CELL * 0.46)`.
 */
export function fitText<T extends Container>(text: T, maxWidth: number, maxHeight: number): T {
  if (text.width > 0 && text.height > 0) {
    text.scale.set(Math.min(maxWidth / text.width, maxHeight / text.height, 1));
  }
  return text;
}
