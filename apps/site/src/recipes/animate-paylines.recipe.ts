// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, WinPresenter,
//           GraphicsLineRenderer, paylineToCells, PIXI, gsap, app, textures,
//           blurTextures, SYMBOL_IDS, pickWeighted.

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1';
const IDS = [A, B, C, SEVEN];
const COLS = 5, ROWS = 3, SIZE = 90;

// Three full rows of the same symbol — three paylines the presenter cycles.
const GRID = [
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
];

// Server response: three straight-across paylines, values descending so the
// presenter shows the premium (row 0) first by default.
const PAYLINES = [
  { lineId: 0, line: [0, 0, 0, 0, 0], value: 300 },
  { lineId: 1, line: [1, 1, 1, 1, 1], value: 100 },
  { lineId: 2, line: [2, 2, 2, 2, 2], value:  60 },
];

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

// One presenter lives for the lifetime of the reel set. Default config:
//   - GraphicsLineRenderer draws a 4px polyline through cell centres
//   - dim losers to 0.35 alpha
//   - cycle each payline once, 400 ms gap, sorted by value desc
//   - symbol animation is the symbol's own `playWin()`
const presenter = new WinPresenter(reelSet, {
  lineRenderer: new GraphicsLineRenderer({ width: 5, drawOnMs: 260 }),
  cycleGap: 350,
});

// Aborting on the next spin is the canonical pattern — users can slam-spin
// mid-celebration without leaking a line on screen.
reelSet.events.on('spin:start', () => presenter.abort());

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(GRID);
    await p;
    await new Promise(r => setTimeout(r, 220));
    await presenter.show(PAYLINES);
  },
  cleanup: () => presenter.destroy(),
};
