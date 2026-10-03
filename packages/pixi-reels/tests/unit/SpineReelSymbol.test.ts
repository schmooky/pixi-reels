/**
 * Unit tests for `SpineReelSymbol` promise-settle guarantees.
 *
 * The class exposes one-shot animations (`playWin`, `playLanding`,
 * `playOut`) as promises. Without the leak fixes, several scenarios
 * leave the returned promise dangling forever:
 *   1. The symbol is recycled (deactivated) mid-animation.
 *   2. A second one-shot starts before the first completes.
 *   3. `playBlur` or `stopAnimation` hijacks the track mid-animation.
 *
 * Tests use a minimal hand-rolled Spine mock so they don't need a real
 * skeleton/atlas pair on disk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'pixi.js';

// Minimal mock for `@esotericsoftware/spine-pixi-v8` - covers the
// surface the symbol class uses at runtime. Extends Container so the
// symbol's `view.addChild(spine)` accepts it without complaint.
interface MockTrackEntry {
  animation: { name: string };
  track?: number;
}

interface MockListener {
  complete?: (entry: MockTrackEntry) => void;
  interrupt?: (entry: MockTrackEntry) => void;
  end?: (entry: MockTrackEntry) => void;
}

/**
 * Per-track like the real AnimationState: setting a track replaces its entry
 * and fires `interrupt` for the one it replaced; clearing fires `end`.
 */
class MockAnimationState {
  listeners: MockListener[] = [];
  /** The entry set last, on any track. */
  current: MockTrackEntry | null = null;
  tracks = new Map<number, MockTrackEntry>();
  data = { defaultMix: 0.2 };
  emptied: Array<{ track: number; mix: number }> = [];

  private _replace(track: number, entry: MockTrackEntry | null): void {
    const previous = this.tracks.get(track);
    if (entry) this.tracks.set(track, entry);
    else this.tracks.delete(track);
    if (previous) for (const l of [...this.listeners]) l.interrupt?.(previous);
  }

  setAnimation(track: number, name: string, _loop: boolean): MockTrackEntry {
    const entry: MockTrackEntry = { animation: { name }, track };
    this._replace(track, entry);
    this.current = entry;
    return entry;
  }

  setEmptyAnimation(track: number, mix: number): MockTrackEntry {
    this.emptied.push({ track, mix });
    const entry: MockTrackEntry = { animation: { name: '<empty>' }, track };
    this._replace(track, entry);
    return entry;
  }

  getCurrent(track: number): MockTrackEntry | null {
    return this.tracks.get(track) ?? null;
  }

  addListener(listener: MockListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: MockListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  clearListeners(): void {
    this.listeners = [];
  }

  clearTracks(): void {
    const ended = [...this.tracks.values()];
    this.tracks.clear();
    this.current = null;
    for (const entry of ended) for (const l of [...this.listeners]) l.end?.(entry);
  }

  /** Test helper: simulate the spine engine completing an entry. */
  fireComplete(entry: MockTrackEntry): void {
    for (const l of [...this.listeners]) {
      l.complete?.(entry);
    }
  }
}

class MockSpine extends Container {
  state = new MockAnimationState();
  update = vi.fn();
  skeleton = {
    data: {
      findAnimation: (name: string) =>
        ['idle', 'win', 'landing', 'disintegration', 'blur', 'spin', 'react_u', 'glow'].includes(name)
          ? { name }
          : null,
    },
    setToSetupPose: vi.fn(),
    setSkinByName: vi.fn(),
    setSlotsToSetupPose: vi.fn(),
  };
}

vi.mock('@esotericsoftware/spine-pixi-v8', () => {
  let lastCreated: MockSpine | null = null;
  const created: MockSpine[] = [];
  return {
    Spine: {
      from: () => {
        lastCreated = new MockSpine();
        created.push(lastCreated);
        return lastCreated;
      },
      __getLastCreated(): MockSpine | null {
        return lastCreated;
      },
      __getCreated(): MockSpine[] {
        return created;
      },
    },
  };
});

// Import after the mock is registered.
import { SpineReelSymbol } from '../../src/spine/SpineReelSymbol.js';
import type { SpineReelSymbolOptions } from '../../src/spine/SpineReelSymbol.js';
import { Spine as MockSpineModule } from '@esotericsoftware/spine-pixi-v8';

function getLastSpine(): MockSpine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const last = (MockSpineModule as any).__getLastCreated() as MockSpine | null;
  if (!last) throw new Error('No mock spine has been created yet');
  return last;
}

