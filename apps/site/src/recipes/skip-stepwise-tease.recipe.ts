// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// WALK THE TEASE FORWARD, ONE REEL PER PRESS. `protect: 'stepwise'`.
//
//   press 1 - every reel outside the tease lands, so the two scatters are on
//             screen and reels 2-4 are visibly teasing
//   press 2 - reel 2 lands. reels 3-4 keep teasing
//   press 3 - reel 3 lands
//   press 4 - reel 4 lands. that press ends the round
//
// The player chooses the pace: mash it to get through, or stop pressing and
// let the tease play out on its own. Either way the tension is never hidden.
//
// `'once'` (see "A tease a press cannot hide") ends the whole tease on press
// 2 instead. `'stepwise'` is the same rule applied per reel.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
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
  // A long hold per reel, so there is room to press through it.
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1600 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// Hold & Win anticipation glow on each teasing reel.
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
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0xffcc44 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

let press = 0;
const idle = 'press spin, then keep pressing to walk the tease forward';
hud.text = idle;

// One press, one group. `partial: false` marks the press that ended the round.
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  press += 1;
  hud.text = partial
    ? `press ${press}: landed [${reels.join(', ')}] - press again for the next reel`
    : `press ${press}: landed [${reels.join(', ')}] - round over`;
});
reelSet.events.on('spin:start', () => { press = 0; hud.text = idle; });

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy(); } catch {}
    try { hud.destroy(); } catch {}
  },
  // Every press goes through the same call. The engine decides which group
  // this one lands, from `protect`.
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 'sequential', protect: 'stepwise' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
