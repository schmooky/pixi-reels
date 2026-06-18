// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   GoldCoinSymbol, Spine, WILD_CARD, PIXI, gsap, app, pickWeighted
//
// Multiplier wild. the wild carries a per-instance multiplier value.
//
// The wild is a production Spine gold coin (GoldCoinSymbol); the multiplier
// (`wild_x2` / `wild_x3` / `wild_x5`) is encoded in the symbol id and shown
// as a ×N badge on the coin face. CellPin's `payload` field also carries the
// numeric multiplier so game-layer win evaluation can read it without parsing
// the id. Filler cards stay rectangular (they're playing-card themed).

const FILLER = ['7', '8', '10', 'Q'];
const COLS = 5, ROWS = 3, SIZE = 90;
const MULTIPLIERS = [2, 3, 5];
const STICKY_TURNS = 3;
const wildId = (m) => `wild_x${m}`;

// the shared Spine coin
const ASSETS = { 'hw-atlas': '/hw-spine/skeletons.atlas', 'hw-jackpot': '/hw-spine/jackpot.json' };
for (const [alias, src] of Object.entries(ASSETS)) {
  if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} }
}
await PIXI.Assets.load(Object.keys(ASSETS));
await PIXI.Assets.load('/hw-sprites/hwfont-mult.fnt'); // the game's ×N multiplier bitmap font
const SPINE_MAP = Object.fromEntries(MULTIPLIERS.map((m) => [wildId(m), { skeleton: 'hw-jackpot', atlas: 'hw-atlas' }]));
const probe = Spine.from({ skeleton: 'hw-jackpot', atlas: 'hw-atlas' });
probe.state.setAnimation(0, 'mini_x', true);
try { probe.update(0); } catch {}
const pb = probe.getLocalBounds();
const COIN_SCALE = (SIZE - 8) / Math.max(1, pb.width, pb.height);
probe.destroy();

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleRows(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of CARD_DECK) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
    for (const m of MULTIPLIERS) {
      r.register(wildId(m), GoldCoinSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle', scale: COIN_SCALE, settleSize: SIZE - 10 });
    }
  })
  .weights({
    '7': 22,
    '8': 22,
    '10': 18,
    Q: 18,
    // Wilds land via scripted arrivals only. omit from weights to keep
    // them off the random strip.
  })
  .speed('normal', SpeedPresets.NORMAL)
  .speed('turbo', SpeedPresets.TURBO)
  .ticker(app.ticker)
  .build();

// ── ×N badges over pinned wilds ───────────────────────────────────────────
const badges = new PIXI.Container();
reelSet.addChild(badges);
const badgeAt = new Map();
const drawBadge = (col, row, mult) => {
  const key = `${col},${row}`;
  badgeAt.get(key)?.destroy();
  const b = reelSet.getCellBounds(col, row);
  const t = new PIXI.BitmapText({ text: `${mult}x`, style: { fontFamily: 'DiamondMult', fontSize: 56 } });
  t.anchor.set(0.5);
  if (t.width > 0) t.scale.set(Math.min((SIZE * 0.7) / t.width, (SIZE * 0.45) / t.height, 1));
  t.position.set(b.x + b.width / 2, b.y + b.height / 2); // centered on the wild
  badges.addChild(t);
  badgeAt.set(key, t);
};
const clearBadge = (col, row) => { const k = `${col},${row}`; badgeAt.get(k)?.destroy(); badgeAt.delete(k); };

// ── Pin wilds with their multiplier on land ───────────────────────────────
reelSet.events.on('spin:allLanded', ({ symbols }) => {
  for (let c = 0; c < symbols.length; c++) {
    for (let r = 0; r < symbols[c].length; r++) {
      const id = symbols[c][r];
      if (!id?.startsWith?.('wild_x')) continue;
      if (reelSet.getPin(c, r)) continue;
      const multiplier = Number(id.slice('wild_x'.length));
      reelSet.pin(c, r, id, { turns: STICKY_TURNS, payload: { multiplier } });
      drawBadge(c, r, multiplier);
    }
  }
});
reelSet.events.on('pin:expired', (pin) => { if (pin?.symbolId?.startsWith?.('wild_x')) clearBadge(pin.col, pin.row); });

// Scripted arrivals — one of each multiplier rung across the demo loop.
const arrivals = [
  { col: 1, row: 1, mult: 2 },
  { col: 3, row: 0, mult: 3 },
  { col: 2, row: 2, mult: 5 },
];
let spinCount = 0;

return {
  reelSet,
  cleanup: () => { for (const t of badgeAt.values()) { try { t.destroy(); } catch {} } },
  nextResult: () => {
    const idx = spinCount % arrivals.length;
    const grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
    );
    const next = arrivals[idx];
    grid[next.col][next.row] = wildId(next.mult);
    spinCount++;
    return grid;
  },
};
