import { HoldAndWinBuilder } from 'pixi-reels';
import { CLOVER_CELL, CLOVER_SPEED, cloverCellMask, cloverGridBackground, readout, createAssets, tapToSpin } from '@pixi-reels/kit';
import { CloverSpineSymbol } from '@pixi-reels/kit/spine';
import type { BoardCellZIndexResolver, HwCell } from 'pixi-reels';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { boardSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'One cell in front, for a beat',
  topic: 'hold-and-win',
  tags: ['hold-and-win', 'coins', 'collector', 'respin', 'spine', 'horizontal', 'reverse', 'orientation', 'rectangular', 'clovers'],
  height: 400,
  needs: ['hw-clover-spine'],
} as const satisfies RecipeMeta;

// A CELL IN FRONT, FOR A BEAT. `cellZIndex` says which clover draws over
// which at rest, and the board re-asks it on every place and every landing.
// That is right at rest and wrong for the ~1s a clover spends upgrading:
// whatever the resolver says, THIS clover must not be overlapped while it
// plays. `board.lift(cell)` promotes it on a separate channel and hands back
// a release; the order refresh keeps running underneath and cannot touch it.
//
// The demo upgrades the middle clover while its neighbours keep landing. The
// counter shows the refresh firing during the lift - and the clover stays in
// front through every one.
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
  const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'super', 'capsule'].map((id) => [id, { unmask: true }]));

  // The at-rest order every recipe on this page uses: lower rows in front, so a
  // clover's glow hangs down over the cell below. It is exactly the rule the
  // lift has to suspend - the clover we upgrade sits in row 0, the row the
  // resolver puts LAST.
  let refreshes = 0;
  const cellZIndex: BoardCellZIndexResolver = ({ cell, cols, attachOrder }) => {
    // One sweep asks about every cell, so count the first answer of each.
    if (attachOrder === 0) refreshes++;
    return cell.cell * cols + cell.reel;
  };

  const board = new HoldAndWinBuilder<{ value: number }>()
    .grid(COLS, ROWS)
    .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
    .symbols((r) => { for (const id of ['gold', 'collect', 'super', 'capsule', 'empty']) r.register(id, CloverSpineSymbol, { scale: SCALE }); })
    .weights({ gold: 3, collect: 0.5, super: 0.4, capsule: 0.4, empty: 5 })
    .symbolData(UNMASK)
    .speedProfile(CLOVER_SPEED)
    .cellMask(cloverCellMask)
    .cellZIndex(cellZIndex)
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

  const hud = readout.plaque({ text: 'One cell comes to the front for a beat.', fontSize: 12, align: 'center', anchor: { x: 0.5, y: 0 }, minWidth: boardW });
  hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
  app.stage.addChild(hud);

  board.events.on('cell:landed', ({ cell, coin }) => {
    if (coin?.id === 'gold') (board.symbolAt(cell) as CloverSpineSymbol).setLabel(fmt(coin.data!.value));
  });

  const gold = (cell: HwCell, value: number = pick(VALUES)) => ({ cell, id: 'gold', data: { value } });

  // The cell that upgrades: row 0, so the at-rest order draws it BEHIND both
  // rows under it. Without the lift its upgrade plays under two neighbours.
  const HERO = { reel: 2, cell: 0 };
  const SEED = [HERO, { reel: 2, cell: 1 }, { reel: 2, cell: 2 }, { reel: 1, cell: 1 }].map((c) => gold(c));
  // Landings that keep arriving DURING the hero's upgrade - each one is a
  // `refreshCellZIndex()` over all 15 cells.
  const DURING = [
    [gold({ reel: 1, cell: 0 }), gold({ reel: 3, cell: 1 })],
    [gold({ reel: 3, cell: 0 })],
    [gold({ reel: 1, cell: 2 }), gold({ reel: 3, cell: 2 })],
  ];

  /** Raise a clover's value on its face, held in front of the board while it plays. */
  async function upgrade(cell: HwCell, to: number) {
    const release = board.lift(cell);
    const symbol = board.symbolAt(cell) as CloverSpineSymbol;
    const before = refreshes;
    try {
      for (const step of [to / 8, to / 4, to / 2, to]) {
        symbol.setLabel(fmt(step));
        symbol.playWin();
        hud.text = `lifted ${cell.reel},${cell.cell} - ${refreshes - before} whole-board order refreshes since, still in front`;
        await sleep(460);
      }
    } finally {
      // A release the caller cannot forget: the lift's lifetime is this function's.
      release();
    }
    symbol.playIdle();
  }

  let busy = false;
  boardSounds(board);
  tapToSpin(app, {
    spin: async () => {
      if (busy) return;
      busy = true;
      board.reset();
      board.enter(SEED);
      for (const c of SEED) { const s = board.symbolAt(c.cell) as CloverSpineSymbol; s.setLabel(fmt(c.data.value)); s.playIdle(); }
      // A beat at rest first: the hero is in row 0, so the row-dominant order
      // draws it UNDER the clover below it. That is the order the lift suspends.
      hud.text = `at rest: ${HERO.reel},${HERO.cell} is in row 0, so the row below draws over it`;
      await sleep(1100);

      // The upgrade and the respins run TOGETHER: every landing below refreshes
      // the whole board's order while the hero is still mid-animation.
      const lifted = upgrade(HERO, 25);
      for (const hits of DURING) {
        await board.respin(hits);
        await sleep(120);
      }
      await lifted;

      hud.text = `back in the pack after ${refreshes} whole-board refreshes`;
      busy = false;
    },
  });
  return {
    board,
    cleanup: () => { try { hud.destroy({ children: true }); } catch {} grid.destroy({ children: true }); board.destroy(); },
  };
}
