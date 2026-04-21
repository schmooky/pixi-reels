export default `// --- Recipe: Sticky wild ------------------------------------------------
// Any wild that lands stays in place for the next spin. After five spins
// the sticky set auto-clears so the board doesn't saturate. The closure
// variable \`stuck\` holds \`"col,row"\` keys between spins.
// ------------------------------------------------------------------------

function buildReels() {
  const FILLER = ['round/round_1', 'round/round_2', 'round/round_3', 'royal/royal_1', 'royal/royal_2'];
  const WILD = 'wild/wild_1';
  const ids = [...FILLER, WILD];
  const weights: Record<string, number> = {
    'round/round_1': 22, 'round/round_2': 22, 'round/round_3': 20,
    'royal/royal_1': 14, 'royal/royal_2': 14, 'wild/wild_1': 8,
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

  const stuck = new Set<string>();
  let spinsSinceReset = 0;

  const nextResult = () => {
    spinsSinceReset++;
    const grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );
    // Re-apply everything already sticky.
    for (const key of stuck) {
      const [c, r] = key.split(',').map(Number);
      grid[c][r] = WILD;
    }
    // Anything new that landed as WILD becomes sticky for next spin.
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 3; r++) {
        if (grid[c][r] === WILD) stuck.add(\`\${c},\${r}\`);
      }
    }
    // Reset every 5 spins so the feature plays out and restarts.
    if (spinsSinceReset >= 5) { stuck.clear(); spinsSinceReset = 0; }
    return grid;
  };

  return { reelSet, nextResult, cancel: () => reelSet.skip() };
}
`;
