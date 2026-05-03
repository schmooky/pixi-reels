# Rename `flexiways` example to `multiways`

Three commits align the standalone example, monorepo wiring, and docs site with the library's **MultiWays** naming (see [per-reel-geometry-multiways-big-symbols.md](./per-reel-geometry-multiways-big-symbols.md)). No published `pixi-reels` API changes.

## Commit `2ed9bb75` (example + workspace wiring)

| Area | Before | After |
|---|---|---|
| Example folder | `examples/flexiways/` | `examples/multiways/` |
| Workspace package `name` | `flexiways` | `multiways` |
| Dev script (root `package.json`) | `examples:dev:flexiways` -> `--filter flexiways` | `examples:dev:multiways` -> `--filter multiways` |
| Root `tsconfig.json` project reference | `./examples/flexiways` | `./examples/multiways` |
| Browser tab title (`index.html`) | `Flexiways (Megaways)` | `MultiWays (Megaways)` |
| Lockfile importer | `examples/flexiways:` | `examples/multiways:` (plus new dep; see below) |

Application source under `src/` was renamed only on disk (`main.ts`, `setup.ts` unchanged at byte level).

### Dependencies (`2ed9bb75`)

| Package | Role |
|---|---|
| `@esotericsoftware/spine-pixi-v8` `^4.2.110` | Added to `examples/multiways/package.json` and wired in `pnpm-lock.yaml` so the example can depend on Spine for PixiJS v8 like other demos. |

### Housekeeping (`2ed9bb75`)

- **`.gitignore`** - `.idea` ignored (JetBrains IDE metadata).

## Commit `49fb9a99` (root build, guard paths, site demo shell)

| Area | Change |
|---|---|
| Root `package.json` `build` script | `--filter flexiways` -> `--filter multiways` |
| `.claude/launch.json` | Launch name `flexiways` -> `multiways`; `pnpm --filter multiways exec vite ...` |
| `scripts/check-no-fancy-unicode.mjs` | Default glob `examples/flexiways/src` -> `examples/multiways/src` |
| Site component | `FlexiwaysDemo.tsx` -> `MultiWaysDemo.tsx`; import from `examples/multiways/src/setup.ts`; default export `MultiWaysDemo` |
| `apps/site/src/pages/demos/flexiways.mdx` | Frontmatter title + `<MultiWaysDemo />`; demo still served at `/demos/flexiways/` until `115abdf3` |

This PR body file was first added in `49fb9a99` alongside those edits.

## Commit `115abdf3` (demos slug, `/demos/` route, redirect, copy)

| Area | Change |
|---|---|
| `apps/site/src/content/demos.ts` | `slug: 'multiways'`; title `MultiWays (Megaways)` |
| `apps/site/src/pages/demos/multiways.mdx` | Renamed from `flexiways.mdx` (git rename); frontmatter title `MultiWays (Megaways)` |
| `apps/site/astro.config.mjs` | `redirects`: `/demos/flexiways` -> `/demos/multiways` (single entry to avoid duplicate-route warnings) |
| `MultiWaysDemo.tsx` | `mechanic="multiways"` for `DemoSandbox` |
| `pyramid-cascade.mdx` | Prose: "Same algorithm as MultiWays" |

Commit message: `refactor: rename flexiways to multiways in demos and related references` (adds redirect for the old demo path).

## Architecture / product scope

- **`2ed9bb75`**: no changes under `packages/pixi-reels/`, no docs site.
- **`49fb9a99`**: docs site demo component + `flexiways.mdx` shell; monorepo scripts; still no library source changes.
- **`115abdf3`**: docs site URLs, sitemap slug, Astro redirect, and cross-page copy only; still no library source changes.

## Changeset

Not required - none of `2ed9bb75`, `49fb9a99`, or `115abdf3` touches `packages/pixi-reels/src/**` or `packages/pixi-reels/package.json`.

## Tests / verification

| Check | Notes |
|---|---|
| `pnpm --filter multiways dev` | Example entry |
| `pnpm --filter multiways build` | Vite production build |
| `pnpm build` (root) | Includes `multiways` after `49fb9a99` |
| `pnpm install` | Lockfile from `2ed9bb75` |
| `pnpm --filter @pixi-reels/site build` | Slug + `multiways.mdx` + redirects (`115abdf3`) |

No new Vitest files; example gameplay code unchanged.

## Test plan

- [x] `pnpm install` - lockfile consistent (`2ed9bb75`)
- [ ] `pnpm --filter multiways dev` - example boots
- [ ] `pnpm --filter multiways build` - green
- [x] Root `pnpm build` - uses `--filter multiways` (`49fb9a99`)
- [x] `pnpm --filter @pixi-reels/site build` - green (`115abdf3`)
