/**
 * Conventional Commits enforcement.
 *
 * Format:   <type>(<scope>)!: <subject>
 * Example:  feat(spin): add skip() fast-path for anticipation phase
 *           fix(reel): release symbol pool on destroy
 *           chore: bump vite to 8.1
 *
 * `!` before the colon (or a `BREAKING CHANGE:` footer) marks a breaking
 * change — changeset needs a `major` bump alongside.
 *
 * Types:
 *   feat       new user-visible feature                  (minor bump)
 *   fix        bug fix                                   (patch bump)
 *   perf       performance improvement                   (patch bump)
 *   refactor   code change that doesn't change behaviour (patch bump)
 *   docs       README / ADR / AGENTS.md / site content   (no release)
 *   test       test-only changes                         (no release)
 *   build      build system / deps                       (no release)
 *   ci         github actions / tooling                  (no release)
 *   chore      everything else                           (no release)
 *   revert     revert of a previous commit               (patch bump)
 *
 * See .changeset/README.md for how commit messages map to changesets.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  // Skip bot-generated commits. Three matchers, in order of specificity:
  //   1. Co-authored-by trailer points at a [bot]@users.noreply.github.com
  //      address — the canonical signature of a GitHub-hosted bot
  //      (CodeQL Autofix, Dependabot, Renovate-on-GitHub, etc).
  //   2. CodeQL Autofix subject prefix, for older bot versions that
  //      omit the trailer.
  //   3. Dependabot's classic "Bumps X from Y to Z" subject.
  // commitlint defaults already skip merge/revert/squash/initial commits.
  ignores: [
    (commit) => /\[bot\]@users\.noreply\.github\.com/i.test(commit),
    (commit) => /^Potential fix for pull request finding/i.test(commit),
    (commit) => /^Bumps? \S+ from \S+ to \S+/.test(commit),
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'subject-case': [0],
    'subject-empty': [0],
    'type-empty': [0],
    'header-trim': [0],
    'header-max-length': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
