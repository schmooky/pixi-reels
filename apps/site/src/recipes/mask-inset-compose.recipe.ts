// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, RoundedRectMaskStrategy,
//                   PathMaskStrategy, composeMasks, inset,
//                   CardSymbol, CARD_DECK, PIXI, app
//
// TWO DECORATORS: `inset(...)` AND `composeMasks(...)`.
//
// `inset(strategy, px)` shrinks whatever a strategy draws by a uniform number
// of pixels on all four sides; negative grows it. It is the fix for "the art
// bleeds a pixel past the frame" that does not involve rewriting the strategy,
// and it works on any strategy including your own.
//
// `composeMasks(a, b, ...)` unions several strategies into the viewport's one
// mask. UNION ONLY - a PixiJS Graphics mask is the union of every filled shape
// in it, and there is no way to intersect or subtract the output of two
// independent strategies. (To subtract WITHIN one strategy, use `.cut()` inside
// a PathMaskStrategy.)
//
// Here the reel window is a rounded box pulled in by 4px, unioned with a banner
// strip above the reels that is outside the reel bounds entirely - so a symbol
// promoted into that strip stays visible instead of being clipped away.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 0;
const BANNER_H = 46, BANNER_GAP = 8;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .maskStrategy(composeMasks(
    // The reels, rounded and pulled in 4px so no symbol edge touches the frame.
    inset(new RoundedRectMaskStrategy({ radius: 20 }), 4),
    // Plus a strip ABOVE the board, at negative main coordinates. Nothing in
    // `ctx.rects` covers this, which is the whole point of composing.
    new PathMaskStrategy((g, ctx) => {
      g.roundRect(0, -(BANNER_H + BANNER_GAP), ctx.width, BANNER_H, 10)
        .fill({ color: 0xffffff });
    }),
  ))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 140 })
  .ticker(app.ticker)
  .build();

const W = REELS * SIZE, H = ROWS * SIZE;

// Something to actually live in the banner region, so the extra mask shape is
// visibly doing work rather than being an invisible claim.
const banner = new PIXI.Container();
banner.position.set(0, -(BANNER_H + BANNER_GAP));
const plate = new PIXI.Graphics();
plate.roundRect(0, 0, W, BANNER_H, 10).fill({ color: 0x2b2136 });
banner.addChild(plate);
const bannerText = new PIXI.Text({
  text: 'BANNER INSIDE THE SAME MASK',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 13, fill: 0xf0d98a },
});
bannerText.anchor.set(0.5);
bannerText.position.set(W / 2, BANNER_H / 2);
banner.addChild(bannerText);
reelSet.viewport.maskedContainer.addChild(banner);

const hud = new PIXI.Text({
  text: 'composeMasks(inset(rounded, 4), bannerStrip)  -  union only',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

// Slide the banner text past the strip edges so the clip is observable.
const drift = gsap.to(bannerText, {
  x: W / 2 + 90, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut',
});

return {
  reelSet,
  cleanup: () => {
    drift.kill();
    try { banner.destroy({ children: true }); } catch {}
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
