/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CheatDefinition, CheatEngine } from '../../../../examples/shared/cheats.ts';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import CheatPanelReact from './CheatPanelReact.tsx';

export interface DemoSandboxProps {
  /** Boots PixiJS + ReelSet into `host`. Returns a cleanup fn. Gets the engine it should register cheats against via `api.mountPanel(engine)`. */
  boot: (host: HTMLDivElement, api: DemoApi, cheats: CheatDefinition[]) => Promise<() => void>;
  /** Cheat definitions for the floating panel. Order matters. */
  cheats: CheatDefinition[];
  /** Mechanic label shown in the corner. */
  mechanic: string;
  /** Ambient tags, shown in the footer. */
  tags?: string[];
  /** Height of the canvas host. */
  height?: number;
}

export interface DemoApi {
  toast: (msg: string, kind?: 'info' | 'win' | 'warn') => void;
  setStatus: (msg: string) => void;
  /** Mount the cheat panel once the engine has been constructed. */
  mountPanel: (engine: CheatEngine, title?: string) => void;
}

export default function DemoSandbox(props: DemoSandboxProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const panelMountRef = useRef<HTMLDivElement | null>(null);
  const panelRootRef = useRef<Root | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'info' | 'win' | 'warn' } | null>(null);
  const [status, setStatus] = useState<string>('Idle');
  const [bootError, setBootError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!hostRef.current) return;
    let cleanup: (() => void) | null = null;
    let disposed = false;

    // Clear any stale error from a previous boot attempt.
    setBootError(null);

    const api: DemoApi = {
      toast: (msg, kind = 'info') => {
        setToast({ msg, kind });
        setTimeout(() => setToast(null), 2200);
      },
      setStatus: (msg) => setStatus(msg),
      mountPanel: (engine, title) => {
        if (!hostRef.current) return;
        if (!panelMountRef.current) {
          const el = document.createElement('div');
          el.style.position = 'absolute';
          el.style.top = '0';
          el.style.right = '0';
          el.style.zIndex = '10';
          el.style.pointerEvents = 'none';
          hostRef.current.appendChild(el);
          el.style.pointerEvents = 'auto';
          panelMountRef.current = el;
          panelRootRef.current = createRoot(el);
        }
        panelRootRef.current!.render(
          <CheatPanelReact engine={engine} title={title ?? 'Demo cheats'} />,
        );
      },
    };

    (async () => {
      try {
        const c = await props.boot(hostRef.current!, api, props.cheats);
        if (disposed) c();
        else cleanup = c;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // eslint-disable-next-line no-console
        console.error('DemoSandbox boot failed:', error);
        if (!disposed) setBootError(error);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
      if (panelRootRef.current) {
        const root = panelRootRef.current;
        setTimeout(() => root.unmount(), 0);
        panelRootRef.current = null;
      }
      panelMountRef.current?.remove();
      panelMountRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="relative flex w-full items-center justify-center overflow-hidden bg-card"
        style={{ height: props.height ?? 440 }}
      >
        <div ref={hostRef} className="flex h-full w-full items-center justify-center [&_canvas]:block [&_canvas]:max-w-full [&_canvas]:h-auto" />

        {bootError && (
          <ErrorCard error={bootError} onRetry={() => setRetryKey((k) => k + 1)} />
        )}

        {toast && !bootError && (
          <div
            className={cn(
              'pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-mono shadow-xl backdrop-blur animate-fade-in',
              toast.kind === 'win' && 'border-green-500/60 bg-green-500/10 text-green-300',
              toast.kind === 'warn' && 'border-amber-500/60 bg-amber-500/10 text-amber-200',
              toast.kind === 'info' && 'border-border bg-card/90 text-foreground',
            )}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

interface ErrorCardProps {
  error: Error;
  onRetry: () => void;
}

function ErrorCard({ error, onRetry }: ErrorCardProps) {
  const [copied, setCopied] = useState(false);
  const stack = error.stack ?? error.message;

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(`${error.name}: ${error.message}\n\n${stack}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard may be blocked on insecure origins */ }
  };

  return (
    <div className="absolute inset-4 z-20 flex items-center justify-center">
      <div className="max-w-[480px] w-full rounded-xl border border-destructive/60 bg-card/95 p-5 shadow-xl shadow-destructive/20 backdrop-blur animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/15 text-destructive">
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Demo failed to boot</div>
            <div className="mt-0.5 font-mono text-xs text-destructive break-words">
              {error.name}: {error.message}
            </div>
          </div>
        </div>

        <pre className="mt-4 max-h-32 overflow-auto rounded-md border border-border bg-muted/60 p-2.5 text-[10.5px] leading-snug text-muted-foreground font-mono">
{truncate(stack, 1200)}
        </pre>

        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="gradient" onClick={onRetry} className="flex-1">
            <RefreshCw size={12} strokeWidth={2.5} />
            Retry
          </Button>
          <Button size="sm" variant="outline" onClick={copyDetails}>
            <Copy size={12} strokeWidth={2.5} />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n…';
}
