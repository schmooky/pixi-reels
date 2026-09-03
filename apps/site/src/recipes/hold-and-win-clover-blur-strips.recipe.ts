// @ts-nocheck
// Injected: HoldAndWinBuilder, SpeedPresets, CloverSymbol, loadHwClover, PIXI, gsap, app
//
// Blur strips on rectangular cells. Every symbol in the set ships a crisp
// frame and a motion-blur frame; CloverSymbol swaps to the blur while its
// reel spins and back on the stop. Two one-row boards, same spin: the top
// one uses the blur frames, the bottom one is a subclass that never swaps -
// the difference is why studios pre-render the blur.

const COLS = 5;
const CELL = { width: 101, height: 85 }, COLUMN_GAP = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => v.toFixed(2);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const art = await loadHwClover();
// The clover glow is drawn past the 202x170 cell: lift these above the cell mask
// at rest (unmask), or every edge of every clover is clipped.
const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
const IDS = ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty'];

class Blurred extends CloverSymbol {
  onActivate(id) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick([1, 2, 5, 10]))); }
}
// Opt out of the swap: the crisp frame smears into stripes at reel speed.
class Crisp extends Blurred {
  onReelSpinStart() {}
}

const makeRow = (Symbol, y) => {
  const board = new HoldAndWinBuilder()
    .grid(COLS, 1)
    .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: 0 })
    .symbols((r) => { for (const id of IDS) r.register(id, Symbol, { art }); })
    .weights({ gold: 2, collect: 1, multi: 1, mystery: 1, super: 0.7, capsule: 0.8, empty: 3 })
    // a long spin so the strip is on screen long enough to compare
    .speedProfile({ ...SpeedPresets.NORMAL, minimumSpinTime: 1600 })
    .stagger((reel) => reel * 120)
    .symbolData(UNMASK)
    .lockAnimation('none')
    .cellChrome((g, w, h) => g.rect(0, 0, w, h).fill({ color: 0x0b1a4a }).stroke({ color: 0x3f6bd8, width: 1, alpha: 0.8 }))
    .ticker(app.ticker)
    .build();
  board.container.position.set((app.screen.width - (COLS * CELL.width + (COLS - 1) * COLUMN_GAP)) / 2, y);
  app.stage.addChild(board.container);
  board.events.on('cell:landed', ({ cell, coin }) => { if (coin) board.symbolAt(cell).setLabel(fmt(coin.data.value)); });
  return board;
};
const top = makeRow(Blurred, 24);
const bottom = makeRow(Crisp, 24 + CELL.height + 34);

const caption = (text, y) => {
  const t = new PIXI.Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: '600', fill: 0x9c8f78 } });
  t.anchor.set(0.5, 0);
  t.position.set(app.screen.width / 2, y);
  app.stage.addChild(t);
  return t;
};
const c1 = caption('with blur frames (CloverSymbol swaps on spin)', 6);
const c2 = caption('without: the crisp frame at reel speed', top.container.y + CELL.height + 16);

const gold = (cell) => ({ cell, id: 'gold', data: { value: pick([1, 2, 5, 10]) } });
let busy = false;
return {
  cleanup: () => { try { c1.destroy(); c2.destroy(); } catch {} top.destroy(); bottom.destroy(); },
  onSpin: async () => {
    if (busy) return;
    busy = true;
    for (const b of [top, bottom]) { b.reset(); b.enter([]); }
    const hits = [{ reel: 1, cell: 0 }, { reel: 3, cell: 0 }];
    await Promise.all([top.respin(hits.map(gold)), bottom.respin(hits.map(gold))]);
    await sleep(300);
    busy = false;
  },
};
