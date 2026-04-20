/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { forceAnticipation, forceNearMiss, forceScatters } from '../../../../../examples/shared/cheats.ts';

const IDS = ['round/round_1', 'round/round_2', 'round/round_3', 'bonus/bonus_1'];
const SCATTER = 'bonus/bonus_1';

export default function AnticipationDemo() {
  return (
    <DemoSandbox
      mechanic="anticipation-slam"
      tags={['5×3', 'anticipation', 'skip']}
      height={500}
      cheats={[
        { id: 'force45', label: 'Force anticipation on reels 4+5', description: 'Slow-hold the last two reels for tension.', enabled: true, cheat: forceAnticipation([3, 4]) },
        { id: 'near-miss', label: 'Near-miss: 2 scatters, reel 5 blanks', description: '2 scatters + anticipation on reel 5. That won\'t.', enabled: false, cheat: forceNearMiss(3, SCATTER, 4) },
        { id: 'force3sc', label: 'Force 3 scatters (full trigger)', description: 'Pays the anticipation off with a real trigger.', enabled: false, cheat: forceScatters(3, SCATTER) },
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
            [SCATTER]: 5,
          },
          cheats,
          cheatTitle: 'Anticipation cheats',
          onLanded: async ({ grid, toast, api }) => {
            const scatters = grid.flat().filter((s) => s === SCATTER).length;
            if (scatters >= 3) toast(`${scatters} scatters — triggered`, 'win');
            else if (scatters === 2) toast('Near-miss', 'warn');
            api.setStatus(`Scatters: ${scatters}. Try Skip button mid-spin to slam-stop.`);
          },
        })
      }
    />
  );
}
