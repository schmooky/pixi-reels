// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, gsap, app
//
// TWO LANDING EVENTS, ONE BOUNCE APART.
//
// `spin:reelLanding` fires the frame a reel is ON its result: strip snapped,
// every symbol told it landed, the bounce about to start. `spin:reelLanded`
// fires once the bounce has settled - a whole `bounceDuration` later on an
// animated stop (600ms on NORMAL), the same tick on a slam. Anything coupled
// to the landing itself belongs on the first one; the HUD prints the gap.
//
// The "copy reels" (2 and 3) show the use: a takeover plate grows over the
// reel the instant it lands, not after it has finished bouncing, and their
// symbols dim from `onReelLanded(ctx)` - the symbol knows which reel it is
// on now, so "no landing beat here" needs no reel lookup from outside.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80;
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
const COPY = new Set([2, 3]);
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

// The symbol side: land quietly on a copy reel, the takeover is about to
// replace it. `ctx` is the engine's, no reel reference needed.
class Card extends CardSymbol {
  onReelSpinStart(joined) { super.onReelSpinStart?.(joined); this.view.alpha = 1; }
  onReelLanded(ctx) { if (ctx && COPY.has(ctx.reelIndex)) this.view.alpha = 0.35; }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(0, 0)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, Card, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 160 })
  .ticker(app.ticker)
  .build();

const W = REELS * SIZE, H = ROWS * SIZE;

// Takeover plates, one per copy reel, above the mask.
const plates = new Map();
for (const reel of COPY) {
  const g = new PIXI.Graphics();
  g.roundRect(4, 4, SIZE - 8, H - 8, 10).fill({ color: 0xf0d98a, alpha: 0.28 })
    .stroke({ color: 0xf0d98a, width: 2 });
  g.position.set(reel * SIZE, 0);
  g.scale.y = 0;
  g.zIndex = 9000;
  reelSet.viewport.unmaskedContainer.addChild(g);
  plates.set(reel, g);
}

const lines = Array.from({ length: REELS }, (_, i) => `reel ${i}: -`);
const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78, lineHeight: 15 },
});
hud.position.set(0, H + 12);
reelSet.addChild(hud);
const redraw = () => { hud.text = lines.join('\n'); };
redraw();

const landingAt = new Map();
const onLanding = (reel) => {
  landingAt.set(reel, performance.now());
  lines[reel] = `reel ${reel}: landing frame${COPY.has(reel) ? ' - takeover starts' : ''}`;
  redraw();
  const plate = plates.get(reel);
  if (plate) gsap.fromTo(plate.scale, { y: 0 }, { y: 1, duration: 0.3, ease: 'power2.out' });
};
const onLanded = (reel) => {
  const dt = Math.round(performance.now() - (landingAt.get(reel) ?? performance.now()));
  lines[reel] = `reel ${reel}: landed +${dt}ms after the landing frame`;
  redraw();
};
reelSet.events.on('spin:reelLanding', onLanding);
reelSet.events.on('spin:reelLanded', onLanded);

return {
  reelSet,
  cleanup: () => {
    reelSet.events.off('spin:reelLanding', onLanding);
    reelSet.events.off('spin:reelLanded', onLanded);
    for (const g of plates.values()) { gsap.killTweensOf(g.scale); try { g.destroy(); } catch {} }
    try { hud.destroy(); } catch {}
  },
  onSpin: async () => {
    for (const g of plates.values()) gsap.to(g.scale, { y: 0, duration: 0.15 });
    for (let i = 0; i < REELS; i++) lines[i] = `reel ${i}: spinning`;
    redraw();
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 380));
    reelSet.setResult(grid);
    await p;
  },
};
