export default `// --- Recipe: Remove symbol ----------------------------------------------
// Find a left-anchored win after every spin and blank those cells out
// via placeSymbols with a neutral filler. Combined with CascadeMode's
// scroll animation (not used here) you get the core of a cluster or
// tumble engine: wins vanish, new ones would fill in, chain continues.
// ------------------------------------------------------------------------

function buildReels() {
  const EMPTY = 'misc/frame_1';
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2', 'wild/wild_1', EMPTY,
  ];
  const weights: Record<string, number> = {
    'round/round_1': 20, 'round/round_2': 20, 'round/round_3': 20,
    'royal/royal_1': 14, 'royal/royal_2': 14, 'wild/wild_1': 6,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .symbolData({ 'wild/wild_1': { zIndex: 5 }, [EMPTY]: { zIndex: 0 } })
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
    // Every other spin, force a visible 3-of-a-kind so the remove step
    // has something to do.
    if (spinCount % 2 === 0) {
      const winSym = 'royal/royal_1';
      for (let c = 0; c < 4; c++) grid[c][1] = winSym;
    }
    return grid;
  };

  const onLanded = async (result) => {
    const WILD = 'wild/wild_1';
    for (let row = 0; row < 3; row++) {
      const first = result.symbols[0][row];
      if (!first || first === WILD || first === EMPTY) continue;
      let count = 1;
      for (let c = 1; c < result.symbols.length; c++) {
        const s = result.symbols[c][row];
        if (s === first || s === WILD) count++;
        else break;
      }
      if (count >= 3) {
        await new Promise((r) => setTimeout(r, 250));
        for (let c = 0; c < count; c++) {
          const col = reelSet.reels[c].getVisibleSymbols().slice();
          col[row] = EMPTY;
          reelSet.reels[c].placeSymbols(col);
        }
      }
    }
  };

  return { reelSet, nextResult, onLanded, cancel: () => reelSet.skip() };
}
`;
