/**
 * Code-driven OpenGraph cards. Satori turns a flexbox tree + our fonts into an
 * SVG (text baked to vector paths), then resvg rasterises it to a 1200x630 PNG.
 * Because Satori embeds glyph outlines, the raster step needs no fonts and the
 * text can never fall back / mangle the way the old `sharp`-renders-SVG path
 * did. One card per route, generated at build by `pages/og/[...path].png.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OG, badgeColor, tintSoft } from './theme.ts';

export interface OgTarget {
  /** Path under `/og/`, no leading slash or `.png`. e.g. `recipes/classic-5x3`. */
  id: string;
  /** Small uppercase category line, e.g. `RECIPE · WILDS`. */
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** 1-2 letter glyph; when set, the card shows the reel-board icon panel. */
  monogram?: string;
  /** Stable hue for the monogram badge (mirrors the on-site recipe card). */
  hue?: number;
  /** Right-aligned footer text; defaults to the canonical site URL on the left only. */
  footerRight?: string;
}

// ── tiny hyperscript so we avoid a JSX/React build step in a plain .ts module.
type Node = { type: string; props: Record<string, unknown> };
function h(
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
): Node {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

// ── fonts (read once) ───────────────────────────────────────────────────────
// Resolve the source `fonts/` dir, not a bundled location: at build the
// endpoint is bundled into dist/.prerender/chunks, so `import.meta.url` no
// longer sits next to the woff files. cwd (= the site root under pnpm) is the
// reliable anchor; the URL-relative path is the dev/standalone fallback.
let _fontDir: string | null = null;
function fontDir(): string {
  if (_fontDir) return _fontDir;
  const candidates = [
    path.resolve(process.cwd(), 'src/og/fonts'),
    fileURLToPath(new URL('./fonts/', import.meta.url)),
  ];
  _fontDir =
    candidates.find((c) => {
      try {
        return fs.statSync(c).isDirectory();
      } catch {
        return false;
      }
    }) ?? candidates[0];
  return _fontDir;
}
const fontFile = (name: string) => fs.readFileSync(path.join(fontDir(), name));

let _fonts: Awaited<ReturnType<typeof loadFonts>> | null = null;
function loadFonts() {
  return [
    { name: 'Inter', data: fontFile('Inter-400.woff'), weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: fontFile('Inter-600.woff'), weight: 600 as const, style: 'normal' as const },
    { name: 'Inter', data: fontFile('Inter-700.woff'), weight: 700 as const, style: 'normal' as const },
    { name: 'JetBrains Mono', data: fontFile('JetBrainsMono-400.woff'), weight: 400 as const, style: 'normal' as const },
    { name: 'JetBrains Mono', data: fontFile('JetBrainsMono-700.woff'), weight: 700 as const, style: 'normal' as const },
  ];
}

const SITE_HOST = 'pixi-reels.schmooky.dev';

/** Pick a title size that keeps long titles to ~2 lines without overflow. */
function titleSize(title: string): number {
  const n = title.length;
  if (n <= 22) return 74;
  if (n <= 36) return 62;
  if (n <= 54) return 52;
  return 44;
}
function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** The reel-board icon panel — the same monogram + hue identity as RecipePlaceholder. */
function iconPanel(monogram: string, hue: number): Node {
  const cols = [0, 1, 2, 3];
  const cells = (c: number) =>
    [0, 1, 2].map((r) =>
      h('div', {
        width: 56,
        height: 56,
        borderRadius: 10,
        background: 'rgba(250,250,250,0.05)',
        marginTop: r === 0 ? 0 : 14,
      }),
    );
  return h(
    'div',
    {
      position: 'relative',
      display: 'flex',
      width: 340,
      height: 402,
      borderRadius: 28,
      border: `1px solid ${OG.border}`,
      background: OG.surface,
      backgroundImage: `linear-gradient(135deg, ${tintSoft(hue)}14, transparent 70%)`,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    [
      // faux reel columns behind the badge
      h(
        'div',
        { position: 'absolute', top: 28, left: 26, display: 'flex' },
        cols.map((c) =>
          h('div', { display: 'flex', flexDirection: 'column', marginLeft: c === 0 ? 0 : 16 }, cells(c)),
        ),
      ),
      // monogram badge
      h(
        'div',
        {
          display: 'flex',
          width: 132,
          height: 132,
          borderRadius: 28,
          background: badgeColor(hue),
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: 56,
          letterSpacing: -2,
          color: '#fff',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        },
        monogram,
      ),
    ],
  );
}

function brandMark(): Node {
  return h(
    'div',
    { display: 'flex', alignItems: 'center' },
    [
      h(
        'div',
        {
          display: 'flex',
          width: 52,
          height: 52,
          borderRadius: 14,
          background: OG.fg,
          color: OG.bg,
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'JetBrains Mono',
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: -1,
        },
        'PR',
      ),
      h(
        'div',
        { marginLeft: 18, fontFamily: 'Inter', fontWeight: 600, fontSize: 30, color: OG.fg, letterSpacing: -0.5 },
        'pixi-reels',
      ),
    ],
  );
}

function card(t: OgTarget): Node {
  const hasIcon = !!t.monogram;
  const tSize = titleSize(t.title);

  const textColumn = h(
    'div',
    { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', paddingRight: hasIcon ? 56 : 0 },
    [
      h(
        'div',
        {
          fontFamily: 'JetBrains Mono',
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: OG.muted,
          marginBottom: 22,
        },
        clamp(t.eyebrow, 46),
      ),
      h(
        'div',
        {
          display: 'flex',
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: tSize,
          lineHeight: 1.05,
          letterSpacing: -1.5,
          color: OG.fg,
          maxHeight: tSize * 2.2,
          overflow: 'hidden',
        },
        clamp(t.title, 84),
      ),
      ...(t.subtitle
        ? [
            h(
              'div',
              {
                display: 'flex',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: 27,
                lineHeight: 1.4,
                color: OG.muted,
                marginTop: 24,
                maxHeight: 27 * 1.4 * 3,
                overflow: 'hidden',
              },
              clamp(t.subtitle, 168),
            ),
          ]
        : []),
    ],
  );

  return h(
    'div',
    {
      width: OG.width,
      height: OG.height,
      display: 'flex',
      flexDirection: 'column',
      padding: 64,
      background: OG.bg,
      backgroundImage: `radial-gradient(900px 420px at 28% 0%, rgba(250,250,250,0.06), transparent 60%)`,
      color: OG.fg,
      fontFamily: 'Inter',
    },
    [
      // top brand row
      h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
        brandMark(),
        h(
          'div',
          {
            fontFamily: 'JetBrains Mono',
            fontWeight: 400,
            fontSize: 18,
            color: OG.faint,
          },
          'PixiJS v8 · MIT',
        ),
      ]),
      // body
      h(
        'div',
        { display: 'flex', flex: 1, alignItems: 'center', marginTop: 8 },
        hasIcon ? [textColumn, iconPanel(t.monogram!, t.hue ?? 220)] : [textColumn],
      ),
      // footer
      h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: 19, color: OG.faint }, [
        h('div', { display: 'flex', color: OG.muted }, SITE_HOST),
        h('div', { display: 'flex' }, t.footerRight ?? 'github.com/schmooky/pixi-reels'),
      ]),
    ],
  );
}

export async function renderOg(target: OgTarget): Promise<Uint8Array> {
  if (!_fonts) _fonts = loadFonts();
  const svg = await satori(card(target) as never, {
    width: OG.width,
    height: OG.height,
    fonts: _fonts,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG.width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  return png;
}
