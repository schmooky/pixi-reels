// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CoinSymbol, coinValue,
//                   EmptySymbol, PIXI, app, pickWeighted

// A Hold & Win round whose cells spin SIDEWAYS.
//
// `HoldAndWinBuilder` and `BoardGrid` build every cell as a vertical 1x1
// ReelSet and expose no axis knob, so a board that runs on another axis is
// built straight on a ReelSet: `.orientation('horizontal')` gives three rows
// whose strips travel along X, and CellPin supplies the lock.
//
// A pin claims a cell: the strip can't overwrite it, `setResult` overlays it,
// and while the row scrolls the engine draws the coin as an overlay that holds
// its place. That is the whole hold mechanic, and none of it mentions the
// axis - `pin(reel, cell, ...)` is index space, and the axis decides where
// that lands on screen.

const REELS = 3;   // 3 rows
const CELLS = 5;   // 5 cells along each row
const SIZE = 66, GAP = 6;
const BLANK = 'blank';
const CAPACITY = REELS * CELLS;
const START_RESPINS = 3;
const MAX_WAVES = 8;

const COINS = [
  { id: 'coin5', value: 5 },
  { id: 'coin10', value: 10 },
  { id: 'coin25', value: 25 },
  { id: 'coin50', value: 50 },
];
const COIN_WEIGHTS = { coin5: 10, coin10: 6, coin25: 3, coin50: 1 };
const valueOf = (id) => COINS.find((c) => c.id === id).value;

const reelSet = new ReelSetBuilder()
  .orientation('horizontal')
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .symbols((r) => {
    r.register(BLANK, EmptySymbol, {});
    for (const coin of COINS) r.register(coin.id, CoinSymbol, coinValue(coin.value));
  })
  // Coins flash past blanks while a row spins.
  .weights({ [BLANK]: 8, ...COIN_WEIGHTS })
  .initialFrame(
    Array.from({ length: REELS }, () => ({ visible: Array.from({ length: CELLS }, () => BLANK) })),
  )
  .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 480, stopDelay: 90 })
  .ticker(app.ticker)
  .build();

// Cell chrome, drawn behind the reels. `getCellBounds` is screen space in
// every orientation, so this arithmetic is the same on a vertical board.
const chrome = new PIXI.Graphics();
for (let reel = 0; reel < REELS; reel++) {
  for (let cell = 0; cell < CELLS; cell++) {
    const b = reelSet.getCellBounds(reel, cell);
    chrome.roundRect(b.x, b.y, b.width, b.height, 8)
      .fill({ color: 0x140f2e, alpha: 0.55 })
      .stroke({ color: 0x6a5acd, width: 1, alpha: 0.6 });
  }
}
reelSet.addChildAt(chrome, 0);

const stage = new PIXI.Container();
stage.addChild(reelSet);
const boardH = REELS * SIZE + (REELS - 1) * GAP;
const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xf5d066 },
});
hud.position.set(0, boardH + 12);
stage.addChild(hud);

const total = () =>
  [...reelSet.pins.values()].reduce((sum, pin) => sum + (pin.payload?.value ?? 0), 0);
const paint = (respins) => {
  hud.text = `RESPINS ${respins}   LOCKED ${reelSet.pins.size}/${CAPACITY}   TOTAL ${total()}`;
};
paint(START_RESPINS);

const freeCells = () => {
  const out = [];
  for (let reel = 0; reel < REELS; reel++) {
    for (let cell = 0; cell < CELLS; cell++) {
      if (!reelSet.getPin(reel, cell)) out.push({ reel, cell });
    }
  }
  return out;
};

// The server decides the hits; this stands in for it.
function rollHits(count) {
  const free = freeCells();
  const hits = [];
  for (let i = 0; i < count && free.length > 0; i++) {
    const pick = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    hits.push({ ...pick, id: pickWeighted(COIN_WEIGHTS) });
  }
  return hits;
}

async function wave(hits) {
  const grid = Array.from({ length: REELS }, () => Array.from({ length: CELLS }, () => BLANK));
  for (const hit of hits) grid[hit.reel][hit.cell] = hit.id;
  const p = reelSet.spin();
  await new Promise((r) => setTimeout(r, 200));
  reelSet.setResult(grid.map((visible) => ({ visible })));
  await p;
  // Lock what landed. Permanent is the default; the round clears them itself.
  for (const hit of hits) {
    reelSet.pin(hit.reel, hit.cell, hit.id, {
      turns: 'permanent',
      payload: { value: valueOf(hit.id) },
    });
  }
}

let busy = false;
return {
  reelSet,
  stage,
  onSpin: async () => {
    if (busy) return;
    busy = true;
    try {
      for (const pin of [...reelSet.pins.values()]) reelSet.unpin(pin.reel, pin.cell);
      for (let reel = 0; reel < REELS; reel++) {
        for (let cell = 0; cell < CELLS; cell++) reelSet.setSymbolAt(reel, cell, BLANK);
      }

      let respins = START_RESPINS;
      paint(respins);
      // Trigger wave: three coins land and lock.
      await wave(rollHits(3));
      paint(respins);

      for (let w = 0; w < MAX_WAVES && respins > 0 && reelSet.pins.size < CAPACITY; w++) {
        await new Promise((r) => setTimeout(r, 350));
        const hits = rollHits(Math.random() < 0.55 ? 1 : 0);
        await wave(hits);
        respins = hits.length > 0 ? START_RESPINS : respins - 1;
        paint(respins);
      }
      hud.text = `ROUND OVER   LOCKED ${reelSet.pins.size}/${CAPACITY}   TOTAL ${total()}`;
    } finally {
      busy = false;
    }
  },
  cleanup: () => {
    try { hud.destroy(); } catch {}
    try { chrome.destroy(); } catch {}
  },
};
