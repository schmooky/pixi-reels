// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// Same starter as the card canvas above, with spine symbols. Only the
// registration block and the id constants differ; the orchestration
// (spin, setResult, runCascade, both callbacks) is identical.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
// Cells match the authored 88x101.6 symbol plate.
const SCALE = 0.68;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
const CLUSTER = 'low1';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];

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
  .symbols(r => {
    // outAnimation: 'explode' makes destroySymbols play the skeleton's
    // explode clip instead of the default implode.
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
  // The high symbol's head overflows its cell (the plate itself is
  // tile-sized). unmask renders it above the reel mask instead of
  // clipping it.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in',  rowStagger: 60 },
    dropIn: { duration: 450, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
  })
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    // Stage 0: cluster of CLUSTER on row 2, cols 0–2.
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER)
      )
    );

    // Moment A. initial spin lands the stage-0 cluster, left-to-right reveal.
    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;
    await new Promise(r => setTimeout(r, 300));

    // Moment B. cascade refill driven entirely by runCascade. The
    // first call to detectWinners returns the planted cluster; the second
    // returns [] (no more wins on the post-refill grid), ending the chain.
    // The orchestration (destroy → pause → refill → re-detect) is library-owned.
    reelSet.setDropOrder('all');
    let detected = false;
    await reelSet.runCascade({
      detectWinners: () => {
        if (detected) return [];
        detected = true;
        return HIT_COLS.map(c => ({ reel: c, row: HIT_ROW }));
      },
      nextGrid: (prev, winners) => {
        // Survivors slide down 1; new symbol at row 0.
        const next = prev.map(col => [...col]);
        for (const w of winners) {
          for (let r = w.row; r > 0; r--) next[w.reel][r] = next[w.reel][r - 1];
          next[w.reel][0] = randSymbol(CLUSTER);
        }
        return next;
      },
      pauseAfterDestroyMs: 250,
    });
  },
};
