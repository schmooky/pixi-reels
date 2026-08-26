// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// DRIVING THE BUTTON FROM `skipStage`.
//
//   0 - no press yet this round
//   1 - a press landed the reels around a protected tease and left it running.
//       The button must STAY LIVE: the next press is the one that ends it
//   2 - the round-ending press happened. Further presses just slam
//
// Stage `1` is only reachable on a spin that asked for protection, so a game
// with no protected teases sees the old two-state button and nothing changes.
// The label below is read straight off `reelSet.skipStage` every frame, which
// is exactly what a real HUD should do rather than counting presses itself.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
const TEASE = [2, 3, 4];
const LABELS = ['SKIP', 'SKIP TEASE', 'SKIPPED'];
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
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 1500 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;

// A fake button face, so the stage is visible as a LABEL rather than a number.
const face = new PIXI.Container();
face.position.set(0, TOTAL_H + 12);
const plate = new PIXI.Graphics().roundRect(0, 0, 150, 30, 6).fill({ color: 0x2a2622 });
const label = new PIXI.Text({
  text: LABELS[0],
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fontWeight: '700', fill: 0xfef08a },
});
label.position.set(12, 8);
face.addChild(plate, label);
const stageText = new PIXI.Text({
  text: '',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
stageText.position.set(162, 8);
face.addChild(stageText);
reelSet.addChild(face);

// Read the stage every frame. no press counting, no local mirror of it.
const tick = () => {
  const stage = reelSet.skipStage;
  label.text = LABELS[stage];
  plate.tint = stage === 2 ? 0x555049 : 0xffffff;
  stageText.text = `skipStage = ${stage}`;
};
app.ticker.add(tick);

return {
  reelSet,
  cleanup: () => {
    app.ticker.remove(tick);
    try { face.destroy({ children: true }); } catch {}
  },
  onSkip: () => { try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); } },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    const p = reelSet.spin();
    reelSet.setAnticipation(TEASE, { stagger: 250, protect: 'stepwise' });
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
  },
};
