// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, WinPresenter,
//           PIXI, gsap, app, textures, blurTextures, SYMBOL_IDS, pickWeighted.

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1';
const IDS = [A, B, C, SEVEN];
const COLS = 5, ROWS = 3, SIZE = 90;

// Three full rows of the same symbol per column — three paylines across rows.
const GRID = [
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
];

// A "win" is just cells + optional value. Order = left-to-right so the
// stagger option below sweeps cleanly across each payline.
const WINS = [0, 1, 2].map((row) => ({
  id: row,
  cells: Array.from({ length: COLS }, (_, reelIndex) => ({ reelIndex, rowIndex: row })),
  value: [300, 100, 60][row],
}));

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

// One presenter. No line drawing — the presenter only highlights the
// symbols. If you want a payline polyline, draw it from `win:group` (see
// paylines-events-only recipe). Defaults: dim non-winners to 0.35,
// cycle once, sorted by value desc.
const presenter = new WinPresenter(reelSet, {
  stagger: 70,        // ms between cells — a left-to-right sweep
  cycleGap: 350,      // ms between successive wins
});

reelSet.events.on('spin:start', () => presenter.abort());

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(GRID);
    await p;
    await new Promise(r => setTimeout(r, 220));
    await presenter.show(WINS);
  },
  cleanup: () => presenter.destroy(),
};
