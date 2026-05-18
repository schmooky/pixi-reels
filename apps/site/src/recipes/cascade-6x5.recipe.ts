// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, WILD_CARD,
//           PIXI, gsap, app, pickWeighted

// Cascade-tumble end-to-end on the modern API — no helpers, no scripted
// stages. `reelSet.runCascade({ detectWinners, nextGrid })` owns the
// orchestration; the two callbacks own the game rules.

const IDS = ['7', '8', '9', '10', 'J', 'Q'];
const REELS = 6, ROWS = 4, SIZE = 72;
const CLUSTER = '10';
const HIT_ROW = 2;
const HIT_COLS = [0, 1, 2];

function randSymbol(exclude) {
  let s;
  do { s = IDS[Math.floor(Math.random() * IDS.length)]; } while (s === exclude);
  return s;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => {
    for (const sym of CARD_DECK) {
      if (IDS.includes(sym.id)) {
        r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
      }
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .tumble({
    fall:   { duration: 280, ease: 'power3.in',  rowStagger: 60 },
    dropIn: { duration: 450, ease: 'power3.out', rowStagger: 60, distance: 'perHole' },
  })
  .ticker(app.ticker).build();

return {
  reelSet,
  onSpin: async () => {
    // Stage 0: cluster of CLUSTER on row 2, cols 0–2.
    const stage0 = Array.from({ length: REELS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) =>
        r === HIT_ROW && HIT_COLS.includes(c) ? CLUSTER : randSymbol(CLUSTER)
      )
    );

    // Moment A — initial spin lands the stage-0 cluster, left-to-right reveal.
    reelSet.setDropOrder('ltr');
    const spinDone = reelSet.spin();
    await new Promise(r => setTimeout(r, 200));
    reelSet.setResult(stage0);
    await spinDone;
    await new Promise(r => setTimeout(r, 300));

    // Moment B — cascade refill driven entirely by runCascade. The
    // first call to detectWinners returns the planted cluster; the second
    // returns [] (no more wins on the post-refill grid), ending the chain.
    // The orchestration (destroy → pause → refill → re-detect) is library-owned.
    reelSet.setDropOrder('all');
    let detected = false;
    await reelSet.runCascade({
      detectWinners: () => {
        if (detected) return [];
        detected = true;
        return HIT_COLS.map(c => ({ reel: c, row: HIT_ROW }));
      },
      nextGrid: (prev, winners) => {
        // Survivors slide down 1; new symbol at row 0.
        const next = prev.map(col => [...col]);
        for (const w of winners) {
          for (let r = w.row; r > 0; r--) next[w.reel][r] = next[w.reel][r - 1];
          next[w.reel][0] = randSymbol(CLUSTER);
        }
        return next;
      },
      pauseAfterDestroyMs: 250,
    });
  },
};
