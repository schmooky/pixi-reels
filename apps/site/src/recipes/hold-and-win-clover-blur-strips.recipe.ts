import { HoldAndWinBuilder } from 'pixi-reels';
import {
  CLOVER_CELL,
  CLOVER_SPEED,
  cloverCellMask,
  cloverGridBackground,
  readout,
} from '@pixi-reels/kit';
import { CloverSpineSymbol } from '@pixi-reels/kit/spine';
import type { Container } from 'pixi.js';
import type { HwCell } from 'pixi-reels';
import type { CloverSpineSymbolOptions } from '@pixi-reels/kit/spine';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';

export const meta = {
  title: 'Blur strips on rectangular cells',
  topic: 'hold-and-win',
  tags: ['hold-and-win', 'coins', 'collector', 'respin', 'spine', 'horizontal', 'reverse', 'orientation', 'rectangular', 'clovers'],
  height: 300,
  needs: ['hw-clover-spine'],
} as const satisfies RecipeMeta;

// Blur strips on rectangular cells. Every skeleton has a `blur` animation
// that swaps its body attachment to the motion-blur frame; SpineReelSymbol
// plays it while the reel moves (autoPlayBlur) and idle restores the crisp
// frame on the stop. Two one-row boards, same spin: the top one plays the
// blur track, the bottom one opts out - the difference is why studios
// pre-render the blur.
export default async function recipe({ app, assets }: RecipeContext): Promise<RecipeResult> {
  const COLS = 5;
  const CELL = { width: 101, height: 85 }, COLUMN_GAP = 8, ROW_GAP = 8;
  const SCALE = CELL.width / CLOVER_CELL.width; // the skeletons are authored at the 202x170 cell
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fmt = (v: number) => v.toFixed(2);
  const pick = (a: number[]) => a[Math.floor(Math.random() * a.length)];

  const art = await assets.cloverSpines(); // atlas + skeletons, plus the sheets for titles and plaques
  // The clover glow is drawn past the 202x170 cell: lift these above the cell mask
  // at rest (unmask), or every edge of every clover is clipped.
  const UNMASK = Object.fromEntries(['gold', 'collect', 'multi', 'mystery', 'super', 'capsule'].map((id) => [id, { unmask: true }]));
  const IDS = ['gold', 'collect', 'multi', 'mystery', 'super', 'capsule', 'empty'];

  class Blurred extends CloverSpineSymbol {
    onActivate(id: string) { super.onActivate(id); if (id === 'gold') this.setLabel(fmt(pick([1, 2, 5, 10]))); }
  }
  // Opt out of the blur track: the crisp frame smears into stripes at reel speed.
  const CRISP = { scale: SCALE, autoPlayBlur: false };

  const grids: Container[] = [];
  const makeRow = (opts: CloverSpineSymbolOptions, y: number) => {
    const board = new HoldAndWinBuilder<{ value: number }>()
      .grid(COLS, 1)
      .cellSize(CELL, { columnGap: COLUMN_GAP, rowGap: ROW_GAP })
      .symbols((r) => { for (const id of IDS) r.register(id, Blurred, opts); })
      .weights({ gold: 2, collect: 1, multi: 1, mystery: 1, super: 0.7, capsule: 0.8, empty: 3 })
      // a long spin so the strip is on screen long enough to compare
      .speedProfile({ ...CLOVER_SPEED, minimumSpinTime: 1600 })
      .cellMask(cloverCellMask)
      .stagger((reel) => reel * 120)
      .symbolData(UNMASK)
      .lockAnimation('none')
        .ticker(app.ticker)
      .build();
    board.container.position.set((app.screen.width - (COLS * CELL.width + (COLS - 1) * COLUMN_GAP)) / 2, y);
    const grid = cloverGridBackground({ x: board.container.x, y: board.container.y, cols: COLS, rows: 1, cell: CELL, columnGap: COLUMN_GAP, rowGap: ROW_GAP, margin: 10 });
    app.stage.addChild(grid, board.container);
    grids.push(grid);
    board.events.on('cell:landed', ({ cell, coin }) => { if (coin) (board.symbolAt(cell) as CloverSpineSymbol).setLabel(fmt(coin.data!.value)); });
    return board;
  };
  const top = makeRow({ scale: SCALE }, 40);
  const bottom = makeRow(CRISP, 40 + CELL.height + 56);

  // Plated captions: one above the top frame, one centred in the gap between the two.
  const caption = (text: string, y: number) => {
    const t = readout.plaque({ text, align: 'center', anchor: { x: 0.5, y: 0 } });
    t.position.set(app.screen.width / 2, y);
    app.stage.addChild(t);
    return t;
  };
  const c1 = caption('with the blur track (the skeleton swaps to its blur frame while the reel moves)', 0);
  const c2 = caption('without: the crisp frame at reel speed', top.container.y + CELL.height + 16);

  const gold = (cell: HwCell) => ({ cell, id: 'gold', data: { value: pick([1, 2, 5, 10]) } });
  let busy = false;
  return {
    cleanup: () => { try { c1.destroy({ children: true }); c2.destroy({ children: true }); for (const g of grids) g.destroy({ children: true }); } catch {} top.destroy(); bottom.destroy(); },
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
}