function makeSymbol(): SpineReelSymbol {
  return new SpineReelSymbol({
    spineMap: { test: { skeleton: 'foo', atlas: 'bar' } },
  });
}

describe('SpineReelSymbol one-shot promise settle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves playWin when the win entry completes', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const p = sym.playWin();
    expect(spine.state.current?.animation.name).toBe('win');

    spine.state.fireComplete(spine.state.current!);
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves a pending playWin promise when the symbol is deactivated', async () => {
    const sym = makeSymbol();
    sym.activate('test');

    const p = sym.playWin();
    sym.deactivate();

    // Without the fix this promise would never resolve.
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves a pending playWin promise when stopAnimation is called', async () => {
    const sym = makeSymbol();
    sym.activate('test');

    const p = sym.playWin();
    sym.stopAnimation();

    await expect(p).resolves.toBeUndefined();
  });

  it('resolves a pending playWin promise when playBlur hijacks the track', async () => {
    const sym = makeSymbol();
    sym.activate('test');

    const p = sym.playWin();
    sym.playBlur();

    // playBlur replaces the track animation - the prior playWin promise
    // would otherwise dangle because the win entry never completes.
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves the prior playWin when a second one-shot starts back-to-back', async () => {
    const sym = makeSymbol();
    sym.activate('test');

    const first = sym.playWin();
    // Second call before the first completes - the prior promise must
    // settle (its track was hijacked) rather than hang.
    const second = sym.playOut();

    await expect(first).resolves.toBeUndefined();

    // Complete the second one normally.
    const spine = getLastSpine();
    spine.state.fireComplete(spine.state.current!);
    await expect(second).resolves.toBeUndefined();
  });

  it('ignores completes from unrelated entries on the same track (track-entry guard)', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const p = sym.playWin();
    const winEntry = spine.state.current;

    // Some unrelated entry fires complete (e.g. a queued animation).
    spine.state.fireComplete({ animation: { name: 'unrelated' } });

    let settled = false;
    p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    // Fire the actual win entry's complete - promise settles.
    spine.state.fireComplete(winEntry!);
    await expect(p).resolves.toBeUndefined();
  });

  it('does not leak listeners across consecutive one-shots', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const p1 = sym.playWin();
    expect(spine.state.listeners.length).toBe(1);

    // Start a new one - the prior listener should be removed.
    const p2 = sym.playOut();
    expect(spine.state.listeners.length).toBe(1);

    spine.state.fireComplete(spine.state.current!);
    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();

    // After the second one settles, the listener is detached too.
    expect(spine.state.listeners.length).toBe(0);
  });
});

