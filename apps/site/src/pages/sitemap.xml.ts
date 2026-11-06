import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { SITE } from '../lib/seo.ts';
import { TOPICS } from '../content/topics.ts';
import { ARCH_PAGES } from '../content/architectureNav.ts';
import { LEARN_NAV, REFERENCE_NAV } from '../content/nav.ts';
import { FAQ_ANSWERED } from '../content/faq.ts';

// The site root, not this module's folder: at build the endpoint runs from
// a bundled chunk under dist/.prerender, where a path relative to it found
// nothing and the sitemap silently dropped all 340 API pages.
const apiPagesRoot = path.resolve(process.cwd(), 'src/pages/api');

function url(p: string): string {
  return new URL(p, SITE.url).toString();
}

/**
 * Walk the TypeDoc-generated /api/ pages and return their pretty URLs.
 * Each `.md` becomes a route like `/api/classes/ReelSet/`. The post-
 * processor leaves the original `index.<Name>.md` filenames in place, so
 * we strip the `.md` and percent-encode for safety.
 */
function apiRoutes(): string[] {
  if (!fs.existsSync(apiPagesRoot)) {
    throw new Error(`sitemap: ${apiPagesRoot} is missing, so the API pages would drop out of the sitemap. Run \`pnpm api:gen\` first.`);
  }
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, `${prefix}${e.name}/`);
      else if (e.isFile() && e.name.endsWith('.md')) {
        const base = e.name.slice(0, -3); // drop .md
        const route = base === 'index' ? `${prefix}` : `${prefix}${base}/`;
        out.push(`/api/${route}`);
      }
    }
  };
  walk(apiPagesRoot, '');
  return out;
}

export const GET: APIRoute = async () => {
  // lastmod intentionally omitted. Emitting the build timestamp for every
  // URL is a misleading signal that crawlers (Google in particular) discount.
  // If per-page mtime becomes worth threading through, plumb it from each
  // content source and add <lastmod> back per-entry.
  type Entry = { loc: string; priority: string; changefreq: string };
  const entries: Entry[] = [];

  entries.push({ loc: url('/'), priority: '1.0', changefreq: 'weekly' });
  entries.push({ loc: url('/learn/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/reference/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/studio/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/mechanics/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/faq/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/architecture/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/api/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/reference/changelog/'), priority: '0.7', changefreq: 'weekly' });

  for (const route of apiRoutes()) {
    entries.push({ loc: url(route), priority: '0.75', changefreq: 'monthly' });
  }

  for (const t of TOPICS) {
    entries.push({ loc: url(`/mechanics/${t.slug}/`), priority: '0.85', changefreq: 'monthly' });
  }
  for (const p of ARCH_PAGES) {
    entries.push({ loc: url(`/architecture/${p.slug}/`), priority: '0.85', changefreq: 'monthly' });
  }

  for (const section of [...LEARN_NAV, ...REFERENCE_NAV]) {
    for (const item of section.items) {
      entries.push({ loc: url(item.href), priority: '0.8', changefreq: 'monthly' });
    }
  }
  // Only ANSWERED questions have their own page; open ones live on /faq/.
  for (const q of FAQ_ANSWERED) {
    entries.push({ loc: url(`/faq/${q.id}/`), priority: '0.8', changefreq: 'monthly' });
  }

  // De-dup by loc
  const seen = new Set<string>();
  const unique = entries.filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)));

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    unique
      .map(
        (e) =>
          `  <url>\n    <loc>${e.loc}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
