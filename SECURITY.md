# Security Policy

## Supported versions

Only the latest release of each published workspace package receives security fixes. Snapshot releases published from version branches (e.g. `pixi-reels@v0-2`) are previews and do not have an SLA — upgrade to the corresponding stable release for fixes.

The docs site at https://pixi-reels.dev always tracks `main`.

## Reporting a vulnerability

**Please do not file a public GitHub issue for security reports.** Public issues can be seen by anyone watching the repo, which defeats the point of responsible disclosure.

Report privately via:

**GitHub Security Advisories** — preferred. Open a draft advisory at https://github.com/schmooky/pixi-reels/security/advisories/new. This keeps the report private between you and the maintainers and lets us coordinate a CVE if applicable.

When reporting, please include:

- A description of the issue and the affected component (package, branch, or deployed surface).
- Reproduction steps or a proof-of-concept. A small standalone reproducer is ideal.
- The version or commit SHA where you observed the issue.
- Any suggested mitigation, if you have one.

## What to expect

- Acknowledgement within a few days.
- An initial assessment and severity discussion within a week.
- For confirmed issues, a fix or mitigation plan, and coordinated disclosure once a patched release is available.

## Scope

In scope:

- Any workspace package under `packages/` published to npm.
- The docs site at https://pixi-reels.dev.
- CI and release tooling under `.github/workflows` and `scripts/` that could compromise the npm publish pipeline or the snapshot flow.

Out of scope:

- Bugs in bundled third-party runtimes (PixiJS, GSAP, Spine Runtime) — report upstream.
- Denial-of-service via feeding pathological inputs to a reel set (e.g. 10,000 reels) — we accept this as part of the product surface.
- Automated scanner output that does not include a reproducer.

Thanks for helping keep the project and its users safe.
