import * as PIXI from 'pixi.js';
import { CARD_DECK, ReelSetBuilder, SpeedPresets } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Staggered / sequential anticipation',
  topic: 'anticipation',
  tags: ['anticipation', 'tension', 'scatter', 'near-miss', 'spine', 'horizontal', 'reverse', 'curve', 'acceleration'],
  needs: ['hw-sprites', 'generic-symbols'],
} as const satisfies RecipeMeta;

// STAGGERED / SEQUENTIAL anticipation. With 2 scatters already showing, the
// last three reels tease ONE AFTER ANOTHER instead of all slowing at once.
// `'sequential'` holds each reel until the previous one has fully landed.
//
// Each teasing reel wears the Hold & Win anticipation glow (the same `in`→`loop`
// additive sprite burst the H&W last-cell tension uses), driven off
// the anticipation:reel / anticipation:reelEnd events.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  const IDS = ['9', '10', 'J', 'Q', 'K'];
  const SCAT = 'SCAT';
  const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
  const TEASE = [2, 3, 4];
  const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
  function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

  const reelSet = new ReelSetBuilder()
    .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const c of CARDS) {
        r.register(c.id, StickerSymbol, { textures });
      }
      // Feature / scatter symbol: id SCAT, drawn as a gold "F" card.
      r.register(SCAT, StickerSymbol, { textures });
    })
    .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 550 })
    .ticker(app.ticker)
    .build();

  // ── Hold & Win anticipation glow, reused over each teasing reel ──
  const antSheet = await PIXI.Assets.load<PIXI.Spritesheet>('/hw-sprites/anticipation.json');
  const antFrames = (pre: string) => Object.entries(antSheet.textures)
    .filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
  const ANT_IN = antFrames('in/'), ANT_LOOP = antFrames('loop/');
  const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

  const glowLayer = new PIXI.Container();
  reelSet.addChild(glowLayer); // child of the reel set → inherits its transform
  const glows = new Map();
  const stopGlow = (i: number) => { const g = glows.get(i); if (g) { try { g.destroy(); } catch {} glows.delete(i); } };
  const startGlow = (i: number) => {
    stopGlow(i);
    const g = new PIXI.AnimatedSprite(ANT_IN.length ? ANT_IN : ANT_LOOP);
    g.anchor.set(0.5);
    g.position.set(i * (SIZE + GAP) + SIZE / 2, TOTAL_H / 2);
    g.width = g.height = SIZE * 2.0; // concentrated burst, like the H&W cell glow
    g.blendMode = 'add';                              // additive → reads as light
    g.animationSpeed = 0.5; g.loop = false;
    g.onComplete = () => { if (ANT_LOOP.length) { g.textures = ANT_LOOP; g.loop = true; g.play(); } };
    glowLayer.addChild(g); g.play();
    glows.set(i, g);
  };

  // The dedicated anticipation events fire ONLY for teasing reels, so no manual
  // gating is needed. `order` / `total` are here too if you want a pitch ramp.
  reelSet.events.on('anticipation:reel', ({ reelIndex }) => startGlow(reelIndex));
  reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => stopGlow(reelIndex));
  reelSet.events.on('spin:complete', () => { for (const i of [...glows.keys()]) stopGlow(i); });

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      // 2 scatters on reels 0 and 1 → the last three reels are all live.
      const grid = [
        { visible: [rv(), SCAT, rv()] },
        { visible: [rv(), SCAT, rv()] },
        { visible: [rv(), rv(), rv()] },
        { visible: [rv(), rv(), rv()] },
        { visible: [rv(), rv(), rv()] },
      ];

      const p = reelSet.spin();
      await new Promise((r) => setTimeout(r, 220));
      reelSet.setResult(grid);
      // Each reel waits until the previous anticipation reel has LANDED.
      reelSet.setAnticipation(TEASE, 'sequential');
      await p;
    },
  });
  return {
    reelSet,
    cleanup: () => { for (const i of [...glows.keys()]) stopGlow(i); try { glowLayer.destroy(); } catch {} },
  };
}
