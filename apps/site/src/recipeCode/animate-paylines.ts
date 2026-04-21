export default `// --- Recipe: Animate paylines -------------------------------------------
// Land a grid, detect any left-anchored 3+ runs, and cycle them through
// SymbolSpotlight for a dim-the-losers reveal. The spotlight helper lives
// on \`reelSet.spotlight\` and handles the cross-fade for you.
// ------------------------------------------------------------------------

function buildReels() {
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3',
    'royal/royal_1', 'royal/royal_2', 'wild/wild_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 20, 'round/round_2': 20, 'round/round_3': 18,
    'royal/royal_1': 14, 'royal/royal_2': 14, 'wild/wild_1': 4,
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

  const WILD = 'wild/wild_1';
  let spinCount = 0;

  // Every 2nd spin, force a guaranteed 3-in-a-row win so the spotlight
  // animation has something to chew on.
  const nextResult = () => {
    spinCount++;
    const grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );
    if (spinCount % 2 === 0) {
      const winSym = 'royal/royal_1';
      for (let c = 0; c < 3; c++) grid[c][1] = winSym;
    }
    return grid;
  };

  const onLanded = async (result) => {
    const wins: { positions: { reelIndex: number; rowIndex: number }[] }[] = [];
    for (let row = 0; row < 3; row++) {
      const first = result.symbols[0][row];
      if (!first || first === WILD) continue;
      let count = 1;
      for (let c = 1; c < result.symbols.length; c++) {
        const s = result.symbols[c][row];
        if (s === first || s === WILD) count++;
        else break;
      }
      if (count >= 3) {
        wins.push({
          positions: Array.from({ length: count }, (_, i) => ({ reelIndex: i, rowIndex: row })),
        });
      }
    }
    if (wins.length) {
      await reelSet.spotlight.cycle(wins, { displayDuration: 800 });
    }
  };

  return { reelSet, nextResult, onLanded, cancel: () => reelSet.skip() };
}
`;
