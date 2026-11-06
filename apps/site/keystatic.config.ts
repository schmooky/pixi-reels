import { config, fields, collection } from '@keystatic/core';
import { block, wrapper } from '@keystatic/core/content-components';

// ── Topic groups: kept in sync with TOPIC_GROUPS in src/content/topics.ts.
// These are the section buckets the /mechanics/ index renders cards under.
const TOPIC_GROUP_OPTIONS = [
  { label: 'Start here', value: 'starters' },
  { label: 'Features', value: 'features' },
  { label: 'After the land', value: 'after-land' },
  { label: 'Board shape', value: 'board' },
  { label: 'Timing and control', value: 'timing' },
  { label: 'Drawing', value: 'drawing' },
] as const;

// ── Rich-text body shared by topics, demos, guides and docs. The embeds below
// are the ONLY non-prose constructs allowed in a body — every executable demo
// and image goes through one of them, so the markdown round-trips losslessly
// through the editor (no raw imports / JSX to drop). The page that renders a
// body supplies the matching components (src/pages/mechanics/[slug].astro).
function richBody(label: string) {
  return fields.mdx({
    label,
    components: {
      ConceptPart: wrapper({
        label: 'Concept part',
        description: 'One merged guide inside a topic\'s Concept section: its title and lede above the prose.',
        schema: {
          title: fields.text({ label: 'Title' }),
          id: fields.text({ label: 'Anchor id', description: 'Optional. concept-<old guide slug> on a topic with several parts.' }),
          lede: fields.text({ label: 'Lede', multiline: true }),
        },
      }),
      RecipeDemo: block({
        label: 'Recipe demo',
        description: 'Live PixiJS demo, compiled from a src/recipes/<code>.recipe.ts module.',
        schema: {
          code: fields.text({
            label: 'Recipe code module',
            description: 'Basename of the .recipe.ts file (e.g. tumble-classic). Blank on a recipe page = its own slug.',
          }),
          height: fields.integer({
            label: 'Canvas height (px)',
            description: 'Optional. Defaults to 300.',
          }),
        },
        ContentView: (props) => `▶ Recipe demo: ${props.value.code || '(this recipe)'}`,
      }),
      Image: block({
        label: 'Image',
        description: 'A figure pulled from public/. Same as the old RecipeImage embed.',
        schema: {
          src: fields.text({ label: 'Source path', description: 'e.g. /recipes/<slug>/diagram.png' }),
          alt: fields.text({ label: 'Alt text' }),
          caption: fields.text({ label: 'Caption' }),
        },
        ContentView: (props) => `[image] ${props.value.src}`,
      }),
    },
  });
}

export default config({
  storage: { kind: 'local' },
  ui: {
    brand: { name: 'pixi-reels docs' },
    navigation: {
      Content: ['topics', 'recipes', 'guides', 'docs'],
      FAQ: ['faq', 'faqGroups'],
    },
  },
  collections: {
    // One mechanic = one /mechanics/<slug>/ page, built from two entries that
    // share a slug: the topic (frontmatter + Concept prose) and the demos body.
    topics: collection({
      label: 'Topics',
      path: 'src/content/topics/*',
      slugField: 'title',
      format: { contentField: 'content' },
      columns: ['title', 'group'],
      entryLayout: 'content',
      schema: {
        title: fields.slug({
          name: { label: 'Title' },
          // slug is the filename; it's the canonical topic slug used by routes,
          // card media (public/recipes/<slug>/) and the demos entry.
        }),
        group: fields.select({
          label: 'Group',
          options: TOPIC_GROUP_OPTIONS,
          defaultValue: 'mechanics',
        }),
        oneLiner: fields.text({
          label: 'One-liner',
          multiline: true,
          description: 'Card text on the /mechanics/ index and the lede under the page title.',
        }),
        order: fields.integer({
          label: 'Order within group',
          description: 'Lower sorts first on the /mechanics/ index. Ties fall back to slug.',
          defaultValue: 0,
        }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (p) => p.value,
        }),
        guides: fields.array(fields.text({ label: 'Guide slug' }), {
          label: 'Merged guides',
          description: 'Old /guides/<slug>/ pages whose prose now lives in this Concept; their URLs redirect here.',
          itemLabel: (p) => p.value,
        }),
        image: fields.text({
          label: 'Card image override',
          description: 'Optional. By default the card auto-resolves public/recipes/<slug>/card.*',
        }),
        content: richBody('Concept'),
      },
    }),

    recipes: collection({
      label: 'Demos',
      path: 'src/content/recipes/*',
      slugField: 'title',
      format: { contentField: 'content' },
      columns: ['title'],
      entryLayout: 'content',
      schema: {
        title: fields.slug({
          name: { label: 'Title' },
          // slug is the filename and must match a topic's; the topic page
          // renders this body as its Demos section.
        }),
        content: richBody('Demos'),
      },
    }),

    guides: collection({
      label: 'Guides',
      path: 'src/content/guides/*',
      slugField: 'title',
      format: { contentField: 'content' },
      columns: ['title', 'order'],
      entryLayout: 'content',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        eyebrow: fields.text({ label: 'Eyebrow', description: 'Small label above the title.' }),
        description: fields.text({ label: 'Description', multiline: true }),
        order: fields.integer({ label: 'Order', defaultValue: 0 }),
        content: richBody('Body'),
      },
    }),

    docs: collection({
      label: 'Docs',
      path: 'src/content/docs/*',
      slugField: 'title',
      format: { contentField: 'content' },
      columns: ['title', 'order'],
      entryLayout: 'content',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        eyebrow: fields.text({ label: 'Eyebrow' }),
        description: fields.text({ label: 'Description', multiline: true }),
        order: fields.integer({ label: 'Order', defaultValue: 0 }),
        content: richBody('Body'),
      },
    }),

    faq: collection({
      label: 'FAQ questions',
      path: 'src/content/faq/*',
      slugField: 'id',
      columns: ['id', 'question'],
      schema: {
        id: fields.slug({
          name: { label: 'ID', description: 'Stable id, e.g. basics-001. Sorts questions within a group.' },
        }),
        group: fields.relationship({
          label: 'Group',
          collection: 'faqGroups',
          description: 'Which FAQ section this question belongs to.',
        }),
        topic: fields.relationship({
          label: 'Topic',
          collection: 'topics',
          description: 'The mechanic whose page lists this question. Blank = General on the FAQ index.',
        }),
        question: fields.text({ label: 'Question', multiline: true }),
        answer: fields.text({
          label: 'Answer',
          multiline: true,
          description: 'Leave blank for an open question (listed + searchable, no dedicated page). Backtick spans render as inline code; blank lines split paragraphs.',
        }),
        recipe: fields.text({ label: 'Best-demo recipe slug' }),
        links: fields.array(
          fields.object({
            label: fields.text({ label: 'Label' }),
            href: fields.text({ label: 'Href' }),
          }),
          { label: 'Further-reading links', itemLabel: (p) => p.fields.label.value },
        ),
      },
    }),

    faqGroups: collection({
      label: 'FAQ groups',
      path: 'src/content/faq-groups/*',
      slugField: 'id',
      columns: ['id', 'title'],
      schema: {
        id: fields.slug({ name: { label: 'ID', description: 'Group prefix, e.g. basics, symbols, spin.' } }),
        title: fields.text({ label: 'Title' }),
        blurb: fields.text({ label: 'Blurb', multiline: true }),
        order: fields.integer({ label: 'Order', defaultValue: 0 }),
      },
    }),
  },
});
