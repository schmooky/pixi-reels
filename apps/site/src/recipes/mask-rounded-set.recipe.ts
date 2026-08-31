// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, RoundedRectMaskStrategy,
//                   RectMaskStrategy, CardSymbol, CARD_DECK, PIXI, app
//
// ROUNDED WINDOW AROUND THE WHOLE GRID.
//
// The default `RectMaskStrategy` clips each reel to a hard rectangle. That is
// invisible under frame art with square corners and painfully visible under
// frame art with round ones: the mask corner pokes out past the artwork.
//
// `scope: 'set'` (the default) rounds the four corners of the union bounding
// box. Every reel inside stays one flush block, so this is safe at any cross
// gap - which is exactly why it is the default.
//
// Press spin to watch symbols get clipped by the rounded corners on the way
// past. The dashed outline is drawn on the SAME geometry the mask uses, so you
// can see where the clip actually is.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 0;
const RADIUS = 28;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .maskStrategy(new RoundedRectMaskStrategy({ radius: RADIUS }))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 140 })
  .ticker(app.ticker)
  .build();

const W = REELS * SIZE + (REELS - 1) * GAP;
const H = ROWS * SIZE + (ROWS - 1) * GAP;

// Trace the mask boundary so the clip is legible without a screenshot diff.
const outline = new PIXI.Graphics();
outline.roundRect(0, 0, W, H, RADIUS).stroke({ width: 2, color: 0x6ad0ff, alpha: 0.9 });
reelSet.addChild(outline);

const hud = new PIXI.Text({
  text: `RoundedRectMaskStrategy({ radius: ${RADIUS} })  -  scope 'set' (default)`,
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    try { outline.destroy(); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 380));
    reelSet.setResult(grid);
    await p;
  },
};
