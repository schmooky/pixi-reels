/**
 * Expanding-wild recipe — degenerate big-symbol case. Builds a normal slot
 * and uses the pin API with `turns: 'eval'` to fill a column when a wild
 * lands.
 *
 * To try it: in sandbox.ts, swap the active `buildSandbox` body for
 * `return buildExpandingWild(ctx)`.
 */
import type { Texture } from 'pixi.js';
import { ReelSetBuilder, SpeedPresets, enableDebug } from 'pixi-reels';
import { BlurSpriteSymbol } from '../../../shared/BlurSpriteSymbol.js';
import type { SandboxContext, SandboxResult } from '../sandbox.js';

const SYMBOLS = ['low1', 'low2', 'med1', 'high1', 'wild'];
const SYMBOL_MAP: Record<string, string> = {
  low1: 'round/round_1', low2: 'round/round_2',
  med1: 'royal/royal_1', high1: 'royal/royal_3',
  wild: 'wild/wild_1',
};
const REELS = 5;
const ROWS = 3;
const SYMBOL_SIZE = 140;
const GAP = 6;

export function buildExpandingWild({ app, textures, blurTextures }: SandboxContext): SandboxResult {
  const symbolTextures: Record<string, Texture> = {};
  const symbolBlurTextures: Record<string, Texture> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
    if (blurTextures[atlasKey]) symbolBlurTextures[id] = blurTextures[atlasKey];
  }

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleSymbols(ROWS)
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
    .weights({ low1: 18, low2: 18, med1: 12, high1: 6, wild: 4 })
    .symbolData({ wild: { weight: 4, zIndex: 5 } })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  // After each landing, if a wild appears, expand it across the full column
  // for the NEXT spin via 'eval' pins.
  reelSet.events.on('spin:complete', () => {
    for (const reel of reelSet.reels) {
      const visible = reel.getVisibleSymbols();
      const hasWild = visible.includes('wild');
      if (hasWild) {
        reelSet.events.once('spin:start' as any, () => {
          for (let r = 0; r < ROWS; r++) {
            reelSet.pin(reel.reelIndex, r, 'wild', { turns: 'eval' });
          }
        });
      }
    }
  });

  const width = REELS * (SYMBOL_SIZE + GAP) - GAP;
  const height = ROWS * (SYMBOL_SIZE + GAP) - GAP;

  const nextResult = (): string[][] =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
    );

  return { reelSet, width, height, nextResult };
}
