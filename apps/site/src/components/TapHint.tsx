/** @jsxImportSource react */
import { MousePointerClick } from 'lucide-react';

/**
 * The one call to action on a live demo: the canvas itself is the button,
 * and this says so. Sits over the bottom of the well, never takes the
 * pointer, and reads "tap to skip" while the reels run.
 */
export function TapHint({ spinning, hidden }: { spinning: boolean; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div
      aria-hidden
      className={[
        'pointer-events-none absolute inset-x-0 bottom-3 flex justify-center transition-opacity duration-[217ms]',
        spinning ? 'opacity-40' : 'opacity-100',
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-1.5 rounded-sm bg-black/55 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white">
        <MousePointerClick size={12} strokeWidth={2.25} className={spinning ? '' : 'text-brand'} />
        {spinning ? 'Tap to skip' : 'Tap to spin'}
      </span>
    </div>
  );
}
