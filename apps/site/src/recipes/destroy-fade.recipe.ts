// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// Engine-default destroy: no `out` animation registered, so
// `destroySymbols` falls back to the built-in GSAP scale-and-fade
// implode. Works with no destruction art at all.

await loadCascadeSpines();

const F = (n) => Math.round(n * 1000 / 60); // frames -> ms at 60 fps

const A = 'low1', B = 'low2', C = 'low3';
const X = 'high'; // the winner that vanishes
const REELS = 4, ROWS = 3;
const SCALE = 0.8;
const CELL_W = CASCADE_PLATE_W * SCALE;
const CELL_H = CASCADE_PLATE_H * SCALE;

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
  .reels(REELS).visibleRows(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(0, 0)
  .symbols(r => {
    // No outAnimation: the skeleton has no 'disintegration' clip, so
    // playDestroy falls back to the base GSAP implode.
    const spineMap = buildCascadeSpineMap();
    for (const id of CASCADE_SYMBOL_IDS) {
      r.register(id, SpineReelSymbol, {
        spineMap,
        scale: SCALE,
      });
    }
  })
  // The high symbol's head overflows its cell (the plate itself is
  // tile-sized). unmask renders it above the reel mask instead of
  // clipping it.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', { ...SpeedPresets.NORMAL, bounceDistance: 0, bounceDuration: 0 }).speed('turbo', { ...SpeedPresets.TURBO, bounceDistance: 0, bounceDuration: 0 })
  .tumble({
    fall:   { duration: 0, ease: 'none', rowStagger: 0 },              // not used. refill skips fall
    dropIn: { duration: F(22), ease: 'power2.in', rowStagger: 0, distance: 'perHole' },
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

    // One-shot cascade: detect every X on the visible grid → destroy →
    // refill with a gravity-correct nextGrid. After the refill there are
    // no more Xs, so `detectWinners` returns [] and the chain ends.
    reelSet.setDropOrder('all');
    await reelSet.runCascade({
      detectWinners: (grid) => grid.flatMap((col, reel) =>
        col.map((sym, row) => sym === X ? { reel, row } : null).filter(Boolean),
      ),
      nextGrid: (prev, winners) => {
        const losers = new Map();
        for (const w of winners) {
          if (!losers.has(w.reel)) losers.set(w.reel, new Set());
          losers.get(w.reel).add(w.row);
        }
        return prev.map((col, reel) => {
          const drop = losers.get(reel);
          if (!drop || drop.size === 0) return [...col];
          const survivors = col.filter((_, row) => !drop.has(row));
          const fillers = Array.from({ length: drop.size }, () => randSymbolNotIn(new Set([X])));
          return [...fillers, ...survivors];
        });
      },
      pauseAfterDestroyMs: F(7),
    });
  },
};
