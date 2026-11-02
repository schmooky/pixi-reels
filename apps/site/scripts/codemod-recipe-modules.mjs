#!/usr/bin/env node
/**
 * codemod-recipe-modules
 *
 * Turn every `src/recipes/<slug>.recipe.ts` from a `@ts-nocheck` function body
 * that assumed 113 injected globals into a real TypeScript module:
 *
 *   import { ReelSetBuilder } from 'pixi-reels';
 *   import { pickWeighted, readout } from '@pixi-reels/kit';
 *   import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';
 *
 *   export const meta = { title, topic, tags, height?, needs? } as const satisfies RecipeMeta;
 *
 *   export default async function recipe({ app, assets }: RecipeContext): Promise<RecipeResult> {
 *     ...the body that was there, with real imports...
 *   }
 *
 * For each recipe it detects which globals the body references (after
 * blanking comments and string contents), emits the matching imports from
 * the table below, routes the host-provided values through the `RecipeContext`
 * (`app`, the atlas textures, the asset loaders, the sounds), turns
 * `new DebugPlaque(...)` into `readout.plaque(...)` so a host can switch the
 * explanation layer off, and derives `meta` from the umbrella MDX that embeds
 * the slug: the nearest `##` heading above its `<RecipeDemo>` marker, the
 * page slug, the page's frontmatter tags, and the marker's `height`.
 *
 * Idempotent in the sense that a file already starting with `import` is
 * skipped. Run once from `apps/site`:
 *
 *   node scripts/codemod-recipe-modules.mjs [--dry] [slug ...]
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECIPES = join(SITE, 'src/recipes');
const CONTENT = join(SITE, 'src/content');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ONLY = new Set(args.filter((a) => !a.startsWith('--')));

// ---------------------------------------------------------------------------
// Where every former global now comes from.
//
// `kind: 'import'` is an import of `name` (default: the global's own name)
// from `from`. `kind: 'ctx'` is a field of the RecipeContext. `kind: 'atlas'`
// is destructured from `assets.prototypeAtlas()`. `kind: 'assets'` and
// `kind: 'sounds'` rewrite a call `global(` into `assets.method(` or
// `sounds.method(`. `kind: 'readout'` rewrites `new DebugPlaque(` into
// `readout.plaque(`.

const ENGINE = [
  'ReelSetBuilder', 'SpeedPresets', 'WinPresenter', 'EmptySymbol', 'ReelSymbol', 'SpriteSymbol',
  'AnimatedSpriteSymbol', 'RectMaskStrategy', 'SharedRectMaskStrategy', 'RoundedRectMaskStrategy',
  'SilhouetteMaskStrategy', 'PathMaskStrategy', 'composeMasks', 'inset', 'HoldAndWinBuilder',
  'BoardGrid', 'anticipationForScatters', 'SpinTextureCache', 'StaticSpinSymbol',
  'prewarmSpinTextures', 'ReelPhase', 'StartPhase', 'SpinPhase', 'StopPhase', 'AnticipationPhase',
  'AdjustPhase', 'CascadeFallPhase', 'CascadePlacePhase', 'CascadeDropInPhase', 'resolveTumbleConfig',
  'CardSymbol', 'CARD_DECK', 'WILD_CARD', 'PhaseCardSymbol', 'PHASE_CARD_COLORS',
  'step', 'insertBefore', 'insertAfter', 'replaceStep', 'removeStep', 'runStep',
  'attachReelSounds', 'attachBoardSounds', 'zvukPort',
];
const KIT = [
  'BlurSpriteSymbol', 'CoinSymbol', 'COIN_TIER', 'COIN_FEATURE', 'COIN_MYSTERY', 'COIN_TRIGGER',
  'coinValue', 'coinMultiplier', 'drawCoin', 'pickWeighted',
  'SPINE_SETS', 'SPINE_SET_IDS', 'loadGeneratedSpines', 'buildSpineMap', 'loadThunderkickSpines',
  'buildThunderkickSpineMap', 'THUNDERKICK_SYMBOL_IDS', 'loadCascadeSpines', 'buildCascadeSpineMap',
  'CASCADE_SYMBOL_IDS', 'CASCADE_PLATE_W', 'CASCADE_PLATE_H',
  'CloverSymbol', 'cloverGridBackground', 'CLOVER_CELL', 'CLOVER_FRUITS', 'CLOVER_FEATURES',
  'CLOVER_SPEED', 'CLOVER_REEL_SPEED', 'CLOVER_SPEEDS', 'CLOVER_CELL_RADIUS', 'cloverCellMask',
];
const KIT_SPINE = [
  'GoldCoinSymbol', 'coinWaves', 'bezierFly', 'settleMoneyFace', 'freezeAtEnd', 'fitText',
  'CloverSpineSymbol', 'CLOVER_SPINE_MAP', 'CLOVER_SPINE_IDS',
];

/** @type {Record<string, {kind: string, from?: string, name?: string, method?: string}>} */
const TABLE = {};
for (const n of ENGINE) TABLE[n] = { kind: 'import', from: 'pixi-reels' };
for (const n of KIT) TABLE[n] = { kind: 'import', from: '@pixi-reels/kit' };
for (const n of KIT_SPINE) TABLE[n] = { kind: 'import', from: '@pixi-reels/kit/spine' };
TABLE.SpineReelSymbol = { kind: 'import', from: 'pixi-reels/spine' };
TABLE.Spine = { kind: 'import', from: '@esotericsoftware/spine-pixi-v8' };
TABLE.PIXI = { kind: 'namespace', from: 'pixi.js' };
TABLE.gsap = { kind: 'import', from: 'gsap' };
TABLE.SilkGraphics = { kind: 'import', from: 'pixi-silk' };
TABLE.DEBUG_FONT = { kind: 'import', from: 'pixi-reels/debug' };
TABLE.roundRectPath = { kind: 'import', from: 'pixi-reels/debug' };
TABLE.WinLines = { kind: 'import', from: 'pixi-reels/debug' };
TABLE.DebugPlaque = { kind: 'readout' };
TABLE.evaluateWays = { kind: 'import', from: '@pixi-reels/cheats/ways' };
TABLE.countWays = { kind: 'import', from: '@pixi-reels/cheats/ways' };
TABLE.app = { kind: 'ctx' };
TABLE.userSymbols = { kind: 'ctx' };
TABLE.userSymbolData = { kind: 'ctx' };
TABLE.textures = { kind: 'atlas' };
TABLE.blurTextures = { kind: 'atlas' };
TABLE.SYMBOL_IDS = { kind: 'symbolIds' };
TABLE.loadSpineSet = { kind: 'assets', method: 'spineSet' };
TABLE.loadHwCloverSpines = { kind: 'assets', method: 'cloverSpines' };
TABLE.loadHwClover = { kind: 'assets', method: 'clover' };
TABLE.loadHoldAndWinSprites = { kind: 'assets', method: 'holdAndWinSprites' };
TABLE.reelSounds = { kind: 'sounds', method: 'reelSounds' };
TABLE.boardSounds = { kind: 'sounds', method: 'boardSounds' };
// Site-only sound internals a recipe never reached for. Left unmapped on
// purpose: a use is reported, not silently imported from the site.
for (const n of ['DEFAULT_CUES', 'DEFAULT_BOARD_CUES', 'audio']) TABLE[n] = { kind: 'unsupported' };

