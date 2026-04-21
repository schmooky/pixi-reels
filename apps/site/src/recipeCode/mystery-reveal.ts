export default `// --- Recipe: Mystery reveal ---------------------------------------------
// Mystery (\"?\") symbols land alongside regular ones. On landed, we pick
// one symbol for the spin and snap every mystery cell to it via
// \`reel.placeSymbols()\` - no additional spin needed. Every mystery on
// the board reveals to the SAME id, which is where the drama comes from.
// ------------------------------------------------------------------------

function buildReels() {
  const MYSTERY = 'misc/mystery_1';
  const REVEAL_POOL = ['royal/royal_1', 'royal/royal_2', 'royal/royal_3'];
  const FILLER = ['round/round_1', 'round/round_2', 'round/round_3'];
  const ids = [...FILLER, ...REVEAL_POOL, MYSTERY];

  const weights: Record<string, number> = {
    'round/round_1': 18, 'round/round_2': 18, 'round/round_3': 18,
    'royal/royal_1': 10, 'royal/royal_2': 10, 'royal/royal_3': 10,
    'misc/mystery_1': 16,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .symbolData({ [MYSTERY]: { zIndex: 4 } })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  const nextResult = () =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );

  const onLanded = async (result) => {
    const pick = REVEAL_POOL[Math.floor(Math.random() * REVEAL_POOL.length)];
    // Snap every visible MYSTERY cell to the picked symbol.
    for (let c = 0; c < reelSet.reels.length; c++) {
      const column = reelSet.reels[c].getVisibleSymbols().slice();
      let changed = false;
      for (let r = 0; r < column.length; r++) {
        if (column[r] === MYSTERY) { column[r] = pick; changed = true; }
      }
      if (changed) reelSet.reels[c].placeSymbols(column);
    }
  };

  return { reelSet, nextResult, onLanded, cancel: () => reelSet.skip() };
}
`;
