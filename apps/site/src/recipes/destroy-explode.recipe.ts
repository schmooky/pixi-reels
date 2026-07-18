// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, SpineReelSymbol, loadCascadeSpines,
//           buildCascadeSpineMap, CASCADE_SYMBOL_IDS, CASCADE_PLATE_W,
//           CASCADE_PLATE_H, PIXI, gsap, app, pickWeighted

// AUTHORED destroy: same board, same one-shot cascade as the fade canvas.
// the only change is `outAnimation: 'explode'` at registration. That one
// line reroutes `destroySymbols` through the skeleton's authored 1.27 s
// explosion (a baked 23-frame sequence) instead of the GSAP implode.
// Played here at full length so you can see the whole clip.

await loadCascadeSpines();

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
  .reels(REELS).visibleRows(ROWS).symbolSize(CELL_W, CELL_H).symbolGap(4, 4)
  .symbols(r => {
    const spineMap = buildCascadeSpineMap();
    for (const id of CASCADE_SYMBOL_IDS) {
      r.register(id, SpineReelSymbol, {
        spineMap,
        scale: SCALE,
        landingAnimation: 'land',
        outAnimation: 'explode', // the ONE line that swaps the destroy
        autoPlayLanding: true,
      });
    }
  })
  // The skull overflows its cell (authored premium pop, tamed via the
  // skeleton's root-bone scale). lift it above every reel and outside
  // the reel mask so the overflow renders instead of clipping.
  .symbolData({ high: { zIndex: 10, unmask: true } })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .tumble({
    fall:   { duration: 0, ease: 'none', rowStagger: 0 },              // not used. refill skips fall
    dropIn: { duration: 380, ease: 'back.out(1.6)', rowStagger: 0, distance: 'perHole' },
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
      pauseAfterDestroyMs: 120,
    });
  },
};
