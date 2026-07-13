// @ts-nocheck
// Injected: HorizontalReelBuilder, StaticSpinSymbol, SpinTextureCache,
//           prewarmSpinTextures, CardSymbol, CARD_DECK, PIXI, app
//
// Motion blur on the horizontal banner strip. Same StaticSpinSymbol as the
// main reels, one difference: `blur: { axis: 'x' }` bakes the smear along
// the strip's sideways travel (the blur texture comes out WIDER than the
// cell, not taller) and the snapshot fits the cell by height.

const CELL = 76, GAP = 8, COUNT = 5;
const SYMBOLS = CARD_DECK;
const pick = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
const payingRow = () => Array.from({ length: COUNT }, pick);

const cache = new SpinTextureCache({ renderer: app.renderer });
const blur = { axis: 'x' }; // smear follows the sideways travel

for (const c of SYMBOLS) {
  prewarmSpinTextures({
    cache,
    ids: [c.id],
    createSymbol: () => new CardSymbol({ color: c.color, label: c.label }),
    width: CELL,
    height: CELL,
    blur,
  });
}

const stripW = COUNT * CELL + (COUNT - 1) * GAP;
const originX = (app.screen.width - stripW) / 2;

const reel = new HorizontalReelBuilder()
  .visibleCount(COUNT)
  .cellSize(CELL, CELL, { gap: GAP })
  .direction('rtl')
  .spinSpeed(30)
  .symbols((r) => {
    for (const c of SYMBOLS) {
      r.register(c.id, StaticSpinSymbol, {
        createInner: () => new CardSymbol({ color: c.color, label: c.label }),
        cache,
        blurRampMs: 140,
        blur,
      });
    }
  })
  .initialFrame([{ visible: payingRow() }])
  .chrome((g, w, h) => {
    g.roundRect(-10, -10, w + 20, h + 20, 14)
      .fill({ color: 0x1b1030, alpha: 0.9 })
      .stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
  })
  .ticker(app.ticker)
  .build();
reel.container.position.set(originX, 90);
app.stage.addChild(reel.container);

const hud = new PIXI.Text({
  text: 'press Spin',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 },
});
hud.anchor.set(0.5, 1);
hud.position.set(app.screen.width / 2, 76);
app.stage.addChild(hud);

let busy = false;
return {
  cleanup: () => { reel.destroy(); hud.destroy(); cache.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    hud.text = 'spinning — sideways smear, zero live symbols';
    const spin = reel.spin();
    await new Promise((r) => setTimeout(r, 900));
    reel.setResult([{ visible: payingRow() }]);
    const { symbols } = await spin;
    hud.text = `landed: ${symbols[0].join(' ')} — cells live again`;
    busy = false;
  },
};
