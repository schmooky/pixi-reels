// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//           PIXI, gsap, app, pickWeighted

// SIMULTANEOUS REFILL. every cell drops at the same moment. The most
// common refill pattern in commercial tumble slots: snappy, no extra
// pacing, the player sees the new symbols arrive as one beat.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 6, ROWS = 4, SIZE = 64;
const CLUSTER = '10';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];
const PAUSE_AFTER_REMOVAL_MS = 220;

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleRows(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
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
    // rowStagger: 0. every row in a reel drops together (no in-reel stagger).
    dropIn: { duration: 380, ease: 'back.out(1.4)', rowStagger: 0, distance: 'perHole' },
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

    // Moment A. initial reveal with the canonical left-to-right wave.
    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    await new Promise((r) => setTimeout(r, 200));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    // Moment B. every column drops together. setDropOrder('all') = 0 ms
    // per-reel delay; the in-reel rowStagger is already 0 above.
    reelSet.setDropOrder('all');
    await reelSet.refill({ winners, grid: stage1 });
  },
};
