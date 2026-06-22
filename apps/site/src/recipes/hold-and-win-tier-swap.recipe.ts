// @ts-nocheck
// Injected: HoldAndWinBuilder, GoldCoinSymbol, SpineReelSymbol, Spine, settleMoneyFace, PIXI, gsap, app
//
// Swap a symbol in place — coin → MINI → MAJOR — without breaking the grid.
//
// `board.setSymbolAt(cell, id, data)` re-places one cell with a different
// registered symbol (different art / skeleton) and rewrites that cell's
// ledger entry, leaving every other coin exactly where it was. Here one
// coin climbs the jackpot tiers on each press while three neighbours sit
// untouched.

const COLS = 5, ROWS = 3, CELL = 72, GAP = 6;
const COIN = 'coin', MINI = 'jackpot_mini', MAJOR = 'jackpot_major';
const fmt = (v) => v.toFixed(2);

const ASSETS = { 'hw-atlas': '/hw-spine/skeletons.atlas', 'hw-goldfont': '/hw-spine/goldfont.fnt', 'hw-jackpot': '/hw-spine/jackpot.json' };
for (const [alias, src] of Object.entries(ASSETS)) { if (!PIXI.Assets.cache.has(alias)) { try { PIXI.Assets.add({ alias, src }); } catch {} } }
await PIXI.Assets.load(Object.keys(ASSETS));

const SPINE_MAP = { [COIN]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' }, [MINI]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' }, [MAJOR]: { skeleton: 'hw-jackpot', atlas: 'hw-atlas' } };
// the jackpot coin wears its tier word as an idle loop (mini_x / major_x)
const TIER_OVERRIDES = { [MINI]: { idle: 'mini_x' }, [MAJOR]: { idle: 'major_x' } };
const goldText = (text, size) => { const t = new PIXI.BitmapText({ text, style: { fontFamily: 'GoldDigits', fontSize: size } }); t.anchor.set(0.5); return t; };

// fit each id at its clean pose
const scaleFor = {};
for (const [id, cfg] of Object.entries(SPINE_MAP)) {
  const probe = Spine.from({ skeleton: cfg.skeleton, atlas: cfg.atlas });
  const pose = TIER_OVERRIDES[id]?.idle ?? 'mini_x';
  if (probe.skeleton.data.findAnimation(pose)) probe.state.setAnimation(0, pose, true);
  try { probe.update(0); } catch {}
  const b = probe.getLocalBounds();
  scaleFor[id] = (CELL - 6) / Math.max(1, b.width, b.height);
  probe.destroy();
}
const SETTLE_SIZE = CELL - 10;

const board = new HoldAndWinBuilder()
  .grid(COLS, ROWS)
  .cellSize(CELL, { gap: GAP })
  .symbols((r) => {
    r.register(COIN, GoldCoinSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle', scale: scaleFor[COIN], settleSize: SETTLE_SIZE });
    for (const id of [MINI, MAJOR]) r.register(id, SpineReelSymbol, { spineMap: SPINE_MAP, idleAnimation: 'idle', animations: TIER_OVERRIDES, scale: scaleFor[id] });
  })
  .weights({ [COIN]: 1, empty: 3, [MINI]: 0, [MAJOR]: 0 })
  .symbolData({ [MINI]: { unmask: true }, [MAJOR]: { unmask: true } })
  .respins(3)
  .cellChrome((g, size) => g.roundRect(0, 0, size, size, 10).fill({ color: 0xfaf6ef, alpha: 0.6 }).stroke({ color: 0xe5dccf, width: 1, alpha: 0.8 }))
  .ticker(app.ticker)
  .build();

const boardW = COLS * CELL + (COLS - 1) * GAP, boardH = ROWS * CELL + (ROWS - 1) * GAP;
board.container.x = (app.screen.width - boardW) / 2;
board.container.y = (app.screen.height - boardH) / 2 - 6;
app.stage.addChild(board.container);

const hud = new PIXI.Text({ text: 'press spin to upgrade the marked coin in place', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0x9c8f78 } });
hud.anchor.set(0.5, 0);
hud.position.set(app.screen.width / 2, board.container.y + boardH + 12);
app.stage.addChild(hud);

const labels = new PIXI.Container();
app.stage.addChild(labels);
const labelAt = new Map();
const abs = (cell) => { const c = board.cellCenter(cell); return { x: board.container.x + c.x, y: board.container.y + c.y }; };
const fit = (t, w, h) => { if (t.width > 0) t.scale.set(Math.min(w / t.width, h / t.height, 1)); return t; };
const paintLabel = (cell, value, kind) => {
  const k = `${cell.col},${cell.row}`; labelAt.get(k)?.destroy();
  const p = abs(cell);
  const t = fit(goldText(fmt(value), kind ? 18 : 30), CELL * 0.82, CELL * 0.42);
  t.position.set(p.x, p.y + (kind ? CELL * 0.18 : 0)); // tier coins show the word up top, value low
  labels.addChild(t); labelAt.set(k, t);
  return t;
};

// three neighbours that must NOT move, plus the one we upgrade
const SEED = [
  { cell: { col: 0, row: 0 }, id: COIN, data: { value: 5 } },
  { cell: { col: 4, row: 2 }, id: COIN, data: { value: 10 } },
  { cell: { col: 3, row: 0 }, id: COIN, data: { value: 25 } },
];
const TARGET = { cell: { col: 2, row: 1 }, id: COIN, data: { value: 50 } };
const TIERS = [
  { id: COIN, value: 50, label: 'coin 50.00', kind: null },
  { id: MINI, value: 100, label: 'MINI 100.00', kind: 'mini' },
  { id: MAJOR, value: 500, label: 'MAJOR 500.00', kind: 'major' },
];

const seedBoard = () => {
  board.reset();
  for (const t of labelAt.values()) t.destroy();
  labelAt.clear();
  board.enter([...SEED, TARGET]);
  for (const c of SEED) paintLabel(c.cell, c.data.value);
  paintLabel(TARGET.cell, TIERS[0].value, null);
};
seedBoard();

let tier = 0, busy = false;
return {
  cleanup: () => { for (const t of labelAt.values()) { try { t.destroy(); } catch {} } labelAt.clear(); try { hud.destroy(); labels.destroy({ children: false }); } catch {} board.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    tier = (tier + 1) % TIERS.length;
    const t = TIERS[tier];
    if (tier === 0) { seedBoard(); hud.text = 'reset · press spin to upgrade the marked coin'; busy = false; return; }
    // swap the symbol id in place — neighbours untouched, ledger updated
    const sym = board.setSymbolAt(TARGET.cell, t.id, { value: t.value, kind: t.kind });
    void sym.playWin?.().catch?.(() => {});
    paintLabel(TARGET.cell, t.value, t.kind);
    hud.text = `swapped to ${t.label} · neighbours unchanged · press spin`;
    busy = false;
  },
};
