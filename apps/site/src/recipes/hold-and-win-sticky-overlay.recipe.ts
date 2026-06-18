// @ts-nocheck
// Injected: HoldAndWinBuilder, AnimatedSpriteSymbol, loadHoldAndWinSprites, bezierFly, PIXI, gsap, app
//
// A value overlay that survives a symbol swap and rides along on a flight.
//
// The overlay (a ×100 badge) lives in `coin.data` and is attached as a CHILD
// of the symbol's `view`, so it moves with the symbol on screen. The trick:
//   - on an in-place swap (setSymbolAt makes a NEW symbol instance) the badge
//     is re-attached from `coin.data` — it never gets lost,
//   - on a collect flight the badge is rebuilt onto the flying clone from the
//     same `coin.data`, so it travels with the coin.

const COIN = 'coin', COIN_B = 'coin_alt';
const COLS = 3, ROWS = 1, CELL = 96, GAP = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { coin } = await loadHoldAndWinSprites(); // diamond coin frames + DiamondMult font
const badgeText = (text) => { const t = new PIXI.BitmapText({ text, style: { fontFamily: 'DiamondMult', fontSize: 40 } }); t.anchor.set(0.5); return t; };

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    // two coin "skins" so we can swap the art without losing the badge
    r.register(COIN, AnimatedSpriteSymbol, { frames: { [COIN]: coin }, animationSpeed: 0.6, anchor: { x: 0.5, y: 0.5 } });
    r.register(COIN_B, AnimatedSpriteSymbol, { frames: { [COIN_B]: [...coin].reverse() }, animationSpeed: 0.6, anchor: { x: 0.5, y: 0.5 } });
  })
  .weights({ [COIN]: 1, empty: 2, [COIN_B]: 0 })
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0x140f2e, alpha: 0.55 }).stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 }))
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - CELL) / 2 + 18;
app.stage.addChild(board.container);

// a meter the coin will fly into
const meter = { x: app.screen.width / 2, y: board.container.y - 54 };
const meterText = badgeText('0');
meterText.position.set(meter.x, meter.y);
app.stage.addChild(meterText);

const hud = new PIXI.Text({ text: 'press spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + CELL + 14);
app.stage.addChild(hud);

const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };

// Attach the overlay from coin.data as a child of the symbol's view, so it
// rides with the symbol. Call this on lock AND after every in-place swap.
function attachBadge(cell, data) {
  if (!data?.badge) return;
  const sym = board.symbolAt(cell);
  const badge = badgeText(data.badge);
  badge.position.set(CELL / 2, CELL * 0.5); // view-local: centered on the coin
  sym.view.addChild(badge);                 // <-- child of the symbol's view
}

const TARGET = { cell: { col: 1, row: 0 }, id: COIN, data: { badge: '100x', value: 100 } };
const SEED = [
  { cell: { col: 0, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 2, row: 0 }, id: COIN, data: { value: 5 } },
];
const seedBoard = () => {
  board.reset();
  board.enter([...SEED, TARGET]);
  attachBadge(TARGET.cell, TARGET.data); // overlay born with the coin
  hud.text = 'press spin: swap the coin art — the ×100 badge survives';
};
seedBoard();

const flyers = new Set();
let phase = 'ready', total = 0;
return {
  cleanup: () => { for (const f of flyers) { try { gsap.killTweensOf(f); f.destroy(); } catch {} } board.destroy(); },
  onSpin: async () => {
    if (phase === 'swapping' || phase === 'flying') return;
    if (phase === 'collected') { total = 0; meterText.text = '0'; phase = 'ready'; seedBoard(); return; }

    if (phase === 'ready') {
      phase = 'swapping';
      // swap the coin's ART in place; the new instance has a fresh view,
      // so re-attach the badge from the SAME coin.data — it survives.
      const sym = board.setSymbolAt(TARGET.cell, COIN_B, TARGET.data);
      attachBadge(TARGET.cell, TARGET.data);
      void sym.playWin?.().catch?.(() => {});
      hud.text = 'art swapped · badge survived · press spin to collect';
      phase = 'swapped';
      return;
    }

    // collect: fly a clone built from coin.data — coin + badge together
    phase = 'flying';
    hud.text = 'flying to the meter — the badge rides along';
    const from = abs(TARGET.cell);
    const clone = new PIXI.Container();
    const c = new PIXI.Sprite(coin[0]); c.anchor.set(0.5); c.scale.set((CELL - 8) / c.texture.width);
    const badge = badgeText(TARGET.data.badge);
    clone.addChild(c, badge);            // the overlay travels on the clone
    clone.position.set(from.x, from.y);
    app.stage.addChild(clone); flyers.add(clone);
    board.release([TARGET.cell]);
    await bezierFly(clone, from, meter, { lean: 'up', arriveScale: 0.4, duration: 0.6 });
    try { clone.destroy(); } catch {} flyers.delete(clone);
    total += TARGET.data.value;
    meterText.text = String(total);
    gsap.fromTo(meterText.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' });
    hud.text = 'collected with its badge · press spin to reset';
    phase = 'collected';
  },
};
