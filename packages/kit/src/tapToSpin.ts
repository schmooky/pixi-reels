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
 * Height of the strip along the bottom of the canvas that the cue sits in.
 * A host fits the recipe's content above it so the cue never covers a cell;
 * the runner, Studio and the share viewer all read it.
 */
export const CUE_STRIP = 44;

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
  // The cue lives in the strip in screen space. A board host fits the whole
  // stage (scale and offset) to the canvas, and the cue, a stage child, used
  // to move and shrink with it onto the HUD it was meant to sit under; undo
  // the stage transform every frame instead.
  const place = (): void => {
    if (!plaque || plaque.isDestroyed) return;
    const stage = app.stage;
    const k = stage.scale.x || 1;
    plaque.scale.set(1 / k);
    plaque.x = ((app.screen.width - plaque.plateWidth) / 2 - stage.x) / k;
    plaque.y = (app.screen.height - (CUE_STRIP + plaque.plateHeight) / 2 - stage.y) / k;
  };
  if (plaque) {
    // Out of the stage bounds a host fits: the strip is reserved for the cue,
    // so the content is fitted above it rather than around it. `measurable`
    // is the flag Pixi itself clears on masks for the same reason.
    plaque.measurable = false;
    app.stage.addChild(plaque);
    place();
    plaque.onRender = place;
    // A host that clears the stage for the next run (Studio) takes the cue
    // with it; the control goes too, so no listener outlives its recipe.
    plaque.once('removed', () => handle.destroy());
  }
  // Without a cue there is no plaque to be taken off the stage; the stage
  // going, or the set, ends the control too.
  app.stage.once('destroyed', () => handle.destroy());
  reelSet?.events.on('destroyed', () => handle.destroy());

  const tap = async (): Promise<void> => {
    if (destroyed) return;
    if (spinning) {
      skip();
      return;
    }
    spinning = true;
    if (plaque) { plaque.text = 'tap to skip'; plaque.alpha = 0.6; }
    try {
      await spin();
    } catch (err) {
      // Torn down mid-round: the host destroyed the set and the stage while
      // this round was still awaiting them, so it fails on the first thing it
      // touches next. That failure is the teardown's, not the recipe's. Any
      // error while the demo is still up is raised as before.
      if (!destroyed) throw err;
    } finally {
      spinning = false;
      if (plaque && !plaque.isDestroyed) { plaque.text = 'tap to spin'; plaque.alpha = 1; }
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
      if (plaque && !plaque.isDestroyed) plaque.destroy();
    },
  };
  return handle;
}

/** Keep a tap on a display object from also reaching the stage's `tapToSpin`. */
export function ownTap(event: FederatedPointerEvent): void {
  event.stopPropagation();
}
