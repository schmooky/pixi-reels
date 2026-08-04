// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, PIXI, app, pickWeighted

// The same board twice: four reels of three cells, vertical on the left and
// horizontal on the right, landing the SAME grid on every spin.
//
// One symbol registration serves both. `CardSymbol` knows nothing about the
// axis, and neither should yours - the only thing that differs between the two
// builds is that `symbolSize` swaps its two numbers, because it is screen space
// and a horizontal board is the vertical one transposed.
//
//   vertical:   .symbolSize(CELL_W, CELL_H)
//   horizontal: .symbolSize(CELL_H, CELL_W)
//
// The cards land in the same index order in both, and every glyph stays
// upright in both. Facing is not derived from travel.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const weights = { '7': 20, '8': 18, '9': 16, '10': 12, J: 10, Q: 8, K: 6, A: 5, wild: 3 };
const registerAll = (r) => {
  for (const s of SYMBOLS) {
    r.register(s.id, CardSymbol, { color: s.color, label: s.label, textColor: s.textColor });
  }
};

const REELS = 4;
const CELLS = 3;
const CELL_W = 72;
const CELL_H = 54;
const GAP = 6;

const common = (b) =>
  b
    .reels(REELS)
    .visibleCells(CELLS)
    .symbolGap(GAP, GAP)
    .symbols(registerAll)
    .weights(weights)
    .speed('normal', SpeedPresets.NORMAL)
    .ticker(app.ticker);

const vertical = common(new ReelSetBuilder().symbolSize(CELL_W, CELL_H)).build();
const horizontal = common(
  new ReelSetBuilder().orientation('horizontal').symbolSize(CELL_H, CELL_W),
).build();

// Both sets in ONE container, laid out from its own top-left, returned as
// `stage` so the runner scales and centres the pair together.
const V_W = REELS * CELL_W + (REELS - 1) * GAP;
const V_H = CELLS * CELL_H + (CELLS - 1) * GAP;
const H_H = REELS * CELL_W + (REELS - 1) * GAP;
const LABEL_H = 20;

const stage = new PIXI.Container();
const label = (text, x) => {
  const t = new PIXI.Text({
    text,
    style: { fontFamily: 'monospace', fontSize: 12, fill: 0xff6b35 },
  });
  t.position.set(x, 0);
  return t;
};
vertical.position.set(0, LABEL_H + (H_H - V_H) / 2);
horizontal.position.set(V_W + 40, LABEL_H);
stage.addChild(
  label('vertical', 0),
  label('horizontal', V_W + 40),
  vertical,
  horizontal,
);

return {
  reelSet: vertical,
  stage,
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => pickWeighted(weights)),
    ).map((visible) => ({ visible }));

    const pv = vertical.spin();
    const ph = horizontal.spin();
    await new Promise((r) => setTimeout(r, 150));
    // Identical ColumnTarget[] into both. Index space is orientation-neutral.
    vertical.setResult(grid);
    horizontal.setResult(grid);
    await Promise.all([pv, ph]);
  },
  cleanup: () => horizontal.destroy(),
};
