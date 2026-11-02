import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  CARD_DECK,
  CardSymbol,
  ReelSetBuilder,
  SpeedPresets,
  WILD_CARD,
  WinPresenter,
} from 'pixi-reels';
import type { SymbolPosition } from 'pixi-reels';
import { WinLines } from 'pixi-reels/debug';
import { evaluateWays } from '@pixi-reels/kit/ways';
import { pickWeighted, readout, tapToSpin } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Paylines and payways with WinLines',
  topic: 'cells-and-banners',
  tags: ['paylines', 'hit-areas', 'overlays', 'wins', 'horizontal', 'orientation'],
  height: 400,
} as const satisfies RecipeMeta;

// `WinLines` (from `pixi-reels/debug`) draws wins with pixi-silk: a payline
// is one stroke through one cell per reel, a payway is every winning cell
// joined to every winning cell on the next reel. It only draws the cells it
// is handed; the wins here come from a few lines of recipe code (paylines)
// and from `evaluateWays` (ways), both stand-ins for the server.
//
// Spins alternate: odd spins pay ten fixed lines and the presenter walks
// them one at a time, each drawn as it is shown; even spins pay ways and draw
// every winning symbol's lattice at once.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const COLS = 5;
  const ROWS = 3;
  const SIZE = 86;
  const GAP = 6;
  const W = { '7': 14, '8': 14, '9': 12, '10': 12, J: 10, Q: 9, K: 8, A: 7, wild: 4 };

  // Row per reel, the classic first ten.
  const PAYLINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  ];

  const reelSet = new ReelSetBuilder()
    .reels(COLS)
    .visibleCells(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const s of [...CARD_DECK, WILD_CARD]) {
        r.register(s.id, CardSymbol, { color: s.color, label: s.label, textColor: s.textColor });
      }
    })
    .weights(W)
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  const BOARD_W = COLS * (SIZE + GAP) - GAP;
  const BOARD_H = ROWS * (SIZE + GAP) - GAP;
  const stage = new PIXI.Container();
  stage.addChild(reelSet);
  const hud = readout.plaque({ rows: ['press spin'], minWidth: BOARD_W, maxWidth: BOARD_W, reserveRows: 2 });
  hud.position.set(0, BOARD_H + 12);
  stage.addChild(hud);

  const lines = new WinLines(reelSet);
  const presenter = new WinPresenter(reelSet, { stagger: 60, cycleGap: 350 });
  reelSet.events.on('spin:start', () => {
    presenter.abort();
    lines.clear();
  });

  // Payline mode: draw each line as the presenter reaches it.
  let drawLines = false;
  reelSet.events.on('win:group', (win) => {
    if (!drawLines) return;
    lines.clear();
    const g = lines.line(win.cells, { color: [0xffc94a, 0x4ad8ff, 0xff5c8a, 0x8cff6b][win.id! % 4] });
    gsap.fromTo(g, { alpha: 0 }, { alpha: 1, duration: 0.15 });
  });

  // --- Win math, standing in for the server --------------------------------
  function lineWins(grid: string[][]) {
    const wins: { id: number; cells: SymbolPosition[]; value: number; kind: string; label: string }[] = [];
    PAYLINES.forEach((rows, id) => {
      const ids = rows.map((row, reel) => grid[reel][row]);
      const symbol = ids.find((s) => s !== 'wild') ?? 'wild';
      let n = 0;
      while (n < COLS && (ids[n] === symbol || ids[n] === 'wild')) n++;
      if (n >= 3) {
        const cells = rows.slice(0, n).map((cellIndex, reelIndex) => ({ reelIndex, cellIndex }));
        wins.push({ id, cells, value: n * 10, kind: 'line', label: `line ${id + 1}: ${symbol} x${n}` });
      }
    });
    return wins;
  }

  // A board with something to show: one symbol planted on two random lines.
  function plantedGrid() {
    const grid = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => pickWeighted(W)));
    const symbol = ['A', 'K', 'Q'][Math.floor(Math.random() * 3)];
    for (const rows of [PAYLINES[Math.floor(Math.random() * 5)], PAYLINES[5 + Math.floor(Math.random() * 5)]]) {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let reel = 0; reel < n; reel++) grid[reel][rows[reel]] = symbol;
    }
    return grid;
  }

  let spins = 0;
  async function onSpin() {
    const ways = spins++ % 2 === 1;
    const spin = reelSet.spin();
    await new Promise((r) => setTimeout(r, 150));
    reelSet.setResult(plantedGrid().map((visible) => ({ visible })));
    await spin;
    const grid = reelSet.getVisibleGrid();

    if (ways) {
      const wins = evaluateWays(grid, { wilds: ['wild'] });
      drawLines = false;
      wins.forEach((win) => lines.ways(win.perReel));
      hud.setRows([
        `ways: ${wins.length} winning symbol${wins.length === 1 ? '' : 's'}`,
        wins.map((w) => `${w.symbol} x${w.reels} = ${w.ways} ways`).join('   ') || 'no win',
      ]);
      await presenter.show(wins);
      return;
    }

    const wins = lineWins(grid);
    drawLines = true;
    hud.setRows([`paylines: ${wins.length} of 10 pay`, wins.map((w) => w.label).join('   ') || 'no win']);
    await presenter.show(wins);
  }

  app.stage.addChild(stage);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: onSpin,
  });
  return { reelSet, stage, cleanup: () => presenter.destroy() };
}
