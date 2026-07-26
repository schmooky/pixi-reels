// @ts-nocheck
// Injected: HorizontalReelBuilder, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// A SINGLE horizontal reel - the banner reel above the reels that tells you
// which symbols pay this round. It follows the SAME contract as ReelSet:
//   spin()                       - start it, returns a promise
//   setResult([{ visible: ids }]) - one ColumnTarget (this reel is one column)
//   await spin                   - resolves with the SpinResult on land
// Then it CASCADES like the main reels - a real tumble: the winning symbols are
// removed, the survivors collapse to close the gaps, and new symbols slide in
// from the feed side. Press Spin: it spins, lands, then a winning combo tumbles.

const CELL = 76, GAP = 8, COUNT = 5;
const ALL = CARD_DECK.map((c) => c.id);
const registerCards = (r) => {
  for (const c of CARD_DECK) r.register(c.id, CardSymbol, { color: c.color, label: c.label });
};
const pick = () => ALL[Math.floor(Math.random() * ALL.length)];
const payingRow = () => Array.from({ length: COUNT }, pick);

const stripW = COUNT * CELL + (COUNT - 1) * GAP;
const originX = (app.screen.width - stripW) / 2;

const reel = new HorizontalReelBuilder()
  .visibleCount(COUNT)
  .cellSize(CELL, CELL, { gap: GAP })
  .direction('rtl')
  .spinSpeed(30)
  .symbols(registerCards)
  .initialFrame([{ visible: payingRow() }])
  .chrome((g, w, h) => {
    g.roundRect(-10, -10, w + 20, h + 20, 14).fill({ color: 0x1b1030, alpha: 0.9 }).stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
  })
  .ticker(app.ticker)
  .build();
reel.container.position.set(originX, 70);
app.stage.addChild(reel.container);

const hud = new PIXI.Text({ text: 'press Spin', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 1);
hud.position.set(app.screen.width / 2, 60);
app.stage.addChild(hud);

let busy = false;
return {
  cleanup: () => { reel.destroy(); hud.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;

    // 1) Spin and land - the ReelSet flow, one row wide.
    hud.text = 'spinning…';
    const spin = reel.spin();
    const pay = payingRow();                        // the "server" response
    await new Promise((r) => setTimeout(r, 500));   // simulated network delay
    reel.setResult([{ visible: pay }]);             // one ColumnTarget - this reel
    const { symbols } = await spin;                 // SpinResult: [[...row]]
    hud.text = `paid: ${symbols[0].join(' ')}`;

    // 2) Cascade - pretend the main reel had a win on a couple of these cells.
    await new Promise((r) => setTimeout(r, 500));
    const winners = [0, 2, 4].filter(() => Math.random() < 0.7);
    if (winners.length) {
      hud.text = `win on cells ${winners.join(', ')} — cascading`;
      await reel.cascade(winners, winners.map(pick)); // remove, collapse survivors, refill from feed side
      hud.text = `after cascade: ${[0, 1, 2, 3, 4].map((i) => reel.symbolAt(i).symbolId).join(' ')}`;
    }
    busy = false;
  },
};
