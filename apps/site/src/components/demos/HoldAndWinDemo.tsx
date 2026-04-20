/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { holdAndWinProgress } from '../../../../../examples/shared/cheats.ts';

const IDS = ['round/round_1', 'round/round_2', 'round/round_3', 'feature/feature_1'];
const COIN = 'feature/feature_1';

export default function HoldAndWinDemo() {
  // Module-scoped held state survives across spins in the same mount.
  const held: Array<{ reel: number; row: number; symbolId: string }> = [];
  let middleRowCoins = 0;

  return (
    <DemoSandbox
      mechanic="hold-and-win-respin"
      tags={['5×3', 'respin', 'hold-and-win']}
      height={500}
      cheats={[
        { id: 'guaranteed', label: 'Guaranteed coin each spin', description: 'Every spin lands at least one new coin. Jackpot in a few clicks.', enabled: true, cheat: holdAndWinProgress(COIN, 1) },
        { id: 'balanced', label: 'Realistic 50% progression', description: 'Half the spins land a coin, half don\'t.', enabled: false, cheat: holdAndWinProgress(COIN, 0.5) },
      ]}
      boot={(host, api, cheats) =>
        mountMechanic(host, api, {
          reelCount: 5,
          visibleRows: 3,
          symbolSize: { width: 110, height: 110 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: {
            'round/round_1': 40,
            'round/round_2': 40,
            'round/round_3': 40,
            [COIN]: 3,
          },
          cheats,
          cheatTitle: 'Hold & Win cheats',
          beforeSpin: (engine) => {
            engine.setHeld(held);
          },
          onLanded: async ({ grid, reelSet, toast, api }) => {
            // Any new coin on the grid joins held[]
            middleRowCoins = 0;
            for (let r = 0; r < grid.length; r++) {
              for (let row = 0; row < grid[r].length; row++) {
                if (grid[r][row] === COIN) {
                  if (row === 1) middleRowCoins++;
                  const exists = held.some((h) => h.reel === r && h.row === row);
                  if (!exists) {
                    held.push({ reel: r, row, symbolId: COIN });
                    reelSet.getReel(r).getSymbolAt(row).playWin();
                  }
                }
              }
            }
            const total = reelSet.reels.length * grid[0].length;
            if (held.length >= total) {
              toast('GRAND JACKPOT · grid filled', 'win');
              api.setStatus(`Full board (${held.length}/${total}) — grand jackpot`);
            } else if (middleRowCoins >= 3) {
              toast(`3 coins middle row · mini jackpot`, 'win');
              api.setStatus(`Middle row filled · ${held.length}/${total} held`);
            } else {
              api.setStatus(`Held: ${held.length}/${total} · middle row: ${middleRowCoins}/5`);
            }
          },
        })
      }
    />
  );
}
