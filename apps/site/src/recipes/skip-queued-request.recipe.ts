import { CARD_DECK, ReelSetBuilder, SpeedPresets, SpinTextureCache, StaticSpinSymbol } from 'pixi-reels';
import { readout, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Pressing before the server answers',
  topic: 'skip',
  tags: ['skip', 'slam', 'anticipation', 'tease', 'phases', 'timing', 'groups'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

// PRESSING BEFORE THE SERVER ANSWERS. `requestSkip()`.
//
// `skipSpin()` THROWS before `setResult()` arrives, on purpose: there is
// nothing to land on yet, and slamming would put the reels on random buffer
// fill. `requestSkip()` queues the intent instead and fires it the instant the
// result lands.
//
// The result here is deliberately slow (1.4s) so the pre-result window is easy
// to hit. Tap during it and nothing appears to happen; the slam goes off the
// moment the grid arrives - and tease protection still applies to it, because
// `setAnticipation` was called BEFORE `setResult`. That ordering is the whole
// requirement: a press queued in this window can only protect a tease the
// engine already knows about.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  // The reels spin a baked motion blur of each sticker: one cache per set, filled on the first spin.
  const cache = new SpinTextureCache({ renderer: app.renderer });
  const IDS = ['9', '10', 'J', 'Q', 'K'];
  const SCAT = 'SCAT';
  const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
  const TEASE = [3, 4];
  const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
  function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

  const reelSet = new ReelSetBuilder()
    .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const c of CARDS) {
        r.register(c.id, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
      }
      r.register(SCAT, StaticSpinSymbol, { createInner: () => new StickerSymbol({ textures }), cache, blurRampMs: 140 });
    })
    .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1200 })
    .ticker(app.ticker)
    .build();

  const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
  const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;

  const idle = 'spin, then tap IMMEDIATELY - before the result lands';
  // Grid-wide from the start, so the canvas is fitted to its final size.
  const hud = readout.plaque({ text: idle, color: 0xffcc44, minWidth: TOTAL_W, maxWidth: TOTAL_W });
  hud.position.set(0, TOTAL_H + 10);
  reelSet.addChild(hud);

  reelSet.events.on('spin:start', () => { hud.text = idle; });
  reelSet.events.on('skip:requested', ({ reels, partial }) => {
    hud.text = `queued slam fired: landed [${reels.join(', ')}]${partial ? ' - tease protected' : ''}`;
  });

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
      grid[0].visible[1] = SCAT;
      grid[1].visible[1] = SCAT;

      const p = reelSet.spin();
      // BEFORE setResult, so a press queued in the window below sees the tease.
      reelSet.setAnticipation(TEASE, { stagger: 250, protect: 'once' });
      await new Promise((r) => setTimeout(r, 1400)); // slow "server"
      reelSet.setResult(grid);
      await p;
    },
    // The canonical universal-button pattern: try the round-aware press, fall
    // back to the queue when it throws. One handler covers both windows.
    skip: () => {
      try {
        reelSet.skipSpin();
      } catch {
        reelSet.requestSkip();
        hud.text = 'too early to land - slam QUEUED until the result arrives';
      }
    },
  });
  return {
    reelSet,
    cleanup: () => { try { hud.destroy({ children: true }); } catch {} },
  };
}
