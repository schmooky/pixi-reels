// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// GROUPS: REELS THAT STOP AND SKIP TOGETHER.
//
//   reels 1-2  land together
//   reels 3-4  tease, one press each
//   reel  5    keeps spinning until both teases are over
//
// Index order cannot say that: reel 5 is index 4, so its stop delay comes due
// while 3-4 are still teasing. The coloured bars are the groups.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 78, GAP = 4;
const GROUPS = [[0, 1], [2, 3], [4]];
const TEASE = [2, 3];
const COLORS = [0x6ad0ff, 0xffcc44, 0xb388ff];
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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1500, stopDelay: 150 })
  .ticker(app.ticker)
  .build();

// Sticky: set once, every later spin honours it. Also legal any time up to
// `setResult()`, which is what lets a round be grouped from its own response.
reelSet.setReelGroups(GROUPS);

const H = ROWS * SIZE + (ROWS - 1) * GAP;

// Drawn once at setup: the runner measures bounds then to fit the board, so
// anything added later would spill outside the frame.
const bars = new PIXI.Graphics();
GROUPS.forEach((group, g) => {
  for (const i of group) {
    bars.roundRect(i * (SIZE + GAP), H + 6, SIZE, 5, 2).fill({ color: COLORS[g] });
  }
});
reelSet.addChild(bars);

const hud = new PIXI.Text({
  text: 'press spin, then keep pressing',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 19);
reelSet.addChild(hud);

let order = [];
let press = 0;
reelSet.events.on('spin:reelLanded', (i) => order.push(i + 1));
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  press += 1;
  const named = reels.map((i) => i + 1).join(', ');
  hud.text = partial
    ? `press ${press}: [${named}] - press again`
    : `press ${press}: [${named}] - round over`;
});

return {
  reelSet,
  cleanup: () => {
    try { bars.destroy(); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    order = [];
    press = 0;
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    // BEFORE setResult. A press during the server-wait window queues via
    // `requestSkip`, and `setResult` fires it - so a tease declared afterwards
    // is not there to protect, and an early press walks every group at once.
    reelSet.setAnticipation(TEASE, { stagger: 'sequential', protect: 'stepwise' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;

    hud.text = `landed ${order.join(' -> ')}`;
  },
};
