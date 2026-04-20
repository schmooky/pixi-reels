/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { ReelSetBuilder, ReelSymbol, SpeedPresets, type ReelSet } from 'pixi-reels';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BlurSpriteSymbol } from '../../../../../examples/shared/BlurSpriteSymbol.ts';
import { loadPrototypeSymbols } from '../../../../../examples/shared/prototypeSpriteLoader.ts';

const COIN = 'feature/feature_1';
const EMPTY = 'empty';

/** Renders nothing — gives the reel strip blank slots between coins so
 *  misses land on a visually empty cell (hit-or-miss feel). */
class EmptySymbol extends ReelSymbol {
  protected onActivate(): void {}
  protected onDeactivate(): void {}
  async playWin(): Promise<void> {}
  stopAnimation(): void {}
  resize(_w: number, _h: number): void {}
}

const COLS = 5;
const ROWS = 3;
const CELL = 72;
const GAP = 4;

interface CellHandle {
  col: number;
  row: number;
  container: Container;
  reelSet: ReelSet;
}

let gsapSynced = false;
function syncGsap(app: Application): void {
  if (gsapSynced) return;
  gsapSynced = true;
  try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
  app.ticker.add((t) => gsap.updateRoot(t.lastTime / 1000));
}

/**
 * Hold & Win "hit-or-miss" demo. Each cell is its own 1x1 ReelSet whose only
 * symbol is the coin — so the spin animation just scrolls coins by, and the
 * result is binary: hit (coin stays), miss (cell goes empty). On a hit, an
 * overlay Sprite locks in place so the reel is hidden next round and can't
 * re-spin that slot.
 */
