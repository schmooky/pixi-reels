export interface NavItem {
  label: string;
  href: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const GUIDES_NAV: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { label: 'Getting started', href: '/guides/getting-started/' },
      { label: 'Your first reelset', href: '/guides/your-first-reelset/' },
      { label: 'Your first cascade', href: '/guides/your-first-cascade/' },
    ],
  },
  {
    title: 'Building blocks',
    items: [
      { label: 'Symbols', href: '/guides/symbols/' },
      { label: 'Pins', href: '/guides/pins/' },
      { label: 'Spin lifecycle', href: '/guides/spin-lifecycle/' },
      { label: 'Cascades', href: '/guides/cascades/' },
      { label: 'Per-reel geometry', href: '/guides/per-reel-geometry/' },
      { label: 'MultiWays', href: '/guides/multiways/' },
      { label: 'Big symbols', href: '/guides/big-symbols/' },
      { label: 'Buffer indexing', href: '/guides/buffer-indexing/' },
      { label: 'Nudge', href: '/guides/nudge/' },
      { label: 'Speed modes', href: '/guides/speed-modes/' },
      { label: 'Win animations', href: '/guides/win-animations/' },
      { label: 'Hold & Win', href: '/guides/hold-and-win/' },
    ],
  },
  {
    title: 'For authors',
    items: [
      { label: 'Cheats & testing', href: '/guides/cheats-and-testing/' },
      { label: 'Debugging', href: '/guides/debugging/' },
      { label: 'Recipe previews', href: '/guides/recipe-previews/' },
    ],
  },
];

export const WIKI_NAV: NavSection[] = [
  {
    title: 'API guides',
    items: [
      { label: 'ReelSet', href: '/docs/api-reelset/' },
      { label: 'Builder', href: '/docs/api-builder/' },
      { label: 'Events', href: '/docs/api-events/' },
      { label: 'Phases', href: '/docs/api-phases/' },
    ],
  },
  {
    title: 'Full reference',
    items: [
      { label: 'API index (TypeDoc)', href: '/api/' },
      { label: 'Migrating to 1.0', href: '/docs/migrating-to-1-0/' },
      { label: 'Glossary', href: '/docs/glossary/' },
      { label: 'Changelog', href: '/changelog/' },
    ],
  },
  {
    title: 'Architecture',
    items: [
      { label: 'Overview', href: '/architecture/overview/' },
      { label: 'Classes', href: '/architecture/classes/' },
      { label: 'Events', href: '/architecture/events/' },
      { label: 'Spin lifecycle', href: '/architecture/spin-lifecycle/' },
      { label: 'Cascade physics', href: '/architecture/cascade/' },
      { label: 'Testing model', href: '/architecture/testing/' },
    ],
  },
];

