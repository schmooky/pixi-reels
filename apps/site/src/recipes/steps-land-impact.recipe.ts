// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StopPhase, PhaseCardSymbol,
//                   step, insertAfter, PIXI, gsap, app
//
// LANDING IMPACT. One step after `land`: a camera kick and a dust puff.
//
// `insertAfter(steps, 'land', step('impact', fx))` gives the FX the exact
// frame the reel comes to rest: after `land()` (symbols told, the reel's
// landing raised) and before `bounce`. The step returns nothing, so it is
// instant: the bounce starts on the same frame and the FX plays alongside
// it. Return the tween instead and the phase WAITS for it before bouncing.
// That is the whole difference between an effect and a beat, one `return`.
//
// The kick is on `reelSet.pivot`, so it never fights the runner's placement
// of the set, and it ends at 0. Harder on the last reel, the one the player
// is waiting on.
//
// Gotcha: a slam lands through `onSkip`, not through the list, so `impact`
// does not fire on a slam. FX that must play on a slam too hangs off
// `spin:reelLanded`. A quicken keeps the list, so it keeps the FX.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

let reelSet;
const fxLayer = new PIXI.Container();

const impact = (ctx) => {
  const i = ctx.reel.reelIndex;
  const last = i === REELS - 1;

  // The kick: the set drops and settles. A new landing overrides the settle.
  gsap.killTweensOf(reelSet.pivot);
  gsap.fromTo(reelSet.pivot, { y: last ? -14 : -6 }, {
    y: 0, duration: last ? 0.6 : 0.35, ease: 'elastic.out(1, 0.3)',
  });

  // The dust: an ellipse under the reel that spreads, fades and dies.
  const puff = new PIXI.Graphics().ellipse(0, 0, SIZE * 0.5, 11).fill({ color: 0xf59e0b });
  puff.position.set(i * (SIZE + GAP) + SIZE / 2, TOTAL_H + 4);
  puff.alpha = 0.9;
  puff.scale.set(0.4, 0.5);
  fxLayer.addChild(puff);
  gsap.to(puff, { alpha: 0, duration: 0.5, ease: 'power2.out' });
  gsap.to(puff.scale, {
    x: last ? 2.2 : 1.6, y: 1.3, duration: 0.5, ease: 'power2.out',
    onComplete: () => puff.destroy(),
  });
  // No return: instant. `return gsap.to(...)` would make the bounce wait.
};

reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 240, bounceDistance: 30, bounceDuration: 420 })
  .phases((f) => f.register('stop', StopPhase, {
    steps: (steps) => insertAfter(steps, 'land', step('impact', impact)),
  }))
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
reelSet.addChild(fxLayer);

const hud = new PIXI.Text({
  text: 'spin: each landing kicks the set and puffs dust, the last reel harder',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 14);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    unwatch();
    gsap.killTweensOf(reelSet.pivot);
    reelSet.pivot.set(0, 0);
    for (const puff of [...fxLayer.children]) gsap.killTweensOf(puff.scale);
    try { fxLayer.destroy({ children: true }); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSkip: () => reelSet.requestSkip({ mode: 'quicken' }),
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
