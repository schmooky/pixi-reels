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
import { Application, Container } from 'pixi.js';
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

  const wrapper = new Container();
  wrapper.addChild(reelSet);
  app.stage.addChild(wrapper);

  function reposition() {
    const pad = 16, uiH = 80;
    const s = Math.min((app.screen.width - pad * 2) / result.width, (app.screen.height - pad * 2 - uiH) / result.height, 1);
    wrapper.scale.set(s);
    wrapper.x = (app.screen.width - result.width * s) / 2;
    wrapper.y = (app.screen.height - result.height * s - uiH) / 2;
  }
  reposition();
  window.addEventListener('resize', reposition);

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
