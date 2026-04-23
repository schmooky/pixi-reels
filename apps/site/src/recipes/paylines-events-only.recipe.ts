// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, WinPresenter,
//           paylineToCells, PIXI, gsap, app, textures, blurTextures.

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

// Our own line layer sits above the viewport. Using PIXI directly so this
// recipe shows the DIY path: no LineRenderer, no dimLosers — just events.
const lineLayer = new PIXI.Container();
reelSet.addChild(lineLayer);

// Subscribe to win:line and draw a dashed line ourselves. This path is for
// teams who want full control over the line look and lifecycle — no
// LineRenderer needed.
reelSet.events.on('win:line', (payline, cells) => {
  const gfx = new PIXI.Graphics();
  gfx.zIndex = payline.lineId;
  const color = payline.lineId === 0 ? 0xffe04a : 0x33d1ff;
  const pts = cells.map(c => {
    const b = reelSet.getCellBounds(c.reelIndex, c.rowIndex);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  gfx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
  gfx.stroke({ color, width: 6, alpha: 0.95 });
  lineLayer.addChild(gfx);
  // Pulse the line once with GSAP, then fade out on the next cycle.
  gsap.fromTo(gfx, { alpha: 0 }, { alpha: 1, duration: 0.18, ease: 'power1.out' });
  gsap.to(gfx, { alpha: 0, duration: 0.3, delay: 1.0, onComplete: () => gfx.destroy() });
});

// Scale a symbol's view container from its visual centre. The view is
// positioned at the cell's top-left, so a naive gsap.to on view.scale
// grows from the top-left corner. Move the pivot to the local bounds
// centre and compensate position; revert at the end.
function scaleFromCenter(view, peak, durationMs) {
  const b = view.getLocalBounds();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const ox = view.pivot.x, oy = view.pivot.y, px = view.x, py = view.y;
  view.pivot.set(cx, cy);
  view.x = px + (cx - ox);
  view.y = py + (cy - oy);
  gsap.to(view.scale, {
    x: peak, y: peak, duration: durationMs / 1000,
    yoyo: true, repeat: 1, ease: 'sine.inOut',
    onComplete: () => { view.pivot.set(ox, oy); view.x = px; view.y = py; },
  });
}

// Listen to win:symbol for per-cell side effects. Here we give each winner
// a brief scale pulse — the presenter still calls playWin(), this is purely
// decoration on top.
reelSet.events.on('win:symbol', (symbol) => {
  scaleFromCenter(symbol.view, 1.1, 120);
});

// Presenter without any lineRenderer — we draw lines ourselves in the
// event handler above. dimLosers stays on for the nice focus effect.
const presenter = new WinPresenter(reelSet, { cycleGap: 700 });
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
  cleanup: () => { presenter.destroy(); lineLayer.destroy({ children: true }); },
};
