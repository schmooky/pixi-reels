// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, PIXI, gsap,
//           app, textures, blurTextures, SYMBOL_IDS, pickWeighted

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1';
const IDS = [A, B, C, SEVEN];
const COLS = 5, ROWS = 3, SIZE = 90;

// Three full rows of different symbols — three visible paylines.
const GRID = [
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
  [SEVEN, B, C],
];

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

// Scale a symbol's view from its visual center (view origin is top-left).
function scaleFromCenter(view, target, duration) {
  return new Promise(resolve => {
    const b = view.getLocalBounds();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const ox = view.pivot.x, oy = view.pivot.y, px = view.x, py = view.y;
    view.pivot.set(cx, cy);
    view.x = px + (cx - ox);
    view.y = py + (cy - oy);
    gsap.to(view.scale, {
      x: target, y: target, duration, ease: 'back.out(2)',
      onComplete: () => {
        gsap.to(view.scale, {
          x: 1, y: 1, duration: duration * 0.7, ease: 'power2.inOut',
          onComplete: () => { view.pivot.set(ox, oy); view.x = px; view.y = py; resolve(); },
        });
      },
    });
  });
}

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise(r => setTimeout(r, 150));
    reelSet.setResult(GRID);
    await p;
    await new Promise(r => setTimeout(r, 240));

    for (let row = 0; row < ROWS; row++) {
      // Dim non-winners, highlight this row.
      for (let r = 0; r < COLS; r++) {
        for (let ro = 0; ro < ROWS; ro++) {
          gsap.to(reelSet.getReel(r).getSymbolAt(ro).view, { alpha: ro === row ? 1 : 0.25, duration: 0.2 });
        }
      }
      // Sweep scale pulse left-to-right.
      for (let r = 0; r < COLS; r++) {
        void scaleFromCenter(reelSet.getReel(r).getSymbolAt(row).view, 1.22, 0.18);
        await new Promise(res => setTimeout(res, 80));
      }
      await new Promise(r => setTimeout(r, 480));
    }

    // Restore all.
    for (let r = 0; r < COLS; r++) {
      for (let ro = 0; ro < ROWS; ro++) {
        gsap.to(reelSet.getReel(r).getSymbolAt(ro).view, { alpha: 1, duration: 0.2 });
      }
    }
  },
};
