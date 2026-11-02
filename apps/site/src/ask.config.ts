/**
 * The one place the Ask box is configured. Another docs site built on the
 * same stack changes these values and keeps the components.
 */
export interface AskConfig {
  /** The llms.txt the index was built from (linked from the box as the full corpus). */
  corpusUrl: string;
  /** Where `docs-ask build` wrote `index.json`. */
  indexUrl: string;
  /** POST endpoint of an `apps/ask`-style server. Empty means sources only (`NoAnswerer`). */
  answerUrl: string;
  /** Embedding model, the same id the build step used. */
  model: string;
  /** Chunks to retrieve per question. */
  k: number;
  /** Pagefind runtime, used as the keyword fallback while the model loads. */
  pagefindUrl: string;
}

export const askConfig: AskConfig = {
  corpusUrl: '/llms.txt',
  indexUrl: '/ask/index.json',
  // Set PUBLIC_ASK_ENDPOINT at build time to turn answers on, e.g.
  // PUBLIC_ASK_ENDPOINT=https://ask.pixi-reels.schmooky.dev/ask pnpm site:build
  answerUrl: import.meta.env.PUBLIC_ASK_ENDPOINT ?? '',
  model: 'Xenova/all-MiniLM-L6-v2',
  k: 6,
  pagefindUrl: '/pagefind/pagefind.js',
};
