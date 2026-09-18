/** @jsxImportSource react */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Pause, Play, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One recorded event. `args` are kept as the emitter handed them over and
 * described lazily at render time, so recording costs a push and nothing
 * else while nobody is looking.
 */
export interface EventEntry {
  id: number;
  /** `performance.now()` at the emit. */
  t: number;
  /** Milliseconds since the round's `spin:start`, `null` before the first one. */
  rel: number | null;
  /** `set`, `reel 2`, `board`, `notice`, ... */
  source: string;
  name: string;
  args: unknown[];
}

interface EventsPanelProps {
  entries: readonly EventEntry[];
  /** Bumped by the recorder once per animation frame while the panel is open. */
  tick: number;
  onClear: () => void;
  className?: string;
  style?: CSSProperties;
}

const ROW_LIMIT = 1000;
const COMPACT = { depth: 2, items: 6, keys: 8, text: 48 } as const;
const FULL = { depth: 6, items: 40, keys: 40, text: 400 } as const;

interface FmtOptions {
  depth: number;
  items: number;
  keys: number;
  text: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * A readable, bounded rendering of any event argument. PixiJS display
 * objects, symbols, profiles and reel sets collapse to a tag; plain data is
 * printed to `depth`; cycles are cut. Never throws: a payload that cannot be
 * described is still a row.
 */
export function describeValue(value: unknown, opts: FmtOptions = COMPACT, depth = 0, seen = new Set<unknown>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    return JSON.stringify(s.length > opts.text ? `${s.slice(0, opts.text)}…` : s);
  }
  if (t === 'number') return Number.isInteger(value) ? String(value) : (value as number).toFixed(2);
  if (t === 'boolean' || t === 'bigint') return String(value);
  if (t === 'function') return 'fn()';
  if (t === 'symbol') return String(value);
  if (!isRecord(value)) return String(value);

  if (seen.has(value)) return '[cycle]';
  if (value instanceof Error) return `Error(${JSON.stringify(value.message)})`;

  const ctor = (value as { constructor?: { name?: string } }).constructor?.name ?? 'Object';
  // Engine and PixiJS objects: a tag, never a walk.
  if ('worldTransform' in value && 'children' in value) {
    if (ctor === 'ReelSet') return '[ReelSet]';
    return `[${ctor}]`;
  }
  if ('view' in value && typeof (value as { symbolId?: unknown }).symbolId === 'string') {
    return `symbol:${(value as { symbolId: string }).symbolId}`;
  }
  if (typeof (value as { name?: unknown }).name === 'string' && typeof (value as { spinSpeed?: unknown }).spinSpeed === 'number') {
    return `profile:${(value as { name: string }).name}`;
  }
  if (ctor !== 'Object' && ctor !== 'Array' && depth >= opts.depth) return `[${ctor}]`;
  if (depth >= opts.depth) return Array.isArray(value) ? `[…${value.length}]` : '{…}';

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const head = value.slice(0, opts.items).map((v) => describeValue(v, opts, depth + 1, seen));
      const more = value.length > opts.items ? `, …+${value.length - opts.items}` : '';
      return `[${head.join(', ')}${more}]`;
    }
    const entries = Object.entries(value).filter(([, v]) => typeof v !== 'function');
    const head = entries.slice(0, opts.keys).map(([k, v]) => `${k}: ${describeValue(v, opts, depth + 1, seen)}`);
    const more = entries.length > opts.keys ? `, …+${entries.length - opts.keys}` : '';
    const body = `{ ${head.join(', ')}${more} }`;
    return ctor === 'Object' ? body : `${ctor} ${body}`;
  } finally {
    seen.delete(value);
  }
}

/** A rendering fits on the header line when it is this short. */
const INLINE_MAX = 60;

/**
 * The same description, unwrapped: objects and arrays one member per line,
 * two spaces per level, so the payload reads as the object it is. Anything
 * whose one-line form is short stays on one line.
 */
export function prettyValue(value: unknown, opts: FmtOptions = FULL, depth = 0, seen = new Set<unknown>()): string {
  const flat = describeValue(value, opts, depth, seen);
  // A payload object is always unwrapped; inside it, short members stay on
  // one line so `reels: [0, 1, 2, 3, 4]` does not become five lines.
  if ((depth > 0 && flat.length <= INLINE_MAX) || !isRecord(value) || seen.has(value)) return flat;
  if (value instanceof Error) return flat;
  // Tagged objects (display objects, symbols, profiles) are a tag already.
  if (!flat.startsWith('{') && !flat.startsWith('[') && !/^[A-Za-z_$][\w$]* \{/.test(flat)) return flat;
  if (depth >= opts.depth) return flat;

  const pad = '  '.repeat(depth + 1);
  const close = '  '.repeat(depth);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, opts.items).map((v) => `${pad}${prettyValue(v, opts, depth + 1, seen)}`);
      if (value.length > opts.items) items.push(`${pad}...+${value.length - opts.items}`);
      return `[\n${items.join(',\n')}\n${close}]`;
    }
    const entries = Object.entries(value).filter(([, v]) => typeof v !== 'function');
    const lines = entries.slice(0, opts.keys).map(([k, v]) => `${pad}${k}: ${prettyValue(v, opts, depth + 1, seen)}`);
    if (entries.length > opts.keys) lines.push(`${pad}...+${entries.length - opts.keys}`);
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name ?? 'Object';
    const head = ctor === 'Object' ? '{' : `${ctor} {`;
    return `${head}\n${lines.join(',\n')}\n${close}}`;
  } finally {
    seen.delete(value);
  }
}

