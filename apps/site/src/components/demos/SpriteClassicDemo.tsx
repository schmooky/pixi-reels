/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountPrototypeReels } from '../prototypeRuntime.ts';
import { forceLine, forceGrid, forceScatters, forceCell } from '../../../../../examples/shared/cheats.ts';

// Symbol set for the demo — royals as premiums, rounds as low, bonus + wild.
const SYMBOL_IDS = [
  'round/round_1', 'round/round_2', 'round/round_3', 'round/round_4',
  'royal/royal_1', 'royal/royal_2', 'royal/royal_3',
  'wild/wild_1',
  'bonus/bonus_1',
];

const WEIGHTS: Record<string, number> = {
  'round/round_1': 38, 'round/round_2': 36, 'round/round_3': 30, 'round/round_4': 26,
  'royal/royal_1': 14, 'royal/royal_2': 10, 'royal/royal_3': 6,
  'wild/wild_1': 3,
  'bonus/bonus_1': 2,
};

// Full-grid jackpot grid for the "force 15 royals" cheat.
const JACKPOT: string[][] = Array.from({ length: 5 }, () =>
  Array.from({ length: 3 }, () => 'royal/royal_1'),
);

export default function SpriteClassicDemo() {
  return (
    <DemoSandbox
      mechanic="sprite-classic"
      tags={['5×3', 'sprites', 'atlas', 'blur-on-spin']}
      height={500}
      cheats={[
        { id: 'line-royal', label: 'Force royal line (middle row)', description: 'Full row of `royal/royal_1` on row 2.', enabled: false, cheat: forceLine(1, 'royal/royal_1') },
        { id: 'line-round', label: 'Force round line (top row)', description: 'Full row of `round/round_1` on row 0.', enabled: false, cheat: forceLine(0, 'round/round_1') },
        { id: 'jackpot', label: 'Full-grid royal jackpot', description: '15 royals. Pure theatre.', enabled: false, cheat: forceGrid(JACKPOT) },
        { id: 'scatters-3', label: 'Sprinkle 3 bonuses', description: 'Exactly 3 bonus symbols anywhere.', enabled: false, cheat: forceScatters(3, 'bonus/bonus_1') },
        { id: 'wild-middle', label: 'Wild on reel 3, row 2', description: 'Always lands a wild at (2, 1).', enabled: false, cheat: forceCell(2, 1, 'wild/wild_1') },
      ]}
      boot={(host, api, cheats) => {
        return (async () => {
          const { mountMechanic } = await import('../demoRuntime.ts');
          // Can't reuse mountMechanic here — it assumes BlockSymbol. We replicate
          // the parts we need (spin button, status, cheats wiring) inline below.
          void mountMechanic;

          const handle = await mountPrototypeReels(host, {
            reelCount: 5,
            visibleRows: 3,
            symbolSize: { width: 128, height: 128 },
            symbolIds: SYMBOL_IDS,
            weights: WEIGHTS,
          });

          // ---------------- Cheat engine ----------------
          const { CheatEngine } = await import('../../../../../examples/shared/cheats.ts');
          const engine = new CheatEngine({
            reelCount: 5,
            visibleRows: 3,
            symbolIds: SYMBOL_IDS,
            seed: 42,
          });
          for (const c of cheats) engine.register({ ...c });
          api.mountPanel(engine, 'Sprite-classic cheats');

          // ---------------- Controls (DOM overlay) ----------------
          const controls = document.createElement('div');
          Object.assign(controls.style, {
            position: 'absolute', bottom: '14px', left: '50%',
            transform: 'translateX(-50%)', display: 'flex', gap: '8px', zIndex: '5',
          });
          host.appendChild(controls);

          const baseBtn = 'inline-flex items-center justify-center gap-2 rounded-lg px-5 h-10 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none';
          const mkPrimary = (label: string) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.className = `${baseBtn} text-primary-foreground shadow-lg shadow-primary/30 bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))] hover:brightness-110`;
            return btn;
          };
          const mkSecondary = (label: string) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.className = `${baseBtn} border border-border bg-card/80 text-foreground hover:bg-secondary/60 backdrop-blur`;
            return btn;
          };

          const spinBtn = mkPrimary('SPIN');
          const skipBtn = mkSecondary('Skip');
          controls.appendChild(spinBtn);
          controls.appendChild(skipBtn);

          skipBtn.addEventListener('click', () => {
            if (handle.reelSet.isSpinning) handle.reelSet.skip();
          });

          let spinning = false;
          spinBtn.addEventListener('click', async () => {
            if (spinning) return;
            spinning = true;
            spinBtn.disabled = true;
            try {
              const { symbols, anticipationReels } = engine.next();
              api.setStatus('Spinning…');
              const p = handle.reelSet.spin();
              setTimeout(() => {
                if (anticipationReels.length) handle.reelSet.setAnticipation(anticipationReels);
                handle.reelSet.setResult(symbols);
              }, 240);
              const result = await p;
              api.setStatus(`Landed · ${summarize(result.symbols)}`);

              // Light win reaction: any row of identical symbols plays `playWin` on each cell.
              const grid = result.symbols;
              for (let row = 0; row < grid[0].length; row++) {
                const id = grid[0][row];
                if (id === 'wild/wild_1') continue;
                let streak = 1;
                for (let r = 1; r < grid.length; r++) {
                  const s = grid[r][row];
                  if (s === id || s === 'wild/wild_1') streak++;
                  else break;
                }
                if (streak >= 3) {
                  api.toast(`Line win · ${streak} of ${id.split('/').pop()}`, 'win');
                  for (let r = 0; r < streak; r++) {
                    handle.reelSet.getReel(r).getSymbolAt(row).playWin();
                  }
                  await new Promise((x) => setTimeout(x, 450));
                }
              }
            } finally {
              spinning = false;
              spinBtn.disabled = false;
            }
          });

          api.setStatus('Ready. Toggle a cheat, then press SPIN.');

          return () => {
            try { controls.remove(); } catch { /* ignore */ }
            handle.destroy();
          };
        })();
      }}
    />
  );
}

function summarize(grid: string[][]): string {
  return grid.map((col) => col.map((s) => s.split('/').pop()).join('/')).join(' · ');
}
