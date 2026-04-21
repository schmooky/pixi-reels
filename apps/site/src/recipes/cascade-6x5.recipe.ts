// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted,
//           runCascade (cascade sequence helper)

const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3',
  'royal/royal_1', 'royal/royal_2', 'square/square_1',
];
const REELS = 6, ROWS = 4, SIZE = 72;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    const CLUSTER = 'royal/royal_1';
    const HIT_ROW = 2;
    const HIT_COLS = [0, 1, 2];

    // Stage 0: cluster of CLUSTER on row 2, cols 0–2.
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER)
      )
    );

    // Stage 1: winners removed, survivors fall one row, new symbols fill top.
    const stage1 = stage0.map((col, c) => {
      if (!HIT_COLS.includes(c)) return [...col];
      const next = [...col];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = randSymbol(CLUSTER);
      return next;
    });

    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 180));
    reelSet.setResult(stage0);
    await p;
    await new Promise(r => setTimeout(r, 300));

    await runCascade(reelSet, [stage0, stage1], {
      winners: () => HIT_COLS.map(c => ({ reel: c, row: HIT_ROW })),
      vanishDuration: 300,
      dropDuration: 420,
      pauseBetween: 120,
    });
  },
};
