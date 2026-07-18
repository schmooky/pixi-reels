// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, WinPresenter,
//           loadCascadeSpines, buildCascadeSpineMap, CASCADE_SYMBOL_IDS,
//           CASCADE_PLATE_W, CASCADE_PLATE_H,
//           PIXI, gsap, app, pickWeighted

// PRESENTED destroy: `WinPresenter` drives the winners' authored `win`
// clip (losers dim), and only THEN does the engine's `destroySymbols`
// play the authored `explode`. Two authored clips chained: presenter
// first, destruction second. runCascade sequences both.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
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
  .reels(REELS).visibleRows(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(4, 4)
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
  // The skull overflows its cell (authored premium pop, tamed via the
  // skeleton's root-bone scale). lift it above every reel and outside
  // the reel mask so the overflow renders instead of clipping.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in',  rowStagger: 60 },
    dropIn: { duration: 450, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
  })
  .ticker(app.ticker).build();

// The presenter's symbolAnim is simply the skeleton's authored `win`
// clip. no hand-rolled scale-pop needed once real art is in the map.
const presenter = new WinPresenter(reelSet, {
  dimLosers: { alpha: 0.35 },
  cycleGap: 0,
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
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER)
      )
    );

    // Moment A. initial drop, left-to-right reveal.
    reelSet.setDropOrder('ltr');
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise(r => setTimeout(r, 300));

    // Moment B. runCascade owns the loop. `onCascade` hands the winners to
    // the presenter (authored `win` + dimmed losers). When it resolves the
    // library calls `destroySymbols`, which routes through the authored
    // `explode`. No destroyOptions suppression here: the two clips are
    // designed to chain.
    reelSet.setDropOrder('all');
    let presented = false;
    await reelSet.runCascade({
      detectWinners: (grid) => {
        if (presented) return [];
        return HIT_COLS.map(c => grid[c][HIT_ROW] === CLUSTER ? { reel: c, row: HIT_ROW } : null).filter(Boolean);
      },
      nextGrid: (prev, winners) => {
        const next = prev.map(col => [...col]);
        for (const w of winners) {
          for (let r = w.row; r > 0; r--) next[w.reel][r] = next[w.reel][r - 1];
          next[w.reel][0] = randSymbol(CLUSTER);
        }
        presented = true;
        return next;
      },
      onCascade: async ({ chain, winners }) => {
        if (winners.length === 0) return;
        await presenter.show([{
          id: chain,
          cells: winners.map(w => ({ reelIndex: w.reel, rowIndex: w.row })),
          value: winners.length * 10,
        }]);
      },
      pauseAfterDestroyMs: 80,
    });
  },
  cleanup: () => presenter.destroy(),
};
