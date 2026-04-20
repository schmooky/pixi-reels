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
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
