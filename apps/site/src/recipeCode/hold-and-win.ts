export default `// --- Recipe: Hold & Win -------------------------------------------------
// Every coin that lands sticks; each new coin resets the respin counter
// to 3; fill the grid for the grand jackpot. When respins run out or the
// grid fills, the feature round-trips and starts over. State between
// spins lives in the \`held\` set + \`respins\` counter below.
// ------------------------------------------------------------------------

function buildReels() {
  const COIN = 'feature/feature_1';
  const FILLER = ['round/round_1', 'round/round_2', 'round/round_3', 'royal/royal_1'];
  const ids = [...FILLER, COIN];
  const weights: Record<string, number> = {
    'round/round_1': 26, 'round/round_2': 26, 'round/round_3': 22,
    'royal/royal_1': 16, 'feature/feature_1': 10,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(90, 90)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) r.register(id, BlurSpriteSymbol, { textures, blurTextures });
    })
    .weights(weights)
    .symbolData({ [COIN]: { zIndex: 8 } })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  const held = new Set<string>();
  let respins = 3;

  const nextResult = () => {
    const grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 3 }, () => pickWeighted(weights)),
    );
    // Force held cells to stay COIN.
    for (const key of held) {
      const [c, r] = key.split(',').map(Number);
      grid[c][r] = COIN;
    }
    // Any newly-landed coin becomes held.
    let newCoins = 0;
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 3; r++) {
        const key = \`\${c},\${r}\`;
        if (grid[c][r] === COIN && !held.has(key)) {
          held.add(key);
          newCoins++;
        }
      }
    }
    if (newCoins > 0) respins = 3;
    else respins--;
    // Roll the feature over when it ends - full grid or respins exhausted.
    if (respins <= 0 || held.size >= 15) {
      held.clear();
      respins = 3;
    }
    return grid;
  };

  return { reelSet, nextResult, cancel: () => reelSet.skip() };
}
`;
