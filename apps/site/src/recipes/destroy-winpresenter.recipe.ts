// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, WinPresenter,
//           loadCascadeSpines, buildCascadeSpineMap, CASCADE_SYMBOL_IDS,
//           CASCADE_PLATE_W, CASCADE_PLATE_H,
//           PIXI, gsap, app, pickWeighted

// Win presentation before destruction: reels stop, the presenter dims
// the board and shows each winning combination in turn, a short pause,
// then all winners explode and the refill drops. Both combinations go
// through one WinPresenter call in runCascade's presentWinners hook.

await loadCascadeSpines();

const IDS = [...CASCADE_SYMBOL_IDS];
const REELS = 6, ROWS = 4;
const SCALE = 0.68;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;
// Two planted combinations. They share reel 2, so the refill has to
// handle a column with two winners.
const GROUP_A = { id: 'mid2', cells: [{ reel: 2, cell: 1 }, { reel: 3, cell: 1 }, { reel: 4, cell: 1 }], value: 60 };
const GROUP_B = { id: 'low1', cells: [{ reel: 0, cell: 2 }, { reel: 1, cell: 2 }, { reel: 2, cell: 2 }], value: 30 };
const PLANTED = new Set([GROUP_A.id, GROUP_B.id]);
const HOLD_AFTER_PRESENT_MS = 450; // 27 frames // pause between presentation and explosion

function randSymbol() {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (PLANTED.has(s));
  return s;
}

// Shorter explosion. the presenter already showed the win.
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
  .symbols(r => {
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
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 283, ease: 'power3.in', cellStagger: 67 },  // 17f, 4f stagger
    dropIn: { duration: 450, ease: 'power2.in', cellStagger: 67, distance: 'perHole' },  // 27f, 4f stagger
  })
  .ticker(app.ticker).build();

// symbolAnim plays the skeleton's win clip.
const presenter = new WinPresenter(reelSet, {
  dimLosers: { alpha: 0.35 },
  // Gap between the two combinations. one cycle each.
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
      for (const cell of g.cells) stage0[cell.reel][cell.cell] = g.id;
    }

    // Moment A. initial drop, left-to-right reveal.
    reelSet.setDropOrder('ltr');
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await p;
    await new Promise(r => setTimeout(r, 300));

    // Moment B. runCascade owns the loop. presentWinners shows both
    // combinations and pauses; destroySymbols runs when it resolves,
    // then the refill.
    reelSet.setDropOrder('all');
    let presented = false;
    await reelSet.runCascade({
      detectWinners: () => {
        if (presented) return [];
        return [...GROUP_A.cells, ...GROUP_B.cells];
      },
      nextGrid: (prev, winners) => {
        // Generic gravity: per column, drop the winner cells, pack the
        // survivors to the bottom, fresh symbols on top. Handles the
        // shared reel (two winners in one column) correctly.
        const byReel = new Map();
        for (const w of winners) {
          if (!byReel.has(w.reel)) byReel.set(w.reel, new Set());
          byReel.get(w.reel).add(w.cell);
        }
        presented = true;
        return prev.map((reel, c) => {
          const drop = byReel.get(c);
          if (!drop) return [...reel];
          const survivors = reel.filter((_, cell) => !drop.has(cell));
          const fillers = Array.from({ length: drop.size }, () => randSymbol());
          return [...fillers, ...survivors];
        });
      },
      presentWinners: async () => {
        // Higher value presents first.
        await presenter.show([
          { id: 1, cells: GROUP_A.cells.map(w => ({ reelIndex: w.reel, cellIndex: w.cell })), value: GROUP_A.value },
          { id: 2, cells: GROUP_B.cells.map(w => ({ reelIndex: w.reel, cellIndex: w.cell })), value: GROUP_B.value },
        ]);
        await new Promise(r => setTimeout(r, HOLD_AFTER_PRESENT_MS));
      },
      pauseAfterDestroyMs: 83,
    });
  },
  cleanup: () => presenter.destroy(),
};
