export const SITE = {
  name: 'pixi-reels',
  url: 'https://pixi-reels.dev',
  author: 'pixi-reels contributors',
  githubRepo: 'https://github.com/schmooky/pixi-reels',
  tagline: 'Open-source slot machine reel engine for PixiJS v8',
  description:
    'Open-source slot reel engine for PixiJS v8. Fluent builder, typed events, the weighty spin+stop feel of real-money games, and mechanic sandboxes with cheat panels — classic lines, scatters, free spins, hold & win, cascades, sticky wilds, anticipation. MIT licensed.',
  keywords: [
    'pixi-reels',
    'pixijs slot',
    'pixijs slot machine',
    'slot machine library',
    'slot reel engine',
    'slot engine javascript',
    'html5 slot machine',
    'open source slot',
    'slot mechanics',
    'cascade slot',
    'hold and win',
    'sticky wilds',
    'pixijs v8',
    'casino game framework',
    'slot framework',
    'free spins trigger',
    'scatter symbol',
    'anticipation reel',
    'slam stop',
    'slot game development',
  ],
  // Organization/Author details for JSON-LD
  twitter: '',
  defaultImage: '/og-default.svg',
};

export interface PageSeo {
  title: string;
  description: string;
  /** Canonical path starting with / */
  path?: string;
  /** image absolute or root-relative path, auto-prefixed with site URL */
  image?: string;
  /** "website" for landing, "article" for docs/demos */
  type?: 'website' | 'article';
  /** If provided, article metadata is emitted */
  article?: {
    section?: string;
    tags?: string[];
    publishedTime?: string;
    modifiedTime?: string;
  };
  keywords?: string[];
  /** JSON-LD objects to embed. */
  jsonLd?: unknown[];
  /** Override noindex for internal pages. */
  noIndex?: boolean;
}

export function canonical(path: string | undefined): string {
  if (!path) return SITE.url;
  return new URL(path, SITE.url).toString();
}

export function imageUrl(image: string | undefined): string {
  const img = image ?? SITE.defaultImage;
  return new URL(img, SITE.url).toString();
}

// ── JSON-LD builders ────────────────────────────────────────────────────────

export function softwareApplicationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web Browser',
    description: SITE.description,
    url: SITE.url,
    license: 'https://opensource.org/licenses/MIT',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Organization', name: SITE.author, url: SITE.githubRepo },
    codeRepository: SITE.githubRepo,
    programmingLanguage: 'TypeScript',
    requirements: 'PixiJS v8, GSAP 3',
  };
}

export function softwareSourceCodeLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: SITE.name,
    description: SITE.description,
    codeRepository: SITE.githubRepo,
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'Web Browser',
    license: 'https://opensource.org/licenses/MIT',
    url: SITE.url,
  };
}

export function articleLd(p: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: p.title,
    description: p.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical(p.path) },
    image: imageUrl(p.image),
    author: { '@type': 'Organization', name: SITE.author, url: SITE.githubRepo },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: imageUrl('/logo.svg') },
    },
  };
}

export function howToLd(p: {
  name: string;
  description: string;
  steps: Array<{ name: string; text: string }>;
  path: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: p.name,
    description: p.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical(p.path) },
    step: p.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function breadcrumbLd(
  crumbs: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: new URL(c.url, SITE.url).toString(),
    })),
  };
}

export function faqLd(
  items: Array<{ question: string; answer: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  };
}

export function webSiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.tagline,
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.githubRepo },
  };
}
