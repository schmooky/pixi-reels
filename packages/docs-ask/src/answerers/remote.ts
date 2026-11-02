import type { Answerer, AnswerOptions, Chunk } from '../types.js';

export interface RemoteAnswererOptions {
  /** POST target, e.g. `https://ask.example.com/ask`. */
  url: string;
  /** Feedback target; defaults to `url` with `/ask` replaced by `/feedback`. */
  feedbackUrl?: string;
  /** Extra headers (a public site key, never a provider secret). */
  headers?: Record<string, string>;
}

/**
 * Streams an answer from an HTTP endpoint. The body is
 * `{ question, chunks }`; the response is `text/plain` streamed as it is
 * written, with the exchange id in the `X-Ask-Id` header. `apps/ask` is one
 * such endpoint; a hosted service with the same contract drops in here.
 */
export class RemoteAnswerer implements Answerer {
  constructor(private readonly opts: RemoteAnswererOptions) {}

  async *answer(question: string, chunks: Chunk[], opts: AnswerOptions = {}): AsyncIterable<string> {
    const res = await fetch(this.opts.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.opts.headers },
      body: JSON.stringify({
        question,
        chunks: chunks.map(({ id, url, section, title, heading, text }) => ({ id, url, section, title, heading, text })),
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Ask endpoint answered ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    const id = res.headers.get('x-ask-id');
    if (id) opts.onStart?.({ id });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  }

  async feedback(id: string, vote: 'up' | 'down'): Promise<void> {
    const url = this.opts.feedbackUrl ?? this.opts.url.replace(/\/ask\/?$/, '/feedback');
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.opts.headers },
      body: JSON.stringify({ id, vote }),
    });
  }
}
