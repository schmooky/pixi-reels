import { topK } from '../cosine.js';
import { createEmbedder, type Embedder, type EmbedderOptions } from '../embedder.js';
import { fromBase64, type Quantized } from '../quantize.js';
import type { AskIndex, Chunk, IndexedChunk, Retriever } from '../types.js';

export interface LocalEmbeddingRetrieverOptions extends EmbedderOptions {
  /** Where `index.json` is served from. */
  indexUrl: string;
  /** Override the fetch (tests, Node). */
  fetchIndex?: () => Promise<AskIndex>;
}

/**
 * Semantic retrieval with no server: embeds the query in the browser with the
 * model the index was built with and ranks every chunk by cosine. Everything
 * (index, library, weights) is fetched on the first `search`, so the page pays
 * nothing until someone asks.
 */
export class LocalEmbeddingRetriever implements Retriever {
  private _ready: Promise<{ embedder: Embedder; chunks: IndexedChunk[]; vectors: Quantized[] }> | null = null;

  constructor(private readonly opts: LocalEmbeddingRetrieverOptions) {}

  /** Start loading the index and model ahead of the first question. */
  warm(): Promise<void> {
    return this.ready().then(() => undefined);
  }

  private ready() {
    if (!this._ready) {
      this._ready = (async () => {
        const indexP = this.opts.fetchIndex ? this.opts.fetchIndex() : fetchJson<AskIndex>(this.opts.indexUrl);
        const index = await indexP;
        const embedder = await createEmbedder({ ...this.opts, model: this.opts.model ?? index.model });
        if (embedder.model !== index.model) {
          throw new Error(
            `docs-ask: index was built with ${index.model} but the retriever loads ${embedder.model}; ` +
              'rebuild the index or change ask.config model.',
          );
        }
        const vectors = index.chunks.map((c) => ({ q: fromBase64(c.v), scale: c.s }));
        return { embedder, chunks: index.chunks, vectors };
      })();
      this._ready.catch(() => {
        // Let a later call retry instead of caching the failure forever.
        this._ready = null;
      });
    }
    return this._ready;
  }

  async search(query: string, k: number): Promise<Chunk[]> {
    const q = query.trim();
    if (!q) return [];
    const { embedder, chunks, vectors } = await this.ready();
    const [vec] = await embedder.embed([q]);
    return topK(vec!, vectors, k).map(({ index, score }) => {
      const { v: _v, s: _s, ...rest } = chunks[index]!;
      return { ...rest, tokens: Math.ceil(rest.text.length / 4), score };
    });
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`docs-ask: ${url} answered ${res.status}`);
  return (await res.json()) as T;
}
