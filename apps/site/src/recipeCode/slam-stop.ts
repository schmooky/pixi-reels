export default `// --- Recipe: Slam stop --------------------------------------------------
// Click Spin, then click again while the reels are moving. The button
// switches to a Stop icon mid-spin and calls \`reelSet.skip()\` for you.
// The profile below uses a longer \`minimumSpinTime\` so the slam is
// more obviously felt.
// ------------------------------------------------------------------------

function buildReels() {
  const ids = [
    'round/round_1', 'round/round_2',
    'royal/royal_1', 'royal/royal_2',
    'square/square_1', 'wild/wild_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 24, 'round/round_2': 24,
    'royal/royal_1': 18, 'royal/royal_2': 18,
    'square/square_1': 12, 'wild/wild_1': 4,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 1800 })
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  const nextResult = () =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );

  return { reelSet, nextResult, cancel: () => reelSet.skip() };
}
`;
