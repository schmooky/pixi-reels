// @ts-nocheck
// Injected: HoldAndWinBuilder, CloverSymbol, loadHwClover, CLOVER_CELL_RADIUS,
//           CLOVER_SPEED, cloverCellMask, PIXI, gsap, app
//
// DIMMING THE ART IS NOT DIMMING THE CELL. One clover slot, blown up, holding
// a cherry - non-clover, and drawn small - so the cell's own background shows
// all the way around the symbol.
//
// That background is `cellChrome()`: the board draws it, it is not a symbol.
// `dimSymbols()` only ever touches symbol views, so the plate stays exactly as
// bright as it started however hard the cherry sinks. `dim()` lays a rectangle
// over the whole cell, so the plate goes down with it.
//
// The last beat is the corollary. Swap the cell to the EMPTY id and there is
// no art left to dim, so `dimSymbols()` changes nothing at all: not the cherry
// that has gone, and not the plate, which was never its business. Which is
// also the thing to watch out for - if your blank tile is a registered SYMBOL
// (as it is in the other clover recipes, where the dark tile is the `empty`
// id) then it IS art and `dimSymbols()` dims it with everything else. Draw
// whatever must stay lit in `cellChrome()`.

const CELL = { width: 320, height: 269 };
const C = { reel: 0, cell: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const art = await loadHwClover();

const board = new HoldAndWinBuilder()
  .grid(1, 1)
  .cellSize(CELL)
  // The cell's own background: board chrome, not a symbol. A fat lit frame
  // and an inner plate, so there is plenty of it to watch.
  .cellChrome((g, w, h) => {
    const r = CLOVER_CELL_RADIUS * 3;
    g.roundRect(0, 0, w, h, r).fill({ color: 0x4d7fd6 });
    g.roundRect(6, 6, w - 12, h - 12, r - 4).fill({ color: 0x2b4f96 });
    g.roundRect(26, 26, w - 52, h - 52, r - 10).fill({ color: 0x16264a });
  })
  .symbols((r) => {
    // Non-clover on purpose, and a cherry rather than a melon: the clover set
    // scales every frame by the same factor, so a small-authored symbol stays
    // small in the cell and leaves the plate visible around it.
    r.register('cherry', CloverSymbol, { art, idleAfterLand: false });
  })
  // No art registered under this id, so the board auto-registers the library's
  // EmptySymbol: a symbol with nothing in it.
  .emptyId('blank')
  .speedProfile(CLOVER_SPEED)
  .cellMask(cloverCellMask)
  .respins(3)
  .ticker(app.ticker)
  .build();

board.container.position.set(
  (app.screen.width - CELL.width) / 2,
  (app.screen.height - CELL.height) / 2 - 16,
);
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + CELL.height + 22);
app.stage.addChild(hud);

/** Hold a dim of `which` channel at `amount` for a beat, then let it go. */
async function hold(which, amount, note) {
  const undim = which === 'symbols'
    ? board.dimSymbols({ amount, fade: 200 })
    : board.dim({ amount, fade: 200 });
  try {
    hud.text = note;
    await sleep(1100);
  } finally {
    undim();
  }
  await sleep(420); // let the fade out land before the next beat starts
}

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();
    board.enter([{ cell: C, id: 'cherry' }]);
    hud.text = 'at rest - blue plate is cellChrome(), cherry is the symbol';
    await sleep(900);

    // Strength is `amount`, and it only ever reaches the cherry. Watch the
    // plate: it does not move through any of these three.
    for (const amount of [0.3, 0.6, 0.9]) {
      await hold('symbols', amount, `dimSymbols({ amount: ${amount} }) - cherry sinks, plate untouched`);
    }

    // Same strength, other channel: now the plate goes down too.
    await hold('cells', 0.6, 'dim({ amount: 0.6 }) - the rectangle covers the cell, plate and all');

    // And the corollary: no art in the cell, nothing for dimSymbols to do.
    board.setSymbolAt(C, 'blank');
    hud.text = 'cell swapped to the empty id - no art left in it';
    await sleep(700);
    await hold('symbols', 0.9, 'dimSymbols({ amount: 0.9 }) on an empty cell - nothing changes, not even the plate');

    board.setSymbolAt(C, 'cherry');
    hud.text = 'released - press spin to compare again';
    busy = false;
  },
};
