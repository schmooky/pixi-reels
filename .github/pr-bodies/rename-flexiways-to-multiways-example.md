# Rename `flexiways` example to `multiways`

Commit `2ed9bb75` - aligns the standalone Vite example with the library's **MultiWays** naming (see the naming note in [per-reel-geometry-multiways-big-symbols.md](./per-reel-geometry-multiways-big-symbols.md): generic mechanic name vs trademark). No published `pixi-reels` API changes.

## What changed

| Area | Before | After |
|---|---|---|
| Example folder | `examples/flexiways/` | `examples/multiways/` |
| Workspace package `name` | `flexiways` | `multiways` |
| Dev script (root `package.json`) | `examples:dev:flexiways` -> `--filter flexiways` | `examples:dev:multiways` -> `--filter multiways` |
| Root `tsconfig.json` project reference | `./examples/flexiways` | `./examples/multiways` |
| Browser tab title (`index.html`) | `Flexiways (Megaways)` | `MultiWays (Megaways)` |
| Lockfile importer | `examples/flexiways:` | `examples/multiways:` (plus new dep; see below) |

Application source under `src/` was renamed only on disk (`main.ts`, `setup.ts` unchanged at byte level).

## Dependencies

| Package | Role |
|---|---|
| `@esotericsoftware/spine-pixi-v8` `^4.2.110` | Added to `examples/multiways/package.json` and wired in `pnpm-lock.yaml` so the example can depend on Spine for PixiJS v8 like other demos. |

## Housekeeping

- **`.gitignore`** - `.idea` ignored (JetBrains IDE metadata).

## Architecture / product scope

- **No** changes to `packages/pixi-reels`, spin phases, MultiWays runtime, or site recipes.
- This commit is **workspace + example packaging + lockfile** only.

## Follow-ups (same branch / next commit)

After `2ed9bb75`, the repo may still reference the old slug in places this commit did not touch. Grep for `flexiways` and update as needed:

- Root **`pnpm build`** script - still used `--filter flexiways` at the time of the rename-only commit; should use `--filter multiways` or rely on `examples:build`.
- **`apps/site`** - demo imports and slugs (e.g. `FlexiwaysDemo.tsx`, `demos.ts`).
- **`scripts/check-no-fancy-unicode.mjs`** - path allowlist.
- **`.claude/launch.json`** - launch configuration name and `--filter`.

## Tests / verification

| Check | Notes |
|---|---|
| `pnpm --filter multiways dev` | Primary entry after rename |
| `pnpm --filter multiways build` | Vite production build for the example |
| `pnpm install` | Lockfile already updated in commit |

No new Vitest files; example code paths unchanged.

## Changeset

Not required - diff does not touch `packages/pixi-reels/src/**` or `packages/pixi-reels/package.json`.

## Test plan

- [ ] `pnpm install` - lockfile consistent
- [ ] `pnpm --filter multiways dev` - example boots
- [ ] `pnpm --filter multiways build` - green
- [ ] Grep-clean `flexiways` across repo (follow-up commits)
- [ ] `pnpm build` from root - green after root script points at `multiways`
