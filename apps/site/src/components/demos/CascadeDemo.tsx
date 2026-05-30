/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { CARD_DECK } from '../../../../../examples/shared/CardSymbol.ts';

/**
 * Cascade-multiplier demo. 5×5 grid, card symbols, tumble pipeline. The
 * cascade loop lives inside `mountMechanic` (3-in-a-row left-anchored win
 * detection, gravity refill via the latest `reelSet.refill()` API). no
 * scripted-stage cheats, no shared `runCascade` helper, no custom phases.
 */
export default function CascadeDemo() {
  return (
    <DemoSandbox
      mechanic="cascade-multiplier"
      tags={['5×5', 'cascade', 'multiplier']}
      height={520}
      cheats={[]}
      boot={(host, api, cheats) =>
        mountMechanic(host, api, {
          reelCount: 5,
          visibleRows: 5,
          symbolSize: { width: 80, height: 80 },
          symbols: { kind: 'card' },
          weights: Object.fromEntries(CARD_DECK.map((c) => [c.id, 1])),
          cheats,
          cheatTitle: 'Cascade cheats',
          tumble: true,
          // Mock 2-6 s server response. the "Moment A" gap between
          // fall-out and refill where the spinner sits. demoRuntime's
          // 200 ms debounce hides the spinner for sub-debounce waits, so
          // the floor here is comfortably above it.
          fakeServerDelay: () => 2000 + Math.random() * 4000,
        })
      }
    />
  );
}
