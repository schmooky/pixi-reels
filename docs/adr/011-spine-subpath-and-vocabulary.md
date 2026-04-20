# ADR 011: Spine subpath export + canonical animation vocabulary

## Status: Accepted

## Context

Early on, `SpineSymbol` lived alongside `SpriteSymbol` and `AnimatedSpriteSymbol` in the main barrel. Anyone importing `pixi-reels` — even consumers who never touch Spine — transitively pulled `@esotericsoftware/spine-pixi-v8` into their bundle. The Spine runtime is not small.

Separately, the `SpineReelSymbol` adapter (the higher-level Bonbon-style class with `idle / landing / win / disintegration / reactions/react_*` lifecycle) originally lived in `examples/shared/` as reference code. Adopters had to copy-paste it into their own codebase to use Bonbon-grade symbols. That runs counter to the "batteries-included" positioning.

## Decision

### Subpath export

Publish Spine functionality under a dedicated subpath:

```ts
import { SpineReelSymbol, SpineSymbol } from 'pixi-reels/spine';
```

- `packages/pixi-reels/package.json` declares `"./spine"` with ESM + CJS + types entries.
- `packages/pixi-reels/src/spine/index.ts` re-exports `SpineSymbol` and `SpineReelSymbol`.
- `vite.config.ts` emits `dist/spine.js` and `dist/spine.cjs` alongside the core.
- Consumers who never import `pixi-reels/spine` get no Spine code in their bundle — Rollup's tree-shaking works through subpaths cleanly.

### The Bonbon animation vocabulary

`SpineReelSymbol` standardizes on a minimal vocabulary, modelled on the Bonbon Bonanza and Bonbon Hold & Win codebases (the two production games pixi-reels was extracted from):

| Role | Animation name | Loop | Called by |
|---|---|---|---|
| Resting | `idle` | yes | automatic on activate |
| Reel-stop one-shot | `landing` | no | `sym.playLanding()`, typically in `spin:reelLanded` |
| Win celebration | `win` | no | `sym.playWin()` |
| Cascade pop | `disintegration` | no | `sym.playOut()`, optional |
| Fast-spin frame | `blur` | yes | `sym.playBlur()`, optional |
| Neighbour cue | `reactions/react_{u,d,l,r,ul,ur,dl,dr}` | no | raw via `sym.spine.state.setAnimation(...)` |

Missing animations are silent no-ops — a skeleton that lacks `landing` will simply skip the call. **The library never throws on a missing animation.**

### Per-symbol overrides patch asset typos

Real assets deviate. Bonanza's `low_1.json` has a typo (`ide` instead of `idle`). `SpineReelSymbol` accepts an `animations` override map:

```ts
r.register('low1', SpineReelSymbol, {
  spineMap,
  animations: { low1: { idle: 'ide' } },
});
```

This is adapter-level, not asset-level. The library never asks artists to edit their skeletons to match our opinion.

## Consequences

### Positive

- Non-Spine consumers pay zero bytes for Spine support. Core bundle is under 11 kB gzipped.
- `SpineReelSymbol` is first-class library API, not copy-paste reference code. Demos on the site `import` from `pixi-reels/spine` — adopters do the exact same thing.
- The canonical vocabulary + overrides let any Bonbon-style asset drop in without code edits; assets that deviate only need a one-line override.

### Negative

- Two entry points means the publish checklist includes both. `pnpm --filter pixi-reels build` emits both automatically; nothing to remember manually.
- Consumers who want the raw `Spine` wrapper without the Bonbon-style adapter still have to import from `pixi-reels/spine` (the subpath exports both `SpineSymbol` and `SpineReelSymbol`). A separate `pixi-reels/spine-raw` subpath would be overkill.

## Enforcement

- The Spine runtime must not be imported from anywhere outside `packages/pixi-reels/src/spine/` or `packages/pixi-reels/src/symbols/SpineSymbol.ts`.
- If `pixi-reels` (the main barrel) grows a dependency on anything Spine-related, the build will still succeed — but the gzipped bundle size check (`scripts/size-check.mjs`) will catch the regression.
