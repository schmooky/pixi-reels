#!/usr/bin/env node
/**
 * Make sure the auto-generated TypeDoc reference and the hand-written
 * narrative guides at /docs/api-* tell the same story.
 *
 * The contract:
 *   1. Every name exported from `pixi-reels/src/index.ts` (and the
 *      `/spine` and `/testing` subpaths) becomes a page under
 *      `apps/site/src/pages/api/`. TypeDoc emits that. no check needed.
 *   2. Every PUBLIC class / function we ship is named at least once in
 *      one of the hand-written guides under `apps/site/src/pages/docs/`
 *      or `apps/site/src/pages/guides/`. So a reader who finds the API
 *      reference by symbol name can always discover the narrative.
 *
 * Failure mode this catches: someone adds a new public export to the
 * library and forgets to mention it anywhere in prose. The CI gate
 * `pnpm api:check-sync` fails the PR with a list of missing names.
 *
 * Allowlist (`SKIP_IN_NARRATIVE`): trivial helpers, base classes that
 * are documented under their subclasses, and type-only aliases for
 * which narrative coverage would be noise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
const repoRoot = path.resolve(siteRoot, '..', '..');
const libRoot = path.resolve(repoRoot, 'packages', 'pixi-reels', 'src');

// Names that don't need a prose mention. Edit consciously; every entry
// is a deliberate "the auto-generated /api/ page is enough."
const SKIP_IN_NARRATIVE = new Set([
  // Re-exports of PixiJS types or trivial type aliases:
  'Matrix',
  'Position',
  'CellBounds',
  'SymbolPosition',
  'Win',
  // Single-purpose helpers:
  'pinKey',
  'computeDropOffsets',
  'sortByValueDesc',
  // Geometry config shapes. TypeDoc tables document every field; narrative
  // coverage lives in /guides/per-reel-geometry/ and /guides/big-symbols/
  // under the concepts, not the type names.
  'ReelConfig',
  'ReelGridConfig',
  'ReelExtraSymbols',
  'ReelAnchor',
  'ReelMaskRect',
  'MaskConfig',
  'MultiWaysConfig',
  'OffsetConfig',
  'NoOffsetConfig',
  'TrapezoidConfig',
  'OffsetXMode',
  // Per-cell helpers documented at higher level under the cascade/pin guides.
  'CellCoord',
  'PinMigration',
  'DropOffset',
  'FrameContext',
  // Symbol option records. each *Symbol class is documented; the Options
  // shape sits on its TypeDoc page.
  'AnimatedSpriteSymbolOptions',
  'SpriteSymbolOptions',
  'SpineSymbolOptions',
  'SpineReelSymbolOptions',
  'SymbolAnimOverrides',
  // Win/spotlight option records.
  'CycleOptions',
  'SpotlightOptions',
  'WinLine',
  'WinPresenterOptions',
  'WinSymbolAnim',
]);

// Pattern skips. names ending in these suffixes are documented purely by
// their TypeDoc page (a table of fields). The corresponding CONCEPT lives
// in narrative (e.g. `StopPhase` lifecycle), but each individual `*Config`
// shape doesn't earn a paragraph of prose.
const SKIP_SUFFIX_PATTERNS = [
  /PhaseConfig$/,
];

const ENTRY_FILES = [
  path.join(libRoot, 'index.ts'),
  path.join(libRoot, 'spine', 'index.ts'),
  path.join(libRoot, 'testing', 'index.ts'),
];

const NARRATIVE_GLOB_DIRS = [
  path.join(siteRoot, 'src', 'pages', 'docs'),
  path.join(siteRoot, 'src', 'pages', 'guides'),
];

function extractExports(entryFile) {
  const src = fs.readFileSync(entryFile, 'utf8');
  const names = new Set();
  // `export { Foo, Bar as Baz } from './x.js';` and `export { Foo, Bar };`
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      // Handle `Foo as Bar` -> we ship `Bar`.
      const renamed = trimmed.split(/\s+as\s+/);
      const name = (renamed[1] ?? renamed[0]).trim();
      if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
    }
  }
  // `export class Foo`, `export function bar`, `export const baz`
  for (const m of src.matchAll(/export\s+(?:abstract\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    names.add(m[1]);
  }
  return names;
}

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))) {
      out.push(full);
    }
  }
  return out;
}

function loadNarrativeText() {
  const files = NARRATIVE_GLOB_DIRS.flatMap(walkMarkdown);
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

function main() {
  const allExports = new Set();
  for (const entry of ENTRY_FILES) {
    if (!fs.existsSync(entry)) {
      console.error(`check-api-sync: entry file missing: ${entry}`);
      process.exit(1);
    }
    for (const n of extractExports(entry)) allExports.add(n);
  }

  const narrative = loadNarrativeText();
  const missing = [];
  for (const name of allExports) {
    if (SKIP_IN_NARRATIVE.has(name)) continue;
    if (SKIP_SUFFIX_PATTERNS.some((re) => re.test(name))) continue;
    // Look for the bare symbol name, word-bounded, anywhere in narrative.
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(narrative)) missing.push(name);
  }

  if (missing.length === 0) {
    console.log(`api:check-sync: OK. ${allExports.size} exports all referenced in narrative docs.`);
    return;
  }

  console.error(
    `api:check-sync: ${missing.length} export(s) shipped from pixi-reels are not mentioned in ` +
    `any narrative guide under apps/site/src/pages/{docs,guides}/.\n` +
    `Either add a prose mention or, if narrative coverage is genuinely not needed, ` +
    `add the name to SKIP_IN_NARRATIVE in scripts/check-api-sync.mjs.\n\n` +
    `Missing:\n  ${missing.sort().join('\n  ')}`,
  );
  process.exit(1);
}

main();
