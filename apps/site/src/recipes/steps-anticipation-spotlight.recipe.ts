import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  AnticipationPhase,
  CardSymbol,
  PhaseCardSymbol,
  ReelSetBuilder,
  SpeedPresets,
  step,
} from 'pixi-reels';
import type { AnticipationStepContext } from 'pixi-reels';
import { readout, tapToSpin } from '@pixi-reels/kit';
import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
import { reelSounds } from '@pixi-reels/kit/sound';

export const meta = {
  title: 'A spotlight around the tease',
  topic: 'feel',
  tags: ['phases', 'steps', 'timing', 'fx', 'anticipation', 'speed', 'skip'],
} as const satisfies RecipeMeta;

// A SPOTLIGHT AROUND THE TEASE. Wrap AnticipationPhase's one step.
//
// `AnticipationPhase` runs a single step, `tease`, and the phase is created
// on the teased reel only. So "shade everything else while the tease runs"
// is a list built by hand around the built-in, `[dim, ...steps, lift]`. No
// helper needed when the shape is "wrap":
//
//   dim    fade a shade over every OTHER reel, awaited (150 ms), so the
//          spotlight is on before the reel starts to crawl
//   tease  the built-in, untouched, `cut` for a quicken
//   lift   fade the shades out, awaited, then the stop takes over
//
// Two scatters on reels 1 and 3, the tease on reel 5. Press for a quicken:
// the tease is cut and `lift` still runs. A slam cancels the list in flight,
// so `lift` never runs and `spin:complete` clears the shades as a backstop.
export default async function recipe({ app }: RecipeContext): Promise<RecipeResult> {
  const IDS = ['9', '10', 'J', 'Q', 'K'];
  const SCAT = 'SCAT';
  const REELS = 5, ROWS = 3, SIZE = 80, GAP = 4;
  const TOTAL_H = ROWS * SIZE + (ROWS - 1) * GAP;
  const TOTAL_W = REELS * SIZE + (REELS - 1) * GAP;
  const TEASE = REELS - 1;
  function rv() { return IDS[Math.floor(Math.random() * IDS.length)]; }

  const shades: PIXI.Graphics[] = [];
  const dim = (ctx: AnticipationStepContext) => {
    const others = shades.filter((_, i) => i !== ctx.reel.reelIndex);
    gsap.killTweensOf(shades);
    return gsap.to(others, { alpha: 0.62, duration: 0.15, ease: 'power1.out' });
  };
  const lift = () => {
    gsap.killTweensOf(shades);
    return gsap.to(shades, { alpha: 0, duration: 0.15, ease: 'power1.out' });
  };

  const reelSet = new ReelSetBuilder()
    .reels(REELS).visibleCells(ROWS).symbolSize(SIZE, SIZE).symbolGap(GAP, GAP)
    .symbols((r) => {
      for (const id of IDS) r.register(id, PhaseCardSymbol, { label: id });
      r.register(SCAT, CardSymbol, { color: 0xffcc44, label: 'F', textColor: 0x3a2600 });
    })
    .speed('normal', { ...SpeedPresets.NORMAL, stopDelay: 180, anticipationDelay: 1500 })
    .phases((f) => f.register('anticipation', AnticipationPhase, {
      steps: (steps) => [step('dim', dim), ...steps, step('lift', lift)],
    }))
    .ticker(app.ticker)
    .build();

  const unwatch = PhaseCardSymbol.watch(reelSet.reels);

  // One shade per reel, above the symbols, at rest invisible.
  const shadeLayer = new PIXI.Container();
  reelSet.addChild(shadeLayer);
  for (let i = 0; i < REELS; i++) {
    const g = new PIXI.Graphics().rect(i * (SIZE + GAP), 0, SIZE, TOTAL_H).fill({ color: 0x0b0b0f });
    g.alpha = 0;
    shadeLayer.addChild(g);
    shades.push(g);
  }
  // The backstop: a slam cancels `lift`, so the shades are cleared here too.
  reelSet.events.on('spin:complete', () => {
    gsap.killTweensOf(shades);
    for (const g of shades) g.alpha = 0;
  });

  const hud = readout.plaque({
    text: 'two scatters land, reel 5 teases under a spotlight. press to quicken: the tease is cut, the shades still lift',
    minWidth: TOTAL_W,
    maxWidth: TOTAL_W,
  });
  hud.position.set(0, TOTAL_H + 10);
  reelSet.addChild(hud);

  app.stage.addChild(reelSet);
  reelSounds(reelSet);
  tapToSpin(app, {
    reelSet,
    spin: async () => {
      const grid = Array.from({ length: REELS }, () => ({ visible: [rv(), rv(), rv()] }));
      grid[0].visible[1] = SCAT;
      grid[2].visible[1] = SCAT;
      const p = reelSet.spin();
      reelSet.setAnticipation([TEASE]);
      await new Promise((r) => setTimeout(r, 250));
      reelSet.setResult(grid);
      await p;
    },
    skip: () => reelSet.requestSkip({ mode: 'quicken' }),
  });
  return {
    reelSet,
    cleanup: () => {
      unwatch();
      gsap.killTweensOf(shades);
      try { shadeLayer.destroy({ children: true }); } catch {}
      try { hud.destroy({ children: true }); } catch {}
    },
  };
}
