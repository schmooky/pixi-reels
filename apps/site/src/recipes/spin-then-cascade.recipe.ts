// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// Hybrid spin-then-cascade: round 1 spins like a classic strip slot
// (top-to-bottom motion, START → SPIN → STOP). The landing has a
// winning cluster. those cells pop, survivors fall, new symbols drop
// in from above. Each pop is a `reelSet.refill(...)` call driven by
// `reelSet.runCascade({ detectWinners, nextGrid })`, NOT a re-spin.
//
// IMPORTANT recipe-design note: the chain only ever touches the LEFT
// THREE columns. Cols 4 and 5 land during the strip-spin and STAY
// UNTOUCHED for the rest of the play. That's deliberate. `runCascade`
// detects winners per-grid each round; only the columns that have
// winning cells animate. Real games typically chain across overlapping
// clusters; here we keep the demo's affected area visually contiguous.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 5, ROWS = 5;
// Cells sized from the authored 88x101.6 low/mid plate.
const SCALE = 0.62;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
const HIT_COLS = [0, 1, 2];                     // left three columns
const HIT_ROW = 1;                              // upper-middle row
const TRIGGER1 = 'low1';
const TRIGGER2 = 'mid1';

function randSymbolNotIn(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; }
  while (exclude.has(s));
  return s;
}

// The authored `explode` clip runs 1.27 s. longer than this demo's
// cascade rhythm wants. Play it compressed via TrackEntry.timeScale:
// same art, same spine API, demo-tempo timing.
const EXPLODE_TIME_SCALE = 2.2;

class TimedExplodeSymbol extends SpineReelSymbol {
  async playOut() {
    const entry = this.playOnTrack(0, 'explode', false);
    if (!entry) return;
    entry.timeScale = EXPLODE_TIME_SCALE;
    await new Promise((resolve) => { entry.listener = { complete: () => resolve() }; });
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleRows(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(0, 0)
  .symbols((r) => {
    // outAnimation: 'explode' routes the engine's cascade destroy through
    // the authored explosion. `high` is authored 1.41x bigger than the
    // low/mid plate and overflows its cell on purpose. premium symbols
    // pop out of the grid in the original game, so it gets the same scale.
    const spineMap = buildCascadeSpineMap();
    for (const id of CASCADE_SYMBOL_IDS) {
      r.register(id, TimedExplodeSymbol, {
        spineMap,
        scale: SCALE,
        landingAnimation: 'land',
        outAnimation: 'explode',
        autoPlayLanding: true,
      });
    }
  })
  // The skull's PLATE is tile-sized (pixel-identical to the tier plates
  // in the atlas); only the head + glow overflow it, as authored. Lift it
  // above every reel and outside the reel mask so that overflow renders
  // instead of clipping.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120, bounceDistance: 0, bounceDuration: 0 })
  // Cascade refills layer on top of a standard strip-spin: leave the
  // builder's default mode as 'standard' for the first spin, and the
  // refill chain below uses `reelSet.refill()` directly (which doesn't
  // need `.tumble()` for the strip-spin landing itself).
  .tumble({
    fall:   { duration: 0, ease: 'none', rowStagger: 0 },              // not used. refill skips fall
    dropIn: { duration: 360, ease: 'back.out(1.6)', rowStagger: 0, distance: 'perHole' },
  })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    // Stage 0. strip-spin lands here. Force the left-three columns to
    // stack: TRIGGER2 ('mid1') at row 0, TRIGGER1 ('low1') at row 1, random
    // elsewhere. The mid1s at row 0 are pre-positioned so that AFTER the
    // first cascade pops the low1s, the mid1s fall into row 1. creating
    // a NEW cluster of three mid1s without any extra authoring.
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        if (HIT_COLS.includes(c)) {
          if (r === 0)        return TRIGGER2;  // 'mid1' on top. future cascade-2 cluster
          if (r === HIT_ROW)  return TRIGGER1;  // 'low1' in middle. current cluster
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
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 300));

    // Cascade chain. driven by `reelSet.runCascade({...})`. The library
    // owns the detect → destroy → pause → refill loop and resolves with
    // `RunCascadeResult` when no more winners are found. Game-rule
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
        // After popping the low1s, the next trigger is the mid1 that just
        // fell into HIT_ROW. Real games would compute this from the
        // post-refill grid via `detectWinners` again. we hard-step it
        // so the demo is unmistakable.
        trigger = trigger === TRIGGER1 ? TRIGGER2 : '__none__';
        return out;
      },
      pauseAfterDestroyMs: 160,
    });
  },
};
