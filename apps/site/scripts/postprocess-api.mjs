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
 * Rewrite internal `.md` links to Astro's URL convention.
 *
 * TypeDoc emits links like `[X](../classes/index.X.md)` and
 * `[Y](./Y.md#anchor)`. Astro serves the rendered HTML at
 * `/api/classes/index.X/` (extension stripped, trailing slash). The
 * generated `.md` text was passing the literal `.md` URLs through, so a
 * click would either 404 or, on hosts that serve `.md` as a static file,
 * dump raw markdown into the browser.
 *
 * Rules:
 *   - `index.md` → `./`         (current dir's index)
 *   - `foo/index.md` → `foo/`   (subdir index)
 *   - `foo.md`  → `foo/`         (sibling page becomes a dir route)
 *   - external `http(s)://...md` URLs are left untouched
 *   - any `#fragment` suffix is preserved
 */
function rewriteMdLinks(content) {
  return content.replace(
    /\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g,
    (match, url, fragment) => {
      if (/^(?:https?:|mailto:|\/\/)/i.test(url)) return match;
      const frag = fragment ?? '';
      let rewritten;
      if (url === 'index.md') {
        rewritten = './';
      } else if (url.endsWith('/index.md')) {
        rewritten = url.slice(0, -'index.md'.length);
      } else {
        rewritten = `${url.slice(0, -'.md'.length)}/`;
      }
      return `](${rewritten}${frag})`;
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

  // Rewrite intra-doc `.md` links to Astro's extensionless URL form
  // BEFORE deriving title/description (so any links embedded in JSDoc
  // descriptions are clean by the time they land in frontmatter).
  content = rewriteMdLinks(content);

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
