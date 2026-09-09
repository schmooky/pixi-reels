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
 *
 * A third section drives named demos through their spin button, because
 * mounting proves nothing about a recipe whose point is inside `onSpin`. It
 * lives here rather than in its own spec so it shares this file's preview
 * server: the guard above refuses to attach to a server it did not start, and
 * a second spec booting its own would race this one for the port.
 */

let server: ChildProcess | null = null;
const PORT = 5182;
const BASE = `http://localhost:${PORT}`;

/**
 * Every recipe umbrella page. Recipes are evaluated from source at runtime,
 * so a page that builds can still throw on mount; only a real browser
 * catches that.
 *
 * The `/demos` route used to be covered here too. It was deleted in 2.0 when
 * the standalone example apps moved to their own repo -- `/recipes` is the
 * only live-demo surface now.
 */
const PAGES = [
  ...['anticipation', 'big-symbols', 'cascade', 'cells-and-banners', 'hold-and-win',
      'masks', 'nudge', 'orientation-and-direction', 'starters', 'symbols', 'wilds-and-pins',
     ].map((s) => `/recipes/${s}/`),
  // The only guide that embeds recipes. Kept explicit rather than globbed so
  // adding <RecipeDemo> to another guide is a deliberate act, not a silent
  // gap in coverage.
  '/guides/nudge/',
];

