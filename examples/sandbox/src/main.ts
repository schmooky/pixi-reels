/**
 * Sandbox bootstrap — DO NOT EDIT (unless you want to change the runner).
 *
 * This file sets up the PixiJS Application, loads the prototype-symbols
 * atlas, creates the UI, and handles resize. It delegates reel construction
 * to `sandbox.ts` — edit THAT file to experiment with reel configurations.
 *
 * On Vite HMR, when `sandbox.ts` changes, the page reloads and your new
 * reel config is mounted.
 */
import { Application } from 'pixi.js';
import { gsap } from 'gsap';
import { loadPrototypeSymbols } from '../../shared/prototypeSpriteLoader.js';
import { createUI } from '../../shared/ui.js';
import { buildSandbox, type SandboxContext, type SandboxResult } from './sandbox.js';

async function main() {
  const app = new Application();
  await app.init({ background: 0x0e0e1a, resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  gsap.ticker.remove(gsap.updateRoot);
  app.ticker.add(() => gsap.updateRoot(app.ticker.lastTime / 1000));

  const atlas = await loadPrototypeSymbols();

  const ctx: SandboxContext = { app, textures: atlas.textures, blurTextures: atlas.blurTextures };
  const result: SandboxResult = buildSandbox(ctx);
  const reelSet = result.reelSet;

  const center = () => {
    reelSet.x = (app.screen.width - result.width) / 2;
    reelSet.y = (app.screen.height - result.height) / 2 - 40;
  };
  center();
  app.stage.addChild(reelSet);
  window.addEventListener('resize', center);

  const speeds = reelSet.speed.profileNames;
  const ui = createUI({
    onSpin: () => handleSpin(),
    onSpeedChange: (name) => reelSet.setSpeed(name),
    speeds,
  });

  let isSpinning = false;
  async function handleSpin() {
    if (isSpinning) {
      try { reelSet.skip(); } catch {}
      return;
    }
    isSpinning = true;
    ui.setSpinning(true);
    ui.showWin(0);

    const spinPromise = reelSet.spin();
    const target = result.nextResult();
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(target);
    await spinPromise;

    isSpinning = false;
    ui.setSpinning(false);
  }
}

main().catch((err) => {
  console.error('[sandbox] init failed:', err);
});
