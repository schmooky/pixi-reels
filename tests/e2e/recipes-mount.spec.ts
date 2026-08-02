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
 * Every recipe page and every demo page. Both runtimes are covered because
 * they fail differently: recipes are evaluated from source at runtime, demo
 * pages mount compiled React components.
 */
const PAGES = [
  ...['anticipation', 'big-symbols', 'cascade', 'cells-and-banners', 'hold-and-win',
      'nudge', 'orientation-and-direction', 'starters', 'symbols', 'wilds-and-pins',
     ].map((s) => `/recipes/${s}/`),
  ...['anticipation-slam', 'big-symbols', 'cascade-multiplier', 'classic-lines',
      'hold-and-win-respin', 'multiways', 'pyramid-cascade', 'scatter-triggers-fs',
      'sprite-classic', 'sticky-wilds',
     ].map((s) => `/demos/${s}/`),
  // The only guide that embeds demos. Kept explicit rather than globbed so
  // adding <RecipeDemo> to another guide is a deliberate act, not a silent
  // gap in coverage.
  '/guides/nudge/',
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

    // Tall viewport so several demos fall inside the runner's 500px
    // intersection margin and mount together. Deliberately NOT scrolling:
    // scrolling past a demo unmounts it, and teardown has its own separate
    // race (a destroyed app's gsap tweens outliving it) that would show up
    // here as noise. This test is about mounting.
    await page.setViewportSize({ width: 1280, height: 3000 });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const canvases = await page.locator('canvas').count();
    expect(canvases, `${path} rendered no canvas, so no recipe on it mounted`).toBeGreaterThan(0);

    // THE assertion. A recipe that throws is caught by the runner and
    // rendered as "Runtime error: ..." text over its slot -- it never
    // reaches the console, which is why an earlier version of this test
    // watched console output and sailed straight past a reintroduced
    // `size: { w, h }`. Read the rendered message instead.
    const shown = await page.locator('.text-destructive').allInnerTexts();
    const failures = shown.map((t) => t.trim()).filter(Boolean);
    expect(failures, `${path} has recipe(s) that threw on mount`).toEqual([]);

    expect(errors, `${path} logged console errors while mounting`).toEqual([]);
  });
}
