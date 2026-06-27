/**
 * One-shot migration: src/pages/{recipes,guides,docs}/*.mdx (route-as-content)
 * → src/content/{recipes,guides,docs}/*.mdx (Keystatic content collections).
 *
 * Surgically rewrites only the infra embeds (RecipeRunner / RecipeFrame /
 * RecipeImage and their `?raw` code imports) into <RecipeDemo> / <Image>
 * markers; prose and code fences are left byte-for-byte intact. Frontmatter is
 * rebuilt from the canonical RECIPES metadata + each file's own frontmatter.
 *
 * Run from apps/site:  node scripts/migrate-content.mjs
 */
import { stringify, parse } from 'yaml';
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = resolve(import.meta.dirname, '..');
// Canonical metadata + ordering come from the ORIGINAL hand-curated array at
// git HEAD (recipes.ts is rewritten to derive from frontmatter, so it can't be
// the ordering source). `order` = the recipe's global index in that array, so
// sorting by (group, order) reproduces the original within-group sequence.
const { execSync } = await import('node:child_process');
const oldSrc = execSync('git show HEAD:apps/site/src/content/recipes.ts', { cwd: SITE }).toString();
const oldPath = resolve(SITE, 'scripts/.recipes-head.ts');
writeFileSync(oldPath, oldSrc);
const { RECIPES } = await import(oldPath);
rmSync(oldPath, { force: true });
const RECIPE_BY_SLUG = new Map(RECIPES.map((r) => [r.slug, r]));
const RECIPE_INDEX = new Map(RECIPES.map((r, i) => [r.slug, i]));

// Editorial order from the hand-maintained nav (files not listed get appended).
const GUIDE_ORDER = [
  'getting-started', 'your-first-reelset', 'your-first-cascade', 'symbols', 'pins',
  'spin-lifecycle', 'cascades', 'per-reel-geometry', 'multiways', 'big-symbols',
  'buffer-indexing', 'nudge', 'speed-modes', 'win-animations', 'hold-and-win',
  'cheats-and-testing', 'debugging', 'recipe-previews',
];
const DOC_ORDER = ['api-reelset', 'api-builder', 'api-events', 'api-phases', 'migrating-to-1-0', 'glossary'];

const warnings = [];

function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('no frontmatter');
  return { fm: parse(m[1]) ?? {}, body: m[2] };
}

/** Strip infra imports, capture `?raw` var → code basename. */
function stripImports(body) {
  const codeVars = new Map(); // varName -> recipe basename
  const lines = body.split('\n');
  const kept = [];
  for (const line of lines) {
    const raw = line.match(/^import\s+(\w+)\s+from\s+['"][^'"]*\/recipes\/([^'"]+)\.recipe\.ts\?raw['"];?\s*$/);
    if (raw) { codeVars.set(raw[1], raw[2]); continue; }
    if (/^import\s+.*\bfrom\s+['"][^'"]*\/(RecipeRunner|RecipeFrame|RecipeImage)(\.\w+)?['"];?\s*$/.test(line)) continue;
    kept.push(line);
  }
  return { body: kept.join('\n'), codeVars };
}

/** <RecipeFrame ...><RecipeRunner code={var} height={h?} .../></RecipeFrame> → <RecipeDemo .../> */
function rewriteDemos(body, codeVars, slug) {
  return body.replace(
    /<RecipeFrame\b([^>]*)>\s*<RecipeRunner\b([\s\S]*?)\/>\s*<\/RecipeFrame>/g,
    (_all, frameAttrs, runnerAttrs) => {
      const codeM = runnerAttrs.match(/code=\{(\w+)\}/);
      const name = codeM ? codeVars.get(codeM[1]) ?? slug : slug;
      const heightM = runnerAttrs.match(/height=\{(\d+)\}/) || frameAttrs.match(/height=\{(\d+)\}/);
      const height = heightM ? ` height={${heightM[1]}}` : '';
      return `<RecipeDemo code="${name}"${height} />`;
    },
  );
}

/** <RecipeImage .../> → <Image .../> (same attrs). */
function rewriteImages(body) {
  return body.replace(/<RecipeImage\b/g, '<Image').replace(/<\/RecipeImage>/g, '</Image>');
}

function checkLeftovers(body, slug) {
  if (/^import\s/m.test(body.replace(/```[\s\S]*?```/g, ''))) warnings.push(`${slug}: leftover top-level import`);
  const tags = (body.replace(/```[\s\S]*?```/g, '').match(/<(RecipeRunner|RecipeFrame|RecipeImage)\b/g)) || [];
  if (tags.length) warnings.push(`${slug}: leftover embed ${tags.join(',')}`);
}

function migrateRecipes() {
  const dir = resolve(SITE, 'src/pages/recipes');
  const out = resolve(SITE, 'src/content/recipes');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const groupSeq = new Map();
  let n = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mdx'))) {
    const slug = file.replace(/\.mdx$/, '');
    const meta = RECIPE_BY_SLUG.get(slug);
    if (!meta) { warnings.push(`recipe ${slug}: not in RECIPES — skipped`); continue; }
    const { fm, body: rawBody } = splitFrontmatter(readFileSync(resolve(dir, file), 'utf8'));
    let { body, codeVars } = stripImports(rawBody);
    body = rewriteDemos(body, codeVars, slug);
    body = rewriteImages(body).trimStart();
    checkLeftovers(body, slug);

    const front = {
      title: meta.title,
      group: meta.group,
      oneLiner: meta.oneLiner,
      description: fm.description ?? meta.oneLiner,
      order: RECIPE_INDEX.get(slug) ?? 999,
      steps: meta.steps ?? [],
      apis: meta.apis ?? [],
      tags: meta.tags ?? [],
    };
    if (meta.image) front.image = meta.image;
    writeFileSync(resolve(out, file), `---\n${stringify(front)}---\n\n${body}`);
    n++;
  }
  return n;
}

function migrateDocsLike(srcName, orderList) {
  const dir = resolve(SITE, `src/pages/${srcName}`);
  const out = resolve(SITE, `src/content/${srcName}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let n = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mdx'))) {
    const slug = file.replace(/\.mdx$/, '');
    const { fm, body: rawBody } = splitFrontmatter(readFileSync(resolve(dir, file), 'utf8'));
    let { body, codeVars } = stripImports(rawBody);
    body = rewriteDemos(body, codeVars, slug);
    body = rewriteImages(body).trimStart();
    checkLeftovers(body, slug);

    const idx = orderList.indexOf(slug);
    const front = { title: fm.title ?? slug, order: idx === -1 ? 100 : idx };
    if (fm.eyebrow) front.eyebrow = fm.eyebrow;
    if (fm.description) front.description = fm.description;
    writeFileSync(resolve(out, file), `---\n${stringify(front)}---\n\n${body}`);
    n++;
  }
  return n;
}

const r = migrateRecipes();
const g = migrateDocsLike('guides', GUIDE_ORDER);
const d = migrateDocsLike('docs', DOC_ORDER);
console.log(`Migrated ${r} recipes, ${g} guides, ${d} docs.`);
if (warnings.length) {
  console.log('\n[!] Needs manual review:');
  for (const w of warnings) console.log('  - ' + w);
} else {
  console.log('No leftovers — clean.');
}
