import { afterEach, describe, it, expect, vi } from 'vitest';
import { gsap as defaultGsap } from 'gsap';
import { getGsap, setGsap } from '../../src/utils/gsapRef.js';

describe('gsapRef', () => {
  afterEach(() => {
    // Restore the default binding so other tests are not affected.
    setGsap(defaultGsap);
  });

  it('returns the imported gsap by default', () => {
    expect(getGsap()).toBe(defaultGsap);
  });

  it('setGsap rebinds the instance returned by getGsap', () => {
    const fake = { timeline: vi.fn(), to: vi.fn(), delayedCall: vi.fn() } as unknown as typeof defaultGsap;
    setGsap(fake);
    expect(getGsap()).toBe(fake);
    expect(getGsap()).not.toBe(defaultGsap);
  });

  it('builder.gsap(instance) wires through to getGsap()', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    const fake = { timeline: vi.fn(), to: vi.fn(), delayedCall: vi.fn() } as unknown as typeof defaultGsap;

    new ReelSetBuilder().gsap(fake);

    expect(getGsap()).toBe(fake);
  });

  it('builder.gsap() returns the builder for chaining', async () => {
    const { ReelSetBuilder } = await import('../../src/core/ReelSetBuilder.js');
    const builder = new ReelSetBuilder();
    const fake = { timeline: vi.fn(), to: vi.fn(), delayedCall: vi.fn() } as unknown as typeof defaultGsap;

    expect(builder.gsap(fake)).toBe(builder);
  });

  it('every internal animation file reads gsap through getGsap (regression guard)', async () => {
    // If a future change re-introduces a bare `import { gsap } from 'gsap'`
    // and uses it for a runtime tween call, this test will catch it: any
    // `gsap.timeline(`, `gsap.to(`, or `gsap.delayedCall(` outside the
    // gsapRef shim itself is a regression.
    //
    // Type-only imports (`import type { gsap } from 'gsap'`) are fine —
    // they erase at compile time and never execute. Comments mentioning
    // `gsap.com` (the docs URL) are also fine.
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

    const files = await walk(srcDir);
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith('utils/gsapRef.ts')) continue;
      const content = await fs.readFile(file, 'utf8');

      // Strip line comments so docs URLs (`// gsap.com`) don't false-positive.
      const stripped = content
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      // Look for runtime calls: gsap.timeline(, gsap.to(, gsap.delayedCall(.
      const runtimeCallRe = /\bgsap\.(timeline|to|delayedCall|fromTo|set|killTweensOf)\s*\(/;
      if (runtimeCallRe.test(stripped)) {
        offenders.push(path.relative(srcDir, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
