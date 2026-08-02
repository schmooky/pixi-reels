import { useEffect, useRef, useState } from 'react';
import { RecipeRunner } from './RecipeRunner.tsx';

interface Props {
  code: string;
  height?: number;
}

/**
 * Viewport-gated wrapper around RecipeRunner. Each RecipeRunner owns a live
 * pixi Application (a WebGL context), and a browser only grants ~16 contexts
 * before it starts dropping the oldest. Umbrella recipe pages stack dozens of
 * demos, so we mount RecipeRunner only while its slot is near the viewport and
 * unmount it (freeing the context) once it scrolls well away. A page can hold
 * any number of demos; only the few on screen are ever live.
 */
export function LazyRecipeRunner({ code, height = 300 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Preload margin, scaled to the viewport. A flat 500px is half a phone
    // screen, so arriving on a demo-dense page booted three pixi Applications
    // at once -- three WebGL contexts and three tickers competing before
    // anything was on screen. On a desktop 500px is a small fraction of the
    // page and the smoothness is worth it.
    const margin = Math.round(Math.min(500, window.innerHeight * 0.35));
    const io = new IntersectionObserver(
      (entries) => setActive(entries[0]?.isIntersecting ?? false),
      { rootMargin: `${margin}px 0px ${margin}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {active ? (
        <RecipeRunner code={code} height={height} />
      ) : (
        <Placeholder height={height} label="Scroll to load" />
      )}
    </div>
  );
}

function Placeholder({ height, label }: { height: number; label: string }) {
  return (
    <div
      className="flex w-full items-center justify-center bg-background"
      style={{ height }}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground/40">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <p className="font-mono text-xs uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
