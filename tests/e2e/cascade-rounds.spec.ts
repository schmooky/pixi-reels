import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

/**
 * Cascade recipes must survive a real Spin, not just a mount.
 *
 * `recipes-mount.spec.ts` proves a recipe compiles and mounts.
 * `check-recipe-syntax` proves it parses. Neither ever pressed the button,
 * and recipes are `@ts-nocheck` running on injected globals, so nothing
 * typechecks them either. Seven cascade recipes shipped handing
 * `runCascade`'s `nextGrid` a plain `string[][]` -- which `assertColumnTargets`
 * rejects AFTER the winners are destroyed, leaving the board frozen
 * mid-round with holes in it. Every static gate was green the whole time.
 *
 * So: click Spin, let the chain run, and fail on anything that reaches the
 * console or the runner's error banner.
 */

let server: ChildProcess | null = null;
const PORT = 4332;
const BASE = `http://localhost:${PORT}`;

/** Umbrella pages that host at least one `runCascade` recipe. */
const CASCADE_PAGES = ['/recipes/cascade/', '/recipes/big-symbols/'];

test.beforeAll(async () => {
  let occupied = false;
  try { occupied = (await fetch(`${BASE}/`)).ok; } catch { /* free, as wanted */ }
  if (occupied) {
    throw new Error(`${BASE} is already served by a process this spec did not start. ` +
      `Kill it: pkill -f "astro preview --port ${PORT}"`);
  }
  server = spawn('pnpm', ['--filter', 'site', 'exec', 'astro', 'preview', '--port', String(PORT)], {
    stdio: 'pipe', cwd: process.cwd(), detached: true,
  });
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
    await page.waitForTimeout(3000);

    // The runner renders one round button per demo, labelled Spin at rest.
    const spins = page.getByRole('button', { name: 'Spin' });
    const count = await spins.count();
    expect(count, `${path} mounted no runnable demo`).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = spins.nth(i);
      if (!(await btn.isEnabled().catch(() => false))) continue;
      await btn.click({ timeout: 10_000 }).catch(() => { /* mid-round relabel */ });
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
