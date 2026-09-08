// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, SpineReelSymbol,
//                   StaticSpinSymbol, SpinTextureCache, prewarmSpinTextures,
//                   loadSpineSet, PIXI, app, pickWeighted
//
// WHAT PLAYS ON LANDING, AND WHERE - decided by the symbol.
//
// `autoPlayLanding` takes a rule of the landing context. Reels 0-1 land as
// usual (`land`); reels 2-3 are the copy reels, where a takeover is about to
// replace the symbols, so the skeleton plays NOTHING - no landing pose to
// fight with; reels 4-5 play `revealWin` as their landing beat instead. One
// symbol class, one option, no per-reel subclasses and no listener that
// re-sets the track after the engine set it. The log under the grid prints
// what the rule chose, the frame each reel lands (`spin:reelLanding`).

const thunderkick = await loadSpineSet("thunderkick");

const SPINE_SCALE = 0.6;
const CELL_W = 175 * SPINE_SCALE;
const CELL_H = 203 * SPINE_SCALE;
const ROWS_PER_REEL = [3, 4, 4, 4, 4, 3];
const COPY = new Set([2, 3]);

const spineMap = thunderkick.spineMap;
const weights = {
  low1: 16, low2: 16, low3: 14, low4: 14, low5: 12,
  mid1: 9, mid2: 8, mid3: 7, mid4: 6, high: 4,
};

// The rule. `true` = the configured landing, `false` = nothing, a string =
// that animation as this landing's one-shot.
const landingRule = ({ reelIndex }) =>
  COPY.has(reelIndex) ? false : reelIndex >= 4 ? 'revealWin' : true;

const cache = new SpinTextureCache({ renderer: app.renderer });
const createInner = () =>
  new SpineReelSymbol({
    spineMap,
    scale: SPINE_SCALE,
    landingAnimation: 'land',
    autoPlayLanding: landingRule,
  });

prewarmSpinTextures({
  cache,
  ids: Object.keys(weights),
  createSymbol: createInner,
  width: CELL_W,
  height: CELL_H,
});

const reelSet = new ReelSetBuilder()
  .reels(6)
  .visibleCellsPerReel(ROWS_PER_REEL)
  .reelAnchor('center')
  .symbolSize(CELL_W, CELL_H)
  .symbolGap(0, 0)
  .symbols((r) => {
    for (const id of Object.keys(weights)) {
      r.register(id, StaticSpinSymbol, { createInner, cache, blurRampMs: 160 });
    }
  })
  .weights(weights)
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 180 })
  .speed('turbo', { ...SpeedPresets.TURBO, stopDelay: 60 })
  .ticker(app.ticker)
  .build();

// What the rule chose, per reel, printed the frame the reel lands.
const lines = Array.from({ length: 6 }, (_, i) => `reel ${i}: -`);
const hud = new PIXI.Text({
  text: '',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78, lineHeight: 15 },
});
hud.position.set(0, 4 * CELL_H + 6);
reelSet.addChild(hud);
const redraw = () => { hud.text = lines.join('\n'); };
redraw();
const choice = (reel) => {
  const d = landingRule({ reelIndex: reel, reelCount: 6, cell: 0, visibleCells: ROWS_PER_REEL[reel], symbolId: '' });
  return d === true ? 'land' : d === false ? 'nothing (takeover)' : `'${d}'`;
};
const onLanding = (reel) => {
  lines[reel] = `reel ${reel}: landing frame - rule says ${choice(reel)}`;
  redraw();
};
reelSet.events.on('spin:reelLanding', onLanding);

return {
  reelSet,
  cleanup: () => {
    reelSet.events.off('spin:reelLanding', onLanding);
    try { hud.destroy(); } catch {}
  },
  nextResult: () => {
    for (let i = 0; i < 6; i++) lines[i] = `reel ${i}: spinning`;
    redraw();
    return ROWS_PER_REEL.map((cells) => Array.from({ length: cells }, () => pickWeighted(weights)));
  },
};
