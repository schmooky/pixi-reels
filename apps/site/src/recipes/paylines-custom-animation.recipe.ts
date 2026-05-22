// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, WinPresenter, PIXI, gsap, app, pickWeighted

const A = '7', B = '8', C = '9';
const SEVEN = 'A'; // premium card stand-in for the original royal "seven"
const IDS = [A, B, C, SEVEN];
const COLS = 5, ROWS = 3, SIZE = 90;

const GRID = [
  [SEVEN, B, C], [SEVEN, B, C], [SEVEN, B, C], [SEVEN, B, C], [SEVEN, B, C],
];

const WINS = [0, 1, 2].map((row) => ({
  id: row,
  cells: Array.from({ length: COLS }, (_, reelIndex) => ({ reelIndex, rowIndex: row })),
  value: [300, 100, 60][row],
}));

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleRows(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => {
    for (const sym of [...CARD_DECK, WILD_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

// Scale pulse from the symbol's visual centre. SpriteSymbol anchors at
// top-left, so pivot to the local bounds centre and compensate position.
function bouncePulse(view, peak, durationMs) {
  return new Promise(resolve => {
    const b = view.getLocalBounds();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const ox = view.pivot.x, oy = view.pivot.y, px = view.x, py = view.y;
    view.pivot.set(cx, cy);
    view.x = px + (cx - ox);
    view.y = py + (cy - oy);
    const restore = () => { view.pivot.set(ox, oy); view.x = px; view.y = py; };
    gsap.to(view.scale, {
      x: peak, y: peak, duration: durationMs / 1000, ease: 'back.out(2.4)',
      onComplete: () => gsap.to(view.scale, {
        x: 1, y: 1, duration: (durationMs * 0.7) / 1000, ease: 'power2.inOut',
        onComplete: () => { restore(); resolve(); },
      }),
    });
  });
}

// Instead of `symbol.playWin()`, route each winner through a GSAP timeline.
// The callback receives the symbol, the cell, and the owning win. so you
// can style per win (bigger bounce on the premium line via `win.id`).
const presenter = new WinPresenter(reelSet, {
  stagger: 70,
  cycleGap: 400,
  symbolAnim: async (symbol, _cell, win) => {
    const peak = win.id === 0 ? 1.35 : 1.18;
    await bouncePulse(symbol.view, peak, 220);
  },
});

reelSet.events.on('spin:start', () => presenter.abort());

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(GRID.map((visible) => ({ visible })));
    await p;
    await new Promise(r => setTimeout(r, 220));
    await presenter.show(WINS);
  },
  cleanup: () => presenter.destroy(),
};
