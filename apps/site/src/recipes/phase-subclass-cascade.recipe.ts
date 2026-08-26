// @ts-nocheck
// Injected globals: ReelSetBuilder, SpeedPresets, CascadeDropInPhase, resolveTumbleConfig, CardSymbol, CARD_DECK, PIXI, app
//
// SUBCLASSING A PHASE THAT TAKES CONSTRUCTOR ARGUMENTS.
//
// The four standard phases are built with `(reel, speed)`, so
// `register(key, Class)` is enough. The three cascade phases and MultiWays'
// `AdjustPhase` carry build-time config as EXTRA constructor arguments, so a
// subclass of one needs `registerFactory` and has to forward them.
//
// `resolveTumbleConfig(config)` fills a partial `.tumble(...)` config out to
// the shape those constructors expect - the same call `.tumble()` makes
// internally. Hand-writing the fields instead is how a subclass quietly drifts
// from the set's real tumble settings.
//
// Note where `.phases(...)` sits: BEFORE `.tumble(...)`. Configurators are
// deferred to `build()` and applied after the built-in registrations, so chain
// position does not decide the winner. (It used to: `.phases()` ran at call
// time and `.tumble()` registered its defaults later, inside `build()`, which
// silently discarded any `'cascade:*'` override.)

const IDS = ['9', '10', 'J', 'Q', 'K'];
const REELS = 5, ROWS = 3, SIZE = 76, GAP = 4;
const TUMBLE = {
  fall: { duration: 300, ease: 'power3.in', cellStagger: 60 },
  dropIn: { duration: 500, ease: 'power2.out', cellStagger: 60, distance: 'perHole' },
};
const RESOLVED = resolveTumbleConfig(TUMBLE);
const CARDS = CARD_DECK.filter((c) => IDS.includes(c.id));
function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

let drops = 0;
const bumpDrops = () => { drops += 1; };

class CountingDropInPhase extends CascadeDropInPhase {
  onEnter(config) {
    bumpDrops();
    super.onEnter(config);
  }
}

const reelSet = new ReelSetBuilder()
  .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
  .symbols((r) => {
    for (const c of CARDS) {
      r.register(c.id, CardSymbol, { color: c.color, label: c.label, textColor: c.textColor });
    }
  })
  // Registered BEFORE .tumble() on purpose - it still wins.
  .phases((f) =>
    f.registerFactory(
      'cascade:dropIn',
      (reel, speed) => new CountingDropInPhase(reel, speed, RESOLVED.dropIn, RESOLVED.gravity),
    ),
  )
  .tumble(TUMBLE)
  .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 120 })
  .ticker(app.ticker)
  .build();

const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
const hud = new PIXI.Text({
  text: 'press spin: the drop-in phase is the subclass, one per reel',
  style: { fontFamily: "'Fira Code', ui-monospace, monospace", fontSize: 11, fill: 0x9c8f78 },
});
hud.position.set(0, TOTAL_H + 10);
reelSet.addChild(hud);

return {
  reelSet,
  cleanup: () => { try { hud.destroy(); } catch {} },
  onSpin: async () => {
    drops = 0;
    const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
    const p = reelSet.spin();
    await new Promise((r) => setTimeout(r, 250));
    reelSet.setResult(grid);
    await p;
    hud.text = `CountingDropInPhase constructed ${drops}x - once per reel, ` +
      'from a registration made before .tumble()';
  },
};
