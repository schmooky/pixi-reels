// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//           PIXI, gsap, app, pickWeighted, destroyWinners

// BOTTOM-UP ROW REFILL — within each reel, the bottom row arrives first
// and the top row arrives last (rowOrder: 'bottomToTop'). All reels
// drop simultaneously (setDropOrder('all')). Reads as a "stacking up"
// motion — fits puzzle / match-3 / chess-board themes where the board
// builds itself from below.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 6, ROWS = 4, SIZE = 64;
const CLUSTER = '10';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];
const PAUSE_AFTER_REMOVAL_MS = 240;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .tumble({
    fall:   { duration: 240, ease: 'sine.in',       rowStagger: 40 },
    dropIn: {
      duration: 380, ease: 'back.out(1.5)', distance: 'perHole',
      rowStagger: 90,
      rowOrder: 'bottomToTop',
    },
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

    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0);
    await spinDone;

    await new Promise((r) => setTimeout(r, 200));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await destroyWinners(reelSet, winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    reelSet.setDropOrder('all');
    await reelSet.refill({ winners, grid: stage1 });
  },
};
