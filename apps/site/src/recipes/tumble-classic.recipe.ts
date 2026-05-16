// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//           PIXI, gsap, app, pickWeighted

// CLASSIC tumble feel: sine.in fall, soft overshoot dropIn — the
// all-rounder default. Good baseline before reaching for the more
// stylistic variants.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 6, ROWS = 4, SIZE = 64;
const CLUSTER = '10';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];

// Pause between "winners faded out" and "refill drop-in starts". Most
// commercial slots dial this between 150 and 400 ms — too short feels
// like a teleport, too long stalls the cascade momentum.
const PAUSE_AFTER_REMOVAL_MS = 250;

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
    fall:   { duration: 280, ease: 'sine.in',       rowStagger: 40 },
    dropIn: { duration: 480, ease: 'back.out(1.6)', rowStagger: 50, distance: 'perHole' },
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

    // Moment A: drop on click, wait, drop in.
    const spinDone = reelSet.spin();
    reelSet.setDropOrder('ltr');
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(stage0);
    await spinDone;

    // Moment B: fade winners, then refill — survivors slide, new symbols
    // enter from above into the holes.
    await new Promise((r) => setTimeout(r, 220));
    const winners = HIT_COLS.map((c) => ({ reel: c, row: HIT_ROW }));
    await Promise.all(winners.map((w) => new Promise((resolve) => {
      const view = reelSet.reels[w.reel].getSymbolAt(w.row).view;
      gsap.to(view, { alpha: 0, duration: 0.3, ease: 'power2.in', onComplete: resolve });
    })));
    await new Promise((r) => setTimeout(r, PAUSE_AFTER_REMOVAL_MS));
    await reelSet.refill({ winners, grid: stage1 });
  },
};
