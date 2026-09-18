// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, PhaseCardSymbol, CardSymbol, PIXI, gsap, app
//
// QUICKEN WITH GROUPS. The same barrier, a different mode.
//
//   reels 1-2  land together
//   reels 3-4  tease, one press each
//   reel  5    keeps spinning until both teases are over
//
// `requestSkip({ mode: 'quicken' })` walks exactly the groups a slam would and
// quickens each one instead of placing it: press 1 frees reels 1-2, press 2
// ends reel 3's tease, press 3 reel 4's, press 4 frees reel 5. The cards are
// PhaseCardSymbol, so the difference is on screen: blue is spin, amber is
// the tease, violet is the stop spinning the frame in.
//
//   - a freed group goes violet, not straight to grey. It lands; it is not placed
//   - the barrier holds. Reel 5 stays blue until reel 4 is down, however fast
//     you press. A quickened reel counts as released for the WALK, so press 4
//     is taken early; the reel itself still waits its turn

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 78, GAP = 4;
const GROUPS = [[0, 1], [2, 3], [4]];
const TEASE = [2, 3];
const COLORS = [0x6ad0ff, 0xffcc44, 0xb388ff];
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
    // The scatter keeps its own colour, so the trigger reads through the phases.
    r.register(SCAT, CardSymbol, { color: 0xffcc44, label: 'F', textColor: 0x3a2600 });
  })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1500, stopDelay: 150, bounceDuration: 450 })
  .ticker(app.ticker)
  .build();

const unwatch = PhaseCardSymbol.watch(reelSet.reels);
reelSet.setReelGroups(GROUPS);

const H = ROWS * SIZE + (ROWS - 1) * GAP;

// Group bars under the reels, drawn once at setup.
const bars = new PIXI.Graphics();
GROUPS.forEach((group, g) => {
  for (const i of group) bars.roundRect(i * (SIZE + GAP), H + 6, SIZE, 5, 2).fill({ color: COLORS[g] });
});
reelSet.addChild(bars);

const hud = new PIXI.Text({
  text: 'press spin, then keep pressing: each press quickens the next group',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 19);
reelSet.addChild(hud);

let press = 0;
let order = [];
reelSet.events.on('spin:start', () => {
  press = 0;
  order = [];
  hud.text = 'press spin, then keep pressing: each press quickens the next group';
});
reelSet.events.on('skip:requested', ({ reels, mode }) => {
  press += 1;
  hud.text = `press ${press}: ${mode === 'quicken' ? 'quickened' : 'slammed'} [${reels.map((i) => i + 1).join(', ')}]`;
});
reelSet.events.on('spin:reelLanded', (i) => {
  order.push(i + 1);
  hud.text = `${hud.text.split('\n')[0]}\nlanded so far: ${order.join(' ')}`;
});

return {
  reelSet,
  cleanup: () => {
    unwatch();
    try { bars.destroy(); } catch {}
    try { hud.destroy(); } catch {}
  },
  // Every press goes through the same call. The engine decides which group
  // this one frees; the group lands through its stop.
  onSkip: () => reelSet.requestSkip({ mode: 'quicken' }),
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
