// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app

// HELD-REEL RESPIN with a buffer-anchored big symbol.
//
// Classic UK fruit-machine bonus: reel 3 lands with a tall wild whose
// anchor sits in bufferAbove (only the tail of the block shows at row 0
// — "the wild is peeking in from the top"). The player gets a re-spin of
// the OTHER reels; reel 3 is held. The held reel preserves the block
// across spins because `SpinOptions.holdReels` skips START/SPIN/STOP on
// the held column — the strip array, the anchor's size, and the
// occupancy map all carry through.
//
// Sequence:
//   1. Spin all reels; land tail-visible 1x3 wild on reel 2 (column index 2).
//   2. Respin reels 0, 1, 3, 4 with `holdReels: [2]`. Reel 2 stays put
//      (block intact, tail visible).
//   3. Player nudges reel 2 down by 2 to drag the block into full view.
//
// What this proves:
//   - `holdReels` + buffer-anchored block: the held reel's `_finalizeFrame`
//     state is preserved (occupancy + anchor size).
//   - `_coordinateBigSymbols` runs on the result grid passed by the
//     player for the non-held reels; the held column's placeholder entry
//     is ignored.
//   - A nudge AFTER the respin still moves the held block intact —
//     proving the strip layout survived the no-op spin.

const TALL = { id: 'tall', color: 0xff8c42, label: 'TALL', textColor: 0x4a1d00, w: 1, h: 3 };
const REELS = 5;
const HELD_REEL = 2;
const ROWS = 3;
const SIZE = 80;
const GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleSymbols(ROWS)
  // bufferAbove >= 2 lets the 1x3 anchor sit at row -2 (block extends
  // through row 0 — tail visible).
  .bufferSymbols(2)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((registry) => {
    for (const card of CARD_DECK) {
      registry.register(card.id, CardSymbol, {
        color: card.color, label: card.label, textColor: card.textColor,
      });
    }
    registry.register(TALL.id, CardSymbol, {
      color: TALL.color, label: TALL.label, textColor: TALL.textColor,
    });
  })
  .weights(Object.fromEntries(CARD_DECK.map((c, i) => [c.id, 12 - i])))
  .symbolData({ [TALL.id]: { weight: 0, zIndex: 5, size: { w: TALL.w, h: TALL.h } } })
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 })
  .ticker(app.ticker)
  .build();

const FILLER_IDS = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER_IDS[Math.floor(Math.random() * FILLER_IDS.length)];
const ct = () => ({ visible: [filler(), filler(), filler()] });

return {
  reelSet,
  onSpin: async () => {
    // ── 1. Initial spin lands the tail-visible wild on reel 2. ──────
    const initialGrid = [
      ct(), ct(),
      // Reel 2: anchor at bufferAbove[1] = row -2. Block spans rows
      // -2, -1, 0. Only row 0 shows the block's bottom cell.
      { visible: [filler(), filler(), filler()], bufferAbove: [undefined, TALL.id] },
      ct(), ct(),
    ];
    const spin1 = reelSet.spin();
    await new Promise((r) => setTimeout(r, 240));
    reelSet.setResult(initialGrid);
    await spin1;
    await new Promise((r) => setTimeout(r, 900));

    // ── 2. Respin everything EXCEPT reel 2. ─────────────────────────
    //
    // `holdReels: [HELD_REEL]` tells the engine to skip START/SPIN/STOP
    // on reel 2 entirely. The grid we pass below MUST include all 5
    // columns (every shipped slot expects a full grid), but the entry at
    // index 2 is ignored — the held reel keeps whatever it had.
    //
    // The block on reel 2 (anchor at strip[0], stubs at strip[1..2])
    // survives because:
    //   - no motion runs on reel 2 (strip array unchanged)
    //   - `_finalizeFrame` doesn't re-run (occupancy unchanged)
    //   - the anchor's sized sprite stays at its post-land dimensions
    //
    // We hand the held column a ColumnTarget so the input shape is
    // homogeneous — `setResult` rejects mixed `string[] | ColumnTarget`
    // grids. The held entry's contents are not validated against the
    // current strip; they're simply dropped during frame building.
    const respinGrid = [
      ct(), ct(),
      ct(), // ignored — reel 2 is held
      ct(), ct(),
    ];
    const spin2 = reelSet.spin({ holdReels: [HELD_REEL] });
    await new Promise((r) => setTimeout(r, 240));
    reelSet.setResult(respinGrid);
    await spin2;
    await new Promise((r) => setTimeout(r, 900));

    // ── 3. Nudge the held reel DOWN by 2 to reveal the full block. ──
    //
    // Survival check (down): anchor strip index (0) + h - 1 + distance =
    // 0 + 3 - 1 + 2 = 4 < total 7 ✓. The block moves as a unit from
    // strip[0..2] to strip[2..4]. Visible[0..2] = ['tall', 'tall', 'tall'].
    await reelSet.nudge(HELD_REEL, {
      distance: 2,
      direction: 'down',
      incoming: [filler(), filler()],
      duration: 620,
    });
  },
};
