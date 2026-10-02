import { Container, Rectangle, RenderTexture, type Texture } from 'pixi.js';
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
import {
  SpinTextureCache,
  prewarmSpinTextures,
  type SnapshotRenderer,
} from '../../src/snapshot/SpinTextureCache.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

/** Renderer stub: returns a fresh real RenderTexture per call and records args. */
function makeRenderer() {
  const calls: { frame: Rectangle | undefined }[] = [];
  const renderer: SnapshotRenderer = {
    generateTexture: vi.fn((options: { frame?: Rectangle }): Texture => {
      calls.push({ frame: options.frame });
      const w = options.frame?.width ?? 10;
      const h = options.frame?.height ?? 10;
      return RenderTexture.create({ width: Math.max(1, w), height: Math.max(1, h) });
    }),
  };
  return { renderer, calls, spy: renderer.generateTexture as ReturnType<typeof vi.fn> };
}

describe('SpinTextureCache', () => {
  it('captureStatic generates once and returns the cached texture afterwards', () => {
    const { renderer, spy } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    const source = new Container();

    const a = cache.captureStatic('cherry', source, 100, 100);
    const b = cache.captureStatic('cherry', source, 100, 100);

    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
    cache.destroy();
  });

  it('captureStatic keeps one capture per cell size and never destroys a live one', () => {
    const { renderer, spy } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    const source = new Container();

    const a = cache.captureStatic('cherry', source, 100, 100);
    const b = cache.captureStatic('cherry', source, 150, 150);

    // MultiWays: both sizes are on screen at once, on different reels.
    expect(b).not.toBe(a);
    expect(a.destroyed).toBe(false);
    expect(cache.captureStatic('cherry', source, 100, 100)).toBe(a);
    expect(cache.getStatic('cherry', 150, 150)).toBe(b);
    expect(spy).toHaveBeenCalledTimes(2);

    cache.destroy();
    expect(a.destroyed).toBe(true);
    expect(b.destroyed).toBe(true);
  });

  it('a capture at a new size does not destroy the blurred texture another reel is drawing', () => {
    const { renderer, calls } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    const source = new Container();

    // Reel 0 lands 7 cells (short cells), reel 1 lands 2 (tall cells).
    cache.captureStatic('cherry', source, 92, 80);
    const short = cache.captureBlurred('cherry', 92, 80);
    cache.captureStatic('cherry', source, 92, 280);
    const tall = cache.captureBlurred('cherry', 92, 280);

    expect(tall).not.toBe(short);
    expect(short.destroyed).toBe(false);
    expect(cache.getBlurred('cherry', 92, 80)).toBe(short);
    // The tall blur is baked from the tall static, not a stretched short one.
    expect(calls[3].frame?.height).toBe(280 + 2 * Math.ceil(280 * 0.2));
    cache.destroy();
  });

  it('user-provided textures win over captures and are never destroyed', () => {
    const { renderer, spy } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    const provided = RenderTexture.create({ width: 8, height: 8 });

    cache.setStatic('cherry', provided);
    const got = cache.captureStatic('cherry', new Container(), 100, 100);

    expect(got).toBe(provided);
    expect(spy).not.toHaveBeenCalled();

    cache.invalidate('cherry');
    expect(provided.destroyed).toBe(false);
    expect(cache.hasStatic('cherry')).toBe(false);

    provided.destroy(true);
    cache.destroy();
  });

  it('captureBlurred fails loud when no static texture exists', () => {
    const { renderer } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    expect(() => cache.captureBlurred('cherry', 100, 100)).toThrow(/no static texture/);
    cache.destroy();
  });

  it('captureBlurred bakes a vertically padded texture (cell height + 2 * padding) and caches it', () => {
    const { renderer, calls, spy } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    cache.captureStatic('cherry', new Container(), 100, 100);

    const blurred = cache.captureBlurred('cherry', 100, 100, { strength: 24 });
    const again = cache.captureBlurred('cherry', 100, 100, { strength: 24 });

    expect(again).toBe(blurred);
    // 1 static + 1 blurred generation
    expect(spy).toHaveBeenCalledTimes(2);
    const blurFrame = calls[1].frame;
    expect(blurFrame?.width).toBe(100);
    expect(blurFrame?.height).toBe(100 + 2 * 24);
    cache.destroy();
  });

  it("captureBlurred with axis 'x' pads horizontally and keeps a separate entry per axis", () => {
    const { renderer, calls } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    cache.captureStatic('cherry', new Container(), 100, 80);

    const horizontal = cache.captureBlurred('cherry', 100, 80, { axis: 'x', strength: 24 });
    const xFrame = calls[1].frame;
    expect(xFrame?.width).toBe(100 + 2 * 24);
    expect(xFrame?.height).toBe(80);

    // Same id baked for a vertical reel sharing the cache: a new entry, and
    // the horizontal one stays alive for the reel still drawing it.
    const vertical = cache.captureBlurred('cherry', 100, 80, { axis: 'y', strength: 24 });
    expect(vertical).not.toBe(horizontal);
    expect(horizontal.destroyed).toBe(false);
    expect(cache.getBlurred('cherry', 100, 80, 'x')).toBe(horizontal);
    const yFrame = calls[2].frame;
    expect(yFrame?.width).toBe(100);
    expect(yFrame?.height).toBe(80 + 2 * 24);
    cache.destroy();
  });

  it('invalidate destroys owned captures; clear drops everything', () => {
    const { renderer } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    const s = cache.captureStatic('cherry', new Container(), 100, 100);
    const b = cache.captureBlurred('cherry', 100, 100);

    cache.invalidate('cherry');
    expect(s.destroyed).toBe(true);
    expect(b.destroyed).toBe(true);
    expect(cache.hasStatic('cherry')).toBe(false);
    expect(cache.hasBlurred('cherry')).toBe(false);
    cache.destroy();
  });
});

describe('prewarmSpinTextures', () => {
  it('bakes static + blurred textures for every id and destroys the scratch symbol', () => {
    const { renderer } = makeRenderer();
    const cache = new SpinTextureCache({ renderer });
    let scratch: HeadlessSymbol | null = null;

    prewarmSpinTextures({
      cache,
      ids: ['a', 'b', 'c'],
      createSymbol: () => {
        scratch = new HeadlessSymbol();
        return scratch;
      },
      width: 120,
      height: 90,
    });

    for (const id of ['a', 'b', 'c']) {
      expect(cache.hasStatic(id)).toBe(true);
      expect(cache.hasBlurred(id)).toBe(true);
    }
    expect(scratch!.isDestroyed).toBe(true);
    cache.destroy();
  });
});
