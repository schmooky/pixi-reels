/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';

/**
 * Hold a boolean `true` value for at least `minMs` milliseconds after it
 * first flips on, even if the source flips off in the meantime.
 *
 * Used by the recipe runners to keep the loading skeleton on screen long
 * enough to register as a deliberate placeholder. Without this, recipes
 * that compile in <100ms would flash the skeleton for a single frame —
 * worse than no skeleton at all.
 *
 * Pass `loading` (truthy while we want the skeleton) and the minimum
 * display time. Returns the latched value: stays `true` for at least
 * `minMs` after the first time `loading` was `true`.
 */
export function useMinDisplay(loading: boolean, minMs = 250): boolean {
  const [latched, setLatched] = useState<boolean>(loading);
  const startedAt = useRef<number | null>(loading ? Date.now() : null);

  useEffect(() => {
    if (loading) {
      // First time we see loading=true, stamp the start time. Re-stamps
      // on subsequent re-mounts (e.g. after error retry) so each mount
      // gets its own min-display window.
      if (startedAt.current === null) startedAt.current = Date.now();
      setLatched(true);
      return;
    }
    // loading just turned false. Compute remaining min time and either
    // flip immediately or schedule a flip.
    const start = startedAt.current ?? Date.now();
    const elapsed = Date.now() - start;
    if (elapsed >= minMs) {
      setLatched(false);
      startedAt.current = null;
      return;
    }
    const t = setTimeout(() => {
      setLatched(false);
      startedAt.current = null;
    }, minMs - elapsed);
    return () => clearTimeout(t);
  }, [loading, minMs]);

  return latched;
}
