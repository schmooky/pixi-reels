// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, CASCADE_HIGH_SCALE, PIXI, gsap, app, pickWeighted

// The SAME starter as the card canvas above, with real art dropped in.
// Diff against the card version: the symbol registration block (spine
// map + per-id scale + animation routing) and the id constants. The
// orchestration. spin, setResult, runCascade, both callbacks. is
// line-for-line identical. That's the point: the cascade contract
// doesn't change when the art arrives.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
// Cells sized from the authored 88x101.6 low/mid plate.
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
  .reels(REELS).visibleRows(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(4, 4)
  .symbols(r => {
    // outAnimation: 'explode' routes the engine's cascade destroy through
    // the authored explosion. `high` is authored on a 124x143.2 plate;
    // CASCADE_HIGH_SCALE shrinks it onto the same cell as the low/mid tier.
    const spineMap = buildCascadeSpineMap();
    for (const id of CASCADE_SYMBOL_IDS) {
      r.register(id, TimedExplodeSymbol, {
        spineMap,
        scale: id === 'high' ? SCALE * CASCADE_HIGH_SCALE : SCALE,
        landingAnimation: 'land',
        outAnimation: 'explode',
        autoPlayLanding: true,
      });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
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
