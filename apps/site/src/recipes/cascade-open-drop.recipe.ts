// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// PURE-DROP opener: the same 'low1' → 'mid1' chain as the strip-spin
// canvas, but the round OPENS as a cascade too. no strip motion at all.
// The old board falls out, the new one rains in, then the chain runs.
// This is the all-tumble school (Gates-of-Olympus-style): one visual
// language for the whole round.

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
  .reels(REELS).visibleRows(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(4, 4)
  .symbols((r) => {
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
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120 })
  // The opening reveal IS a tumble here, so `fall` matters. it animates
  // the previous board out before the new one drops in.
  .tumble({
    fall:   { duration: 260, ease: 'sine.in',       rowStagger: 40 },
    dropIn: { duration: 420, ease: 'back.out(1.5)', rowStagger: 45, distance: 'perHole' },
  })
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        if (HIT_COLS.includes(c)) {
          if (r === 0)        return TRIGGER2;  // 'mid1' on top. future cascade-2 cluster
          if (r === HIT_ROW)  return TRIGGER1;  // 'low1' in middle. current cluster
        }
        return randSymbolNotIn(new Set([TRIGGER1, TRIGGER2]));
      }),
    );

    const dropAtHitRow = (col, fillTop) => {
      const next = [...col];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = fillTop;
      return next;
    };

    // Round 1: NO strip-spin. the default cascade mode drops the old
    // board out and rains stage 0 in, left-to-right. This is the whole
    // difference against the strip-spin canvas: same spin() call, no
    // { mode: 'standard' } override.
    reelSet.setDropOrder('ltr');
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise((r) => setTimeout(r, 300));

    // The chain is identical to the strip-spin canvas from here on.
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
        trigger = trigger === TRIGGER1 ? TRIGGER2 : '__none__';
        return out;
      },
      pauseAfterDestroyMs: 160,
    });
  },
};
