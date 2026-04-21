import type { APIRoute } from 'astro';
import { SITE } from '../lib/seo.ts';
import { DEMOS } from '../content/demos.ts';
import { RECIPES } from '../content/recipes.ts';
import { ARCH_PAGES } from '../content/architectureNav.ts';
import { GUIDES_NAV, WIKI_NAV } from '../content/nav.ts';

function url(path: string): string {
  return new URL(path, SITE.url).toString();
}

export const GET: APIRoute = async () => {
  const now = new Date().toISOString();

  type Entry = { loc: string; priority: string; changefreq: string };
  const entries: Entry[] = [];

  entries.push({ loc: url('/'), priority: '1.0', changefreq: 'weekly' });
  entries.push({ loc: url('/guides/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/docs/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/demos/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/sandbox/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/recipes/'), priority: '0.9', changefreq: 'weekly' });
  entries.push({ loc: url('/architecture/'), priority: '0.9', changefreq: 'weekly' });

  for (const r of RECIPES) {
    entries.push({ loc: url(`/recipes/${r.slug}/`), priority: '0.85', changefreq: 'monthly' });
  }
  for (const p of ARCH_PAGES) {
    entries.push({ loc: url(`/architecture/${p.slug}/`), priority: '0.85', changefreq: 'monthly' });
  }

  for (const section of [...GUIDES_NAV, ...WIKI_NAV]) {
    for (const item of section.items) {
      entries.push({ loc: url(item.href), priority: '0.8', changefreq: 'monthly' });
    }
  }
  for (const d of DEMOS) {
    entries.push({ loc: url(`/demos/${d.slug}/`), priority: '0.85', changefreq: 'monthly' });
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
          `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
