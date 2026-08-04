import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

/**
 * All four travel combinations, in a real browser.
 *
 * The contract suite (`packages/pixi-reels/tests/contract/`) proves the strip
 * physics and the set geometry in Node. What it cannot exercise is the real
 * stack: WebGL, a real `requestAnimationFrame`, GSAP driven off the Pixi
 * ticker, and the full async spin lifecycle. That is what the plan's
 * "Playwright green on both horizontal recipes" item is actually buying.
 *
 * **Deliberately not pixel diffing.** Screenshot baselines of a WebGL canvas
 * are GPU- and platform-dependent; a baseline recorded on a dev machine fails
 * on CI's ubuntu runner for reasons that have nothing to do with the engine.
 * These assert engine STATE instead, via `__PIXI_REELS_DEBUG` - the same
 * reasoning that put a debug snapshot in the library in the first place
 * (`CLAUDE.md`: PixiJS renders to a canvas, agents and CI cannot see it).
 */

let server: ChildProcess | null = null;
const PORT = 5180;
const URL = `http://localhost:${PORT}/`;

test.beforeAll(async () => {
  server = spawn(
    'pnpm',
    ['--filter', 'orientation-matrix', 'exec', 'vite', '--port', String(PORT), '--strictPort'],
    { stdio: 'pipe', cwd: process.cwd() },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  throw new Error(`orientation-matrix dev server never came up on ${PORT}`);
});

test.afterAll(() => {
  server?.kill('SIGTERM');
  server = null;
});

/** Read one set's debug snapshot out of the page. */
const snapshot = (index: number) =>
  `(() => {
     const s = window.__SETS[${index}];
     const r = s.reels[0];
     return {
       reels: s.reels.length,
       visibleCells: r.visibleCells,
       orientation: r.axis.orientation,
       direction: r.axis.direction,
       feedEdge: r.axis.feedEdge,
       grid: s.getVisibleGrid(),
       cell00: s.getCellBounds(0, 0),
       cell01: s.getCellBounds(0, 1),
       cell10: s.getCellBounds(1, 0),
     };
   })()`;

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL);
  await page.waitForFunction('window.__SETS && window.__SETS.length === 4', null, {
    timeout: 30_000,
  });
  (page as unknown as { _errors: string[] })._errors = errors;
});

test('all four combinations build and report their own axis', async ({ page }) => {
  const combos = [
    ['vertical', 'forward', 'start'],
    ['vertical', 'reverse', 'end'],
    ['horizontal', 'forward', 'start'],
    ['horizontal', 'reverse', 'end'],
  ] as const;

  for (let i = 0; i < combos.length; i++) {
    const s = (await page.evaluate(snapshot(i))) as Record<string, unknown>;
    expect(s.orientation, `set ${i} orientation`).toBe(combos[i][0]);
    expect(s.direction, `set ${i} direction`).toBe(combos[i][1]);
    // feedEdge is DERIVED from polarity, never set twice.
    expect(s.feedEdge, `set ${i} feedEdge`).toBe(combos[i][2]);
    expect(s.reels).toBe(4);
    expect(s.visibleCells).toBe(3);
  }
});

test('horizontal geometry is the vertical geometry transposed', async ({ page }) => {
  type B = { x: number; y: number; width: number; height: number };
  const v = (await page.evaluate(snapshot(0))) as unknown as {
    cell00: B; cell01: B; cell10: B;
  };
  const h = (await page.evaluate(snapshot(2))) as unknown as {
    cell00: B; cell01: B; cell10: B;
  };

  // Cells step along the MAIN axis, reels along the CROSS axis - and the two
  // orientations swap which screen axis is which, by the same amount.
  expect(h.cell01.x - h.cell00.x).toBeCloseTo(v.cell01.y - v.cell00.y, 3);
  expect(h.cell10.y - h.cell00.y).toBeCloseTo(v.cell10.x - v.cell00.x, 3);
  // Cell rects transpose too.
  expect(h.cell00.width).toBeCloseTo(v.cell00.height, 3);
  expect(h.cell00.height).toBeCloseTo(v.cell00.width, 3);
});

test('every combination lands the same grid through a real spin', async ({ page }) => {
  await page.click('#spin');
  // The button re-enables only after all four promises resolve.
  await page.waitForFunction('!document.getElementById("spin").disabled', null, {
    timeout: 45_000,
  });

  const target = (await page.evaluate('window.__LAST')) as string[][];
  expect(target).toHaveLength(4);

  for (let i = 0; i < 4; i++) {
    const s = (await page.evaluate(snapshot(i))) as { grid: string[][] };
    expect(s.grid, `set ${i} landed grid`).toEqual(target);
  }

  const errors = (page as unknown as { _errors: string[] })._errors;
  expect(errors).toEqual([]);
});

test('spinning twice in a row stays coherent on every axis', async ({ page }) => {
  for (let round = 0; round < 2; round++) {
    await page.click('#spin');
    await page.waitForFunction('!document.getElementById("spin").disabled', null, {
      timeout: 45_000,
    });
  }
  const target = (await page.evaluate('window.__LAST')) as string[][];
  for (let i = 0; i < 4; i++) {
    const s = (await page.evaluate(snapshot(i))) as { grid: string[][] };
    expect(s.grid, `set ${i} after two rounds`).toEqual(target);
  }
  expect((page as unknown as { _errors: string[] })._errors).toEqual([]);
});
