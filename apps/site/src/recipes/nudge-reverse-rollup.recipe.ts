// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// Nudge on a roll-up set, used to complete a line.
//
// `NudgeOptions.direction` is relative to the reel's OWN axis, not to the
// screen. These reels are built `.direction('reverse')`, so 'forward' shifts
// the strip UP and new symbols arrive at the BOTTOM. `incoming` is still
// listed start-to-end (top-down), which means the single id below lands at
// the LAST visible cell, not the first.
//
// The mechanic: two wilds land on the middle line and the third stops one
// cell short, just below it. One 'forward' nudge rolls that reel up by one
// and the wild arrives on the line, which then spotlights.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const REELS = 5, CELLS = 3, SIZE = 84;
const LINE = 1;          // the middle line
const TARGET = 2;        // the reel that stops one cell short
const WILD = WILD_CARD.id;

const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col = () => Array.from({ length: CELLS }, filler);

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .direction('reverse') // roll-up: symbols rise from below
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, {
        color: sym.color,
        label: sym.label,
        textColor: sym.textColor,
      });
    }
  })
  .weights(Object.fromEntries(FILLER.map((id) => [id, 1])))
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    reelSet.spotlight.hide();

    const grid = Array.from({ length: REELS }, () => col());
    grid[0][LINE] = WILD;
    grid[1][LINE] = WILD;
    // The near miss: the third wild lands one cell BELOW the line, which is
    // the direction this reel travels from.
    grid[TARGET][LINE + 1] = WILD;

    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult(grid.map((visible) => ({ visible })));
    await p;
    await new Promise((resolve) => setTimeout(resolve, 550));

    // One cell 'forward' = one cell up on a reverse reel. Every cell shifts
    // toward cell 0, so the wild moves from cell 2 onto the line, and the
    // incoming filler fills the vacated bottom cell.
    await reelSet.nudge(TARGET, {
      distance: 1,
      direction: 'forward',
      incoming: [filler()],
      duration: 420,
    });

    await reelSet.spotlight.show(
      [0, 1, TARGET].map((reelIndex) => ({ reelIndex, cellIndex: LINE })),
      { playWinAnimation: true },
    );
  },
};
