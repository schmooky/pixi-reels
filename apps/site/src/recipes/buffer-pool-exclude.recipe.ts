// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app, DebugPlaque
//
// Keep a symbol out of the buffer cells -- everywhere, or on one reel.
//
// The buffer cells are the hidden slots just outside the visible window.
// They are filled at random like the rest of the strip, so a symbol you
// only ever want the player to see INSIDE the grid can quietly park there:
// half-visible under a short mask, lifted above it by `unmask: true`, or
// scrolling into view on the next spin.
//
// `randomSymbols.set(pool, scope)` narrows that draw and nothing else. The
// scope takes both fields at once, so `{ reel: 1, slots: 'buffer' }` is the
// buffers of ONE reel, and the two ends have their own names:
// `'bufferStart'` is the side at the smaller main coordinate (above here,
// left on a horizontal set) and `'bufferEnd'` the other. This demo cycles
// the four states one per spin and prints what every hidden cell actually
// holds, so you can watch it work.

const COIN = 'coin';
const COIN_CARD = { id: COIN, color: 0xf6c945, label: 'COIN', textColor: 0x3b2f00 };
const FILLER = ['7', '8', '9', '10'];

const COLS = 3, ROWS = 3, SIZE = 90, GAP = 4;

const reelSet = new ReelSetBuilder()
  .reels(COLS)
  .visibleCells(ROWS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  // One hidden cell each side. Both are read out below.
  .bufferSymbols(1)
  .symbols((r) => {
    for (const sym of [...CARD_DECK, COIN_CARD]) {
      r.register(sym.id, CardSymbol, { color: sym.color, label: sym.label, textColor: sym.textColor });
    }
  })
  // Coin-heavy on purpose: with no pool, nearly every random cell is a COIN,
  // so the buffers fill with them and the readouts light up. Every registered
  // id is listed - an id left out of `weights()` keeps the default of 10,
  // which would quietly water this down.
  .weights({ '7': 2, '8': 2, '9': 2, '10': 2, J: 2, Q: 2, K: 2, A: 2, [COIN]: 300 })
  .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 900 })
  // Visible cells start as ordinary cards, so the only COINs on screen are
  // the ones the pool is about.
  .initialFrame(Array.from({ length: 3 }, () => ({ visible: ['7', '8', '9'] })))
  .ticker(app.ticker)
  .build();

// --- The calls this recipe is about -----------------------------------
// Three states, cycled one per spin. `null` removes a pool again, and each
// scope is its own layer: clearing the per-reel one does not touch the
// global one. Everything else about the set is unchanged either way -- COIN
// keeps its weight of 80 on the spinning strip in all three states.
const MODES = ['off', 'reel 1 only', 'above only', 'every reel'];
let mode = 0;

function applyPool() {
  const banned = { exclude: [COIN] };
  const state = MODES[mode];
  // Three separate layers. setting one never disturbs the others, and
  // passing `null` removes just that one.
  reelSet.randomSymbols.set(state === 'reel 1 only' ? banned : null, {
    reel: 1,
    slots: 'buffer',
  });
  reelSet.randomSymbols.set(state === 'above only' ? banned : null, { slots: 'bufferStart' });
  reelSet.randomSymbols.set(state === 'every reel' ? banned : null, { slots: 'buffer' });
}

// --- Readouts: what is actually in the hidden cells --------------------
// Everything lives in one composition root with room above the grid for the
// banner, returned as `stage` so the runner scales and centres the whole
// thing rather than clipping the parts that sit above the reels.
const stage = new PIXI.Container();
stage.addChild(reelSet);

const CALLS = {
  off: 'no buffer pool',
  'reel 1 only': "set({ exclude: ['COIN'] }, { reel: 1, slots: 'buffer' })",
  'above only': "set({ exclude: ['COIN'] }, { slots: 'bufferStart' })",
  'every reel': "set({ exclude: ['COIN'] }, { slots: 'buffer' })",
};
const MEANINGS = {
  off: 'COIN parks in every hidden cell',
  'reel 1 only': 'only reel 1 stays clean -- indices are 0-based, so that is the SECOND reel',
  'above only': 'the cells ABOVE the grid are clean, the ones below are untouched',
  'every reel': 'no COIN parks off-window on any reel, either end',
};
const HINT = 'the labels above and below each reel ARE its hidden cells';

