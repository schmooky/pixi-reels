// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// A sticky-wild respin round on a ROLL-UP set.
//
// The reels travel upward (`.direction('reverse')`), the wilds do not move at
// all. Pin coordinates are geometric: cell 0 is the TOP cell whichever edge
// the strip feeds from, so nothing about the pin calls changes when the
// direction flips. While the round runs, each pinned cell is drawn by an
// overlay that holds its position as the strip rolls past behind it.
//
// The round: any wild that lands is pinned for the rest of the round, three
// respins follow, wilds picked up on the way stick too, and the pins are
// released when the round ends.

const REELS = 5, CELLS = 3, SIZE = 84;
const WILD = WILD_CARD.id;
const RESPINS = 3;
const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col = () => Array.from({ length: CELLS }, filler);

const reelSet = new ReelSetBuilder()
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .direction('reverse')
  .symbols((r) => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .weights(Object.fromEntries(FILLER.map((id) => [id, 1])))
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

// Grid with wilds planted at the given cells.
function gridWith(cells) {
  const grid = Array.from({ length: REELS }, () => col());
  for (const { reel, cell } of cells) grid[reel][cell] = WILD;
  return grid.map((visible) => ({ visible }));
}

// Pin every wild the landing shows. `turns: 'permanent'` is the default; the
// round releases them itself at the end.
function pinLandedWilds() {
  const grid = reelSet.getVisibleGrid();
  for (let reel = 0; reel < REELS; reel++) {
    for (let cell = 0; cell < CELLS; cell++) {
      if (grid[reel][cell] === WILD && !reelSet.getPin(reel, cell)) {
        reelSet.pin(reel, cell, WILD, { turns: 'permanent' });
      }
    }
  }
}

async function land(cells) {
  const p = reelSet.spin();
  await new Promise((r) => setTimeout(r, 220));
  reelSet.setResult(gridWith(cells));
  await p;
  pinLandedWilds();
}

// Scripted round: two wilds trigger, one more arrives on the second respin.
const TRIGGER = [{ reel: 1, cell: 0 }, { reel: 3, cell: 2 }];
const RESPIN_HITS = [[], [{ reel: 2, cell: 1 }], []];

let busy = false;
return {
  reelSet,
  onSpin: async () => {
    if (busy) return;
    busy = true;
    try {
      // Release last round's pins. Copy the map first: unpin mutates it.
      for (const pin of [...reelSet.pins.values()]) reelSet.unpin(pin.reel, pin.cell);

      await land(TRIGGER);
      await new Promise((r) => setTimeout(r, 500));

      for (let i = 0; i < RESPINS; i++) {
        await land(RESPIN_HITS[i] ?? []);
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      busy = false;
    }
  },
};
