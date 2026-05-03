/**
 * Big-symbols recipe — register a 2×2 bonus and let the engine paint
 * OCCUPIED across the block. Server places the symbol id at the anchor
 * cell only; engine fills the rest.
 *
 * To try it: in sandbox.ts, swap the active `buildSandbox` body for
 * `return buildBigSymbols(ctx)`.
 */
import type { Texture } from 'pixi.js';
import { ReelSetBuilder, SpeedPresets, enableDebug } from 'pixi-reels';
import { BlurSpriteSymbol } from '../../../shared/BlurSpriteSymbol.js';
import type { SandboxContext, SandboxResult } from '../sandbox.js';

const SYMBOLS = ['low1', 'low2', 'med1', 'high1', 'bonus'];
const SYMBOL_MAP: Record<string, string> = {
  low1: 'round/round_1', low2: 'round/round_2',
  med1: 'royal/royal_1', high1: 'royal/royal_3',
  bonus: 'wild/wild_1',
};
const REELS = 5;
const ROWS = 4;
const SYMBOL_SIZE = 130;
const GAP = 6;

export function buildBigSymbols({ app, textures, blurTextures }: SandboxContext): SandboxResult {
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
    .weights({ low1: 18, low2: 18, med1: 12, high1: 6, bonus: 1 })
    // weight 0 — big symbols are placed by the server (or this demo's
    // nextResult) at anchor cells; random fill cannot place blocks in v1.
    .symbolData({ bonus: { weight: 0, zIndex: 5, size: { w: 2, h: 2 } } })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  const width = REELS * (SYMBOL_SIZE + GAP) - GAP;
  const height = ROWS * (SYMBOL_SIZE + GAP) - GAP;

  // 1-in-6 spins, drop a 2×2 bonus at a random valid anchor.
  const nextResult = (): string[][] => {
    const grid: string[][] = Array.from({ length: REELS }, () =>
      Array.from({ length: ROWS }, () => {
        const r = Math.random();
        if (r < 0.4) return 'low1';
        if (r < 0.7) return 'low2';
        if (r < 0.9) return 'med1';
        return 'high1';
      }),
    );
    if (Math.random() < 1 / 6) {
      const col = Math.floor(Math.random() * (REELS - 1));
      const row = Math.floor(Math.random() * (ROWS - 1));
      grid[col][row] = 'bonus';
    }
    return grid;
  };

  return { reelSet, width, height, nextResult };
}
