// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   anticipationForScatters, PIXI, app
//
// SCATTER-DRIVEN anticipation. Let the result grid decide which reels tease.
// Alternates each spin between the two modes so you can feel the difference:
//   - all-remaining: 4 scatters (reels 0,1,3,4) -> reels 2,3,4 ALL tease,
//     even the empty reel 2.
//   - scatter-only:  3 scatters (reels 0,1,3)   -> only reel 3 teases;
//     reels 2 and 4 stop normally (no pointless slow-down).
//
// Each teasing reel wears the Hold & Win anticipation glow (the `in`→`loop`
// additive sprite burst), driven off the anticipation:reel / reelEnd events.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 500 })
  .ticker(app.ticker)
  .build();

// ── Hold & Win anticipation glow, reused over each teasing reel ──
const antSheet = await PIXI.Assets.load('/hw-sprites/anticipation.json');
const antFrames = (pre) => Object.entries(antSheet.textures)
  .filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
const ANT_IN = antFrames('in/'), ANT_LOOP = antFrames('loop/');
const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

let teaseReels = []; // updated per spin from anticipationForScatters
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

// The dedicated anticipation events fire ONLY for teasing reels, so the glow
// needs no per-reel gate even though the tease set changes each spin.
reelSet.events.on('anticipation:reel', ({ reelIndex }) => startGlow(reelIndex));
reelSet.events.on('anticipation:reelEnd', ({ reelIndex }) => stopGlow(reelIndex));
reelSet.events.on('spin:complete', () => { for (const i of [...glows.keys()]) stopGlow(i); });

let spinCount = 0;

return {
  reelSet,
  cleanup: () => { for (const i of [...glows.keys()]) stopGlow(i); try { glowLayer.destroy(); } catch {} },
  onSpin: async () => {
    spinCount++;
    // Odd spins: 4 scatters + all-remaining. Even spins: 3 scatters + scatter-only.
    const allRemaining = spinCount % 2 === 1;
    const scatterReels = allRemaining ? [0, 1, 3, 4] : [0, 1, 3];
    const mode = allRemaining ? 'all-remaining' : 'scatter-only';

    const grid = Array.from({ length: REELS }, (_, c) => ({
      visible: [rv(), scatterReels.includes(c) ? SCAT : rv(), rv()],
    }));

    // Derive the tease reels straight from the grid.
    teaseReels = anticipationForScatters(grid, { symbol: SCAT, trigger: 2, mode });

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 220));
    reelSet.setResult(grid);
    reelSet.setAnticipation(teaseReels, { stagger: 'sequential', slowdown: { from: 0.5, to: 0.12 } });
    await p;
  },
};
