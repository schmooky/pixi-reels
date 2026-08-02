import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

/**
 * Every recipe demo on the docs site must actually build its reel set.
 *
 * Eleven recipes shipped passing the v1 `size: { w, h }` to `symbolData()`.
 * The v2 builder throws on it, so all eleven pages rendered an empty box --
 * and nothing anywhere went red. Recipe sources carry `@ts-nocheck`, so the
 * typechecker never looks at them; the site build only bundles them; the
 * unit suite never mounts them.
 *
 * `scripts/check-v1-keys.mjs` catches that specific class textually. This
 * catches the general one: whatever the reason, if a recipe throws on
 * mount, the page is dead, and this test says so.
 *
 * Asserts on the CANVAS plus a clean console rather than pixels -- a WebGL
 * screenshot baseline is GPU- and platform-dependent (same reasoning as
 * orientation-matrix.spec.ts).
 */

let server: ChildProcess | null = null;
const PORT = 5182;
const BASE = `http://localhost:${PORT}`;

/**
 * The recipe pages carrying the demos that were broken, plus a couple of
 * heavily-linked ones. Not every page: the suite runs on every push and a
 * full crawl would dominate its runtime for little extra signal.
 */
const PAGES = [
  '/recipes/big-symbols/',
  '/recipes/nudge/',
  '/recipes/cascade-6x5/',
  '/recipes/hold-and-win/',
  '/recipes/multiways/',
];

test.beforeAll(async () => {
  // Serve the built site: `astro build` is what actually ships, and a dev
  // server would hide a bundling failure behind on-demand compilation.
  server = spawn('pnpm', ['--filter', 'site', 'exec', 'astro', 'preview', '--port', String(PORT)], {
    stdio: 'pipe',
    cwd: process.cwd(),
  });
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  throw new Error(`site preview never came up on ${PORT}. Run \`pnpm --filter site build\` first.`);
});

test.afterAll(() => {
  server?.kill('SIGTERM');
  server = null;
});

for (const path of PAGES) {
  test(`recipes mount without throwing: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });

    // Demos mount lazily on intersection, so walk the page to trigger them.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await page.waitForTimeout(2500);

    // A recipe that threw in its builder leaves its slot canvas-less.
    const canvases = await page.locator('canvas').count();
    expect(canvases, `${path} rendered no canvas, so no recipe on it mounted`).toBeGreaterThan(0);

    // The v1-key failure surfaced exactly here: a builder throw, logged and
    // swallowed by the runner's error boundary.
    const builderErrors = errors.filter((e) => /renamed to|was renamed|pixi-reels-codemod/i.test(e));
    expect(builderErrors, `${path} logged a v1-rename throw`).toEqual([]);
    expect(errors, `${path} logged console errors`).toEqual([]);
  });
}
