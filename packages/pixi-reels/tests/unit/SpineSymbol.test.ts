/**
 * `SpineSymbol` and the listeners on its skeleton's animation state.
 *
 * The symbol used to listen for its win on the state, then call
 * `state.clearListeners()` when the win completed, on `stopAnimation()` and on
 * every recycle. That dropped every listener the game (or a subclass) had put
 * on the state, and doing it inside spine's dispatch, which walks the listener
 * list live, made the listeners after the symbol's miss the event. It also
 * never heard an `interrupt`, so a win whose track was taken never settled.
 *
 * The mock dispatches the way spine-core's `EventQueue.drain` does: the track
 * entry's own listener first, then the state's listeners, by index over the
 * live array.
 */
import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';

interface MockEntry {
  animation: { name: string };
  listener?: MockListener | null;
}

interface MockListener {
  complete?: (entry: MockEntry) => void;
  interrupt?: (entry: MockEntry) => void;
  end?: (entry: MockEntry) => void;
}

class MockAnimationState {
  listeners: MockListener[] = [];
  tracks = new Map<number, MockEntry>();

  private _dispatch(type: 'complete' | 'interrupt' | 'end', entry: MockEntry): void {
    entry.listener?.[type]?.(entry);
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i][type]?.(entry);
  }

  setAnimation(track: number, name: string, _loop: boolean): MockEntry {
    const previous = this.tracks.get(track);
    const entry: MockEntry = { animation: { name } };
    this.tracks.set(track, entry);
    if (previous) this._dispatch('interrupt', previous);
    return entry;
  }

  getCurrent(track: number): MockEntry | null {
    return this.tracks.get(track) ?? null;
  }

  addListener(listener: MockListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: MockListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) this.listeners.splice(index, 1);
  }

  clearListeners(): void {
    // In place, like spine-core: the array a dispatch may be walking.
    this.listeners.length = 0;
  }

  clearTracks(): void {
    const ended = [...this.tracks.values()];
    this.tracks.clear();
    for (const entry of ended) this._dispatch('end', entry);
  }

  /** Test helper: the engine finishing an entry. */
  fireComplete(entry: MockEntry): void {
    this._dispatch('complete', entry);
  }
}

class MockSpine extends Container {
  state = new MockAnimationState();
  skeleton = {
    data: {
      findAnimation: (name: string) => (['idle', 'win', 'walk'].includes(name) ? { name } : null),
      findSkin: () => null,
    },
    setSkinByName: vi.fn(),
    setSlotsToSetupPose: vi.fn(),
  };
}

vi.mock('@esotericsoftware/spine-pixi-v8', () => ({ Spine: MockSpine }));

// Import after the mock is registered.
import { SpineSymbol, whenSpineReady } from '../../src/symbols/SpineSymbol.js';

async function makeSymbol(): Promise<{ symbol: SpineSymbol; spine: MockSpine }> {
  await whenSpineReady();
  const symbol = new SpineSymbol({ skeletonDataMap: { coin: {} } });
  symbol.activate('coin');
  return { symbol, spine: symbol.view.children[0] as MockSpine };
}

/** Whether `promise` has settled, after the microtasks queued so far. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await new Promise((r) => setTimeout(r, 0));
  return done;
}

describe('SpineSymbol and the listeners on its animation state', () => {
  it("leaves a game's own listener on the state, and in the dispatch, through a whole win", async () => {
    const { symbol, spine } = await makeSymbol();
    const win = symbol.playWin();
    const winEntry = spine.state.getCurrent(0)!;
    // Added after the win started: it sits after anything the symbol puts on the state.
    const seen: string[] = [];
    const game: MockListener = { complete: (e) => seen.push(`complete:${e.animation.name}`) };
    spine.state.addListener(game);

    spine.state.fireComplete(winEntry);
    await win;
    expect(seen).toEqual(['complete:win']);
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');

    symbol.stopAnimation();
    symbol.deactivate();
    expect(spine.state.listeners).toEqual([game]);
    symbol.destroy();
  });

  it('settles a win whose track something else takes', async () => {
    const { symbol, spine } = await makeSymbol();
    const win = symbol.playWin();
    // A subclass swapping the animation, as the pins guide's WalkingSpineSymbol does.
    spine.state.setAnimation(0, 'walk', true);
    expect(await settled(win)).toBe(true);
    // The walk is the subclass's: the settled win does not put idle back over it.
    expect(spine.state.getCurrent(0)?.animation.name).toBe('walk');
    symbol.destroy();
  });

  it('a second playWin settles the first, and completes on its own entry', async () => {
    const { symbol, spine } = await makeSymbol();
    const first = symbol.playWin();
    const second = symbol.playWin();
    expect(await settled(first)).toBe(true);
    expect(await settled(second)).toBe(false);

    spine.state.fireComplete(spine.state.getCurrent(0)!);
    expect(await settled(second)).toBe(true);
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');
    symbol.destroy();
  });

  it('stopAnimation and a recycle settle a pending win and put idle back', async () => {
    const { symbol, spine } = await makeSymbol();
    const stopped = symbol.playWin();
    symbol.stopAnimation();
    expect(await settled(stopped)).toBe(true);
    expect(spine.state.getCurrent(0)?.animation.name).toBe('idle');

    const recycled = symbol.playWin();
    symbol.deactivate();
    expect(await settled(recycled)).toBe(true);
    symbol.destroy();
  });
});
