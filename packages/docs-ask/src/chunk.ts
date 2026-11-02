import { approxTokens } from './tokens.js';
import type { Chunk } from './types.js';

export interface ChunkOptions {
  /** Merge adjacent runs of one page until a chunk reaches this many tokens. */
  minTokens?: number;
  /** Split a run that exceeds this many tokens at paragraph, then line, boundaries. */
  maxTokens?: number;
  /** URL used for text that appears before the first page heading. */
  siteUrl?: string;
}

/**
 * Chunk an llms.txt-style corpus by heading.
 *
 * The grammar the chunker understands is the one `build-llms.mjs` writes:
 *
 *     ## Section label
 *     ### Page title
 *     URL: https://site/page/
 *     body text, optionally with
 *     #### Sub heading
 *     URL: https://site/page/#anchor      (optional deep link for this run)
 *     more body text
 *
 * `#` lines inside fenced code blocks are body text. Runs under the same URL
 * are merged until `minTokens`; a run above `maxTokens` is split on blank
 * lines (fenced blocks stay whole when they fit), then on single lines.
 * Runs with different URLs never merge, so a short FAQ answer keeps its own
 * deep link instead of being folded into its neighbour.
 */
export function chunkCorpus(markdown: string, opts: ChunkOptions = {}): Chunk[] {
  const minTokens = opts.minTokens ?? 300;
  const maxTokens = opts.maxTokens ?? 600;
  const siteUrl = (opts.siteUrl ?? '').replace(/\/$/, '');

  const runs = parseRuns(markdown.split('\n'), siteUrl);
  const out: Chunk[] = [];
  const perUrl = new Map<string, number>();

  const push = (run: Run, text: string) => {
    const body = text.trim();
    if (!body) return;
    const n = perUrl.get(run.url) ?? 0;
    perUrl.set(run.url, n + 1);
    const chunk: Chunk = {
      id: `${pathOf(run.url)}#${n}`,
      url: run.url,
      section: run.section,
      title: run.title,
      text: body,
      tokens: approxTokens(body),
    };
    if (run.heading) chunk.heading = run.heading;
    out.push(chunk);
  };

  let i = 0;
  while (i < runs.length) {
    const run = runs[i]!;
    const own = approxTokens(run.text);
    if (own > maxTokens) {
      for (const piece of splitLong(run.text, maxTokens)) push(run, piece);
      i++;
      continue;
    }
    // Merge forward while the next run shares the URL and fits.
    let text = run.text;
    let tokens = own;
    let j = i + 1;
    while (
      tokens < minTokens &&
      j < runs.length &&
      runs[j]!.url === run.url &&
      tokens + approxTokens(runs[j]!.text) <= maxTokens
    ) {
      const next = runs[j]!;
      text += `\n\n${next.heading ? `${next.heading}\n` : ''}${next.text}`;
      tokens = approxTokens(text);
      j++;
    }
    push(run, text);
    i = j;
  }
  return out;
}

interface Run {
  section: string;
  title: string;
  url: string;
  heading?: string;
  text: string;
}

function parseRuns(lines: string[], siteUrl: string): Run[] {
  const runs: Run[] = [];
  let section = '';
  let title = '';
  let pageUrl = siteUrl ? `${siteUrl}/` : '';
  let current: Run | null = null;
  let inFence = false;
  // A `URL:` line right after a heading belongs to that heading.
  let awaitingUrl: 'page' | 'run' | null = null;

  const flush = () => {
    if (current && current.text.trim()) runs.push({ ...current, text: current.text.trim() });
    current = null;
  };
  const startRun = (heading?: string) => {
    flush();
    current = { section, title, url: pageUrl, text: '' };
    if (heading) current.heading = heading;
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^```/.test(line)) {
      inFence = !inFence;
      if (!current) startRun();
      current!.text += `${line}\n`;
      awaitingUrl = null;
      continue;
    }
    if (inFence) {
      current!.text += `${line}\n`;
      continue;
    }
    if (awaitingUrl) {
      const m = line.match(/^URL:\s*(\S+)\s*$/);
      if (m) {
        if (awaitingUrl === 'page') pageUrl = m[1]!;
        if (current) current.url = m[1]!;
        awaitingUrl = null;
        continue;
      }
      awaitingUrl = null;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.+?)\s*$/))) {
      // The corpus title. Text under it, before any section, is site-level.
      flush();
      section = m[1]!;
      title = m[1]!;
      continue;
    }
    if ((m = line.match(/^##\s+(.+?)\s*$/))) {
      flush();
      section = m[1]!;
      title = m[1]!;
      pageUrl = siteUrl ? `${siteUrl}/` : '';
      continue;
    }
    if ((m = line.match(/^###\s+(.+?)\s*$/))) {
      flush();
      title = stripMarkdown(m[1]!);
      pageUrl = siteUrl ? `${siteUrl}/` : '';
      awaitingUrl = 'page';
      // The run opens lazily on the first body line so the URL line can land first.
      current = { section, title, url: pageUrl, text: '' };
      continue;
    }
    if ((m = line.match(/^#{4,6}\s+(.+?)\s*$/))) {
      startRun(stripMarkdown(m[1]!));
      awaitingUrl = 'run';
      continue;
    }
    if (!current) startRun();
    current!.text += `${line}\n`;
  }
  flush();
  return runs;
}

/** Split text over `maxTokens` on blank lines, keeping fenced blocks whole when they fit. */
export function splitLong(text: string, maxTokens: number): string[] {
  const paragraphs = splitParagraphs(text);
  const out: string[] = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = '';
  };
  for (const p of paragraphs) {
    if (approxTokens(p) > maxTokens) {
      flush();
      out.push(...splitLines(p, maxTokens));
      continue;
    }
    if (buf && approxTokens(`${buf}\n\n${p}`) > maxTokens) flush();
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  flush();
  return out;
}

function splitParagraphs(text: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === '') {
      if (buf.length) out.push(buf.join('\n'));
      buf = [];
      continue;
    }
    buf.push(line);
  }
  if (buf.length) out.push(buf.join('\n'));
  return out;
}

function splitLines(text: string, maxTokens: number): string[] {
  const out: string[] = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if (buf && approxTokens(`${buf}\n${line}`) > maxTokens) {
      out.push(buf);
      buf = '';
    }
    buf = buf ? `${buf}\n${line}` : line;
  }
  if (buf) out.push(buf);
  return out;
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\\([<>*_`])/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .trim();
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.hash}`;
  } catch {
    return url || '/';
  }
}
