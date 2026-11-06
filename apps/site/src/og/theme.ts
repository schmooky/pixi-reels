/**
 * Palette + sizing for generated OG cards. These are the site's dark-mode
 * shadcn (zinc) tokens from `styles/global.css`, resolved to hex so Satori's
 * CSS color parser never has to touch the `hsl(var(--x))` wiring. OG cards are
 * always dark: they read crisply on Slack / Discord / X unfurls regardless of
 * the viewer's theme, and they match the site's dark code surfaces.
 */
export const OG = {
  width: 1200,
  height: 630,

  // zinc-950 / 50 / 400 / 500 / 800: the dark `--background`/`--foreground`/
  // `--muted-foreground`/`--border` triples, plus one lifted surface.
  bg: '#09090b',
  surface: '#111114',
  fg: '#fafafa',
  muted: '#a1a1aa',
  // zinc-300: the card subtitle, light enough to read in a feed thumbnail.
  soft: '#d4d4d8',
  faint: '#71717a',
  border: '#27272a',
  borderSoft: '#1f1f23',
} as const;
