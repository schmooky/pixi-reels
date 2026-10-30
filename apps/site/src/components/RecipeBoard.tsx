/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CanvasSkeleton } from './CanvasSkeleton';
import { useMinDisplay } from './useMinDisplay';

export interface RecipeBoardProps {
  /** Mount PixiJS + prepare the sandbox. Called once. */
  setup: (host: HTMLDivElement) => Promise<{ destroy: () => void; run: () => Promise<void> }>;
  /** Height for the canvas area. */
  height?: number;
  /** Auto-run once after mount. Default true. */
  autoRun?: boolean;
  /** Tooltip for the spin button (screen-reader + title attr). */
  label?: string;
}

/**
 * Canvas host for a recipe demo. The chrome is intentionally minimal: just
 * the canvas well and a one-button toolbar under it that re-runs the recipe.
 */
export default function RecipeBoard(props: RecipeBoardProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ destroy: () => void; run: () => Promise<void> } | null>(null);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  // Hold the skeleton for at least 250ms so it registers as a deliberate
  // placeholder; without this guard it flashes for one frame on fast loads.
  const showSkeleton = useMinDisplay(!ready, 250);

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;

    (async () => {
      try {
        const h = await props.setup(hostRef.current!);
        if (disposed) { h.destroy(); return; }
        handleRef.current = h;
        setReady(true);
        if (props.autoRun !== false) {
          await run();
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('RecipeBoard setup failed:', err);
      }
    })();

    return () => {
      disposed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (!handleRef.current || running) return;
    setRunning(true);
    try {
      await handleRef.current.run();
    } finally {
      setRunning(false);
    }
  }

  const title = props.label ?? 'Spin again';

  return (
    <div className="my-5 overflow-hidden rounded-lg border border-border">
      <div className="relative flex w-full items-center justify-center bg-[#111114]" style={{ height: props.height ?? 260 }}>
        <div
          ref={hostRef}
          className="flex h-full w-full items-center justify-center [&_canvas]:block [&_canvas]:max-w-full [&_canvas]:h-auto"
        />
        {showSkeleton && <CanvasSkeleton />}
      </div>
      <div className="flex min-h-9 items-center justify-end border-t border-border px-1.5 py-1.5">
        <button
          type="button"
          onClick={run}
          disabled={running}
          title={title}
          aria-label={title}
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-sm bg-brand px-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-brand-foreground',
            'transition-transform duration-[133ms] active:scale-[0.97]',
            'disabled:cursor-wait disabled:opacity-70',
          )}
        >
          <RefreshCw
            size={11}
            strokeWidth={2.5}
            className={cn(running && 'animate-spin')}
          />
          {title}
        </button>
      </div>
    </div>
  );
}
