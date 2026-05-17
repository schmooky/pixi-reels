import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

/**
 * Arc-lord rapid-click ("Chinese clicks") suite.
 *
 * Unit tests can't reproduce these failures because they don't model the
 * real player who mashes the button during async gaps (LEAD_IN_MS, the
 * 2-5 s server wait, between-refill destroy animations). These tests:
 *
 *  - boot the actual arc-lord dev server,
 *  - drive the on-canvas Pixi spin button via its listener
 *    (canvas DOM events don't route through Pixi's hit test reliably
 *    in headless),
 *  - assert the engine reaches a clean state and the button stays
 *    responsive after rapid double / triple taps.
 *
 * The "always-skip" bug we're hardening against: a rapid second tap
 * during a window where user-code is busy but the engine is idle used
 * to be a silent no-op, leaving the player tapping a dead button.
 */

let server: ChildProcess | null = null;
const PORT = 5180;

test.beforeAll(async () => {
  server = spawn(
    'pnpm',
    ['--filter', 'arc-lord', 'exec', 'vite', '--port', String(PORT), '--strictPort'],
    { stdio: 'pipe', cwd: process.cwd() },
  );
  // Wait for the dev server to respond.
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await wait(500);
  }
  throw new Error('arc-lord dev server failed to start within 30 s');
});

test.afterAll(async () => {
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await wait(500);
  }
});

async function tapSpinButton(page: import('@playwright/test').Page): Promise<void> {
  // The button is a Pixi Container with eventMode='static' attached to the
  // app stage. Find it by walking the stage; call its pointerdown listener
  // directly — Pixi's pointerdown handler is what `pointerdown` would
  // route to, and synthetic DOM events on the canvas don't reliably
  // reach Pixi's EventBoundary in headless chromium.
  await page.evaluate(() => {
    const debug = (window as any).__PIXI_REELS_DEBUG;
    if (!debug?.reelSet) throw new Error('arc-lord not mounted');
    let stage: any = debug.reelSet;
    while (stage.parent) stage = stage.parent;
    const spinBtn = stage.children.find(
      (c: any) => c.eventMode === 'static' && c !== debug.reelSet.parent,
    );
    if (!spinBtn) throw new Error('spin button not found');
    const listener = spinBtn.listeners('pointerdown')[0];
    if (!listener) throw new Error('spin button has no pointerdown listener');
    listener();
  });
}

async function getState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rs = (window as any).__PIXI_REELS_DEBUG?.reelSet;
    if (!rs) return { mounted: false };
    return {
      mounted: true,
      isSpinning: rs.isSpinning,
      skipStage: rs.skipStage,
      activeSpeed: rs.speed.activeName,
    };
  });
}

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
 * The arc-lord round = engine spin + cascade refills + user-code loop.
 * Engine `isSpinning` oscillates between refills, so this waits on the
 * user-code probe (`window.__ARC_LORD.busy`) which stays true for the
 * whole round.
 */
async function waitForRoundComplete(
  page: import('@playwright/test').Page,
  timeoutMs = 45_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const arc = (window as any).__ARC_LORD;
      const rs = (window as any).__PIXI_REELS_DEBUG?.reelSet;
      return !!arc && !!rs && !arc.busy && !rs.isSpinning;
    },
    { timeout: timeoutMs },
  );
}

test('arc-lord boots and exposes debug handle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(
    () => !!(window as any).__PIXI_REELS_DEBUG?.reelSet,
    { timeout: 20_000 },
  );

  const state = await getState(page);
  expect(state.mounted).toBe(true);
  expect(state.isSpinning).toBe(false);
  expect(state.skipStage).toBe(0);
  expect(errors).toEqual([]);
});

test('rapid double-tap during the LEAD_IN_MS window queues the skip', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !!(window as any).__PIXI_REELS_DEBUG?.reelSet);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // Two taps within milliseconds — second falls inside the LEAD_IN_MS=180 ms
  // wait before reelSet.spin() actually starts. With the queue, this should
  // become a `requestSkip()` that fires when the engine starts and slams the
  // round as soon as setResult arrives.
  await tapSpinButton(page);
  await tapSpinButton(page);

  // Round runs through (server wait 2-5 s, then auto-slam + cascade).
  // Wait generously to cover slow server + a few cascade refills.
  await waitForRoundComplete(page);

  const final = await getState(page);
  expect(final.isSpinning).toBe(false);
  // skipStage moves to 2 once a slam fires. With the queued requestSkip
  // landing during the spin, this round was slammed.
  expect(final.skipStage).toBe(2);
  expect(errors).toEqual([]);
});

test('after a slammed round, a fresh tap starts a clean new round', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !!(window as any).__PIXI_REELS_DEBUG?.reelSet);

  // Round 1: rapid double-tap → slammed via queued skip.
  await tapSpinButton(page);
  await tapSpinButton(page);
  await waitForRoundComplete(page);

  // Round 2: single fresh tap. Engine should accept it — button must not be
  // stuck in "always-skip" mode after the previous slammed round.
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await tapSpinButton(page);

  // Wait until the ENGINE is spinning — `spin()` is what resets skipStage,
  // so just waiting on user-code `busy` would read pre-reset state during
  // the LEAD_IN_MS wait. 4 s comfortably covers the 180 ms lead-in.
  await page.waitForFunction(
    () => (window as any).__PIXI_REELS_DEBUG?.reelSet?.isSpinning === true,
    { timeout: 4_000 },
  );

  // Round 2 is in flight. Stage should reset to 0 (proves the round-aware
  // machine didn't carry slammed state across rounds).
  const midSpin = await getState(page);
  expect(midSpin.skipStage).toBe(0);

  // Let it ride to completion so the test cleans up.
  await waitForRoundComplete(page);
  expect(errors).toEqual([]);
});

test('mashing the button many times never throws or leaves the engine stuck', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !!(window as any).__PIXI_REELS_DEBUG?.reelSet);

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // 8 rapid taps with tiny gaps — the kind of input a casino player
  // mashing the button would actually produce.
  for (let i = 0; i < 8; i++) {
    await tapSpinButton(page);
    await page.waitForTimeout(40);
  }

  await waitForRoundComplete(page);

  const final = await getState(page);
  expect(final.isSpinning).toBe(false);
  // After mashing, a fresh tap must still work.
  await tapSpinButton(page);
  await page.waitForFunction(
    () => (window as any).__ARC_LORD?.busy === true,
    { timeout: 4_000 },
  );
  // Let the second round complete so the test cleans up.
  await waitForRoundComplete(page);
  expect(errors).toEqual([]);
});
