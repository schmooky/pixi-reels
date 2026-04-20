/** @jsxImportSource react */
import RecipeBoard from '../RecipeBoard.tsx';
import { mountMiniReels, sleep } from '../miniRuntime.ts';

// Visual demo of the texture-atlas pattern: one atlas provides both base and
// motion-blur textures via `_blur`-suffixed frames. BlurSpriteSymbol swaps
// them automatically while the reel is in the spin phase.
const IDS = [
  'round/round_1', 'round/round_2', 'round/round_3', 'round/round_4',
  'royal/royal_1', 'royal/royal_2', 'square/square_1', 'square/square_2',
];

export default function TextureAtlasRecipe() {
  return (
    <RecipeBoard
      height={280}
      setup={async (host) => {
        const { reelSet, destroy } = await mountMiniReels(host, {
          reelCount: 5, visibleRows: 3,
          symbolSize: { width: 72, height: 72 },
          symbols: { kind: 'sprite', ids: IDS, blurOnSpin: true },
        });
        return {
          destroy,
          run: async () => {
            // A random grid so `setResult` can resolve the spin and the
            // blur-on-spin pattern can be observed both spinning and landing.
            const grid = Array.from({ length: 5 }, () =>
              Array.from({ length: 3 }, () => IDS[Math.floor(Math.random() * IDS.length)]),
            );
            const p = reelSet.spin();
            await sleep(150);
            reelSet.setResult(grid);
            await p;
          },
        };
      }}
    />
  );
}
