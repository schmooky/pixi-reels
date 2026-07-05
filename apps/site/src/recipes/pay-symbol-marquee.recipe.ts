// @ts-nocheck
// Injected: HorizontalReelBuilder, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// The strip that sits ABOVE the reels announcing "these symbols pay this round".
// It is a HorizontalReel — one row, oriented sideways — and it follows the SAME
// spin contract as ReelSet: spin() starts it, setResult(ids) hands it the round's
// paying symbols and triggers the stop, and the spin() promise resolves on land.
// Press Spin: both strips spin and land on a fresh random paying set. The lower
// strip spins in `cascade` mode — the same reveal, stepped one cell at a time.

const CELL = 64, GAP = 8, COUNT = 5;
const ALL = CARD_DECK.map((c) => c.id);
const registerCards = (r) => {
  for (const c of CARD_DECK) r.register(c.id, CardSymbol, { color: c.color, label: c.label });
};

// A round's server response: `COUNT` paying symbols, one per visible cell.
const rollPayingSet = () => {
  const pool = [...ALL];
  return Array.from({ length: COUNT }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
};

const stripW = COUNT * CELL + (COUNT - 1) * GAP;
const originX = (app.screen.width - stripW) / 2;

// ── Smooth-scroll banner reel (rtl) ─────────────────────────────────────
const scroller = new HorizontalReelBuilder()
  .visibleCount(COUNT)
  .cellSize(CELL, CELL, { gap: GAP })
  .direction('rtl')
  .scroll(26)
  .symbols(registerCards)
  .initialResult(rollPayingSet())
  .chrome((g, w, h) => {
    g.roundRect(-8, -8, w + 16, h + 16, 12).fill({ color: 0x1b1030, alpha: 0.85 }).stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
  })
  .ticker(app.ticker)
  .build();
scroller.container.position.set(originX, 40);
app.stage.addChild(scroller.container);

// ── Cascade (stepped) banner reel (ltr) ─────────────────────────────────
const stepper = new HorizontalReelBuilder()
  .visibleCount(COUNT)
  .cellSize(CELL, CELL, { gap: GAP })
  .direction('ltr')
  .cascade({ interval: 60, duration: 200 })
  .symbols(registerCards)
  .initialResult(rollPayingSet())
  .chrome((g, w, h) => {
    g.roundRect(-8, -8, w + 16, h + 16, 12).fill({ color: 0x10241f, alpha: 0.85 }).stroke({ color: 0x2ee6a6, width: 2, alpha: 0.9 });
  })
  .ticker(app.ticker)
  .build();
stepper.container.position.set(originX, 40 + CELL + 56);
app.stage.addChild(stepper.container);

const label = (text, y) => {
  const t = new PIXI.Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: '600', fill: 0x9c8f78 } });
  t.anchor.set(0.5, 1);
  t.position.set(app.screen.width / 2, y);
  app.stage.addChild(t);
  return t;
};
const topLabel = label('scroll · rtl — press Spin', 40 - 6);
const botLabel = label('cascade · ltr — press Spin', 40 + CELL + 56 - 6);

return {
  cleanup: () => { scroller.destroy(); stepper.destroy(); },
  onSpin: async () => {
    if (scroller.isSpinning || stepper.isSpinning) return;
    topLabel.text = 'scroll · rtl — spinning…';
    botLabel.text = 'cascade · ltr — spinning…';

    // Same flow as ReelSet: spin(), then setResult() with the round's symbols.
    const spinA = scroller.spin();
    const spinB = stepper.spin();
    const pay = rollPayingSet();               // the server's paying symbols
    await new Promise((r) => setTimeout(r, 450)); // simulated network delay
    scroller.setResult(pay);
    stepper.setResult(pay);

    const [a] = await Promise.all([spinA, spinB]);
    topLabel.text = `scroll · rtl — paid: ${a.symbols.join(' ')}`;
    botLabel.text = `cascade · ltr — paid: ${pay.join(' ')}`;
  },
};
