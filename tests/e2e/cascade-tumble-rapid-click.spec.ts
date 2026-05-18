import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

/**
 * Cascade-tumble rapid-click suite.
 *
 * The example uses a DOM button — Playwright drives it via real clicks.
 * This is the realistic "what the player actually does" path: a player
 * sees the SPIN button highlighted, mashes it. The engine and the
 * user-code cascade loop must stay coherent across the mash, and the
 * button must NOT get stuck after the round.
 */

let server: ChildProcess | null = null;
const PORT = 5174;

test.beforeAll(async () => {
  server = spawn(
    'pnpm',
    ['--filter', 'cascade-tumble', 'exec', 'vite', '--port', String(PORT), '--strictPort'],
    { stdio: 'pipe', cwd: process.cwd() },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await wait(500);
  }
  throw new Error('cascade-tumble dev server failed to start within 30 s');
});

test.afterAll(async () => {
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await wait(500);
  }
});

async function waitForEngineIdle(
  page: import('@playwright/test').Page,
  timeoutMs = 12_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const rs = (window as any).__PIXI_REELS_DEBUG?.reelSet;
      return !!rs && !rs.isSpinning;
    },
    { timeout: timeoutMs },
  );
}

/**
 * Round = engine spin + cascade refills + user-code loop. Engine
 * `isSpinning` flickers per refill, so wait on the user-code probe.
 */
async function waitForRoundComplete(
  page: import('@playwright/test').Page,
  timeoutMs = 30_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = (window as any).__CASCADE_TUMBLE;
      const rs = (window as any).__PIXI_REELS_DEBUG?.reelSet;
      return !!probe && !!rs && !probe.busy && !rs.isSpinning;
    },
    { timeout: timeoutMs },
  );
}

test('mounts and exposes debug handle', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(
    () => !!(window as any).__PIXI_REELS_DEBUG?.reelSet,
    { timeout: 20_000 },
  );
  await expect(page.locator('button').first()).toBeVisible();
});

test('rapid double-click triggers slam and round completes cleanly', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !!(window as any).__PIXI_REELS_DEBUG?.reelSet);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // First button in the shared UI is the spin/stop button. Don't filter by
  // text — its label flips between SPIN and STOP and would break the
  // locator mid-test.
  const btn = page.locator('button').first();

  // Capture skip events so we can assert that the slam DID route through
  // the engine by the time the round completes. `requestSkip()` defers
  // the slam until `setResult()` arrives (the right behavior for cascade
  // games with long server waits — slamming pre-`setResult` would land
  // the reels on whatever filler was in the buffer), so we don't probe
  // synchronously right after click 2; we verify the contract at round end.
  await page.evaluate(() => {
    (window as any).__SKIP_EVENTS = [];
    const rs = (window as any).__PIXI_REELS_DEBUG.reelSet;
    rs.events.on('skip:requested', () => (window as any).__SKIP_EVENTS.push('requested'));
    rs.events.on('skip:boosted', () => (window as any).__SKIP_EVENTS.push('boosted'));
  });

  // Click 1 starts the round; click 2 a few ms later — during the lead-in
  // or the long server wait — queues the slam through `requestSkip()`.
  await btn.click();
  await page.waitForTimeout(50);
  await btn.click();

  await waitForRoundComplete(page);

  const final = await page.evaluate(() => {
    const rs = (window as any).__PIXI_REELS_DEBUG.reelSet;
    return {
      isSpinning: rs.isSpinning,
      skipStage: rs.skipStage,
      events: (window as any).__SKIP_EVENTS.slice(),
    };
  });
  expect(final.isSpinning).toBe(false);
  // Slam must have routed through the engine at least once by round end.
  // `requestSkip()` flushes to `_slam()` when `setResult()` arrives, which
  // emits `skip:requested` and bumps `skipStage` to 2.
  expect(final.events).toContain('requested');
  expect(final.skipStage).toBe(2);
  expect(errors).toEqual([]);
});

test('the SPIN button stays clickable after a slammed round', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !!(window as any).__PIXI_REELS_DEBUG?.reelSet);

  // First button in the shared UI is the spin/stop button. Don't filter by
  // text — its label flips between SPIN and STOP and would break the
  // locator mid-test.
  const btn = page.locator('button').first();

  // Round 1 — slammed.
  await btn.click();
  await page.waitForTimeout(80);
  await btn.click();
  await waitForRoundComplete(page);

  // Round 2 — fresh start.
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await btn.click();

  await page.waitForFunction(
    () => (window as any).__PIXI_REELS_DEBUG?.reelSet?.isSpinning === true,
    { timeout: 4_000 },
  );
  const mid = await page.evaluate(() => {
    const rs = (window as any).__PIXI_REELS_DEBUG.reelSet;
    return { isSpinning: rs.isSpinning, skipStage: rs.skipStage };
  });
  expect(mid.isSpinning).toBe(true);
  expect(mid.skipStage).toBe(0);

  await waitForRoundComplete(page);
  expect(errors).toEqual([]);
});

test('a tap during a between-refill gap queues and slams the next refill', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !!(window as any).__PIXI_REELS_DEBUG?.reelSet);

  const btn = page.locator('button').first();
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // Start a round.
  await btn.click();

  // Wait until the round reaches its first between-refill gap — user-code
  // is mid-cascade-loop (probe.busy=true) but engine isn't running phases
  // (rs.isSpinning=false). That's the "lost-tap" window the queue fixes.
  // If the random server produces no winners, this poll just times out
  // gracefully; we skip the assertion.
  let hitGap = false;
  for (let i = 0; i < 80; i++) {
    const state = await page.evaluate(() => {
      const probe = (window as any).__CASCADE_TUMBLE;
      const rs = (window as any).__PIXI_REELS_DEBUG.reelSet;
      return { busy: probe.busy, rs: rs.isSpinning, pending: probe.pendingSkip };
    });
    if (state.busy && !state.rs) { hitGap = true; break; }
    if (!state.busy) break; // round already over (no winners)
    await page.waitForTimeout(50);
  }

  if (hitGap) {
    await btn.click();
    const afterTap = await page.evaluate(() => {
      const probe = (window as any).__CASCADE_TUMBLE;
      return { pending: probe.pendingSkip };
    });
    expect(afterTap.pending).toBe(true);
  }

  // Whether or not we hit the gap, the round must complete cleanly.
  await waitForRoundComplete(page);
  expect(errors).toEqual([]);
});

test('mashing the button 8 times never throws or stalls the engine', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !!(window as any).__PIXI_REELS_DEBUG?.reelSet);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // First button in the shared UI is the spin/stop button. Don't filter by
  // text — its label flips between SPIN and STOP and would break the
  // locator mid-test.
  const btn = page.locator('button').first();
  for (let i = 0; i < 8; i++) {
    await btn.click({ force: true });
    await page.waitForTimeout(40);
  }

  await waitForRoundComplete(page);

  const final = await page.evaluate(() => {
    const rs = (window as any).__PIXI_REELS_DEBUG.reelSet;
    return { isSpinning: rs.isSpinning };
  });
  expect(final.isSpinning).toBe(false);
  expect(errors).toEqual([]);
});
