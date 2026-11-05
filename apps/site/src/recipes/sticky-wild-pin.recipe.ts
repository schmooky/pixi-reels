import { CARD_DECK, ReelSetBuilder, SpeedPresets, WILD_CARD } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Sticky wild (CellPin)',
  topic: 'wilds-and-pins',
  tags: ['wild', 'sticky', 'multiplier', 'mystery', 'respin', 'cell-pin', 'horizontal', 'reverse', 'orientation'],
  height: 300,
} as const satisfies RecipeMeta;

// Sticky wild. CellPin edition.
//
// Instead of manually tracking "stuck" positions in an array and re-injecting
// them into the grid before every setResult(), we call reelSet.pin() when
// a wild lands. The engine's pin map handles persistence; the wild stays put
// for the configured number of turns, then expires automatically.
//
// No ghost sprites. No external state. No grid re-injection.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  const FILLER = ['7', '8', '10', 'Q'];
  const WILD = WILD_CARD.id;
  const COLS = 5, ROWS = 3, SIZE = 90;
  const STICKY_TURNS = 3;

  const reelSet = new ReelSetBuilder()
    .reels(COLS)
    .visibleCells(ROWS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(4, 4)
    .symbols((r) => {
      for (const sym of [...CARD_DECK, WILD_CARD]) {
        r.register(sym.id, StickerSymbol, { textures });
      }
    })
    .weights({
      '7': 22,
      '8': 22,
      '10': 18,
      Q: 18,
    })
    .speed('normal', SpeedPresets.NORMAL)
    .speed('turbo', SpeedPresets.TURBO)
    .ticker(app.ticker)
    .build();

  // ── Pin wilds on land ────────────────────────────────────────────────────
  // When a wild lands on a cell that isn't already pinned, pin it for N turns.
  // The engine decrements turns after each spin:allLanded and fires pin:expired
  // when turns hits zero.
  reelSet.events.on('spin:allLanded', ({ symbols }) => {
    for (let c = 0; c < symbols.length; c++) {
      for (let r = 0; r < symbols[c].length; r++) {
        if (symbols[c][r] === WILD && !reelSet.getPin(c, r)) {
          reelSet.pin(c, r, WILD, { turns: STICKY_TURNS });
        }
      }
    }
  });

  // Scripted sequence: cycles through wild arrivals so the demo is predictable.
  const arrivals = [
    { reel: 1, cell: 1 },
    { reel: 3, cell: 0 },
    { reel: 2, cell: 2 },
  ];
  let spinCount = 0;

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    next: () => {
      const idx = spinCount % arrivals.length;
      const grid = Array.from({ length: COLS }, () =>
        Array.from({ length: ROWS }, () => FILLER[Math.floor(Math.random() * FILLER.length)]),
      );
      // Place a fresh wild each spin. the engine's pin overlay keeps prior
      // sticky wilds in place, so we only ever need to add the NEW one here.
      const next = arrivals[idx];
      grid[next.reel][next.cell] = WILD;
      spinCount++;
      return grid;
    },
  });
  return { reelSet };
}
