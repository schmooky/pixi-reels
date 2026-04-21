export default `// --- Recipe: Texture-atlas symbols --------------------------------------
// Every sprite id comes from the prototype TexturePacker atlas the sandbox
// preloads. \`textures\` is a \`Record<id, Texture>\` keyed by the atlas
// frame name. \`blurTextures\` contains the motion-blur variants that
// BlurSpriteSymbol swaps in during spin.
// ------------------------------------------------------------------------

function buildReels() {
  // Mix the full-size symbols and a wild; try swapping any id for
  // another from \`SYMBOL_IDS\` (logged via \`console.log(SYMBOL_IDS)\`).
  const ids = [
    'round/round_1', 'round/round_2', 'round/round_3', 'round/round_4',
    'royal/royal_1', 'royal/royal_2', 'royal/royal_3', 'royal/royal_4',
    'wild/wild_1',
  ];
  const weights: Record<string, number> = {
    'round/round_1': 14, 'round/round_2': 14, 'round/round_3': 12, 'round/round_4': 12,
    'royal/royal_1': 10, 'royal/royal_2': 10, 'royal/royal_3': 8, 'royal/royal_4': 8,
    'wild/wild_1': 4,
  };

  const reelSet = new ReelSetBuilder()
    .reels(5).visibleSymbols(3)
    .symbolSize(96, 96)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const id of ids) {
        r.register(id, BlurSpriteSymbol, { textures, blurTextures });
      }
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
