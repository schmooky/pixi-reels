# Getting help with pixi-reels

Thanks for using pixi-reels! This file explains where to ask what.

## I have a question

Open a [GitHub Discussion](https://github.com/schmooky/pixi-reels/discussions). That's the right place for:

- "How do I build mechanic X with pixi-reels?"
- "Which API should I use for Y?"
- "Is behavior Z a bug or working as intended?"
- Ideas you want to kick around before filing an issue.

## I think I found a bug

File a [bug report](https://github.com/schmooky/pixi-reels/issues/new?template=bug_report.yml). The form asks for reproduction steps and a minimal repro if relevant. Smaller reproducers get fixed first.

Before filing:

- Search existing issues — the same bug may already be tracked.
- Confirm you're on a recent version. Check the version in your `package.json` against the latest on npm.
- If possible, reproduce with a headless test using `createTestReelSet` from `pixi-reels` — that's the fastest diagnostic path.

## I have a feature idea

File a [feature request](https://github.com/schmooky/pixi-reels/issues/new?template=feature_request.yml) or open a Discussion first if you want feedback before committing to an issue. The project prefers small, focused changes, so "what problem are you trying to solve?" is usually the first question you'll get.

## I found a security issue

**Do not open a public issue.** Follow [`SECURITY.md`](./SECURITY.md) — the preferred channel is a private GitHub Security Advisory.

## I want to contribute

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow and [`AGENTS.md`](./AGENTS.md) for the house style and load-bearing design constraints. Both are enforced by lint guards, so they'll block a merge if ignored.

## Version support

See [`SECURITY.md`](./SECURITY.md#supported-versions). Only the latest release of each published package gets fixes. Snapshot releases from `v*` branches are previews and do not have an SLA.

## Commercial support

None offered at this time. If you'd like to sponsor a feature or a priority fix, reach out via the maintainers linked in the repo.