/** Namespace colour: what family an event belongs to, at a glance. */
function nameClass(name: string): string {
  const ns = name.split(':')[0] ?? '';
  switch (ns) {
    case 'spin': return 'text-sky-300';
    case 'skip': return 'text-amber-300';
    case 'anticipation': return 'text-orange-300';
    case 'phase': return 'text-violet-300';
    case 'cascade': return 'text-teal-300';
    case 'win': case 'spotlight': return 'text-emerald-300';
    case 'pin': case 'nudge': case 'adjust': case 'shape': return 'text-pink-300';
    case 'speed': return 'text-lime-300';
    case 'feature': case 'coin': case 'board': case 'respin': case 'respins': return 'text-yellow-200';
    case 'landing': case 'landed': case 'symbol': return 'text-slate-300';
    default: return 'text-foreground';
  }
}

/**
 * `tok tok !tok`: every plain token must appear in `source name`, no `!`
 * token may. Case-insensitive. Empty filter shows everything.
 */
function compileFilter(filter: string): (e: EventEntry) => boolean {
  const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return () => true;
  const must = tokens.filter((t) => !t.startsWith('!'));
  const mustNot = tokens.filter((t) => t.startsWith('!') && t.length > 1).map((t) => t.slice(1));
  return (e) => {
    const hay = `${e.source} ${e.name}`.toLowerCase();
    return must.every((t) => hay.includes(t)) && !mustNot.some((t) => hay.includes(t));
  };
}

function formatRel(e: EventEntry): string {
  if (e.rel === null) {
    const d = new Date(performance.timeOrigin + e.t);
    return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }
  return `+${Math.round(e.rel)}`;
}

/**
 * The events side panel of a recipe: every event every reel set, reel and
 * board in the demo raised, plus engine notices, as a scrollable log with
 * timestamps and payloads. Docked right of the canvas when there is room,
 * under it when there is not.
 */
export function EventsPanel({ entries, tick, onClear, className, style }: EventsPanelProps) {
  const [filter, setFilter] = useState('');
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const frozenRef = useRef<readonly EventEntry[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Pausing freezes the view, not the recorder: what arrives while paused is
  // there the moment the panel resumes.
  if (paused && frozenRef.current === null) frozenRef.current = entries.slice();
  if (!paused) frozenRef.current = null;
  const shown = paused ? frozenRef.current! : entries;

  const matches = useMemo(() => compileFilter(filter), [filter]);
  // `tick` is the dependency that makes a new frame of events re-filter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => shown.filter(matches), [shown, matches, tick]);

  // Follow the tail unless the reader scrolled up to study something.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  }

  async function copy() {
    const rows = visible.map((e) => ({
      t: Math.round(e.t),
      rel: e.rel === null ? null : Math.round(e.rel),
      source: e.source,
      name: e.name,
      args: e.args.map((a) => prettyValue(a, FULL)),
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard denied (no user gesture, insecure context): nothing to do.
    }
  }

  return (
    <div
      className={cn('flex min-h-0 flex-col border-border/60 bg-card font-mono text-[10px] text-foreground', className)}
      style={style}
      data-events-panel
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-1.5 py-1">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter: skip !symbol:created"
          aria-label="Filter events"
          className="min-w-0 flex-1 rounded border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] outline-none focus:border-primary"
        />
        <span className="shrink-0 tabular-nums text-muted-foreground" title="shown / recorded">
          {visible.length}/{shown.length}
        </span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          title={paused ? 'Resume' : 'Pause'}
          aria-label={paused ? 'Resume events' : 'Pause events'}
          aria-pressed={paused}
          className={cn('rounded border border-border/60 p-1 hover:text-foreground', paused ? 'text-primary' : 'text-muted-foreground')}
        >
          {paused ? <Play size={10} /> : <Pause size={10} />}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          title="Copy visible rows as JSON"
          aria-label="Copy events as JSON"
          className="rounded border border-border/60 p-1 text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
        <button
          type="button"
          onClick={() => { onClear(); frozenRef.current = paused ? [] : null; }}
          title="Clear"
          aria-label="Clear events"
          className="rounded border border-border/60 p-1 text-muted-foreground hover:text-foreground"
        >
          <Trash2 size={10} />
        </button>
      </div>
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="off">
        {visible.length === 0 && (
          <div className="p-3 text-muted-foreground">
            {shown.length === 0 ? 'No events yet. Spin.' : 'Nothing matches the filter.'}
          </div>
        )}
        {visible.map((e) => <Row key={e.id} entry={e} />)}
      </div>
    </div>
  );
}

/**
 * One event. Memoised on the entry, which never changes once recorded, so a
 * frame of new events renders its new rows and leaves the rest alone.
 */
const Row = memo(function Row({ entry: e }: { entry: EventEntry }) {
  const rendered = useMemo(() => e.args.map((a) => prettyValue(a, FULL)), [e]);
  const inline = rendered.filter((r) => !r.includes('\n'));
  const blocks = rendered.filter((r) => r.includes('\n'));
  return (
    <div
      className="border-b border-border/30 px-1.5 py-0.5 hover:bg-background/60"
      title={new Date(performance.timeOrigin + e.t).toISOString()}
    >
      <div className="flex gap-1.5">
        <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{formatRel(e)}</span>
        <span className="w-12 shrink-0 truncate text-muted-foreground">{e.source}</span>
        <span className={cn('shrink-0', nameClass(e.name))}>{e.name}</span>
        {inline.length > 0 && <span className="whitespace-pre-wrap break-all text-muted-foreground/90">{inline.join('  ')}</span>}
      </div>
      {blocks.map((b, i) => (
        // A div, not a pre: the page's prose styles give `pre` a dark box.
        <div key={i} className="whitespace-pre-wrap break-all pl-[3.25rem] text-muted-foreground/90">{b}</div>
      ))}
    </div>
  );
});

export { ROW_LIMIT };
