// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// An expanding wild on a set that runs sideways.
//
// Pins are pure index space - `pin(reel, cell, id)` names a reel and a cell,
// and the engine maps that onto the screen through the axis. So "the wild
// expands over its whole reel" is the same code on both orientations; it just
// paints a screen ROW here instead of a column, because a horizontal reel
// marches down the Y axis and its cells run along X.
//
// The pin lifecycle is unchanged too: `turns: 3` keeps the expansion alive for
// three more spins, and the engine expires it at zero.

const REELS = 3;  // 3 rows
const CELLS = 5;  // 5 cells along each row
const SIZE = 76;
const WILD = WILD_CARD.id;
const STICKY_TURNS = 3;
const FILLER = ['7', '8', '10', 'Q'];

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights(Object.fromEntries(FILLER.map((id) => [id, 1])))
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// Any reel showing a wild turns wild end to end, for STICKY_TURNS spins. The
// engine counts the turns down on every `spin:allLanded` and expires the pins
// itself.
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let reel = 0; reel < symbols.length; reel++) {
    if (!symbols[reel].includes(WILD)) continue;
    for (let cell = 0; cell < symbols[reel].length; cell++) {
      if (!reelSet.getPin(reel, cell)) {
        reelSet.pin(reel, cell, WILD, { turns: STICKY_TURNS });
      }
    }
  }
});

// Scripted: the wild alternates between the top row and the bottom one.
const wildReels = [0, 2];
let spinCount = 0;

return {
  reelSet,
  nextResult: () => {
    const reel = wildReels[spinCount % wildReels.length];
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    grid[reel][2] = WILD; // middle cell of the chosen row
    spinCount++;
    return grid;
  },
};
