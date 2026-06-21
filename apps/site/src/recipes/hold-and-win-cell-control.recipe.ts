// @ts-nocheck
// Injected: HoldAndWinBuilder, AnimatedSpriteSymbol, loadHoldAndWinSprites, PIXI, gsap, app
//
// Driving each cell on its own.
//
// Every Hold & Win cell is its own 1×1 ReelSet, so the board hands you the
// raw reel with `board.reelAt(cell)`: start it, stop it, read the symbol
// inside it — independently of every other cell. This demo starts three
// cells with a stagger (each on its own clock), slam-stops the third the
// instant it starts, and then flashes the landed coins via `symbolAt(cell)`.

const COIN = 'coin', EMPTY = 'empty';
const CELL = 96, GAP = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { coin } = await loadHoldAndWinSprites();

const board = new HoldAndWinBuilder()
  .grid(3, 1)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => r.register(COIN, AnimatedSpriteSymbol, { frames: { [COIN]: coin }, animationSpeed: 0.6, anchor: { x: 0.5, y: 0.5 } }))
  .weights({ [COIN]: 1, empty: 2 })
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 }))
  .ticker(app.ticker)
  .build();

const boardW = 3 * CELL + 2 * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - CELL) / 2 - 8;
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + CELL + 16);
app.stage.addChild(hud);

const CELLS = [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }];
// land coins on the first two cells, leave the third empty
const LAND = [COIN, COIN, EMPTY];

// spin one cell on its own clock and land it on `id`
function spinCell(cell, id) {
  const reel = board.reelAt(cell);          // <-- the cell's own ReelSet
  const settle = reel.spin();
  reel.setResult([{ visible: [id], bufferAbove: [EMPTY], bufferBelow: [EMPTY] }]);
  return settle;
}

let busy = false;
return {
  cleanup: () => { try { hud.destroy(); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    board.reset();

    // 1) START each cell independently, staggered — three separate clocks
    hud.text = 'starting cell 0…';
    const s0 = spinCell(CELLS[0], LAND[0]);
    await sleep(260);
    hud.text = 'starting cell 1…';
    const s1 = spinCell(CELLS[1], LAND[1]);
    await sleep(260);
    hud.text = 'starting cell 2 — and slam-stopping it';
    const s2 = spinCell(CELLS[2], LAND[2]);

    // 2) STOP a single cell on command (the others keep spinning)
    board.reelAt(CELLS[2]).skipSpin();

    await Promise.all([s0, s1, s2]);

    // 3) ACCESS the symbol inside each cell and flash the coins
    hud.text = 'landed — flashing the coins via symbolAt(cell)';
    for (const cell of CELLS) {
      const sym = board.symbolAt(cell);       // <-- the live symbol instance
      await sym.playWin?.().catch?.(() => {});
    }
    hud.text = 'each cell: started, stopped and read on its own · press spin';
    busy = false;
  },
};
