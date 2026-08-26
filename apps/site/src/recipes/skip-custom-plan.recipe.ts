// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// YOUR OWN RELEASE PLAN. `protect: 'always'` + `slamStop({ reels })`.
//
// The built-in modes cover the two common shapes: `'once'` ends the tease on
// the second press, `'stepwise'` walks it one reel per press. Anything else -
// release in pairs, outside-in, the highest-paying reel last - is a plan that
// belongs in game code, and the engine already has the lever for it.
//
// `'always'` is what makes it safe: it guarantees no player press can end a
// tease behind your back, so the queue below is the ONLY thing that releases
// tease reels. Without it, a press would race your plan.
//
// Here the three teasing reels come down in two beats instead of three.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
const PLAN = [[4, 3], [2]]; // outside in, then the one nearest the scatters
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
    r.register(SCAT, CardSymbol, { color: 0xffcc44, label: 'F', textColor: 0x3a2600 });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1600 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const antSheet = await PIXI.Assets.load('/hw-sprites/anticipation.json');
const antFrames = (pre) => Object.entries(antSheet.textures)
  .filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
const ANT_IN = antFrames('in/'), ANT_LOOP = antFrames('loop/');
const glowLayer = new PIXI.Container();
reelSet.addChild(glowLayer);
const glows = new Map();
const stopGlow = (i) => { const g = glows.get(i); if (g) { try { g.destroy(); } catch {} glows.delete(i); } };
const startGlow = (i) => {
  stopGlow(i);
  const g = new PIXI.AnimatedSprite(ANT_IN.length ? ANT_IN : ANT_LOOP);
  g.anchor.set(0.5);
  g.position.set(i * (SIZE + GAP) + SIZE / 2, TOTAL_H / 2);
  g.width = g.height = SIZE * 2.0;
  g.blendMode = 'add';
  g.animationSpeed = 0.5; g.loop = false;
  g.onComplete = () => { if (ANT_LOOP.length) { g.textures = ANT_LOOP; g.loop = true; g.play(); } };
  glowLayer.addChild(g); g.play();
  glows.set(i, g);
};
reelSet.events.on('anticipation:reel', ({ reelIndex }) => startGlow(reelIndex));
reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => stopGlow(reelIndex));

const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: 'monospace', fontSize: 13, fill: 0xffcc44 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

let queue = [];
let press = 0;
const idle = 'spin, then tap: rest of board -> reels 4+3 -> reel 2';
hud.text = idle;

reelSet.events.on('spin:start', () => {
  queue = PLAN.map((g) => [...g]);
  press = 0;
  hud.text = idle;
});
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  hud.text = `press ${press}: landed [${reels.join(', ')}]${partial ? '' : ' - round over'}`;
});

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy(); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSkip: () => {
    press += 1;
    if (press === 1) {
      // Press 1 is the engine's own group: everything outside the tease.
      // `'always'` stops it reaching any further.
      try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); }
      return;
    }
    const group = queue.shift();
    if (group) reelSet.slamStop({ reels: group });
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 250, protect: 'always' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
