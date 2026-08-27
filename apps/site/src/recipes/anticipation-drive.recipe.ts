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
// Units are px/frame^2 at 60fps, matching `spinSpeed`'s px/frame. `accel:
// spinSpeed / 20` reaches full speed in roughly 20 frames.
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
const SPIN_SPEED = SpeedPresets.NORMAL.spinSpeed;
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
    accel: SPIN_SPEED / 20,
    // Slower coming down than going up: the reel leans into its stops.
    decel: SPIN_SPEED / 34,
    // The S-curve. Comment this line out to feel the difference - without it
    // the acceleration still steps to its bound, it just cannot exceed it.
    jerk: SPIN_SPEED / 260,
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
const trace = new PIXI.Graphics();
trace.position.set(0, H + 32);
reelSet.addChild(trace);
const TRACE_H = 52, SPAN = 260;
let speeds = [];
let lastSpeed = 0;
let accels = [];

const tick = () => {
  const reel = reelSet.reels[4];
  const v = reel.speedNormalized;
  speeds.push(v);
  accels.push(v - lastSpeed);
  lastSpeed = v;
  if (speeds.length > SPAN) { speeds.shift(); accels.shift(); }

  trace.clear();
  trace.moveTo(0, TRACE_H).lineTo(W, TRACE_H).stroke({ width: 1, color: 0x554b43 });
  const plot = (series, scale, color, mid) => {
    if (series.length < 2) return;
    const y = (val) => mid - val * scale;
    trace.moveTo(0, y(series[0]));
    for (let i = 1; i < series.length; i++) trace.lineTo((i / SPAN) * W, y(series[i]));
    trace.stroke({ width: 2, color });
  };
  plot(speeds, TRACE_H * 0.9, 0x6ad0ff, TRACE_H);
  // Acceleration, magnified and centred on the baseline. A tween model would
  // show a spike here at the start of every transition; a drive shows a plateau,
  // and with `jerk` set, a trapezoid.
  plot(accels, TRACE_H * 9, 0xf0a06a, TRACE_H * 0.5);
};
app.ticker.add(tick);

return {
  reelSet,
  cleanup: () => {
    app.ticker.remove(tick);
    try { trace.destroy(); } catch {}
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
