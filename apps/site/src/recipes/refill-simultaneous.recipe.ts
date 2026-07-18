// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// SIMULTANEOUS REFILL. every cell drops at the same moment. Snappy,
// no extra pacing, all new symbols arrive in one beat.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
// Cells match the authored 88x101.6 symbol plate.
const SCALE = 0.62;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
const CLUSTER = 'low1';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];
const PAUSE_AFTER_REMOVAL_MS = 220;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

// The authored `explode` clip runs 1.27 s, too long for this demo's
// cascade timing. Play it faster via TrackEntry.timeScale.
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
    // outAnimation: 'explode' makes destroySymbols play the skeleton's
    // explode clip instead of the default implode.
    const spineMap = buildCascadeSpineMap();
    for (const id of CASCADE_SYMBOL_IDS) {
      r.register(id, TimedExplodeSymbol, {
        spineMap,
        scale: SCALE,
        outAnimation: 'explode',
      });
    }
  })
  // The high symbol's head overflows its cell (the plate itself is
  // tile-sized). unmask renders it above the reel mask instead of
  // clipping it.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 240, ease: 'power2.in',       rowStagger: 40 },
    // rowStagger: 0. every row in a reel drops together (no in-reel stagger).
    dropIn: { duration: 380, ease: 'power3.out', rowStagger: 0, distance: 'perHole' },
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

    // Moment A. initial reveal with the canonical left-to-right wave.
    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    await new Promise((r) => setTimeout(r, 200));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    // Moment B. every column drops together. setDropOrder('all') = 0 ms
    // per-reel delay; the in-reel rowStagger is already 0 above.
    reelSet.setDropOrder('all');
    await reelSet.refill({ winners, grid: stage1.map((visible) => ({ visible })) });
  },
};
