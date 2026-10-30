import type { ReelAudioLoop, ReelAudioPort, SoundValue } from './cues.js';

/**
 * The slice of a `@schmooky/zvuk` `Engine` the port uses. Structural, so the
 * library needs no dependency on zvuk: pass the engine `createEngine()` gave
 * you and it fits.
 */
export interface ZvukEngineLike {
  hasSound(name: string): boolean;
  hasVariants(name: string): boolean;
  sound(name: string): { play(options?: ZvukPlayOptions): ZvukVoiceLike };
  variants(name: string): { play(options?: ZvukPlayOptions): ZvukVoiceLike };
}

export interface ZvukPlayOptions {
  bus?: string;
  volume?: SoundValue;
  pitch?: SoundValue;
  loop?: boolean;
  fadeIn?: number;
}

export interface ZvukVoiceLike {
  stop(opts?: { fade?: number }): void;
}

const NOOP_LOOP: ReelAudioLoop = { stop() {} };

/**
 * A {@link ReelAudioPort} over a zvuk engine. A name loaded with
 * `loadVariants` plays its next take; one loaded with `loadSound` plays as
 * is. A name that is not loaded is skipped with one warning, so a missing
 * file never breaks a spin.
 */
export function zvukPort(
  engine: ZvukEngineLike,
  opts: { warn?: (message: string) => void } = {},
): ReelAudioPort {
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const warned = new Set<string>();

  const source = (name: string) => {
    if (engine.hasVariants(name)) return engine.variants(name);
    if (engine.hasSound(name)) return engine.sound(name);
    if (!warned.has(name)) {
      warned.add(name);
      warn(`[pixi-reels] sound "${name}" is not loaded; the cue is skipped`);
    }
    return null;
  };

  const strip = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

  return {
    play(name, o) {
      source(name)?.play(strip({ bus: o.bus, volume: o.volume, pitch: o.pitch }));
    },
    loop(name, o) {
      const src = source(name);
      if (!src) return NOOP_LOOP;
      const voice = src.play(strip({
        bus: o.bus, volume: o.volume, pitch: o.pitch, loop: true, fadeIn: o.fadeIn,
      }));
      let stopped = false;
      return {
        stop(s) {
          if (stopped) return;
          stopped = true;
          voice.stop({ fade: s?.fade ?? 0.1 });
        },
      };
    },
  };
}
