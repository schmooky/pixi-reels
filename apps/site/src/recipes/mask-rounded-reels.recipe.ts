// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, RoundedRectMaskStrategy,
//                   CardSymbol, CARD_DECK, PIXI, app
//
// EACH REEL AS ITS OWN ROUNDED CARD.
//
// `scope: 'reel'` rounds all four corners of every reel box instead of the
// union. The look is a row of separate rounded columns rather than one window.
//
// **It needs a cross gap.** On a vertical set that is `symbolGap.x`. At gap 0
// neighbouring reels share an edge, and rounding both sides of a shared edge
// bites a lens-shaped notch out of every seam - which reads as a rendering bug,
// not as a style. The strategy warns once to the console if it sees touching
// rects; open devtools and set GAP to 0 below to hear it.
//
// The gap is also why this scope is not the default: most slots butt their
// reels together, and there `scope: 'set'` or SilhouetteMaskStrategy is right.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80;
// Non-zero CROSS gap. This is the precondition for scope 'reel'.
const GAP = 14;
const RADIUS = 18;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE)
  // x is the CROSS axis on a vertical set. y stays 0 so cells stack flush.
  .symbolGap(GAP, 0)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .maskStrategy(new RoundedRectMaskStrategy({ radius: RADIUS, scope: 'reel' }))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 150 })
  .ticker(app.ticker)
  .build();

const H = ROWS * SIZE;

const outline = new PIXI.Graphics();
for (let i = 0; i < REELS; i++) {
  outline.roundRect(i * (SIZE + GAP), 0, SIZE, H, RADIUS);
}
outline.stroke({ width: 2, color: 0x6ad0ff, alpha: 0.85 });
reelSet.addChild(outline);

const hud = new PIXI.Text({
  text: `scope: 'reel', radius ${RADIUS}  -  needs symbolGap.x > 0 (here ${GAP})`,
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