/** Import order in the emitted file. */
const MODULE_ORDER = [
  'pixi.js', 'gsap', 'pixi-silk', '@esotericsoftware/spine-pixi-v8',
  'pixi-reels', 'pixi-reels/spine', 'pixi-reels/debug', '@pixi-reels/cheats/ways',
  '@pixi-reels/kit', '@pixi-reels/kit/spine',
];

// ---------------------------------------------------------------------------
// A small scanner: which characters are code, and which lines begin inside
// a template literal.

/**
 * Returns `code`, the source with comment bodies and string contents
 * blanked (same length, newlines kept), and `tplLine`, a boolean per line
 * saying whether that line STARTS inside a template literal, so indenting
 * it would change the string.
 */
function scan(src) {
  const out = src.split('');
  const tplLine = [];
  let line = 0;
  tplLine[0] = false;
  // state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block'
  const stack = []; // template nesting: each entry is the brace depth at `${`
  let state = 'code';
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '\n') {
      line++;
      tplLine[line] = state === 'tpl';
      continue;
    }
    switch (state) {
      case 'code':
        if (c === '/' && n === '/') { state = 'line'; out[i] = ' '; out[i + 1] = ' '; i++; }
        else if (c === '/' && n === '*') { state = 'block'; out[i] = ' '; out[i + 1] = ' '; i++; }
        else if (c === "'") state = 'sq';
        else if (c === '"') state = 'dq';
        else if (c === '`') state = 'tpl';
        else if (c === '{') depth++;
        else if (c === '}') {
          if (stack.length > 0 && stack[stack.length - 1] === depth) { stack.pop(); depth--; state = 'tpl'; }
          else depth--;
        }
        break;
      case 'sq':
        if (c === '\\') { out[i] = ' '; out[i + 1] = ' '; i++; }
        else if (c === "'") state = 'code';
        else out[i] = ' ';
        break;
      case 'dq':
        if (c === '\\') { out[i] = ' '; out[i + 1] = ' '; i++; }
        else if (c === '"') state = 'code';
        else out[i] = ' ';
        break;
      case 'tpl':
        if (c === '\\') { out[i] = ' '; if (n !== '\n') { out[i + 1] = ' '; i++; } }
        else if (c === '`') state = 'code';
        else if (c === '$' && n === '{') { depth++; stack.push(depth); state = 'code'; i++; }
        else out[i] = ' ';
        break;
      case 'line':
        if (n === '\n') state = 'code';
        out[i] = ' ';
        break;
      case 'block':
        if (c === '*' && n === '/') { state = 'code'; out[i] = ' '; out[i + 1] = ' '; i++; }
        else out[i] = ' ';
        break;
    }
  }
  return { code: out.join(''), tplLine };
}

