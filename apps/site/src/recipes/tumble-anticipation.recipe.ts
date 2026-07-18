// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// CASCADE ANTICIPATION REFILL. two-stage. Survivors slide down to fill
// holes FIRST (gravity stage), then a global pause for anticipation
// visuals, then new symbols enter from above with a per-column wave.
//
// Same scripted win as the refill-orders recipes: a 3-cluster of `10` on
// row 2 of the leftmost three reels. What changes:
//
//   1. After destroy, `mode: 'gravity-then-drop'` splits the refill in two.
//      Stage A: only survivors animate. the row 2 cells slide down from
//      row 1 to row 2. (In this layout there are no survivors below the
//      winner because the cluster is on the bottom of the board, but the
//      `cascade:gravity:start/end` events still fire per reel, marking
//      where you'd plug anticipation logic in a denser cluster.)
//   2. The library waits `gravityHoldMs` (250 ms here. bump for more
//      drama, e.g. 500–800 ms for a mascot pop or multiplier roll).
//   3. Stage B: new symbols drop in from above. `setDropOrder('ltr', 110)`
//      gives a left-to-right wave. reel 0 drops first, then 1, then 2…
//      Set the step ≥ `dropIn.duration` (here 380 ms) to make the columns
//      strictly sequential (column 1 fully lands before column 2 starts);
//      a smaller step gives overlap.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
// Cells sized from the authored 88x101.6 low/mid plate.
const SCALE = 0.62;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
const CLUSTER = 'low1';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];
const PAUSE_AFTER_REMOVAL_MS = 220;
const GRAVITY_HOLD_MS = 350;        // window for anticipation visuals
const COLUMN_STEP_MS = 110;         // per-reel start delay on the drop-in wave

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
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
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 240, ease: 'sine.in',       rowStagger: 40 },
    // Gravity uses the same `dropIn` config (it's the same phase, just
    // filtered to survivors). 380 ms with a soft back-out reads as
    // "settled with a tiny bounce". pairs well with the held beat.
    dropIn: { duration: 380, ease: 'back.out(1.4)', rowStagger: 0, distance: 'perHole' },
  })
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER),
      ),
    );
    const stage1 = stage0.map((col, c) => {
      if (!HIT_COLS.includes(c)) return [...col];
      const next = [...col];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = randSymbol(CLUSTER);
      return next;
    });

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    await new Promise((r) => setTimeout(r, 200));

    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));

    // Per-column wave for the new-symbol drop-in stage. The step controls
    // overlap vs sequential:
    //   - step <  dropIn.duration → reels overlap (cascading wave)
    //   - step >= dropIn.duration → reels strictly sequential
    // The gravity stage IGNORES this setting. it always runs all reels
    // in parallel, since gravity is a global "settling" beat.
    reelSet.setDropOrder('ltr', COLUMN_STEP_MS);

    await reelSet.refill({
      winners,
      grid: stage1.map((visible) => ({ visible })),
      mode: 'gravity-then-drop',
      gravityHoldMs: GRAVITY_HOLD_MS,
    });
  },
};
