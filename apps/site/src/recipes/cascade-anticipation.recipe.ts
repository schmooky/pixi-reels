// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpriteSymbol, DropRecipes,
//           PIXI, gsap, app, textures

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2',
];
const SCATTER = 'feature/feature_1';
const ALL_IDS = [...IDS, SCATTER];
const REELS = 5, ROWS = 4, SIZE = 72;

function rand() {
  return IDS[Math.floor(Math.random() * IDS.length)];
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of ALL_IDS) r.register(id, SpriteSymbol, { textures }); })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .cascade(DropRecipes.stiffDrop)
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    // Scatters on reels 0, 2, and 4 (reel 4 is the payoff).
    const grid = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        if ((c === 0 || c === 2 || c === 4) && r === 1) return SCATTER;
        return rand();
      })
    );

    const p = reelSet.spin();

    // All 6 columns fall out simultaneously.
    // Reels 0-3 and 5 refill immediately.
    // Reel 4 sits empty for 2.5 s — player sees 2 confirmed scatters,
    // then the grid snaps back with just one hole left.
    // Reel 4 finally drops in, revealing the winning 3rd scatter.
    reelSet.setDropOrder([0, 0, 0, 0, 2500, 0]);
    reelSet.setResult(grid);
    await p;
  },
};
