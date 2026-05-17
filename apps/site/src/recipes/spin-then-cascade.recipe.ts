// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, WILD_CARD,
//           PIXI, gsap, app, pickWeighted

// Hybrid spin-then-cascade: round 1 spins like a classic strip slot
// (top-to-bottom motion, START → SPIN → STOP). The landing has a
// winning cluster — those cells pop, survivors fall, new symbols drop
// in from above. Each pop is a `reelSet.refill(...)` call driven by
// `reelSet.runCascade({ detectWinners, nextGrid })`, NOT a re-spin.
//
// IMPORTANT recipe-design note: the chain only ever touches the LEFT
// THREE columns. Cols 4 and 5 land during the strip-spin and STAY
// UNTOUCHED for the rest of the play. That's deliberate — `runCascade`
// detects winners per-grid each round; only the columns that have
// winning cells animate. Real games typically chain across overlapping
// clusters; here we keep the demo's affected area visually contiguous.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 5, ROWS = 5, SIZE = 64;
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
  // Cascade refills layer on top of a standard strip-spin: leave the
  // builder's default mode as 'standard' for the first spin, and the
  // refill chain below uses `reelSet.refill()` directly (which doesn't
  // need `.tumble()` for the strip-spin landing itself).
  .tumble({
    fall:   { duration: 0, ease: 'none', rowStagger: 0 },              // not used — refill skips fall
    dropIn: { duration: 360, ease: 'back.out(1.6)', rowStagger: 0, distance: 'perHole' },
  })
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

    // Round 1: classic strip-spin lands on stage 0.
    const p = reelSet.spin({ mode: 'standard' });
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(stage0);
    await p;
    await new Promise((r) => setTimeout(r, 300));

    // Cascade chain — driven by `reelSet.runCascade({...})`. The library
    // owns the detect → destroy → pause → refill loop and emits
    // `cascade:round:end` when no more winners are found. Game-rule
    // callbacks: `detectWinners` (cells whose symbol id matches the
    // current trigger) and `nextGrid` (post-gravity grid via the helper).
    reelSet.setDropOrder('all');

    let trigger = TRIGGER1;
    await reelSet.runCascade({
      detectWinners: (grid) => HIT_COLS
        .map((c) => grid[c][HIT_ROW] === trigger ? { reel: c, row: HIT_ROW } : null)
        .filter(Boolean),
      nextGrid: (prev, winners) => {
        const fill = randSymbolNotIn(new Set([TRIGGER1, TRIGGER2]));
        const out = prev.map((col, c) =>
          winners.some((w) => w.reel === c)
            ? dropAtHitRow(col, fill)
            : [...col],
        );
        // After popping the 10s, the next trigger is the J that just
        // fell into HIT_ROW. Real games would compute this from the
        // post-refill grid via `detectWinners` again — we hard-step it
        // so the demo is unmistakable.
        trigger = trigger === TRIGGER1 ? TRIGGER2 : '__none__';
        return out;
      },
      pauseAfterDestroyMs: 160,
    });
  },
};
