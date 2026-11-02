import type { Application, Container } from 'pixi.js';
import type { BoardCues, HoldAndWinBoard, ReelCues, ReelSet, ReelSoundsHandle } from 'pixi-reels';
import type { RecipeAssets } from './assets.js';

/**
 * The contract between a recipe module and whatever runs it: the docs
 * runner, Studio, a share link, or a game that imports the module directly.
 *
 * A recipe is `export default async function (ctx: RecipeContext):
 * Promise<RecipeResult>` beside an `export const meta: RecipeMeta`.
 * Everything else it needs is an import.
 */
export interface RecipeContext {
  /** The host's PixiJS application: its ticker drives the reels, its stage holds them. */
  app: Application;
  /** The asset kits, served from the host's base URL. */
  assets: RecipeAssets;
  /** Sound hooks: snap a cue table onto a set or a board. */
  sounds: RecipeSounds;
  /**
   * Studio only. The symbols uploaded on the Symbols tab, as
   * `{ Class, options }` pairs for `r.register(id, Class, options)`.
   */
  userSymbols?: Record<string, { Class: unknown; options: Record<string, unknown> }>;
  /** Studio only. Per-symbol flags from the Symbols tab, already applied by its builder. */
  userSymbolData?: Record<string, { unmask?: boolean }>;
}

export interface RecipeSounds {
  /** Attach cues to a reel set. The host destroys the handle with the set. */
  reelSounds(reelSet: ReelSet, cues?: ReelCues): ReelSoundsHandle;
  /** The same for a Hold & Win board. */
  boardSounds(board: HoldAndWinBoard, cues?: BoardCues): ReelSoundsHandle;
}

/** Any event bus the host's events panel can listen to. */
export interface RecipeEventBus {
  onAny(fn: (event: string, ...args: unknown[]) => void): unknown;
  offAny(fn: (event: string, ...args: unknown[]) => void): unknown;
}

export interface RecipeResult {
  /** The set the host spins, fits and attaches the default sounds to. */
  reelSet?: ReelSet;
  /**
   * A composition root holding several sets (a banner above a grid). The host
   * fits and centres this instead of `reelSet`, so every set moves together.
   * Lay it out from its own origin.
   */
  stage?: Container;
  /** The next server result, one column per reel, visible cells only. */
  nextResult?: () => string[][];
  /** A custom spin handler. The host awaits it instead of spinning `reelSet` itself. */
  onSpin?: () => Promise<void>;
  /** What a tap during `onSpin` does. Without it the host skips the set. */
  onSkip?: () => void;
  /**
   * A board (`HoldAndWinBoard`, `BoardGrid`) whose events the host records
   * beside the reel sets it finds on the stage.
   */
  board?: { events: RecipeEventBus };
  /** Release what the recipe allocated outside the set: tweens, listeners, extra containers. */
  cleanup?: () => void;
}

/** An asset kit a recipe loads, by name, so a host can prefetch or list them. */
export type RecipeNeed =
  | 'prototype-atlas'
  | 'spine:generated'
  | 'spine:thunderkick'
  | 'spine:cascade'
  | 'hw-sprites'
  | 'hw-spine'
  | 'hw-clover'
  | 'hw-clover-spine';

export interface RecipeMeta {
  /** The heading the demo sits under. */
  title: string;
  /** The umbrella page slug the demo belongs to. */
  topic: string;
  tags: readonly string[];
  /** Canvas height in px. The host's default applies when absent. */
  height?: number;
  /** The asset kits the demo loads. */
  needs?: readonly RecipeNeed[];
}

export type RecipeFn = (ctx: RecipeContext) => Promise<RecipeResult>;

/** The shape of an evaluated `*.recipe.ts` module. */
export interface RecipeModule {
  meta: RecipeMeta;
  default: RecipeFn;
}