test.beforeAll(async () => {
  // Refuse to run against a server this spec did not start.
  //
  // `astro preview` serves a STATIC apps/site/dist, so a leftover from an
  // earlier run keeps serving the bundle it booted with, and the fresh spawn
  // below just loses the port bind without complaining. Every result after
  // that describes a build nobody asked about. This has already produced both
  // a false failure (stale no-fix dist failing a fixed tree) and false passes
  // in the other direction, so bail loudly instead of attaching.
  let occupied = false;
  try {
    occupied = (await fetch(`${BASE}/`)).ok;
  } catch {
    /* nothing listening, which is what we want */
  }
  if (occupied) {
    throw new Error(
      `${BASE} is already being served by a process this spec did not start -- ` +
      `almost certainly an orphaned \`astro preview\` still serving a stale ` +
      `apps/site/dist. Kill it and re-run:\n` +
      `  pkill -f "astro preview --port ${PORT}"`,
    );
  }

  // Serve the built site: `astro build` is what actually ships, and a dev
  // server would hide a bundling failure behind on-demand compilation.
  //
  // `detached` so afterAll can signal the whole process group. SIGTERM to the
  // pnpm wrapper alone leaves the astro child alive and holding the port,
  // which is how the orphans above got there in the first place.
  server = spawn('pnpm', ['--filter', 'site', 'exec', 'astro', 'preview', '--port', String(PORT)], {
    stdio: 'pipe',
    cwd: process.cwd(),
    detached: true,
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
  // Negative pid = the process group, so the astro child dies with the pnpm
  // wrapper rather than surviving to poison the next run.
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
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
    // intersection margin and mount together. This test is about mounting
    // only; `recipes survive scrolling` below covers unmount/teardown.
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

/**
 * Demos whose whole point is in `onSpin`: the layering APIs they exercise are
 * only called once the choreography starts, so a recipe can mount perfectly
 * and throw on the first `lift()`. Neither section above would notice --
 * `recipes mount` only reaches demos near the top of a page, and `recipes
 * survive scrolling` mounts every demo but presses nothing.
 *
 * This asserts that the choreography RUNS to the end without throwing. It
 * does not assert what it drew: draw order is a scene-graph fact, pinned by
 * the unit tests (boardGridLift, boardGridDim, reelSetPromote), and a WebGL
 * pixel baseline is GPU-dependent for the reason given at the top.
 *
 * `ms` is how long that recipe's own choreography takes, plus slack: too
 * short and the assertion fires mid-run, which passes for the wrong reason.
 */
const DRIVEN: { path: string; anchor: string; ms: number }[] = [
  // A lift held across three respin landings, each one a whole-board
  // `refreshCellZIndex()` over the lifted cell.
  { path: '/recipes/hold-and-win/', anchor: 'hold-and-win-clover-lift', ms: 12_000 },
  // `dim({ except })` under a `lift()`, both released in a `finally`.
  { path: '/recipes/hold-and-win/', anchor: 'hold-and-win-clover-lift-dim', ms: 9_000 },
  // `dim()` and `dimSymbols()` back to back, both under a `lift()`.
  { path: '/recipes/hold-and-win/', anchor: 'hold-and-win-clover-dim-symbols', ms: 12_000 },
  // One cell, chrome background vs symbol art, four dims in a row.
  { path: '/recipes/hold-and-win/', anchor: 'hold-and-win-clover-dim-one-cell', ms: 12_000 },
  // `reelSet.promote()` around a GSAP tween, run twice.
  { path: '/recipes/symbols/', anchor: 'clover-promote-win-line', ms: 12_000 },
];

for (const { path, anchor, ms } of DRIVEN) {
  test(`recipe runs its choreography: ${anchor}`, async ({ page }) => {
    // Mounting a Spine-heavy demo on CI's software GL is the slow part, not
    // the run itself; the default 60s is not enough once `ms` is on top.
    test.setTimeout(ms + 90_000);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });

    // The MDX emits `<a id> <h2> <p> <div class="recipe-frame">` as siblings,
    // so the first frame after the anchor is that heading's demo.
    const frame = page.locator(`#${anchor} ~ .recipe-frame`).first();
    await expect(frame, `${anchor} has no demo frame on ${path}`).toHaveCount(1);
    await frame.scrollIntoViewIfNeeded();

    // LazyRecipeRunner mounts on intersection, then the recipe loads its
    // atlases and skeletons before a canvas exists at all.
    await expect(frame.locator('canvas')).toBeVisible({ timeout: 60_000 });
    const mountFailures = (await frame.locator('.text-destructive').allInnerTexts())
      .map((t) => t.trim()).filter(Boolean);
    expect(mountFailures, `${anchor} threw on mount`).toEqual([]);

    await frame.getByRole('button', { name: 'Spin' }).click();
    await page.waitForTimeout(ms);

    // Both assertions below are load-bearing, and they catch different
    // shapes. A throw on the awaited path is caught by the runner and
    // rendered over the slot without ever reaching the console; a throw in a
    // branch the recipe started but has not awaited yet (the lift demo runs
    // its upgrade alongside the respins) surfaces as an unhandled rejection
    // instead. Verified by breaking the lift recipe on purpose: the slot
    // stayed clean and `errors` went red.
    const shown = (await frame.locator('.text-destructive').allInnerTexts())
      .map((t) => t.trim()).filter(Boolean);
    expect(shown, `${anchor} threw while running its choreography`).toEqual([]);

    expect(errors, `${anchor} logged console errors while running`).toEqual([]);
  });
}

/**
 * Pages that stack enough demos for scrolling to actually unmount one while
 * others stay live. That overlap is the whole point: teardown bugs that only
 * corrupt OTHER apps are invisible on a single-demo page.
 */
const SCROLL_PAGES = [
  '/recipes/big-symbols/',
  '/recipes/nudge/',
  '/recipes/cascade-6x5/',
  '/recipes/hold-and-win/',
  '/recipes/multiways/',
];

for (const path of SCROLL_PAGES) {
  test(`recipes survive scrolling: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    // Normal-height viewport, unlike the mount test: demos must leave the
    // runner's 500px intersection margin for LazyRecipeRunner to unmount
    // them, and a 3000px viewport keeps the whole page mounted.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Walk the page in viewport-ish steps so demos mount and unmount while
    // their neighbours keep rendering. Each app teardown used to release
    // PixiJS's PROCESS-global pools (BigPool, batchPool, ...), freeing pooled
    // objects still referenced by the surviving apps' instruction sets. The
    // survivors then threw from inside their own render loop, one frame
    // later -- "Cannot read properties of null (reading 'geometry')".
    const height = await page.evaluate(() => document.body.scrollHeight);
    // Each step waits 700ms and then pays for whatever the demos that just
    // scrolled in cost to mount. On CI's software GL a Spine-heavy page (Hold
    // & Win stacks ~40 demos) spent the whole fixed 60s inside this loop, so
    // budget by page height instead: a longer page is not a red build.
    test.setTimeout(Math.ceil(height / 700) * 2500 + 30_000);
    for (let y = 0; y < height; y += 700) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(700);
    }
    // Let the last batch of unmounts land, plus a few frames of the
    // survivors rendering afterwards -- that is when the corruption showed.
    await page.waitForTimeout(2000);

    const shown = await page.locator('.text-destructive').allInnerTexts();
    const failures = shown.map((t) => t.trim()).filter(Boolean);
    expect(failures, `${path} has recipe(s) that threw while scrolling`).toEqual([]);

    expect(errors, `${path} logged console errors across mount + unmount`).toEqual([]);
  });
}
