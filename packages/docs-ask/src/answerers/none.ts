import type { Answerer, Chunk } from '../types.js';

/**
 * No server: the box lists the retrieved sources and nothing else. The
 * default when `ask.config.ts` has no answer endpoint.
 */
export class NoAnswerer implements Answerer {
  async *answer(_question: string, _chunks: Chunk[]): AsyncIterable<string> {
    // Intentionally empty: sources only.
  }
}
