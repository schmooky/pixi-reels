// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, WILD_CARD,
//           PIXI, gsap, app, pickWeighted

// Cascade-style removal of a single symbol id: pop every cell whose symbol
// matches `X`, gravity-shift survivors, fill cleared top slots with new
// symbols. The whole flow is one `reelSet.runCascade(...)` call — same
// orchestrator every cascade recipe uses.

const A = '7', B = '8', C = '9';
const X = 'wild'; // the winner that vanishes
const IDS = [A, B, C, X];
const REELS = 4, ROWS = 3, SIZE = 90;

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
  .reels(REELS).visibleRows(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    }
  })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .tumble({
    fall:   { duration: 0, ease: 'none', rowStagger: 0 },              // not used — refill skips fall
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
      pauseAfterDestroyMs: 120,
    });
  },
};
