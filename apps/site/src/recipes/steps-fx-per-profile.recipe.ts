// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, StopPhase, PhaseCardSymbol,
//                   step, insertBefore, insertAfter, PIXI, gsap, app
//
// FX AND BEATS THAT FOLLOW THE SPEED MODE, through the profile.
//
// `ctx.profile` is the profile instance the game registered under the active
// speed name, custom fields included. So a step never asks "is this turbo";
// it reads what the profile says, and the profile says it per mode:
//
//   breathMs   an extra beat before the spin-out   normal 140   turbo 0
//   landGlow   the backlight after land            normal on    turbo off
//   the glow's fade rides `bounceDuration`, so it shortens with the bounce
//
// Two steps on StopPhase: `breath` before `spinOut` (a wait, so `cut`), and
// `glow` after `land` (an effect, not awaited). Tap the readout to switch
// `setSpeed('normal' | 'turbo')`. A quicken press that names a speed swaps
// the profile the same way, so `requestSkip({ mode: 'quicken', speed:
// 'turbo' })` lands with turbo's beats and turbo's FX.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const PROFILES = {
  normal: { ...SpeedPresets.NORMAL, stopDelay: 200, breathMs: 140, landGlow: true },
  turbo: { ...SpeedPresets.TURBO, stopDelay: 60, breathMs: 0, landGlow: false },
};

const plates = [];
const breath = (ctx) => (ctx.profile.breathMs > 0 ? ctx.wait(ctx.profile.breathMs) : undefined);
const glow = (ctx) => {
  if (!ctx.profile.landGlow) return;
  const g = plates[ctx.reel.reelIndex];
  gsap.killTweensOf(g);
  g.alpha = 0.9;
  gsap.to(g, { alpha: 0, duration: ctx.profile.bounceDuration / 1000, ease: 'power2.out' });
};

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
  })
  .speed('normal', PROFILES.normal)
  .speed('turbo', PROFILES.turbo)
  .phases((f) => f.register('stop', StopPhase, {
    steps: (steps) => insertAfter(
      insertBefore(steps, 'spinOut', step('breath', breath, { cut: true })),
      'land',
      step('glow', glow),
    ),
  }))
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);

// One backlight plate per reel, under the symbols, lit by `glow`.
const plateLayer = new PIXI.Container();
reelSet.addChildAt(plateLayer, 0);
for (let i = 0; i < REELS; i++) {
  const g = new PIXI.Graphics().rect(i * (SIZE + GAP) - 10, -10, SIZE + 20, TOTAL_H + 20).fill({ color: 0x60a5fa });
  g.alpha = 0;
  plateLayer.addChild(g);
  plates.push(g);
}

let current = 'normal';
const label = () => {
  const p = PROFILES[current];
  return `speed ${current}: breath ${p.breathMs} ms, glow ${p.landGlow ? `on, fades over ${p.bounceDuration} ms` : 'off'}. tap to switch`;
};
const hud = new PIXI.Text({
  text: label(),
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
hud.eventMode = 'static';
hud.cursor = 'pointer';
hud.on('pointertap', () => reelSet.setSpeed(current === 'normal' ? 'turbo' : 'normal'));
reelSet.events.on('speed:changed', (profile) => {
  current = profile.name;
  hud.text = label();
});
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => {
    unwatch();
    for (const g of plates) gsap.killTweensOf(g);
    try { plateLayer.destroy({ children: true }); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSkip: () => reelSet.requestSkip({ mode: 'quicken', speed: 'turbo' }),
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
