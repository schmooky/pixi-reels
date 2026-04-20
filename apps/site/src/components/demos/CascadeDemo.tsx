/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { cascadingStages, cascadeSequence } from '../../../../../examples/shared/cheats.ts';
import { runCascade } from '../../../../../examples/shared/cascadeLoop.ts';

// Four visually distinct squares from the prototype atlas.
const R = 'square/square_1';
const G = 'square/square_2';
const B = 'square/square_3';
const Y = 'square/square_4';
const IDS = [R, G, B, Y];

/** Convert a row-major grid (grid[row][col]) to column-major (grid[col][row]). */
function toColumnMajor(rows: string[][]): string[][] {
  const cols = rows[0].length;
  const out: string[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: string[] = [];
    for (let r = 0; r < rows.length; r++) col.push(rows[r][c]);
    out.push(col);
  }
  return out;
}

// 4-stage scripted cascade — each stage progressively clears R clusters.
const STAGES: string[][][] = [
  toColumnMajor([
    [R, R, B, Y, R],
    [R, R, Y, G, B],
    [G, Y, R, B, Y],
    [Y, R, G, B, R],
    [B, G, Y, R, G],
  ]),
  toColumnMajor([
    [Y, B, B, Y, B],
    [G, Y, Y, G, B],
    [G, Y, B, B, Y],
    [Y, G, G, B, B],
    [B, G, Y, G, G],
  ]),
  toColumnMajor([
    [B, B, G, Y, B],
    [Y, G, Y, G, B],
    [G, Y, B, B, Y],
    [Y, B, G, B, B],
    [B, G, Y, G, G],
  ]),
  toColumnMajor([
    [G, Y, G, Y, B],
    [Y, G, Y, G, B],
    [G, Y, B, Y, Y],
    [Y, B, G, B, B],
    [B, G, Y, G, G],
  ]),
];

export default function CascadeDemo() {
  return (
    <DemoSandbox
      mechanic="cascade-multiplier"
      tags={['5×5', 'cascade', 'multiplier']}
      height={560}
      cheats={[
        {
          id: 'cascadingStages',
          label: 'One-click 4-stage cascade',
          description:
            'Single SPIN click plays the full 4-stage tumble — with vanish + refill between stages.',
          enabled: true,
          cheat: cascadingStages(STAGES),
        },
        {
          id: 'sequencePerClick',
          label: 'One stage per click (legacy)',
          description:
            'Each SPIN lands one stage — click four times to see the whole sequence.',
          enabled: false,
          cheat: cascadeSequence(STAGES),
        },
      ]}
      boot={(host, api, cheats) =>
        mountMechanic(host, api, {
          reelCount: 5,
          visibleRows: 5,
          symbolSize: { width: 96, height: 96 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: { [R]: 25, [G]: 25, [B]: 25, [Y]: 25 },
          cheats,
          cheatTitle: 'Cascade cheats',
          onLanded: async ({ grid, reelSet, meta, api, toast }) => {
            const stages = (meta.stages as string[][][] | undefined) ?? null;
            if (!stages || stages.length <= 1) {
              const reds = grid.flat().filter((s) => s === R).length;
              api.setStatus(`Landed · reds ${reds}`);
              return;
            }

            let multiplier = 1;
            api.setStatus(`Cascade 1/${stages.length} · ×${multiplier}`);

            await runCascade(reelSet, stages, {
              vanishDuration: 320,
              pauseBetween: 140,
              onStageLanded: async (landed, i) => {
                if (i === 0) return;
                multiplier++;
                const reds = landed.flat().filter((s) => s === R).length;
                toast(`Cascade × ${multiplier}`, 'win');
                api.setStatus(`Cascade ${i + 1}/${stages.length} · ×${multiplier} · reds ${reds}`);
              },
            });

            api.setStatus(`Cascade done · final ×${multiplier}`);
          },
        })
      }
    />
  );
}
