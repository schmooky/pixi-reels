#!/usr/bin/env node
/**
 * build-all-publishable
 *
 * Builds workspace packages in topological order using pnpm.
 *
 * Skips private packages (docs site + examples). Used by both the release
 * workflow (green signal before `changeset publish`) and the snapshot
 * workflow (fresh dist/ before the ephemeral bump).
 *
 * Usage:
 *   node scripts/build-all-publishable.mjs
 */
import { readdir, readFile, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Files at the repo root that every publishable package inherits so the
 * tarball on npm has legal + intro text. `files` in each package.json lists
 * the targets; this step makes sure they exist locally before `vite build`
 * (and before `changeset publish`).
 */
const ROOT_FILES_TO_COPY = ['README.md', 'LICENSE'];

async function syncRootFiles(pkgDir) {
  for (const name of ROOT_FILES_TO_COPY) {
    try {
      await copyFile(join(repoRoot, name), join(pkgDir, name));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

const SKIP_NAMES = new Set([
  '@pixi-reels/site',
  'classic-spin',
  'cascade-tumble',
  'hold-and-win',
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listWorkspacePackages() {
  const out = [];
  const packagesDir = join(repoRoot, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(packagesDir, e.name);
    let pkg;
    try {
      pkg = await readJson(join(dir, 'package.json'));
    } catch {
      continue;
    }
    if (!pkg.name || pkg.private || SKIP_NAMES.has(pkg.name)) continue;
    const deps = new Set();
    for (const map of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      if (!map) continue;
      for (const dep of Object.keys(map)) {
        // Internal deps — adapt the prefix if you ever publish under a scope.
        if (dep === 'pixi-reels' || dep.startsWith('@pixi-reels/')) deps.add(dep);
      }
    }
    out.push({
      name: pkg.name,
      version: pkg.version,
      dir,
      deps,
      hasBuild: !!(pkg.scripts && pkg.scripts.build),
    });
  }
  return out;
}

/** Kahn's algorithm. */
function topoSort(packages) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const indeg = new Map();
  for (const p of packages) indeg.set(p.name, 0);
  for (const p of packages) {
    for (const d of p.deps) {
      if (byName.has(d)) indeg.set(p.name, indeg.get(p.name) + 1);
    }
  }
  const queue = packages.filter((p) => indeg.get(p.name) === 0).map((p) => p.name);
  const order = [];
  while (queue.length > 0) {
    queue.sort();
    const name = queue.shift();
    order.push(name);
    for (const p of packages) {
      if (p.deps.has(name)) {
        const next = indeg.get(p.name) - 1;
        indeg.set(p.name, next);
        if (next === 0) queue.push(p.name);
      }
    }
  }
  if (order.length !== packages.length) {
    throw new Error(`Dependency cycle detected (${order.length} of ${packages.length} sorted)`);
  }
  return order.map((name) => byName.get(name));
}

function runBuild(pkg) {
  return new Promise((resolve, reject) => {
    console.log(`>>> building ${pkg.name}@${pkg.version}`);
    const child = spawn('pnpm', ['--filter', pkg.name, 'run', 'build'], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, SKIP_PREBUILD: '1' },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${pkg.name} build failed (exit ${code})`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const packages = await listWorkspacePackages();
  const ordered = topoSort(packages);
  console.log(`build-all-publishable: ${ordered.length} packages to build`);
  for (const p of ordered) console.log(`  ${p.name}${p.hasBuild ? '' : ' [no build]'}`);
  for (const p of ordered) {
    if (!p.hasBuild) continue;
    await syncRootFiles(p.dir);
    await runBuild(p);
  }
  console.log('build-all-publishable: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
