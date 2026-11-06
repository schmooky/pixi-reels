/**
 * The TypeDoc pages a topic page lists under API: every exported name that
 * the topic's prose, its demos body or its demo sources mention, with the
 * one-line summary TypeDoc wrote for it. Read from the frontmatter that
 * `scripts/postprocess-api.mjs` prepends to `src/pages/api/** /*.md`, so the
 * list can never drift from the generated reference; nothing here is typed in.
 */
import { parse } from 'yaml';

export type ApiKind = 'class' | 'function' | 'interface' | 'type' | 'variable';

export interface ApiEntry {
  name: string;
  kind: ApiKind;
  /** Site URL, e.g. `/api/classes/index.ReelSet/`. */
  url: string;
  /** TypeDoc's first paragraph, or its signature when there is no prose. */
  summary: string;
  /** True when `summary` is a code signature rather than prose. */
  signature: boolean;
}

const KIND_BY_DIR: Record<string, ApiKind> = {
  classes: 'class',
  functions: 'function',
  interfaces: 'interface',
  types: 'type',
  variables: 'variable',
};
const KIND_ORDER: ApiKind[] = ['class', 'function', 'interface', 'type', 'variable'];

// `src/pages/api` is TypeDoc output (gitignored); `pnpm api:gen` writes it and
// the predev / prebuild hooks run that first, so the glob is never empty here.
const apiFiles = import.meta.glob<string>('../pages/api/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function parseEntry(path: string, raw: string): ApiEntry | null {
  const m = path.match(/\/api\/([a-z]+)\/([^/]+)\.md$/);
  if (!m) return null;
  const [, dir, base] = m;
  const kind = KIND_BY_DIR[dir];
  if (!kind || base === 'index') return null;
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) throw new Error(`${path} has no frontmatter; run pnpm api:gen`);
  const data = parse(fm[1]) as { title?: string; description?: string };
  const name = (data.title ?? base).replace(/\(\)$/, '');
  const description = (data.description ?? '').trim();
  const fenced = description.match(/^```\w*\s*([\s\S]*?)\s*```$/);
  const summary = fenced ? fenced[1].replace(/\s+/g, ' ').trim() : description;
  return { name, kind, url: `/api/${dir}/${base}/`, summary, signature: Boolean(fenced) };
}

export const API_ENTRIES: ApiEntry[] = Object.entries(apiFiles)
  .map(([path, raw]) => parseEntry(path, raw))
  .filter((e): e is ApiEntry => e !== null)
  .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));

const BY_NAME = new Map(API_ENTRIES.map((e) => [e.name, e]));

const IDENT = /[A-Za-z_$][\w$]*/g;

/** Identifiers inside fenced blocks and backtick spans; prose words are not API mentions. */
function codeOfMarkdown(md: string): string {
  const fenced = [...md.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
  const spans = [...md.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return [...fenced, ...spans].join('\n');
}

/**
 * The API entries a topic mentions: in its Concept prose and demos body
 * (`markdown`, code spans and fences only) and in its demo sources (`code`).
 */
export function apiForTopic(input: { markdown: string[]; code: string[] }): ApiEntry[] {
  const text = [...input.markdown.map(codeOfMarkdown), ...input.code].join('\n');
  const seen = new Set<string>();
  for (const m of text.matchAll(IDENT)) {
    if (BY_NAME.has(m[0])) seen.add(m[0]);
  }
  return API_ENTRIES.filter((e) => seen.has(e.name));
}
