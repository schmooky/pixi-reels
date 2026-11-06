import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Bumped to remount the runner on a fresh context after the browser took
  // the old one. Three losses inside ten seconds means the machine is out of
  // contexts: stop and wait for a tap rather than thrash.
  const [generation, setGeneration] = useState(0);
  const [stalled, setStalled] = useState(false);
  const losses = useRef<number[]>([]);
  const onContextLost = useCallback(() => {
    const now = performance.now();
    losses.current = losses.current.filter((t) => now - t < 10_000).concat(now);
    if (losses.current.length > 3) {
      setStalled(true);
      return;
    }
    setTimeout(() => setGeneration((g) => g + 1), 250);
  }, []);
  const retry = useCallback(() => {
    losses.current = [];
    setStalled(false);
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A generous margin on purpose: mounting is cheap next to an unmount.
    //
    // Teardown itself is no longer unsafe. The renderer race this comment
    // used to warn about was `app.destroy(true, ...)` in RecipeRunner
    // releasing pixi's PROCESS-global pools out from under the other live
    // demos; it now passes `{ removeView: true }`. The margin stays generous
    // anyway, because booting a demo still costs a WebGL context and an asset
    // load, so thrashing it at the viewport edge is worse than keeping a few
    // extra alive. `recipes survive scrolling` in
    // tests/e2e/recipes-mount.spec.ts covers the unmount path now, so
    // shrinking this for phones is a measurable change rather than a gamble.
    const io = new IntersectionObserver(
      (entries) => setActive(entries[0]?.isIntersecting ?? false),
      { rootMargin: '500px 0px 500px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {active && !stalled ? (
        <RecipeRunner key={generation} code={code} height={height} onContextLost={onContextLost} />
      ) : stalled ? (
        <button type="button" onClick={retry} className="block w-full text-left" aria-label="Reload this demo">
          <Placeholder height={height} label="Too many demos open. Tap to reload" spinner={false} />
        </button>
      ) : (
        <Placeholder height={height} label="Scroll to load" />
      )}
    </div>
  );
}

function Placeholder({ height, label, spinner = true }: { height: number; label: string; spinner?: boolean }) {
  // Same shape as the runner: the well at `height`, then its toolbar strip.
  return (
    <div aria-hidden="true">
      <div className="flex w-full items-center justify-center bg-stage" style={{ height }}>
        <div className="flex flex-col items-center gap-3 text-foreground/40">
          {spinner && <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          <p className="font-mono text-[11px] uppercase tracking-[0.14em]">{label}</p>
        </div>
      </div>
      <div className="h-9 border-t border-border" />
    </div>
  );
}
