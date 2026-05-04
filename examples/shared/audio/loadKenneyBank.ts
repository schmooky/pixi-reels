import type { Engine } from '@schmooky/zvuk';

/**
 * Sound IDs registered by `loadKenneyBank` — used as the keys passed to
 * `engine.sound(id).play(...)` and the default ids consumed by
 * `createReelAudio`.
 */
export const STOP_IDS = ['reel-stop'] as const;
export type StopSoundId = (typeof STOP_IDS)[number];

/**
 * Map a semantic id to the on-disk filename produced by `npx zvuk transcode`,
 * which preserves the source `.ogg` name. Decoupled so callers stay on the
 * stable id (`reel-stop`) while the file stays named after its source.
 */
const FILES: Record<StopSoundId, string> = {
  'reel-stop': 'click_002',
};

export interface LoadKenneyBankOptions {
  /**
   * URL prefix where the transcoded audio files live. Default `/audio/` —
   * the path the docs site serves them from. Override when wiring into an
   * example whose static dir is somewhere else.
   */
  basePath?: string;
  /** Bus to register the sounds on. Default `sfx`. */
  bus?: string;
}

/**
 * Load the curated Kenney sound bank into a zvuk engine.
 *
 * Each id ships in two formats — `.webm` (Opus) and `.m4a` (AAC) — so the
 * same call works on evergreen browsers and older iOS Safari. zvuk picks the
 * first decodable URL via its internal codec ladder.
 *
 * Source assets live at `apps/site/public/audio/` and are CC0 from
 * [kenney.nl/assets/interface-sounds](https://kenney.nl/assets/interface-sounds).
 *
 * @example
 * ```ts
 * const engine = createEngine({ buses: { sfx: { level: 1 } } });
 * await engine.unlock();              // first user gesture
 * await loadKenneyBank(engine);
 * engine.sound('reel-stop').play();
 * ```
 */
export async function loadKenneyBank(
  engine: Engine,
  options: LoadKenneyBankOptions = {},
): Promise<readonly StopSoundId[]> {
  const basePath = options.basePath ?? '/audio/';
  const bus = options.bus ?? 'sfx';

  await Promise.all(
    STOP_IDS.map((id) =>
      engine.loadSound(
        id,
        [`${basePath}${FILES[id]}.webm`, `${basePath}${FILES[id]}.m4a`],
        { bus },
      ),
    ),
  );

  return STOP_IDS;
}
