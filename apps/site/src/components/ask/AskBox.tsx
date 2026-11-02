/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Answerer, Chunk, Retriever } from '@pixi-reels/docs-ask';
import type { AskConfig } from '../../ask.config.ts';

/**
 * The Ask tab of the search modal. Retrieves chunks with the local model
 * (falling back to the Pagefind index when the model cannot load), streams
 * an answer from the configured endpoint, lists the sources it was given and
 * takes a thumbs vote that lands in the same audit log.
 *
 * `@pixi-reels/docs-ask` and the embedding model are imported on the first
 * question, never at page load.
 */

type Phase = 'idle' | 'loading' | 'retrieving' | 'answering' | 'done' | 'error';

interface Engine {
  retriever: Retriever;
  answerer: Answerer;
  /** True when the semantic retriever failed and keyword search took over. */
  keywordFallback: boolean;
}

export interface AskBoxProps {
  config: AskConfig;
}

export function AskBox({ config }: AskBoxProps) {
  const [question, setQuestion] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Chunk[]>([]);
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [error, setError] = useState('');
  const [keywordFallback, setKeywordFallback] = useState(false);
  const engine = useRef<Promise<Engine> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The Search tab hands a query over with this event.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q === 'string') {
        setQuestion(q);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('docs-ask:prefill', onPrefill);
    return () => window.removeEventListener('docs-ask:prefill', onPrefill);
  }, []);

  const getEngine = useCallback((): Promise<Engine> => {
    if (!engine.current) {
      engine.current = (async () => {
        const lib = await import('@pixi-reels/docs-ask');
        const answerer: Answerer = config.answerUrl
          ? new lib.RemoteAnswerer({ url: config.answerUrl })
          : new lib.NoAnswerer();
        const local = new lib.LocalEmbeddingRetriever({
          indexUrl: config.indexUrl,
          model: config.model,
          dtype: 'q8',
          onProgress: (p) => {
            if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
              setStatus(`Loading the local model, first time only: ${p.file.split('/').pop()} ${Math.round(p.progress)}%`);
            }
          },
        });
        try {
          setStatus('Loading the local model, first time only...');
          await local.warm();
          return { retriever: local, answerer, keywordFallback: false };
        } catch (err) {
          console.warn('[ask] local model unavailable, using the keyword index', err);
          return {
            retriever: new lib.PagefindRetriever({ pagefindUrl: config.pagefindUrl }),
            answerer,
            keywordFallback: true,
          };
        }
      })();
      engine.current.catch(() => {
        engine.current = null;
      });
    }
    return engine.current;
  }, [config]);

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text) return;
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      setPhase('loading');
      setError('');
      setAnswer('');
      setSources([]);
      setExchangeId(null);
      setVote(null);
      try {
        const eng = await getEngine();
        if (ctl.signal.aborted) return;
        setKeywordFallback(eng.keywordFallback);
        setPhase('retrieving');
        setStatus(eng.keywordFallback ? 'Searching the keyword index...' : 'Finding the relevant pages...');
        const chunks = await eng.retriever.search(text, config.k);
        if (ctl.signal.aborted) return;
        setSources(chunks);
        if (chunks.length === 0) {
          setStatus('');
          setPhase('done');
          return;
        }
        setPhase('answering');
        setStatus(config.answerUrl ? 'Writing an answer from these pages...' : '');
        let acc = '';
        for await (const piece of eng.answerer.answer(text, chunks, {
          signal: ctl.signal,
          onStart: ({ id }) => setExchangeId(id),
        })) {
          if (ctl.signal.aborted) return;
          acc += piece;
          setAnswer(acc);
        }
        setStatus('');
        setPhase('done');
      } catch (err) {
        if (ctl.signal.aborted) return;
        setStatus('');
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    },
    [config, getEngine],
  );

  const sendVote = useCallback(
    async (v: 'up' | 'down') => {
      setVote(v);
      const eng = await getEngine();
      if (exchangeId && eng.answerer.feedback) {
        try {
          await eng.answerer.feedback(exchangeId, v);
        } catch (err) {
          console.warn('[ask] feedback not recorded', err);
        }
      }
    },
    [exchangeId, getEngine],
  );

  const busy = phase === 'loading' || phase === 'retrieving' || phase === 'answering';

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          rows={2}
          placeholder="Ask about the library in your own words: how do I nudge one reel after it lands?"
          className="w-full resize-none rounded-sm border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/50"
          aria-label="Your question"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="inline-flex h-8 items-center rounded-sm bg-primary px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground disabled:opacity-40"
          >
            {busy ? 'Working' : 'Ask'}
          </button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {status || (phase === 'idle' ? 'Answers come from the docs on this site and cite the pages they used.' : '')}
          </span>
        </div>
      </form>

      {error && (
        <p role="alert" className="border border-destructive/50 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {(answer || phase === 'answering') && (
        <section aria-label="Answer" className="border-t border-border pt-3">
          <p className="eyebrow mb-2">Answer</p>
          <AnswerText text={answer} streaming={phase === 'answering'} />
          {phase === 'done' && exchangeId && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Was this right?</span>
              <VoteButton label="Yes" active={vote === 'up'} onClick={() => void sendVote('up')} />
              <VoteButton label="No" active={vote === 'down'} onClick={() => void sendVote('down')} />
              {vote && <span>Thanks, noted.</span>}
            </div>
          )}
        </section>
      )}

      {sources.length > 0 && (
        <section aria-label="Sources" className="border-t border-border pt-3">
          <p className="eyebrow mb-2">
            {config.answerUrl ? 'Sources' : 'Pages that answer this'}
            {keywordFallback && <span className="ml-2 normal-case tracking-normal text-muted-foreground">keyword match</span>}
          </p>
          {!config.answerUrl && (
            <p className="mb-2 text-xs text-muted-foreground">
              No answer service is configured for this build, so here are the passages the question matched.
            </p>
          )}
          <ol className="divide-y divide-border border-y border-border">
            {sources.map((c, i) => (
              <li key={c.id}>
                <a href={c.url} className="block px-2 py-2 hover:bg-secondary/40">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-text">{c.section}</span>
                    <span className="truncate font-semibold">{c.title}</span>
                    {c.heading && <span className="truncate text-muted-foreground">{c.heading}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.text.replace(/```[a-z]*\n?/g, '').slice(0, 240)}</p>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {phase === 'done' && sources.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">Nothing in the docs matched that. Try the Search tab, or rephrase.</p>
      )}
    </div>
  );
}

function VoteButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors',
        active ? 'border-foreground text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

/**
 * Renders the streamed answer: paragraphs, fenced code, `inline code` and
 * bare URLs as links. Deliberately not a markdown engine: the system prompt
 * asks for prose with URLs, and this is all it needs.
 */
function AnswerText({ text, streaming }: { text: string; streaming: boolean }) {
  const blocks = splitFences(text);
  return (
    <div className="space-y-3 leading-6 text-foreground/90">
      {blocks.map((b, i) =>
        b.code ? (
          <pre key={i} className="overflow-x-auto rounded-sm border px-3 py-2 text-xs" style={{ background: 'hsl(var(--code-bg))', borderColor: 'hsl(var(--code-border))', color: 'hsl(var(--code-fg))' }}>
            <code>{b.text}</code>
          </pre>
        ) : (
          b.text
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, j) => (
              <p key={`${i}-${j}`}>{renderInline(p)}</p>
            ))
        ),
      )}
      {streaming && <span className="inline-block h-3 w-1.5 animate-pulse bg-foreground/60 align-middle" aria-hidden />}
    </div>
  );
}

function splitFences(text: string): Array<{ code: boolean; text: string }> {
  const out: Array<{ code: boolean; text: string }> = [];
  const parts = text.split(/```[a-zA-Z]*\n?/);
  parts.forEach((part, i) => {
    if (!part) return;
    out.push({ code: i % 2 === 1, text: i % 2 === 1 ? part.replace(/\n$/, '') : part });
  });
  return out;
}

function renderInline(p: string) {
  const tokens = p.split(/(`[^`]+`|https?:\/\/[^\s)]+)/g);
  return tokens.map((t, i) => {
    if (/^`[^`]+`$/.test(t)) {
      return (
        <code key={i} className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {t.slice(1, -1)}
        </code>
      );
    }
    if (/^https?:\/\//.test(t)) {
      const clean = t.replace(/[.,;:]+$/, '');
      const tail = t.slice(clean.length);
      return (
        <span key={i}>
          <a href={clean} className="underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
            {clean.replace(/^https?:\/\/[^/]+/, '')}
          </a>
          {tail}
        </span>
      );
    }
    return t;
  });
}
