import { RenderTexture, type Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

// Constructing a real BlurFilter compiles a GL program, which needs a DOM
// canvas. tests run in plain node, so stub just that class.
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  return {
    ...actual,
    BlurFilter: class {
      constructor(_options?: unknown) {}
    },
  };
});
import { SpinTextureCache, type SnapshotRenderer } from '../../src/snapshot/SpinTextureCache.js';
import { StaticSpinSymbol } from '../../src/snapshot/StaticSpinSymbol.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

class RecordingInner extends HeadlessSymbol {
  public log: string[] = [];

  protected override onActivate(symbolId: string): void {
    this.log.push(`activate:${symbolId}`);
  }

  protected override onDeactivate(): void {
    this.log.push('deactivate');
  }

  override async playWin(): Promise<void> {
    this.log.push('win');
  }

  override onReelLanded(): void {
    this.log.push('landed');
  }
}

function makeCache() {
  const renderer: SnapshotRenderer = {
    generateTexture: vi.fn(
      (options: { frame?: { width: number; height: number } }): Texture =>
        RenderTexture.create({
          width: Math.max(1, options.frame?.width ?? 10),
          height: Math.max(1, options.frame?.height ?? 10),
        }),
    ),
  };
  return {
    cache: new SpinTextureCache({ renderer }),
    spy: renderer.generateTexture as ReturnType<typeof vi.fn>,
  };
}

function makeSymbol(cache: SpinTextureCache, rampMs = 0) {
  let inner: RecordingInner | null = null;
  const symbol = new StaticSpinSymbol({
    createInner: () => {
      inner = new RecordingInner();
      return inner;
    },
    cache,
    blurRampMs: rampMs,
  });
  symbol.activate('cherry');
  symbol.resize(100, 100);
  return { symbol, inner: inner! as RecordingInner };
}

describe('StaticSpinSymbol', () => {
  it('delegates to the live inner symbol at rest', async () => {
    const { cache } = makeCache();
    const { symbol, inner } = makeSymbol(cache);

    expect(inner.symbolId).toBe('cherry');
    expect(symbol.isShowingSnapshot).toBe(false);
    await symbol.playWin();
    symbol.onReelLanded();
    expect(inner.log).toContain('win');
    expect(inner.log).toContain('landed');

    symbol.destroy();
    cache.destroy();
  });

  it('swaps to the cached snapshot and deactivates the inner symbol on spin start', () => {
    const { cache, spy } = makeCache();
    const { symbol, inner } = makeSymbol(cache);

    symbol.onReelSpinStart();

    expect(symbol.isShowingSnapshot).toBe(true);
    expect(inner.symbolId).toBe(''); // deactivated — costs nothing while spinning
    expect(cache.hasStatic('cherry')).toBe(true);
    expect(cache.hasBlurred('cherry')).toBe(true);
    // static + blurred captures
    expect(spy).toHaveBeenCalledTimes(2);

    symbol.destroy();
    cache.destroy();
  });

  it('is idempotent: repeat spin-start notifications do not re-capture or restart', () => {
    const { cache, spy } = makeCache();
    const { symbol } = makeSymbol(cache);

    symbol.onReelSpinStart();
    const callsAfterFirst = spy.mock.calls.length;
    symbol.onReelSpinStart(true);
    symbol.onReelSpinStart(true);

    expect(spy.mock.calls.length).toBe(callsAfterFirst);
    symbol.destroy();
    cache.destroy();
  });

  it('mid-spin pool recycle shows the snapshot for the new id without inner work', () => {
    const { cache } = makeCache();
    const { symbol, inner } = makeSymbol(cache);

    // First spin bakes 'cherry'; reel wraps: engine deactivates, re-activates
    // with a new id, then notifies onReelSpinStart(true).
    symbol.onReelSpinStart();
    symbol.deactivate();
    symbol.activate('lemon');
    inner.log.length = 0;
    symbol.onReelSpinStart(true);

    expect(symbol.isShowingSnapshot).toBe(true);
    expect(cache.hasStatic('lemon')).toBe(true);
    // Inner was deactivated again right after the unavoidable pool
    // activation — it must not stay live during the spin.
    expect(inner.symbolId).toBe('');

    symbol.destroy();
    cache.destroy();
  });

  it('reactivates the inner symbol on the landed id at spin end', () => {
    const { cache } = makeCache();
    const { symbol, inner } = makeSymbol(cache);

    symbol.onReelSpinStart();
    expect(inner.symbolId).toBe('');

    symbol.onReelSpinEnd();
    expect(symbol.isShowingSnapshot).toBe(false);
    expect(inner.symbolId).toBe('cherry');
    expect(inner.width).toBe(100); // resized on reactivation

    symbol.onReelLanded();
    expect(inner.log).toContain('landed');

    symbol.destroy();
    cache.destroy();
  });

  it('spinTexture: "static" never touches the blur pipeline', () => {
    const { cache, spy } = makeCache();
    let inner: RecordingInner | null = null;
    const symbol = new StaticSpinSymbol({
      createInner: () => {
        inner = new RecordingInner();
        return inner!;
      },
      cache,
      spinTexture: 'static',
    });
    symbol.activate('cherry');
    symbol.resize(100, 100);

    symbol.onReelSpinStart();

    expect(cache.hasStatic('cherry')).toBe(true);
    expect(cache.hasBlurred('cherry')).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);

    symbol.destroy();
    cache.destroy();
  });

  it('destroys the inner symbol exactly once on destroy', () => {
    const { cache } = makeCache();
    const { symbol, inner } = makeSymbol(cache);

    symbol.destroy();
    expect(inner.isDestroyed).toBe(true);
    expect(symbol.isDestroyed).toBe(true);
    cache.destroy();
  });
});
