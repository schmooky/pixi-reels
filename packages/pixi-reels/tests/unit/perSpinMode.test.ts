import type { Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

interface Harness {
  reelSet: ReturnType<ReelSetBuilder['build']>;
  ticker: FakeTicker;
  created: string[];
  destroy(): void;
}

function buildHarness(opts: { withCascade: boolean }): Harness {
  const ticker = new FakeTicker();
  const created: string[] = [];
  const builder = new ReelSetBuilder()
    .reels(1)
    .visibleSymbols(2)
    .symbolSize(100, 100)
    .ticker(ticker as unknown as Ticker)
    .symbols((r) => r.register('a', HeadlessSymbol, {}))
    .phases((factory) => {
      const original = factory.create.bind(factory);
      factory.create = ((name: string, reel, speed) => {
        const phase = original(name, reel, speed);
        created.push(`${name}:${phase.constructor.name}`);
        return phase;
      }) as typeof factory.create;
    });
  if (opts.withCascade) builder.tumble();
  const reelSet = builder.build();
  return {
    reelSet,
    ticker,
    created,
    destroy() {
      reelSet.destroy();
      ticker.destroy();
    },
  };
}

async function runSkippedSpin(h: Harness, mode?: 'standard' | 'cascade'): Promise<void> {
  const p = mode ? h.reelSet.spin({ mode }) : h.reelSet.spin();
  h.reelSet.setResult([['a', 'a']]);
  h.reelSet.slamStop();
  await p;
}

describe('ReelSet.spin — per-spin mode', () => {
  it('throws if cascade mode is requested without .tumble(...)', async () => {
    const h = buildHarness({ withCascade: false });
    await expect(h.reelSet.spin({ mode: 'cascade' })).rejects.toThrow(/tumble/);
    h.destroy();
  });

  it('switches phase chain per spin via opts.mode', async () => {
    const h = buildHarness({ withCascade: true });

    await runSkippedSpin(h, 'standard');
    expect(h.created).toContain('start:StartPhase');

    h.created.length = 0;
    await runSkippedSpin(h, 'cascade');
    expect(h.created).toContain('cascade:fall:CascadeFallPhase');

    h.destroy();
  });

  it('uses cascade as the default when .tumble(...) was called', async () => {
    const h = buildHarness({ withCascade: true });

    await runSkippedSpin(h);
    expect(h.created).toContain('cascade:fall:CascadeFallPhase');

    h.destroy();
  });
});
