/** @jsxImportSource react */
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CanvasSkeletonProps {
  /** Number of reel columns to draw in the placeholder. Default 5. */
  cols?: number;
  /** Number of rows per column. Default 3. */
  rows?: number;
  /** Optional caption under the spinner. */
  label?: string;
  /** Forwarded class for the absolute-positioned overlay. */
  className?: string;
}

/**
 * Greyed-out reel-grid placeholder shown while a recipe's PixiJS canvas
 * is compiling/booting. Replaces the moment of blank space the user used
 * to see between page load and `setReady(true)`. Styling-only. never
 * mounts a canvas.
 */
export function CanvasSkeleton({
  cols = 5,
  rows = 3,
  label = 'Loading interactive demo…',
  className,
}: CanvasSkeletonProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-4',
        'bg-card/95 backdrop-blur-sm',
        'animate-in fade-in duration-200',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="flex gap-2 opacity-30"
        style={{ ['--cell' as string]: '32px' }}
        aria-hidden
      >
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="flex flex-col gap-2">
            {Array.from({ length: rows }, (_, r) => (
              <div
                key={r}
                className="rounded-md bg-muted-foreground/30 animate-pulse"
                style={{
                  width: 'var(--cell)',
                  height: 'var(--cell)',
                  animationDelay: `${(c * rows + r) * 70}ms`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" strokeWidth={2.25} />
        <span>{label}</span>
      </div>
    </div>
  );
}
