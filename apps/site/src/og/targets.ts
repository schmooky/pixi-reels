/**
 * Every route that gets its own OG card, enumerated at build time. The endpoint
 * `pages/og/[...path].png.ts` renders one PNG per entry; `lib/seo.ts`'s
 * `ogUrlForPath` maps a request path to the matching `/og/<id>.png` by the same
 * convention, so the two never drift. Content routes are globbed from their
 * source (recipes/guides/demos/docs frontmatter, RECIPES groups, answered FAQ)
 * so adding a page mints its card automatically.
 */
import type { OgTarget } from './render.ts';
import { SITE } from '../lib/seo.ts';
import { RECIPES, RECIPE_GROUPS } from '../content/recipes.ts';
import { FAQ_ANSWERED, FAQ_GROUP_TITLE } from '../content/faq.ts';
import { ARCH_PAGES } from '../content/architectureNav.ts';
import { monogram, hueFor } from '../lib/recipeMedia.ts';

interface Frontmatter {
  title?: string;
  description?: string;
  eyebrow?: string;
  tags?: string[];
}
type FmModule = { frontmatter?: Frontmatter };

const slugOf = (key: string) => key.split('/').pop()!.replace(/\.(mdx|astro)$/, '');
const humanize = (slug: string) =>
  slug.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const recipeGroupLabel = new Map(RECIPE_GROUPS.map((g) => [g.id, g.label.replace(/\s*\(.*\)$/, '')]));
const recipeBySlug = new Map(RECIPES.map((r) => [r.slug, r]));

// ── content globs (frontmatter read eagerly; Vite-only, runs in the build) ──
// Recipes/guides/docs now live in Keystatic content collections; demos are
// still plain route MDX. Frontmatter is read eagerly (Vite-only, build time).
const recipeMods = import.meta.glob<FmModule>('/src/content/recipes/*.mdx', { eager: true });
const guideMods = import.meta.glob<FmModule>('/src/content/guides/*.mdx', { eager: true });
const demoMods = import.meta.glob<FmModule>('/src/pages/demos/*.mdx', { eager: true });
const docMods = import.meta.glob<FmModule>('/src/content/docs/*.mdx', { eager: true });

function recipeTargets(): OgTarget[] {
  return Object.entries(recipeMods).map(([key, mod]) => {
    const slug = slugOf(key);
    const meta = recipeBySlug.get(slug);
    const fm = mod.frontmatter ?? {};
    const title = fm.title ?? meta?.title ?? humanize(slug);
    const group = meta ? recipeGroupLabel.get(meta.group) : undefined;
    return {
      id: `recipes/${slug}`,
      eyebrow: group ? `Recipe · ${group}` : 'Recipe',
      title,
      subtitle: fm.description ?? meta?.oneLiner,
      monogram: monogram(title),
      hue: hueFor(title),
      footerRight: `/recipes/${slug}`,
    };
  });
}

function fmTargets(
  mods: Record<string, FmModule>,
  prefix: string,
  eyebrow: string,
): OgTarget[] {
  return Object.entries(mods)
    .filter(([key]) => slugOf(key) !== 'index')
    .map(([key, mod]) => {
      const slug = slugOf(key);
      const fm = mod.frontmatter ?? {};
      return {
        id: `${prefix}/${slug}`,
        eyebrow: fm.eyebrow ? `${eyebrow} · ${fm.eyebrow}` : eyebrow,
        title: fm.title ?? humanize(slug),
        subtitle: fm.description,
        footerRight: `/${prefix}/${slug}`,
      };
    });
}

function faqTargets(): OgTarget[] {
  return FAQ_ANSWERED.map((q) => ({
    id: `faq/${q.id}`,
    eyebrow: `FAQ · ${FAQ_GROUP_TITLE[q.group].en}`,
    title: q.en,
    monogram: '?',
    hue: hueFor(q.id),
    footerRight: `/faq/${q.id}`,
  }));
}

function archTargets(): OgTarget[] {
  return ARCH_PAGES.map((p) => ({
    id: `architecture/${p.slug}`,
    eyebrow: `Architecture · ${p.eyebrow}`,
    title: p.title,
    subtitle: p.subtitle,
    footerRight: `/architecture/${p.slug}`,
  }));
}

const HOME: Omit<OgTarget, 'id'> = {
  eyebrow: 'Open-source slot reel engine for PixiJS v8',
  title: 'Slot reels, ready to spin.',
  subtitle: SITE.description,
  footerRight: 'npm i pixi-reels',
};

const SECTIONS: Array<{ id: string; eyebrow: string; title: string; subtitle: string }> = [
  { id: 'recipes', eyebrow: 'Browse', title: 'Recipes', subtitle: 'Runnable, copy-paste slot mechanics — lines, cascades, hold & win, wilds, big symbols, and more.' },
  { id: 'guides', eyebrow: 'Learn', title: 'Guides', subtitle: 'Mental models and step-by-step walkthroughs for building slots with pixi-reels.' },
  { id: 'faq', eyebrow: 'Answers', title: 'Frequently asked questions', subtitle: 'Practical how-tos for building reels, symbols, wins, and features.' },
  { id: 'demos', eyebrow: 'Showcase', title: 'Live demos', subtitle: 'Full slot mechanics running in the browser, built on pixi-reels.' },
  { id: 'api', eyebrow: 'Reference', title: 'API reference', subtitle: 'Every class, interface, and function in the pixi-reels public surface.' },
  { id: 'docs', eyebrow: 'Reference', title: 'Documentation', subtitle: 'Builder, ReelSet, events, and phases — the pixi-reels API in prose.' },
  { id: 'architecture', eyebrow: 'Internals', title: 'Architecture', subtitle: 'How the engine is wired: spin lifecycle, phases, events, cascade.' },
  { id: 'changelog', eyebrow: 'Releases', title: 'Changelog', subtitle: 'What changed in each pixi-reels release.' },
];

function sectionTargets(): OgTarget[] {
  return SECTIONS.map((s) => ({
    id: `section/${s.id}`,
    eyebrow: s.eyebrow,
    title: s.title,
    subtitle: s.subtitle,
    footerRight: `/${s.id}`,
  }));
}

export const OG_TARGETS: OgTarget[] = [
  { id: 'home', ...HOME },
  { id: 'default', ...HOME },
  ...sectionTargets(),
  ...recipeTargets(),
  ...fmTargets(guideMods, 'guides', 'Guide'),
  ...fmTargets(demoMods, 'demos', 'Demo'),
  ...fmTargets(docMods, 'docs', 'Docs'),
  ...faqTargets(),
  ...archTargets(),
];
