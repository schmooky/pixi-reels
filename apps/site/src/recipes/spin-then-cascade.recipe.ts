// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, WILD_CARD,
//           DropRecipes, PIXI, gsap, app, runCascade, pickWeighted

// Hybrid spin-then-cascade: round 1 spins like a classic strip slot
// (top-to-bottom motion, START → SPIN → STOP). The landing has a
// winning cluster — those cells pop, survivors fall, new symbols drop
// in from above. The new top-row fill happens to create a SECOND
// cluster, so we cascade again. Each cascade pop is purely visual
// (runCascade), not a re-spin — the landed reels stay landed.
//
// IMPORTANT recipe-design note: the chain only ever touches the LEFT
// THREE columns (cols 1-3 if you count from 1). Cols 4 and 5 land
// during the strip-spin and STAY UNTOUCHED for the rest of the play.
// That's deliberate — it makes the cascade chain unmistakable to the
// reader. Real games typically chain across overlapping clusters; here
// we keep the demo's affected area visually contiguous.

// 5 reels x 4 rows — matches the Arc Lord shape shown in the reference
// clip above. The cascade chain pops the upper-middle row twice on the
// left three columns; the two right columns and bottom two rows stay
// completely still throughout the chain.
const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 5, ROWS = 4, SIZE = 72;
const HIT_COLS = [0, 1, 2];                     // left three columns
const HIT_ROW = 1;                              // upper-middle row
const TRIGGER1 = '10';
const TRIGGER2 = 'J';

function randSymbolNotIn(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; }
  while (exclude.has(s));
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, {
          color: sym.color, label: sym.label, textColor: sym.textColor,
        });
      }
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120 })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    // Stage 0 — strip-spin lands here. Force the left-three columns to
    // stack: TRIGGER2 ('J') at row 0, TRIGGER1 ('10') at row 1, random
    // elsewhere. The Js at row 0 are pre-positioned so that AFTER the
    // first cascade pops the 10s, the Js fall into row 1 — creating a
    // NEW cluster of three Js without any extra authoring.
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        if (HIT_COLS.includes(c)) {
          if (r === 0)        return TRIGGER2;  // 'J' on top — future cascade-2 cluster
          if (r === HIT_ROW)  return TRIGGER1;  // '10' in middle — current cluster
        }
        return randSymbolNotIn(new Set([TRIGGER1, TRIGGER2]));
      }),
    );

    // Cascade gravity helper: when the cell at HIT_ROW vanishes, every
    // cell above it falls down by one row, and a brand-new symbol fills
    // the top slot. Cells BELOW HIT_ROW stay put.
    const dropAtHitRow = (col, fillTop) => {
      const next = [...col];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = fillTop;
      return next;
    };

    // Stage 1 — '10's vanish at HIT_ROW. Survivors fall: the Js at row
    // 0 fall into HIT_ROW, creating cluster #2. New random symbols
    // drop in at row 0. Cols 3-4 (0-indexed) and rows below HIT_ROW
    // are unchanged — cascadeLoop's no-winners-skip path leaves them
    // completely alone.
    const stage1 = stage0.map((col, c) =>
      HIT_COLS.includes(c)
        ? dropAtHitRow(col, randSymbolNotIn(new Set([TRIGGER1, TRIGGER2])))
        : [...col],
    );

    // Stage 2 — 'J's vanish at HIT_ROW. Stage-1's row-0 (a random)
    // falls into HIT_ROW; new random at row 0. No further cluster.
    const stage2 = stage1.map((col, c) =>
      HIT_COLS.includes(c)
        ? dropAtHitRow(col, randSymbolNotIn(new Set([TRIGGER1, TRIGGER2])))
        : [...col],
    );

    // Round 1: classic strip-spin lands on stage 0.
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(stage0);
    await p;
    await new Promise((r) => setTimeout(r, 300));

    // Cascade chain: stage 0 → 1 → 2, popping the middle row twice.
    // Both pops happen on the same three columns (HIT_COLS); cols 3-4
    // never animate because cascadeLoop skips reels with no winners
    // and unchanged symbols.
    await runCascade(reelSet, [stage0, stage1, stage2], {
      winners: () => HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW })),
      vanishDuration: 320,
      dropDuration: 440,
      pauseBetween: 160,
    });
  },
};