// The banner: the call in force as the title, what it means under it. Laid
// out once with the longest caption of each kind and pinned to that width:
// the runner fits the composition at setup, so the banner must not grow when
// a later mode prints something longer.
const longest = (texts) => texts.reduce((a, b) => (b.length > a.length ? b : a));
const banner = new DebugPlaque({
  title: longest(Object.values(CALLS)),
  rows: [longest(Object.values(MEANINGS)), HINT],
});
banner.update({ minWidth: banner.plateWidth });
stage.addChild(banner);

// One label per hidden cell, sitting where that cell sits: above the grid
// for bufferStart, below it for bufferEnd. Each column also carries its own
// index, because reel indices are 0-based: `{ reel: 1 }` is the SECOND reel.
// The cell labels are reel-wide, so a longer symbol id never resizes them.
const indexLabels = [];
const startLabels = [];
const endLabels = [];
for (let i = 0; i < COLS; i++) {
  const index = new DebugPlaque({
    text: `reel ${i}`, fontSize: 9, color: 0x94a3b8, align: 'center', anchor: { x: 0.5, y: 0 },
  });
  stage.addChild(index);
  indexLabels.push(index);

  const top = new DebugPlaque({ text: '', align: 'center', anchor: { x: 0.5, y: 0 }, minWidth: SIZE });
  stage.addChild(top);
  startLabels.push(top);

  const bottom = new DebugPlaque({ text: '', align: 'center', anchor: { x: 0.5, y: 0 }, minWidth: SIZE });
  stage.addChild(bottom);
  endLabels.push(bottom);
}

// Stacked from the banner down, so the room above the grid is whatever the
// plaques turned out to need.
const INDEX_Y = banner.plateHeight + 6;
const START_Y = INDEX_Y + indexLabels[0].plateHeight + 3;
const PAD_TOP = START_Y + startLabels[0].plateHeight + 4;
reelSet.y = PAD_TOP;
for (let i = 0; i < COLS; i++) {
  const x = i * (SIZE + GAP) + SIZE / 2;
  indexLabels[i].position.set(x, INDEX_Y);
  startLabels[i].position.set(x, START_Y);
  endLabels[i].position.set(x, PAD_TOP + ROWS * (SIZE + GAP) - GAP + 6);
}

// refreshLabels runs every tick, and a plaque lays itself out again on every
// update, so each one is only touched when what it shows has changed.
function showSymbol(plaque, id) {
  if (plaque.text === id) return;
  plaque.update({ text: id, color: id === COIN ? 0xd97706 : 0x16a34a });
}
let shownMode = -1;

function refreshLabels() {
  for (let i = 0; i < COLS; i++) {
    const strip = reelSet.reels[i].symbols;
    showSymbol(startLabels[i], strip[0].symbolId);
    showSymbol(endLabels[i], strip[strip.length - 1].symbolId);
  }
  if (mode === shownMode) return;
  shownMode = mode;
  const state = MODES[mode];
  const color = state === 'off' ? 0xd97706 : 0x16a34a;
  banner.update({
    title: CALLS[state],
    accent: color,
    rows: [{ text: MEANINGS[state], color }, { text: HINT, color: 0x94a3b8 }],
  });
}

const tick = () => refreshLabels();
app.ticker.add(tick);
applyPool();
refreshLabels();

return {
  reelSet,
  stage,
  onSpin: async () => {
    // Step to the next state so consecutive spins show all three.
    mode = (mode + 1) % MODES.length;
    applyPool();

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 200));
    // Visible cells come from the server, as always. Only the cells nobody
    // named -- here, the buffers -- are drawn from the pools.
    reelSet.setResult(
      Array.from({ length: COLS }, () => ({
        visible: Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
      })),
    );
    await p;
  },
  cleanup: () => {
    app.ticker.remove(tick);
  },
};
