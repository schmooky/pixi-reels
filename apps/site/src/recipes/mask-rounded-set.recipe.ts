import { SilkGraphics } from 'pixi-silk';
import { CARD_DECK, ReelSetBuilder, RoundedRectMaskStrategy, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { readout, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'A rounded window',
  topic: 'masks',
  tags: ['mask', 'rounded', 'silhouette', 'pyramid', 'jagged', 'frame'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

// ROUNDED WINDOW AROUND THE WHOLE GRID.
//
// The default `RectMaskStrategy` clips each reel to a hard rectangle. That is
// invisible under frame art with square corners and painfully visible under
// frame art with round ones: the mask corner pokes out past the artwork.
//
// `scope: 'set'` (the default) rounds the four corners of the union bounding
// box. Every reel inside stays one flush block, so this is safe at any cross
// gap - which is exactly why it is the default.
//
// Press spin to watch symbols get clipped by the rounded corners on the way
// past. The outline is drawn on the SAME geometry the mask uses, so you can
// see where the clip actually is.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const IDS = ['9', '10', 'J', 'Q', 'K'];
  const REELS = 5, ROWS = 3, SIZE = 80, GAP = 0;
  const RADIUS = 28;
  const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
  function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

  const reelSet = new ReelSetBuilder()
    .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const c of CARDS) {
        r.register(c.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .maskStrategy(new RoundedRectMaskStrategy({ radius: RADIUS }))
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 140 })
    .ticker(app.ticker)
    .build();

  const W = REELS * SIZE + (REELS - 1) * GAP;
  const H = ROWS * SIZE + (ROWS - 1) * GAP;

  // Trace the mask boundary so the clip is legible without a screenshot diff.
  // SilkGraphics rounds with true circular corners, the same curve the mask
  // cuts, and keeps the line smooth at whatever scale the demo is fitted to.
  const outline = new SilkGraphics();
  outline.roundRect(0, 0, W, H, RADIUS).stroke({ width: 2, color: 0x6ad0ff, alpha: 0.9 });
  reelSet.addChild(outline);

  // Grid-wide, one row per part, so it never wraps mid-expression.
  const hud = readout.plaque({
    text: `RoundedRectMaskStrategy({ radius: ${RADIUS} })\nscope 'set' (default)`,
    minWidth: W,
    maxWidth: W,
  });
  hud.position.set(0, H + 10);
  reelSet.addChild(hud);

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
      const p = reelSet.spin();
      await new Promise((r) => setTimeout(r, 380));
      reelSet.setResult(grid);
      await p;
    },
  });
  return {
    reelSet,
    cleanup: () => {
      try { outline.destroy(); } catch {}
      try { hud.destroy({ children: true }); } catch {}
    },
  };
}
