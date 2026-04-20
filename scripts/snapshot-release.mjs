#!/usr/bin/env node
/**
 * snapshot-release
 *
 * Publish a changeset "snapshot" release of every publishable package on
 * the current branch. Snapshot versions look like `<base>-<tag>-<timestamp>`
 * and are published to npm under a custom dist-tag.
 *
 * If there are no pending `.changeset/*.md` files, an ephemeral one is
 * generated so nightlies (and branch-push snapshots) always publish.
 * The generated file is deleted at the end — nothing is committed.
 *
 * Usage:
 *   node scripts/snapshot-release.mjs              # infer tag from branch
 *   node scripts/snapshot-release.mjs --tag v0-2   # explicit tag
 *   SNAPSHOT_TAG=v0-2 node scripts/snapshot-release.mjs
 *
 * Exit codes:
 *   0 - published (or nothing to publish)
 *   1 - real failure
 */

import { spawnSync } from 'node:child_process';
import { readdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const changesetDir = join(repoRoot, '.changeset');

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with status ${result.status}`);
  }
}

function sanitizeTag(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseArgTag(argv) {
  const i = argv.indexOf('--tag');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return null;
}

function currentBranch() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
  if (r.status !== 0) return '';
  return r.stdout.toString().trim();
}

async function listPendingChangesets() {
  try {
    const entries = await readdir(changesetDir);
    return entries.filter((f) => f.endsWith('.md') && f !== 'README.md');
  } catch {
    return [];
  }
}

/** Write a throwaway changeset that bumps `pixi-reels` patch so `changeset
 * version --snapshot <tag>` has something to stamp. Returns the absolute
 * path to clean up later. */
async function writeEphemeralChangeset(tag) {
  const name = `snapshot-${tag}-${Date.now()}.md`;
  const path = join(changesetDir, name);
  const body = `---\n'pixi-reels': patch\n---\n\nsnapshot build (${tag})\n`;
  await writeFile(path, body, 'utf8');
  console.log(`[snapshot] ephemeral changeset written: ${name}`);
  return path;
}

async function main() {
  const tag = sanitizeTag(process.env.SNAPSHOT_TAG || parseArgTag(process.argv) || currentBranch());
  if (!tag) {
    console.error('[snapshot] could not determine a dist-tag (set SNAPSHOT_TAG or --tag).');
    process.exit(1);
  }
  if (tag === 'main') {
    console.error('[snapshot] refusing to publish a snapshot from main - use the regular release flow.');
    process.exit(1);
  }

  const pending = await listPendingChangesets();
  const ephemerals = [];
  if (pending.length === 0) {
    console.log('[snapshot] no pending changesets - generating an ephemeral one so nightly still publishes.');
    ephemerals.push(await writeEphemeralChangeset(tag));
  }

  console.log(`[snapshot] preparing snapshot release with dist-tag "${tag}"`);

  try {
    // Ephemeral version bump. `--snapshot <tag>` rewrites versions in-place;
    // the workflow discards the change at the end (no commit, no tag).
    run('npx', ['changeset', 'version', '--snapshot', tag]);

    // Build publishable packages topologically so dist/ is fresh before publish.
    run('pnpm', ['build:all']);

    // Publish under the custom dist-tag without creating git tags or committing.
    run('npx', ['changeset', 'publish', '--no-git-tag', '--tag', tag, '--snapshot']);
  } finally {
    for (const p of ephemerals) {
      try {
        await rm(p);
        console.log(`[snapshot] removed ephemeral changeset ${p.split('/').pop()}`);
      } catch {
        /* best effort */
      }
    }
  }
}

main().catch((err) => {
  console.error('[snapshot] failed:', err.message || err);
  process.exit(1);
});
