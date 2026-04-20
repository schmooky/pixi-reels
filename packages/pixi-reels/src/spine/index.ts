// The Spine subpath. Importing `pixi-reels/spine` lets non-Spine consumers
// tree-shake both this module and the `@esotericsoftware/spine-pixi-v8`
// runtime out of their production bundle.

export { SpineSymbol } from '../symbols/SpineSymbol.js';
export type { SpineSymbolOptions } from '../symbols/SpineSymbol.js';

export { SpineReelSymbol } from './SpineReelSymbol.js';
export type {
  SpineReelSymbolOptions,
  SymbolAnimOverrides,
} from './SpineReelSymbol.js';
