export default `// --- Recipe: Classic 5x3 ------------------------------------------------
// Five reels, three rows, a handful of sprite symbols and a wild. The
// bedrock of slot maths. Play with \`weights\` to make wilds more common,
// or change the reel/row counts to see 5x4, 6x3, etc.
// ------------------------------------------------------------------------

function buildReels() {
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2',
    'square/square_1', 'wild/wild_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 20, 'round/round_2': 20, 'round/round_3': 20,
    'royal/royal_1': 14, 'royal/royal_2': 14,
    'square/square_1': 10, 'wild/wild_1': 3,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .symbolData({ 'wild/wild_1': { zIndex: 5 } })
    .speed('normal', SpeedPresets.NORMAL)
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
