export interface ArchPage {
  slug: string;
  title: string;
  subtitle: string;
  eyebrow: string;
}

export const ARCH_PAGES: ArchPage[] = [
  {
    slug: 'overview',
    title: 'Overview',
    subtitle: 'The ten-thousand-foot view of every moving piece.',
    eyebrow: 'Start here',
  },
  {
    slug: 'classes',
    title: 'Classes',
    subtitle: 'The composition tree — what owns what.',
    eyebrow: 'Objects',
  },
  {
    slug: 'events',
    title: 'Events',
    subtitle: 'What fires when, and in what order.',
    eyebrow: 'Flow',
  },
  {
    slug: 'spin-lifecycle',
    title: 'Spin lifecycle',
    subtitle: 'One spin as a state machine.',
    eyebrow: 'Lifecycle',
  },
  {
    slug: 'cascade',
    title: 'Cascade physics',
    subtitle: 'Why survivors without winners below them don\'t move.',
    eyebrow: 'Algorithm',
  },
  {
    slug: 'testing',
    title: 'Testing model',
    subtitle: 'Why you can run a full spin in Node, no renderer.',
    eyebrow: 'Harness',
  },
];
