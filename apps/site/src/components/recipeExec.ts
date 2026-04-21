/**
 * Shared recipe/sandbox runtime.
 *
 * One recipe source (a string of TypeScript) drives both:
 *   - The interactive canvas on each recipe page (RecipePreview)
 *   - The editable Monaco session on /sandbox (Sandbox)
 *
 * A recipe is a snippet that defines `buildReels()` returning:
 *   {
 *     reelSet,                     // the ReelSet to show
 *     nextResult?,                 // () => grid; called before each spin
 *     onLanded?,                   // (result) => void | Promise; called after each spin
 *                                  //   can mutate state for the next nextResult(),
 *                                  //   run win animations, trigger cascades, etc.
 *     cancel?,                     // () => void; called when the user clicks
 *                                  //   slam-stop during a spin. Typically
 *                                  //   `() => reelSet.skip()`.
 *   }
 *
 * `nextResult` and `onLanded` together are enough to express every stateful
 * mechanic we ship: sticky/walking/multiplier wilds, hold-and-win, mystery
 * reveal, symbol transform, cascade chains. State lives in closure variables
 * declared inside buildReels().
 */

import { Application } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  CascadeMode,
  StandardMode,
  ImmediateMode,
  enableDebug,
  type ReelSet,
  type SpinResult,
} from 'pixi-reels';
import { BlurSpriteSymbol } from '../../../../examples/shared/BlurSpriteSymbol.ts';
import { loadPrototypeSymbols } from '../../../../examples/shared/prototypeSpriteLoader.ts';
import { transform as sucraseTransform } from 'sucrase';

export interface SandboxEnv {
  app: Application;
  textures: Record<string, Texture>;
  blurTextures: Record<string, Texture>;
  SYMBOL_IDS: string[];
}

export interface BuildResult {
  reelSet: ReelSet;
  nextResult?: () => string[][];
  onLanded?: (result: SpinResult) => void | Promise<void>;
  cancel?: () => void;
}

export type CompileOutcome =
  | { ok: true; built: BuildResult }
  | { ok: false; error: string };

/** Lazily-initialised shared atlas — loaded once per page session. */
let cachedAtlas: { textures: Record<string, Texture>; blurTextures: Record<string, Texture> } | null = null;
export async function ensurePrototypeAtlas() {
  if (!cachedAtlas) cachedAtlas = await loadPrototypeSymbols();
  return cachedAtlas;
}

/**
 * Keep gsap animating. We used to detach gsap from its own rAF and drive
 * it from PixiJS's ticker (nicer in hidden tabs), but that path needs
 * care across re-mounts - if the page produces multiple Pixi apps and
 * even one of them gets destroyed, gsap's only driver dies and every
 * tween freezes. For now we rely on gsap's built-in rAF loop; a hidden-
 * tab-safe variant can be re-introduced behind a flag if it matters.
 */
export function syncGsap(_app: Application): void {
  // Intentionally blank. Kept exported to preserve the ergonomic import.
}

/** Utility for weighted picks — injected into the recipe code scope. */
export function pickWeighted(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [id, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return id;
  }
  return Object.keys(weights)[0];
}

/**
 * Compile a recipe source string and execute its `buildReels()` factory.
 * Mirrors the Sandbox evaluator so recipes author once, run everywhere.
 */
export function compileAndBuild(code: string, env: SandboxEnv): CompileOutcome {
  let js: string;
  try {
    js = sucraseTransform(code, { transforms: ['typescript'] }).code;
  } catch (e) {
    return { ok: false, error: `Compile error: ${(e as Error).message}` };
  }

  const factorySource = `
    "use strict";
    ${js}
    return buildReels();
  `;

  try {
    const factory = new Function(
      'ReelSetBuilder',
      'SpeedPresets',
      'BlurSpriteSymbol',
      'CascadeMode',
      'StandardMode',
      'ImmediateMode',
      'app',
      'textures',
      'blurTextures',
      'SYMBOL_IDS',
      'pickWeighted',
      'gsap',
      factorySource,
    );
    const built = factory(
      ReelSetBuilder,
      SpeedPresets,
      BlurSpriteSymbol,
      CascadeMode,
      StandardMode,
      ImmediateMode,
      env.app,
      env.textures,
      env.blurTextures,
      env.SYMBOL_IDS,
      pickWeighted,
      gsap,
    ) as BuildResult;

    if (!built || !built.reelSet) {
      return { ok: false, error: 'buildReels() must return { reelSet, nextResult?, onLanded?, cancel? }.' };
    }
    enableDebug(built.reelSet);
    return { ok: true, built };
  } catch (e) {
    return { ok: false, error: `Runtime error: ${(e as Error).message}` };
  }
}

/**
 * Run one spin through the built recipe:
 *   reelSet.spin() -> nextResult() (150ms later) -> wait for land -> onLanded().
 * Returns the SpinResult so callers can display it if they want.
 */
export async function runSpin(built: BuildResult): Promise<SpinResult> {
  const spinP = built.reelSet.spin();
  const grid = built.nextResult?.();
  await new Promise((r) => setTimeout(r, 150));
  if (grid) built.reelSet.setResult(grid);
  const result = await spinP;
  if (built.onLanded) await built.onLanded(result);
  return result;
}
