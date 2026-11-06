/**
 * Every route that gets its own OG card, enumerated at build time. The endpoint
 * `pages/og/[...path].png.ts` renders one PNG per entry; `lib/seo.ts`'s
 * `ogUrlForPath` maps a request path to the matching `/og/<id>.png` by the same
 * convention, so the two never drift. Content routes are globbed from their
 * source (topic/guide/doc frontmatter, TOPIC groups, answered FAQ)
 * so adding a page mints its card automatically.
 */
import type { OgTarget } from './render.ts';
import { TOPICS } from '../content/topics.ts';
import { FAQ_ANSWERED } from '../content/faq.ts';
import { ARCH_PAGES } from '../content/architectureNav.ts';

interface Frontmatter {
  title?: string;
  description?: string;
  tags?: string[];
}
type FmModule = { frontmatter?: Frontmatter };

const slugOf = (key: string) => key.split('/').pop()!.replace(/\.(mdx|astro)$/, '');
const humanize = (slug: string) =>
  slug.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// ── content globs (frontmatter read eagerly; Vite-only, runs in the build) ──
// Guides/docs live in Keystatic content collections. Frontmatter is read
// eagerly (Vite-only, runs in the build). Topics come through TOPICS.
const guideMods = import.meta.glob<FmModule>('/src/content/guides/*.mdx', { eager: true });
const docMods = import.meta.glob<FmModule>('/src/content/docs/*.mdx', { eager: true });

function topicTargets(): OgTarget[] {
  return TOPICS.map((t) => ({ id: `mechanics/${t.slug}`, title: t.title, subtitle: t.oneLiner }));
}

function fmTargets(
  mods: Record<string, FmModule>,
  prefix: string,
): OgTarget[] {
  return Object.entries(mods)
    .filter(([key]) => slugOf(key) !== 'index')
    .map(([key, mod]) => {
      const slug = slugOf(key);
      const fm = mod.frontmatter ?? {};
      return {
        id: `${prefix}/${slug}`,
        title: fm.title ?? humanize(slug),
        subtitle: fm.description,
      };
    });
}

function faqTargets(): OgTarget[] {
  return FAQ_ANSWERED.map((q) => ({
    id: `faq/${q.id}`,
    title: q.en,
  }));
}

function archTargets(): OgTarget[] {
  return ARCH_PAGES.map((p) => ({
    id: `architecture/${p.slug}`,
    title: p.title,
    subtitle: p.subtitle,
  }));
}

const HOME: Omit<OgTarget, 'id'> = {
  title: 'Slot reels, ready to spin.',
  // Shorter than SITE.description, which the card cut mid-word.
  subtitle: 'A reel engine for PixiJS v8, with cascades, Hold & Win and big symbols built in.',
};

const SECTIONS: Array<{ id: string; title: string; subtitle: string }> = [
  { id: 'mechanics', title: 'Mechanics', subtitle: 'Runnable slot mechanics to copy: lines, cascades, Hold & Win, wilds, big symbols and more.' },
  { id: 'learn', title: 'Learn', subtitle: 'Mental models and step-by-step walkthroughs for building slots with pixi-reels.' },
  { id: 'faq', title: 'Frequently asked questions', subtitle: 'Practical how-tos for building reels, symbols, wins, and features.' },
  { id: 'api', title: 'API reference', subtitle: 'Every class, interface, and function in the pixi-reels public surface.' },
  { id: 'reference', title: 'Reference', subtitle: 'The builder, ReelSet, events and phases: the pixi-reels API in prose.' },
  { id: 'architecture', title: 'Architecture', subtitle: 'How the engine is wired: spin lifecycle, phases, events, cascade.' },
  { id: 'studio', title: 'Studio', subtitle: 'Write a recipe module and watch the reels rebuild, with the debug overlay and the event log beside them.' },
  { id: 'changelog', title: 'Changelog', subtitle: 'What changed in each pixi-reels release.' },
];

function sectionTargets(): OgTarget[] {
  return SECTIONS.map((s) => ({
    id: `section/${s.id}`,
    title: s.title,
    subtitle: s.subtitle,
  }));
}

export const OG_TARGETS: OgTarget[] = [
  { id: 'home', ...HOME },
  { id: 'default', ...HOME },
  ...sectionTargets(),
  ...topicTargets(),
  ...fmTargets(guideMods, 'learn'),
  ...fmTargets(docMods, 'reference'),
  ...faqTargets(),
  ...archTargets(),
];
