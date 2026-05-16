import { boot } from './setup.js';

// Standalone entrypoint — wires the DOM HUD elements declared in
// `index.html` to the shared `boot()` function. The site demo at
// `apps/site/src/components/demos/ArcLordDemo.tsx` calls the same
// `boot()` with its own host element and HUD.

void boot({
  host: document.body,
  fullScreen: true,
  hud: {
    winEl:    document.getElementById('win')    ?? undefined,
    multEl:   document.getElementById('multiplier') ?? undefined,
    statusEl: document.getElementById('status') ?? undefined,
  },
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
