export default `// --- Recipe: Symbol transform -------------------------------------------
// Win detection upgrades low-pay symbols to the next tier. When a 3+
// left-anchored run lands on a \"round\" symbol, those cells morph into
// the corresponding \"royal\" via reel.placeSymbols after the land.
// ------------------------------------------------------------------------

function buildReels() {
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2', 'royal/royal_3',
    'wild/wild_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 22, 'round/round_2': 22, 'round/round_3': 20,
    'royal/royal_1': 10, 'royal/royal_2': 10, 'royal/royal_3': 10,
    'wild/wild_1': 6,
  };

  const UPGRADE: Record<string, string> = {
    'round/round_1': 'royal/royal_1',
    'round/round_2': 'royal/royal_2',
    'round/round_3': 'royal/royal_3',
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

  let spinCount = 0;
  const nextResult = () => {
    spinCount++;
    const grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );
    // Guarantee a winnable row every 2 spins so upgrades are visible.
    if (spinCount % 2 === 0) {
      const base = 'round/round_1';
      for (let c = 0; c < 3; c++) grid[c][1] = base;
    }
    return grid;
  };

  const onLanded = async (result) => {
    const WILD = 'wild/wild_1';
    for (let row = 0; row < 3; row++) {
      const first = result.symbols[0][row];
      if (!first || first === WILD || !UPGRADE[first]) continue;
      let count = 1;
      for (let c = 1; c < result.symbols.length; c++) {
        const s = result.symbols[c][row];
        if (s === first || s === WILD) count++;
        else break;
      }
      if (count >= 3) {
        // Upgrade each winning cell to the next tier via placeSymbols.
        const upgraded = UPGRADE[first];
        for (let c = 0; c < count; c++) {
          const col = reelSet.reels[c].getVisibleSymbols().slice();
          col[row] = upgraded;
          reelSet.reels[c].placeSymbols(col);
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  };

  return { reelSet, nextResult, onLanded, cancel: () => reelSet.skip() };
}
`;
