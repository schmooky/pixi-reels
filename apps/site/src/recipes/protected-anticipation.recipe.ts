// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// PROTECTED TEASE. Same long sequential anticipation as "Skip the tease", but
// the player can no longer skip past it without seeing it.
//
// `protect: 'once'` splits one skip press into two:
//   press 1 - reels 0 and 1 slam onto the two scatters immediately, reels
//             2-4 keep teasing. The player now KNOWS a feature is live and
//             can choose to watch it.
//   press 2 - the tease ends too, exactly like an unprotected skip.
//
// Without it, a press before the tease starts force-completes AnticipationPhase
// on every reel and the whole build-up is invisible. That is also where the
// information leak lives: if a scatterless skip lands instantly but a teasing
// one settles slower, response time alone tells the player what is coming.

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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1200 })
  .ticker(app.ticker)
  .build();

// Hold & Win anticipation glow, driven off the anticipation events.
const antSheet = await PIXI.Assets.load('/hw-sprites/anticipation.json');
const antFrames = (pre) => Object.entries(antSheet.textures)
  .filter(([k]) => k.startsWith(pre)).sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t);
const ANT_IN = antFrames('in/'), ANT_LOOP = antFrames('loop/');
const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;
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

// Read-out of what each press actually did. `skip:requested` now reports which
// reels the slam lands and whether reels are still running after it.
const label = new PIXI.Text({
  text: '',
  style: { fontFamily: 'monospace', fontSize: 13, fill: 0xffcc44 },
});
label.position.set(0, TOTAL_H + 10);
reelSet.addChild(label);

reelSet.events.on('skip:requested', ({ reels, partial }) => {
  label.text = partial
    ? `press 1 - landed [${reels.join(', ')}], tease protected. press again to end it`
    : `press 2 - landed [${reels.join(', ')}], tease over`;
});
reelSet.events.on('spin:start', () => { label.text = ''; });
reelSet.events.on('spin:complete', () => { for (const i of [...glows.keys()]) stopGlow(i); });

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy(); } catch {}
    try { label.destroy(); } catch {}
  },
  // One handler, two outcomes. The engine decides which, from `protect`.
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
    // setAnticipation BEFORE setResult, so a press queued in the pre-result
    // window (requestSkip) already knows there is a tease to protect.
    reelSet.setAnticipation(TEASE, {
      stagger: 'sequential',
      slowdown: { from: 0.4, to: 0.06, holdTo: 1.5 },
      protect: 'once',
    });
    await new Promise((r) => setTimeout(r, 200));
    reelSet.setResult(grid);
    await p;
  },
};
