// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadSpineSet,
//           PIXI, gsap, app, pickWeighted

// LEFT-TO-RIGHT WAVE REFILL. each column lands in sequence from left
// to right. Each reel's cells arrive together (no in-reel stagger), but
// reel 0 lands before reel 1 before reel 2... Reads as a column-by-column
// "filling up" of the grid.

const cascade = await loadSpineSet("cascade");

const IDS = [...cascade.symbolIds];
const REELS = 6, ROWS = 4;
// Cells match the authored 88x101.6 symbol plate.
const SCALE = 0.62;
const CELL_W = cascade.set.cellSize.width * SCALE;
const CELL_H = cascade.set.cellSize.height * SCALE;
const CLUSTER = 'low1';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];
const PAUSE_AFTER_REMOVAL_MS = 217;
const REEL_WAVE_STEP_MS = 100; // 6 frames

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
  .reels(REELS).visibleCells(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(0, 0)
  // Pure tumble: no strip scrolling, so no below-window buffer at all.
  // nothing can ever peek out under the grid.
  .bufferSymbols({ start: 1, end: 0 })
  .symbols((r) => {
    // outAnimation: 'explode' makes destroySymbols play the skeleton's
    // explode clip instead of the default implode.
    const spineMap = cascade.spineMap;
    for (const id of cascade.symbolIds) {
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
    fall:   { duration: 233, ease: 'power2.in', cellStagger: 33 },  // 14f, 2f stagger
    // cellStagger: 0. cells in a reel arrive together; the per-reel
    // stagger is set via setDropOrder('ltr', step) on the refill below.
    dropIn: { duration: 367, ease: 'power2.in', cellStagger: 0, distance: 'perHole' },  // 22f
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
    const stage1 = stage0.map((reel, c) => {
      if (!HIT_COLS.includes(c)) return [...reel];
      const next = [...reel];
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
    const winners = HIT_COLS.map((c) => ({ reel: c, cell: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    // Refill: each reel delayed by REEL_WAVE_STEP_MS. left-to-right wave.
    reelSet.setDropOrder('ltr', REEL_WAVE_STEP_MS);
    await reelSet.refill({ winners, grid: stage1.map((visible) => ({ visible })) });
  },
};
