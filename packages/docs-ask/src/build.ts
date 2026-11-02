import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chunkCorpus, type ChunkOptions } from './chunk.js';
import { createEmbedder, embeddingText, DEFAULT_MODEL } from './embedder.js';
import { quantize, toBase64 } from './quantize.js';
import type { AskIndex, IndexedChunk } from './types.js';

export interface BuildOptions extends ChunkOptions {
  /** Path to the llms.txt corpus. */
  corpus: string;
  /** Directory that receives `index.json`. */
  outDir: string;
  model?: string;
  /** Weight cache; defaults to `node_modules/.cache/docs-ask` next to the package. */
  cacheDir?: string;
  /** Chunks per embedding call. */
  batchSize?: number;
  log?: (line: string) => void;
}

export interface BuildResult {
  outFile: string;
  chunks: number;
  bytes: number;
  ms: number;
  /** True when a cached index for this corpus hash was copied instead of re-embedded. */
  cached: boolean;
}

/**
 * Chunk the corpus, embed every chunk with the local model and write
 * `index.json`. The result is cached under `cacheDir` by corpus hash and
 * model, so a rebuild with an unchanged llms.txt costs a file copy.
 */
export async function buildIndex(opts: BuildOptions): Promise<BuildResult> {
  const t0 = Date.now();
  const log = opts.log ?? (() => {});
  const model = opts.model ?? DEFAULT_MODEL;
  const corpus = await readFile(opts.corpus, 'utf-8');
  const corpusHash = createHash('sha256').update(model).update('\0').update(corpus).digest('hex');
  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  const cacheFile = join(cacheDir, 'index', `${corpusHash.slice(0, 16)}.json`);
  const outFile = join(opts.outDir, 'index.json');
  await mkdir(opts.outDir, { recursive: true });

  if (await exists(cacheFile)) {
    const json = await readFile(cacheFile, 'utf-8');
    await writeFile(outFile, json);
    const n = (JSON.parse(json) as AskIndex).chunks.length;
    log(`[docs-ask] corpus unchanged; copied cached index (${n} chunks) to ${outFile}`);
    return { outFile, chunks: n, bytes: Buffer.byteLength(json), ms: Date.now() - t0, cached: true };
  }

  const siteUrl = opts.siteUrl ?? detectSiteUrl(corpus);
  const chunks = chunkCorpus(corpus, { ...opts, siteUrl });
  log(`[docs-ask] ${chunks.length} chunks from ${opts.corpus} (site ${siteUrl || 'unknown'})`);

  const embedder = await createEmbedder({ model, dtype: 'q8', cacheDir: join(cacheDir, 'models') });
  const batch = opts.batchSize ?? 16;
  const indexed: IndexedChunk[] = [];
  for (let i = 0; i < chunks.length; i += batch) {
    const slice = chunks.slice(i, i + batch);
    const vecs = await embedder.embed(slice.map(embeddingText));
    slice.forEach((c, j) => {
      const { q, scale } = quantize(vecs[j]!);
      const { tokens: _t, score: _s, ...rest } = c;
      indexed.push({ ...rest, v: toBase64(q), s: Number(scale.toPrecision(6)) });
    });
    if ((i / batch) % 10 === 0) log(`[docs-ask] embedded ${Math.min(i + batch, chunks.length)}/${chunks.length}`);
  }

  const index: AskIndex = {
    version: 1,
    model,
    dims: embedder.dims,
    corpusHash,
    builtAt: new Date().toISOString(),
    chunks: indexed,
  };
  const json = JSON.stringify(index);
  await writeFile(outFile, json);
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, json);
  const bytes = Buffer.byteLength(json);
  log(`[docs-ask] wrote ${outFile} (${(bytes / 1024 / 1024).toFixed(2)} MB, ${indexed.length} chunks) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { outFile, chunks: indexed.length, bytes, ms: Date.now() - t0, cached: false };
}

function detectSiteUrl(corpus: string): string {
  const m = corpus.match(/^Site:\s*(https?:\/\/\S+)\s*$/m) ?? corpus.match(/^URL:\s*(https?:\/\/[^/\s]+)/m);
  return m ? m[1]!.replace(/\/$/, '') : '';
}

function defaultCacheDir(): string {
  // dist/build.js or src/build.ts -> package root -> node_modules/.cache
  const here = dirname(new URL(import.meta.url).pathname);
  return resolve(here, '..', 'node_modules', '.cache', 'docs-ask');
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
