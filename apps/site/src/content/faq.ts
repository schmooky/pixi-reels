/**
 * FAQ knowledge base for pixi-reels — the source for the /faq/ route.
 *
 * Questions a slot developer actually asks the first time they open the
 * library — phrased the way real GDDs and game behaviours phrase them, not the
 * way the API names them. A question with an `answer` gets its own searchable
 * `/faq/<id>/` page; open ones stay listed on the index until answered.
 *
 * Ordering: groups run roughly beginner → advanced, and questions inside each
 * group run smallest → biggest. IDs are `<groupPrefix>-NNN` and stable.
 */

export interface FaqLink {
  label: string;
  href: string;
}

export interface FaqQuestion {
  id: string;
  en: string;
  /**
   * Answer text. Unset = open question (listed and searchable on the index,
   * but no dedicated page until answered). Adding an answer here mints the
   * question's own `/faq/<id>/` page automatically. Plain prose; `backtick`
   * spans render as inline code, blank lines split paragraphs.
   */
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

export const FAQ: FaqGroup[] = [
  {
    id: 'basics',
    title: { en: 'Getting started' },
    blurb: {
      en: 'Put a board on the screen and make it move.',
    },
    questions: [
      { id: 'basics-001', en: 'How do I create a reel set and show it on screen?' },
      { id: 'basics-002', en: 'How do I set how many reels (columns) the game has?' },
      { id: 'basics-003', en: 'How do I set how many rows are visible?' },
      { id: 'basics-004', en: 'How do I set the pixel size of a single symbol cell?' },
      { id: 'basics-005', en: 'How do I add a gap between reels and between rows?' },
      { id: 'basics-006', en: 'How do I put specific symbols on the board at startup?' },
      { id: 'basics-007', en: 'How do I register the list of symbol ids my game uses?' },
      { id: 'basics-008', en: 'How do I show a static board with no spinning at all?' },
      { id: 'basics-009', en: 'How do I attach the reel set to my existing PixiJS app?' },
      { id: 'basics-010', en: 'How do I center the reels inside the game canvas?' },
      { id: 'basics-011', en: 'How do I scale the whole board to fit different screen sizes?' },
      { id: 'basics-012', en: 'How do I change the symbols after the board is already built?' },
      { id: 'basics-013', en: 'How do I drive the reels from my own game loop / ticker?' },
      { id: 'basics-014', en: 'How do I clean up and destroy the reel set when leaving the screen?' },
    ],
  },
  {
    id: 'symbols',
    title: { en: 'Symbols' },
    blurb: {
      en: 'Define what lives in a cell and how it looks.',
    },
    questions: [
      { id: 'symbols-001', en: 'How do I add a brand-new symbol type to the game?' },
      { id: 'symbols-002', en: 'How do I make a symbol from a single texture/sprite?' },
      { id: 'symbols-003', en: 'How do I make a symbol from a sprite-sheet animation?' },
      { id: 'symbols-004', en: 'How do I make a symbol from a Spine skeleton?' },
      { id: 'symbols-005', en: 'How do I render nothing for an empty cell?' },
      { id: 'symbols-006', en: 'How do I set how often each symbol appears (weights)?' },
      { id: 'symbols-007', en: 'How do I make one symbol much rarer than the rest?' },
      { id: 'symbols-008', en: 'How do I anchor a symbol at the cell center vs the top-left?' },
      { id: 'symbols-009', en: 'How do I resize a symbol whenever the cell size changes?' },
      { id: 'symbols-010', en: 'How do I swap a symbol to a blurred texture while spinning?' },
      { id: 'symbols-011', en: 'How do I attach custom data (a value, a tier) to a symbol instance?' },
      { id: 'symbols-012', en: 'How do I read which symbol is currently shown in a given cell?' },
      { id: 'symbols-013', en: 'How do I let a symbol\'s art overflow its cell without clipping?' },
      { id: 'symbols-014', en: 'How do I give two different ids the same artwork?' },
      { id: 'symbols-015', en: 'How do I tint or recolor a symbol per spin (e.g. a charged state)?' },
    ],
  },
  {
    id: 'spin',
    title: { en: 'Spinning, speed & stopping' },
    blurb: {
      en: 'Start, stop, turbo, slam, and hold reels.',
    },
    questions: [
      { id: 'spin-001', en: 'How do I start a spin?' },
      { id: 'spin-002', en: 'How do I stop the reels on a result?' },
      { id: 'spin-003', en: 'How do I know when a spin has completely finished?' },
      { id: 'spin-004', en: 'How do I stagger reel starts so they begin one after another?' },
      { id: 'spin-005', en: 'How do I make the reels stop left to right?' },
      { id: 'spin-006', en: 'How do I add a turbo / fast-spin mode?' },
      { id: 'spin-007', en: 'How do I slam-stop the reels on a second button press?' },
      { id: 'spin-008', en: 'How do I boost only the current spin without changing the speed profile?' },
      { id: 'spin-009', en: 'How do I control the bounce/overshoot when a reel lands?' },
      { id: 'spin-010', en: 'How do I hold some reels still while the others spin?' },
      { id: 'spin-011', en: 'How do I respin just one reel?' },
      { id: 'spin-012', en: 'How do I abort a spin that is already in flight?' },
      { id: 'spin-013', en: 'How do I block a new spin until all animations finish?' },
      { id: 'spin-014', en: 'How do I add a timeout/watchdog if the server never sends a result?' },
      { id: 'spin-015', en: 'How do I keep the reels animating correctly on a hidden/background tab?' },
    ],
  },
  {
    id: 'result',
    title: { en: 'Results & forcing outcomes' },
    blurb: {
      en: 'Tell the reels exactly what to land on.',
    },
    questions: [
      { id: 'result-001', en: 'How do I tell the reels exactly what grid to land on?' },
      { id: 'result-002', en: 'How do I force a specific outcome for a demo or trailer?' },
      { id: 'result-003', en: 'How do I read the final visible grid after a spin?' },
      { id: 'result-004', en: 'How do I apply a result that came from my server?' },
      { id: 'result-005', en: 'How do I land a symbol just above the visible window (in the buffer)?' },
      { id: 'result-006', en: 'How do I land a tall symbol partially off-screen so only its edge shows?' },
      { id: 'result-007', en: 'How do I use a seeded RNG so a spin is exactly reproducible?' },
      { id: 'result-008', en: 'How do I guarantee at least one specific symbol lands this spin?' },
      { id: 'result-009', en: 'How do I land a different row count on each reel in one result?' },
      { id: 'result-010', en: 'How do I send a structured result that survives JSON / postMessage?' },
      { id: 'result-011', en: 'How do I keep the visual result separate from the payout math?' },
      { id: 'result-012', en: 'How do I replay the exact same spin again for a bug report?' },
    ],
  },
  {
    id: 'motion',
    title: { en: 'Reel motion & board shape' },
    blurb: {
      en: 'Drop-in, roll-up, fall delays, and growing boards.',
    },
    questions: [
      { id: 'motion-001', en: 'How do I make symbols drop in from above instead of scrolling?' },
      { id: 'motion-002', en: 'How do I make a reel land with a bounce?' },
      { id: 'motion-003', en: 'How do I stagger the fall of individual symbols into place?' },
      { id: 'motion-004', en: 'How do I make symbols rise up from below (roll-up)?' },
      { id: 'motion-005', en: 'How do I spin one reel up and another down (mixed directions)?' },
      { id: 'motion-006', en: 'How do I peek the next symbol from above before it lands?' },
      { id: 'motion-007', en: 'How do I nudge a reel by one position after it stopped?' },
      { id: 'motion-008', en: 'How do I add rows to a reel at runtime (the board grows)?' },
      { id: 'motion-009', en: 'How do I add a whole new reel mid-feature (Infinity-Reels style)?' },
      { id: 'motion-010', en: 'How do I make reels horizontal instead of vertical?' },
      { id: 'motion-011', en: 'How do I fit two half-symbols in one cell (split symbols)?' },
      { id: 'motion-012', en: 'How do I keep a tall block intact while everything else scrolls?' },
    ],
  },
  {
    id: 'antic',
    title: { en: 'Anticipation & near-miss' },
    blurb: {
      en: 'Build tension before the last reels land.',
    },
    questions: [
      { id: 'antic-001', en: 'How do I slow the last reel down when a big win is possible?' },
      { id: 'antic-002', en: 'How do I trigger anticipation only when 2 scatters are already in?' },
      { id: 'antic-003', en: 'How do I fake a near-miss with a scatter just above the line?' },
      { id: 'antic-004', en: 'How do I play a teaser sound/glow on the anticipating reel?' },
      { id: 'antic-005', en: 'How do I extend the spin time on specific reels for tension?' },
      { id: 'antic-006', en: 'How do I show an "almost" frame where the symbol overshoots then settles?' },
      { id: 'antic-007', en: 'How do I anticipate the final cell when one more coin means the grand?' },
      { id: 'antic-008', en: 'How do I chain anticipation across multiple reels (rolling tension)?' },
      { id: 'antic-009', en: 'How do I cancel anticipation cleanly if the tease misses?' },
      { id: 'antic-010', en: 'How do I make the anticipation reel speed up briefly before slowing?' },
    ],
  },
  {
    id: 'wins',
    title: { en: 'Win presentation' },
    blurb: {
      en: 'Lines, ways, clusters, highlights and big-win tiers.',
    },
    questions: [
      { id: 'wins-001', en: 'How do I highlight the winning symbols and dim the rest?' },
      { id: 'wins-002', en: 'How do I draw a payline across the winning cells?' },
      { id: 'wins-003', en: 'How do I play each symbol\'s own win animation?' },
      { id: 'wins-004', en: 'How do I show winning cells for a ways-to-win game (no lines)?' },
      { id: 'wins-005', en: 'How do I cycle through multiple winning lines one at a time?' },
      { id: 'wins-006', en: 'How do I draw connection lines between a connected cluster?' },
      { id: 'wins-007', en: 'How do I evaluate pays both ways (left-to-right and right-to-left)?' },
      { id: 'wins-008', en: 'How do I show a small/medium/big/mega win celebration by tier?' },
      { id: 'wins-009', en: 'How do I count the win amount up with a rolling number?' },
      { id: 'wins-010', en: 'How do I zoom and scale the board into a big-win banner?' },
      { id: 'wins-011', en: 'How do I skip the win presentation when the player taps?' },
      { id: 'wins-012', en: 'How do I keep the win highlight in sync with the win sound?' },
    ],
  },
  {
    id: 'cascade',
    title: { en: 'Cascades & tumbling' },
    blurb: {
      en: 'Remove winners, drop new symbols, repeat.',
    },
    questions: [
      { id: 'cascade-001', en: 'How do I remove the winning symbols and drop new ones in?' },
      { id: 'cascade-002', en: 'How do I run a tumble sequence until there are no more wins?' },
      { id: 'cascade-003', en: 'How do I play a destroy/pop animation on cleared symbols?' },
      { id: 'cascade-004', en: 'How do I make survivors fall down into the gaps?' },
      { id: 'cascade-005', en: 'How do I control the fall delay between columns?' },
      { id: 'cascade-006', en: 'How do I increment a multiplier on each cascade step?' },
      { id: 'cascade-007', en: 'How do I keep a cluster-pays board (8+ connected) tumbling?' },
      { id: 'cascade-008', en: 'How do I drop multiplier orbs that sum up at the end of the tumble?' },
      { id: 'cascade-009', en: 'How do I spin once and then cascade (spin-then-tumble)?' },
      { id: 'cascade-010', en: 'How do I let a special symbol survive the cascade and stick?' },
      { id: 'cascade-011', en: 'How do I show the win presenter between cascade steps?' },
      { id: 'cascade-012', en: 'How do I slam through all remaining cascades on a tap?' },
      { id: 'cascade-013', en: 'How do I order the refills (which column fills first)?' },
    ],
  },
  {
    id: 'wilds',
    title: { en: 'Wilds' },
    blurb: {
      en: 'Sticky, expanding, walking, multiplier, generated.',
    },
    questions: [
      { id: 'wilds-001', en: 'How do I make a wild stay stuck across the next spins?' },
      { id: 'wilds-002', en: 'How do I make a wild expand to fill its whole reel?' },
      { id: 'wilds-003', en: 'How do I make a wild walk one reel left each respin?' },
      { id: 'wilds-004', en: 'How do I put a multiplier number on a wild?' },
      { id: 'wilds-005', en: 'How do I randomly drop wilds onto the board before the spin?' },
      { id: 'wilds-006', en: 'How do I expand a single special symbol to a full reel in free spins (Book style)?' },
      { id: 'wilds-007', en: 'How do I keep a sticky wild for a fixed number of spins then drop it?' },
      { id: 'wilds-008', en: 'How do I stack multiplier wilds so their values multiply together?' },
      { id: 'wilds-009', en: 'How do I spawn a wild from a winning combo (chain-reaction wild)?' },
      { id: 'wilds-010', en: 'How do I make a walking wild leave a multiplier trail behind it?' },
      { id: 'wilds-011', en: 'How do I animate a wild crawling across reels along a path?' },
      { id: 'wilds-012', en: 'How do I turn a whole reel wild for the duration of a feature?' },
    ],
  },
  {
    id: 'pins',
    title: { en: 'Sticky cells & pins' },
    blurb: {
      en: 'Lock a cell to an id and keep it across spins.',
    },
    questions: [
      { id: 'pins-001', en: 'How do I lock a single cell to a symbol so it survives spins?' },
      { id: 'pins-002', en: 'How do I unlock a pinned cell again?' },
      { id: 'pins-003', en: 'How do I pin a cell for only N spins (a TTL)?' },
      { id: 'pins-004', en: 'How do I store a value/payload on a pinned cell?' },
      { id: 'pins-005', en: 'How do I read all currently pinned cells?' },
      { id: 'pins-006', en: 'How do I move a pin from one cell to another with animation?' },
      { id: 'pins-007', en: 'How do I keep a pin in place when the board reshapes (MultiWays)?' },
      { id: 'pins-008', en: 'How do I make a pin migrate back to its origin row when there is room?' },
      { id: 'pins-009', en: 'How do I override the spin result so pinned cells always win out?' },
      { id: 'pins-010', en: 'How do I animate a pin landing differently from a normal symbol?' },
    ],
  },
  {
    id: 'big',
    title: { en: 'Big / colossal symbols' },
    blurb: {
      en: 'One symbol that occupies an N×M block.',
    },
    questions: [
      { id: 'big-001', en: 'How do I place a 2×2 symbol on the board?' },
      { id: 'big-002', en: 'How do I make a 3×3 colossal symbol overlay the grid?' },
      { id: 'big-003', en: 'How do I make a 1×3 tall bar symbol?' },
      { id: 'big-004', en: 'How do I stop a big symbol from being placed by random fill?' },
      { id: 'big-005', en: 'How do I land a tall block with only its bottom cell visible?' },
      { id: 'big-006', en: 'How do I scale the big symbol\'s art to fill its whole block?' },
      { id: 'big-007', en: 'How do I hold a big symbol while the rest of the board respins?' },
      { id: 'big-008', en: 'How do I tumble a big symbol down through the cascade intact?' },
      { id: 'big-009', en: 'How do I split a big symbol into single symbols on a win?' },
      { id: 'big-010', en: 'How do I read the bounds of a big symbol block for an overlay?' },
      { id: 'big-011', en: 'How do I clip a big symbol that lands past the top or bottom edge?' },
    ],
  },
  {
    id: 'mways',
    title: { en: 'MultiWays & Megaways' },
    blurb: {
      en: 'Variable row counts per reel, per spin.',
    },
    questions: [
      { id: 'mways-001', en: 'How do I let each reel land a different number of rows?' },
      { id: 'mways-002', en: 'How do I set a min and max row count per reel?' },
      { id: 'mways-003', en: 'How do I compute and show the current ways count?' },
      { id: 'mways-004', en: 'How do I animate a reel growing from 2 to 7 rows mid-spin?' },
      { id: 'mways-005', en: 'How do I keep symbol size consistent as the row count changes?' },
      { id: 'mways-006', en: 'How do I run a cascade on a MultiWays board?' },
      { id: 'mways-007', en: 'How do I add a top horizontal reel (4-row extra strip)?' },
      { id: 'mways-008', en: 'How do I keep a pyramid (fixed jagged shape) instead of random rows?' },
      { id: 'mways-009', en: 'How do I anticipate on a tall reel that is about to grow?' },
      { id: 'mways-010', en: 'How do I combine MultiWays with big symbols safely?' },
    ],
  },
  {
    id: 'hw',
    title: { en: 'Hold & Win' },
    blurb: {
      en: 'Lock-and-respin: the coin mechanic everyone ships.',
    },
    questions: [
      { id: 'hw-001', en: 'How do I build a Hold & Win board where each cell spins on its own?' },
      { id: 'hw-002', en: 'How do I lock a coin in place when it lands?' },
      { id: 'hw-003', en: 'How do I respin only the empty cells?' },
      { id: 'hw-004', en: 'How do I reset the respin counter to 3 on every new coin?' },
      { id: 'hw-005', en: 'How do I decrement the respin counter on a dry spin?' },
      { id: 'hw-006', en: 'How do I end the feature when the board is full (grand jackpot)?' },
      { id: 'hw-007', en: 'How do I carry the triggering coins into the feature already locked?' },
      { id: 'hw-008', en: 'How do I show the held count and respins left in a HUD?' },
      { id: 'hw-009', en: 'How do I make most spins land blank so coins flash by rarely?' },
      { id: 'hw-010', en: 'How do I drive the whole feature from server-decided hits per round?' },
      { id: 'hw-011', en: 'How do I do a column-respin variant (hold whole columns)?' },
      { id: 'hw-012', en: 'How do I switch from base game into the Hold & Win board cleanly?' },
      { id: 'hw-013', en: 'How do I play a slick reset back to the opening state after the feature?' },
      { id: 'hw-014', en: 'How do I gate the next respin until all land animations have settled?' },
      { id: 'hw-015', en: 'How do I award a mini jackpot when a whole row of coins fills?' },
      { id: 'hw-016', en: 'How do I grow the board by a row when a trigger condition is met mid-feature?' },
      { id: 'hw-017', en: 'How do I make a special coin upgrade all adjacent coins when it lands?' },
      { id: 'hw-018', en: 'How do I persist the locked board if the player reloads mid-feature?' },
      { id: 'hw-019', en: 'How do I run several Hold & Win boards at different bet tiers from one builder?' },
    ],
  },
  {
    id: 'coins',
    title: { en: 'Coins, values, collectors & jackpots' },
    blurb: {
      en: 'Money coins, mystery reveals, collectors, tiers.',
    },
    questions: [
      { id: 'coins-001', en: 'How do I print a money value on a coin?' },
      { id: 'coins-002', en: 'How do I format the value as 0.00 with a bitmap gold font?' },
      { id: 'coins-003', en: 'How do I scale the number to fit the coin face?' },
      { id: 'coins-004', en: 'How do I attach the value as data without baking it into the id?' },
      { id: 'coins-005', en: 'My coin is a mystery — how do I spin values inside it to reveal the number it held?' },
      { id: 'coins-006', en: 'How do I land a coin wearing a MINI/MAJOR word and reveal it into a money face?' },
      { id: 'coins-007', en: 'How do I show MINI/MINOR/MAJOR/GRAND jackpot plaques above the reels?' },
      { id: 'coins-008', en: 'How do I flash the matching jackpot plaque when its coin locks?' },
      { id: 'coins-009', en: 'How do I sum every coin value at the end and count it up?' },
      { id: 'coins-010', en: 'How do I make a collector coin pull every other coin\'s value into itself?' },
      { id: 'coins-011', en: 'How do I fly a value clone from each coin into the collector over an arc?' },
      { id: 'coins-012', en: 'How do I tick the collector total up as each value lands on it?' },
      { id: 'coins-013', en: 'How do I make a payer coin add its value to every other coin?' },
      { id: 'coins-014', en: 'How do I make a coin double or boost every value already on the board?' },
      { id: 'coins-015', en: 'How do I make a row/column of cells all act as collectors that sweep the board?' },
      { id: 'coins-016', en: 'How do I upgrade a coin\'s value tier in place (5 → 10 → 25)?' },
      { id: 'coins-017', en: 'How do I send collected coins flying to a feature meter above the reels?' },
      { id: 'coins-018', en: 'How do I send a golden trail to the meter instead of a flying coin?' },
      { id: 'coins-019', en: 'How do I show a coin counting up its own value before locking?' },
      { id: 'coins-020', en: 'How do I make a blank coin reveal a random value with a spinning reel inside it?' },
      { id: 'coins-021', en: 'How do I order the collect flights by row, by column, or all at once?' },
      { id: 'coins-022', en: 'How do I curve the collect flight toward the screen edge or center?' },
      { id: 'coins-023', en: 'How do I aim collect flights at a specific feature meter with a custom path?' },
    ],
  },
  {
    id: 'anim',
    title: { en: 'Symbol animations' },
    blurb: {
      en: 'Win, land, destroy, transform, idle, react.',
    },
    questions: [
      { id: 'anim-001', en: 'How do I play a win animation on a single symbol?' },
      { id: 'anim-002', en: 'How do I play an idle/breathing loop while a symbol sits?' },
      { id: 'anim-003', en: 'How do I play a landing animation when a symbol settles?' },
      { id: 'anim-004', en: 'A symbol gets destroyed by an object — how do I play its destroy animation?' },
      { id: 'anim-005', en: 'How do I morph one symbol into a different (higher) one mid-round?' },
      { id: 'anim-006', en: 'How do I reveal a mystery symbol into a matching symbol across the board?' },
      { id: 'anim-007', en: 'How do I freeze a Spine animation on its final frame and hold it?' },
      { id: 'anim-008', en: 'How do I play an arbitrary named Spine animation on a symbol?' },
      { id: 'anim-009', en: 'How do I await a one-shot animation and continue when it finishes?' },
      { id: 'anim-010', en: 'How do I play a different destroy animation per symbol art (shatter vs disintegrate)?' },
      { id: 'anim-011', en: 'How do I abort a destroy animation mid-tween when the player slams?' },
      { id: 'anim-012', en: 'How do I make a symbol react to a neighbour (e.g. shake when hit)?' },
      { id: 'anim-013', en: 'How do I charge a symbol up over several wins before it activates?' },
      { id: 'anim-014', en: 'How do I keep GSAP tweens in sync with the Pixi ticker?' },
    ],
  },
  {
    id: 'chars',
    title: { en: 'Characters & objects over the reels' },
    blurb: {
      en: 'A creature above the reels that collects, throws, walks, reacts.',
    },
    questions: [
      { id: 'chars-001', en: 'How do I place a character above the reels that stays put?' },
      { id: 'chars-002', en: 'How do I throw a coin symbol at a character (a pig) above the reels?' },
      { id: 'chars-003', en: 'How do I make the character react (chomp, bounce) when a coin hits it?' },
      { id: 'chars-004', en: 'How do I make a fisherman collect every money-fish on the board?' },
      { id: 'chars-005', en: 'How do I fly each collected symbol\'s value into the character\'s pouch and total it?' },
      { id: 'chars-006', en: 'How do I walk a character across the reels stopping on each cell?' },
      { id: 'chars-007', en: 'How do I make a hammer/object smash specific cells and clear them?' },
      { id: 'chars-008', en: 'How do I have a special symbol shoot/affect another cell (sniper style)?' },
      { id: 'chars-009', en: 'How do I make persistent feature symbols interact across the board (Money-Train style)?' },
      { id: 'chars-010', en: 'How do I aim a flight at a moving target (the character animates while a coin flies)?' },
      { id: 'chars-011', en: 'How do I sequence many throws so they arrive one after another?' },
      { id: 'chars-012', en: 'How do I have the character grow/level up as it eats more coins?' },
    ],
  },
  {
    id: 'triggers',
    title: { en: 'Scatters & bonus triggers' },
    blurb: {
      en: 'Detect the trigger and enter the feature.',
    },
    questions: [
      { id: 'triggers-001', en: 'How do I make a scatter pay regardless of its position?' },
      { id: 'triggers-002', en: 'How do I count how many scatters are anywhere on the board?' },
      { id: 'triggers-003', en: 'How do I require 6+ coins to trigger Hold & Win?' },
      { id: 'triggers-004', en: 'How do I make a symbol that is both a coin and a bonus trigger?' },
      { id: 'triggers-005', en: 'How do I show a partial-trigger teaser (5 in, need 6)?' },
      { id: 'triggers-006', en: 'How do I show the scatters collecting into a trigger counter?' },
      { id: 'triggers-007', en: 'How do I play a "bonus triggered" celebration before the mode swap?' },
      { id: 'triggers-008', en: 'How do I award scatter pays and trigger free spins from the same scatters?' },
      { id: 'triggers-009', en: 'How do I trigger different bonuses from different scatter sets?' },
      { id: 'triggers-010', en: 'How do I scale the number of free spins by the scatter count?' },
    ],
  },
  {
    id: 'fs',
    title: { en: 'Free spins & feature modes' },
    blurb: {
      en: 'Trigger, count, retrigger, swap modes, persist state.',
    },
    questions: [
      { id: 'fs-001', en: 'How do I trigger free spins from 3 scatters?' },
      { id: 'fs-002', en: 'How do I swap to a different reel set / background for the feature?' },
      { id: 'fs-003', en: 'How do I count down the remaining free spins?' },
      { id: 'fs-004', en: 'How do I retrigger and add more free spins mid-feature?' },
      { id: 'fs-005', en: 'How do I keep sticky wilds/multipliers persistent across all free spins?' },
      { id: 'fs-006', en: 'How do I pick a single expanding symbol at the start of the feature?' },
      { id: 'fs-007', en: 'How do I run a different weight table during the feature?' },
      { id: 'fs-008', en: 'How do I show a "feature complete, you won X" summary screen?' },
      { id: 'fs-009', en: 'How do I carry a running multiplier meter through the whole feature?' },
      { id: 'fs-010', en: 'How do I return to base game and restore the pre-feature state?' },
      { id: 'fs-011', en: 'How do I offer a buy-feature entry straight into the bonus?' },
      { id: 'fs-012', en: 'How do I gamble/upgrade the number of free spins before they start?' },
    ],
  },
  {
    id: 'bonusgames',
    title: { en: 'Bonus mini-games' },
    blurb: {
      en: 'Wheels, picks, ladders and gamble.',
    },
    questions: [
      { id: 'bonusgames-001', en: 'How do I run a pick-a-prize bonus on clickable cells?' },
      { id: 'bonusgames-002', en: 'How do I reveal hidden prizes one tap at a time?' },
      { id: 'bonusgames-003', en: 'How do I spin a bonus wheel and land it on a segment?' },
      { id: 'bonusgames-004', en: 'How do I settle the wheel pointer with a believable bounce?' },
      { id: 'bonusgames-005', en: 'How do I offer a gamble / double-up on a win?' },
      { id: 'bonusgames-006', en: 'How do I climb a prize ladder with collect-or-gamble choices?' },
      { id: 'bonusgames-007', en: 'How do I run a "pick until you hit 3 of a kind" collection bonus?' },
      { id: 'bonusgames-008', en: 'How do I award a random multiplier from a chest or orb?' },
      { id: 'bonusgames-009', en: 'How do I run a trail / board-game bonus that hops across cells?' },
      { id: 'bonusgames-010', en: 'How do I tally "you collected X" at the end of the pick?' },
    ],
  },
  {
    id: 'meters',
    title: { en: 'Meters, multipliers & progression' },
    blurb: {
      en: 'Accumulators, level-ups, progressive jackpots.',
    },
    questions: [
      { id: 'meters-001', en: 'How do I show a multiplier meter above the reels?' },
      { id: 'meters-002', en: 'How do I increment the meter on each win and reset on a miss?' },
      { id: 'meters-003', en: 'How do I level up a jar/symbol multiplier each time it wins?' },
      { id: 'meters-004', en: 'How do I fill a progress bar that unlocks a feature at 100%?' },
      { id: 'meters-005', en: 'How do I animate a value flying into the meter and bumping it up?' },
      { id: 'meters-006', en: 'How do I drive a progressive jackpot value that ticks up live?' },
      { id: 'meters-007', en: 'How do I show a coin-collect counter that aggregates bonus coins?' },
      { id: 'meters-008', en: 'How do I apply the meter\'s multiplier to the final win?' },
      { id: 'meters-009', en: 'How do I keep the meter and its server value from drifting apart?' },
      { id: 'meters-010', en: 'How do I sticky-stack position-locked multipliers that persist?' },
    ],
  },
  {
    id: 'audio',
    title: { en: 'Sound & juice' },
    blurb: {
      en: 'Hook sound and haptics to game events.',
    },
    questions: [
      { id: 'audio-001', en: 'How do I play a sound when a reel stops?' },
      { id: 'audio-002', en: 'How do I play a per-coin sound as each one lands in stagger order?' },
      { id: 'audio-003', en: 'How do I rise the anticipation music as tension builds?' },
      { id: 'audio-004', en: 'How do I duck the music during a big-win count-up?' },
      { id: 'audio-005', en: 'How do I pitch the count-up sound higher the longer it runs?' },
      { id: 'audio-006', en: 'How do I layer base vs feature music and crossfade between them?' },
      { id: 'audio-007', en: 'How do I fire haptics/vibration on a jackpot hit?' },
      { id: 'audio-008', en: 'How do I sync a sound exactly to a Spine animation event?' },
      { id: 'audio-009', en: 'How do I cut all feature sounds cleanly when the player exits?' },
      { id: 'audio-010', en: 'How do I keep audio aligned when the player slams the reels?' },
    ],
  },
  {
    id: 'ui',
    title: { en: 'HUD, buttons & overlays' },
    blurb: {
      en: 'Spin button, bet, autoplay, counters, tooltips.',
    },
    questions: [
      { id: 'ui-001', en: 'How do I wire a single spin button that also slam-stops?' },
      { id: 'ui-002', en: 'How do I disable the spin button while a spin is running?' },
      { id: 'ui-003', en: 'How do I show the current bet and balance?' },
      { id: 'ui-004', en: 'How do I run autoplay for N spins with a stop condition?' },
      { id: 'ui-005', en: 'How do I overlay a HUD that reads purely from board events?' },
      { id: 'ui-006', en: 'How do I draw a value label centered on a specific cell?' },
      { id: 'ui-007', en: 'How do I position an overlay using a cell\'s exact pixel bounds?' },
      { id: 'ui-008', en: 'How do I add clickable hit-areas per cell (pick-a-cell bonus)?' },
      { id: 'ui-009', en: 'How do I keep HUD text crisp at any board scale?' },
      { id: 'ui-010', en: 'How do I show a "respins left" badge that updates live?' },
      { id: 'ui-011', en: 'How do I render the board on a dark feature background vs a light base?' },
    ],
  },
  {
    id: 'bet',
    title: { en: 'Bet, lines & paytable' },
    blurb: {
      en: 'Lines vs ways, bet levels, the paytable screen.',
    },
    questions: [
      { id: 'bet-001', en: 'How do I switch a game between paylines and ways-to-win?' },
      { id: 'bet-002', en: 'How do I let the player change the bet level?' },
      { id: 'bet-003', en: 'How do I scale coin values by the current bet?' },
      { id: 'bet-004', en: 'How do I show a paytable screen for the registered symbols?' },
      { id: 'bet-005', en: 'How do I draw and highlight which lines are active?' },
      { id: 'bet-006', en: 'How do I recompute the ways count when the board shape changes?' },
      { id: 'bet-007', en: 'How do I price the buy-feature off the current bet?' },
      { id: 'bet-008', en: 'How do I lock the bet during a feature?' },
    ],
  },
  {
    id: 'layout',
    title: { en: 'Layout, orientation & transitions' },
    blurb: {
      en: 'Responsive boards, portrait/landscape, intros and wipes.',
    },
    questions: [
      { id: 'layout-001', en: 'How do I lay the board out for portrait vs landscape?' },
      { id: 'layout-002', en: 'How do I scale the board to fit a fixed safe-area?' },
      { id: 'layout-003', en: 'How do I reflow the HUD when the orientation changes?' },
      { id: 'layout-004', en: 'How do I keep the board centered with jackpot panels flanking it?' },
      { id: 'layout-005', en: 'How do I anchor a top feature meter relative to the reels?' },
      { id: 'layout-006', en: 'How do I play an intro that assembles the reels on load?' },
      { id: 'layout-007', en: 'How do I transition between base and feature with a wipe?' },
      { id: 'layout-008', en: 'How do I play an outro that breaks the board apart on exit?' },
      { id: 'layout-009', en: 'How do I support an ultrawide background behind a fixed board?' },
      { id: 'layout-010', en: 'How do I mirror the layout for RTL locales?' },
    ],
  },
  {
    id: 'perf',
    title: { en: 'Performance & lifecycle' },
    blurb: {
      en: 'Pooling, disposal, memory, big grids.',
    },
    questions: [
      { id: 'perf-001', en: 'How do I recycle symbols instead of recreating them every spin?' },
      { id: 'perf-002', en: 'How do I cap how many instances of a symbol are pooled?' },
      { id: 'perf-003', en: 'How do I dispose everything without leaking textures or tickers?' },
      { id: 'perf-004', en: 'How do I keep a 7×7 board with many masks from dropping frames?' },
      { id: 'perf-005', en: 'How do I share one mask across many cells?' },
      { id: 'perf-006', en: 'How do I avoid stutter on a long session of continuous spins?' },
      { id: 'perf-007', en: 'How do I tear down a feature\'s 20+ sub-reelsets safely?' },
      { id: 'perf-008', en: 'How do I keep tweens from leaking when a symbol is recycled mid-animation?' },
      { id: 'perf-009', en: 'How do I batch Spine instances so the GPU does not choke?' },
      { id: 'perf-010', en: 'How do I preload feature assets so the mode swap has no hitch?' },
    ],
  },
  {
    id: 'debug',
    title: { en: 'Debugging & testing' },
    blurb: {
      en: 'See the opaque canvas, make spins deterministic.',
    },
    questions: [
      { id: 'debug-001', en: 'How do I dump the current board state as readable JSON?' },
      { id: 'debug-002', en: 'How do I print an ASCII grid of the visible symbols?' },
      { id: 'debug-003', en: 'How do I log every domain event as it fires?' },
      { id: 'debug-004', en: 'How do I diagnose a stuck spin that never lands?' },
      { id: 'debug-005', en: 'How do I force a guaranteed jackpot for a screenshot?' },
      { id: 'debug-006', en: 'How do I make a deterministic spin in a unit test?' },
      { id: 'debug-007', en: 'How do I run the engine headless with no canvas for tests?' },
      { id: 'debug-008', en: 'How do I add a cheat panel (force a symbol, force a hit)?' },
      { id: 'debug-009', en: 'How do I record and replay a spin frame by frame?' },
      { id: 'debug-010', en: 'How do I assert the visible grid matches the expected result?' },
    ],
  },
  {
    id: 'integ',
    title: { en: 'Server, math & integration' },
    blurb: {
      en: 'Wire the engine to an RGS and recover state.',
    },
    questions: [
      { id: 'integ-001', en: 'How do I drive every spin from a server (RGS) response?' },
      { id: 'integ-002', en: 'How do I keep all payout math on the server and only present results?' },
      { id: 'integ-003', en: 'How do I show a spin while waiting for the server, then snap to its result?' },
      { id: 'integ-004', en: 'How do I recover an interrupted feature on reload (resume state)?' },
      { id: 'integ-005', en: 'How do I format currency values for different locales?' },
      { id: 'integ-006', en: 'How do I map a server symbol-id scheme onto my registered ids?' },
      { id: 'integ-007', en: 'How do I sequence multi-step server features (round → round → collect)?' },
      { id: 'integ-008', en: 'How do I keep visuals honest when the server is the only source of truth?' },
      { id: 'integ-009', en: 'How do I handle a desync between the animation and the server state?' },
      { id: 'integ-010', en: 'How do I satisfy regulatory replay (exact reproduction of any past spin)?' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Answers. The knowledge base fills in here. An entry mints the question's
// own `/faq/<id>/` page and adds it to the FAQ structured data. Unanswered
// questions stay listed + searchable on the index until someone answers them.
// Keep answers accurate to the current public API; link a recipe/guide when
// one shows the behaviour end to end.

const ANSWERS: Record<string, { en: string; links?: FaqLink[] }> = {
  'basics-001': {
    en: 'Use the fluent `ReelSetBuilder`: chain `.reels()`, `.visibleRows()`, `.symbolSize()`, register your symbols, then `.build()` returns a `ReelSet` (a PixiJS `Container`) that you add to the stage.',
    links: [
      { label: 'Guide: Your first reelset', href: '/guides/your-first-reelset/' },
      { label: 'Recipe: Classic 5×3', href: '/recipes/classic-5x3/' },
    ],
  },
  'basics-002': {
    en: 'Set the column count with `.reels(n)` on the builder before `.build()`.',
  },
  'basics-003': {
    en: 'Use `.visibleRows(n)` for a uniform row count, or `.visibleRowsPerReel([...])` when each reel shows a different number of rows.',
  },
  'basics-006': {
    en: 'Seed the opening grid with `.initialFrame(grid)` on the builder, passing one `ColumnTarget` per reel — e.g. `{ visible: [\'A\', \'B\', \'C\'] }`.',
  },
  'symbols-006': {
    en: 'Pass relative weights to `.weights({ id: n })`: a higher number lands more often. A weight of `0` means the symbol never comes from random fill, so it can only be placed by the server / `setResult`.',
  },
  'spin-001': {
    en: 'Call `await reelSet.spin()`. It starts every reel with a staggered delay and resolves with a `SpinResult` once all reels have landed.',
    links: [{ label: 'Guide: Spin lifecycle', href: '/guides/spin-lifecycle/' }],
  },
  'spin-002': {
    en: 'Once the server responds, call `reelSet.setResult(grid)` while the spin promise is still pending. The stop sequence consumes it and each reel lands on its target.',
  },
  'spin-007': {
    en: 'On the second tap call `reelSet.skipSpin()` to slam the reels to their landing — or `reelSet.requestSkip()` if the server result has not arrived yet, which queues the slam for the moment it does.',
    links: [{ label: 'Recipe: Slam-stop', href: '/recipes/slam-stop/' }],
  },
  'spin-010': {
    en: 'Pass `reelSet.spin({ holdReels: [0, 4] })`. Held reels skip START / SPIN / STOP entirely, do not move, and count as already-landed for the all-landed resolver.',
    links: [{ label: 'Recipe: Hold & Win respin', href: '/recipes/hold-and-win/' }],
  },
  'result-001': {
    en: 'Give `reelSet.setResult(grid)` an array of one `ColumnTarget` per reel: `{ visible: [\'A\',\'B\',\'C\'], bufferAbove?: [...], bufferBelow?: [...] }`. The visible array is the on-screen window; the buffers target cells just outside it.',
  },
  'cascade-001': {
    en: 'Build with `.tumble(...)`, then after fading the winners call `reelSet.refill(winners, nextGrid)` with the cleared cells and the new symbols. Survivors fall into the gaps and fresh symbols drop in from above.',
    links: [{ label: 'Recipe: Cascade 6×5', href: '/recipes/cascade-6x5/' }],
  },
  'anim-004': {
    en: 'Override `playDestroy(opts)` on your `ReelSymbol`. The default is a ~320 ms scale / spin / fade implode; for Spine, play a `disintegration` or shatter track. Honour `opts.signal` so a slam can abort it mid-tween.',
  },
  'hw-001': {
    en: 'A Hold & Win cell is its own 1×1 ReelSet — the engine\'s atomic spin unit is the reel, the mechanic\'s is the cell. `HoldAndWinBuilder` (in `examples/shared/`) builds the whole grid of independent cells plus the lock / respin choreography. Copy it into your game and drive it with `enter()` then `respin()` per round.',
    links: [
      { label: 'Recipe: Hold & Win respin', href: '/recipes/hold-and-win/' },
      { label: 'Recipe: Hold & Win — Spine coins', href: '/recipes/hold-and-win-spine/' },
    ],
  },
  'hw-002': {
    en: 'Stop spinning that cell and leave its symbol in place. With `HoldAndWinBuilder` a hit cell simply is not respun next round; the `coin:locked` event fires so you can play the lock animation and update the HUD.',
  },
  'coins-005': {
    en: 'Land the coin showing a mystery face, then on lock play the skeleton animation that spins digits and settles on the revealed amount (or tween a small value reel inside the coin). Drive it from the `coin:locked` event via `symbolAt(cell)` so the board itself stays value-agnostic.',
    links: [{ label: 'Recipe: Hold & Win — Spine coins', href: '/recipes/hold-and-win-spine/' }],
  },
  'coins-010': {
    en: 'The collector is just another server-placed id. When it locks, walk the locked coins and fly a clone of each value into the collector along a bezier arc (`bezierFly`), ticking the collector\'s total up on every arrival.',
    links: [{ label: 'Recipe: Hold & Win — collector', href: '/recipes/hold-and-win-collector/' }],
  },
  'chars-002': {
    en: 'Read the source cell center with `board.cellCenter(cell)` and the character\'s position, then tween a coin clone along a bezier arc with `bezierFly(from, to, { lean: \'up\' })`. Play the character\'s reaction on arrival. The flight is game-layer choreography; the board only hands out pixel geometry and events.',
    links: [{ label: 'Recipe: Hold & Win — collector', href: '/recipes/hold-and-win-collector/' }],
  },
};

// Attach answers + links onto their questions at module load.
for (const group of FAQ) {
  for (const q of group.questions) {
    const a = ANSWERS[q.id];
    if (!a) continue;
    q.answer = { en: a.en };
    if (a.links) q.links = a.links;
  }
}

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
