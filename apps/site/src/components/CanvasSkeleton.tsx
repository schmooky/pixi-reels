/** @jsxImportSource react */
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CanvasSkeletonProps {
  /** Number of reel columns to draw in the placeholder. Default 5. */
  cols?: number;
  /** Number of cells per column. Default 3. */
  cells?: number;
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
  cells = 3,
  label = 'Loading interactive demo…',
  className,
}: CanvasSkeletonProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center gap-4',
        'bg-[#111114]',
        'animate-fade-in',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="flex gap-2"
        style={{ ['--cell' as string]: '32px' }}
        aria-hidden
      >
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="flex flex-col gap-2">
            {Array.from({ length: cells }, (_, r) => (
              <div
                key={r}
                className="animate-pulse bg-white/10"
                style={{
                  width: 'var(--cell)',
                  height: 'var(--cell)',
                  animationDelay: `${(c * cells + r) * 70}ms`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
        <Loader2 size={14} className="animate-spin" strokeWidth={2.25} />
        <span>{label}</span>
      </div>
    </div>
  );
}
