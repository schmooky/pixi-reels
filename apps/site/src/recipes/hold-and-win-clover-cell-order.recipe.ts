import { HoldAndWinBuilder } from 'pixi-reels';
import type { HwCell } from 'pixi-reels';
import { CLOVER_CELL, CLOVER_SPEED, cloverCellMask, cloverGridBackground, readout, createAssets, tapToSpin } from '@pixi-reels/kit';
import { CloverSpineSymbol } from '@pixi-reels/kit/spine';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { boardSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Draw order between cells',
  topic: 'hold-and-win',
  tags: ['hold-and-win', 'coins', 'collector', 'respin', 'spine', 'horizontal', 'reverse', 'orientation', 'rectangular', 'clovers'],
  height: 400,
  needs: ['hw-clover-spine'],
} as const satisfies RecipeMeta;

// DRAW ORDER BETWEEN CELLS. Every cell is its own 1x1 reel set, so a
// clover's zIndex only ever sorts it against its own buffers; the clovers
// the engine lifts above the cells at rest (unmask) all render in ONE layer
// the board owns, in attach order - column by column - which lets the next
// column's clover cover a lower clover's glow. `cellZIndex` sorts that layer
// by whatever the board says: here lower rows in front (a clover's glow
// hangs down over the cell below), and the capsule above everything. It is
// asked again on every place and every landing, so the answer can depend
// on the clover shown.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const assets = createAssets();
  const COLS = 5, ROWS = 3;
  const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
  const SCALE = CELL.width / CLOVER_CELL.width;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fmt = (v: number) => v.toFixed(2);
  const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  const VALUES = [1, 1.5, 2, 2.5, 3, 5];

  const art = await assets.cloverSpines();
  const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
  class Clover extends CloverSpineSymbol {
    onActivate(id: string) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick(VALUES))); }
  }

  const board = new HoldAndWinBuilder<{ value: number }>()
    .grid(COLS, ROWS)
    .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
    .symbols((r) => { for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { scale: SCALE }); })
    .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
    .symbolData(UNMASK)
    .speedProfile(CLOVER_SPEED)
    .cellMask(cloverCellMask)
    // Rows beat columns; the capsule beats rows. `attachOrder` would be the default.
    .cellZIndex(({ cell, symbolId, cols }) =>
      (symbolId === 'capsule' ? 1000 : 0) + cell.cell * cols + cell.reel)
    .respins(3)
    .lockAnimation('landing')
    .ticker(app.ticker)
    .build();

  const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
  const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
  board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 10);
  const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
  app.stage.addChild(grid);
  app.stage.addChild(board.container);

  const hud = readout.plaque({ text: 'Cells draw in a set order, so overlaps are predictable.', fontSize: 12, align: 'center', anchor: { x: 0.5, y: 0 }, minWidth: boardW });
  hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
  app.stage.addChild(hud);

  board.events.on('cell:landed', ({ cell, coin }) => {
    if (coin?.id === 'gold') (board.symbolAt(cell) as Clover).setLabel(fmt(coin.data!.value));
  });
  board.events.on('coin:locked', ({ locked, capacity }) => {
    hud.text = `${locked} of ${capacity} held, lower rows in front, capsule on top`;
  });

  const gold = (cell: HwCell) => ({ cell, id: 'gold', data: { value: pick(VALUES) } });
  const capsule = (cell: HwCell) => ({ cell, id: 'capsule', data: { value: 0 } });
  // Full columns, so every clover has a neighbour above and below to overlap.
  const SEED = [{ reel: 1, cell: 0 }, { reel: 1, cell: 1 }, { reel: 1, cell: 2 }, { reel: 3, cell: 1 }].map(gold);
  const ROUNDS = [
    [gold({ reel: 2, cell: 0 }), gold({ reel: 2, cell: 1 }), gold({ reel: 3, cell: 0 })],
    [capsule({ reel: 2, cell: 2 }), gold({ reel: 3, cell: 2 })],
    [gold({ reel: 0, cell: 1 })],
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
      hud.text = `${SEED.length} of ${board.capacity} held, lower rows in front, capsule on top`;
      await sleep(400);
      for (const hits of ROUNDS) {
        const res = await board.respin(hits);
        await sleep(400);
        if (res.done) break;
      }
      hud.text = 'Feature over.';
      busy = false;
    },
  });
  return {
    board,
    cleanup: () => { try { hud.destroy({ children: true }); } catch {} grid.destroy({ children: true }); board.destroy(); },
  };
}
