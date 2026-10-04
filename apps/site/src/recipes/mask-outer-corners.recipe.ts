// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, RoundedRectMaskStrategy,
//                   CardSymbol, CARD_DECK, app, SilkGraphics, DebugPlaque
//
// ONE RECT PER REEL, ONLY THE WINDOW'S CORNERS ROUNDED.
//
// `scope: 'outer'` keeps the default's one-rect-per-reel clipping (a short
// reel never shows its buffer cells) and rounds a reel corner only where it
// sits on a corner of the union box: the first reel's left pair, the last
// reel's right pair, and nothing on the reels in between. Every inner edge
// stays square, so unlike `scope: 'reel'` this is fine at cross gap 0 - the
// reels butt together and the set reads as one rounded window.
//
// `corners` narrows it further to named SCREEN corners, in any scope. Set
// CORNERS below to `{ topLeft: true }` and only that one corner rounds.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80;
const RADIUS = 22;
// Which of the window's corners may round. `undefined` means all four.
const CORNERS = undefined;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE)
  // Zero gap on both axes: the reels touch, and 'outer' is built for that.
  .symbolGap(0, 0)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .maskStrategy(new RoundedRectMaskStrategy({ radius: RADIUS, scope: 'outer', corners: CORNERS }))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .ticker(app.ticker)
  .build();

const W = REELS * SIZE, H = ROWS * SIZE;

// The frame the mask is cut to match: one rounded window around the grid,
// radius per corner as [topLeft, topRight, bottomRight, bottomLeft]...
const outline = new SilkGraphics();
const rr = (on) => (on ? RADIUS : 0);
const c = CORNERS ?? { topLeft: true, topRight: true, bottomLeft: true, bottomRight: true };
outline
  .roundRect(0, 0, W, H, [rr(c.topLeft), rr(c.topRight), rr(c.bottomRight), rr(c.bottomLeft)])
  .stroke({ width: 2, color: 0x6ad0ff, alpha: 0.85 });
// ...and the seams between the reels' own rects, which stay straight.
for (let i = 1; i < REELS; i++) {
  outline.moveTo(i * SIZE, 0).lineTo(i * SIZE, H);
}
outline.stroke({ width: 1, color: 0x6ad0ff, alpha: 0.3 });
reelSet.addChild(outline);

// Two rows: the settings, then what they add up to.
const hud = new DebugPlaque({
  text: `scope: 'outer', radius ${RADIUS}, gap 0\none rect per reel, seams square, window corners round`,
  minWidth: W,
  maxWidth: W,
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    try { outline.destroy(); } catch {}
    try { hud.destroy({ children: true }); } catch {}
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 380));
    reelSet.setResult(grid);
    await p;
  },
};
