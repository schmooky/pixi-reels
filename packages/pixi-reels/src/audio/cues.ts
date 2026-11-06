import type { SpeedProfile } from '../config/types.js';
import type { Disposable } from '../utils/Disposable.js';

/**
 * The cue vocabulary shared by `attachReelSounds` and `attachBoardSounds`,
 * and the player that fires cues through a {@link ReelAudioPort}.
 */

/** A number, or a centre with a random spread per voice (`{ base, jitter }`). */
export type SoundValue = number | { base?: number; jitter?: number };

/** What a cue knows about the beat it fires on. */
export interface CueContext {
  /** The active speed profile's name (`'normal'`, `'turbo'`, ...). */
  speed: string;
  /** The active speed profile itself (a reel set's; a board has none). */
  profile?: Readonly<SpeedProfile>;
  /** A reel set's spin mode: `'standard'`, or `'cascade'` for a tumble and its refills. */
  mode?: 'standard' | 'cascade';
  /** The reel the beat belongs to, when it belongs to one. */
  reelIndex?: number;
  /** The cell on that reel, for a board beat. */
  cell?: number;
  /** A teasing reel's place in the tease sequence, 0-based. */
  order?: number;
  /** How many reels tease this spin. */
  total?: number;
  /** A board cell landed a coin (`true`) or an empty (`false`). */
  hit?: boolean;
}

/** A value, or a function of the beat (a pitch that climbs with each teasing reel). */
export type CueValue = SoundValue | ((ctx: CueContext) => SoundValue);

/** What every cue shares: the bus, a level, a pitch, a delay and a guard. */
export interface CueBase {
  bus?: string;
  volume?: CueValue;
  pitch?: CueValue;
  /**
   * Seconds between the beat and the sound: a thud timed to the bottom of
   * the landing bounce instead of the frame the reel snaps on.
   */
  delay?: CueValue;
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

function seconds(v: SoundValue | undefined): number {
  return typeof v === 'number' ? v : (v?.base ?? 0);
}

/**
 * Fires cues through a port and keeps every loop and pending delay so
 * `destroy()` can silence the lot.
 */
export class CuePlayer implements ReelSoundsHandle {
  private readonly loops = new Map<string, ReelAudioLoop>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private destroyed = false;

  constructor(private readonly port: ReelAudioPort) {}

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Fire a cue for a beat; a loop cue is keyed so its end can find it. */
  fire(cue: Cue, key: string, ctx: CueContext): void {
    if (this.destroyed) return;
    if (cue.when && !cue.when(ctx)) return;
    const delay = seconds(resolve(cue.delay, ctx));
    if (delay > 0) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.fireNow(cue, key, ctx);
      }, delay * 1000);
      this.timers.add(t);
      return;
    }
    this.fireNow(cue, key, ctx);
  }

  /** End a loop cue's loop; a one-shot has nothing to end. */
  endLoop(cue: Cue | undefined, key: string): void {
    if (cue && 'loop' in cue) this.stopLoop(key, cue.fadeOut);
  }

  stopAll(opts?: { fade?: number }): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const key of [...this.loops.keys()]) this.stopLoop(key, opts?.fade);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopAll({ fade: 0 });
  }

  private fireNow(cue: Cue, key: string, ctx: CueContext): void {
    if (this.destroyed) return;
    const volume = resolve(cue.volume, ctx);
    const pitch = resolve(cue.pitch, ctx);
    if ('play' in cue) {
      this.port.play(cue.play, { bus: cue.bus, volume, pitch });
      return;
    }
    this.stopLoop(key, cue.fadeOut);
    this.loops.set(key, this.port.loop(cue.loop, { bus: cue.bus, volume, pitch, fadeIn: cue.fadeIn ?? 0.05 }));
  }

  private stopLoop(key: string, fade?: number): void {
    const loop = this.loops.get(key);
    if (!loop) return;
    this.loops.delete(key);
    loop.stop({ fade: fade ?? 0.1 });
  }
}
