// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, AnimatedSpriteSymbol, WinPresenter,
//           loadPixellabSymbols, PIXI, gsap, app, pickWeighted.
//
// Uses the five pixel-art symbols generated via pixellab.ai:
//   cherry, lemon…wait, we have: cherry, seven, bell, diamond, bar.
// Each has a base.png + 8 animation frames produced by
// `scripts/gen-pixellab-symbols.mjs`. See the recipe copy for the workflow.

const IDS = ['cherry', 'seven', 'bell', 'diamond', 'bar'];
const COLS = 5, ROWS = 3, SIZE = 96;

// Load the pixellab-generated frames. Returns:
//   frames: Record<symbolId, Texture[]>  — per-symbol animation frames
//   base:   Record<symbolId, Texture>    — single still texture per symbol
const { frames } = await loadPixellabSymbols(IDS);

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(6, 6)
  .symbols(r => {
    // The same `frames` map is handed to every registration — AnimatedSpriteSymbol
    // picks the right Texture[] by symbolId inside onActivate().
    for (const id of IDS) {
      r.register(id, AnimatedSpriteSymbol, {
        frames,
        animationSpeed: 0.35,   // ~21 fps at 60 fps ticker
        anchor: { x: 0.5, y: 0.5 },
      });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker).build();

// Fill each reel so the board lands with lots of hits.
function makeGrid() {
  return Array.from({ length: COLS }, () =>
    Array.from({ length: ROWS }, () => IDS[Math.floor(Math.random() * IDS.length)])
  );
}

// After landing, take every "seven" on screen and fire win:* on them so
// their AnimatedSpriteSymbol plays the full frame sequence via playWin().
const presenter = new WinPresenter(reelSet, { stagger: 60, dimLosers: { alpha: 0.35 } });
reelSet.events.on('spin:start', () => presenter.abort());

function collectCells(targetId, grid) {
  const cells = [];
  for (let r = 0; r < COLS; r++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[r][row] === targetId) cells.push({ reelIndex: r, rowIndex: row });
    }
  }
  return cells;
}

return {
  reelSet,
  onSpin: async () => {
    const grid = makeGrid();
    // Seed a guaranteed "seven" cluster so the demo always has something
    // to celebrate — three in a diagonal.
    grid[0][0] = 'seven'; grid[1][1] = 'seven'; grid[2][2] = 'seven';

    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(grid);
    await p;
    await new Promise(r => setTimeout(r, 220));

    const sevenCells = collectCells('seven', grid);
    const cherryCells = collectCells('cherry', grid);
    const wins = [];
    if (sevenCells.length >= 3) wins.push({ id: 0, cells: sevenCells, value: 500 });
    if (cherryCells.length >= 3) wins.push({ id: 1, cells: cherryCells, value: 100 });
    if (wins.length > 0) await presenter.show(wins);
  },
  cleanup: () => presenter.destroy(),
};
