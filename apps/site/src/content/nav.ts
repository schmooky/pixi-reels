import { ARCH_PAGES } from './architectureNav.ts';

export interface NavItem {
  label: string;
  href: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** The /learn/ shelf: the three tutorials and the three author notes. */
export const LEARN_NAV: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { label: 'Getting started', href: '/learn/getting-started/' },
      { label: 'Your first reelset', href: '/learn/your-first-reelset/' },
      { label: 'Your first cascade', href: '/learn/your-first-cascade/' },
    ],
  },
  {
    title: 'For authors',
    items: [
      { label: 'Cheats & testing', href: '/learn/cheats-and-testing/' },
      { label: 'Debugging', href: '/learn/debugging/' },
      { label: 'Recipe previews', href: '/learn/recipe-previews/' },
    ],
  },
];

/** The /reference/ shelf: hand-written API guides, the generated reference, the tour. */
export const REFERENCE_NAV: NavSection[] = [
  {
    title: 'API guides',
    items: [
      { label: 'ReelSet', href: '/reference/api-reelset/' },
      { label: 'Builder', href: '/reference/api-builder/' },
      { label: 'Events', href: '/reference/api-events/' },
      { label: 'Phases', href: '/reference/api-phases/' },
    ],
  },
  {
    title: 'Full reference',
    items: [
      { label: 'API index (TypeDoc)', href: '/api/' },
      { label: 'Migrating to 4.0', href: '/reference/migrating-to-4-0/' },
      { label: 'Migrating to 3.0', href: '/reference/migrating-to-3-0/' },
      { label: 'Migrating to 2.0', href: '/reference/migrating-to-2-0/' },
      { label: 'Migrating to 1.0', href: '/reference/migrating-to-1-0/' },
      { label: 'Glossary', href: '/reference/glossary/' },
      { label: 'Changelog', href: '/reference/changelog/' },
    ],
  },
  {
    title: 'Architecture',
    items: ARCH_PAGES.map((p) => ({ label: p.title, href: `/architecture/${p.slug}/` })),
  },
];
