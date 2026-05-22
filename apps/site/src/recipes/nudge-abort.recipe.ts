// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CardSymbol, CARD_DECK,
//                   WILD_CARD, app

// ABORT NUDGE pattern.
//
// The handler kicks off a 2s nudge with an AbortController whose signal
// is wired into the call. ~700ms later the controller aborts. the GSAP
// tween is killed, the strip still snaps to the deterministic landed
// position (the contract is "incoming lands at these positions"), and
// the `nudge()` promise REJECTS with an `AbortError`.
//
// The handler catches the AbortError, logs it, and moves on. `nudge:cancelled`
// fires on the bus carrying the reason. Use abort for "tear it all down"
// semantics. error path runs, follow-up steps are skipped. Use skipNudge
// for "land it now" semantics (see /recipes/nudge-skip/) where the
// success path should still run.

const SYMBOLS = [...CARD_DECK, WILD_CARD];
const FILLER = ['7', '8', '9', '10', 'J'];
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];
const col3 = () => [filler(), filler(), filler()];

const reelSet = new ReelSetBuilder()
  .reels(5)
  .visibleRows(3)
  .symbolSize(72, 72)
  .symbolGap(4, 4)
  .symbols((r) => {
    for (const sym of SYMBOLS) {
      r.register(sym.id, CardSymbol, {
        color: sym.color,
        label: sym.label,
        textColor: sym.textColor,
      });
    }
  })
  .speed('normal', SpeedPresets.NORMAL)
  .ticker(app.ticker)
  .build();

reelSet.events.on('nudge:cancelled', (info) => {
  console.log('[nudge:cancelled]', info);
});

return {
  reelSet,
  onSpin: async () => {
    const p = reelSet.spin();
    await new Promise((resolve) => setTimeout(resolve, 220));
    reelSet.setResult([col3(), col3(), col3(), col3(), col3()].map((visible) => ({ visible })));
    await p;
    await new Promise((resolve) => setTimeout(resolve, 320));

    const controller = new AbortController();
    // Abort the nudge ~700ms in. the tween will be killed mid-flight.
    setTimeout(() => {
      console.log('aborting nudge after 700ms');
      controller.abort();
    }, 700);

    try {
      await reelSet.nudge(2, {
        distance: 1,
        direction: 'down',
        incoming: ['wild'],
        duration: 2000,
        signal: controller.signal,
      });
      // Not reached on abort.
      console.log('nudge completed normally');
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // Expected. clean up here. Strip is at its post-nudge landing
        // position regardless, so subsequent reads are deterministic.
        console.log('caught AbortError; strip still snapped to landed:', err.message);
      } else {
        throw err;
      }
    }
  },
};
