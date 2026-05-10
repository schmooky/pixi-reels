// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, WILD_CARD,
//           DropRecipes, PIXI, gsap, app, runCascade, pickWeighted

// Hybrid spin-then-cascade: the FIRST round of every play spins like a
// classic strip slot (top-to-bottom motion, START → SPIN → STOP). The
// landing has a winning cluster — those cells pop, survivors fall down,
// and new symbols drop in from above to fill the gap. Repeat for each
// chain.
//
// IMPLEMENTATION NOTE — the cascade is a VISUAL animation done by
// runCascade, NOT a second spin() call. runCascade operates directly
// on the landed grid: vanishes the winning cells, slides survivors
// down, drops in new symbols from above. The reels never re-spin.
// That's exactly what the user sees in real cascade slots — the
// reels stay landed and the symbols rearrange themselves.
//
// We don't even need .cascade() on the builder — that's only required
// if you want to call spin({ mode: 'cascade' }) for a full cascade
// drop-in respin. Pure spin-then-tumble doesn't touch the spin-mode
// system at all.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 5, ROWS = 3, SIZE = 80;

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
    // ── Stage 0: strip-spin landing ───────────────────────────────────
    // Force a 3-of-a-kind cluster of '10' on row 1 (cols 1, 2, 3) so
    // the demo always has a visible cascade trigger. Real games would
    // detect winners from the server-returned grid via your eval logic.
    const TRIGGER1 = '10';
    const HIT1_ROW = 1;
    const HIT1_COLS = [1, 2, 3];

    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT1_ROW && HIT1_COLS.includes(c) ? TRIGGER1 : randSymbolNotIn(new Set([TRIGGER1])),
      ),
    );

    // ── Stage 1: after the '10' cluster pops + survivors fall + fill ──
    // Hand-crafted so the new top-row fill happens to create a SECOND
    // cluster — three Js on row 2 (cols 0, 1, 2) — to demonstrate the
    // chain. In production this is whatever the cascade evaluator says.
    const TRIGGER2 = 'J';
    const HIT2_ROW = 2;
    const HIT2_COLS = [0, 1, 2];

    const stage1 = stage0.map((col, c) => {
      const next = [...col];
      // Hit-1 columns: drop the row-1 winner — survivor at row 0 falls
      // to row 1, brand-new symbol arrives at row 0.
      if (HIT1_COLS.includes(c)) {
        next[HIT1_ROW] = next[HIT1_ROW - 1];        // survivor falls in
        next[HIT1_ROW - 1] = randSymbolNotIn(new Set([TRIGGER1, TRIGGER2])); // new top
      }
      // Plant the second cluster on row 2 (cols 0, 1, 2). For col 0
      // (untouched by hit 1) and cols 1,2 (touched), we just rewrite
      // row 2 to TRIGGER2 — the cascade animator only diffs winners
      // between stages, so authoring a rewrite is fine.
      if (HIT2_COLS.includes(c)) next[HIT2_ROW] = TRIGGER2;
      return next;
    });

    // ── Stage 2: after the 'J' cluster pops + survivors fall + fill ───
    const stage2 = stage1.map((col, c) => {
      if (!HIT2_COLS.includes(c)) return [...col];
      const next = [...col];
      // Survivors fall: row 0 → row 1, row 1 → row 2; brand-new at row 0.
      next[HIT2_ROW] = next[HIT2_ROW - 1];
      next[HIT2_ROW - 1] = next[HIT2_ROW - 2];
      next[0] = randSymbolNotIn(new Set([TRIGGER1, TRIGGER2]));
      return next;
    });

    // ── Round 1: strip-spin to stage 0 ────────────────────────────────
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(stage0);
    await p;
    await new Promise((r) => setTimeout(r, 300));

    // ── Cascade chain: stage 0 → 1 → 2, two pops in sequence ──────────
    // runCascade plays the animation: vanish the winners, drop survivors,
    // drop new symbols in from above. No spin, no full-frame reset — the
    // landed reels stay landed and rearrange.
    await runCascade(reelSet, [stage0, stage1, stage2], {
      winners: (_prev, _next, stageIndex) => {
        if (stageIndex === 0) return HIT1_COLS.map((c) => ({ reel: c, row: HIT1_ROW }));
        return HIT2_COLS.map((c) => ({ reel: c, row: HIT2_ROW }));
      },
      vanishDuration: 320,
      dropDuration: 440,
      pauseBetween: 160,
    });
  },
};
