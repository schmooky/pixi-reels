import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Peek symbol from buffer-start',
  topic: 'cascade',
  tags: ['cascade', 'tumble', 'refill', 'anticipation', 'spine', 'thunderkick', 'horizontal', 'reverse', 'orientation', 'gravity'],
  height: 300,
} as const satisfies RecipeMeta;

// Peek symbol from buffer-above.
//
// Each reel has a "PEEK" symbol prefilled in the buffer-above slot. the
// one cell that lives just above the visible window. During the spin, that
// symbol scrolls through the visible area before the random spin symbols
// take over, giving the player a brief glimpse of what's "next".
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const TEASE = 'tease';
  const TEASE_CARD = { id: TEASE, color: 0xff8c42, label: 'PEEK', textColor: 0xffffff };

  // Pull three visible cards from the real CARD_DECK so the spin lands on
  // registered symbols every time.
  const CARD_IDS = CARD_DECK.map((c) => c.id);
  function rv() {
    return CARD_IDS[Math.floor(Math.random() * CARD_IDS.length)];
  }

  // ── initialFrame seeds the FIRST spin's buffer-above ────────────────────
  // Explicit ColumnTarget form. { visible, bufferStart }. Same shape that
  // setResult accepts.
  const initialFrame = [
    { visible: ['7', '8', '9'], bufferStart: [TEASE] },
    { visible: ['7', '8', '9'], bufferStart: [TEASE] },
    { visible: ['7', '8', '9'], bufferStart: [TEASE] },
  ];

  const reelSet = new ReelSetBuilder()
    .reels(3)
    .visibleCells(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .bufferSymbols(1)
    .symbols((r) => {
      for (const sym of [...CARD_DECK, WILD_CARD, TEASE_CARD]) {
        r.register(sym.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
    })
    .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 900 })
    .ticker(app.ticker)
    .initialFrame(initialFrame)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      // Land on a random grid AND re-seed the buffer-above with TEASE so the
      // next spin shows the peek again. Same explicit ColumnTarget shape used
      // for the initial frame above.
      const result = [
        { visible: [rv(), rv(), rv()], bufferStart: [TEASE] },
        { visible: [rv(), rv(), rv()], bufferStart: [TEASE] },
        { visible: [rv(), rv(), rv()], bufferStart: [TEASE] },
      ];

      const p = reelSet.spin();
      await new Promise((r) => setTimeout(r, 250));
      // `result` is already ColumnTarget[] ({ visible, bufferStart }); pass it
      // straight through. Wrapping it in `.map((visible) => ({ visible }))` would
      // nest each object and drop the bufferStart TEASE that re-seeds the peek.
      reelSet.setResult(result);
      await p;
    },
  });
  return { reelSet };
}
