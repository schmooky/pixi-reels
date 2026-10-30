import type { ReelSet } from '../core/ReelSet.js';
import type { ReelSetEvents } from '../events/ReelEvents.js';
import { CuePlayer } from './cues.js';
import type { Cue, CueContext, LoopCue, OneShotCue, ReelAudioPort, ReelSoundsHandle } from './cues.js';

/**
 * Reel sounds: a table of cues snapped onto a `ReelSet`'s events.
 *
 * The engine knows the beats (a spin starts, a reel lands, a reel teases, a
 * press skips, winners show, a cascade pops) and the audio engine knows the
 * sounds; this is the thin layer that says which sound plays on which beat,
 * when a loop starts and when it fades out. It talks to the audio engine
 * through {@link ReelAudioPort}, a two-method surface (`play` a one-shot,
 * `loop` a bed and get a handle to stop it), so any engine fits. For
 * `@schmooky/zvuk` use {@link zvukPort}.
 *
 * ```ts
 * const sounds = attachReelSounds(reelSet, zvukPort(engine), {
 *   spin: { play: 'spin' },
 *   reelStop: { play: 'reel-stop', pitch: { jitter: 0.04 },
 *               delay: ({ profile }) => profile.bounceDuration / 2000 },
 *   anticipation: { loop: 'anticipation', fadeIn: 0.12, fadeOut: 0.25,
 *                   pitch: ({ order }) => 1 + 0.08 * order },
 *   skip: { play: 'skip' },
 *   win: { play: 'win' },
 * });
 * sounds.destroy(); // with the reel set
 * ```
 */

/** A cue on any reel-set event: a one-shot, or a loop that runs until `until` fires. */
export type EventCue =
  | OneShotCue
  | (LoopCue & { until: keyof ReelSetEvents });

export interface ReelCues {
  /**
   * The spin: from `spin:start` until every reel has landed
   * (`spin:allLanded`). A loop is the usual choice.
   */
  spin?: Cue;
  /**
   * A reel landing on its result (`spin:reelLanding`), on every landing path:
   * an animated stop, a slam, a cascade refill. `ctx.reelIndex` is the reel.
   */
  reelStop?: Cue;
  /**
   * A reel teasing, from `anticipation:reel` until its `anticipation:reelEnd`.
   * `ctx.order` / `ctx.total` say where the reel sits in the tease, so a
   * pitch can climb from reel to reel.
   */
  anticipation?: Cue;
  /** A skip press (`skip:requested`). */
  skip?: Cue;
  /** Winners shown (`spotlight:start`, and `win:group` for each presented win). */
  win?: Cue;
  /** A cascade destroying its winners (`cascade:destroy:start`). */
  cascadeDestroy?: Cue;
  /** Any other reel-set event by name. */
  on?: Partial<Record<keyof ReelSetEvents, EventCue>>;
}

/**
 * Snap a table of cues onto a reel set. Every cue sees the active speed
 * profile and the spin's mode. Returns a handle whose `destroy()` detaches
 * every listener and stops every loop; call it when the reel set goes.
 */
export function attachReelSounds(
  reelSet: ReelSet,
  port: ReelAudioPort,
  cues: ReelCues,
): ReelSoundsHandle {
  const events = reelSet.events;
  const player = new CuePlayer(port);
  const offs: Array<() => void> = [];

  const ctxFor = (extra?: Partial<CueContext>): CueContext => ({
    ...extra,
    speed: reelSet.speed.activeName,
    profile: reelSet.speed.active,
    mode: reelSet.spinMode,
  });

  const on = <K extends keyof ReelSetEvents>(
    name: K,
    fn: (...args: ReelSetEvents[K]) => void,
  ): void => {
    events.on(name, fn);
    offs.push(() => events.off(name, fn));
  };

  if (cues.spin) {
    const cue = cues.spin;
    on('spin:start', () => player.fire(cue, 'spin', ctxFor()));
    on('spin:allLanded', () => player.endLoop(cue, 'spin'));
  }
  if (cues.reelStop) {
    const cue = cues.reelStop;
    on('spin:reelLanding', (reelIndex) => player.fire(cue, `reelStop:${reelIndex}`, ctxFor({ reelIndex })));
  }
  if (cues.anticipation) {
    const cue = cues.anticipation;
    on('anticipation:reel', ({ reelIndex, order, total }) =>
      player.fire(cue, `anticipation:${reelIndex}`, ctxFor({ reelIndex, order, total })));
    on('anticipation:reelEnd', ({ reelIndex }) => player.endLoop(cue, `anticipation:${reelIndex}`));
  }
  if (cues.skip) {
    const cue = cues.skip;
    on('skip:requested', () => player.fire(cue, 'skip', ctxFor()));
  }
  if (cues.win) {
    const cue = cues.win;
    on('spotlight:start', () => player.fire(cue, 'win', ctxFor()));
    on('win:group', () => player.fire(cue, 'win', ctxFor()));
  }
  if (cues.cascadeDestroy) {
    const cue = cues.cascadeDestroy;
    on('cascade:destroy:start', () => player.fire(cue, 'cascadeDestroy', ctxFor()));
  }
  for (const [name, cue] of Object.entries(cues.on ?? {}) as Array<[keyof ReelSetEvents, EventCue]>) {
    const key = `on:${String(name)}`;
    on(name, () => player.fire(cue, key, ctxFor()));
    if ('until' in cue) on(cue.until, () => player.endLoop(cue, key));
  }
  on('destroyed', () => player.stopAll({ fade: 0 }));

  return {
    stopAll: (opts) => player.stopAll(opts),
    get isDestroyed() {
      return player.isDestroyed;
    },
    destroy() {
      if (player.isDestroyed) return;
      player.destroy();
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}
