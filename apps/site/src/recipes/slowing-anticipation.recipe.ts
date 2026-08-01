// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// SLOWING anticipation. Each teasing reel decelerates DEEPER than the last
// (0.5x -> 0.1x spin speed) and holds longer, then crawls onto its landing
// frame at that slow speed. no snap-back to full speed for the stop.
//
// Each teasing reel wears the Hold & Win anticipation glow (the `in`→`loop`
// additive sprite burst), driven off the anticipation:reel / reelEnd events.

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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 500 })
  .ticker(app.ticker)
  .build();

// ── Hold & Win anticipation glow, reused over each teasing reel ──
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
  g.width = g.height = SIZE * 2.0; // concentrated burst, like the H&W cell glow
  g.blendMode = 'add';
  g.animationSpeed = 0.5; g.loop = false;
  g.onComplete = () => { if (ANT_LOOP.length) { g.textures = ANT_LOOP; g.loop = true; g.play(); } };
  glowLayer.addChild(g); g.play();
  glows.set(i, g);
};

// The dedicated anticipation events fire ONLY for teasing reels, so no manual
// gating is needed. `order` / `total` are here too if you want a pitch ramp.
reelSet.events.on('anticipation:reel', ({ reelIndex }) => startGlow(reelIndex));
reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => stopGlow(reelIndex));
reelSet.events.on('spin:complete', () => { for (const i of [...glows.keys()]) stopGlow(i); });

return {
  reelSet,
  cleanup: () => { for (const i of [...glows.keys()]) stopGlow(i); try { glowLayer.destroy(); } catch {} },
  onSpin: async () => {
    const grid = [
      { visible: [rv(), SCAT, rv()] },
      { visible: [rv(), SCAT, rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
      { visible: [rv(), rv(), rv()] },
    ];

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid);
    // Progressive slow-down: later reels crawl slower AND hold longer, then
    // stop exactly where they slowed to.
    reelSet.setAnticipation(TEASE, {
      stagger: 300,
      slowdown: { from: 0.5, to: 0.1, holdTo: 1.6 },
    });
    await p;
  },
};
