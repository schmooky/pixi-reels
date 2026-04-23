// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, WinPresenter,
//           GraphicsLineRenderer, PIXI, gsap, app, textures, blurTextures.

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1';
const IDS = [A, B, C, SEVEN];
const COLS = 5, ROWS = 3, SIZE = 90;

const GRID = [
  [SEVEN, B, C], [SEVEN, B, C], [SEVEN, B, C], [SEVEN, B, C], [SEVEN, B, C],
];

const PAYLINES = [
  { lineId: 0, line: [0, 0, 0, 0, 0], value: 300 },
  { lineId: 1, line: [1, 1, 1, 1, 1], value: 100 },
];

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

// Scale pulse from the symbol's visual centre. SpriteSymbol anchors at
// top-left, so we pivot to the local bounds centre and compensate position.
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
// The callback receives the symbol, the cell, and the owning payline — so
// you can style per payline (e.g. bigger bounce on the premium line).
const presenter = new WinPresenter(reelSet, {
  lineRenderer: new GraphicsLineRenderer({ width: 5 }),
  cycleGap: 400,
  symbolAnim: async (symbol, _cell, payline) => {
    const peak = payline.lineId === 0 ? 1.35 : 1.18;
    await bouncePulse(symbol.view, peak, 220);
  },
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
    await presenter.show(PAYLINES);
  },
  cleanup: () => presenter.destroy(),
};
