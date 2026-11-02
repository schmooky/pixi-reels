/**
 * Every route that gets its own OG card, enumerated at build time. The endpoint
 * `pages/og/[...path].png.ts` renders one PNG per entry; `lib/seo.ts`'s
 * `ogUrlForPath` maps a request path to the matching `/og/<id>.png` by the same
 * convention, so the two never drift. Content routes are globbed from their
 * source (topic/guide/doc frontmatter, TOPIC groups, answered FAQ)
 * so adding a page mints its card automatically.
 */
import type { OgTarget } from './render.ts';
import { SITE } from '../lib/seo.ts';
import { TOPICS, TOPIC_GROUPS } from '../content/topics.ts';
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

const topicGroupLabel = new Map(TOPIC_GROUPS.map((g) => [g.id, g.label.replace(/\s*\(.*\)$/, '')]));

// ── content globs (frontmatter read eagerly; Vite-only, runs in the build) ──
// Guides/docs live in Keystatic content collections. Frontmatter is read
// eagerly (Vite-only, runs in the build). Topics come through TOPICS.
const guideMods = import.meta.glob<FmModule>('/src/content/guides/*.mdx', { eager: true });
const docMods = import.meta.glob<FmModule>('/src/content/docs/*.mdx', { eager: true });

function topicTargets(): OgTarget[] {
  return TOPICS.map((t) => {
    const group = topicGroupLabel.get(t.group);
    return {
      id: `mechanics/${t.slug}`,
      eyebrow: group ? `Mechanics · ${group}` : 'Mechanics',
      title: t.title,
      subtitle: t.oneLiner,
      monogram: monogram(t.title),
      hue: hueFor(t.title),
      footerRight: `/mechanics/${t.slug}`,
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
  { id: 'mechanics', eyebrow: 'Browse', title: 'Mechanics', subtitle: 'Runnable, copy-paste slot mechanics — lines, cascades, hold & win, wilds, big symbols, and more.' },
  { id: 'learn', eyebrow: 'Learn', title: 'Learn', subtitle: 'Mental models and step-by-step walkthroughs for building slots with pixi-reels.' },
  { id: 'faq', eyebrow: 'Answers', title: 'Frequently asked questions', subtitle: 'Practical how-tos for building reels, symbols, wins, and features.' },
  { id: 'api', eyebrow: 'Reference', title: 'API reference', subtitle: 'Every class, interface, and function in the pixi-reels public surface.' },
  { id: 'reference', eyebrow: 'Reference', title: 'Reference', subtitle: 'Builder, ReelSet, events, and phases — the pixi-reels API in prose.' },
  { id: 'architecture', eyebrow: 'Internals', title: 'Architecture', subtitle: 'How the engine is wired: spin lifecycle, phases, events, cascade.' },
  { id: 'changelog', eyebrow: 'Releases', title: 'Changelog', subtitle: 'What changed in each pixi-reels release.' },
];

function sectionTargets(): OgTarget[] {
  return SECTIONS.map((s) => ({
    id: `section/${s.id}`,
    eyebrow: s.eyebrow,
    title: s.title,
    subtitle: s.subtitle,
    footerRight: s.id === 'changelog' ? '/reference/changelog' : `/${s.id}`,
  }));
}

export const OG_TARGETS: OgTarget[] = [
  { id: 'home', ...HOME },
  { id: 'default', ...HOME },
  ...sectionTargets(),
  ...topicTargets(),
  ...fmTargets(guideMods, 'learn', 'Learn'),
  ...fmTargets(docMods, 'reference', 'Reference'),
  ...faqTargets(),
  ...archTargets(),
];