export default function HoldAndWinStarterRecipe() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    app: Application;
    cells: CellHandle[];
    heldKeys: Set<string>;
    overlays: Map<string, Sprite>;
    coinTex: Texture;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const host = hostRef.current;
      if (!host) return;

      const padX = 14, padY = 14;
      const width = COLS * (CELL + GAP) - GAP + padX * 2;
      const height = ROWS * (CELL + GAP) - GAP + padY * 2;

      const app = new Application();
      await app.init({ width, height, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true });
      if (disposed) { app.destroy(true, { children: true }); return; }
      syncGsap(app);

      host.innerHTML = '';
      host.appendChild(app.canvas);

      const atlas = await loadPrototypeSymbols();
      if (disposed) { app.destroy(true, { children: true }); return; }
      const coinTex = atlas.textures[COIN];

      const frame = new Graphics();
      frame.roundRect(0, 0, width, height, 12).stroke({ color: 0xe5dccf, width: 1, alpha: 0.9 });
      app.stage.addChild(frame);

      // 15 per-cell 1x1 ReelSets, each strip is 100% COIN — classic hit-or-miss.
      const cells: CellHandle[] = [];
      for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < ROWS; row++) {
          const cellContainer = new Container();
          cellContainer.x = padX + col * (CELL + GAP);
          cellContainer.y = padY + row * (CELL + GAP);
          app.stage.addChild(cellContainer);

          const bg = new Graphics();
          bg.roundRect(0, 0, CELL, CELL, 8).fill({ color: 0xfaf6ef, alpha: 0.6 }).stroke({ color: 0xe5dccf, width: 1, alpha: 0.8 });
          cellContainer.addChild(bg);

          const mini = new ReelSetBuilder()
            .reels(1)
            .visibleSymbols(1)
            .symbolSize(CELL - 2, CELL - 2)
            .symbolGap(0, 0)
            .symbols((r) => {
              r.register(COIN, BlurSpriteSymbol, { textures: atlas.textures, blurTextures: atlas.blurTextures, anchor: { x: 0.5, y: 0.5 }, fit: true });
              r.register(EMPTY, EmptySymbol, {});
            })
            // Empties outweigh coins on the strip so the scroll reads as
            // mostly blank with the occasional coin flashing by.
            .weights({ [COIN]: 1, [EMPTY]: 3 })
            .speed('normal', { ...SpeedPresets.NORMAL, minimumSpinTime: 320 + (col + row) * 70 })
            .ticker(app.ticker)
            .build();

          mini.x = 1; mini.y = 1;
          cellContainer.addChild(mini);
          cells.push({ col, row, container: cellContainer, reelSet: mini });
        }
      }

      stateRef.current = { app, cells, heldKeys: new Set(), overlays: new Map(), coinTex };
      // Auto-run once after mount.
      void run();
    })();

    return () => {
      disposed = true;
      const s = stateRef.current;
      if (s) {
        try { s.overlays.forEach((o) => o.destroy()); } catch { /* ignore */ }
        try { s.cells.forEach((c) => c.reelSet.destroy()); } catch { /* ignore */ }
        try { s.app.destroy(true, { children: true }); } catch { /* ignore */ }
        stateRef.current = null;
      }
    };
  }, []);

  async function run() {
    const s = stateRef.current;
    if (!s || running) return;
    setRunning(true);
    try {
      // Reset prior state.
      s.overlays.forEach((o) => { try { o.destroy(); } catch { /* ignore */ } });
      s.overlays.clear();
      s.heldKeys.clear();
      // Re-show all mini reels that were hidden on misses last run.
      for (const cell of s.cells) cell.reelSet.visible = true;

      // Scripted arrivals so the scenario reads clearly: trigger spin hits 3,
      // respin hits 1, respin hits 1 — grid filling up one coin at a time.
      const rounds: Array<Array<{ col: number; row: number }>> = [
        [{ col: 0, row: 2 }, { col: 2, row: 0 }, { col: 4, row: 1 }],
        [{ col: 1, row: 0 }],
        [{ col: 3, row: 2 }],
      ];

      for (const hits of rounds) {
        // Spin every free cell; held cells are hidden and skipped.
        const spinPromises: Promise<unknown>[] = [];
        const activeCells: CellHandle[] = [];
        for (const cell of s.cells) {
          const key = `${cell.col},${cell.row}`;
          if (s.heldKeys.has(key)) continue;
          cell.reelSet.visible = true;
          activeCells.push(cell);
          spinPromises.push(cell.reelSet.spin());
        }

        // Hits land on COIN, misses land on EMPTY. The strip mixes both so
        // the scroll animation flashes coins past empties before settling.
        await new Promise((r) => setTimeout(r, 140));
        for (const cell of activeCells) {
          const isHit = hits.some((h) => h.col === cell.col && h.row === cell.row);
          cell.reelSet.setResult([[isHit ? COIN : EMPTY]]);
        }
        await Promise.all(spinPromises);

        // Lock in the hits with an overlay sprite and hide their mini reel.
        for (const cell of activeCells) {
          const key = `${cell.col},${cell.row}`;
          const isHit = hits.some((h) => h.col === cell.col && h.row === cell.row);
          if (!isHit) continue;
          const overlay = new Sprite(s.coinTex);
          overlay.anchor.set(0.5);
          const sx = (CELL - 8) / s.coinTex.width;
          const sy = (CELL - 8) / s.coinTex.height;
          overlay.x = cell.container.x + CELL / 2;
          overlay.y = cell.container.y + CELL / 2;
          overlay.alpha = 0;
          overlay.scale.set(sx * 1.4, sy * 1.4);
          s.app.stage.addChild(overlay);
          s.overlays.set(key, overlay);
          s.heldKeys.add(key);
          gsap.to(overlay, { alpha: 1, duration: 0.22 });
          gsap.to(overlay.scale, { x: sx, y: sy, duration: 0.35, ease: 'back.out(2)' });
          cell.reelSet.visible = false;
        }
        await new Promise((r) => setTimeout(r, 650));
      }
    } finally {
      setRunning(false);
      setRan(true);
    }
  }

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative flex w-full items-center justify-center bg-card" style={{ height: 320 }}>
        <div ref={hostRef} className="flex h-full w-full items-center justify-center [&_canvas]:block [&_canvas]:max-w-full [&_canvas]:h-auto" />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-card/60 px-4 py-2.5">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Live recipe · hit-or-miss per cell
        </div>
        <Button
          size="sm"
          variant={ran ? 'outline' : 'gradient'}
          disabled={running}
          onClick={() => void run()}
          className={cn('min-w-[110px]', running && 'cursor-wait')}
        >
          {ran ? <RotateCcw size={12} strokeWidth={2.5} /> : <Play size={12} strokeWidth={2.5} />}
          {running ? 'Running…' : ran ? 'Replay' : 'Run recipe'}
        </Button>
      </div>
    </div>
  );
}
