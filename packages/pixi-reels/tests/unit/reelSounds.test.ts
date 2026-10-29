/**
 * attachReelSounds: the cue table over a reel set's events, through a port
 * that records every call. The anticipation and win beats are emitted by
 * hand: the headless harness slams, so no reel ever teases.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createTestReelSet, spinAndLand, FakeTicker, HeadlessSymbol } from '../../src/testing/index.js';
import { attachReelSounds, attachBoardSounds, zvukPort, HoldAndWinBuilder } from '../../src/index.js';
import type { ReelAudioPort, ReelSoundsHandle } from '../../src/index.js';

interface Call { kind: 'play' | 'loop' | 'stop'; name: string; opts: Record<string, unknown> }

function recordingPort(): { port: ReelAudioPort; calls: Call[] } {
  const calls: Call[] = [];
  const port: ReelAudioPort = {
    play(name, opts) { calls.push({ kind: 'play', name, opts: { ...opts } }); },
    loop(name, opts) {
      calls.push({ kind: 'loop', name, opts: { ...opts } });
      return { stop(s) { calls.push({ kind: 'stop', name, opts: { ...s } }); } };
    },
  };
  return { port, calls };
}

const grid = (n: number) => Array.from({ length: n }, () => ({ visible: ['a', 'b', 'c'] }));

describe('attachReelSounds', () => {
  it('loops the spin from spin:start to spin:allLanded and thuds every landing reel', async () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 3, cells: 3 });
    const { port, calls } = recordingPort();
    const handle = attachReelSounds(reelSet, port, {
      spin: { loop: 'spin-loop', fadeIn: 0.05, fadeOut: 0.08 },
      reelStop: { play: 'reel-stop', pitch: ({ reelIndex }) => 1 + reelIndex! * 0.1 },
    });

    await spinAndLand(reelSet, grid(3));

    expect(calls[0]).toEqual({ kind: 'loop', name: 'spin-loop', opts: { bus: undefined, volume: undefined, pitch: undefined, fadeIn: 0.05 } });
    const thuds = calls.filter((c) => c.kind === 'play');
    expect(thuds.map((c) => c.opts.pitch)).toEqual([1, 1.1, 1.2]);
    expect(calls.at(-1)).toEqual({ kind: 'stop', name: 'spin-loop', opts: { fade: 0.08 } });

    handle.destroy();
    destroy();
  });

  it('brackets a teasing reel with its own loop, pitch by order, and ends it on reelEnd', () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 5, cells: 3 });
    const { port, calls } = recordingPort();
    const handle = attachReelSounds(reelSet, port, {
      anticipation: { loop: 'tease', fadeOut: 0.25, pitch: ({ order }) => 1 + 0.08 * order! },
    });

    reelSet.events.emit('anticipation:reel', { reelIndex: 3, order: 0, total: 2 });
    reelSet.events.emit('anticipation:reel', { reelIndex: 4, order: 1, total: 2 });
    reelSet.events.emit('anticipation:reelEnd', { reelIndex: 3 });
    reelSet.events.emit('anticipation:reelEnd', { reelIndex: 4 });

    expect(calls.map((c) => [c.kind, c.opts.pitch ?? c.opts.fade])).toEqual([
      ['loop', 1], ['loop', 1.08], ['stop', 0.25], ['stop', 0.25],
    ]);
    handle.destroy();
    destroy();
  });

  it('fires skip, win and cascadeDestroy one-shots, with the speed and spin mode in the context', () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 3, cells: 3 });
    const { port, calls } = recordingPort();
    const modes: string[] = [];
    const handle = attachReelSounds(reelSet, port, {
      skip: { play: 'skip', volume: ({ speed }) => (speed === 'normal' ? 0.5 : 1) },
      win: { play: 'win', when: ({ mode }) => { modes.push(mode); return true; } },
      cascadeDestroy: { play: 'pop', when: ({ mode }) => mode === 'cascade' },
    });
    reelSet.events.emit('skip:requested', { reels: [0], partial: false, mode: 'slam' } as never);
    reelSet.events.emit('spotlight:start', []);
    // No cascade has run on this set, so the pop's `when` keeps it quiet.
    reelSet.events.emit('cascade:destroy:start', { cells: [] });
    expect(calls.map((c) => [c.name, c.opts.volume])).toEqual([['skip', 0.5], ['win', undefined]]);
    expect(modes).toEqual(['standard']);
    handle.destroy();
    destroy();
  });

  it('runs an `on` loop until its `until` event, and stops every loop on destroy', () => {
    const { reelSet, destroy } = createTestReelSet({ reels: 3, cells: 3 });
    const { port, calls } = recordingPort();
    const handle: ReelSoundsHandle = attachReelSounds(reelSet, port, {
      on: { 'nudge:start': { loop: 'rumble', until: 'nudge:complete' } },
      spin: { loop: 'spin-loop' },
    });
    reelSet.events.emit('nudge:start', {} as never);
    reelSet.events.emit('nudge:complete', {} as never);
    reelSet.events.emit('spin:start');
    handle.destroy();
    expect(calls.map((c) => `${c.kind}:${c.name}`)).toEqual([
      'loop:rumble', 'stop:rumble', 'loop:spin-loop', 'stop:spin-loop',
    ]);
    // Detached: a later beat plays nothing.
    reelSet.events.emit('spin:start');
    expect(calls).toHaveLength(4);
    destroy();
  });
});

describe('zvukPort', () => {
  function fakeEngine() {
    const log: Array<{ src: string; name: string; options: unknown; stopped?: unknown }> = [];
    const voice = () => ({ stop(o: unknown) { log.push({ src: 'voice', name: '', options: o }); } });
    return {
      log,
      hasSound: (n: string) => n === 'thud',
      hasVariants: (n: string) => n === 'stop',
      sound: (n: string) => ({ play(o: unknown) { log.push({ src: 'sound', name: n, options: o }); return voice(); } }),
      variants: (n: string) => ({ play(o: unknown) { log.push({ src: 'variants', name: n, options: o }); return voice(); } }),
    };
  }

  it('plays variants over sounds, loops with fadeIn, and warns once for an unknown name', () => {
    const engine = fakeEngine();
    const warnings: string[] = [];
    const port = zvukPort(engine, { warn: (m) => warnings.push(m) });

    port.play('stop', { pitch: { jitter: 0.04 } });
    port.play('thud', { volume: 0.5, bus: 'reels' });
    const loop = port.loop('thud', { fadeIn: 0.05 });
    loop.stop({ fade: 0.2 });
    loop.stop({ fade: 0.2 });
    port.play('missing', {});
    port.play('missing', {});
    expect(port.loop('missing', {})).toBeDefined();

    expect(engine.log).toEqual([
      { src: 'variants', name: 'stop', options: { pitch: { jitter: 0.04 } } },
      { src: 'sound', name: 'thud', options: { volume: 0.5, bus: 'reels' } },
      { src: 'sound', name: 'thud', options: { loop: true, fadeIn: 0.05 } },
      { src: 'voice', name: '', options: { fade: 0.2 } },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"missing"');
  });
});

describe('cue delay', () => {
  it('fires a delayed one-shot after its seconds and drops it on destroy', async () => {
    vi.useFakeTimers();
    const { reelSet, destroy } = createTestReelSet({ reels: 3, cells: 3 });
    const { port, calls } = recordingPort();
    const handle = attachReelSounds(reelSet, port, {
      reelStop: { play: 'thud', delay: ({ profile }) => profile!.bounceDuration / 2000 },
    });
    reelSet.events.emit('spin:reelLanding', 0, []);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(reelSet.speed.active.bounceDuration / 2 + 1);
    expect(calls.map((c) => c.name)).toEqual(['thud']);
    reelSet.events.emit('spin:reelLanding', 1, []);
    handle.destroy();
    vi.advanceTimersByTime(5000);
    expect(calls).toHaveLength(1);
    vi.useRealTimers();
    destroy();
  });
});

describe('attachBoardSounds', () => {
  it('maps the board beats with the cell and the hit in the context', () => {
    const ticker = new FakeTicker();
    const board = new HoldAndWinBuilder()
      .grid(2, 2)
      .cellSize({ width: 40, height: 30 })
      .symbols((r) => r.register('coin', HeadlessSymbol, {}))
      .weights({ coin: 1, empty: 1 })
      .ticker(ticker as unknown as Ticker)
      .build();
    const { port, calls } = recordingPort();
    const handle = attachBoardSounds(board, port, {
      respinStart: { loop: 'bed' },
      cellLanded: { play: 'thud', volume: ({ hit }) => (hit ? 0.7 : 0.4) },
      coinLocked: { play: 'lock', pitch: ({ cell }) => 1 + cell! * 0.1 },
      featureEnd: { play: 'win', when: ({ speed }) => speed === 'normal' },
    });
    const coin = { cell: { reel: 1, cell: 1 }, id: 'coin', data: undefined };
    board.events.emit('respin:start', { round: 1, respinsLeft: 3, spinning: [] });
    board.events.emit('cell:landed', { cell: { reel: 0, cell: 0 }, coin: null });
    board.events.emit('cell:landed', { cell: { reel: 1, cell: 1 }, coin });
    board.events.emit('coin:locked', { coin, locked: 1, capacity: 4 });
    board.events.emit('respin:end', { round: 1, hits: [coin], respinsLeft: 2 });
    board.events.emit('feature:end', { coins: [coin], rounds: 1, full: false });
    expect(calls.map((c) => [c.kind, c.name, c.opts.volume ?? c.opts.pitch ?? c.opts.fade])).toEqual([
      ['loop', 'bed', undefined],
      ['play', 'thud', 0.4],
      ['play', 'thud', 0.7],
      ['play', 'lock', 1.1],
      ['stop', 'bed', 0.1],
      ['play', 'win', undefined],
    ]);
    handle.destroy();
    board.destroy();
    ticker.destroy();
  });
});
