// @ts-nocheck
// Injected: BoardGrid, BlurSpriteSymbol, SpeedPresets, loadHoldAndWinSprites, PIXI, gsap, app
//
// A board built DIRECTLY on the generic BoardGrid primitive — no HoldAndWinBuilder
// in sight. BoardGrid is the "board of reels" mechanism: a grid of cells that each
// spin independently. Hold & Win is ONE opinionated feature on top of it; this is a
// different one — a "reveal & collect" prize grid. Press spin and every cell spins
// at once to a random prize, then the values tally and the top cell pops. No locking,
// no respins — those are Hold & Win's rules, and they live in Hold & Win's code, not
// here. You own the rule; the primitive just spins the cells you tell it to.

const COLS = 5, ROWS = 3, CELL = 72, GAP = 6;

const { symbols, blur } = await loadHoldAndWinSprites();
const PRIZE = { '1': 1, '2': 2, '3': 5, '4': 10, '5': 20, '6': 50, '7': 100, '8': 250 };
const IDS = Object.keys(PRIZE);

class BlurCell extends BlurSpriteSymbol {
  onReelSpinStart() { this.setBlurred(true); }
  onReelLanded() { this.setBlurred(false); }
}

// Build your own board: a grid of independent reels. That is the whole primitive.
const grid = new BoardGrid({
  cols: COLS,
  rows: ROWS,
  cellSize: CELL,
  gap: GAP,
  symbols: (r) => { for (const id of IDS) r.register(id, BlurCell, { textures: symbols, blurTextures: blur }); },
  weights: Object.fromEntries(IDS.map((id) => [id, 1])),
  // A per-cell profile is just a function of the cell — here, a diagonal wave.
  profiles: { wave: (cell) => ({ ...SpeedPresets.NORMAL, minimumSpinTime: 300 + (cell.col + cell.row) * 55 }) },
  ticker: app.ticker,
});

const boardW = COLS * CELL + (COLS - 1) * GAP;
const boardH = ROWS * CELL + (ROWS - 1) * GAP;
grid.container.x = (app.screen.width - boardW) / 2;
grid.container.y = (app.screen.height - boardH) / 2 - 6;
app.stage.addChild(grid.container);

// A highlight ring we move onto the top-prize cell — pure game-layer art, drawn
// with geometry the primitive hands out (cellBounds / cellCenter).
const ring = new PIXI.Graphics();
grid.container.addChild(ring);
ring.visible = false;

const hud = new PIXI.Text({ text: 'press spin to reveal', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, grid.container.y + boardH + 12);
app.stage.addChild(hud);

let busy = false;
return {
  cleanup: () => { try { gsap.killTweensOf(ring); } catch {} grid.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    ring.visible = false;
    hud.text = 'revealing…';

    // YOU decide every result; the primitive just spins each cell to its id.
    const targets = grid.cells().map((cell) => ({ cell, id: IDS[Math.floor(Math.random() * IDS.length)] }));
    await grid.spinCells(targets); // onLanded is optional — omit it and just await

    // The rule is yours: tally the prizes and find the top cell.
    let total = 0;
    let top = targets[0];
    for (const t of targets) {
      total += PRIZE[t.id];
      if (PRIZE[t.id] > PRIZE[top.id]) top = t;
    }

    // Pop the winner using the live instance + the cell's geometry.
    grid.symbolAt(top.cell).playWin?.();
    const b = grid.cellBounds(top.cell);
    ring.clear().roundRect(b.x - 2, b.y - 2, b.width + 4, b.height + 4, 10).stroke({ color: 0xffd166, width: 3, alpha: 0.95 });
    ring.visible = true;
    gsap.fromTo(ring, { alpha: 0 }, { alpha: 1, duration: 0.25 });

    hud.text = `revealed · total ${total} · top ${PRIZE[top.id]} (${top.id})`;
    busy = false;
  },
};
