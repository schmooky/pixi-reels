// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK, PIXI, gsap, app
//
// SURGE, THEN CRAWL.
//
// The stock tease can only decelerate: it eases `reel.speed` down to a
// fraction of spin speed over the first 35% of the hold and then sits flat for
// the other 65%. Two things are wrong with how that FEELS.
//
//   1. An ease applied to a SPEED is a step in ACCELERATION. `power2.out` puts
//      peak deceleration on the very first frame and decays from there, so the
//      reel does not slow down so much as get set to a lower speed.
//   2. There is no way to ask a reel to speed UP first.
//
// `curve` replaces the fixed shape with explicit legs. Speeds are multiples of
// the profile's `spinSpeed`, so `2` is twice normal - a genuine surge - and
// `0.08` is a crawl. Segment eases default to `power2.inOut` rather than
// `power2.out`, which ramps the acceleration in AND out instead of stamping it.
//
// Watch the readout: the top row is live speed as a fraction of spin speed.
// It goes ABOVE 1 before it goes below it.

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
  // The profile hold still gates whether the tease runs at all; the CURVE sets
  // how long it actually lasts.
  .speed('normal', { ...SpeedPresets.NORMAL, anticipationDelay: 900, stopDelay: 120 })
  .ticker(app.ticker)
  .build();

const H = ROWS * SIZE + (ROWS - 1) * GAP;

const hud = new PIXI.Text({
  text: 'press spin',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 12, fill: 0x9c8f78 },
});
hud.position.set(0, H + 10);
reelSet.addChild(hud);

// A speed trace for the last tease reel. `speedNormalized` is live speed over
// the profile's spinSpeed - the value you would drive a pitch ramp from.
//
// The panel below is drawn ONCE, at setup. That matters: the recipe runner
// scales and centres the reel set to fit the frame, and it measures bounds at
// setup time. A Graphics that is still empty then contributes nothing to those
// bounds, so the fit gets solved for the reels alone and everything the chart
// draws later spills outside the frame. Reserving the box up front makes the
// runner scale the reels AND the chart together.
const W = REELS * SIZE + (REELS - 1) * GAP;
const TRACE_H = 62;
const TRACE_TOP = H + 30;
const SPAN = 240;
// Top of the plot = 2.2x spin speed, so a 2x surge has headroom.
const V_MAX = 2.2;

const panel = new PIXI.Graphics();
panel.roundRect(0, TRACE_TOP, W, TRACE_H, 6).fill({ color: 0x171310 });
// The 1x line: "normal spin speed". Everything above it is a surge.
const oneY = TRACE_TOP + TRACE_H - (1 / V_MAX) * TRACE_H;
panel.moveTo(0, oneY).lineTo(W, oneY).stroke({ width: 1, color: 0x5c5147 });
panel.roundRect(0, TRACE_TOP, W, TRACE_H, 6).stroke({ width: 1, color: 0x332c26 });
reelSet.addChild(panel);

const oneLabel = new PIXI.Text({
  text: '1x',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 9, fill: 0x6f6459 },
});
// INSIDE the panel. Outside it the label widens the composition past the reels,
// and the runner's fit centres on total bounds - so the board would sit visibly
// off-centre in the frame.
oneLabel.position.set(W - 20, oneY - 12);
reelSet.addChild(oneLabel);

const trace = new PIXI.Graphics();
reelSet.addChild(trace);

let samples = [];
let sampling = false;

const yFor = (v) => {
  // Clamped so a stray value can never grow the bounds the fit was solved for.
  const t = Math.max(0, Math.min(1, v / V_MAX));
  return TRACE_TOP + TRACE_H - t * TRACE_H;
};

const tick = () => {
  if (!sampling) return;
  samples.push(reelSet.reels[4].speedNormalized);
  if (samples.length > SPAN) samples.shift();
  trace.clear();
  if (samples.length < 2) return;
  trace.moveTo(0, yFor(samples[0]));
  for (let i = 1; i < samples.length; i++) {
    trace.lineTo((i / SPAN) * W, yFor(samples[i]));
  }
  trace.stroke({ width: 2, color: 0x6ad0ff });
};
app.ticker.add(tick);

return {
  reelSet,
  cleanup: () => {
    app.ticker.remove(tick);
    try { trace.destroy(); } catch {}
    try { panel.destroy(); } catch {}
    try { oneLabel.destroy(); } catch {}
    try { hud.destroy(); } catch {}
  },
  onSpin: async () => {
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    grid[0].visible[1] = SCAT;
    grid[1].visible[1] = SCAT;

    samples = [];
    sampling = true;
    hud.text = 'surge (2x) then crawl (0.08x) - trace: blue line, grey = 1x';

    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 420));
    reelSet.setResult(grid);
    reelSet.setAnticipation(TEASE, {
      stagger: 260,
      curve: [
        // Leg 1: kick UP. `power2.in` so the surge builds rather than snapping.
        { speed: 2, duration: 240, ease: 'power2.in' },
        // Leg 2: fall away to a crawl and sit there. `power3.inOut` ramps the
        // deceleration in and back out - this is the leg that carries the feel.
        { speed: 0.08, duration: 620, ease: 'power3.inOut', hold: 300 },
      ],
    });
    await p;
    sampling = false;
    hud.text = 'landed. press spin again';
  },
};
