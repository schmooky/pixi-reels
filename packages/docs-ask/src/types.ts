/**
 * One retrievable unit of the corpus: a run of a page, 300 to 600 tokens
 * wide, carrying enough provenance for a citation (url, section, title,
 * heading) and a stable id for the audit log.
 */
export interface Chunk {
  /** Stable id: the page path plus a running number, e.g. `/guides/nudge/#2`. */
  id: string;
  /** Absolute URL of the page (deep link where the corpus had one). */
  url: string;
  /** Corpus section the page lives in: Guides, Recipes, FAQ, ... */
  section: string;
  /** Page title. */
  title: string;
  /** Nearest heading inside the page, when the chunk sits under one. */
  heading?: string;
  /** The chunk body as plain markdown. */
  text: string;
  /** Rough token count (chars / 4). */
  tokens: number;
  /** Set by a retriever: higher is a better match. */
  score?: number;
}

/**
 * Finds the chunks worth reading for a question. Two implementations ship:
 * `LocalEmbeddingRetriever` (semantic, same local model as the build step) and
 * `PagefindRetriever` (keyword, the site's existing index). Any object with
 * this shape plugs into the box.
 */
export interface Retriever {
  search(query: string, k: number): Promise<Chunk[]>;
}

export interface AnswerOptions {
  signal?: AbortSignal;
  /** Called once the answerer has an id for this exchange (used for feedback). */
  onStart?: (meta: { id: string }) => void;
}

/**
 * Turns a question plus retrieved chunks into a streamed answer. `NoAnswerer`
 * yields nothing (the box then shows sources only); `RemoteAnswerer` POSTs to
 * a URL and streams what comes back. A hosted vendor goes behind this same
 * interface.
 */
export interface Answerer {
  answer(question: string, chunks: Chunk[], opts?: AnswerOptions): AsyncIterable<string>;
  /** Optional: record whether the answer was right. */
  feedback?(id: string, vote: 'up' | 'down'): Promise<void>;
}

/** The shipped `index.json`. */
export interface AskIndex {
  version: 1;
  model: string;
  dims: number;
  /** sha256 of the corpus text the index was built from. */
  corpusHash: string;
  builtAt: string;
  chunks: IndexedChunk[];
}

export interface IndexedChunk extends Omit<Chunk, 'score' | 'tokens'> {
  /** Base64 of the int8-quantized, L2-normalized embedding. */
  v: string;
  /** Dequantization scale: float = int8 * s. */
  s: number;
}
