import { CARD_DECK, ReelSetBuilder, SpeedPresets } from 'pixi-reels';
import { readout, tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'No hold, no tease, nothing to protect',
  topic: 'skip',
  tags: ['skip', 'slam', 'anticipation', 'tease', 'phases', 'timing', 'groups'],
  needs: ['generic-symbols'],
} as const satisfies RecipeMeta;

// PROTECTION IS INERT WHEN THERE IS NO TEASE.
//
// Turbo and SuperTurbo set `anticipationDelay: 0`, so anticipation does not
// play on those profiles at all. Protecting a tease that never happens would
// stall the reels for nothing AND put back the response-time tell the feature
// exists to remove - so with an effective hold of `0` ms, `protect` does
// nothing and every press lands everything.
//
// Spins here alternate on the SAME turbo profile, with the same `protect`:
//   even - no `duration` override -> hold is 0 -> one press ends the spin
//   odd  - `duration: 900`        -> the tease plays -> protection engages
//
// So the rule is not "turbo disables protection", it is "no hold, no tease,
// nothing to protect". Pass `duration` when you want the tease in turbo too.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
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
        r.register(c.id, StickerSymbol, { textures });
      }
      r.register(SCAT, StickerSymbol, { textures });
    })
    // SuperTurbo timings under the default profile name. only one profile is
    // registered here, and the builder's `initialSpeed` is `'normal'`, so
    // registering it as `'turbo'` alone would fail validation at `build()`.
    .speed('normal', { ...SpeedPresets.SUPER_TURBO, name: 'normal', minimumSpinTime: 1200 })
    .ticker(app.ticker)
    .build();

  const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
  const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;
  // Grid-wide and two rows tall from the start (every press line takes two), so
  // the canvas is fitted to its final size.
  const hud = readout.plaque({
    text: 'spin, then tap.\nalternate spins add a duration override',
    color: 0xffcc44,
    minWidth: TOTAL_W,
    maxWidth: TOTAL_W,
  });
  hud.position.set(0, TOTAL_H + 10);
  reelSet.addChild(hud);

  let spinNo = 0;
  let overridden = false;
  reelSet.events.on('skip:requested', ({ reels, partial }) => {
    hud.text = overridden
      ? `duration: 900 -> tease plays,\npress landed [${reels.join(', ')}]${partial ? ' only' : ''}`
      : `hold 0ms -> no tease to protect,\npress landed [${reels.join(', ')}]`;
  });

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      overridden = spinNo++ % 2 === 1;
      const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
      grid[0].visible[1] = SCAT;
      grid[1].visible[1] = SCAT;

      const p = reelSet.spin();
      // Same call, same protect. only `duration` differs.
      reelSet.setAnticipation(TEASE, overridden
        ? { stagger: 200, protect: 'once', duration: 900 }
        : { stagger: 200, protect: 'once' });
      await new Promise((r) => setTimeout(r, 250));
      reelSet.setResult(grid);
      await p;
    },
    skip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  });
  return {
    reelSet,
    cleanup: () => { try { hud.destroy({ children: true }); } catch {} },
  };
}
