// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// Nudging a set that runs sideways.
//
// A reel is a screen ROW here, and its cells run left to right, so a nudge
// shifts a row sideways instead of a column vertically. Nothing about the call
// changes: `direction` is relative to the reel's own axis ('forward' is
// whichever way it normally spins, rightward on this set) and `incoming` is
// still listed in start-to-end order, which reads left-to-right rather than
// top-down.
//
// One press shows both feed edges:
//   1. Reel 0 forward by 1  - the strip travels right, a wild enters at the
//      LEFT edge.
//   2. Reel 2 reverse by 1  - the strip travels left, a wild enters at the
//      RIGHT edge.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const REELS = 3;  // 3 rows
const CELLS = 5;  // 5 cells along each row
const SIZE = 76;

const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const row = () => Array.from({ length: CELLS }, filler);

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
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
  .weights(Object.fromEntries(FILLER.map((id) => [id, 1])))
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

return {
  reelSet,
  onSpin: async () => {
    // Land flat: no wilds anywhere.
    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult(Array.from({ length: REELS }, () => ({ visible: row() })));
    await p;
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Travel-direction nudge: content slides toward the end edge (right),
    // so the new cell arrives at cell 0 - the left of the screen.
    await reelSet.nudge(0, {
      distance: 1,
      direction: 'forward',
      incoming: ['wild'],
      duration: 420,
    });

    // Against-travel nudge on another row: the new cell arrives at the last
    // cell instead, on the right.
    await reelSet.nudge(2, {
      distance: 1,
      direction: 'reverse',
      incoming: ['wild'],
      duration: 420,
    });
  },
};
