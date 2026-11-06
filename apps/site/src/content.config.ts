import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Astro reads the Keystatic-managed MDX collections so it can render their
 * bodies (with the RecipeDemo / Image components injected) and derive listings.
 * Keystatic edits the very same files under src/content/<type>/. FAQ is read
 * separately by src/content/faq.ts (synchronous, for the legacy export shape).
 *
 * A mechanic is one `/mechanics/<slug>/` page built from two files with the
 * same slug: `topics/<slug>.mdx` (frontmatter + the Concept prose) and
 * `recipes/<slug>.mdx` (the live demos). `src/content/topics.ts` reads the
 * topic frontmatter for the index cards.
 */
const topics = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/topics' }),
  schema: z.object({
    title: z.string(),
    group: z.enum(['lines', 'cascade', 'hold-and-win', 'ways', 'symbols', 'wins', 'layout']),
    oneLiner: z.string(),
    order: z.number().default(0),
    tags: z.array(z.string()).default([]),
    guides: z.array(z.string()).default([]),
    image: z.string().optional(),
  }),
});

const recipes = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    eyebrow: z.string().optional(),
    description: z.string().optional(),
    order: z.number().default(0),
  }),
});

const docs = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    eyebrow: z.string().optional(),
    description: z.string().optional(),
    order: z.number().default(0),
  }),
});

export const collections = { topics, recipes, guides, docs };
