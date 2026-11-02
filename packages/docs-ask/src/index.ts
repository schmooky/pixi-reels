/**
 * Browser-safe surface. The build step lives at `@pixi-reels/docs-ask/build`
 * so this entry never pulls Node modules into a page bundle.
 */
export type { Chunk, Retriever, Answerer, AnswerOptions, AskIndex, IndexedChunk } from './types.js';
export { chunkCorpus, splitLong, type ChunkOptions } from './chunk.js';
export { cosine, dot, norm, normalize, topK, type Hit } from './cosine.js';
export { quantize, dequantize, toBase64, fromBase64, type Quantized } from './quantize.js';
export { approxTokens } from './tokens.js';
export { createEmbedder, embeddingText, DEFAULT_MODEL, type Embedder, type EmbedderOptions } from './embedder.js';
export { LocalEmbeddingRetriever, type LocalEmbeddingRetrieverOptions } from './retrievers/local.js';
export { PagefindRetriever, defaultSection, type PagefindRetrieverOptions } from './retrievers/pagefind.js';
export { RemoteAnswerer, type RemoteAnswererOptions } from './answerers/remote.js';
export { NoAnswerer } from './answerers/none.js';
