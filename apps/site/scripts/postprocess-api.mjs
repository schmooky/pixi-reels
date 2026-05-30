#!/usr/bin/env node
/**
 * Post-process TypeDoc's markdown output to make it render under the
 * site's Docs layout.
 *
 * For every generated `src/pages/api/*.md` file:
 *   1. Compute the relative path back to `src/layouts/Docs.astro`.
 *   2. Derive a sensible `title` from the first `# Heading` line, or the
 *      file basename if the heading is missing.
 *   3. Prepend YAML frontmatter so Astro's filesystem router picks the
 *      file up with the site chrome (nav, footer, breadcrumbs, search).
 *
 * Skipped if the file already has frontmatter so re-runs are idempotent.
 *
 * Runs after `typedoc` as part of `pnpm api:gen`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..', 'src', 'pages', 'api');
const layoutsRoot = path.resolve(here, '..', 'src', 'layouts');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function relativeLayoutPath(mdFile) {
  // Astro markdown layout paths are interpreted relative to the source file.
  const layoutAbs = path.join(layoutsRoot, 'Docs.astro');
  const rel = path.relative(path.dirname(mdFile), layoutAbs);
  // Normalize Windows separators -> forward slashes for Astro.
  return rel.split(path.sep).join('/');
}

function pickTitle(content, fallback) {
  // Look for the first `# ...` heading.
  const m = content.match(/^#\s+(.+?)\s*$/m);
  if (!m) return fallback;
  // Strip TypeDoc's "Class: " / "Interface: " etc. prefix so the title in
  // the site nav reads as the symbol name, not the kind.
  return m[1].replace(/^(Class|Interface|Type Alias|Function|Variable|Enumeration|Module):\s*/, '');
}

function deriveDescription(content) {
  // First non-empty narrative paragraph after the title makes a decent
  // description. TypeDoc emits a "Defined in: <link>" line between the title
  // and the JSDoc summary; skip past it (and any other metadata-like leading
  // lines) until we land on real prose.
  const lines = content.split('\n');
  let foundTitle = false;
  let inParagraph = false;
  const para = [];
  const metadataLeader = /^(Defined in:|Extends:|Implements:|Type Parameters?:|Returns?:|Inherited from:|Overrides:)/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (!foundTitle) {
      if (line.startsWith('# ')) foundTitle = true;
      continue;
    }
    if (line.startsWith('#')) break; // next heading
    if (line === '') {
      if (inParagraph) break; // end of current paragraph
      continue; // still searching for prose
    }
    if (line.startsWith('|') || line.startsWith('-') || line.startsWith('*')) break; // tables / lists
    if (metadataLeader.test(line)) continue; // skip "Defined in:" etc.
    para.push(line);
    inParagraph = true;
  }
  const text = para.join(' ').replace(/\s+/g, ' ').slice(0, 200).trim();
  return text.length > 0 ? text : null;
}

/**
 * Compute the Astro URL where a TypeDoc-generated source file lands.
 *
 * `apps/site/src/pages/api/modules/spine.md`         → `/api/modules/spine/`
 * `apps/site/src/pages/api/modules/index.md`         → `/api/modules/`
 * `apps/site/src/pages/api/classes/index.ReelSet.md` → `/api/classes/index.ReelSet/`
 * `apps/site/src/pages/api/index.md`                 → `/api/`
 */
function fileToAstroUrl(file) {
  const rel = path.relative(apiRoot, file).split(path.sep).join('/');
  const noExt = rel.endsWith('.md') ? rel.slice(0, -3) : rel;
  if (noExt === 'index') return '/api/';
  if (noExt.endsWith('/index')) return `/api/${noExt.slice(0, -'index'.length)}`;
  return `/api/${noExt}/`;
}

/**
 * Rewrite internal `.md` links to absolute Astro URLs.
 *
 * TypeDoc emits links like `[X](../classes/index.X.md)` computed
 * relative to the SOURCE FILE'S directory on disk. The naive
 * "browser-resolves-against-page-URL" approach fails when Astro routes
 * a source file at a trailing-slash directory URL. e.g. source
 * `modules/spine.md` is served at `/api/modules/spine/`, so a browser
 * resolves `../classes/Y/` against that URL → `/api/modules/classes/Y/`
 * (wrong, the real file is at `/api/classes/Y/`).
 *
 * Correct algorithm:
 *   1. Resolve the link's path against the source file's directory on
 *      disk → the absolute path of the target source `.md` file.
 *   2. Convert that source path to its Astro URL via fileToAstroUrl().
 *   3. Emit the result as an absolute URL (no relative path at all).
 *
 * Untouched: external `http(s)://`, `mailto:`, protocol-relative `//`.
 * Preserved: any `#fragment` suffix on the link.
 */
function rewriteMdLinks(content, sourceFile) {
  const sourceDir = path.dirname(sourceFile);
  return content.replace(
    /\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g,
    (match, url, fragment) => {
      if (/^(?:https?:|mailto:|\/\/)/i.test(url)) return match;
      const frag = fragment ?? '';
      // Resolve the link's URL against the SOURCE file's directory on
      // disk. path.resolve handles `./` and `../` segments correctly.
      const targetSourceFile = path.resolve(sourceDir, url);
      const astroUrl = fileToAstroUrl(targetSourceFile);
      return `](${astroUrl}${frag})`;
    },
  );
}

function processFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.startsWith('---\n')) return false; // already has frontmatter

  const basename = path.basename(file, '.md');
  // Strip the `index.` prefix from TypeDoc's per-module symbol filenames so
  // titles read as `ReelSet`, not `index.ReelSet`.
  const cleanBase = basename.replace(/^(index|spine|testing)\./, '');

  // Rewrite intra-doc `.md` links to absolute Astro URLs BEFORE deriving
  // title/description (so any links embedded in JSDoc descriptions are
  // clean by the time they land in frontmatter). Absolute paths sidestep
  // the trailing-slash directory-routing depth-mismatch that bit
  // `modules/spine.md` (served at /api/modules/spine/, three levels deep
  // vs. the source file's two-level path).
  content = rewriteMdLinks(content, file);

  const title = pickTitle(content, cleanBase);
  const description = deriveDescription(content);
  const layout = relativeLayoutPath(file);

  const fm = ['---'];
  fm.push(`layout: '${layout}'`);
  fm.push(`title: '${title.replace(/'/g, "''")}'`);
  if (description) fm.push(`description: '${description.replace(/'/g, "''")}'`);
  fm.push(`section: 'api'`);
  fm.push('---');
  fm.push('');

  fs.writeFileSync(file, fm.join('\n') + content);
  return true;
}

function main() {
  if (!fs.existsSync(apiRoot)) {
    console.error(`postprocess-api: api dir not found at ${apiRoot}. Did typedoc run?`);
    process.exit(1);
  }
  const files = walk(apiRoot);
  let processed = 0;
  for (const f of files) {
    if (processFile(f)) processed++;
  }
  console.log(`postprocess-api: added frontmatter to ${processed}/${files.length} file(s).`);
}

main();
