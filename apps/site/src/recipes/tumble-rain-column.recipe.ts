// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, CASCADE_HIGH_SCALE, PIXI, gsap, app, pickWeighted

// RAIN COLUMN: the whole column drops as a slab. rowStagger = 0 makes
// every row start together; distance: 'auto' makes every animated row
// traverse the FULL visible-rows distance. Looks like a piece of a
// board falling. Good fit for puzzle / match-3 styled boards.

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

// Dramatic pause. the empty board is part of the visual story for
// rain-column feels. 380 ms lets the absence of symbols register before
// the next slab drops.
const PAUSE_AFTER_REMOVAL_MS = 380;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

// The authored `explode` clip runs 1.27 s. longer than this demo's
// cascade rhythm wants. Play it compressed via TrackEntry.timeScale:
// same art, same spine API, demo-tempo timing.
const EXPLODE_TIME_SCALE = 1.8;

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
    fall:   { duration: 240, ease: 'sine.in', rowStagger: 0 },
    dropIn: { duration: 380, ease: 'sine.in', rowStagger: 0, distance: 'auto' },
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

    const spinDone = reelSet.spin();
    reelSet.setDropOrder('all');
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    await new Promise((r) => setTimeout(r, 200));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    await reelSet.refill({ winners, grid: stage1.map((visible) => ({ visible })) });
  },
};