describe('SpineReelSymbol.playOneShot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays once on track 0, resolves on completion, then returns to idle', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const p = sym.playOneShot('react_u');
    const entry = spine.state.getCurrent(0)!;
    expect(entry.animation.name).toBe('react_u');
    spine.state.fireComplete(entry);
    await expect(p).resolves.toBeUndefined();
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');
    expect(spine.state.listeners).toHaveLength(0);
  });

  it("then: 'hold' leaves the last frame; then: 'clear' empties the track", async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const held = sym.playOneShot('react_u', { then: 'hold' });
    spine.state.fireComplete(spine.state.getCurrent(0)!);
    await held;
    expect(spine.state.getCurrent(0)?.animation.name).toBe('react_u');

    const cleared = sym.playOneShot('react_u', { then: 'clear' });
    spine.state.fireComplete(spine.state.getCurrent(0)!);
    await cleared;
    expect(spine.state.getCurrent(0)?.animation.name).toBe('<empty>');
    // Mixed out over the state's default mix, not snapped.
    expect(spine.state.emptied).toEqual([{ track: 0, mix: 0.2 }]);
  });

  it('defaults to clearing an overlay track, where idle does not live', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const p = sym.playOneShot('glow', { track: 1 });
    spine.state.fireComplete(spine.state.getCurrent(1)!);
    await p;
    expect(spine.state.getCurrent(1)?.animation.name).toBe('<empty>');
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');
  });

  it('one-shots on different tracks run side by side and resolve on their own', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const win = sym.playWin();
    const glow = sym.playOneShot('glow', { track: 1 });
    let winDone = false;
    void win.then(() => {
      winDone = true;
    });

    spine.state.fireComplete(spine.state.getCurrent(1)!);
    await glow;
    await Promise.resolve();
    // The overlay finishing must not settle (or cut short) the win on track 0.
    expect(winDone).toBe(false);
    expect(spine.state.getCurrent(0)?.animation.name).toBe('win');

    spine.state.fireComplete(spine.state.getCurrent(0)!);
    await win;
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');
  });

  it('resolves early when something else takes its track', async () => {
    const sym = makeSymbol();
    sym.activate('test');

    const p = sym.playOneShot('react_u');
    // A raw setAnimation on the same track (game code, playOnTrack).
    sym.playOnTrack(0, 'spin', true);
    await expect(p).resolves.toBeUndefined();
    expect(getLastSpine().state.listeners).toHaveLength(0);
  });

  it('stopAnimation settles every track and clears overlays', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const win = sym.playWin();
    const glow = sym.playOneShot('glow', { track: 1 });
    sym.stopAnimation();
    await expect(Promise.all([win, glow])).resolves.toEqual([undefined, undefined]);
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');
    expect(spine.state.getCurrent(1)?.animation.name).toBe('<empty>');
    expect(spine.state.listeners).toHaveLength(0);
  });

  it('resolves at once, playing nothing, for an animation the skeleton lacks', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();
    await expect(sym.playOneShot('nope')).resolves.toBeUndefined();
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');
  });

  it('settles every track when the symbol is recycled', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const a = sym.playOneShot('react_u');
    const b = sym.playOneShot('glow', { track: 2 });
    sym.deactivate();
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined]);
  });
});

describe('SpineReelSymbol multi-skin skeletons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getCreated(): MockSpine[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (MockSpineModule as any).__getCreated() as MockSpine[];
  }

  it('applies the configured skin when the instance is created', () => {
    const sym = new SpineReelSymbol({
      spineMap: { low2: { skeleton: 'lowSymbols', atlas: 'symbols', skin: 'low2' } },
    });
    sym.activate('low2');
    const spine = getLastSpine();
    expect(spine.skeleton.setSkinByName).toHaveBeenCalledWith('low2');
    expect(spine.skeleton.setSlotsToSetupPose).toHaveBeenCalled();
  });

  it('creates one instance per symbolId even when ids share a skeleton', () => {
    // The mock's created-list is module-global, so count relative to here.
    const baseline = getCreated().length;
    const sym = new SpineReelSymbol({
      spineMap: {
        low1: { skeleton: 'lowSymbols', atlas: 'symbols', skin: 'low1' },
        low2: { skeleton: 'lowSymbols', atlas: 'symbols', skin: 'low2' },
      },
    });
    sym.activate('low1');
    const first = getLastSpine();
    sym.deactivate();
    sym.activate('low2');
    const second = getLastSpine();

    expect(second).not.toBe(first);
    expect(getCreated().length - baseline).toBe(2);
    expect(first.skeleton.setSkinByName).toHaveBeenCalledWith('low1');
    expect(second.skeleton.setSkinByName).toHaveBeenCalledWith('low2');

    // Re-activating a seen id reuses its posed instance.
    sym.deactivate();
    sym.activate('low1');
    expect(getCreated().length - baseline).toBe(2);
    expect(first.visible).toBe(true);
  });

  it('takes a parked instance off the ticker and resumes it when shown again', () => {
    const sym = new SpineReelSymbol({
      spineMap: {
        low1: { skeleton: 'lowSymbols', atlas: 'symbols' },
        low2: { skeleton: 'lowSymbols', atlas: 'symbols' },
      },
    });
    sym.activate('low1');
    const first = getLastSpine() as MockSpine & { autoUpdate?: boolean };
    expect(first.autoUpdate).toBe(true);

    sym.deactivate();
    expect(first.autoUpdate).toBe(false);
    expect(first.visible).toBe(false);

    sym.activate('low2');
    const second = getLastSpine() as MockSpine & { autoUpdate?: boolean };
    expect(second.autoUpdate).toBe(true);
    expect(first.autoUpdate).toBe(false);

    // swapping ids in place parks the old one and wakes the cached one
    sym.activate('low1');
    expect(first.autoUpdate).toBe(true);
    expect(second.autoUpdate).toBe(false);
    expect(second.visible).toBe(false);
  });

  it('does not touch skins when the entry has none', () => {
    const sym = new SpineReelSymbol({
      spineMap: { high: { skeleton: 'high', atlas: 'symbols' } },
    });
    sym.activate('high');
    const spine = getLastSpine();
    expect(spine.skeleton.setSkinByName).not.toHaveBeenCalled();
  });
});

