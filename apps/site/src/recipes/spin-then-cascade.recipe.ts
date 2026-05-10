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

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 5, ROWS = 3, SIZE = 80;
const HIT_COLS = [0, 1, 2];                     // left three columns
const HIT_ROW = 1;                              // middle row
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

    // Stage 1 — '10's vanish on the middle row. Survivors fall: the Js
    // at row 0 fall to row 1, creating cluster #2. New random symbols
    // drop in at row 0. Cols 3-4 (0-indexed) are unchanged — they
    // weren't part of the cluster, so cascadeLoop's no-winners-skip
    // path leaves them completely alone.
    const stage1 = stage0.map((col, c) => {
      if (!HIT_COLS.includes(c)) return [...col];
      return [
        randSymbolNotIn(new Set([TRIGGER1, TRIGGER2])), // row 0: new
        TRIGGER2,                                        // row 1: 'J' falls in
        col[2],                                          // row 2: untouched
      ];
    });

    // Stage 2 — 'J's vanish on the middle row. Survivors fall, new
    // randoms drop in at row 0. No further cluster — chain ends.
    const stage2 = stage1.map((col, c) => {
      if (!HIT_COLS.includes(c)) return [...col];
      return [
        randSymbolNotIn(new Set([TRIGGER1, TRIGGER2])), // row 0: new
        col[0],                                          // row 1: stage-1's row-0 fills in
        col[2],                                          // row 2: untouched
      ];
    });

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
