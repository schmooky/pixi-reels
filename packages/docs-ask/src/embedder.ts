/**
 * One embedding function for both ends: the build step (Node) and the
 * browser load the same model at the same quantization through
 * `@huggingface/transformers`, so the stored vectors and the query vector
 * come from identical weights. The library is imported lazily: a page that
 * never opens the Ask tab never downloads it.
 */
export interface Embedder {
  model: string;
  dims: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface EmbedderOptions {
  /** Hugging Face model id. */
  model?: string;
  /** Weight precision to download; `q8` is ~23 MB for MiniLM-L6. */
  dtype?: 'q8' | 'fp32' | 'fp16';
  /** Node only: where to cache downloaded weights. */
  cacheDir?: string;
  /** Progress callback for the download (browser UI). */
  onProgress?: (p: { status: string; file?: string; progress?: number }) => void;
  /** Override the library import, e.g. to load it from a CDN URL. */
  loadTransformers?: () => Promise<TransformersLike>;
}

export const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

// The slice of the library this module touches. Kept structural so a test can
// substitute a fake, and so `loadTransformers` may hand over a CDN build.
export interface TransformersLike {
  env: { cacheDir?: string; allowLocalModels?: boolean; [k: string]: unknown };
  pipeline: (
    task: 'feature-extraction',
    model: string,
    opts: Record<string, unknown>,
  ) => Promise<FeatureExtractor>;
}
export type FeatureExtractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: boolean; truncation?: boolean; max_length?: number },
) => Promise<{ dims: number[]; data: Float32Array | number[] }>;

export async function createEmbedder(opts: EmbedderOptions = {}): Promise<Embedder> {
  const model = opts.model ?? DEFAULT_MODEL;
  const load =
    opts.loadTransformers ??
    (async () => (await import('@huggingface/transformers')) as unknown as TransformersLike);
  const tf = await load();
  if (opts.cacheDir) tf.env.cacheDir = opts.cacheDir;
  const extractor = await tf.pipeline('feature-extraction', model, {
    dtype: opts.dtype ?? 'q8',
    progress_callback: opts.onProgress,
  });
  let dims = 0;
  return {
    model,
    get dims() {
      return dims;
    },
    async embed(texts) {
      if (texts.length === 0) return [];
      const out = await extractor(texts, {
        pooling: 'mean',
        normalize: true,
        truncation: true,
        max_length: 512,
      });
      const [rows, cols] = out.dims as [number, number];
      dims = cols;
      const data = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);
      const vecs: Float32Array[] = [];
      for (let r = 0; r < rows; r++) vecs.push(data.slice(r * cols, (r + 1) * cols));
      return vecs;
    },
  };
}

/** What gets embedded for a chunk: its place in the site, then its text. */
export function embeddingText(c: { section: string; title: string; heading?: string; text: string }): string {
  const head = [c.section, c.title, c.heading].filter(Boolean).join(' / ');
  return `${head}\n${c.text}`;
}
