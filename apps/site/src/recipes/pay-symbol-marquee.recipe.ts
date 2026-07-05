// @ts-nocheck
// Injected: HorizontalReelBuilder, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// The strip that sits ABOVE the reels announcing "these symbols pay this round".
// It is a HorizontalReel: one row, no spin lifecycle, no win lines — just a
// sideways marquee of the round's paying symbols. Press Run to re-roll the
// paying set (setContent) and flip travel direction (setDirection). The lower
// strip runs in `cascade` mode — the same reveal, stepped one cell at a time.

const CELL = 64, GAP = 8, COUNT = 5;
const ALL = CARD_DECK.map((c) => c.id);
const registerCards = (r) => {
  for (const c of CARD_DECK) r.register(c.id, CardSymbol, { color: c.color, label: c.label });
};

// Pick `n` distinct paying ids for a round.
const rollPayingSet = (n) => {
  const pool = [...ALL];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
};

const stripW = COUNT * CELL + (COUNT - 1) * GAP;
const originX = (app.screen.width - stripW) / 2;

// ── Smooth marquee (rtl) ────────────────────────────────────────────────
const scroller = new HorizontalReelBuilder()
  .visibleCount(COUNT)
  .cellSize(CELL, CELL, { gap: GAP })
  .direction('rtl')
  .scroll(1.3)
  .symbols(registerCards)
  .content(rollPayingSet(6))
  .chrome((g, w, h) => {
    g.roundRect(-8, -8, w + 16, h + 16, 12).fill({ color: 0x1b1030, alpha: 0.85 }).stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
  })
  .ticker(app.ticker)
  .build();
scroller.container.position.set(originX, 40);
app.stage.addChild(scroller.container);

// ── Cascade (stepped) variant ───────────────────────────────────────────
const stepper = new HorizontalReelBuilder()
  .visibleCount(COUNT)
  .cellSize(CELL, CELL, { gap: GAP })
  .direction('ltr')
  .cascade({ interval: 700, duration: 300 })
  .symbols(registerCards)
  .content(rollPayingSet(6))
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
const topLabel = label('scroll · rtl', 40 - 6);
label('cascade · ltr', 40 + CELL + 56 - 6);

return {
  cleanup: () => { scroller.destroy(); stepper.destroy(); },
  onSpin: async () => {
    // A new round: fresh paying set on both strips, and the scroller flips direction.
    const next = rollPayingSet(6);
    scroller.setContent(next);
    stepper.setContent(next);
    const dir = scroller.direction === 'rtl' ? 'ltr' : 'rtl';
    scroller.setDirection(dir);
    topLabel.text = `scroll · ${dir}`;
  },
};
