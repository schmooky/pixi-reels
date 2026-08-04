// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadSpineSet,
//           PIXI, gsap, app, pickWeighted

// INSTANT. fall starts the moment you click SPIN. No lead-in. The
// default. Snappiest possible feel; players who tap-spin many rounds
// per minute appreciate it. Pair with no sound lead-in or a sound that
// triggers WITH the fall, not before.

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
const LEAD_IN_MS = 0;

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
    fall:   { duration: 267, ease: 'power2.in', cellStagger: 50 },  // 16f, 3f stagger
    dropIn: { duration: 400, ease: 'power2.in', cellStagger: 0, distance: 'perHole' },  // 24f
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

    // Lead-in pause BEFORE the fall starts. LEAD_IN_MS = 0 means the
    // reels begin falling the same frame the click handler runs.
    if (LEAD_IN_MS > 0) await new Promise((r) => setTimeout(r, LEAD_IN_MS));

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    await new Promise((r) => setTimeout(r, 200));
    const winners = HIT_COLS.map((c) => ({ reel: c, cell: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setDropOrder('all');
    await reelSet.refill({ winners, grid: stage1.map((visible) => ({ visible })) });
  },
};
