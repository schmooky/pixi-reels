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
  { slug: 'overview', section: 'Structure', eyebrow: 'Start here', title: 'Overview', subtitle: 'The main parts of pixi-reels and how they are wired together.' },
  { slug: 'builder', section: 'Structure', eyebrow: 'Construction', title: 'The builder', subtitle: 'What build() validates and constructs, in order.' },
  { slug: 'classes', section: 'Structure', eyebrow: 'Objects', title: 'Classes', subtitle: 'The ownership tree. Who owns what, who destroys what.' },
  { slug: 'viewport-and-masks', section: 'Structure', eyebrow: 'Scene graph', title: 'Viewport and masks', subtitle: 'The five layers under and above the mask, and the strategies that draw the mask.' },
  { slug: 'symbols', section: 'Structure', eyebrow: 'Cells', title: 'Symbols and pooling', subtitle: 'The ReelSymbol lifecycle, and how the registry, factory and pool supply symbols to a reel.' },
  // Motion
  { slug: 'motion', section: 'Motion', eyebrow: 'Physics', title: 'Motion', subtitle: 'How a column of symbols scrolls, wraps and stops exactly on the grid.' },
  { slug: 'frame-pipeline', section: 'Motion', eyebrow: 'Identity', title: 'The frame pipeline', subtitle: 'How a result grid becomes the symbols that land, wrap by wrap.' },
  { slug: 'curvature', section: 'Motion', eyebrow: 'Drum', title: 'Curvature', subtitle: 'How a flat strip is projected onto a drum, in two modes.' },
  // A spin
  { slug: 'spin-lifecycle', section: 'A spin', eyebrow: 'Lifecycle', title: 'Spin lifecycle', subtitle: 'What happens to one reel between spin() and its landing, phase by phase.' },
  { slug: 'timeline', section: 'A spin', eyebrow: 'Milliseconds', title: 'A spin in milliseconds', subtitle: 'One ordinary spin, replayed with a stopwatch, from the button press to spin:complete.' },
  { slug: 'skipping', section: 'A spin', eyebrow: 'Presses', title: 'Skipping', subtitle: 'What a press does to reels that are still spinning, and how tease protection and reel groups limit it.' },
  { slug: 'anticipation', section: 'A spin', eyebrow: 'Tension', title: 'Anticipation', subtitle: 'How a teasing reel slows, holds and creeps onto its symbols before it lands.' },
  { slug: 'speed-profiles', section: 'A spin', eyebrow: 'Timing', title: 'Speed profiles', subtitle: "The object that holds a spin's timing, such as stagger, speed and bounce, and how to tune it." },
  { slug: 'events', section: 'A spin', eyebrow: 'Flow', title: 'Events', subtitle: 'What fires when, in what order, on which bus.' },
  // Mechanics
  { slug: 'cascade', section: 'Mechanics', eyebrow: 'Algorithm', title: 'Cascade physics', subtitle: 'Why survivors without holes below them never move.' },
  { slug: 'pins-and-boards', section: 'Mechanics', eyebrow: 'Boards', title: 'Pins, boards, Hold & Win', subtitle: 'Cell pins across spins, the BoardGrid, the Hold & Win state machine.' },
  // Tooling
  { slug: 'debug', section: 'Tooling', eyebrow: 'Instruments', title: 'Debug tooling', subtitle: 'JSON snapshots for agents, the canvas overlay drawn with pixi-silk, and SpinMetrics timings.' },
  { slug: 'testing', section: 'Tooling', eyebrow: 'Harness', title: 'Testing model', subtitle: 'Why a full spin runs in Node with no renderer.' },
];

export const ARCH_SECTIONS = ['Structure', 'Motion', 'A spin', 'Mechanics', 'Tooling'] as const;
