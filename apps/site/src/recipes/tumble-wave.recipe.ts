// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//           PIXI, gsap, app, pickWeighted

// WAVE: heavy per-row stagger (110 ms) plus a soft overshoot. Rows
// arrive in sequence top-to-bottom.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 6, ROWS = 4, SIZE = 64;
const CLUSTER = '10';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];

// Medium pause. wave is already long because of the per-row stagger;
// the pause sets up the rhythm of the next wave without over-stalling.
const PAUSE_AFTER_REMOVAL_MS = 280;

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
    fall:   { duration: 180, ease: 'sine.in',       rowStagger: 90 },
    dropIn: { duration: 320, ease: 'back.out(2.0)', rowStagger: 110, distance: 'perHole' },
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

    const spinDone = reelSet.spin();
    reelSet.setDropOrder('ltr');
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0.map((visible) => ({ visible })));
    await spinDone;

    await new Promise((r) => setTimeout(r, 220));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await reelSet.destroySymbols(winners);
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    await reelSet.refill({ winners, grid: stage1 });
  },
};
