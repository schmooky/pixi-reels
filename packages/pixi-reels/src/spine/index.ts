// The Spine subpath. Importing `pixi-reels/spine` lets non-Spine consumers
// tree-shake both this module and the `@esotericsoftware/spine-pixi-v8`
// runtime out of their production bundle.

export { SpineSymbol } from '../symbols/SpineSymbol.ts';
export type { SpineSymbolOptions } from '../symbols/SpineSymbol.ts';

export { SpineReelSymbol } from './SpineReelSymbol.ts';
export type {
  SpineReelSymbolOptions,
  SymbolAnimOverrides,
} from './SpineReelSymbol.ts';
