// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// GROUPS: REELS THAT STOP AND SKIP TOGETHER.
//
// Reel index is the only ordering the engine has on its own. Stop delays are
// one flat `reelIndex * stopDelay` stagger across the board, and a skip press
// lands "everything outside the tease" in one go. That holds while every reel's
// job is the same, and breaks the moment one is different.
//
// The board below is the case that broke it:
//
//   reels 1-2  spin normally and land TOGETHER
//   reels 3-4  tease, one press each (`protect: 'stepwise'`)
//   reel  5    keeps spinning at full speed until both teases are over
//
// There is no way to say that with delays. Reel 5 is index 4, so its stop delay
// comes due WHILE reels 3-4 are still teasing, and it lands in the middle of the
// tease it was supposed to outlast. Every other spin here runs WITHOUT groups so
// you can watch exactly that, back to back.
//
// `setReelGroups([[0, 1], [2, 3], [4]])` says it instead. A group is a barrier
// in both directions:
//
//   stopping - no reel in a group starts its stop sequence, anticipation
//              included, until every reel in the groups before it has LANDED.
//              A reel waiting its turn keeps spinning at FULL SPEED, so the
//              wait reads as "still going" rather than as a pause.
//   skipping - a press releases the next un-landed group, not the whole board.
//              Tease protection still applies inside a group.
//
// So the presses walk:  [1,2] -> 3 -> 4 -> [5].

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 78, GAP = 4;
const GROUPS = [[0, 1], [2, 3], [4]];
const TEASE = [2, 3];
const GROUP_COLORS = [0x6ad0ff, 0xffcc44, 0xb388ff];
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
  // A long hold per tease reel, so there is room to press through it and to see
  // the filler reel outlast it.
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1500, stopDelay: 150 })
  .ticker(app.ticker)
  .build();

const W = REELS * SIZE + (REELS - 1) * GAP;
const H = ROWS * SIZE + (ROWS - 1) * GAP;

// Group bars, drawn ONCE at setup. The recipe runner measures bounds at setup
// to fit the board in the frame, so anything drawn later would spill outside it.
const BAR_TOP = H + 6, BAR_H = 5;
const bars = new PIXI.Graphics();
GROUPS.forEach((group, g) => {
  for (const i of group) {
    bars.roundRect(i * (SIZE + GAP), BAR_TOP, SIZE, BAR_H, 2).fill({ color: GROUP_COLORS[g] });
  }
});
reelSet.addChild(bars);

const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, BAR_TOP + BAR_H + 8);
reelSet.addChild(hud);

// Reserve the second HUD line's height at setup for the same fitting reason.
const detail = new PIXI.Text({
  text: ' ',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0xffcc44 },
});
detail.position.set(0, BAR_TOP + BAR_H + 24);
reelSet.addChild(detail);

// Alternates every spin, so the two orderings are visible back to back rather
// than needing two demos to compare.
let grouped = true;
let order = [];
let press = 0;

const label = () =>
  grouped
    ? 'groups ON: [1,2] [3,4] [5] - reel 5 outlasts the tease'
    : 'groups OFF: one flat stagger - reel 5 lands mid-tease';

const applyGroups = () => {
  // Sticky: set once and every later spin honours it; `null` clears it.
  //
  // Safe to call here, or any time up to `setResult()` - the barrier is read as
  // each reel's SpinPhase resolves, which is exactly when the result lands. That
  // is what lets a round be grouped from its own server response. Changing it
  // after reels have begun landing throws.
  reelSet.setReelGroups(grouped ? GROUPS : null);
  bars.alpha = grouped ? 1 : 0.18;
};
applyGroups();
hud.text = label();

reelSet.events.on('spin:reelLanded', (i) => {
  order.push(i + 1);
  detail.text = `landed: ${order.join(' -> ')}`;
});

// `partial: false` marks the press that ended the round.
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  press += 1;
  const named = reels.map((i) => i + 1).join(', ');
  hud.text = partial
    ? `press ${press}: released [${named}] - press again for the next group`
    : `press ${press}: released [${named}] - round over`;
});

return {
  reelSet,
  cleanup: () => {
    try { bars.destroy(); } catch {}
    try { hud.destroy(); } catch {}
    try { detail.destroy(); } catch {}
  },
  // Every press goes through the same call; the engine decides which group it
  // lands, from the group layout and from `protect`.
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    order = [];
    press = 0;
    detail.text = ' ';
    applyGroups();
    hud.text = label();

    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    reelSet.setAnticipation(TEASE, { stagger: 'sequential', protect: 'stepwise' });
    await p;

    hud.text = `${label()}   |   landed ${order.join(' -> ')}`;
    // Flip for the next press.
    grouped = !grouped;
  },
};
