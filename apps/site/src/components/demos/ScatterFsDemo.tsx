/** @jsxImportSource react */
import DemoSandbox from '../DemoSandbox.tsx';
import { mountMechanic } from '../demoRuntime.ts';
import { forceScatters, forceNearMiss } from '../../../../../examples/shared/cheats.ts';

const IDS = ['round/round_1', 'round/round_2', 'round/round_3', 'bonus/bonus_1'];
const SCATTER = 'bonus/bonus_1';

const FS_PER_SCATTER = 5;
const FS_AUTOPLAY_DELAY = 900; // ms between auto-fired free spins

/**
 * Primitive FS entry flow:
 *   trigger  → overlay "FREE SPINS x N · Enter" → counter chip shown → each
 *   free spin auto-fires with no player input → at 0 → "FS complete" overlay
 *   → return to base. No in-FS retriggers — once awarded, the count is fixed.
 */
export default function ScatterFsDemo() {
  return (
    <DemoSandbox
      mechanic="scatter-triggers-fs"
      tags={['5×3', 'scatter', 'free-spins', 'autoplay']}
      height={500}
      cheats={[
        { id: 'force3', label: 'Force 3 scatters', description: 'Exactly 3 bonuses anywhere — guarantees FS trigger.', enabled: true, cheat: forceScatters(3, SCATTER) },
        { id: 'force4', label: 'Force 4 scatters', description: 'More spins awarded. Still no mid-FS retriggers.', enabled: false, cheat: forceScatters(4, SCATTER) },
        { id: 'near-miss-5', label: 'Near-miss on reel 5', description: '2 bonuses land, reel 5 blanks. Anticipation fires.', enabled: false, cheat: forceNearMiss(3, SCATTER, 4) },
      ]}
      boot={(host, api, cheats) => {
        // ── FS state (local to this boot closure) ─────────────────────────
        let fsRemaining = 0;
        let fsTotal = 0;

        // Counter chip, top-left of the stage. Created lazily on first enter.
        let counterEl: HTMLDivElement | null = null;
        const showCounter = () => {
          if (!counterEl) {
            counterEl = document.createElement('div');
            counterEl.className = 'absolute left-3 top-3 z-10 rounded-full border border-primary/50 bg-card/90 backdrop-blur px-3 py-1.5 text-xs font-mono font-semibold text-primary shadow-lg shadow-primary/20';
            host.appendChild(counterEl);
          }
          counterEl.textContent = `FREE SPINS · ${fsRemaining} / ${fsTotal}`;
        };
        const hideCounter = () => {
          counterEl?.remove();
          counterEl = null;
        };

        // Generic full-stage overlay helper.
        const showOverlay = (title: string, big: string, body: string, cta: string): Promise<void> =>
          new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'absolute inset-0 z-30 flex items-center justify-center';
            overlay.style.background =
              'radial-gradient(600px 300px at 50% 45%, hsl(22 92% 52% / 0.45), transparent 65%), hsl(27 40% 7% / 0.65)';
            overlay.style.backdropFilter = 'blur(2px)';
            overlay.innerHTML = `
              <div class="rounded-2xl border border-border bg-card/95 px-10 py-8 text-center shadow-2xl shadow-primary/30 animate-fade-in max-w-[360px]">
                <div class="text-[11px] font-mono uppercase tracking-[0.14em] text-primary">${title}</div>
                <div class="mt-3 text-5xl font-bold tracking-tight" style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent))); -webkit-background-clip: text; background-clip: text; color: transparent;">${big}</div>
                <p class="mt-3 text-sm text-muted-foreground">${body}</p>
                <button class="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/40 transition-all hover:brightness-110" data-cta>${cta}</button>
              </div>
            `;
            host.appendChild(overlay);
            overlay.querySelector<HTMLButtonElement>('[data-cta]')!.addEventListener('click', () => {
              overlay.remove();
              resolve();
            });
          });

        const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

        return mountMechanic(host, api, {
          reelCount: 5,
          visibleRows: 3,
          symbolSize: { width: 110, height: 110 },
          symbols: { kind: 'sprite', ids: IDS },
          weights: { 'round/round_1': 40, 'round/round_2': 40, 'round/round_3': 40, [SCATTER]: 2 },
          cheats,
          cheatTitle: 'Scatter / FS cheats',
          onLanded: async ({ grid, reelSet, toast, api, requestSpin }) => {
            // ── In-FS-mode: decrement, maybe complete, else auto-spin ─────
            if (fsRemaining > 0) {
              fsRemaining--;
              showCounter();
              api.setStatus(`Free spin ${fsTotal - fsRemaining} / ${fsTotal}`);

              if (fsRemaining === 0) {
                await sleep(600);
                hideCounter();
                await showOverlay(
                  'Free spins complete',
                  `${fsTotal} spins`,
                  'Back to base game.',
                  'Collect',
                );
                fsTotal = 0;
                api.setStatus('Base game. Force 3 scatters and press SPIN to trigger again.');
              } else {
                // Auto-fire the next free spin — no player input needed.
                await sleep(FS_AUTOPLAY_DELAY);
                void requestSpin();
              }
              return;
            }

            // ── Base game: look for a scatter trigger ─────────────────────
            const scatters: { reel: number; row: number }[] = [];
            for (let r = 0; r < grid.length; r++) {
              for (let row = 0; row < grid[r].length; row++) {
                if (grid[r][row] === SCATTER) scatters.push({ reel: r, row });
              }
            }

            if (scatters.length >= 3) {
              toast(`${scatters.length} scatters`, 'win');
              // Play win anim on each scatter cell before the overlay drops.
              for (const s of scatters) {
                reelSet.getReel(s.reel).getSymbolAt(s.row).playWin();
              }
              await sleep(700);

              const awarded = scatters.length * FS_PER_SCATTER;
              fsTotal = awarded;
              fsRemaining = awarded;
              await showOverlay(
                'Feature triggered',
                `${awarded} free spins`,
                `${scatters.length} scatters unlocked the bonus. Autoplay starts after Enter.`,
                'Enter',
              );
              showCounter();
              api.setStatus(`Free spin 1 / ${fsTotal} — autoplay…`);
              // Kick off the FS autoplay loop — the player does nothing from here
              // until the "Free spins complete" overlay shows.
              await sleep(400);
              void requestSpin();
            } else if (scatters.length === 2) {
              toast('So close…', 'warn');
            }
          },
        });
      }}
    />
  );
}
