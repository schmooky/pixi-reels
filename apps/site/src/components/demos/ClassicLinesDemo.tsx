/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { forceLine, forceGrid, forceScatters } from '../../../../../examples/shared/cheats.ts';

// prototype-symbols atlas frame names.
const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3', 'round/round_4',
  'royal/royal_1',        // the "premium line" symbol (was 'seven')
  'wild/wild_1',          // the wild
  'bonus/bonus_1',        // the scatter (was 'bell')
];
const PREMIUM = 'royal/royal_1';
const WILD = 'wild/wild_1';
const SCATTER = 'bonus/bonus_1';

const JACKPOT_GRID: string[][] = Array.from({ length: 5 }, () => [PREMIUM, PREMIUM, PREMIUM]);

export default function ClassicLinesDemo() {
  return (
    <DemoSandbox
      mechanic="classic-lines"
      tags={['5×3', 'lines', 'spotlight']}
      height={500}
      cheats={[
        { id: 'line-mid', label: 'Force middle-row line', description: 'Full row of royals on row 2.', enabled: false, cheat: forceLine(1, PREMIUM) },
        { id: 'line-top', label: 'Force top-row line', description: 'Full row of wilds on row 1.', enabled: false, cheat: forceLine(0, WILD) },
        { id: 'jackpot', label: 'Full-grid royal jackpot', description: '15 royals. Pure theatre.', enabled: false, cheat: forceGrid(JACKPOT_GRID) },
        { id: 'scatter5', label: 'Sprinkle 5 bonuses', description: '5 scatters, random positions.', enabled: false, cheat: forceScatters(5, SCATTER) },
      ]}
      boot={(host, api, cheats) =>
        mountMechanic(host, api, {
          reelCount: 5,
          visibleRows: 3,
          symbolSize: { width: 110, height: 110 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: {
            'round/round_1': 40,
            'round/round_2': 38,
            'round/round_3': 32,
            'round/round_4': 28,
            [PREMIUM]: 10,
            [SCATTER]: 4,
            [WILD]: 3,
          },
          cheats,
          cheatTitle: 'Line-pays cheats',
          onLanded: async ({ grid, reelSet, toast }) => {
            const wins: { row: number; count: number; symbolId: string }[] = [];
            for (let row = 0; row < grid[0].length; row++) {
              const base = grid[0][row];
              const sym = base === WILD ? findFirstNonWild(grid, row) ?? base : base;
              let streak = 1;
              for (let r = 1; r < grid.length; r++) {
                const s = grid[r][row];
                if (s === sym || s === WILD) streak++;
                else break;
              }
              if (streak >= 3) wins.push({ row, count: streak, symbolId: sym });
            }
            if (wins.length === 0) return;
            toast(`${wins.length} line${wins.length > 1 ? 's' : ''}! ×${wins.reduce((a, w) => a + w.count, 0)}`, 'win');
            for (const w of wins) {
              for (let r = 0; r < w.count; r++) {
                reelSet.getReel(r).getSymbolAt(w.row).playWin();
              }
            }
            await new Promise((r) => setTimeout(r, 700));
          },
        })
      }
    />
  );
}

function findFirstNonWild(grid: string[][], row: number): string | null {
  for (const col of grid) if (col[row] !== WILD) return col[row];
  return null;
}
