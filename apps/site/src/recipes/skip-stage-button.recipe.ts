// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, app,
//                   DebugPlaque
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
// 150 wide whatever the label says, so it never resizes between stages.
const face = new DebugPlaque({
  text: LABELS[0],
  color: 0xfef08a,
  fill: 0x2a2622,
  fillAlpha: 1,
  radius: 6,
  padding: [12, 8],
  minWidth: 150,
});
face.position.set(0, TOTAL_H + 12);
reelSet.addChild(face);
// The raw number beside it, centred on the face.
const stageText = new DebugPlaque({ text: 'skipStage = 0', anchor: { x: 0, y: 0.5 } });
stageText.position.set(face.plateWidth + 12, face.y + face.plateHeight / 2);
reelSet.addChild(stageText);

// Read the stage every frame. no press counting, no local mirror of it. The
// face itself says which stage it shows, so the plaques only lay out again
// when that goes stale.
const tick = () => {
  const stage = reelSet.skipStage;
  if (face.text === LABELS[stage]) return;
  // Stage 2 is spent: the face dims, the way a disabled button would.
  face.update({
    text: LABELS[stage],
    fillAlpha: stage === 2 ? 0.35 : 1,
    color: stage === 2 ? 0xa8a29e : 0xfef08a,
  });
  stageText.text = `skipStage = ${stage}`;
};
app.ticker.add(tick);

return {
  reelSet,
  cleanup: () => {
    app.ticker.remove(tick);
    try { face.destroy({ children: true }); } catch {}
    try { stageText.destroy({ children: true }); } catch {}
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
