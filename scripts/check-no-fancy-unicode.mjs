#!/usr/bin/env node
/**
 * check-no-fancy-unicode
 *
 * House style guard: source, tests, MDX, and commit messages should use
 * ASCII punctuation. No smart quotes, no em-dashes from autocorrect.
 * Emoji are allowed everywhere now (any RGI emoji cluster passes). The
 * docs site also uses some symbolic characters (the marquee, code surface
 * styling) which stay allow-listed below.
 *
 * Runs:
 *   - CI (as part of `pnpm check:lint`)
 *   - pre-commit via lint-staged
 *
 * Usage:
 *   node scripts/check-no-fancy-unicode.mjs                 # scan defaults
 *   node scripts/check-no-fancy-unicode.mjs file1.ts file2  # scan specific files (lint-staged mode)
 *
 * Requires Node 20+ (regex `v` flag / unicodeSets, Intl.Segmenter).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// Default dirs scanned by `pnpm check:lint` (and CI). Wide on purpose: any
// drift anywhere in the repo should fail the lint. Lint-staged passes
// explicit file paths, so that flow is unaffected.
const DEFAULT_GLOBS = [
  'packages',
  'apps',
  'examples/shared',
  'examples/classic-spin/src',
  'examples/cascade-tumble/src',
  'examples/big-symbols/src',
  'examples/multiways/src',
  'examples/pyramid-cascade/src',
  'docs',
  'scripts',
  '.github',
  '.changeset',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'README.md',
];

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.astro', '.vite', 'coverage',
  'assets',         // examples/assets/* binary atlas / texture metadata, not ours
  '.git',
]);

// Non-emoji characters that are allowed in source despite being non-ASCII.
// Emoji are handled separately by the RGI matcher below, so this list only
// needs the typography / box-drawing / math / UI glyphs already used in the
// codebase. Keep it tight: the spirit of the guard is "no drift from smart
// quotes or autocorrect."
const ALLOWED_NON_ASCII = new Set([
  '→', '←', '↑', '↓',     // arrows used in ASCII-diagram comments
  '·',                     // middle dot in status lines
  '—', '–',                // em/en dashes in comments and docs
  '…',                     // ellipsis (sparingly used)
  '×', '≥', '≤', '±', '⇒', // math glyphs in comments
  'Δ', 'δ', 'Σ', 'σ', 'π',  // Greek math letters in docs ("Chebyshev |Δreel|")
  '◆', '◎', '★',           // UI bullets already adopted on the site
  '✓', '✗',                // check / cross marks for toggle + script status lines
  '♥', '✦', '◉', '◔',      // decorative glyphs on the classic-lines demo symbols
  '♣', '♛',                // card-suit / crown glyphs baked into generated-symbols icons
  '▶', '◀', '▲', '▼',      // solid-triangle arrowheads for ASCII flow diagrams
  '⌘',                     // Mac Cmd-key glyph in keyboard-shortcut UI (Pagefind search)
  // Box drawing characters: used by the debug ASCII grid and by
  // comment banners like `// --- Section ---`.
  '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
  '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
]);

// Whole-emoji matcher. The `v` flag's RGI_Emoji property matches recommended
// emoji as single units, including ZWJ sequences, skin-tone modifiers, flags,
// keycaps, and VS16-qualified glyphs. Anchored so we only skip a grapheme
// that is *entirely* one emoji.
const EMOJI_RE = /^\p{RGI_Emoji}$/v;

// Grapheme segmenter so emoji clusters (ZWJ / flags / modifiers) are seen as
// one unit per UAX #29 instead of a pile of astral code points + ZWJ + VS16.
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

// Any code point outside ASCII printable + tab/newline that isn't an emoji
// and isn't in the allow-list fails the check. This catches smart-quote
// drift while letting emoji through.
function offendersInLine(line) {
  const out = [];
  for (const { segment } of segmenter.segment(line)) {
    if (EMOJI_RE.test(segment)) continue;        // whole emoji cluster, allowed
    for (const ch of segment) {                  // for..of iterates code points (surrogates join)
      const code = ch.codePointAt(0);
      if (code < 0x80) continue;                 // ASCII
      if (ALLOWED_NON_ASCII.has(ch)) continue;
      out.push(ch);
    }
  }
  return out;
}

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|md|mdx|astro|yml|yaml|json)$/.test(e.name)) yield p;
  }
}

function scanFile(p) {
  let bad = [];
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const offenders = offendersInLine(lines[i]);
    if (offenders.length > 0) bad.push({ line: i + 1, chars: offenders, content: lines[i] });
  }
  return bad;
}

const cliArgs = process.argv.slice(2);
let targets;
if (cliArgs.length > 0) {
  targets = cliArgs.filter((f) => fs.existsSync(f));
} else {
  targets = [];
  for (const rel of DEFAULT_GLOBS) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      for (const f of walk(abs)) targets.push(f);
    } else if (stat.isFile()) {
      targets.push(abs);
    }
  }
}

let failed = false;
for (const f of targets) {
  let bad;
  try { bad = scanFile(f); } catch { continue; }
  if (bad.length > 0) {
    failed = true;
    console.error(`\n${path.relative(repoRoot, f)}`);
    for (const b of bad) {
      console.error(`  line ${b.line}: disallowed char(s) ${b.chars.map((c) => JSON.stringify(c)).join(', ')}`);
      console.error(`    ${b.content.trim().slice(0, 160)}`);
    }
  }
}

if (failed) {
  console.error('\nFancy-unicode guard failed. Use ASCII punctuation or add the character to ALLOWED_NON_ASCII in scripts/check-no-fancy-unicode.mjs with a reason.');
  process.exit(1);
}

process.exit(0);
