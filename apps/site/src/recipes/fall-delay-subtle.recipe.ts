// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// SUBTLE LEAD-IN. 150 ms before the fall starts. Just enough for the
// SPIN button click to register and a short "tap" SFX to lead. Below
// the threshold where the player thinks "why isn't anything happening?"
//. still feels responsive.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
// Cells sized from the authored 88x101.6 low/mid plate, scaled so the
// 6x4 board keeps roughly its old card-symbol footprint.
const SCALE = 0.62;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
const CLUSTER = 'low1';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];
const LEAD_IN_MS = 150;

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
  // The skull overflows its cell (authored premium pop, tamed via the
  // skeleton's root-bone scale). lift it above every reel and outside
  // the reel mask so the overflow renders instead of clipping.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .tumble({
    fall:   { duration: 280, ease: 'sine.in',       rowStagger: 50 },
    dropIn: { duration: 420, ease: 'back.out(1.5)', rowStagger: 0,  distance: 'perHole' },
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

    if (LEAD_IN_MS > 0) await new Promise((r) => setTimeout(r, LEAD_IN_MS));

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    await new Promise((r) => setTimeout(r, 200));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setDropOrder('all');
    await reelSet.refill({ winners, grid: stage1.map((visible) => ({ visible })) });
  },
};
