// @ts-nocheck
// Injected: ReelSetBuilder, SpeedPresets, BlurSpriteSymbol, WinPresenter,
//           PIXI, gsap, app, textures, blurTextures.
//
// This recipe shows the "events + getCellBounds" path: WinPresenter only
// animates symbols; you draw every per-win visual (lines, outlines,
// numbers) yourself by subscribing to `win:group` / `win:symbol`.

const A = 'round/round_1', B = 'round/round_2', C = 'round/round_3';
const SEVEN = 'royal/royal_1';
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

const LINE_COLORS = [0xffe04a, 0x33d1ff, 0xff7aa2];

const reelSet = new ReelSetBuilder()
  .reels(COLS).visibleSymbols(ROWS).symbolSize(SIZE, SIZE).symbolGap(4, 4)
  .symbols(r => { for (const id of IDS) r.register(id, BlurSpriteSymbol, { textures, blurTextures }); })
  .speed('normal', SpeedPresets.NORMAL).speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker).build();

// Our own line layer sits above the viewport.
const lineLayer = new PIXI.Container();
reelSet.addChild(lineLayer);

// Draw a line from win:group using getCellBounds. Pulse in, fade out after
// the per-win cycle (cycleGap) so the next win gets the stage.
reelSet.events.on('win:group', (win, cells) => {
  const gfx = new PIXI.Graphics();
  gfx.zIndex = win.id ?? 0;
  const color = LINE_COLORS[(win.id ?? 0) % LINE_COLORS.length];
  const pts = cells.map(c => {
    const b = reelSet.getCellBounds(c.reelIndex, c.rowIndex);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  gfx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
  gfx.stroke({ color, width: 6, alpha: 0.95 });
  lineLayer.addChild(gfx);
  gsap.fromTo(gfx, { alpha: 0 }, { alpha: 1, duration: 0.18, ease: 'power1.out' });
  gsap.to(gfx, { alpha: 0, duration: 0.3, delay: 1.0, onComplete: () => gfx.destroy() });
});

// Scale a symbol's view container from its visual centre. Needed because
// the view is positioned at the cell's top-left, so a naive gsap.to on
// view.scale grows from the top-left corner.
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

// Decorate each winning cell with a little pulse in addition to playWin.
reelSet.events.on('win:symbol', (symbol) => {
  scaleFromCenter(symbol.view, 1.1, 120);
});

const presenter = new WinPresenter(reelSet, { stagger: 70, cycleGap: 700 });
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
  cleanup: () => { presenter.destroy(); lineLayer.destroy({ children: true }); },
};
