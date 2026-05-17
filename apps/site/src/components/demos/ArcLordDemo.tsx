/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { CARD_DECK } from '../../../../../examples/shared/CardSymbol.ts';

/**
 * Arc-lord demo — now built on the universal `mountMechanic` runtime so it
 * shares the cascade-multiplier demo's layout, button, and rapid-click
 * handling. 6×5 grid, card symbols (no spine / no audio for the embedded
 * demo — that lives in the standalone `examples/arc-lord/` page), tumble
 * pipeline via the latest `.tumble()` + `reelSet.refill()` API.
 */
export default function ArcLordDemo() {
  return (
    <DemoSandbox
      mechanic="arc-lord"
      tags={['6x5', 'tumble', 'cascade']}
      height={560}
      cheats={[]}
      boot={(host, api, cheats) =>
        mountMechanic(host, api, {
          reelCount: 6,
          visibleRows: 5,
          symbolSize: { width: 72, height: 72 },
          symbols: { kind: 'card' },
          weights: Object.fromEntries(CARD_DECK.map((c) => [c.id, 1])),
          cheats,
          cheatTitle: 'Arc Lord cheats',
          // Tumble defaults: power2.out drop-in (no overshoot) so symbols
          // land cleanly into their slot — matches what most commercial
          // cascade slots do before playing a per-symbol landing animation.
          tumble: true,
        })
      }
    />
  );
}
