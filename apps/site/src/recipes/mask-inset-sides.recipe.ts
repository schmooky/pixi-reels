// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, RoundedRectMaskStrategy,
//                   inset, CardSymbol, CARD_DECK, PIXI, app
//
// `inset(strategy, { top, right, bottom, left })`: a different trim per
// SCREEN side. Frame art rarely has four equal lips - here the bottom lip
// carries the bet strip and is four times thicker than the top one - and
// before this the only way to match it was to draw the whole window by hand
// in a PathMaskStrategy. Now the rounded strategy is wrapped once, and the
// sides are named the way the artist names them, whichever way the reels
// travel.
//
// The frame behind the reels is drawn from the same LIP numbers, so the
// gold outline IS the mask window: nothing peeks past it on any side.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

// The frame's lips, in px, as the artist measured them.
const LIP = { top: 6, right: 6, bottom: 26, left: 6 };
const RADIUS = 20;

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(0, 0)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  // One rounded window, pulled in by each lip. An omitted side would be 0.
  .maskStrategy(inset(new RoundedRectMaskStrategy({ radius: RADIUS }), LIP))
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 140 })
  .ticker(app.ticker)
  .build();

const W = REELS * SIZE, H = ROWS * SIZE;

// The frame: a plate under the reels, and the window the lips leave open,
// outlined in gold. The bottom lip is thick enough to hold a label.
const frame = new PIXI.Graphics();
frame.roundRect(-10, -10, W + 20, H + 20, RADIUS + 10).fill({ color: 0x2b2136 });
frame
  .roundRect(LIP.left, LIP.top, W - LIP.left - LIP.right, H - LIP.top - LIP.bottom, RADIUS)
  .stroke({ color: 0xf0d98a, width: 2, alpha: 0.9 });
reelSet.addChildAt(frame, 0);

const lipText = new PIXI.Text({
  text: `bottom lip ${LIP.bottom}px  ·  top ${LIP.top}px`,
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0xf0d98a },
});
lipText.anchor.set(0.5);
lipText.position.set(W / 2, H - LIP.bottom / 2);
reelSet.addChild(lipText);

const hud = new PIXI.Text({
  text: `inset(rounded, { top: ${LIP.top}, right: ${LIP.right}, bottom: ${LIP.bottom}, left: ${LIP.left} })`,
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 16);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    try { frame.destroy(); lipText.destroy(); hud.destroy(); } catch {}
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 380));
    reelSet.setResult(grid);
    await p;
  },
};
