/**
 * The bundled Spine symbol sets, behind one uniform interface.
 *
 * Three sets ship with the docs site, and each grew its own loader with its
 * own export names (`loadGeneratedSpines` + `buildSpineMap`,
 * `loadThunderkickSpines` + `buildThunderkickSpineMap` + `THUNDERKICK_SYMBOL_IDS`,
 * and so on). Every surface that wants to offer them - the recipe runner, the
 * studio, the share viewer - had to know all three shapes and wire each name
 * through by hand. They drifted: thunderkick and cascade reached the recipe
 * runner and never reached the studio, so "Open in Studio" on a thunderkick
 * recipe died with "Can't find variable: loadThunderkickSpines".
 *
 * A registry fixes that by construction. A surface iterates `SPINE_SETS`; a
 * new set is one entry here and appears everywhere at once.
 *
 * The per-set loaders remain exported from their own modules - this wraps
 * them, it does not replace them.
 */
import type { SpineSymbolSource } from 'pixi-reels/spine';
import {
  GENERATED_SPINE_NAMES,
  buildSpineMap,
  loadGeneratedSpines,
} from './generatedSpineLoader.js';
import {
  THUNDERKICK_SYMBOL_IDS,
  buildThunderkickSpineMap,
  loadThunderkickSpines,
} from './thunderkickSpineLoader.js';
import {
  CASCADE_PLATE_H,
  CASCADE_PLATE_W,
  CASCADE_SYMBOL_IDS,
  buildCascadeSpineMap,
  loadCascadeSpines,
} from './cascadeSpineLoader.js';

export type SpineSetId = 'generated' | 'thunderkick' | 'cascade';

export interface SpineSet {
  readonly id: SpineSetId;
  /** Human label for a picker. */
  readonly label: string;
  /** Symbol ids this set provides, in a sensible reel order. */
  readonly symbolIds: readonly string[];
  /**
   * Fetch and register the set's atlas + skeletons with PixiJS Assets.
   * Idempotent per set; safe to call from several recipes on one page.
   */
  load(basePath?: string): Promise<void>;
  /** The `spineMap` to hand `SpineReelSymbol`. Call after {@link SpineSet.load}. */
  buildMap(): Record<string, SpineSymbolSource>;
  /**
   * The cell size the art was authored at, when it has one. Cascade's plates
   * are non-square, so a demo that ignores this crops them.
   */
  readonly cellSize?: { width: number; height: number };
}

export const SPINE_SETS: Record<SpineSetId, SpineSet> = {
  generated: {
    id: 'generated',
    label: 'Generated (tools/symbol-gen)',
    symbolIds: GENERATED_SPINE_NAMES,
    load: loadGeneratedSpines,
    // `buildSpineMap` takes a symbolId -> spineName mapping, unlike the
    // other two loaders which have a fixed one baked in. The set's default
    // is the identity: each spine registered under its own name.
    buildMap: () =>
      buildSpineMap(
        Object.fromEntries(GENERATED_SPINE_NAMES.map((n) => [n, n])) as Record<
          string,
          (typeof GENERATED_SPINE_NAMES)[number]
        >,
      ),
  },
  thunderkick: {
    id: 'thunderkick',
    label: 'Thunderkick (Rex the Hunt)',
    symbolIds: THUNDERKICK_SYMBOL_IDS,
    load: loadThunderkickSpines,
    buildMap: buildThunderkickSpineMap,
  },
  cascade: {
    id: 'cascade',
    label: 'Cascade (6x5 tumble)',
    symbolIds: CASCADE_SYMBOL_IDS,
    load: loadCascadeSpines,
    buildMap: buildCascadeSpineMap,
    cellSize: { width: CASCADE_PLATE_W, height: CASCADE_PLATE_H },
  },
};

/** Every set, for pickers and for "load them all" demo pages. */
export const SPINE_SET_IDS = Object.keys(SPINE_SETS) as SpineSetId[];

/**
 * Load a bundled set and return its `spineMap` in one call - the shape a
 * recipe or a studio snippet actually wants.
 *
 * ```ts
 * const { spineMap, symbolIds } = await loadSpineSet('thunderkick');
 * builder.symbols((r) => {
 *   for (const id of symbolIds) r.register(id, SpineReelSymbol, { spineMap });
 * });
 * ```
 */
export async function loadSpineSet(
  id: SpineSetId,
  basePath?: string,
): Promise<{
  set: SpineSet;
  spineMap: Record<string, SpineSymbolSource>;
  symbolIds: readonly string[];
}> {
  const set = SPINE_SETS[id];
  if (!set) {
    throw new Error(
      `loadSpineSet: unknown set '${String(id)}'. Known sets: ${SPINE_SET_IDS.join(', ')}.`,
    );
  }
  await set.load(basePath);
  return { set, spineMap: set.buildMap(), symbolIds: set.symbolIds };
}
