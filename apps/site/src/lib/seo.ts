import { PIXI_REELS_VERSION } from './version.ts';

export const SITE = {
  name: 'pixi-reels',
  url: 'https://pixi-reels.schmooky.dev',
  author: 'pixi-reels contributors',
  githubRepo: 'https://github.com/schmooky/pixi-reels',
  tagline: 'Open-source slot machine reel engine for PixiJS v8',
  description:
    'Open-source reel engine for PixiJS v8. Fluent builder, typed events, configurable spin phases, win presenters, and a headless testing harness. Ships with runnable recipes for lines, scatters, free spins, hold & win, cascades, sticky wilds, and anticipation. MIT licensed.',
  // Organization/Author details for JSON-LD
  twitter: '',
  defaultImage: '/og/og-default.png',
};

/**
 * Resolve a section-specific OG image, falling back to the homepage one.
 * Sections map to `public/og/og-<section>.png` rendered from the SVG
 * sources by `scripts/render-og.mjs` (run via `pnpm og:render`).
 */
export function ogImageForSection(section: string | undefined): string {
  switch (section) {
    case 'guides':
      return '/og/og-guides.png';
    case 'recipes':
      return '/og/og-recipes.png';
    case 'api':
      return '/og/og-api.png';
    case 'architecture':
      return '/og/og-architecture.png';
    default:
      return '/og/og-default.png';
  }
}

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
    downloadUrl: 'https://www.npmjs.com/package/pixi-reels',
    softwareVersion: PIXI_REELS_VERSION,
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
    version: PIXI_REELS_VERSION,
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

/**
 * QAPage for a single question-and-answer page. The right schema when one URL
 * is one question (vs FAQPage, which is many Q&A on one page). `answer` should
 * be plain text (strip inline-code backticks before passing).
 */
export function qaPageLd(p: {
  question: string;
  answer: string;
  path: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    mainEntity: {
      '@type': 'Question',
      name: p.question,
      url: canonical(p.path),
      answerCount: 1,
      acceptedAnswer: { '@type': 'Answer', text: p.answer, url: canonical(p.path) },
    },
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
