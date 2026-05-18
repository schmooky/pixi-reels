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

// Minimal mock for `@esotericsoftware/spine-pixi-v8` — covers the
// surface the symbol class uses at runtime. Extends Container so the
// symbol's `view.addChild(spine)` accepts it without complaint.
interface MockTrackEntry {
  animation: { name: string };
}

interface MockListener {
  complete?: (entry: MockTrackEntry) => void;
}

class MockAnimationState {
  listeners: MockListener[] = [];
  current: MockTrackEntry | null = null;

  setAnimation(_track: number, name: string, _loop: boolean): MockTrackEntry {
    const entry: MockTrackEntry = { animation: { name } };
    this.current = entry;
    return entry;
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
    this.current = null;
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
  skeleton = {
    data: {
      findAnimation: (name: string) =>
        ['idle', 'win', 'landing', 'disintegration', 'blur'].includes(name)
          ? { name }
          : null,
    },
    setupPose: vi.fn(),
  };
}

vi.mock('@esotericsoftware/spine-pixi-v8', () => {
  let lastCreated: MockSpine | null = null;
  return {
    Spine: {
      from: () => {
        lastCreated = new MockSpine();
        return lastCreated;
      },
      __getLastCreated(): MockSpine | null {
        return lastCreated;
      },
    },
  };
});

// Import after the mock is registered.
import { SpineReelSymbol } from '../../src/spine/SpineReelSymbol.js';
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

    // playBlur replaces the track animation — the prior playWin promise
    // would otherwise dangle because the win entry never completes.
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves the prior playWin when a second one-shot starts back-to-back', async () => {
    const sym = makeSymbol();
    sym.activate('test');

    const first = sym.playWin();
    // Second call before the first completes — the prior promise must
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

    // Now fire the actual win entry's complete — promise settles.
    spine.state.fireComplete(winEntry!);
    await expect(p).resolves.toBeUndefined();
  });

  it('does not leak listeners across consecutive one-shots', async () => {
    const sym = makeSymbol();
    sym.activate('test');
    const spine = getLastSpine();

    const p1 = sym.playWin();
    expect(spine.state.listeners.length).toBe(1);

    // Start a new one — the prior listener should be removed.
    const p2 = sym.playOut();
    expect(spine.state.listeners.length).toBe(1);

    spine.state.fireComplete(spine.state.current!);
    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();

    // After the second one settles, the listener is detached too.
    expect(spine.state.listeners.length).toBe(0);
  });
});
