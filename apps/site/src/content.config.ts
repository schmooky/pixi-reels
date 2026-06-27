import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Astro reads the Keystatic-managed MDX collections so it can render their
 * bodies (with the RecipeDemo / Image components injected) and derive listings.
 * Keystatic edits the very same files under src/content/<type>/. FAQ is read
 * separately by src/content/faq.ts (synchronous, for the legacy export shape).
 */
const recipes = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    group: z.string(),
    oneLiner: z.string().default(''),
    description: z.string().optional(),
    order: z.number().default(0),
    steps: z.array(z.string()).default([]),
    apis: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
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

export const collections = { recipes, guides, docs };
