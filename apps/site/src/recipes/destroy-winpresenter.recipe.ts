// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, WinPresenter,
//           loadCascadeSpines, buildCascadeSpineMap, CASCADE_SYMBOL_IDS,
//           CASCADE_PLATE_W, CASCADE_PLATE_H,
//           PIXI, gsap, app, pickWeighted

// PRESENTED destroy, full storyboard: the reels STOP, the presenter
// DIMS the board and shows the first winning combination, then dims
// and shows the SECOND combination, holds a beat. and only then does
// the engine EXPLODE every winner and DROP the refill. Two win groups
// cycled by one `WinPresenter` inside runCascade's `presentWinners`
// hook; the destruction waits for the whole pass.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
const SCALE = 0.68;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
// Two planted combinations, visually distinct tiers. they share reel 2,
// so the refill gravity handles a double-winner column too.
const GROUP_A = { id: 'mid2', cells: [{ reel: 2, row: 1 }, { reel: 3, row: 1 }, { reel: 4, row: 1 }], value: 60 };
const GROUP_B = { id: 'low1', cells: [{ reel: 0, row: 2 }, { reel: 1, row: 2 }, { reel: 2, row: 2 }], value: 30 };
const PLANTED = new Set([GROUP_A.id, GROUP_B.id]);
const HOLD_AFTER_PRESENT_MS = 450; // the "beat" between the pass and the explosion

function randSymbol() {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (PLANTED.has(s));
  return s;
}

// Presenter already spotlights the win, so the explosion that follows is
// compressed. it's a chaser, not the headline.
const EXPLODE_TIME_SCALE = 2.0;

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
  // The skull's PLATE is tile-sized (pixel-identical to the tier plates
  // in the atlas); only the head + glow overflow it, as authored. Lift it
  // above every reel and outside the reel mask so that overflow renders
  // instead of clipping.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in',  rowStagger: 60 },
    dropIn: { duration: 450, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
  })
  .ticker(app.ticker).build();

// The presenter's symbolAnim is simply the skeleton's authored `win`
// clip. no hand-rolled scale-pop needed once real art is in the map.
const presenter = new WinPresenter(reelSet, {
  dimLosers: { alpha: 0.35 },
  // A readable gap between the two combinations: dim + show A, breathe,
  // dim + show B. One cycle each.
  cycleGap: 200,
  cycles: 1,
  symbolAnim: async (symbol) => {
    await symbol.playWin();
  },
});

reelSet.events.on('spin:start', () => presenter.abort());

return {
  reelSet,
  onSpin: async () => {
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, () => randSymbol()),
    );
    for (const g of [GROUP_A, GROUP_B]) {
      for (const cell of g.cells) stage0[cell.reel][cell.row] = g.id;
    }

    // Moment A. initial drop, left-to-right reveal.
    reelSet.setDropOrder('ltr');
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise(r => setTimeout(r, 300));

    // Moment B. runCascade owns the loop. `presentWinners` hands BOTH
    // combinations to the presenter, which cycles them: dim + show A,
    // dim + show B. Then a held beat, and only when the hook resolves
    // does the library call `destroySymbols`. every winner explodes at
    // once. and the refill drops.
    reelSet.setDropOrder('all');
    let presented = false;
    await reelSet.runCascade({
      detectWinners: () => {
        if (presented) return [];
        return [...GROUP_A.cells, ...GROUP_B.cells];
      },
      nextGrid: (prev, winners) => {
        // Generic gravity: per column, drop the winner rows, pack the
        // survivors to the bottom, fresh symbols on top. Handles the
        // shared reel (two winners in one column) correctly.
        const byReel = new Map();
        for (const w of winners) {
          if (!byReel.has(w.reel)) byReel.set(w.reel, new Set());
          byReel.get(w.reel).add(w.row);
        }
        presented = true;
        return prev.map((col, c) => {
          const drop = byReel.get(c);
          if (!drop) return [...col];
          const survivors = col.filter((_, row) => !drop.has(row));
          const fillers = Array.from({ length: drop.size }, () => randSymbol());
          return [...fillers, ...survivors];
        });
      },
      presentWinners: async () => {
        // Higher value sorts first: the mid-tier combination presents
        // before the low-tier one.
        await presenter.show([
          { id: 1, cells: GROUP_A.cells.map(w => ({ reelIndex: w.reel, rowIndex: w.row })), value: GROUP_A.value },
          { id: 2, cells: GROUP_B.cells.map(w => ({ reelIndex: w.reel, rowIndex: w.row })), value: GROUP_B.value },
        ]);
        // The beat: winners back at full alpha, board settled, a breath
        // before the explosion.
        await new Promise(r => setTimeout(r, HOLD_AFTER_PRESENT_MS));
      },
      pauseAfterDestroyMs: 80,
    });
  },
  cleanup: () => presenter.destroy(),
};
