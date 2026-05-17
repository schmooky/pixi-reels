import { describe, expect, it } from 'vitest';
import { createTestReelSet, SpeedPresets } from '../../src/index.js';
import type { ReelSet } from '../../src/index.js';
import type { SpeedProfile } from '../../src/config/types.js';

/**
 * The default test builder only registers `normal`. Two-stage skip needs a
 * faster profile to boost into — register the standard three.
 */
function registerAllSpeeds(reelSet: ReelSet): void {
  reelSet.speed.addProfile('turbo', SpeedPresets.TURBO);
  reelSet.speed.addProfile('superTurbo', SpeedPresets.SUPER_TURBO);
}

describe('ReelSet.skip — round-aware slam + boost', () => {
  it('first press slams the current spin AND boosts speed for the rest of the round', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 3, symbolIds: ['a', 'b'] });
    registerAllSpeeds(h.reelSet);
    const boosted: Array<{ previous: SpeedProfile; current: SpeedProfile }> = [];
    h.reelSet.events.on('skip:boosted', (info) => boosted.push(info));

    expect(h.reelSet.skipStage).toBe(0);
    expect(h.reelSet.speed.activeName).toBe('normal');

    const grid = [
      ['a', 'b', 'a'],
      ['b', 'a', 'b'],
      ['a', 'a', 'a'],
    ];
    const promise = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.skip();

    expect(h.reelSet.skipStage).toBe(2);
    expect(h.reelSet.speed.activeName).toBe('superTurbo');
    expect(boosted).toHaveLength(1);
    expect(boosted[0].previous.name).toBe('normal');
    expect(boosted[0].current.name).toBe('superTurbo');
    await promise;
    expect(h.reelSet.isSpinning).toBe(false);

    h.destroy();
  });

  it('subsequent presses in the same round also slam (no duplicate boost)', async () => {
    const h = createTestReelSet({ reels: 3, visibleRows: 2, symbolIds: ['a', 'b'] });
    registerAllSpeeds(h.reelSet);
    const boosted: unknown[] = [];
    h.reelSet.events.on('skip:boosted', (info) => boosted.push(info));
    const grid = [
      ['a', 'b'],
      ['b', 'a'],
      ['a', 'a'],
    ];

    const promise = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.skip();
    h.reelSet.skip();
    h.reelSet.skip();
    expect(h.reelSet.skipStage).toBe(2);
    expect(boosted).toHaveLength(1);
    await promise;

    h.destroy();
  });

  it('restores the previous speed profile on the next spin', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    registerAllSpeeds(h.reelSet);
    const grid = [['a', 'a'], ['a', 'a']];

    expect(h.reelSet.speed.activeName).toBe('normal');

    const first = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.skip();
    await first;

    // Round ended on slam; speed is still boosted until the NEXT spin.
    expect(h.reelSet.speed.activeName).toBe('superTurbo');

    // Next spin restores the original profile and resets the stage.
    const second = h.reelSet.spin();
    expect(h.reelSet.skipStage).toBe(0);
    expect(h.reelSet.speed.activeName).toBe('normal');
    h.reelSet.setResult(grid);
    h.reelSet.slamStop();
    await second;

    h.destroy();
  });

  it('falls through to slam on first press when already on the fastest profile', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    registerAllSpeeds(h.reelSet);
    h.reelSet.setSpeed('superTurbo');
    const grid = [['a', 'a'], ['a', 'a']];

    const boosted: unknown[] = [];
    h.reelSet.events.on('skip:boosted', (info) => boosted.push(info));

    const promise = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.skip();
    expect(boosted).toHaveLength(0);
    expect(h.reelSet.skipStage).toBe(2);
    await promise;

    h.destroy();
  });

  it('falls through to slam on first press when only one speed profile is registered', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    // Default test builder registers only 'normal' — no boost target available.
    const grid = [['a', 'a'], ['a', 'a']];
    const boosted: unknown[] = [];
    h.reelSet.events.on('skip:boosted', (info) => boosted.push(info));

    const promise = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.skip();
    expect(boosted).toHaveLength(0);
    expect(h.reelSet.skipStage).toBe(2);
    await promise;

    h.destroy();
  });

  it('slamStop() bypasses the boost and lands on a single call', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    registerAllSpeeds(h.reelSet);
    const grid = [['a', 'a'], ['a', 'a']];
    const boosted: unknown[] = [];
    h.reelSet.events.on('skip:boosted', (info) => boosted.push(info));

    const promise = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.slamStop();
    await promise;

    expect(boosted).toHaveLength(0);
    expect(h.reelSet.skipStage).toBe(2);
    expect(h.reelSet.speed.activeName).toBe('normal');
    h.destroy();
  });

  it('requestSkip() bypasses the boost when deferred until setResult', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    registerAllSpeeds(h.reelSet);
    const grid = [['a', 'a'], ['a', 'a']];
    const boosted: unknown[] = [];
    h.reelSet.events.on('skip:boosted', (info) => boosted.push(info));

    const promise = h.reelSet.spin();
    h.advance(20);
    h.reelSet.requestSkip();
    h.reelSet.setResult(grid);
    await promise;

    expect(boosted).toHaveLength(0);
    expect(h.reelSet.skipStage).toBe(2);
    h.destroy();
  });

  it('does not clobber a manual speed change between rounds', async () => {
    const h = createTestReelSet({ reels: 2, visibleRows: 2, symbolIds: ['a'] });
    registerAllSpeeds(h.reelSet);
    const grid = [['a', 'a'], ['a', 'a']];

    // Round 1: press skip, boost normal → superTurbo + slam.
    const first = h.reelSet.spin();
    h.reelSet.setResult(grid);
    h.reelSet.skip();
    await first;
    expect(h.reelSet.speed.activeName).toBe('superTurbo');

    // App manually changes speed between rounds — must survive restore.
    h.reelSet.setSpeed('turbo');
    expect(h.reelSet.speed.activeName).toBe('turbo');

    // Round 2: spin() must NOT clobber 'turbo' with the pre-boost 'normal'.
    const second = h.reelSet.spin();
    expect(h.reelSet.speed.activeName).toBe('turbo');
    h.reelSet.setResult(grid);
    h.reelSet.slamStop();
    await second;

    h.destroy();
  });
});
