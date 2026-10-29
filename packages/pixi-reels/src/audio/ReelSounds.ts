import type { ReelSet } from '../core/ReelSet.js';
import type { ReelSetEvents } from '../events/ReelEvents.js';
import type { Disposable } from '../utils/Disposable.js';

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
 *   spin: { loop: 'spin-loop', fadeIn: 0.05, fadeOut: 0.08 },
 *   reelStop: { play: 'reel-stop', pitch: { jitter: 0.04 } },
 *   anticipation: { loop: 'anticipation', fadeIn: 0.12, fadeOut: 0.25,
 *                   pitch: ({ order }) => 1 + 0.08 * order },
 *   skip: { play: 'skip' },
 *   win: { play: 'win' },
 * });
 * sounds.destroy(); // with the reel set
 * ```
 */

/** A number, or a centre with a random spread per voice (`{ base, jitter }`). */
export type SoundValue = number | { base?: number; jitter?: number };

/** What a cue knows about the beat it fires on. */
export interface CueContext {
  /** The reel the beat belongs to, when it belongs to one. */
  reelIndex?: number;
  /** A teasing reel's place in the tease sequence, 0-based. */
  order?: number;
  /** How many reels tease this spin. */
  total?: number;
  /** The active speed profile's name (`'normal'`, `'turbo'`, ...). */
  speed: string;
  /** The spin's mode: `'standard'`, or `'cascade'` for a tumble and its refills. */
  mode: 'standard' | 'cascade';
}

/** A value, or a function of the beat (a pitch that climbs with each teasing reel). */
export type CueValue = SoundValue | ((ctx: CueContext) => SoundValue);

/** What every cue shares: the bus, a level, a pitch and a guard. */
export interface CueBase {
  bus?: string;
  volume?: CueValue;
  pitch?: CueValue;
  /** Fire only when this says so: a thud that stays quiet on a cascade. */
  when?: (ctx: CueContext) => boolean;
}

export interface OneShotCue extends CueBase {
  /** The sound to fire. A variants set plays its next take. */
  play: string;
}

export interface LoopCue extends CueBase {
  /** The sound to loop for as long as the beat lasts. */
  loop: string;
  /** Seconds. Default 0.05. */
  fadeIn?: number;
  /** Seconds. Default 0.1. */
  fadeOut?: number;
}

export type Cue = OneShotCue | LoopCue;

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

export interface ReelAudioLoop {
  /** Stop the loop, fading over `fade` seconds. Safe to call twice. */
  stop(opts?: { fade?: number }): void;
}

/** The audio engine as the cues see it. */
export interface ReelAudioPort {
  /** Fire a one-shot. An unknown name must not throw. */
  play(name: string, opts: { bus?: string; volume?: SoundValue; pitch?: SoundValue }): void;
  /** Start a loop and hand back its handle. An unknown name returns a no-op handle. */
  loop(
    name: string,
    opts: { bus?: string; volume?: SoundValue; pitch?: SoundValue; fadeIn?: number },
  ): ReelAudioLoop;
}

export interface ReelSoundsHandle extends Disposable {
  /** Stop every running loop now (a scene change, a mute). */
  stopAll(opts?: { fade?: number }): void;
}

function resolve(v: CueValue | undefined, ctx: CueContext): SoundValue | undefined {
  return typeof v === 'function' ? v(ctx) : v;
}

/**
 * Snap a table of cues onto a reel set. Returns a handle whose `destroy()`
 * detaches every listener and stops every loop; call it when the reel set
 * goes.
 */
export function attachReelSounds(
  reelSet: ReelSet,
  port: ReelAudioPort,
  cues: ReelCues,
): ReelSoundsHandle {
  const events = reelSet.events;
  const offs: Array<() => void> = [];
  const loops = new Map<string, ReelAudioLoop>();
  let disposed = false;

  const ctxFor = (extra?: Omit<CueContext, 'speed' | 'mode'>): CueContext => ({
    ...extra,
    speed: reelSet.speed.activeName,
    mode: reelSet.spinMode,
  });

  const fire = (cue: Cue, key: string, ctx: CueContext): void => {
    if (disposed) return;
    if (cue.when && !cue.when(ctx)) return;
    const volume = resolve(cue.volume, ctx);
    const pitch = resolve(cue.pitch, ctx);
    if ('play' in cue) {
      port.play(cue.play, { bus: cue.bus, volume, pitch });
      return;
    }
    stopLoop(key, cue.fadeOut);
    loops.set(key, port.loop(cue.loop, { bus: cue.bus, volume, pitch, fadeIn: cue.fadeIn ?? 0.05 }));
  };

  const stopLoop = (key: string, fade?: number): void => {
    const loop = loops.get(key);
    if (!loop) return;
    loops.delete(key);
    loop.stop({ fade: fade ?? 0.1 });
  };

  const on = <K extends keyof ReelSetEvents>(
    name: K,
    fn: (...args: ReelSetEvents[K]) => void,
  ): void => {
    events.on(name, fn);
    offs.push(() => events.off(name, fn));
  };

  const endLoop = (cue: Cue | undefined, key: string): void => {
    if (cue && 'loop' in cue) stopLoop(key, cue.fadeOut);
  };

  if (cues.spin) {
    const cue = cues.spin;
    on('spin:start', () => fire(cue, 'spin', ctxFor()));
    on('spin:allLanded', () => endLoop(cue, 'spin'));
  }
  if (cues.reelStop) {
    const cue = cues.reelStop;
    on('spin:reelLanding', (reelIndex) => fire(cue, `reelStop:${reelIndex}`, ctxFor({ reelIndex })));
  }
  if (cues.anticipation) {
    const cue = cues.anticipation;
    on('anticipation:reel', ({ reelIndex, order, total }) =>
      fire(cue, `anticipation:${reelIndex}`, ctxFor({ reelIndex, order, total })));
    on('anticipation:reelEnd', ({ reelIndex }) => endLoop(cue, `anticipation:${reelIndex}`));
  }
  if (cues.skip) {
    const cue = cues.skip;
    on('skip:requested', () => fire(cue, 'skip', ctxFor()));
  }
  if (cues.win) {
    const cue = cues.win;
    on('spotlight:start', () => fire(cue, 'win', ctxFor()));
    on('win:group', () => fire(cue, 'win', ctxFor()));
  }
  if (cues.cascadeDestroy) {
    const cue = cues.cascadeDestroy;
    on('cascade:destroy:start', () => fire(cue, 'cascadeDestroy', ctxFor()));
  }
  for (const [name, cue] of Object.entries(cues.on ?? {}) as Array<[keyof ReelSetEvents, EventCue]>) {
    const key = `on:${String(name)}`;
    on(name, () => fire(cue, key, ctxFor()));
    if ('until' in cue) on(cue.until, () => endLoop(cue, key));
  }

  const stopAll = (opts?: { fade?: number }): void => {
    for (const key of [...loops.keys()]) stopLoop(key, opts?.fade);
  };
  on('destroyed', () => stopAll({ fade: 0 }));

  return {
    stopAll,
    get isDestroyed() {
      return disposed;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      stopAll({ fade: 0 });
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}
