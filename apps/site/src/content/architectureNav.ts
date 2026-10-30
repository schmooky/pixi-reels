export interface ArchPage {
  slug: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  /** Section the page belongs to on the index and in the sidebar. */
  section: 'Structure' | 'Motion' | 'A spin' | 'Mechanics' | 'Tooling';
}

/**
 * Every architecture page, in reading order. The index page, the docs index,
 * the sidebar and the prev/next footer all read this list, so adding a page
 * here is the whole registration.
 */
export const ARCH_PAGES: ArchPage[] = [
  // Structure
  { slug: 'overview', section: 'Structure', eyebrow: 'Start here', title: 'Overview', subtitle: 'Every moving piece of pixi-reels on one page, and how they are wired.' },
  { slug: 'builder', section: 'Structure', eyebrow: 'Construction', title: 'The builder', subtitle: 'What build() validates and constructs, in order.' },
  { slug: 'classes', section: 'Structure', eyebrow: 'Objects', title: 'Classes', subtitle: 'The ownership tree. Who owns what, who destroys what.' },
  { slug: 'viewport-and-masks', section: 'Structure', eyebrow: 'Scene graph', title: 'Viewport and masks', subtitle: 'The five layers under and above the mask, and every mask strategy.' },
  { slug: 'symbols', section: 'Structure', eyebrow: 'Cells', title: 'Symbols and pooling', subtitle: 'The ReelSymbol lifecycle, the registry, the factory, the pool.' },
  // Motion
  { slug: 'motion', section: 'Motion', eyebrow: 'Physics', title: 'Motion', subtitle: 'How a column of symbols scrolls, wraps and stops exactly on the grid, every time.' },
  { slug: 'frame-pipeline', section: 'Motion', eyebrow: 'Identity', title: 'The frame pipeline', subtitle: 'How a result grid becomes the symbols that land, wrap by wrap.' },
  { slug: 'curvature', section: 'Motion', eyebrow: 'Drum', title: 'Curvature', subtitle: 'How a flat strip is projected onto a drum, in two modes.' },
  // A spin
  { slug: 'spin-lifecycle', section: 'A spin', eyebrow: 'Lifecycle', title: 'Spin lifecycle', subtitle: 'What happens to one reel between spin() and its landing, phase by phase.' },
  { slug: 'timeline', section: 'A spin', eyebrow: 'Milliseconds', title: 'A spin in milliseconds', subtitle: 'One ordinary spin, replayed with a stopwatch, from the button press to spin:complete.' },
  { slug: 'skipping', section: 'A spin', eyebrow: 'Presses', title: 'Skipping', subtitle: 'What a button press does to reels that are still spinning: slam, quicken, protection and groups.' },
  { slug: 'anticipation', section: 'A spin', eyebrow: 'Tension', title: 'Anticipation', subtitle: 'The hesitation before a big reveal: how a reel slows, holds and creeps onto its symbols.' },
  { slug: 'speed-profiles', section: 'A spin', eyebrow: 'Timing', title: 'Speed profiles', subtitle: 'The one object that holds every number a spin feels: stagger, speed, hold, bounce, and how to tune them.' },
  { slug: 'events', section: 'A spin', eyebrow: 'Flow', title: 'Events', subtitle: 'What fires when, in what order, on which bus.' },
  // Mechanics
  { slug: 'cascade', section: 'Mechanics', eyebrow: 'Algorithm', title: 'Cascade physics', subtitle: 'Why survivors without holes below them never move.' },
  { slug: 'pins-and-boards', section: 'Mechanics', eyebrow: 'Boards', title: 'Pins, boards, Hold & Win', subtitle: 'Cell pins across spins, the BoardGrid, the Hold & Win state machine.' },
  // Tooling
  { slug: 'debug', section: 'Tooling', eyebrow: 'Instruments', title: 'Debug tooling', subtitle: 'Snapshots for agents, the silk overlay, SpinMetrics, notices.' },
  { slug: 'testing', section: 'Tooling', eyebrow: 'Harness', title: 'Testing model', subtitle: 'Why a full spin runs in Node with no renderer.' },
];

export const ARCH_SECTIONS = ['Structure', 'Motion', 'A spin', 'Mechanics', 'Tooling'] as const;
