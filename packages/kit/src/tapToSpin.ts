import type { Application, FederatedPointerEvent } from 'pixi.js';
import type { ReelSet } from 'pixi-reels';
import type { DebugPlaque } from 'pixi-reels/debug';
import { readout } from './readout.js';

/**
 * The player's one control on a demo: a tap on the canvas starts a round,
 * a tap while the round runs skips it.
 *
 * Either hand over the set and the next result and the default round is
 * `spin()` then `setResult()`, or hand over a `spin` of your own (a nudge
 * after the land, a cascade chain, a board respin) and, if the default skip
 * is not what a mid-round tap should do, a `skip` as well.
 */
export interface TapToSpinOptions {
  /** The set the default round spins and the default skip lands. */
  reelSet?: ReelSet;
  /** The next server result for the default round: one column per reel, visible cells only. */
  next?: () => string[][];
  /** A round of your own instead of `reelSet.spin()` + `next()`. */
  spin?: () => Promise<void>;
  /**
   * What a tap mid-round does. Default: skip the nudge in flight if there
   * is one, else land the spin (`skipSpin()`, or `requestSkip()` while the
   * result is still on its way).
   */
  skip?: () => void;
  /** Draw the "tap to spin" cue at the bottom of the canvas. Default true; it is a readout. */
  cue?: boolean;
}

export interface TapToSpinHandle {
  /** True from the tap that started a round until that round resolved. */
  readonly spinning: boolean;
  /** What a tap does: start a round, or skip the one running. */
  tap(): Promise<void>;
  /** Stop listening and remove the cue. The set is not touched. */
  destroy(): void;
}

/**
 * Make the canvas the spin button.
 *
 * ```ts
 * tapToSpin(app, { reelSet, next: () => server.nextResult() });
 * ```
 *
 * The stage gets a hit area the size of the screen, so a tap anywhere on
 * the canvas counts. A display object with its own `pointertap` handler
 * (a cell that splits, a HUD that changes the speed) sits above the stage
 * in the event tree: call `event.stopPropagation()` there or the tap also
 * reaches this.
 */
export function tapToSpin(app: Application, options: TapToSpinOptions): TapToSpinHandle {
  const { reelSet, next, cue = true } = options;
  if (!options.spin && !(reelSet && next)) {
    throw new Error('tapToSpin needs either `spin`, or `reelSet` and `next` for the default round.');
  }

  const spin = options.spin ?? (async () => {
    const set = reelSet as ReelSet;
    const round = set.spin();
    // Your server answers while the reels run; here the answer is local and
    // arrives a moment later so the reels visibly spin before they land.
    await new Promise((r) => setTimeout(r, 150));
    set.setResult((next as () => string[][])().map((visible) => ({ visible })));
    await round;
  });

  const skip = options.skip ?? (() => {
    if (!reelSet) return;
    if (reelSet.reels.some((r) => r.isNudging)) {
      reelSet.skipNudge();
      return;
    }
    // `skipSpin()` throws before the result is in; `requestSkip()` queues
    // the skip for the moment it arrives.
    try { reelSet.skipSpin(); } catch { reelSet.requestSkip(); }
  });

  let spinning = false;
  let destroyed = false;
  const plaque: DebugPlaque | null = cue ? readout.plaque({ text: 'tap to spin', fillAlpha: 0.55 }) : null;
  const place = (): void => {
    if (!plaque || plaque.isDestroyed) return;
    plaque.x = (app.screen.width - plaque.plateWidth) / 2;
    plaque.y = app.screen.height - plaque.plateHeight - 12;
  };
  if (plaque) {
    app.stage.addChild(plaque);
    place();
    app.renderer.on('resize', place);
    // A host that clears the stage for the next run (Studio) takes the cue
    // with it; the control goes too, so no listener outlives its recipe.
    plaque.once('removed', () => handle.destroy());
  }

  const tap = async (): Promise<void> => {
    if (destroyed) return;
    if (spinning) {
      skip();
      return;
    }
    spinning = true;
    if (plaque) { plaque.text = 'tap to skip'; plaque.alpha = 0.6; place(); }
    try {
      await spin();
    } finally {
      spinning = false;
      if (plaque && !plaque.isDestroyed) { plaque.text = 'tap to spin'; plaque.alpha = 1; place(); }
    }
  };

  const onTap = (): void => { void tap(); };
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointertap', onTap);

  const handle: TapToSpinHandle = {
    get spinning() { return spinning; },
    tap,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      app.stage.off('pointertap', onTap);
      app.renderer.off('resize', place);
      if (plaque && !plaque.isDestroyed) plaque.destroy();
    },
  };
  return handle;
}

/** Keep a tap on a display object from also reaching the stage's `tapToSpin`. */
export function ownTap(event: FederatedPointerEvent): void {
  event.stopPropagation();
}
