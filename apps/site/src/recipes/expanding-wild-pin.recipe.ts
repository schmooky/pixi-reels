import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Expanding wild',
  topic: 'wilds-and-pins',
  tags: ['wild', 'sticky', 'multiplier', 'mystery', 'respin', 'cell-pin', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// Expanding wild. when a wild lands, fill its entire column with wild
// and keep the expansion for N spins. Each column-fill pin has `turns: 3`,
// so the expanded column sticks around for three more spins before the
// engine auto-expires the fill.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const FILLER = ['7', '8', '10', 'Q'];
  const WILD = WILD_CARD.id;
  const COLS = 5, ROWS = 3, SIZE = 90;
  const STICKY_TURNS = 3;

  const reelSet = new ReelSetBuilder()
    .reels(COLS)
    .visibleCells(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const sym of [...CARD_DECK, WILD_CARD]) {
        r.register(sym.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .weights({
      '7': 22,
      '8': 22,
      '10': 18,
      Q: 18,
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  // ── Expand wilds on land, persist for N spins ───────────────────────────
  // For every reel that has a wild somewhere in its visible cells, pin every
  // cell of that reel with WILD for STICKY_TURNS spins. The engine decrements
  // `turns` after each spin:allLanded and auto-expires pins at zero.
  //
  // Pinning the wild's own cell too means the "original" wild also benefits
  // from the sticky duration, so the entire column visibly stays wild until
  // all pins expire together.
  reelSet.events.on('spin:allLanded', ({ symbols }) => {
    for (let c = 0; c < symbols.length; c++) {
      const hasWild = symbols[c].includes(WILD);
      if (!hasWild) continue;
      for (let r = 0; r < symbols[c].length; r++) {
        if (!reelSet.getPin(c, r)) {
          reelSet.pin(c, r, WILD, { turns: STICKY_TURNS });
        }
      }
    }
  });

  // Scripted: alternate between a wild landing on reel 2 and reel 3.
  const wildColumn = [2, 3];
  let spinCount = 0;

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () => {
      const reel = wildColumn[spinCount % wildColumn.length];
      const grid = Array.from({ length: COLS }, () =>
        Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
      );
      // Place one wild in the middle cell of the chosen column
      grid[reel][1] = WILD;
      spinCount++;
      return grid;
    },
  });
  return { reelSet };
}
