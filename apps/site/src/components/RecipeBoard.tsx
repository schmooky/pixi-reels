/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 * the canvas and a small circular "spin" button in the bottom-right corner
 * that re-runs the recipe.
 */
export default function RecipeBoard(props: RecipeBoardProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ destroy: () => void; run: () => Promise<void> } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;

    (async () => {
      try {
        const h = await props.setup(hostRef.current!);
        if (disposed) { h.destroy(); return; }
        handleRef.current = h;
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
    <div className="my-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative flex w-full items-center justify-center bg-card" style={{ height: props.height ?? 260 }}>
        <div
          ref={hostRef}
          className="flex h-full w-full items-center justify-center [&_canvas]:block [&_canvas]:max-w-full [&_canvas]:h-auto"
        />
        <button
          type="button"
          onClick={run}
          disabled={running}
          title={title}
          aria-label={title}
          className={cn(
            'absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full',
            'border border-border/70 bg-background/80 text-foreground shadow-sm backdrop-blur',
            'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
            'disabled:cursor-wait disabled:opacity-70',
          )}
        >
          <RefreshCw
            size={16}
            strokeWidth={2.25}
            className={cn('transition-transform', running && 'animate-spin')}
          />
        </button>
      </div>
    </div>
  );
}
