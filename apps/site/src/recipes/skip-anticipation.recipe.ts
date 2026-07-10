// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// SKIP THE TEASE. A long, dramatic sequential anticipation the player can cut
// short at any point. Press the button again mid-tease and the reels slam onto
// the result immediately. anticipation is skippable, so an impatient player is
// never trapped by the build-up.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleRows(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
    r.register(SCAT, CardSymbol, { color: 0xffcc44, label: 'F', textColor: 0x3a2600 });
  })
  // Long anticipation window so there's plenty of tease to cut through.
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1200 })
  .ticker(app.ticker)
  .build();

// ── Hold & Win anticipation glow, driven off the anticipation events ──
const antSheet = await PIXI.Assets.load('/hw-sprites/anticipation.json');
const antFrames = (pre) => Object.entries(antSheet.textures)
  .filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
const ANT_IN = antFrames('in/'), ANT_LOOP = antFrames('loop/');
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

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
reelSet.events.on('spin:complete', () => { for (const i of [...glows.keys()]) stopGlow(i); });

return {
  reelSet,
  cleanup: () => { for (const i of [...glows.keys()]) stopGlow(i); try { glowLayer.destroy(); } catch {} },
  // The demo runner presses this on a second button tap while spinning. It
  // slams the current drop onto the result and cuts every tease short. Guarded
  // so a tap before setResult() queues instead of throwing.
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = [
      { visible: [rv(), SCAT, rv()] },
      { visible: [rv(), SCAT, rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
    ];

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(grid);
    // A long one-at-a-time crawl. tap the button again to blow through it.
    reelSet.setAnticipation(TEASE, {
      stagger: 'sequential',
      slowdown: { from: 0.4, to: 0.06, holdTo: 1.5 },
    });
    await p;
  },
};
