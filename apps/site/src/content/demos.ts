export interface DemoMeta {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  tags: string[];
  cheatHighlights: string[];
}

export const DEMOS: DemoMeta[] = [
  {
    slug: 'classic-lines',
    title: 'Classic line pays',
    subtitle: '5×3 · left-to-right lines',
    summary: 'The foundation every slot builds on. Forced wins, spotlight cycling.',
    tags: ['basics', 'spotlight'],
    cheatHighlights: ['Force winning line', 'Force full-grid jackpot'],
  },
  {
    slug: 'scatter-triggers-fs',
    title: 'Scatter triggers Free Spins',
    subtitle: '5×3 · 3+ scatters → FS',
    summary: 'Land three scatters anywhere, play a hit animation, enter bonus.',
    tags: ['scatter', 'free-spins'],
    cheatHighlights: ['Force 3 scatters', 'Force 4 scatters', 'Near-miss on reel 5'],
  },
  {
    slug: 'hold-and-win-respin',
    title: 'Hold & Win respin',
    subtitle: '5×3 · coins lock, respin until jackpot',
    summary: 'Coins lock in place, respin until the grid fills — or 3 coins on middle row.',
    tags: ['hold-and-win', 'respin'],
    cheatHighlights: ['Guaranteed landing', 'Middle-row progression', 'Force full jackpot'],
  },
  {
    slug: 'cascade-multiplier',
    title: 'Cascade + multiplier',
    subtitle: '6×5 · tumble × multiplier',
    summary: 'Wins disappear, new symbols fall in. Each cascade multiplies payouts.',
    tags: ['cascade', 'tumble'],
    cheatHighlights: ['Scripted 4-cascade sequence', 'Single tumble'],
  },
  {
    slug: 'sticky-wilds',
    title: 'Sticky wilds',
    subtitle: '5×3 · wilds persist for N spins',
    summary: 'A wild lands and stays for 3 spins. Stacks with more.',
    tags: ['wild', 'sticky'],
    cheatHighlights: ['Force wild on reel 3', 'Force 3 stickies on row 2'],
  },
  {
    slug: 'anticipation-slam',
    title: 'Anticipation + slam-stop',
    subtitle: '5×3 · tension + skip()',
    summary: 'Hold the last reel for tension, let the player slam-stop it.',
    tags: ['anticipation', 'skip'],
    cheatHighlights: ['Force anticipation on reels 4+5', 'Near-miss scatter'],
  },
  {
    slug: 'sprite-classic',
    title: 'Classic lines with sprite symbols',
    subtitle: '5×3 · TexturePacker atlas · blur-on-spin',
    summary: 'Real sprite art from a single atlas. Motion-blur textures swap in during SPIN, crisp on land.',
    tags: ['sprites', 'atlas', 'blur-on-spin'],
    cheatHighlights: ['Force royal line', 'Full-grid royal jackpot', 'Wild on reel 3 row 2'],
  },
];
