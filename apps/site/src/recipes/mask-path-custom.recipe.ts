// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, PathMaskStrategy,
//                   CardSymbol, CARD_DECK, PIXI, app
//
// ANY SHAPE, WITHOUT WRITING A CLASS.
//
// `MaskStrategy` has always been a public extension point, but the smallest
// possible custom strategy was still a class with a version marker, a
// `build`/`update` split and a `clear()` on update - about 25 lines of ceremony
// around one drawing call. `PathMaskStrategy` is that ceremony, written once.
//
// The callback gets the Graphics and the full `MaskContext`: `ctx.rects` (one
// per reel), `ctx.width` / `ctx.height`, `ctx.axis` (so an orientation-aware
// mask stays a one-liner) and `ctx.bleed`. Do NOT call `g.clear()` - the
// strategy already did.
//
// This one cuts a hole: `rect(...)` then `rect(...).cut()` makes a frame mask,
// so the middle of the board is punched out and only the border ring of symbols
// is visible. Anything PixiJS Graphics can express works here, `regularPoly`
// for hex boards included.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 4, SIZE = 74, GAP = 0;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .maskStrategy(new PathMaskStrategy((g, ctx) => {
    // Outer rounded window, FILLED...
    g.roundRect(0, 0, ctx.width, ctx.height, 22).fill({ color: 0xffffff });
    // ...then a hole cut out of it. `cut()` subtracts the current path from the
    // last shape that was already filled, so the fill has to come FIRST. Draw
    // the hole before filling and `cut()` finds nothing to cut from - you get
    // an empty mask and a completely invisible board.
    g.roundRect(SIZE, SIZE, ctx.width - SIZE * 2, ctx.height - SIZE * 2, 14).cut();
  }))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 130 })
  .ticker(app.ticker)
  .build();

const W = REELS * SIZE, H = ROWS * SIZE;

const hud = new PIXI.Text({
  text: 'PathMaskStrategy: roundRect().fill() then roundRect().cut() = a frame mask',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({
      visible: Array.from({ length: ROWS }, rv),
    }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 380));
    reelSet.setResult(grid);
    await p;
  },
};
