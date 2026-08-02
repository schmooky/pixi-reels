// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CoinSymbol, coinValue,
//                   EmptySymbol, PIXI, app, pickWeighted

// A Hold & Win round whose free cells roll UPWARD.
//
// `.direction('reverse')` is the only line that makes this a roll-up; the lock
// itself is the same CellPin claim as any other Hold & Win, because pins are
// index space and travel direction never enters into them.
//
// It also picks up the one spin option that pairs naturally with a lock:
// `spin({ holdReels })`. A reel whose every cell is already locked has nothing
// to reroll, so it is held out of the wave entirely - it never starts, never
// stops, and contributes its current cells to the result. Held indices are
// reel indices, so this is axis-neutral too.

const REELS = 5, CELLS = 3, SIZE = 68, GAP = 6;
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
  .reels(REELS)
  .visibleCells(CELLS)
  .symbolSize(SIZE, SIZE)
  .symbolGap(GAP, GAP)
  .direction('reverse') // free cells roll up between waves
  .symbols((r) => {
    r.register(BLANK, EmptySymbol, {});
    for (const coin of COINS) r.register(coin.id, CoinSymbol, coinValue(coin.value));
  })
  .weights({ [BLANK]: 8, ...COIN_WEIGHTS })
  .initialFrame(
    Array.from({ length: REELS }, () => ({ visible: Array.from({ length: CELLS }, () => BLANK) })),
  )
  .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 460, stopDelay: 90 })
  .ticker(app.ticker)
  .build();

// Chrome behind the cells + a gold frame on every locked one.
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

const locks = new PIXI.Graphics();
reelSet.addChild(locks);
const redrawLocks = () => {
  locks.clear();
  for (const pin of reelSet.pins.values()) {
    const b = reelSet.getCellBounds(pin.reel, pin.cell);
    locks.roundRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2, 8)
      .stroke({ width: 3, color: 0xffd43b, alpha: 0.9 });
  }
};
reelSet.events.on('pin:placed', redrawLocks);
reelSet.events.on('pin:expired', redrawLocks);

const stage = new PIXI.Container();
stage.addChild(reelSet);
const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xf5d066 },
});
hud.position.set(0, CELLS * SIZE + (CELLS - 1) * GAP + 12);
stage.addChild(hud);

const total = () =>
  [...reelSet.pins.values()].reduce((sum, pin) => sum + (pin.payload?.value ?? 0), 0);
const paint = (respins, held) => {
  hud.text =
    `RESPINS ${respins}   LOCKED ${reelSet.pins.size}/${CAPACITY}   TOTAL ${total()}` +
    (held.length > 0 ? `   HELD REELS ${held.join(',')}` : '');
};

// Reels with every cell locked. Nothing to reroll, so they sit the wave out.
const fullReels = () => {
  const out = [];
  for (let reel = 0; reel < REELS; reel++) {
    let full = true;
    for (let cell = 0; cell < CELLS; cell++) if (!reelSet.getPin(reel, cell)) full = false;
    if (full) out.push(reel);
  }
  return out;
};

const freeCells = () => {
  const out = [];
  for (let reel = 0; reel < REELS; reel++) {
    for (let cell = 0; cell < CELLS; cell++) {
      if (!reelSet.getPin(reel, cell)) out.push({ reel, cell });
    }
  }
  return out;
};

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
  const held = fullReels();
  const grid = Array.from({ length: REELS }, () => Array.from({ length: CELLS }, () => BLANK));
  for (const hit of hits) grid[hit.reel][hit.cell] = hit.id;
  const p = reelSet.spin({ holdReels: held });
  await new Promise((r) => setTimeout(r, 200));
  // Full-width grid even with reels held: the engine ignores held columns.
  reelSet.setResult(grid.map((visible) => ({ visible })));
  await p;
  for (const hit of hits) {
    reelSet.pin(hit.reel, hit.cell, hit.id, {
      turns: 'permanent',
      payload: { value: valueOf(hit.id) },
    });
  }
  return held;
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
      redrawLocks();
      for (let reel = 0; reel < REELS; reel++) {
        for (let cell = 0; cell < CELLS; cell++) reelSet.setSymbolAt(reel, cell, BLANK);
      }

      let respins = START_RESPINS;
      paint(respins, []);
      // Trigger wave: a column's worth of coins lands and locks, which is
      // what puts a reel in the held set for the waves that follow.
      await wave([
        { reel: 1, cell: 0, id: pickWeighted(COIN_WEIGHTS) },
        { reel: 1, cell: 1, id: pickWeighted(COIN_WEIGHTS) },
        { reel: 1, cell: 2, id: pickWeighted(COIN_WEIGHTS) },
        { reel: 3, cell: 1, id: pickWeighted(COIN_WEIGHTS) },
      ]);
      paint(respins, fullReels());

      for (let w = 0; w < MAX_WAVES && respins > 0 && reelSet.pins.size < CAPACITY; w++) {
        await new Promise((r) => setTimeout(r, 350));
        const hits = rollHits(Math.random() < 0.55 ? 1 : 0);
        const held = await wave(hits);
        respins = hits.length > 0 ? START_RESPINS : respins - 1;
        paint(respins, held);
      }
      hud.text = `ROUND OVER   LOCKED ${reelSet.pins.size}/${CAPACITY}   TOTAL ${total()}`;
    } finally {
      busy = false;
    }
  },
  cleanup: () => {
    try { hud.destroy(); } catch {}
    try { locks.destroy(); } catch {}
    try { chrome.destroy(); } catch {}
  },
};
