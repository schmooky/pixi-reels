/** @jsxImportSource react */
import { Sprite, Container, type Texture } from 'pixi.js';
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { forceScatters, forceCell } from '../../../../../examples/shared/cheats.ts';
import { loadPrototypeSymbols } from '../../../../../examples/shared/prototypeSpriteLoader.ts';

const IDS = ['round/round_1', 'round/round_2', 'round/round_3', 'wild/wild_1'];
const WILD = 'wild/wild_1';

// Match the geometry demoRuntime builds: 110×110 symbols with 6px gap.
const CELL = 110;
const GAP = 6;
const SLOT = CELL + GAP;

type Sticky = { reel: number; row: number; spinsLeft: number };

/**
 * Mounts/updates an overlay Container holding sticky-wild sprites. The reel
 * column behind each held cell continues to spin normally, but the overlay
 * sprite sits on top and never moves — so a held wild visibly stays put
 * during the respin, matching how sticky-wild mechanics look in shipping games.
 */
async function syncStickyOverlay(
  reelSet: { viewport: { spotlightContainer: Container } },
  stickies: Sticky[],
  state: {
    container: Container | null;
    sprites: Map<string, Sprite>;
    texture: Texture | null;
  },
): Promise<void> {
  if (!state.texture) {
    const atlas = await loadPrototypeSymbols();
    state.texture = atlas.textures[WILD] ?? null;
    if (!state.texture) return;
  }
  if (!state.container) {
    state.container = new Container();
    reelSet.viewport.spotlightContainer.addChild(state.container);
  }

  const alive = new Set<string>();
  for (const s of stickies) {
    if (s.spinsLeft <= 0) continue;
    const key = `${s.reel},${s.row}`;
    alive.add(key);
    let sprite = state.sprites.get(key);
    if (!sprite) {
      sprite = new Sprite(state.texture);
      sprite.anchor.set(0.5, 0.5);
      // Letterbox-fit to the cell, matching BlurSpriteSymbol.
      const scale = Math.min(CELL / sprite.texture.width, CELL / sprite.texture.height);
      sprite.scale.set(scale);
      sprite.x = s.reel * SLOT + CELL / 2;
      sprite.y = s.row * SLOT + CELL / 2;
      state.container.addChild(sprite);
      state.sprites.set(key, sprite);
    }
  }

  // Drop overlays for expired cells.
  for (const [key, sprite] of state.sprites) {
    if (!alive.has(key)) {
      sprite.parent?.removeChild(sprite);
      sprite.destroy();
      state.sprites.delete(key);
    }
  }
}

export default function StickyWildsDemo() {
  const stickies: Sticky[] = [];
  const overlayState: {
    container: Container | null;
    sprites: Map<string, Sprite>;
    texture: Texture | null;
  } = { container: null, sprites: new Map(), texture: null };

  return (
    <DemoSandbox
      mechanic="sticky-wilds"
      tags={['5×3', 'wild', 'sticky']}
      height={500}
      cheats={[
        {
          id: 'one-per-spin',
          label: 'Land one new wild each spin',
          description:
            'Every spin places one wild at a random non-held cell. Held wilds visibly stay put as the reel spins behind them, then persist for 3 spins.',
          enabled: true,
          cheat: forceScatters(1, WILD),
        },
        {
          id: 'two-per-spin',
          label: 'Land two new wilds each spin',
          description: 'Faster build-up. Board fills in ~3 spins.',
          enabled: false,
          cheat: forceScatters(2, WILD),
        },
        {
          id: 'wild-r3',
          label: 'Force wild on reel 3 / row 2',
          description: 'Always a wild at (2, 1). Combine with held to stack.',
          enabled: false,
          cheat: forceCell(2, 1, WILD),
        },
      ]}
      boot={(host, api, cheats) =>
        mountMechanic(host, api, {
          reelCount: 5,
          visibleRows: 3,
          symbolSize: { width: CELL, height: CELL },
          symbols: { kind: 'sprite', ids: IDS },
          weights: {
            'round/round_1': 40,
            'round/round_2': 40,
            'round/round_3': 40,
            [WILD]: 0,
          },
          cheats,
          cheatTitle: 'Sticky wild cheats',
          beforeSpin: (engine) => {
            // The CheatEngine applies held on top of ANY cheat's output,
            // so stickies persist automatically in the result grid.
            const held = stickies
              .filter((s) => s.spinsLeft > 0)
              .map((s) => ({ reel: s.reel, row: s.row, symbolId: WILD }));
            engine.setHeld(held);
          },
          onLanded: async ({ grid, reelSet, toast, api }) => {
            // Decrement existing stickies
            for (const s of stickies) s.spinsLeft--;
            // Track any wilds on the grid — new ones start at 3, existing refresh to 3
            let newThisSpin = 0;
            for (let r = 0; r < grid.length; r++) {
              for (let row = 0; row < grid[r].length; row++) {
                if (grid[r][row] === WILD) {
                  const existing = stickies.find((s) => s.reel === r && s.row === row);
                  if (existing) {
                    existing.spinsLeft = 3; // refresh
                  } else {
                    stickies.push({ reel: r, row, spinsLeft: 3 });
                    newThisSpin++;
                    reelSet.getReel(r).getSymbolAt(row).playWin();
                  }
                }
              }
            }
            // Drop expired
            for (let i = stickies.length - 1; i >= 0; i--) {
              if (stickies[i].spinsLeft <= 0) stickies.splice(i, 1);
            }
            // Sync the overlay sprites so held wilds stay put during the next respin.
            await syncStickyOverlay(reelSet, stickies, overlayState);
            const active = stickies.length;
            if (newThisSpin > 0) toast(`+${newThisSpin} sticky wild${newThisSpin > 1 ? 's' : ''}`, 'win');
            api.setStatus(`Active stickies: ${active}/15 · new this spin: ${newThisSpin}`);
          },
        })
      }
    />
  );
}
