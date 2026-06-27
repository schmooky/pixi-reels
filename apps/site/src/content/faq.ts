/**
 * FAQ knowledge base for pixi-reels — the source for the /faq/ route.
 *
 * Content now lives in Keystatic collections on disk:
 *   - src/content/faq-groups/<id>.yaml   (group title + blurb + order)
 *   - src/content/faq/<id>.yaml          (one question per file)
 * Edit them at /keystatic (run `pnpm --filter @pixi-reels/site dev`).
 *
 * This module reads those files synchronously at load so every downstream
 * consumer (the /faq pages, sitemap, OG targets) keeps the same synchronous
 * `FAQ`, `FAQ_QUESTIONS`, … exports it always had.
 *
 * Questions a slot developer actually asks the first time they open the
 * library. A question with an `answer` gets its own searchable `/faq/<id>/`
 * page; open ones stay listed on the index until answered. IDs are
 * `<groupPrefix>-NNN` (zero-padded) and sort questions within a group.
 */
import { parse } from 'yaml';

export interface FaqLink {
  label: string;
  href: string;
}

export interface FaqQuestion {
  id: string;
  en: string;
  /** Answer text. Unset = open question (no dedicated page until answered). */
  answer?: { en: string };
  /** Further-reading links (recipes, guides) shown under the answer. */
  links?: FaqLink[];
  /** Optional slug of the recipe that best demonstrates this. */
  recipe?: string;
}

export interface FaqGroup {
  id: string;
  title: { en: string };
  blurb: { en: string };
  questions: FaqQuestion[];
}

// Vite inlines every YAML file's text at build time, so this works the same in
// `astro dev` and the bundled static build (a plain fs read would resolve
// relative to the bundled chunk, not the source, and fail at build).
const groupFiles = import.meta.glob<string>('./faq-groups/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const questionFiles = import.meta.glob<string>('./faq/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const idOf = (path: string) => path.replace(/^.*\//, '').replace(/\.yaml$/, '');

interface GroupFile {
  title: string;
  blurb: string;
  order?: number;
}
interface QuestionFile {
  group: string;
  question: string;
  answer?: string;
  recipe?: string;
  links?: FaqLink[];
}

// Build the grouped tree. Groups sort by `order`; questions sort by their
// zero-padded id, which preserves the original beginner→advanced ordering.
const groupMeta = Object.entries(groupFiles)
  .map(([path, raw]) => ({ id: idOf(path), ...(parse(raw) as GroupFile) }))
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));

const questionsByGroup = new Map<string, FaqQuestion[]>();
for (const [path, raw] of Object.entries(questionFiles).sort((a, b) => a[0].localeCompare(b[0]))) {
  const id = idOf(path);
  const q = parse(raw) as QuestionFile;
  const resolved: FaqQuestion = { id, en: q.question };
  if (q.answer) resolved.answer = { en: q.answer };
  if (q.links?.length) resolved.links = q.links;
  if (q.recipe) resolved.recipe = q.recipe;
  if (!questionsByGroup.has(q.group)) questionsByGroup.set(q.group, []);
  questionsByGroup.get(q.group)!.push(resolved);
}

export const FAQ: FaqGroup[] = groupMeta.map((g) => ({
  id: g.id,
  title: { en: g.title },
  blurb: { en: g.blurb },
  questions: questionsByGroup.get(g.id) ?? [],
}));

export type FaqQuestionResolved = FaqQuestion & { group: string };

/** Flat list of every question (answer merged in), for search / indexing. */
export const FAQ_QUESTIONS: FaqQuestionResolved[] = FAQ.flatMap((g) =>
  g.questions.map((q) => ({ ...q, group: g.id })),
);

/** Lookup a single resolved question by id. */
export const FAQ_BY_ID: Record<string, FaqQuestionResolved> = Object.fromEntries(
  FAQ_QUESTIONS.map((q) => [q.id, q]),
);

/** Only the answered questions — these get their own `/faq/<id>/` page. */
export const FAQ_ANSWERED: FaqQuestionResolved[] = FAQ_QUESTIONS.filter((q) => q.answer);

/** Group id → its display title, for labels on the index and question pages. */
export const FAQ_GROUP_TITLE: Record<string, FaqGroup['title']> = Object.fromEntries(
  FAQ.map((g) => [g.id, g.title]),
);

/** Total question count — handy for a page header ("300+ questions"). */
export const FAQ_COUNT = FAQ_QUESTIONS.length;

/** How many have answers so far. */
export const FAQ_ANSWERED_COUNT = FAQ_ANSWERED.length;
