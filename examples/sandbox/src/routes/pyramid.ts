/**
 * Pyramid recipe — static 3-5-5-5-3 shape with center anchoring.
 *
 * To try it: in sandbox.ts, swap the active `buildSandbox` body for
 * `return buildPyramid(ctx)`.
 */
import type { Texture } from 'pixi.js';
import { ReelSetBuilder, SpeedPresets, enableDebug } from 'pixi-reels';
import { BlurSpriteSymbol } from '../../../shared/BlurSpriteSymbol.js';
import type { SandboxContext, SandboxResult } from '../sandbox.js';

const SYMBOLS = ['low1', 'low2', 'low3', 'med1', 'med2', 'high1', 'high2', 'wild'];
const SYMBOL_MAP: Record<string, string> = {
  low1: 'round/round_1', low2: 'round/round_2', low3: 'round/round_3',
  med1: 'royal/royal_1', med2: 'royal/royal_2',
  high1: 'royal/royal_3', high2: 'royal/royal_4',
  wild: 'wild/wild_1',
};
const SYMBOL_SIZE = 120;
const GAP = 6;
const VISIBLE = [3, 5, 5, 5, 3];

export function buildPyramid({ app, textures, blurTextures }: SandboxContext): SandboxResult {
  const symbolTextures: Record<string, Texture> = {};
  const symbolBlurTextures: Record<string, Texture> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
    if (blurTextures[atlasKey]) symbolBlurTextures[id] = blurTextures[atlasKey];
  }

  const reelSet = new ReelSetBuilder()
    .reels(VISIBLE.length)
    .visibleRowsPerReel(VISIBLE)
    .reelAnchor('center')
    .symbolSize(SYMBOL_SIZE, SYMBOL_SIZE)
    .symbolGap(GAP, GAP)
    .symbols((registry) => {
      for (const id of SYMBOLS) {
        registry.register(id, BlurSpriteSymbol, {
          textures: symbolTextures,
          blurTextures: symbolBlurTextures,
        });
      }
    })
    .weights({ low1: 18, low2: 18, low3: 18, med1: 12, med2: 12, high1: 6, high2: 6, wild: 3 })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  const tallest = Math.max(...VISIBLE);
  const width = VISIBLE.length * (SYMBOL_SIZE + GAP) - GAP;
  const height = tallest * (SYMBOL_SIZE + GAP) - GAP;

  const nextResult = (): string[][] =>
    VISIBLE.map((rows) => Array.from({ length: rows }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]));

  return { reelSet, width, height, nextResult };
}
