// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, app
//
// THE GAS PEDAL: `motionModel('drive')`.
//
// Every recipe above still shapes the tease with an EASE. An ease can only
// shape the one transition it was written for, and an ease on a speed value
// still steps the acceleration at the moment it starts.
//
// The drive model bounds acceleration instead. Phases stop tweening
// `reel.speed` and start assigning `reel.targetSpeed`; `Reel.update` walks the
// speed toward that target, never faster than `accel` (speeding up) or `decel`
// (slowing down) allow. That is the physical model - the reel can only change
// speed so fast, whatever it is asked for - and EVERY transition inherits it,
// including ones nobody authored.
//
// Add `jerk` and the acceleration itself ramps: the pedal goes down over time
// rather than being stamped. The drive starts easing off early enough to arrive
// without overshooting.
//
// The bounds are PROFILE-RELATIVE: `accelFrames: 20` means "reach whatever the
// active profile calls full speed in 20 frames", so a Turbo accelerates harder
// than a Normal instead of taking proportionally longer.
//
// Opt-in per set, at build time only. The default `'tween'` model is unchanged,
// and there is no runtime toggle - handing `reel.speed` to a second owner while
// a phase is mid-tween is exactly the failure this avoids.
//
// Two moments stay instant on purpose: LANDING halts the drive dead so the reel
// can snap to grid and bounce, and a SKIP press means now. Both are identical
// in the tween model, so neither is the drive's to smooth.

const IDS = ['9', '10', 'J', 'Q', 'K'];
const SCAT = 'SCAT';
const REELS = 5, ROWS = 3, SIZE = 78, GAP = 4;
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
  .motionModel('drive', {
    // Roughly 20 frames from rest to full speed.
    accelFrames: 20,
    // Slower coming down than going up: the reel leans into its stops.
    decelFrames: 34,
    // The S-curve. Comment this line out to feel the difference - without it
    // the acceleration still steps to its bound, it just cannot exceed it.
    jerkFrames: 260,
  })
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 900, stopDelay: 120 })
  .ticker(app.ticker)
  .build();

const H = ROWS * SIZE + (ROWS - 1) * GAP;
const W = REELS * SIZE + (REELS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'press spin - trace is reel 4 speed, no ease anywhere',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

// Speed AND acceleration, so the bounded second derivative is visible rather
// than merely asserted.
//
// Both panels are drawn ONCE, at setup. The recipe runner scales and centres
// the reel set to fit the frame and it measures bounds at setup time, so a
// Graphics that is still empty then contributes nothing: the fit gets solved
// for the reels alone and the chart spills out of the frame when it finally
// draws. Reserving the boxes up front is what makes the runner scale the reels
// and the charts together.
const LANE_H = 46;
const LANE_GAP = 8;
const SPEED_TOP = H + 28;
const ACCEL_TOP = SPEED_TOP + LANE_H + LANE_GAP;
const SPAN = 260;
const V_MAX = 2;
// Acceleration is a per-frame delta of a 0..1 value, so it is tiny. This is the
// magnification that puts the drive's plateau on screen at a readable height.
const A_MAX = 0.06;

const panels = new PIXI.Graphics();
panels.roundRect(0, SPEED_TOP, W, LANE_H, 6).fill({ color: 0x171310 });
panels.roundRect(0, ACCEL_TOP, W, LANE_H, 6).fill({ color: 0x171310 });
// 1x spin speed on the speed lane, and zero acceleration on the accel lane.
const oneY = SPEED_TOP + LANE_H - (1 / V_MAX) * LANE_H;
const zeroY = ACCEL_TOP + LANE_H / 2;
panels.moveTo(0, oneY).lineTo(W, oneY).stroke({ width: 1, color: 0x5c5147 });
panels.moveTo(0, zeroY).lineTo(W, zeroY).stroke({ width: 1, color: 0x5c5147 });
panels.roundRect(0, SPEED_TOP, W, LANE_H, 6).stroke({ width: 1, color: 0x332c26 });
panels.roundRect(0, ACCEL_TOP, W, LANE_H, 6).stroke({ width: 1, color: 0x332c26 });
reelSet.addChild(panels);

const labels = [];
for (const [text, y, fill] of [
  ['speed 1x', oneY - 6, 0x6ad0ff],
  ['accel 0', zeroY - 6, 0xf0a06a],
]) {
  const t = new PIXI.Text({
    text,
    style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 9, fill },
  });
  // INSIDE the panel: a label hanging off the right edge widens the composition
  // past the reels, and the runner's fit centres on total bounds, which would
  // push the board visibly off-centre.
  t.position.set(W - 56, y - 6);
  reelSet.addChild(t);
  labels.push(t);
}

const trace = new PIXI.Graphics();
reelSet.addChild(trace);

let speeds = [];
let accels = [];
let lastSpeed = 0;

// Clamped, so a stray sample can never grow the bounds the fit was solved for.
const speedY = (v) => SPEED_TOP + LANE_H - Math.max(0, Math.min(1, v / V_MAX)) * LANE_H;
const accelY = (a) => zeroY - Math.max(-1, Math.min(1, a / A_MAX)) * (LANE_H / 2);

const tick = () => {
  const v = reelSet.reels[4].speedNormalized;
  speeds.push(v);
  accels.push(v - lastSpeed);
  lastSpeed = v;
  if (speeds.length > SPAN) { speeds.shift(); accels.shift(); }
  if (speeds.length < 2) return;

  trace.clear();
  const plot = (series, y, color) => {
    trace.moveTo(0, y(series[0]));
    for (let i = 1; i < series.length; i++) trace.lineTo((i / SPAN) * W, y(series[i]));
    trace.stroke({ width: 2, color });
  };
  plot(speeds, speedY, 0x6ad0ff);
  // A tween model spikes here at the start of every transition. A drive shows a
  // plateau, and with `jerk` set, a trapezoid: the acceleration ramps too.
  plot(accels, accelY, 0xf0a06a);
};
app.ticker.add(tick);

return {
  reelSet,
  cleanup: () => {
    app.ticker.remove(tick);
    try { trace.destroy(); } catch {}
    try { panels.destroy(); } catch {}
    for (const t of labels) { try { t.destroy(); } catch {} }
    try { hud.destroy(); } catch {}
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;
    speeds = []; accels = []; lastSpeed = 0;
    hud.text = 'blue = speed, orange = acceleration (bounded, ramped by jerk)';

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 420));
    reelSet.setResult(grid);
    // Under a drive the segment `duration` is the leg's time BUDGET, not a
    // tween length: the bounds decide how fast the reel can actually get there.
    reelSet.setAnticipation(TEASE, {
      stagger: 240,
      curve: [
        { speed: 1.7, duration: 260 },
        { speed: 0.1, duration: 520, hold: 260 },
      ],
    });
    await p;
    hud.text = 'landed. blue = speed, orange = acceleration';
  },
};
