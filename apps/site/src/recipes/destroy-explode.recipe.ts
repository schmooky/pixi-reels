// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadSpineSet,
//           PIXI, gsap, app, pickWeighted

// Authored destroy: same board and cascade as the fade canvas; the only
// change is `outAnimation: 'explode'` at registration. destroySymbols
// then plays the skeleton's 1.27 s explosion instead of the implode.
// Shown at full length here.

const cascade = await loadSpineSet("cascade");

const A = 'low1', B = 'low2', C = 'low3';
const X = 'high'; // the winner that vanishes
const REELS = 4, ROWS = 3;
const SCALE = 0.8;
const CELL_W = cascade.set.cellSize.width * SCALE;
const CELL_H = cascade.set.cellSize.height * SCALE;

const BEFORE = [
  [X, A, B],
  [X, C, A],
  [X, B, C],
  [A, C, X],
];

function randSymbolNotIn(exclude) {
  let s;
  do { s = [A, B, C][Math.floor(Math.random() * 3)]; }
  while (exclude.has(s));
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(0, 0)
  .symbols(r => {
    const spineMap = cascade.spineMap;
    for (const id of cascade.symbolIds) {
      r.register(id, SpineReelSymbol, {
        spineMap,
        scale: SCALE,
        outAnimation: 'explode', // the ONE line that swaps the destroy
      });
    }
  })
  // The high symbol's head overflows its cell (the plate itself is
  // tile-sized). unmask renders it above the reel mask instead of
  // clipping it.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 }).speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 0, ease: 'none', cellStagger: 0 },              // not used. refill skips fall
    dropIn: { duration: 367, ease: 'power2.in', cellStagger: 0, distance: 'perHole' },  // 22f
  })
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    // Land BEFORE via a normal strip-spin.
    const p = reelSet.spin({ mode: 'standard' });
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(BEFORE.map((visible) => ({ visible })));
    await p;
    await new Promise(r => setTimeout(r, 300));

    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: (grid) => grid.flatMap((reel, reel) =>
        reel.map((sym, cell) => sym === X ? { reel, cell } : null).filter(Boolean),
      ),
      nextGrid: (prev, winners) => {
        const losers = new Map();
        for (const w of winners) {
          if (!losers.has(w.reel)) losers.set(w.reel, new Set());
          losers.get(w.reel).add(w.cell);
        }
        return prev.map((reel, reel) => {
          const drop = losers.get(reel);
          if (!drop || drop.size === 0) return [...reel];
          const survivors = reel.filter((_, cell) => !drop.has(cell));
          const fillers = Array.from({ length: drop.size }, () => randSymbolNotIn(new Set([X])));
          return [...fillers, ...survivors];
        });
      },
      pauseAfterDestroyMs: 117,
    });
  },
};
