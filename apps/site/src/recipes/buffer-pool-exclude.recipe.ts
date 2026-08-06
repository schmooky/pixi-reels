// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   PIXI, app
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
// buffers of ONE reel. This demo cycles the three states on each spin and
// prints what every hidden cell actually holds, so you can watch it work.

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
const MODES = ['off', 'reel 1 only', 'every reel'];
let mode = 0;

function applyPool() {
  const banned = { exclude: [COIN] };
  // Reel 1's own buffer layer.
  reelSet.randomSymbols.set(MODES[mode] === 'reel 1 only' ? banned : null, {
    reel: 1,
    slots: 'buffer',
  });
  // The set-wide buffer layer.
  reelSet.randomSymbols.set(MODES[mode] === 'every reel' ? banned : null, { slots: 'buffer' });
}

// --- Readouts: what is actually in the hidden cells --------------------
// Everything lives in one composition root with room above the grid for the
// banner, returned as `stage` so the runner scales and centres the whole
// thing rather than clipping the parts that sit above the reels.
const PAD_TOP = 94;
const stage = new PIXI.Container();
reelSet.y = PAD_TOP;
stage.addChild(reelSet);

const text = (size, weight) =>
  new PIXI.Text({
    text: '',
    style: {
      fontFamily: 'ui-monospace, monospace',
      fontSize: size,
      fontWeight: weight,
      fill: 0x475569,
    },
  });

const banner = text(14, '700');
banner.y = 0;
stage.addChild(banner);

const meaning = text(11, '600');
meaning.y = 20;
stage.addChild(meaning);

const hint = text(10, '500');
hint.style.fill = 0x94a3b8;
hint.y = 40;
hint.text = 'the labels above and below each reel ARE its hidden cells';
stage.addChild(hint);

// One label per hidden cell, sitting where that cell sits: above the grid
// for bufferStart, below it for bufferEnd. Each column also carries its own
// index, because reel indices are 0-based: `{ reel: 1 }` is the SECOND reel.
const startLabels = [];
const endLabels = [];
for (let i = 0; i < COLS; i++) {
  const index = text(10, '500');
  index.style.fill = 0x94a3b8;
  index.anchor.set(0.5, 1);
  index.x = i * (SIZE + GAP) + SIZE / 2;
  index.y = PAD_TOP - 22;
  index.text = `reel ${i}`;
  stage.addChild(index);

  const top = text(11, '700');
  top.anchor.set(0.5, 1);
  top.x = i * (SIZE + GAP) + SIZE / 2;
  top.y = PAD_TOP - 4;
  stage.addChild(top);
  startLabels.push(top);

  const bottom = text(11, '700');
  bottom.anchor.set(0.5, 0);
  bottom.x = top.x;
  bottom.y = PAD_TOP + ROWS * (SIZE + GAP) - GAP + 6;
  stage.addChild(bottom);
  endLabels.push(bottom);
}

function refreshLabels() {
  for (let i = 0; i < COLS; i++) {
    const strip = reelSet.reels[i].symbols;
    const first = strip[0].symbolId;
    const last = strip[strip.length - 1].symbolId;
    startLabels[i].text = first;
    startLabels[i].style.fill = first === COIN ? 0xd97706 : 0x16a34a;
    endLabels[i].text = last;
    endLabels[i].style.fill = last === COIN ? 0xd97706 : 0x16a34a;
  }
  const state = MODES[mode];
  banner.text =
    state === 'off'
      ? 'no buffer pool'
      : state === 'reel 1 only'
        ? "set({ exclude: ['COIN'] }, { reel: 1, slots: 'buffer' })"
        : "set({ exclude: ['COIN'] }, { slots: 'buffer' })";
  meaning.text =
    state === 'off'
      ? 'COIN parks in every hidden cell'
      : state === 'reel 1 only'
        ? 'only reel 1 stays clean -- indices are 0-based, so that is the SECOND reel'
        : 'no COIN parks off-window on any reel';
  banner.style.fill = state === 'off' ? 0xd97706 : 0x16a34a;
  meaning.style.fill = state === 'off' ? 0xd97706 : 0x16a34a;
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
