/**
 * All four travel combinations on one page: vertical/horizontal x
 * forward/reverse.
 *
 * The headline of 2.0.0 is that ONE engine runs every combination, and until
 * now the only way to see that was the docs site. This is the runnable proof,
 * and it is what `tests/e2e/orientation-matrix.spec.ts` drives in a real
 * browser: four sets spin and land together, and their debug snapshots are
 * asserted rather than eyeballed.
 *
 * Each set is deliberately the SAME board, only projected differently: 4
 * reels of 3 cells, non-square 96x64 cells so an axis transposition is
 * visible rather than hidden by a square.
 */
import { Application, Container, Text } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  driveGsapWithTicker,
  enableDebug,
  type Direction,
  type Orientation,
  type ReelSet,
} from 'pixi-reels';
import { loadPrototypeSymbols } from '../../../../../apps/site/src/runtime/prototypeSpriteLoader.js';
import { BlurSpriteSymbol } from '../../../../../apps/site/src/runtime/BlurSpriteSymbol.js';

const REELS = 4;
const CELLS = 3;
/** Non-square on purpose: a square cell hides a transposed axis. */
const CELL_W = 96;
const CELL_H = 64;
const GAP = 6;

const COMBOS: Array<{ orientation: Orientation; direction: Direction }> = [
  { orientation: 'vertical', direction: 'forward' },
  { orientation: 'vertical', direction: 'reverse' },
  { orientation: 'horizontal', direction: 'forward' },
  { orientation: 'horizontal', direction: 'reverse' },
];

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ background: 0x12121f, resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);
  driveGsapWithTicker(app.ticker, gsap);

  const { textures, blurTextures } = await loadPrototypeSymbols();
  // A handful of frames is plenty; the atlas ships 84 and this demo is about
  // the axis, not the art.
  const ids = [
    'royal/royal_1',
    'royal/royal_3',
    'round/round_2',
    'round/round_5',
    'square/square_4',
    'wild/wild_1',
  ].filter((id) => id in textures);

  const sets: ReelSet[] = [];
  const root = new Container();
  app.stage.addChild(root);

  for (const { orientation, direction } of COMBOS) {
    const vertical = orientation === 'vertical';
    const set = new ReelSetBuilder()
      .orientation(orientation)
      .direction(direction)
      .reels(REELS)
      .visibleCells(CELLS)
      // Screen-space stays screen-space: the horizontal pair is the vertical
      // one transposed, which is exactly ADR 018's isomorphism law.
      .symbolSize(vertical ? CELL_W : CELL_H, vertical ? CELL_H : CELL_W)
      .symbolGap(vertical ? GAP : GAP, GAP)
      .symbols((r) => {
        // BlurSpriteSymbol takes the whole MAPS and looks up by symbol id.
        for (const id of ids) {
          r.register(id, BlurSpriteSymbol, { textures, blurTextures });
        }
      })
      .weights(Object.fromEntries(ids.map((id) => [id, 10])))
      .speed('normal', SpeedPresets.NORMAL)
      .ticker(app.ticker)
      .build();

    const cell = new Container();
    const label = new Text({
      text: `${orientation} / ${direction}`,
      style: { fontFamily: 'monospace', fontSize: 13, fill: 0x9f9fc0 },
    });
    label.y = -20;
    cell.addChild(label, set);
    root.addChild(cell);
    sets.push(set);
  }

  // Two-by-two, sized off each set's own footprint so both orientations fit.
  const layout = (): void => {
    const w = REELS * CELL_W + (REELS - 1) * GAP;
    const h = CELLS * CELL_H + (CELLS - 1) * GAP;
    const colW = Math.max(w, CELLS * CELL_W) + 60;
    const rowH = Math.max(h, REELS * CELL_H) + 70;
    root.children.forEach((child, i) => {
      child.x = (i % 2) * colW;
      child.y = Math.floor(i / 2) * rowH + 24;
    });
    const bw = colW * 2;
    const bh = rowH * 2;
    const s = Math.min(1, (app.screen.width - 32) / bw, (app.screen.height - 100) / bh);
    root.scale.set(s);
    root.x = (app.screen.width - bw * s) / 2;
    root.y = (app.screen.height - bh * s) / 2;
  };
  layout();
  app.renderer.on('resize', layout);

  // One debug handle per set, so the e2e spec can read every combination.
  sets.forEach((set, i) => {
    enableDebug(set);
    (window as unknown as Record<string, unknown>)[`__SET_${i}`] = set;
  });
  (window as unknown as { __SETS: ReelSet[] }).__SETS = sets;

  const grid = (): string[][] =>
    Array.from({ length: REELS }, () =>
      Array.from({ length: CELLS }, () => ids[Math.floor(Math.random() * ids.length)]),
    );

  const button = document.getElementById('spin') as HTMLButtonElement;
  button.addEventListener('click', () => {
    button.disabled = true;
    const target = grid();
    // Every set lands the SAME grid. the whole point is that indices mean the
    // same thing whichever way the strip travels.
    void Promise.all(
      sets.map(async (set) => {
        const p = set.spin();
        set.setResult(target.map((visible) => ({ visible })));
        await p;
      }),
    ).then(() => {
      (window as unknown as { __LAST: string[][] }).__LAST = target;
      button.disabled = false;
    });
  });
}

void main();
