/**
 * Evaluate a recipe module from its source, in the browser.
 *
 * A recipe is a real TypeScript module: `import`s at the top, `export const
 * meta`, `export default async function recipe(ctx)`. The docs runner, Studio
 * and the share viewer all hold the source as a string (a docs demo is
 * inlined into the page; Studio edits it), so none of them can `import()` it.
 * Instead the source is compiled with sucrase to CommonJS and evaluated with
 * a `require` that resolves each bare specifier to the module object the host
 * already has. What the reader sees is exactly what runs, and the runtimes
 * cannot drift: there is one table of resolvable modules, here.
 *
 * Every entry is loaded on demand, so a page of card-symbol demos never
 * fetches the Spine runtime or the Hold & Win FX kit; Vite splits each into
 * its own chunk and shares it with the host's static imports.
 */
import { transform as sucraseTransform } from 'sucrase';
import { DEBUG_FONT } from 'pixi-reels/debug';
import type { RecipeContext, RecipeModule, RecipeResult } from '@pixi-reels/kit';

type ModuleLoader = () => Promise<Record<string, unknown>>;

/** Every specifier a recipe module may import. Add here, nowhere else. */
const MODULES: Record<string, ModuleLoader> = {
  'pixi.js': () => import('pixi.js'),
  gsap: () => import('gsap'),
  'pixi-silk': () => import('pixi-silk'),
  '@esotericsoftware/spine-pixi-v8': () => import('@esotericsoftware/spine-pixi-v8'),
  'pixi-reels': () => import('pixi-reels'),
  'pixi-reels/spine': () => import('pixi-reels/spine'),
  'pixi-reels/debug': () => import('pixi-reels/debug'),
  '@pixi-reels/kit': () => import('@pixi-reels/kit'),
  '@pixi-reels/kit/spine': () => import('@pixi-reels/kit/spine'),
  '@pixi-reels/kit/sound': () => import('@pixi-reels/kit/sound'),
  '@pixi-reels/kit/ways': () => import('@pixi-reels/kit/ways'),
};

const loaded = new Map<string, Promise<Record<string, unknown>>>();

function loadModule(specifier: string): Promise<Record<string, unknown>> {
  let p = loaded.get(specifier);
  if (!p) {
    const load = MODULES[specifier];
    if (!load) {
      return Promise.reject(
        new Error(
          `A recipe cannot import '${specifier}'. The runtimes resolve: ${Object.keys(MODULES).join(', ')}.`,
        ),
      );
    }
    p = load();
    loaded.set(specifier, p);
  }
  return p;
}

/** The `require('...')` calls sucrase emitted, in source order, deduplicated. */
function requiredSpecifiers(cjs: string): string[] {
  const out: string[] = [];
  for (const m of cjs.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    if (!out.includes(m[2])) out.push(m[2]);
  }
  return out;
}

/**
 * Wait for the readout face before a recipe builds its plaques.
 *
 * A Pixi `Text` rasterizes with whatever font is ready when it first renders
 * and does not redraw when a better one arrives, so a plaque built during
 * the font's download keeps the fallback face until its text next changes.
 * Resolves regardless: the fallback is still monospace, so a plaque sized
 * for Fira Code fits it too.
 */
async function readoutFontReady(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.load(`11px ${DEBUG_FONT}`).catch(() => undefined);
  }
}

/** Strip the types and turn the imports into `require` calls. Throws on a syntax error. */
export function compileRecipeModule(source: string): string {
  return sucraseTransform(source, { transforms: ['typescript', 'imports'] }).code;
}

export interface EvaluateOptions {
  /**
   * Replace a resolved module's exports for this evaluation. Studio swaps
   * `ReelSetBuilder` for one that folds the Symbols tab into every build.
   */
  overrides?: Record<string, Record<string, unknown>>;
}

/**
 * Compile and evaluate a recipe module's source. Returns its exports: the
 * `meta` and the default recipe function. Nothing in the recipe runs yet.
 */
export async function evaluateRecipeModule(
  source: string,
  opts: EvaluateOptions = {},
): Promise<RecipeModule> {
  const cjs = compileRecipeModule(source);
  const specifiers = requiredSpecifiers(cjs);
  const resolved = await Promise.all(specifiers.map((s) => loadModule(s)));
  await readoutFontReady();
  const table = new Map<string, Record<string, unknown>>();
  specifiers.forEach((s, i) => {
    const override = opts.overrides?.[s];
    table.set(s, override ? { ...resolved[i], ...override } : resolved[i]);
  });
  const require = (specifier: string): Record<string, unknown> => {
    const m = table.get(specifier);
    if (!m) throw new Error(`Recipe required '${specifier}' at run time, which was not in its imports.`);
    return m;
  };
  const module = { exports: {} as Record<string, unknown> };
  const factory = new Function('require', 'exports', 'module', `"use strict";\n${cjs}`) as (
    require: (s: string) => unknown,
    exports: Record<string, unknown>,
    module: { exports: Record<string, unknown> },
  ) => void;
  factory(require, module.exports, module);
  const exported = module.exports;
  if (typeof exported.default !== 'function') {
    throw new Error('A recipe must `export default async function recipe(ctx) { ... }`.');
  }
  return exported as unknown as RecipeModule;
}

/**
 * Evaluate the module and run its recipe. The shape every runtime calls.
 */
export async function runRecipeModule(
  source: string,
  ctx: RecipeContext,
  opts: EvaluateOptions = {},
): Promise<RecipeResult> {
  const mod = await evaluateRecipeModule(source, opts);
  return (await mod.default(ctx)) as RecipeResult;
}

/** The one mistake every old-contract recipe makes, named once for Studio, the share viewer and the runner. */
export const OFF_STAGE =
  'The recipe built a set but did not put it on the stage. A recipe adds its root with `app.stage.addChild(reelSet)` and wires its control with `tapToSpin(app, { reelSet, next })`; code written against the old contract (`nextResult` / `onSpin` in the result) needs that change. See the default module.';