describe('SpineReelSymbol autoPlayLanding', () => {
  const ctx = (reelIndex: number) => ({ reelIndex, reelCount: 5, cell: 1, visibleCells: 3, symbolId: 'test' });

  function make(autoPlayLanding: SpineReelSymbolOptions['autoPlayLanding']): SpineReelSymbol {
    const sym = new SpineReelSymbol({
      spineMap: { test: { skeleton: 'foo', atlas: 'bar' } },
      autoPlayLanding,
    });
    sym.activate('test');
    return sym;
  }

  it('plays the landing on the reels the rule says yes to, and nothing elsewhere', () => {
    const sym = make((c) => c.reelIndex !== 2);
    const spine = getLastSpine();
    sym.onReelLanded(ctx(2));
    expect(spine.state.current?.animation.name).not.toBe('landing');
    expect(sym.landing).toBeNull();
    sym.onReelLanded(ctx(0));
    expect(spine.state.current?.animation.name).toBe('landing');
    expect(sym.landing).toBeInstanceOf(Promise);
  });

  it('plays a named animation as the landing beat when the rule returns a string', async () => {
    const sym = make((c) => (c.reelIndex === 4 ? 'spin' : true));
    const spine = getLastSpine();
    sym.onReelLanded(ctx(4));
    expect(spine.state.current?.animation.name).toBe('spin');
    const beat = sym.landing!;
    spine.state.fireComplete(spine.state.current!);
    await expect(beat).resolves.toBeUndefined();
    // One-shot semantics: back to idle once the named beat completes.
    expect(spine.state.current?.animation.name).toBe('idle');
  });

  it('treats a rule as unconditional when called without a context', () => {
    const sym = make(() => false);
    const spine = getLastSpine();
    sym.onReelLanded();
    expect(spine.state.current?.animation.name).toBe('landing');
  });

  it('keeps the boolean forms', () => {
    const off = make(false);
    const offSpine = getLastSpine();
    off.onReelLanded(ctx(0));
    expect(offSpine.state.current?.animation.name).not.toBe('landing');
    const on = make(true);
    const onSpine = getLastSpine();
    on.onReelLanded(ctx(0));
    expect(onSpine.state.current?.animation.name).toBe('landing');
    expect(on.landing).toBeInstanceOf(Promise);
  });

  it('reports an explicit playLanding() through `landing` too', () => {
    const sym = make(false);
    void sym.playLanding();
    expect(sym.landing).toBeInstanceOf(Promise);
  });
});
