import { config, fields, collection } from '@keystatic/core';
import { block } from '@keystatic/core/content-components';

// ── Recipe groups: kept in sync with RECIPE_GROUPS in src/content/recipes.ts.
// These are the section buckets the /recipes/ index renders cards under.
const RECIPE_GROUP_OPTIONS = [
  { label: 'Building blocks (start here)', value: 'basics' },
  { label: 'Starter templates', value: 'starters' },
  { label: 'Per-reel geometry (pyramid)', value: 'pyramid' },
  { label: 'MultiWays', value: 'multiways' },
  { label: 'Big symbols (N×M blocks)', value: 'big-symbols' },
  { label: 'Wilds & sticky cells', value: 'wilds' },
  { label: 'Features, bonuses & transforms', value: 'features' },
  { label: 'Cascade & tumbling', value: 'cascade' },
  { label: 'Wins & paylines', value: 'wins' },
  { label: 'Anticipation, skip & respin', value: 'tension' },
  { label: 'Cell coordinates & hit areas', value: 'cell-coords' },
  { label: 'Symbol authoring', value: 'symbol-formats' },
  { label: 'Runtime & feature modes', value: 'runtime' },
] as const;

// ── Rich-text body shared by recipes, guides and docs. The two embeds below are
// the ONLY non-prose constructs allowed in a body — every executable demo and
// image goes through one of them, so the markdown round-trips losslessly through
// the editor (no raw imports / JSX to drop). The matching renderers live in
// src/components/keystatic/.
function richBody(label: string) {
  return fields.mdx({
    label,
    components: {
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
      Content: ['recipes', 'guides', 'docs'],
      FAQ: ['faq', 'faqGroups'],
    },
  },
  collections: {
    recipes: collection({
      label: 'Recipes',
      path: 'src/content/recipes/*',
      slugField: 'title',
      format: { contentField: 'content' },
      columns: ['title', 'group'],
      entryLayout: 'content',
      schema: {
        title: fields.slug({
          name: { label: 'Title' },
          // slug is the filename; it's the canonical recipe slug used by routes,
          // card media (public/recipes/<slug>/) and the demo code registry.
        }),
        group: fields.select({
          label: 'Group',
          options: RECIPE_GROUP_OPTIONS,
          defaultValue: 'features',
        }),
        oneLiner: fields.text({
          label: 'One-liner',
          multiline: true,
          description: 'Card text on the /recipes/ index.',
        }),
        description: fields.text({
          label: 'Description',
          multiline: true,
          description: 'Longer summary used in the page header + SEO. Defaults to the one-liner.',
        }),
        order: fields.integer({
          label: 'Order within group',
          description: 'Lower sorts first on the /recipes/ index. Ties fall back to slug.',
          defaultValue: 0,
        }),
        steps: fields.array(fields.text({ label: 'Step' }), {
          label: 'Steps',
          itemLabel: (p) => p.value,
        }),
        apis: fields.array(fields.text({ label: 'API' }), {
          label: 'Related APIs',
          itemLabel: (p) => p.value,
        }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (p) => p.value,
        }),
        image: fields.text({
          label: 'Card image override',
          description: 'Optional. By default the card auto-resolves public/recipes/<slug>/card.*',
        }),
        content: richBody('Body'),
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
