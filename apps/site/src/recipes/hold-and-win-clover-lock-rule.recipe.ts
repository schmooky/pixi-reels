import { HoldAndWinBuilder } from 'pixi-reels';
import { CLOVER_CELL, CLOVER_SPEED, cloverCellMask, cloverGridBackground, readout, createAssets, tapToSpin } from '@pixi-reels/kit';
import { CloverSpineSymbol } from '@pixi-reels/kit/spine';
import type { HwCell } from 'pixi-reels';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { boardSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'The lock animation, per coin and after the landing',
  topic: 'hold-and-win',
  tags: ['hold-and-win', 'coins', 'collector', 'respin', 'spine', 'horizontal', 'reverse', 'orientation', 'rectangular', 'clovers'],
  height: 400,
  needs: ['hw-clover-spine'],
} as const satisfies RecipeMeta;

// THE LOCK ANIMATION, PER COIN AND AFTER THE LANDING.
//
// `lockAnimation` may be a function of the coin that just locked: gold
// settles with its landing only, COLLECT celebrates. And the celebration
// waits for the skeleton's own landing beat - the one `autoPlayLanding`
// started on the landing frame - instead of taking its track from it, which
// is what used to happen: `coin:locked` fires a bounce after the reel is on
// its frame, and `playWin()` on the same track cut the landing short every
// time. `symbol.landing` is that beat as a promise; the HUD prints when it
// finished and when the win followed.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const assets = createAssets();
  const COLS = 5, ROWS = 3;
  const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
  const SCALE = CELL.width / CLOVER_CELL.width;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fmt = (v: number) => v.toFixed(2);
  const pick = (a: number[]) => a[Math.floor(Math.random() * a.length)];
  const VALUES = [1, 1.5, 2, 2.5, 3, 5];

  const art = await assets.cloverSpines();
  const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
  class Clover extends CloverSpineSymbol {
    onActivate(id: string) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick(VALUES))); }
  }

  const board = new HoldAndWinBuilder<{ value: number }>()
    .grid(COLS, ROWS)
    .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
    .symbols((r) => {
      for (const id of ['gold', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { scale: SCALE });
      r.register('collect', Clover, { scale: SCALE, font: 'CloverJackpot', labelOffset: 0.02 });
    })
    .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
    .symbolData(UNMASK)
    .speedProfile(CLOVER_SPEED)
    .cellMask(cloverCellMask)
    .respins(3)
    // Per coin: the collector gets the win, everything else its landing only.
    .lockAnimation((coin) => (coin.id === 'collect' ? 'win' : 'landing'))
    .ticker(app.ticker)
    .build();

  const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
  const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
  board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
  const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
  app.stage.addChild(grid);
  app.stage.addChild(board.container);

  const hud = readout.plaque({ text: 'A coin locks as it lands, or after the landing.', fontSize: 12, align: 'center', anchor: { x: 0.5, y: 0 }, minWidth: boardW });
  hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
  app.stage.addChild(hud);

  board.events.on('cell:landed', ({ cell, coin }) => {
    if (coin?.id === 'gold') (board.symbolAt(cell) as Clover).setLabel(fmt(coin.data!.value));
  });
  // The sequencing, observed: the collector's landing beat is still running
  // when it locks; the board's win queues behind it.
  board.events.on('coin:locked', async ({ coin }) => {
    if (coin.id !== 'collect') return;
    const symbol = board.symbolAt(coin.cell);
    const t0 = performance.now();
    hud.text = 'COLLECT locked while its landing still plays - win waits';
    await symbol.landing;
    const landed = Math.round(performance.now() - t0);
    hud.text = `landing done +${landed}ms after the lock, win playing`;
    await symbol.playWin(); // resolves with the board's own win: same track, same entry
    hud.text = `landing done +${landed}ms, win done +${Math.round(performance.now() - t0)}ms`;
  });

  const gold = (cell: HwCell) => ({ cell, id: 'gold', data: { value: pick(VALUES) } });
  const SEED = [{ reel: 0, cell: 0 }, { reel: 3, cell: 1 }, { reel: 1, cell: 2 }].map(gold);
  const ROUNDS = [
    [gold({ reel: 4, cell: 0 })],
    [{ cell: { reel: 2, cell: 1 }, id: 'collect', data: { value: 0 } }],
    [gold({ reel: 4, cell: 2 })],
    [], [], [],
  ];

  let busy = false;
  boardSounds(board);
  tapToSpin(app, {
    spin: async () => {
      if (busy) return;
      busy = true;
      board.reset();
      board.enter(SEED);
      for (const c of SEED) { const sym = board.symbolAt(c.cell) as Clover; sym.setLabel(fmt(c.data.value)); sym.playIdle(); }
      hud.text = 'gold: landing only. COLLECT: landing, then win.';
      await sleep(400);
      for (const hits of ROUNDS) {
        const res = await board.respin(hits);
        await sleep(900);
        if (res.done) break;
      }
      busy = false;
    },
  });
  return {
    board,
    cleanup: () => { try { hud.destroy({ children: true }); } catch {} grid.destroy({ children: true }); board.destroy(); },
  };
}
