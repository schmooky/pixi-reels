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
import sharp from 'sharp';
import { OG } from './theme.ts';

export interface OgTarget {
  /** Path under `/og/`, no leading slash or `.png`. e.g. `recipes/classic-5x3`. */
  id: string;
  /** Small uppercase category line, e.g. `RECIPE · WILDS`. */
  eyebrow: string;
  title: string;
  subtitle?: string;
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


/** The site's one accent, acid lime (`--brand` in the dark theme). */
const BRAND = 'hsl(76, 100%, 58%)';

// ── art: the generic stickers, read once and handed to Satori as PNG ───────
// Satori decodes PNG and JPEG, not WebP, so sharp converts each sticker once.
const STICKERS = ['H1', 'H2', 'H3', 'H4', 'W', 'S', 'L5', 'L4', 'L3', 'L2', 'L1'] as const;
let _stickers: Map<string, string> | null = null;
async function stickers(): Promise<Map<string, string>> {
  if (_stickers) return _stickers;
  const dir = path.resolve(process.cwd(), 'public/generic-symbols');
  const out = new Map<string, string>();
  for (const id of STICKERS) {
    const png = await sharp(path.join(dir, `${id}.webp`)).png().toBuffer();
    out.set(id, `data:image/png;base64,${png.toString('base64')}`);
  }
  _stickers = out;
  return out;
}

/** A stable sticker for a card: the same page always gets the same art. */
const CARD_ART = ['H1', 'H2', 'H3', 'H4', 'W', 'S'] as const;
function stickerFor(id: string): (typeof CARD_ART)[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_ART[h % CARD_ART.length]!;
}

/**
 * Fit a title into at most three lines: the size steps down with length,
 * and a title too long even at the smallest size is cut at a word, with an
 * ellipsis, never mid-word.
 */
function fitTitle(title: string): { size: number; text: string } {
  const n = title.length;
  const size = n <= 22 ? 76 : n <= 36 ? 64 : n <= 56 ? 54 : n <= 80 ? 46 : 42;
  return { size, text: clampWords(title, 104) };
}

function clampWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/** The art panel: one sticker, large, on a dark tile with a lime edge. */
function artPanel(src: string): Node {
  return h(
    'div',
    {
      display: 'flex',
      width: 360,
      height: 360,
      borderRadius: 4,
      border: `2px solid ${OG.border}`,
      background: OG.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    [{ type: 'img', props: { src, width: 300, height: 300, style: { width: 300, height: 300 } } }],
  );
}

/** The home card's art: a 3 x 3 board of stickers, three rows of three. */
function boardPanel(srcs: string[]): Node {
  const cell = 104;
  const img = (src: string) => ({ type: 'img', props: { src, width: cell, height: cell, style: { width: cell, height: cell } } });
  const row = (i: number) => h('div', { display: 'flex', marginTop: i === 0 ? 0 : 8 }, srcs.slice(i * 3, i * 3 + 3).map((src, k) => h('div', { display: 'flex', marginLeft: k === 0 ? 0 : 8 }, [img(src)])));
  return h(
    'div',
    { display: 'flex', flexDirection: 'column', padding: 14, borderRadius: 4, border: `2px solid ${OG.border}`, background: OG.surface },
    [row(0), row(1), row(2)],
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
          borderRadius: 4,
          background: BRAND,
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

function card(t: OgTarget, art: Map<string, string>): Node {
  const home = t.id === 'home' || t.id === 'default';
  const { size, text } = fitTitle(t.title);
  const panel = home
    ? boardPanel(['H1', 'W', 'H2', 'L5', 'H1', 'H3', 'S', 'H4', 'L4'].map((id) => art.get(id)!))
    : artPanel(art.get(stickerFor(t.id))!);

  const textColumn = h(
    'div',
    { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', paddingRight: 56 },
    [
      h(
        'div',
        {
          display: 'flex',
          fontFamily: 'JetBrains Mono',
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: BRAND,
          marginBottom: 22,
        },
        clampWords(t.eyebrow, 46),
      ),
      h(
        'div',
        {
          display: 'flex',
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.06,
          letterSpacing: -1.5,
          color: OG.fg,
        },
        text,
      ),
      ...(t.subtitle
        ? [
            h(
              'div',
              {
                display: 'flex',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: 28,
                lineHeight: 1.4,
                color: OG.soft,
                marginTop: 22,
              },
              // Fewer words under a long title, so the column never runs past the card.
              clampWords(t.subtitle, t.title.length > 56 ? 90 : 140),
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
      color: OG.fg,
      fontFamily: 'Inter',
    },
    [
      brandMark(),
      h('div', { display: 'flex', flex: 1, alignItems: 'center', marginTop: 8 }, [textColumn, panel]),
    ],
  );
}

export async function renderOg(target: OgTarget): Promise<Uint8Array> {
  if (!_fonts) _fonts = loadFonts();
  const svg = await satori(card(target, await stickers()) as never, {
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
