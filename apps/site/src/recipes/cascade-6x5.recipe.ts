// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, WILD_CARD,
//           PIXI, gsap, app, pickWeighted,
//           runCascade (cascade sequence helper)

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 6, ROWS = 4, SIZE = 72;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in',  rowStagger: 60 },
    dropIn: { duration: 450, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
  })
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    const CLUSTER = '10';
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

    // Initial spin: symbols drop in left-to-right
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setDropOrder('ltr');
    reelSet.setResult(stage0);
    await p;
    await new Promise(r => setTimeout(r, 300));

    // Cascade tumble: vanish winners, survivors fall, new symbols drop from above
    await runCascade(reelSet, [stage0, stage1], {
      winners: () => HIT_COLS.map(c => ({ reel: c, row: HIT_ROW })),
      vanishDuration: 300,
      dropDuration: 420,
      pauseBetween: 120,
    });
  },
};
