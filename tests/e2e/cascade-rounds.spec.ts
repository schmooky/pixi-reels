import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

/**
 * Cascade recipes must survive a real round, not just a mount.
 *
 * `recipes-mount.spec.ts` proves a recipe compiles and mounts.
 * `check-recipe-syntax` proves it parses. Neither ever pressed the button,
 * and recipes are `@ts-nocheck` running on injected globals, so nothing
 * typechecks them either. Seven cascade recipes shipped handing
 * `runCascade`'s `nextGrid` a plain `string[][]` -- which `assertColumnTargets`
 * rejects AFTER the winners are destroyed, leaving the board frozen
 * mid-round with holes in it. Every static gate was green the whole time.
 *
 * So: tap every demo's canvas, let the chain run, and fail on anything that
 * reaches the console or the runner's error banner.
 */

let server: ChildProcess | null = null;
const PORT = 4332;
const BASE = `http://localhost:${PORT}`;

/**
 * `ASTRO_PREVIEW_BACKGROUND` set to anything only turns OFF astro 7's agent
 * auto-detect (`!process.env.ASTRO_PREVIEW_BACKGROUND && isRunByAgent()`), which
 * is what would otherwise daemonize the server out from under `afterAll`. It does
 * not request a background server; `--background` does that, and we never pass it.
 */
const PREVIEW_ENV = { ...process.env, ASTRO_PREVIEW_BACKGROUND: '1' };

/** Topic pages that host at least one `runCascade` recipe. */
const CASCADE_PAGES = ['/mechanics/cascade/', '/mechanics/big-symbols/'];

test.beforeAll(async () => {
  let occupied = false;
  try { occupied = (await fetch(`${BASE}/`)).ok; } catch { /* free, as wanted */ }
  if (occupied) {
    throw new Error(`${BASE} is already served by a process this spec did not start. ` +
      `Kill it: pkill -f "astro preview --port ${PORT}"`);
  }
  server = spawn(
    'pnpm',
    // astro 7 turned `preview` into a managed server: it writes a project-wide
    // lock and refuses to start a second one even on a different port, and it
    // daemonizes itself when it detects an agent environment. Two specs each run
    // their own preview on their own port, and both do their own port guard above
    // plus a process-group kill in afterAll, so neither behavior helps here.
    //   --ignore-lock          -> coexist with the other spec's server
    //   ASTRO_PREVIEW_BACKGROUND -> only suppresses the agent auto-detect, so the
    //                            server stays in the foreground and dies with us
    // The two must go together: astro rejects --ignore-lock for a background server.
    ['--filter', 'site', 'exec', 'astro', 'preview', '--ignore-lock', '--port', String(PORT)],
    { stdio: 'pipe', cwd: process.cwd(), detached: true, env: PREVIEW_ENV },
  );
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${BASE}/`)).ok) return; } catch { /* not up yet */ }
    await wait(500);
  }
  throw new Error(`site preview never came up on ${PORT}. Run \`pnpm --filter site build\` first.`);
});

test.afterAll(() => {
  // Negative pid = the process group, so the astro child dies with the pnpm
  // wrapper rather than surviving to hold the port.
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  server = null;
});

for (const path of CASCADE_PAGES) {
  test(`cascade rounds complete: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    // Tall viewport so every demo on the page is inside the runner's
    // intersection margin and actually mounts.
    await page.setViewportSize({ width: 1280, height: 3000 });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    // A topic page's demos sit below its Concept prose; bring the section to
    // the top so the whole viewport is demos.
    await page.evaluate(() => document.getElementById('demos')?.scrollIntoView());
    await page.waitForTimeout(3000);

    // Budget by the page's demo count, as the scroll test does by height,
    // with the old flat 60s as the floor. Frames, not ready demos: on a
    // slow runner only a third of the demos have mounted at count time, and
    // a budget from that number came out BELOW the floor. The cascade page
    // is at 26 frames.
    const frames = await page.locator('.recipe-frame').count();
    expect(frames, `${path} has no demo frame`).toBeGreaterThan(0);
    test.setTimeout(Math.max(60_000, 20_000 + frames * 3_000 + 12_000));

    // There is no DOM spin control. The runner's wrapper inside each frame
    // carries `data-state`: `loading` until the recipe has mounted, `ready`
    // once its canvas accepts taps (the recipe wires `tapToSpin`, so a
    // pointer tap on the stage starts a round), `error` when the runner has
    // painted its banner. Wait for every mounted frame to be ready, so a
    // click does not land on a canvas whose recipe is still loading its kits
    // and quietly start nothing.
    const ready = page.locator('.recipe-frame [data-state="ready"]');
    await expect
      .poll(async () => {
        const loading = await page.locator('.recipe-frame [data-state="loading"]').count();
        return loading === 0 && (await ready.count()) > 0;
      }, { message: `${path} never had every mounted demo reach data-state="ready"`, timeout: 60_000 })
      .toBe(true);

    // Pin the canvases NOW, then click each once. Playwright's click sends
    // real pointer events, which Pixi turns into the `pointertap` the recipe
    // listens for. `force` skips the actionability checks: under software GL
    // a frame can take long enough that "stable" never holds for two demos in
    // a row, and one waited-out click per demo is the whole budget. A tap on
    // a demo already mid-round would skip it, but each canvas is tapped once.
    const canvases = await ready.locator('canvas').elementHandles();
    for (const canvas of canvases) {
      await canvas.click({ timeout: 5_000, force: true }).catch(() => { /* detached mid-walk */ });
      await page.waitForTimeout(400);
    }

    // Long enough for a multi-stage chain plus its inter-stage pauses.
    await page.waitForTimeout(12_000);

    // The runner paints a `.text-destructive` overlay when a recipe throws.
    const banners = await page.locator('.text-destructive').allInnerTexts();
    expect(banners, `${path} showed a recipe error banner`).toEqual([]);
    expect(errors, `${path} logged errors during the round`).toEqual([]);
  });
}
