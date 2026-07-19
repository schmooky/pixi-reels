// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// CLASSIC tumble feel: gravity both ways. power2.in fall out,
// power2.in drop in, dead stop on the grid. The all-rounder default. Good baseline before reaching for the more
// stylistic variants. Framed symbol plates rule out overshoot eases
// (back/bounce): the rectangles would gap and overlap on landing.

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

// Pause between "winners faded out" and "refill drop-in starts". Most
// commercial slots dial this between 150 and 400 ms. too short feels
// like a teleport, too long stalls the cascade momentum.
const PAUSE_AFTER_REMOVAL_MS = 250;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

// The authored `explode` clip runs 1.27 s, too long for this demo's
// cascade timing. Play it faster via TrackEntry.timeScale.
const EXPLODE_TIME_SCALE = 2.4; // 1.27 s clip -> ~32 frames

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
  // Pure tumble: no strip scrolling, so no below-window buffer at all.
  // nothing can ever peek out under the grid.
  .bufferSymbols({ above: 1, below: 0 })
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
    fall:   { duration: 267, ease: 'power2.in', rowStagger: 33 },  // 16f, 2f stagger
    dropIn: { duration: 400, ease: 'power2.in', rowStagger: 50, distance: 'perHole' },  // 24f, 3f stagger
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

    // Moment A: drop on click, wait, drop in.
    const spinDone = reelSet.spin();
    reelSet.setDropOrder('ltr');
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    // Moment B: fade winners, then refill. survivors slide, new symbols
    // enter from above into the holes.
    await new Promise((r) => setTimeout(r, 220));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    await reelSet.refill({ winners, grid: stage1.map((visible) => ({ visible })) });
  },
};
