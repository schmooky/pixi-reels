// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// NAME THE REELS THAT LAND. `slamStop({ reels })` is the complement of
// `{ except }`: pass the reels to land instead of the reels to spare.
//
// Same lever, two spellings. Reach for `reels` when the landing set is the
// short one or comes from game state (a held-reel list, a win line, the reels
// a feature has already resolved); reach for `except` when the SPARED set is
// the short one. Out-of-range indices are ignored, and held or already-landed
// reels are never slammed, so neither form needs guarding.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
// Outside in: a press lands the two edges, the next lands the pair inside
// them, the last lands the middle.
const PLAN = [[0, 4], [1, 3], [2]];
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  // Long stagger and a high floor so nothing lands on its own mid-plan.
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 900, minimumSpinTime: 4000 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: 'monospace', fontSize: 13, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

let queue = [];
const idle = 'spin, then keep tapping: edges -> inner pair -> middle';
hud.text = idle;

reelSet.events.on('spin:start', () => { queue = PLAN.map((g) => [...g]); hud.text = idle; });
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  hud.text = `landed [${reels.join(', ')}]${partial ? ' - tap for the next group' : ' - round over'}`;
});

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  // No protection involved and no tease: this is the raw per-reel lever
  // driving a plan that lives entirely in game code.
  onSkip: () => {
    const group = queue.shift();
    if (group) reelSet.slamStop({ reels: group });
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
