// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// NUDGE → SPOTLIGHT pattern.
//
// The handler lands a flat near-miss, nudges three reels down by one so
// the centre cell turns into WILD-WILD-WILD, then runs SymbolSpotlight on
// the new winning line. Demonstrates the canonical "rescue spin via
// nudge, then celebrate" beat.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col3 = () => [filler(), filler(), filler()];

const NUDGE_COLS = [1, 2, 3];
const NUDGE_DURATION = 380;
const WIN_ROW = 0; // After down-nudge, incoming[0] lands at visible cell 0.

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleCells(3)
  .symbolSize(72, 72)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, {
        color: sym.color,
        label: sym.label,
        textColor: sym.textColor,
      });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    // 1. Land on a near-miss: no wilds anywhere.
    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
    await p;
    await new Promise((resolve) => setTimeout(resolve, 320));

    // 2. Parallel nudge of the middle three reels. `wild` lands at the
    //    top of each nudged column. After this, visible cell 0 reads
    //    [..., wild, wild, wild, ...].
    await Promise.all(
      NUDGE_COLS.map((reel) =>
        reelSet.nudge(reel, {
          distance: 1,
          direction: 'forward',
          incoming: ['wild'],
          duration: NUDGE_DURATION,
        }),
      ),
    );

    // 3. Spotlight the new win line. `spotlight.show` re-parents the
    //    winning symbols above the reel mask, dims the rest of the
    //    viewport, and runs each symbol's `playWin()` animation. Resolves
    //    once the animation chain completes. at which point `hide()`
    //    returns the symbols to their reels.
    const winners = NUDGE_COLS.map((reel) => ({ reelIndex: reel, cell: WIN_ROW }));
    await reelSet.spotlight.show(winners, {
      dimAmount: 0.6,
      playWinAnimation: true,
    });
    reelSet.spotlight.hide();
  },
};
