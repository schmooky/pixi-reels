// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// Pure-drop opener: same 'low1' -> 'mid1' chain as the strip-spin
// canvas, but the round opens as a cascade too. no strip motion. The
// old board falls out, the new one drops in, then the chain runs.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 5, ROWS = 5;
// Cells match the authored 88x101.6 symbol plate.
const SCALE = 0.62;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
const HIT_COLS = [0, 1, 2];                     // left three columns
const HIT_ROW = 1;                              // upper-middle cell
const TRIGGER1 = 'low1';
const TRIGGER2 = 'mid1';

function randSymbolNotIn(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; }
  while (exclude.has(s));
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
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120, bounceDistance: 0, bounceDuration: 0 })
  // The opening reveal IS a tumble here, so `fall` matters. it animates
  // the previous board out before the new one drops in.
  .tumble({
    fall:   { duration: 267, ease: 'power2.in', cellStagger: 33 },  // 16f, 2f stagger
    dropIn: { duration: 400, ease: 'power2.in', cellStagger: 50, distance: 'perHole' },  // 24f, 3f stagger
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

    const dropAtHitRow = (reel, fillTop) => {
      const next = [...reel];
      for (let r = HIT_ROW; r > 0; r--) next[r] = next[r - 1];
      next[0] = fillTop;
      return next;
    };

    // Round 1: no strip-spin. default cascade mode drops the old board
    // out and drops stage 0 in. The only difference against the
    // strip-spin canvas: no { mode: 'standard' } override.
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
        .map((c) => grid[c][HIT_ROW] === trigger ? { reel: c, cell: HIT_ROW } : null)
        .filter(Boolean),
      nextGrid: (prev, winners) => {
        const fill = randSymbolNotIn(new Set([TRIGGER1, TRIGGER2]));
        const out = prev.map((reel, c) =>
          winners.some((w) => w.reel === c)
            ? dropAtHitRow(reel, fill)
            : [...reel],
        );
        trigger = trigger === TRIGGER1 ? TRIGGER2 : '__none__';
        return out;
      },
      pauseAfterDestroyMs: 167,
    });
  },
};
