import { Assets, type Spritesheet, type Texture } from 'pixi.js';

/**
 * Load the sprite-based Hold & Win asset set (Supercharged Diamonds 3 art:
 * a money-collect symbol set, an animated coin, and a value bitmap font).
 *
 * This is the SPRITE counterpart to the Spine coin set under `/hw-spine/`:
 * everything here is a plain TexturePacker sheet, so the symbols drop onto
 * `SpriteSymbol` / `BlurSpriteSymbol` / `AnimatedSpriteSymbol` with no
 * skeleton runtime. The two paths together cover both ways a studio ships
 * Hold & Win art.
 *
 * Served from `apps/site/public/hw-sprites/`.
 *
 * Symbol keys (base + matching motion-blur variant): `1`-`8`, `wild`,
 * `bonus`, `bonus_collect`, `collect`, `empty`, `empty_collect`,
 * `bonus_cell`, `bonus_cell_active`, `bonus_cell_collector`,
 * `bonus_stepper`, `feat1`-`feat3`, `blank`.
 *
 * Two bitmap fonts are loaded as a side effect so `PIXI.BitmapText`
 * can render with them: `DiamondDigits` (value/total: `0-9 . , / x`) and
 * `DiamondMult` (multiplier: `0-9 . , x`).
 */
export interface HoldAndWinSprites {
  /** Base symbol textures, keyed by name (`wild`, `1`, `collect`, ...). */
  symbols: Record<string, Texture>;
  /** Motion-blur variants, same keys as `symbols` (for `BlurSpriteSymbol`). */
  blur: Record<string, Texture>;
  /** The 30-frame coin flip, ordered `00`-`29` (for `AnimatedSpriteSymbol`). */
  coin: Texture[];
  /** Raw sheets, for advanced access. */
  sheets: { symbols: Spritesheet; coin: Spritesheet };
}

export async function loadHoldAndWinSprites(base = '/hw-sprites/'): Promise<HoldAndWinSprites> {
  // Bitmap fonts: loading the .fnt registers the face for PIXI.BitmapText.
  await Assets.load([base + 'hwfont.fnt', base + 'hwfont-mult.fnt']);

  const [symbolsSheet, coinSheet] = (await Promise.all([
    Assets.load(base + 'symbols.json'),
    Assets.load(base + 'coin.json'),
  ])) as [Spritesheet, Spritesheet];

  const symbols: Record<string, Texture> = {};
  const blur: Record<string, Texture> = {};
  for (const [key, tex] of Object.entries(symbolsSheet.textures)) {
    if (key.startsWith('normal/')) symbols[key.slice('normal/'.length)] = tex;
    else if (key.startsWith('blur/')) blur[key.slice('blur/'.length)] = tex;
  }

  const coin = Object.entries(coinSheet.textures)
    .sort(([a], [b]) => a.localeCompare(b)) // coin/00 .. coin/29 (zero-padded)
    .map(([, tex]) => tex);

  return { symbols, blur, coin, sheets: { symbols: symbolsSheet, coin: coinSheet } };
}
