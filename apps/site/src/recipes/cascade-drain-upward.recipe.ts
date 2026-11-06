import { CARD_DECK, ReelSetBuilder, SpeedPresets } from 'pixi-reels';
import { tapToSpin, StickerSymbol, createAssets, presentWithSpotlight } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'Drain upward (gravity follows travel)',
  topic: 'cascade',
  tags: ['cascade', 'tumble', 'refill', 'anticipation', 'spine', 'thunderkick', 'horizontal', 'reverse', 'orientation', 'gravity'],
  height: 300,
} as const satisfies RecipeMeta;

// A board that drains UPWARD, with no gravity config at all.
//
// The sibling recipe (`cascade-reverse-gravity`) makes travel and settling
// disagree on purpose. This one is the default case: `.direction('reverse')`
// and `tumble()` left at `gravity: 'auto'`, so gravity follows travel and
// every edge in the cascade flips together.
//
// Two things flip, and forgetting either one is what makes an upward board
// look broken:
//   - The STAGGER. `cellOrder` defaults to `'auto'`, which starts at the
//     gravity-EXIT end. Here that is the TOP cell: it falls first and lands
//     first, and the column peels upward behind it. (Pass 'endFirst' to pin
//     the bottom cell regardless of gravity.)
//   - The SERVER CONTRACT. Survivors pack against the edge gravity exits by,
//     so they go at the HEAD of the column and the new symbols fill in behind
//     them: `[...survivors, ...fresh]`. That is the mirror of the forward
//     case, and the engine never reorders what you send.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const { textures } = await createAssets().genericSymbols();
  const IDS = ['7', '8', '9', '10', 'J', 'Q'];
  const REELS = 5, CELLS = 4, SIZE = 68;
  const RUN = 3;
  const HIT_CELL = 1, HIT_ID = 'Q';

  const rand = () => IDS[Math.floor(Math.random() * IDS.length)];
  const randExcept = (id: string) => {
    let s;
    do { s = rand(); } while (s === id);
    return s;
  };

  // Any 3+ adjacent reels showing the same symbol on the same cell pays.
  function linesIn(grid: string[][]) {
    const winners = [];
    for (let cell = 0; cell < CELLS; cell++) {
      let start = 0;
      for (let reel = 1; reel <= REELS; reel++) {
        if (reel === REELS || grid[reel][cell] !== grid[start][cell]) {
          if (reel - start >= RUN) {
            for (let k = start; k < reel; k++) winners.push({ reel: k, cell });
          }
          start = reel;
        }
      }
    }
    return winners;
  }

  const reelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleCells(CELLS)
    .symbolSize(SIZE, SIZE)
    .symbolGap(4, 4)
    .direction('reverse') // roll-up, and gravity follows it
    .symbols((r) => {
      for (const sym of CARD_DECK) {
        if (IDS.includes(sym.id)) {
          r.register(sym.id, StickerSymbol, { textures });
        }
      }
    })
    .weights(Object.fromEntries(IDS.map((id) => [id, 1])))
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 110 })
    .tumble({
      fall:   { duration: 280, ease: 'power3.in', cellStagger: 60 },
      dropIn: { duration: 440, ease: 'power2.in', cellStagger: 60, distance: 'perHole' },
      // No `gravity` key: 'auto' follows the reel's own direction.
    })
    .ticker(app.ticker)
    .build();

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const grid = Array.from({ length: REELS }, () =>
        Array.from({ length: CELLS }, () => randExcept(HIT_ID)),
      );
      for (let reel = 0; reel < RUN; reel++) grid[reel][HIT_CELL] = HIT_ID;

      reelSet.setDropOrder('ltr');
      const spinDone = reelSet.spin();
      await new Promise((r) => setTimeout(r, 220));
      reelSet.setResult(grid.map((visible) => ({ visible })));
      await spinDone;
      await new Promise((r) => setTimeout(r, 300));

      reelSet.setDropOrder('all');
      await reelSet.runCascade({
        // The winners get their beat before they go: losers dim, winners wow, a short hold.
        presentWinners: presentWithSpotlight(reelSet),
        detectWinners: (g, chain) => (chain >= 3 ? [] : linesIn(g)),
        nextGrid: (prev, winners) => {
          const winsByReel = new Map();
          for (const w of winners) {
            const arr = winsByReel.get(w.reel) ?? [];
            arr.push(w.cell);
            winsByReel.set(w.reel, arr);
          }
          return prev.map((cells, reel) => {
            const wins = winsByReel.get(reel);
            if (!wins) return { visible: [...cells] };
            const survivors = cells.filter((_, cell) => !wins.includes(cell));
            const fresh = wins.map(() => rand());
            // gravity: 'auto' on a reverse reel -> survivors pack against the TOP.
            return { visible: [...survivors, ...fresh] };
          });
        },
        pauseAfterDestroyMs: 220,
      });
    },
  });
  return { reelSet };
}
