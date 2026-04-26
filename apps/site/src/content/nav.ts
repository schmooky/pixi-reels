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
    ],
  },
  {
    title: 'Building blocks',
    items: [
      { label: 'Symbols', href: '/guides/symbols/' },
      { label: 'Spine pins + movePin', href: '/guides/spine-pins/' },
      { label: 'Spin lifecycle', href: '/guides/spin-lifecycle/' },
      { label: 'Per-reel geometry', href: '/guides/per-reel-geometry/' },
      { label: 'MultiWays', href: '/guides/multiways/' },
      { label: 'Big symbols', href: '/guides/big-symbols/' },
      { label: 'Speed modes', href: '/guides/speed-modes/' },
      { label: 'Win animations', href: '/guides/win-animations/' },
    ],
  },
  {
    title: 'For authors',
    items: [
      { label: 'Cheats & testing', href: '/guides/cheats-and-testing/' },
      { label: 'Debugging', href: '/guides/debugging/' },
    ],
  },
];

export const WIKI_NAV: NavSection[] = [
  {
    title: 'API',
    items: [
      { label: 'ReelSet', href: '/docs/api-reelset/' },
      { label: 'Builder', href: '/docs/api-builder/' },
      { label: 'Events', href: '/docs/api-events/' },
      { label: 'Phases', href: '/docs/api-phases/' },
    ],
  },
  {
    title: 'Reference',
    items: [{ label: 'Glossary', href: '/docs/glossary/' }],
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

