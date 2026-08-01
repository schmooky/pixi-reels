/**
 * B2: gsap is held PER REEL SET, not in a module global.
 *
 * v1's `utils/gsapRef.ts` was a process-global whose own docstring admitted
 * "the last setGsap call wins". Harmless with one ReelSet; a live footgun on
 * a composed stage, where a banner reel and a main grid can legitimately be
 * driven by different instances.
 */
import { describe, it, expect, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';
import type { Ticker } from 'pixi.js';
import { ReelSetBuilder } from '../../src/core/ReelSetBuilder.js';
import { DEFAULT_GSAP } from '../../src/utils/gsap.js';
import { createTestReelSet } from '../../src/testing/index.js';
import { FakeTicker } from '../../src/testing/FakeTicker.js';
import { HeadlessSymbol } from '../../src/testing/HeadlessSymbol.js';

/** A recognisable stand-in. only identity is asserted, never behaviour. */
const fakeGsap = (tag: string) =>
  ({ ...defaultGsap, __tag: tag }) as unknown as typeof defaultGsap;

const build = (gsap?: typeof defaultGsap) => {
  const b = new ReelSetBuilder()
    .reels(2)
    .visibleCells(3)
    .symbolSize(120, 100)
    .ticker(new FakeTicker() as unknown as Ticker)
    .symbols((r) => r.register('a', HeadlessSymbol, {}))
    .weights({ a: 1 });
  if (gsap) b.gsap(gsap);
  return b.build();
};

describe('per-set gsap', () => {
  it('defaults to the instance resolved at lib load', () => {
    const set = build();
    try {
      expect(set.reels[0].gsap).toBe(DEFAULT_GSAP);
    } finally {
      set.destroy();
    }
  });

  it('binds the builder instance to every reel in the set', () => {
    const mine = fakeGsap('mine');
    const set = build(mine);
    try {
      for (const reel of set.reels) expect(reel.gsap).toBe(mine);
    } finally {
      set.destroy();
    }
  });

  it('two sets keep their own instances. the last build does not win', () => {
    const first = fakeGsap('first');
    const second = fakeGsap('second');
    const a = build(first);
    const b = build(second);
    try {
      expect(a.reels[0].gsap).toBe(first);
      expect(b.reels[0].gsap).toBe(second);
      // The v1 failure mode: building `b` rebound the global and silently
      // moved `a`'s tweens onto the wrong timeline.
      expect(a.reels[0].gsap).not.toBe(b.reels[0].gsap);
    } finally {
      a.destroy();
      b.destroy();
    }
  });

  it('building a second set does not disturb a first one already spinning', async () => {
    const first = fakeGsap('first');
    const a = createTestReelSet({
      reels: 2,
      visibleCells: 3,
      symbolIds: ['a', 'b'],
      gsap: first,
    });
    try {
      const spin = a.reelSet.spin();
      a.advance(100);
      const b = build(fakeGsap('second'));
      expect(a.reelSet.reels[0].gsap).toBe(first);
      b.destroy();
      a.reelSet.setResult([{ visible: ['a', 'a', 'a'] }, { visible: ['b', 'b', 'b'] }]);
      a.reelSet.slamStop();
      await spin;
    } finally {
      a.destroy();
    }
  });

  it('gsap() returns the builder for chaining', () => {
    const b = new ReelSetBuilder();
    expect(b.gsap(fakeGsap('x'))).toBe(b);
  });
});

describe('symbols animate on their own set instance', () => {
  it('SymbolFactory binds the set gsap onto every symbol it creates', async () => {
    const calls: string[] = [];
    // playDestroy builds a timeline; playWin uses .to(). Track both so the
    // assertion does not depend on which animation the symbol happens to use.
    const spy = {
      ...defaultGsap,
      timeline: (...args: unknown[]) => {
        calls.push('timeline');
        return (defaultGsap.timeline as (...a: unknown[]) => unknown)(...args);
      },
      to: (...args: unknown[]) => {
        calls.push('to');
        return (defaultGsap.to as (...a: unknown[]) => unknown)(...args);
      },
    } as unknown as typeof defaultGsap;

    const h = createTestReelSet({
      reels: 1,
      visibleCells: 1,
      symbolIds: ['a'],
      gsap: spy,
    });
    try {
      // playDestroy is the base-class animation; it must run on the set's
      // instance, not on whatever `gsap` the symbol module imported.
      const symbol = h.reelSet.reels[0].getSymbolAt(0);
      const destroyed = symbol.playDestroy({ durationMs: 1 });
      expect(calls.length).toBeGreaterThan(0);
      await destroyed;
    } finally {
      h.destroy();
    }
  });
});

describe('driveGsapWithTicker takes the instance explicitly', () => {
  it('drives exactly the instance it is handed', async () => {
    const { driveGsapWithTicker } = await import('../../src/utils/gsapTicker.js');
    const updateRoot = vi.fn();
    const mine = {
      updateRoot,
      ticker: { add: vi.fn(), remove: vi.fn() },
    } as unknown as typeof defaultGsap;
    const ticker = new FakeTicker();
    const dispose = driveGsapWithTicker(ticker as unknown as Ticker, mine);
    ticker.tick(16);
    expect(updateRoot).toHaveBeenCalledTimes(1);
    dispose();
  });
});

describe('regression guard: no module-level gsap calls', () => {
  it('every animation site reads an injected instance, never a bare import', async () => {
    // If a future change re-introduces `import { gsap } from 'gsap'` and uses
    // it for a runtime tween, this catches it: any `gsap.timeline(`,
    // `gsap.to(`, etc. outside `utils/gsap.ts` is a regression, because that
    // tween would live on the lib's own module instance rather than the set's.
    //
    // Type-only imports erase and are fine; so are docs URLs in comments.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const srcDir = path.resolve(__dirname, '../../src');

    async function walk(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...(await walk(full)));
        else if (e.isFile() && full.endsWith('.ts')) files.push(full);
      }
      return files;
    }

    const offenders: string[] = [];
    for (const file of await walk(srcDir)) {
      if (file.endsWith('utils/gsap.ts')) continue;
      const stripped = (await fs.readFile(file, 'utf8'))
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      // The lookbehind is load-bearing: `this.gsap.to(` and
      // `this._reel.gsap.timeline(` are the CORRECT injected form. Only a
      // bare `gsap.to(` off a module import is the regression.
      if (
        /(?<![.\w$])gsap\.(timeline|to|delayedCall|fromTo|set|killTweensOf)\s*\(/.test(stripped)
      ) {
        offenders.push(path.relative(srcDir, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no source file imports the retired gsapRef module', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const srcDir = path.resolve(__dirname, '../../src');
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (full.endsWith('.ts')) {
          if ((await fs.readFile(full, 'utf8')).includes('gsapRef')) {
            found.push(path.relative(srcDir, full));
          }
        }
      }
    };
    await walk(srcDir);
    expect(found).toEqual([]);
  });
});
