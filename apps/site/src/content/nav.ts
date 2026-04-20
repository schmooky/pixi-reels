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
      { label: 'Spin lifecycle', href: '/guides/spin-lifecycle/' },
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
      { label: 'ReelSet', href: '/wiki/api-reelset/' },
      { label: 'Builder', href: '/wiki/api-builder/' },
      { label: 'Events', href: '/wiki/api-events/' },
      { label: 'Phases', href: '/wiki/api-phases/' },
    ],
  },
  {
    title: 'Reference',
    items: [{ label: 'Glossary', href: '/wiki/glossary/' }],
  },
];

