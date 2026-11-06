import { HoldAndWinBuilder } from 'pixi-reels';
import { CLOVER_CELL, CLOVER_SPEED, cloverCellMask, cloverGridBackground, readout, createAssets, tapToSpin } from '@pixi-reels/kit';
import { CloverSpineSymbol } from '@pixi-reels/kit/spine';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { boardSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Landing only, celebrate once',
  topic: 'hold-and-win',
  tags: ['hold-and-win', 'coins', 'collector', 'respin', 'spine', 'horizontal', 'reverse', 'orientation', 'rectangular', 'clovers'],
  height: 360,
  needs: ['hw-clover-spine'],
} as const satisfies RecipeMeta;

// Landing only. By default the board plays a coin's win animation the moment
// it locks; most productions want just a land beat there and one celebration
// once the board is decided. `lockAnimation('landing')` makes every lock play
// `playLanding()` (a settle) and nothing else; the game calls
// `board.playWin()` itself when the feature ends.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const assets = createAssets();
  const COLS = 5, ROWS = 3;
  const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
  const SCALE = CELL.width / CLOVER_CELL.width; // the skeletons are authored at the 202x170 cell
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fmt = (v: number) => v.toFixed(2);
  const pick = (a: number[]) => a[Math.floor(Math.random() * a.length)];

  const art = await assets.cloverSpines(); // atlas + skeletons, plus the sheets for titles and plaques

  // Gold is the money clover: on the strip it already wears a bet-scaled amount,
  // a different one each time it flashes past, so money reads as money in
  // motion. The served amount replaces it the frame the cell lands.
  const STRIP_VALUES = [1, 1, 1.5, 2, 2.5, 3, 5, 7, 10];
  class Clover extends CloverSpineSymbol {
    onActivate(id: string) {
      super.onActivate(id);
      if (id === 'gold') this.setLabel(fmt(pick(STRIP_VALUES)));
    }
  }
  // The clover glow is drawn past the 202x170 cell: lift these above the cell mask
  // at rest (unmask), or every edge of every clover is clipped.
  const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));

  const board = new HoldAndWinBuilder<{ value: number }>()
    .grid(COLS, ROWS)
    .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
    .symbols((r) => {
      for (const id of ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty']) r.register(id, Clover, { scale: SCALE });
    })
    .weights({ gold: 2, collect: 0.6, multi: 0.6, mystery: 0.6, super: 0.4, capsule: 0.5, empty: 5 })
    .symbolData(UNMASK)
    // a few px of bounce, not the tall-reel default: a clover cell should settle, not jump
    .speedProfile(CLOVER_SPEED)
    // rounded cells, cut on the frame's own radius
    .cellMask(cloverCellMask)
    .respins(3)
    // 'win' (default) | 'landing' | 'none'
    .lockAnimation('landing')
    .ticker(app.ticker)
    .build();

  const boardW = COLS * CELL.width + (COLS - 1) * COLUMN_GAP;
  const boardH = ROWS * CELL.height + (ROWS - 1) * ROW_GAP;
  board.container.position.set((app.screen.width - boardW) / 2, (app.screen.height - boardH) / 2 - 8);
  // the game's framing: gradient panel + grid lines in the gaps, behind a chrome-less board
  const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: ROWS, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP });
  app.stage.addChild(grid);
  app.stage.addChild(board.container);

  const hud = readout.plaque({
    text: 'Coins celebrate once, on the landing.',
    fontSize: 12, align: 'center', anchor: { x: 0.5, y: 0 }, minWidth: boardW,
  });
  hud.position.set(app.screen.width / 2, board.container.y + boardH + 24);
  app.stage.addChild(hud);

  let landed = 0;
  board.events.on('cell:landed', ({ cell, coin }) => {
    if (!coin) return;
    landed += 1;
    (board.symbolAt(cell) as Clover).setLabel(fmt(coin.data!.value));
    hud.text = `Coin ${landed} landed, settle only, no win`;
  });

  const SEED = [
    { cell: { reel: 1, cell: 1 }, id: 'gold', data: { value: 3 } },
    { cell: { reel: 3, cell: 2 }, id: 'gold', data: { value: 1 } },
  ];
  const ROUNDS = [[{ reel: 0, cell: 0 }, { reel: 4, cell: 0 }], [{ reel: 2, cell: 1 }], [{ reel: 4, cell: 2 }], [], [], []];

  let busy = false;
  boardSounds(board);
  tapToSpin(app, {
    spin: async () => {
      if (busy) return;
      busy = true;
      landed = 0;
      board.reset();
      board.enter(SEED);
      for (const c of SEED) { const sym = board.symbolAt(c.cell) as Clover; sym.setLabel(fmt(c.data.value)); sym.playIdle(); }
      await sleep(350);
      for (const cells of ROUNDS) {
        const result = await board.respin(cells.map((cell) => ({ cell, id: 'gold', data: { value: pick(STRIP_VALUES) } })));
        await sleep(350);
        if (result.done) break;
      }
      // The one explicit celebration: every locked coin pulses together.
      hud.text = 'Feature over, board.playWin() on every locked coin';
      await board.playWin();
      const total = board.lockedCoins.reduce((a, c) => a + c.data!.value, 0);
      hud.text = `Total ${fmt(total)}. Tap to replay.`;
      busy = false;
    },
  });
  return {
    board,
    cleanup: () => { try { hud.destroy({ children: true }); } catch {} grid.destroy({ children: true }); board.destroy(); },
  };
}
