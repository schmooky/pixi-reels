/**
 * Megaways recipe — per-spin row variation. Each spin chooses a random shape
 * inside `[minRows, maxRows]`, and `setShape()` is called between `spin()`
 * and `setResult()`. AdjustPhase reshapes the reels before the stop sequence.
 *
 * To try it: in sandbox.ts, swap the active `buildSandbox` body for
 * `return buildMegaways(ctx)`.
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
const REELS = 6;
const MIN_ROWS = 2;
const MAX_ROWS = 7;
const REEL_PIXEL_HEIGHT = 700;
const SYMBOL_SIZE = REEL_PIXEL_HEIGHT / MAX_ROWS; // ~100
const GAP = 4;

export function buildMegaways({ app, textures, blurTextures }: SandboxContext): SandboxResult {
  const symbolTextures: Record<string, Texture> = {};
  const symbolBlurTextures: Record<string, Texture> = {};
  for (const [id, atlasKey] of Object.entries(SYMBOL_MAP)) {
    symbolTextures[id] = textures[atlasKey];
    if (blurTextures[atlasKey]) symbolBlurTextures[id] = blurTextures[atlasKey];
  }

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .megaways({ minRows: MIN_ROWS, maxRows: MAX_ROWS, reelPixelHeight: REEL_PIXEL_HEIGHT })
    .adjustDuration(220)
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
    .weights({ low1: 18, low2: 18, med1: 12, high1: 6, wild: 3 })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  enableDebug(reelSet);

  const width = REELS * (SYMBOL_SIZE + GAP) - GAP;
  const height = REEL_PIXEL_HEIGHT;

  // Random shape per spin. nextResult is called BEFORE setShape — the caller
  // (main.ts) wires it up: it sets shape, then calls nextResult to get the
  // grid, then calls setResult. We push shape into a closure-shared variable.
  let lastShape: number[] = new Array(REELS).fill(MAX_ROWS);
  const pickShape = (): number[] =>
    Array.from({ length: REELS }, () => MIN_ROWS + Math.floor(Math.random() * (MAX_ROWS - MIN_ROWS + 1)));

  const nextResult = (): string[][] => {
    const shape = pickShape();
    lastShape = shape;
    reelSet.setShape(shape);
    return shape.map((rows) =>
      Array.from({ length: rows }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
    );
  };
  void lastShape;

  return { reelSet, width, height, nextResult };
}
