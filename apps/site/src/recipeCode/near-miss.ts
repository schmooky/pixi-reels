export default `// --- Recipe: Near miss --------------------------------------------------
// Variant of the anticipation recipe, tuned for the classic \"2 scatters
// landed, reel 5 hangs, then... no\" moment. We force a near-miss grid
// every ~3 spins so you can feel the tease without waiting for chance.
// ------------------------------------------------------------------------

function buildReels() {
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2', 'bonus/bonus_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 24, 'round/round_2': 24, 'round/round_3': 20,
    'royal/royal_1': 14, 'royal/royal_2': 14, 'bonus/bonus_1': 4,
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
    .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1400 })
    .speed('turbo', { ...SpeedPresets.TURBO, anticipationDelay: 1000 })
    .ticker(app.ticker)
    .build();

  let spinCount = 0;

  const nextResult = () => {
    spinCount++;
    const grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );
    // Every 3rd spin, guarantee a near-miss: 2 bonuses on reels 0 and 1,
    // guaranteed non-bonus on reel 4. Then anticipate on the last reel.
    if (spinCount % 3 === 0) {
      grid[0][1] = 'bonus/bonus_1';
      grid[1][1] = 'bonus/bonus_1';
      grid[4] = grid[4].map((s) => s === 'bonus/bonus_1' ? 'round/round_1' : s);
      reelSet.setAnticipation([4]);
    }
    return grid;
  };

  return { reelSet, nextResult, cancel: () => reelSet.skip() };
}
`;
