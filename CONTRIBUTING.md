# Contributing

Thanks for your interest in pixi-reels. This file covers the mechanics of contributing. For the house style and load-bearing design constraints, read [`AGENTS.md`](./AGENTS.md) first — several of those rules are enforced by lint guards and pre-commit hooks, so they'll block a merge if you break them.

## Quick start

```bash
git clone https://github.com/schmooky/pixi-reels.git
cd pixi-reels
pnpm install
pnpm --filter pixi-reels test     # vitest + typecheck
pnpm site:dev                     # docs site at http://localhost:4321
pnpm --filter classic-spin dev    # classic 5×3 example
```

Node 20+ is required. The repo uses pnpm workspaces.

## Workflow

1. **Branch from `main`.** Name it something human like `fix/stop-phase-slicing` or `feat/expanding-wilds`. Long-lived preview branches use `v*` (e.g. `v0.2`) and publish [snapshot releases](./README.md#snapshot-releases) automatically.

2. **Make focused changes.** One logical change per PR. If you notice a second bug while fixing the first, open a second PR.

3. **Run the test suite:** `pnpm test`. This runs the lint guards and all vitest suites. They must pass before review.

4. **If your change ships user-visible behavior in a publishable package, add a changeset:**

   ```bash
   pnpm changeset
   ```

   Pick the affected packages and the bump kind (`patch` / `minor` / `major`) and commit the resulting `.changeset/*.md` file. Changes to private apps (`@pixi-reels/site`, any `examples/*`) don't need a changeset — those are deployed, not published.

5. **Open a PR.** The template asks for a summary, a test plan, and confirmation that a changeset was added.

## What "good" looks like in this repo

- **Small, readable diffs.** Don't sneak in refactors that weren't asked for. If a refactor is needed for a fix, do it in a separate commit in the same PR with a clear message.
- **Comments explain "why", not "what".** The code already says what it does; comments should capture the non-obvious reason a line exists.
- **No emoji in source, commit messages, changelog entries, or UI strings.** The fancy-Unicode lint guard enforces this. Use ASCII punctuation.
- **No default exports.** Always named. Tree-shaking and auto-imports both depend on this.
- **`.js` extensions in imports.** Even from `.ts` sources — this is required by Node ESM resolution of the published build.

## GitHub Actions are pinned to SHAs

Every third-party action in `.github/workflows/` is pinned to a full commit SHA with the human version as a trailing comment, e.g.

```yaml
uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
```

This is a supply-chain hardening step recommended by the OpenSSF Scorecard: a moving tag like `@v4` could be repointed at a malicious commit by a compromised maintainer account, but a SHA cannot. Dependabot keeps the SHAs fresh. Approve those `chore(ci)` PRs like any other dependency bump.

If you are adding a new action, resolve its major-version tag to a SHA with `git ls-remote` and commit both the SHA and the version comment in the same `uses:` line.

## Releases

Every published package is versioned and shipped by [changesets](https://github.com/changesets/changesets) on merge to `main`. The full flow (and the snapshot release workflow for `v*` branches) is documented in the [Releases section of the README](./README.md#releases).

TL;DR:

- Your PR should include a `.changeset/*.md` file if it ships user-visible changes in a publishable package.
- After merge, a `chore: version packages` PR opens automatically. Merging that PR publishes the affected packages to npm.
- Branch previews publish to npm under a per-branch dist-tag (e.g. `pixi-reels@v0-2`) so reviewers can install work-in-progress versions without waiting for a merge.

## Reporting bugs and proposing features

Use the issue forms:

- [Bug report](./.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature request](./.github/ISSUE_TEMPLATE/feature_request.yml)

For security issues, follow [`SECURITY.md`](./SECURITY.md) and do not open a public issue.

## Crediting contributors

This project follows the [all-contributors](https://allcontributors.org) spec. Anyone who helps — code, docs, design, reviews, bug reports, ideas — gets credited in the README.

To add someone (or yourself), comment on any issue or PR:

```
@all-contributors please add @their-github-handle for code, doc
```

The bot opens a PR updating `.all-contributorsrc` and the contributors block in the README.
