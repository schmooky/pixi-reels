export default `// --- Recipe: Anticipate a reel ------------------------------------------
// If the target grid is about to land 2+ bonus symbols on reels 0-2,
// tell the library to dramatically slow reels 3 and 4 before they stop -
// the classic \"tease\" on the last reel. The anticipation delay below is
// tuned to feel a beat longer than the usual stagger.
// ------------------------------------------------------------------------

function buildReels() {
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2', 'bonus/bonus_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 22, 'round/round_2': 22, 'round/round_3': 20,
    'royal/royal_1': 14, 'royal/royal_2': 14, 'bonus/bonus_1': 8,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .symbolData({ 'bonus/bonus_1': { zIndex: 6 } })
    .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1200 })
    .speed('turbo', { ...SpeedPresets.TURBO, anticipationDelay: 900 })
    .ticker(app.ticker)
    .build();

  const nextResult = () => {
    const grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );
    // Count bonuses on reels 0..2 in the about-to-land grid.
    let earlyBonuses = 0;
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) {
        if (grid[c][r] === 'bonus/bonus_1') earlyBonuses++;
      }
    }
    if (earlyBonuses >= 2) reelSet.setAnticipation([3, 4]);
    return grid;
  };

  return { reelSet, nextResult, cancel: () => reelSet.skip() };
}
`;