/** Is `name` referenced as a free identifier in `code` (comments/strings blanked)? */
function references(code, name) {
  // Not a property (`x.name`), but a spread (`...name`) counts.
  const re = new RegExp(`(?<![\\w$])(?<![^.]\\.)${name}(?![\\w$])`, 'g');
  for (const m of code.matchAll(re)) {
    const after = code.slice(m.index + name.length).match(/^\s*(\S)/);
    if (after && after[1] === ':') {
      // `{ app: x }` is a key; `c ? app : x` is a reference.
      const before = code.slice(0, m.index).match(/(\S)\s*$/);
      if (!(before && before[1] === '?')) continue;
    }
    return true;
  }
  return false;
}

/** Does the recipe declare `name` itself (a local shadowing the old global)? */
function declares(code, name) {
  const patterns = [
    `\\b(?:const|let|var|class)\\s+${name}\\b`,
    `\\bfunction\\s*\\*?\\s*${name}\\s*\\(`,
    // Destructuring and parameter lists: `{ a, name }` / `(x, name)` before `=` or `=>`.
    `[{(,]\\s*${name}\\s*[,})]\\s*(?:=|=>)`,
    `[{(,]\\s*${name}\\s*[,})]\\s*\\)?\\s*=>`,
  ];
  return patterns.some((p) => new RegExp(p).test(code));
}

// ---------------------------------------------------------------------------
// Meta from the MDX pages.

async function mdxFiles(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await mdxFiles(p, `${prefix}${entry.name}/`)));
    else if (entry.name.endsWith('.mdx')) out.push({ path: p, id: `${prefix}${entry.name.replace(/\.mdx$/, '')}` });
  }
  return out;
}

