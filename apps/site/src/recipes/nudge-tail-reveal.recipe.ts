import { CARD_DECK, ReelSetBuilder, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Nudge through a big symbol',
  topic: 'nudge',
  tags: ['nudge', 'stagger', 'spotlight', 'big-symbols', 'abort', 'skip', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// TAIL-REVEAL pattern.
//
// Big symbol lands fully visible. We nudge it UP by 1 so the anchor
// crosses into bufferStart. only the bottom cell of the block
// remains in the visible window ("tail visible"). The engine's
// `_finalizeFrame` sizes the anchor to span the whole block even
// though it lives above visible, so the visible portion renders as
// the bottom of the sprite, masked at the top edge.
//
// A beat later we nudge DOWN by 1 to bring the full block back into
// view. Tail in bufferStart. nudge to reveal.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const MEGA = { id: 'mega', color: 0xff8c42, label: 'MEGA', textColor: 0x4a1d00, w: 1, h: 2 };
  const set = await createAssets().genericSymbols();
  // The block wears a framed sticker; the deck's ids map onto the set.
  const { frames } = set;
  const textures = { ...set.textures, [MEGA.id]: set.textures.H1 };
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const REELS = 5;
  const ROWS = 3;
  const SIZE = 80;
  const GAP = 4;

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleCells(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(GAP, GAP)
    .symbols((registry) => {
      for (const card of CARD_DECK) {
        registry.register(card.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
      registry.register(MEGA.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures, frames, span: { reels: MEGA.w, cells: MEGA.h } }), cache, blurRampMs: 140 });
    })
    .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
    .symbolData({ [MEGA.id]: { weight: 0, zIndex: 5, size: { reels: MEGA.w, cells: MEGA.h } } })
    .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
    .ticker(app.ticker)
    .build();

  const FILLER_IDS = ['7', '8', '9', '10', 'J'];
  const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
  const col3 = () => [filler(), filler(), filler()];

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      // 1. Land 1x2 MEGA anchored at column 2, cell 0. Block fills cells 0+1.
      const grid = [col3(), col3(), [MEGA.id, MEGA.id, filler()], col3(), col3()];
      const p = reelSet.spin();
      await new Promise((r) => setTimeout(r, 220));
      reelSet.setResult(grid.map((visible) => ({ visible })));
      await p;
      await new Promise((r) => setTimeout(r, 500));

      // 2. Nudge UP by 1. anchor at strip[1] → strip[0] (bufferStart).
      //    Stub follows: strip[2] → strip[1] (visible cell 0).
      //    Block is now "tail visible": top in bufferStart (clipped), bottom
      //    showing at cell 0. `_finalizeFrame` sizes the anchor sprite to the
      //    full block height; the mask clips the half above visible.
      await reelSet.nudge(2, {
        distance: 1,
        direction: 'reverse',
        incoming: [filler()],
        duration: 540,
      });
      await new Promise((r) => setTimeout(r, 800));

      // 3. Nudge DOWN by 1 to fully reveal the block at cells 0+1 again.
      //    The classic "nudge to reveal the wild" beat.
      await reelSet.nudge(2, {
        distance: 1,
        direction: 'forward',
        incoming: [filler()],
        duration: 540,
      });
    },
  });
  return { reelSet };
}
