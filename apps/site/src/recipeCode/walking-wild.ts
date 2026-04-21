export default `// --- Recipe: Walking wild -----------------------------------------------
// Each spin forces a wild onto a specific cell; the target column walks
// one step to the left every spin, so the wild appears to march across
// the board. All the state for the walker lives in closure vars below -
// no library hooks required.
// ------------------------------------------------------------------------

function buildReels() {
  const FILLER = ['round/round_1', 'round/round_2', 'royal/royal_1', 'square/square_1'];
  const WILD = 'wild/wild_1';
  const ids = [...FILLER, WILD];
  const weights: Record<string, number> = {
    'round/round_1': 22, 'round/round_2': 22,
    'royal/royal_1': 18, 'square/square_1': 18,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .symbolData({ [WILD]: { zIndex: 5 } })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  // Walker state: one position per spin. Starts on reel 4, middle row.
  let walkerCol = 4;
  const walkerRow = 1;

  const nextResult = () => {
    const grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );
    grid[walkerCol][walkerRow] = WILD;
    // Advance the walker one column to the left, wrap at 0.
    walkerCol = walkerCol === 0 ? 4 : walkerCol - 1;
    return grid;
  };

  return { reelSet, nextResult, cancel: () => reelSet.skip() };
}
`;
