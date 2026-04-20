# Changesets

This folder is the source of truth for releases of every publishable package in `pixi-reels`. Changesets reads `.md` files in this directory, decides per-package version bumps, generates per-package CHANGELOGs, and publishes to npm.

## Quick reference

| Action | Command |
|--------|---------|
| Add a new changeset (run this in your PR) | `pnpm changeset` |
| See what would be released | `pnpm changeset:status` |
| Apply pending changesets locally (CI does this in the version PR) | `pnpm version-packages` |
| Publish (CI does this on merge of the version PR) | `pnpm release` |

## How to write a good changeset

1. Run `pnpm changeset` from the repo root.
2. Pick the packages your change affects with `<space>`, then `<enter>`. If the change is purely internal scaffolding (build tooling, lint config) and ships no new behavior to consumers, skip the changeset entirely.
3. Pick the bump for each package:
   - **patch** for bug fixes, internal refactors, and dependency bumps with no API change.
   - **minor** for additive changes that don't break existing consumers.
   - **major** for breaking API changes. Pre-`1.0.0` releases are not exempt.
4. Write a short summary aimed at a downstream consumer reading the changelog. Lead with the verb:
   - `Fix: StopPhase now slices the target frame to visible rows before placing symbols.`
   - `Add: runCascade accepts a custom winners callback instead of relying on diffCells.`
5. Commit the generated `.changeset/<name>.md` file as part of your PR.

## The dep-graph cascade

When the changesets release bumps `pixi-reels`, every workspace package that depends on it gets a **patch bump** too, so the npm registry never has a published consumer referencing an old version of the library. This is governed by `updateInternalDependencies: "patch"` in `config.json`.

You don't need to add changeset entries for the cascaded patches yourself — changesets adds them automatically. You only write changesets for packages you intentionally touched.

## Apps are ignored

`@pixi-reels/site` (the docs site) and the example apps under `examples/*` (`classic-spin`, `cascade-tumble`, `hold-and-win`) are listed under `ignore` in `config.json`. They are deployed or private, not published to npm. Don't write changesets for them.

## Mapping commits → changesets

We enforce Conventional Commits on every commit (via commitlint). Use this table
to pick a bump type when you run `pnpm changeset`:

| Commit type  | Typical changeset bump      |
|--------------|-----------------------------|
| `feat:`      | `minor`                     |
| `fix:`       | `patch`                     |
| `perf:`      | `patch`                     |
| `refactor:`  | `patch` (or skip if internal-only) |
| `docs:`      | skip                        |
| `test:`      | skip                        |
| `build:` / `ci:` / `chore:` | skip                |
| any commit with `!` or `BREAKING CHANGE:` footer | `major` |

Your commit message is read by the PR review + release-drafter; the changeset
file is what actually stamps the version. They do not have to match exactly but
they should tell the same story.

## Snapshot releases

Every push to a branch that is **not** `main` triggers
`.github/workflows/snapshot.yml`, which publishes every publishable package as
`pixi-reels@<base>-<branch-tag>-<sha>` under a per-branch dist-tag. Reviewers
can install your WIP directly without waiting for a stable release:

```bash
pnpm add pixi-reels@feat-my-branch
```

If your branch has no pending changesets, the snapshot script writes a throwaway
`patch` changeset so the publish still works. Nothing is committed — it is
deleted at the end of the run.

A nightly cron also runs at 03:00 UTC against the default branch so the
`nightly` dist-tag is always fresh.

## See also

- [`AGENTS.md`](../AGENTS.md) — full contributor flow and house style rules.
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — CI pipeline that runs `changesets/action@v1` on push to `main`.
- [`.github/workflows/snapshot.yml`](../.github/workflows/snapshot.yml) — snapshot releases from any branch + nightly cron.
- [`commitlint.config.cjs`](../commitlint.config.cjs) — Conventional Commits rule set.
