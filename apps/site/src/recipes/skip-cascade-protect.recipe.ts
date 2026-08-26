// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// SKIP GRANULARITY IN A TUMBLE CASCADE.
//
// Anticipation runs BEFORE the tumble/standard split in the phase chain, so a
// cascade spin teases and protects exactly like a strip spin. What differs is
// what a press costs and what it carries:
//
//   initial spin - `protect` applies. Press 1 lands the reels outside the
//                  tease, press 2 ends it, same as anywhere else
//   the round    - in cascade mode the round's side effect is
//                  auto-slam-refills, not a speed boost. A protected press
//                  does NOT spend it; the press that ends the tease does, and
//                  from then on every refill lands instantly
//   refills      - carry no tease at all. `refill()` clears the anticipation
//                  set on entry, so a press inside one is an ordinary full
//                  slam. `slamStop({ reels })` still works per reel there
//
// Tap through a round to feel the shape: two presses to get past the tease,
// after which the whole cascade fast-forwards.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 76, GAP = 4;
const TEASE = [3, 4];
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

// The symbol the scripted match is built from.
const WIN_ID = 'K';

// Winners are DERIVED, not hard-coded: the leading run of identical symbols
// along the top row, three or more adjacent reels, which is the classic
// left-to-right rule. The demo used to clear a fixed `[0, 2, 4]` twice a
// round, so three unrelated symbols vanished on a board where nothing
// matched - it read as a glitch rather than as a cascade.
function topRowRun(grid) {
  const id = grid[0][0];
  let n = 1;
  while (n < grid.length && grid[n][0] === id) n += 1;
  return n >= 3 ? { id, reels: Array.from({ length: n }, (_, i) => i) } : null;
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
    r.register(SCAT, CardSymbol, { color: 0xffcc44, label: 'F', textColor: 0x3a2600 });
  })
  .tumble({
    fall: { duration: 300, ease: 'power3.in', cellStagger: 60 },
    dropIn: { duration: 480, ease: 'power2.out', cellStagger: 60, distance: 'perHole' },
  })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1300, stopDelay: 120 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

const glowLayer = new PIXI.Container();
reelSet.addChildAt(glowLayer, 0);
const glows = new Map();
const stopGlow = (i) => {
  const g = glows.get(i);
  if (!g) return;
  gsap.killTweensOf(g);
  try { g.destroy(); } catch {}
  glows.delete(i);
};
const startGlow = (i) => {
  stopGlow(i);
  const g = new PIXI.Graphics()
    .roundRect(i * (SIZE + GAP) - 6, -6, SIZE + 12, TOTAL_H + 12, 8)
    .fill({ color: 0xfef08a });
  g.alpha = 0.14;
  glowLayer.addChild(g);
  gsap.to(g, { alpha: 0.42, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
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

let stage = 'spin';
const idle = 'spin, then tap through: tease first, then the cascade';
hud.text = idle;
reelSet.events.on('spin:start', () => { hud.text = idle; });
reelSet.events.on('skip:requested', ({ reels, partial }) => {
  hud.text = `${stage}: landed [${reels.join(', ')}]` +
    (partial ? `  (skipStage ${reelSet.skipStage}, tease held)` : `  (skipStage ${reelSet.skipStage})`);
});

return {
  reelSet,
  cleanup: () => {
    for (const i of [...glows.keys()]) stopGlow(i);
    try { glowLayer.destroy({ children: true }); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    stage = 'spin';
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;
    // A real 3-of-a-kind across reels 0-2, so the cascade below has something
    // it can honestly clear.
    for (const reel of [0, 1, 2]) grid[reel].visible[0] = WIN_ID;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 300, protect: 'once' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;

    // Cascade until the board stops matching. Once the round-ending press has
    // landed, the engine auto-slams each refill with no animation at all -
    // that is the cascade form of the round side effect a protected press
    // deferred.
    //
    // The grid and the winners have to agree: the engine animates the grid it
    // is given and never reorders it, so a column whose contents changed
    // without a matching `winners` entry has no hole to fill and lands
    // mispositioned. Only the winning cells change.
    for (let chain = 1; chain <= 2; chain += 1) {
      const current = reelSet.getVisibleGrid();
      const win = topRowRun(current);
      if (!win) break;

      stage = `refill ${chain}`;
      await new Promise((r) => setTimeout(r, 220));

      // Chain 1 refills every winning reel with the SAME symbol on purpose, so
      // the second cascade happens for the reason a real one would - the refill
      // landed another match - rather than because a loop counter said so.
      //
      // The last chain must do the opposite and refill per reel, or the board
      // ends showing a run it never cleared. Re-roll until the first two
      // differ, which is what `topRowRun` reads.
      const fresh = new Map();
      if (chain === 1) {
        for (const reel of win.reels) fresh.set(reel, WIN_ID);
      } else {
        for (const reel of win.reels) fresh.set(reel, rv());
        while (fresh.get(win.reels[0]) === fresh.get(win.reels[1])) {
          fresh.set(win.reels[0], rv());
        }
      }
      // Downward gravity: survivors pack toward the bottom, the fresh symbol
      // enters at the top. So `[fresh, ...survivors]` per cleared column.
      const next = current.map((col, reel) => ({
        visible: fresh.has(reel) ? [fresh.get(reel), col[1], col[2]] : [...col],
      }));
      await reelSet.refill({
        grid: next,
        winners: win.reels.map((reel) => ({ reel, cell: 0 })),
      });
    }
    hud.text = 'round over - refills after the round-ending press are instant';
  },
};