function cleanHeading(h) {
  return h
    .replace(/^#+\s*/, '')
    .replace(/\s*\{#[^}]*\}\s*$/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** slug -> candidate placements, each { topic, collection, title, tags, height } */
async function collectMarkers() {
  const bySlug = new Map();
  for (const { path, id } of await mdxFiles(CONTENT)) {
    const src = await readFile(path, 'utf8');
    const fm = /^---\n([\s\S]*?)\n---/.exec(src);
    const data = fm ? parseYaml(fm[1]) ?? {} : {};
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    const collection = id.split('/')[0];
    const topic = collection === 'recipes' ? id.slice('recipes/'.length) : id;
    let heading = null;
    for (const line of src.split('\n')) {
      if (/^##\s/.test(line)) heading = cleanHeading(line);
      for (const m of line.matchAll(/<RecipeDemo\s+code="([^"]+)"([^>]*)\/>/g)) {
        const slug = m[1];
        const h = /height=\{(\d+)\}/.exec(m[2]);
        const placement = { topic, collection, title: heading, tags, height: h ? Number(h[1]) : undefined };
        if (!bySlug.has(slug)) bySlug.set(slug, []);
        bySlug.get(slug).push(placement);
      }
    }
  }
  return bySlug;
}

/** Pick the umbrella a recipe belongs to when it is embedded on several pages. */
function pickPlacement(slug, placements) {
  const rank = (p) => {
    if (p.collection === 'recipes' && slug.startsWith(p.topic)) return 0;
    if (p.collection === 'recipes') return 1;
    if (p.collection === 'guides') return 2;
    return 3;
  };
  return [...placements].sort((a, b) => rank(a) - rank(b))[0];
}

function humanize(slug) {
  return slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// The conversion.

function q(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function convert(slug, src, placement, report) {
  const lines = src.split('\n');
  let i = 0;
  if (lines[0].trim() === '// @ts-nocheck') i++;
  else report.push(`${slug}: no @ts-nocheck on line 1`);
  if (/^\/\/ Injected( globals)?:/.test(lines[i] ?? '')) {
    i++;
    // Continuation lines of the injected list: `//` + spaces + names.
    while (i < lines.length && /^\/\/\s{2,}[A-Za-z_$][\w$]*(\s*,\s*[A-Za-z_$][\w$]*)*\s*,?\s*$/.test(lines[i])) i++;
    if ((lines[i] ?? '').trim() === '//') i++;
  } else {
    report.push(`${slug}: no "Injected" header`);
  }
  while (i < lines.length && lines[i].trim() === '') i++;

  // A leading comment block describes the recipe: it goes above the function.
  const lead = [];
  while (i < lines.length && /^\/\//.test(lines[i])) lead.push(lines[i++]);
  if (lead.length > 0 && (lines[i] ?? '').trim() !== '') {
    // The comment was attached to the first statement, not the recipe: keep it in the body.
    i -= lead.length;
    lead.length = 0;
  }
  while (i < lines.length && lines[i].trim() === '') i++;

  let body = lines.slice(i).join('\n').replace(/\s+$/, '');

  // What the body reaches for.
  const { code } = scan(body);
  const used = Object.keys(TABLE).filter((n) => references(code, n) && !declares(code, n));
  const unknownUses = used.filter((n) => TABLE[n].kind === 'unsupported');
  for (const n of unknownUses) report.push(`${slug}: uses '${n}', which has no module to import from`);

  // Rewrites inside the body.
  const rewrite = (name, replacement) => {
    body = body.replace(new RegExp(`(?<![\\w$])(?<![^.]\\.)${name}\\s*\\(`, 'g'), `${replacement}(`);
  };
  const imports = new Map(); // module -> Set of names
  const add = (from, name) => {
    if (!imports.has(from)) imports.set(from, new Set());
    imports.get(from).add(name);
  };
  const ctx = new Set();
  const prelude = [];
  let readoutUsed = false;

  for (const n of used) {
    const t = TABLE[n];
    switch (t.kind) {
      case 'import': add(t.from, n); break;
      case 'namespace': add(t.from, `* as ${n}`); break;
      case 'ctx': ctx.add(n); break;
      case 'atlas': ctx.add('assets'); break;
      case 'symbolIds': ctx.add('assets'); break;
      case 'assets': ctx.add('assets'); rewrite(n, `assets.${t.method}`); break;
      case 'sounds': ctx.add('sounds'); rewrite(n, `sounds.${t.method}`); break;
      case 'readout':
        body = body.replace(/\bnew\s+DebugPlaque\s*\(/g, 'readout.plaque(');
        readoutUsed = true;
        // Anything left (a type, an instanceof) still needs the class.
        if (references(scan(body).code, 'DebugPlaque')) add('pixi-reels/debug', 'DebugPlaque');
        break;
      case 'unsupported': break;
    }
  }
  if (readoutUsed) add('@pixi-reels/kit', 'readout');

  const atlasNames = ['textures', 'blurTextures'].filter((n) => used.includes(n));
  if (atlasNames.length > 0 || used.includes('SYMBOL_IDS')) {
    const names = atlasNames.length > 0 ? atlasNames : ['textures'];
    prelude.push(`const { ${names.join(', ')} } = await assets.prototypeAtlas();`);
    if (used.includes('SYMBOL_IDS')) prelude.push('const SYMBOL_IDS = Object.keys(textures);');
  }

  // Asset needs, for `meta.needs`.
  const needs = [];
  const need = (n) => { if (!needs.includes(n)) needs.push(n); };
  if (atlasNames.length > 0 || used.includes('SYMBOL_IDS')) need('prototype-atlas');
  for (const m of body.matchAll(/assets\.spineSet\(\s*['"](\w+)['"]/g)) need(`spine:${m[1]}`);
  if (/assets\.holdAndWinSprites\(/.test(body) || body.includes('/hw-sprites/')) need('hw-sprites');
  if (body.includes('/hw-spine/')) need('hw-spine');
  if (/assets\.clover\(/.test(body)) need('hw-clover');
  if (/assets\.cloverSpines\(/.test(body)) need('hw-clover-spine');
  if (/assets\.spineSet\(\s*[^'"]/.test(body)) report.push(`${slug}: spineSet() with a non-literal id, needs not derived`);

  // Indent the body, except lines that begin inside a template literal.
  const { tplLine } = scan(body);
  const indented = body
    .split('\n')
    .map((l, k) => (l.trim() === '' || tplLine[k] ? l : `  ${l}`))
    .join('\n');
  const preludeText = prelude.length > 0 ? `${prelude.map((l) => `  ${l}`).join('\n')}\n\n` : '';

  // Imports.
  const out = [];
  for (const from of MODULE_ORDER) {
    const names = imports.get(from);
    if (!names) continue;
    const list = [...names].sort((a, b) => {
      const ns = (x) => x.startsWith('* as ');
      return ns(a) === ns(b) ? a.localeCompare(b) : ns(a) ? -1 : 1;
    });
    const ns = list.filter((n) => n.startsWith('* as '));
    const named = list.filter((n) => !n.startsWith('* as '));
    for (const n of ns) out.push(`import ${n} from ${q(from)};`);
    if (named.length > 0) {
      const oneLine = `import { ${named.join(', ')} } from ${q(from)};`;
      out.push(oneLine.length <= 100 ? oneLine : `import {\n${named.map((n) => `  ${n},`).join('\n')}\n} from ${q(from)};`);
    }
  }
  out.push(`import type { RecipeContext, RecipeMeta, RecipeResult } from '@pixi-reels/kit';`);
  out.push('');

  // Meta.
  const title = placement?.title ?? humanize(slug);
  if (!placement) report.push(`${slug}: not embedded by any page, meta.topic left empty`);
  else if (!placement.title) report.push(`${slug}: no ## heading above its marker in ${placement.topic}, title from slug`);
  out.push('export const meta = {');
  out.push(`  title: ${q(title)},`);
  out.push(`  topic: ${q(placement?.topic ?? '')},`);
  out.push(`  tags: [${(placement?.tags ?? []).map(q).join(', ')}],`);
  if (placement?.height !== undefined) out.push(`  height: ${placement.height},`);
  if (needs.length > 0) out.push(`  needs: [${needs.map(q).join(', ')}],`);
  out.push('} as const satisfies RecipeMeta;');
  out.push('');

  if (lead.length > 0) out.push(...lead);
  const ctxList = ['app', 'assets', 'sounds', 'userSymbols', 'userSymbolData'].filter((n) => ctx.has(n));
  const param = ctxList.length > 0 ? `{ ${ctxList.join(', ')} }: RecipeContext` : '_ctx: RecipeContext';
  out.push(`export default async function recipe(${param}): Promise<RecipeResult> {`);
  out.push(`${preludeText}${indented}`);
  out.push('}');
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------

const markers = await collectMarkers();
const files = (await readdir(RECIPES)).filter((f) => f.endsWith('.recipe.ts')).sort();
const report = [];
let converted = 0;
let skipped = 0;
for (const file of files) {
  const slug = file.replace(/\.recipe\.ts$/, '');
  if (ONLY.size > 0 && !ONLY.has(slug)) continue;
  const path = join(RECIPES, file);
  const src = await readFile(path, 'utf8');
  if (/^\s*import\b/m.test(src.split('\n').slice(0, 3).join('\n'))) { skipped++; continue; }
  const placements = markers.get(slug);
  const placement = placements ? pickPlacement(slug, placements) : null;
  const next = convert(slug, src, placement, report);
  if (!DRY) await writeFile(path, next);
  converted++;
}

console.log(`codemod-recipe-modules: ${converted} converted, ${skipped} already modules${DRY ? ' (dry run)' : ''}.`);
if (report.length > 0) {
  console.log('\nNeeds a look:');
  for (const r of report) console.log(`  - ${r}`);
}
