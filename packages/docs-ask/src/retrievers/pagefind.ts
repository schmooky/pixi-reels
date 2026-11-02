import type { Chunk, Retriever } from '../types.js';

export interface PagefindRetrieverOptions {
  /** URL of the Pagefind runtime, `/pagefind/pagefind.js` on a default build. */
  pagefindUrl?: string;
  /** Pagefind `options()` call, e.g. `{ baseUrl: '/' }`. */
  options?: Record<string, unknown>;
  /** Map a URL path to a section label for the citation. */
  sectionOf?: (url: string) => string;
  /**
   * Score multipliers by section label. Pagefind's ranking favours short,
   * repetitive pages, so a generated API reference crowds out topic pages;
   * the default demotes it unless the query is that page's title (a symbol
   * name looked up on purpose).
   */
  sectionWeights?: Record<string, number>;
}

interface PagefindModule {
  options(o: Record<string, unknown>): Promise<void>;
  search(q: string): Promise<{ results: Array<{ score: number; data(): Promise<PagefindResult> }> }>;
}

export const DEFAULT_SECTION_WEIGHTS: Record<string, number> = { 'API reference': 0.15, Api: 0.15, Changelog: 0.5, Home: 0.6 };
interface PagefindResult {
  url: string;
  excerpt: string;
  content: string;
  meta: Record<string, string>;
  sub_results?: Array<{ url: string; title: string; excerpt: string }>;
}

/**
 * Keyword fallback over the site's own Pagefind index. Needs no model
 * download, so it is what the box uses while the local model is still
 * loading or when the browser cannot run it.
 */
export class PagefindRetriever implements Retriever {
  private _mod: Promise<PagefindModule> | null = null;

  constructor(private readonly opts: PagefindRetrieverOptions = {}) {}

  private mod(): Promise<PagefindModule> {
    if (!this._mod) {
      const url = this.opts.pagefindUrl ?? '/pagefind/pagefind.js';
      this._mod = (async () => {
        // Hidden from the bundler: the file is written after the site build.
        const m = (await import(/* @vite-ignore */ url)) as PagefindModule;
        await m.options(this.opts.options ?? { baseUrl: '/' });
        return m;
      })();
      this._mod.catch(() => {
        this._mod = null;
      });
    }
    return this._mod;
  }

  async search(query: string, k: number): Promise<Chunk[]> {
    const q = query.trim();
    if (!q) return [];
    const pf = await this.mod();
    const res = await pf.search(q);
    const sectionOf = this.opts.sectionOf ?? defaultSection;
    const weights = this.opts.sectionWeights ?? DEFAULT_SECTION_WEIGHTS;
    const pool = await Promise.all(
      res.results.slice(0, Math.max(k * 4, 20)).map(async (r) => ({ score: r.score, p: await r.data() })),
    );
    const exact = q.toLowerCase().replace(/\s+/g, '');
    for (const h of pool) {
      const f = weights[h.p.meta.section ?? ''] ?? weights[sectionOf(h.p.url)];
      const title = (h.p.meta.title ?? '').toLowerCase().replace(/\s+|\(\)$/g, '');
      if (f !== undefined && title !== exact) h.score *= f;
    }
    pool.sort((a, b) => b.score - a.score);
    const pages = pool.slice(0, k).map((h) => h.p);
    return pages.map((p, i) => {
      const best = p.sub_results?.[0];
      const url = best?.url ?? p.url;
      const text = stripMarks(best?.excerpt ?? p.excerpt) || p.content.slice(0, 1200);
      const chunk: Chunk = {
        id: `pagefind:${url}`,
        url,
        section: p.meta.section ?? sectionOf(p.url),
        title: p.meta.title ?? p.url,
        text,
        tokens: Math.ceil(text.length / 4),
        score: 1 - i / Math.max(1, pages.length),
      };
      if (best?.title && best.title !== p.meta.title) chunk.heading = best.title;
      return chunk;
    });
  }
}

export function defaultSection(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const first = path.split('/').filter(Boolean)[0] ?? '';
  if (!first) return 'Home';
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
}

function stripMarks(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
