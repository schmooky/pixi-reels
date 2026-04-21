export default `// --- Recipe: Single-reel respin -----------------------------------------
// The real feature spins only ONE reel while holding the others in place.
// The single-reelset sandbox can't express that natively, but we can
// simulate: every spin forces columns 0, 1, 3, 4 to hold their currently-
// visible symbols and only column 2 gets fresh values. Visually every
// reel still scrolls through the spin - slam-stop if you want it snappy.
// ------------------------------------------------------------------------

function buildReels() {
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2', 'wild/wild_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 22, 'round/round_2': 22, 'round/round_3': 20,
    'royal/royal_1': 16, 'royal/royal_2': 16, 'wild/wild_1': 4,
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

  const RESPIN_COL = 2;
  let firstSpin = true;

  const nextResult = () => {
    if (firstSpin) {
      firstSpin = false;
      // Seed the board with a random first spin so there's something to
      // \"hold\" when the next spin comes.
      return Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () => pickWeighted(weights)),
      );
    }
    // Subsequent spins: all other reels hold their current visible
    // symbols; only RESPIN_COL gets a fresh random column.
    const grid: string[][] = [];
    for (let c = 0; c < 5; c++) {
      if (c === RESPIN_COL) {
        grid.push(Array.from({ length: 3 }, () => pickWeighted(weights)));
      } else {
        grid.push(reelSet.reels[c].getVisibleSymbols().slice());
      }
    }
    return grid;
  };

  return { reelSet, nextResult, cancel: () => reelSet.skip() };
}
`;
