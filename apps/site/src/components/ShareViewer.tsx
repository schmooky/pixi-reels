/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Lock, Loader2, Square, RefreshCw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { Application, type Texture } from 'pixi.js';
import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  SpeedPresets,
  enableDebug,
  WinPresenter,
  RectMaskStrategy,
  SharedRectMaskStrategy,
  type ReelSet,
  type SymbolData,
} from 'pixi-reels';
import { transform as sucraseTransform } from 'sucrase';
import { runCascade, tumbleToGrid, diffCells } from '../../../../examples/shared/cascadeLoop.ts';
import { getShare, ShareApiError } from '@/lib/studio/share/api.js';
import { openEnvelope } from '@/lib/studio/share/crypto.js';
import { decodePayload, verifyPayloadHashes } from '@/lib/studio/share/payload.js';
import {
  applyStudioConfig,
  revokeBlobUrls,
  type StudioInjectables,
} from '@/lib/studio/applyConfig.js';
import type { GetShareResponse, SharePayload } from '@/lib/studio/share/types.js';
import type { StudioConfig, StoredAsset } from '@/lib/studio/types.js';

/**
 * Read the share id from the URL. Supports three forms so the page works
 * on plain static hosting AND with future path-style rewrites:
 *   /share/#<id>    ← what the share-api returns today (zero rewrite cost)
 *   /share/?id=<id> ← query string variant
 *   /share/<id>     ← needs _redirects on the host; we fall back to path
 */
function readIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '').trim();
  if (hash) return hash;
  const params = new URLSearchParams(window.location.search);
  const q = params.get('id');
  if (q) return q.trim();
  const path = window.location.pathname.replace(/\/$/, '');
  const m = /\/share\/([^/]+)$/.exec(path);
  return m ? m[1] : null;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'awaiting-password'; meta: GetShareResponse['meta']; envelope: NonNullable<GetShareResponse['envelope']> }
  | { kind: 'ready'; meta: GetShareResponse['meta']; config: StudioConfig; assets: Map<string, StoredAsset> }
  | { kind: 'error'; message: string };

function pickWeighted(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [id, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return id;
  }
  return Object.keys(weights)[0];
}

/** Sibling of `makeStudioReelSetBuilder` in Studio.tsx. Studio overrides
 *  for shared symbols pass through `.symbolData(...)` at build time. */
function makeStudioReelSetBuilder(
  studioOverrides: Record<string, Partial<SymbolData>>,
): typeof ReelSetBuilder {
  if (Object.keys(studioOverrides).length === 0) return ReelSetBuilder;
  return class extends ReelSetBuilder {
    override build(): ReelSet {
      this.symbolData(studioOverrides);
      return super.build();
    }
  } as typeof ReelSetBuilder;
}

export default function ShareViewer(): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptBusy, setDecryptBusy] = useState(false);

  // Fetch the share on mount.
  useEffect(() => {
    const id = readIdFromLocation();
    if (!id) {
      setPhase({ kind: 'error', message: 'No share id in URL. Expected /share/#<id>.' });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await getShare(id);
        if (cancelled) return;
        if (res.payload) {
          // Public mode — payload is plaintext, load it directly.
          const decoded = await decodePayload(res.payload);
          setPhase({ kind: 'ready', meta: res.meta, config: decoded.config, assets: decoded.assets });
        } else if (res.envelope) {
          setPhase({ kind: 'awaiting-password', meta: res.meta, envelope: res.envelope });
        } else {
          setPhase({ kind: 'error', message: 'Share is missing both payload and envelope. Server bug?' });
        }
      } catch (e) {
        const msg = e instanceof ShareApiError
          ? (e.status === 404 ? 'Share not found or expired.' : e.detail)
          : (e as Error).message;
        if (!cancelled) setPhase({ kind: 'error', message: msg });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleUnlock(): Promise<void> {
    if (phase.kind !== 'awaiting-password') return;
    setDecryptBusy(true);
    setDecryptError(null);
    try {
      const plaintext = await openEnvelope(password, phase.envelope);
      const payload = JSON.parse(plaintext) as SharePayload;
      // Belt-and-braces: verify each asset's hash matches its key after
      // decryption. A clean envelope unwrap proves authenticity for the
      // bytes, but doesn't catch hash-key mismatches from a buggy uploader.
      await verifyPayloadHashes(payload);
      const decoded = await decodePayload(payload);
      setPhase({ kind: 'ready', meta: phase.meta, config: decoded.config, assets: decoded.assets });
    } catch (e) {
      setDecryptError((e as Error).message);
    } finally {
      setDecryptBusy(false);
    }
  }

  // ── render ──
  if (phase.kind === 'loading') {
    return <CenteredCard><Loader2 size={24} className="animate-spin text-muted-foreground" /></CenteredCard>;
  }

  if (phase.kind === 'error') {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle size={32} className="text-destructive" />
          <div className="text-sm font-semibold">Couldn't load this share</div>
          <div className="max-w-sm text-xs text-muted-foreground">{phase.message}</div>
        </div>
      </CenteredCard>
    );
  }

  if (phase.kind === 'awaiting-password') {
    return (
      <CenteredCard>
        <div className="w-full max-w-sm space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock size={14} /> Password required
          </div>
          <div className="text-xs text-muted-foreground">
            This share is encrypted. Enter the view password to load it.
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock(); }}
            placeholder="Password"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
            autoFocus
          />
          {decryptError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{decryptError}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={decryptBusy || password.length === 0}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
          >
            {decryptBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {decryptBusy ? 'Decrypting…' : 'Unlock'}
          </button>
        </div>
      </CenteredCard>
    );
  }

  // phase === 'ready'
  return (
    <SharedStudio
      config={phase.config}
      assets={phase.assets}
      codeAccessible={phase.meta.mode.codeAccessible}
    />
  );
}

// ── shared studio render ─────────────────────────────────────────────

interface SharedStudioProps {
  config: StudioConfig;
  assets: Map<string, StoredAsset>;
  codeAccessible: boolean;
}

function SharedStudio({ config, assets, codeAccessible }: SharedStudioProps): JSX.Element {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const reelSetRef = useRef<ReelSet | null>(null);
  const nextResultRef = useRef<(() => string[][]) | null>(null);
  const onSpinRef = useRef<(() => Promise<void>) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastInjectablesRef = useRef<StudioInjectables | null>(null);
  const fitRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState<string>('Press Run to mount the reels.');
  const [error, setError] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Asset getter — pulls from the in-memory map decoded from the share.
  // No IndexedDB writes; closing the tab discards the shared assets.
  const getAsset = async (hash: string): Promise<StoredAsset | null> => assets.get(hash) ?? null;

  // Boot Pixi once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = canvasHostRef.current;
      if (!host) return;
      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        resizeTo: host,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });
      if (cancelled) { app.destroy(true, { children: true }); return; }
      try { gsap.ticker.remove(gsap.updateRoot); } catch { /* ignore */ }
      app.ticker.add((t) => gsap.updateRoot(t.lastTime / 1000));
      host.innerHTML = '';
      host.appendChild(app.canvas);
      appRef.current = app;
    })();

    const observer = typeof ResizeObserver !== 'undefined' && canvasHostRef.current
      ? new ResizeObserver(() => {
          try { appRef.current?.resize(); } catch { /* ignore */ }
          fitRef.current?.();
        })
      : null;
    if (observer && canvasHostRef.current) observer.observe(canvasHostRef.current);

    return () => {
      cancelled = true;
      observer?.disconnect();
      try { cleanupRef.current?.(); } catch { /* ignore */ }
      try { reelSetRef.current?.destroy(); } catch { /* ignore */ }
      if (lastInjectablesRef.current) revokeBlobUrls(lastInjectablesRef.current.blobUrls);
      try { appRef.current?.destroy(true, { children: true }); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(): Promise<void> {
    const app = appRef.current;
    if (!app) return;
    setError(null);

    try { cleanupRef.current?.(); } catch { /* ignore */ }
    try { reelSetRef.current?.destroy(); } catch { /* ignore */ }
    if (lastInjectablesRef.current) revokeBlobUrls(lastInjectablesRef.current.blobUrls);

    let injectables: StudioInjectables;
    try {
      injectables = await applyStudioConfig(config, { getAsset });
    } catch (e) {
      setError(`Asset error: ${(e as Error).message}`);
      return;
    }
    lastInjectablesRef.current = injectables;

    let js: string;
    try {
      js = sucraseTransform(config.code, { transforms: ['typescript'] }).code;
    } catch (e) {
      setError(`Compile error: ${(e as Error).message}`);
      return;
    }

    const factorySource = `"use strict"; ${js} ; return buildReels();`;
    let built: { reelSet?: ReelSet; nextResult?: () => string[][]; onSpin?: () => Promise<void>; cleanup?: () => void };
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;
      const factory = new AsyncFunction(
        'ReelSetBuilder',
        'SpeedPresets',
        'WinPresenter',
        'RectMaskStrategy',
        'SharedRectMaskStrategy',
        'app',
        'textures',
        'userSymbols',
        'userSymbolData',
        'pickWeighted',
        'gsap',
        'PIXI',
        'runCascade',
        'tumbleToGrid',
        'diffCells',
        factorySource,
      );
      built = (await factory(
        makeStudioReelSetBuilder(injectables.userSymbolData),
        SpeedPresets,
        WinPresenter,
        RectMaskStrategy,
        SharedRectMaskStrategy,
        app,
        injectables.textures,
        injectables.userSymbols,
        injectables.userSymbolData,
        pickWeighted,
        gsap,
        PIXI,
        runCascade,
        tumbleToGrid,
        diffCells,
      )) as typeof built;
    } catch (e) {
      setError(`Runtime error: ${(e as Error).message}`);
      return;
    }

    onSpinRef.current = built.onSpin ?? null;
    cleanupRef.current = built.cleanup ?? null;
    if (!built.reelSet) {
      setStatus('Mounted. Custom spin handler active.');
      return;
    }
    const reelSet = built.reelSet;
    enableDebug(reelSet);

    const PADDING = 24;
    const fit = (): void => {
      const rawW = reelSet.width / (reelSet.scale.x || 1);
      const rawH = reelSet.height / (reelSet.scale.y || 1);
      const availW = Math.max(40, app.screen.width - PADDING * 2);
      const availH = Math.max(40, app.screen.height - PADDING * 2);
      const scale = Math.min(availW / rawW, availH / rawH);
      reelSet.scale.set(scale);
      reelSet.x = (app.screen.width - rawW * scale) / 2;
      reelSet.y = (app.screen.height - rawH * scale) / 2;
    };
    app.stage.removeChildren();
    app.stage.addChild(reelSet);
    fit();
    fitRef.current = fit;

    reelSetRef.current = reelSet;
    nextResultRef.current = built.nextResult ?? null;
    setStatus(`Mounted. ${reelSet.reels.length} reel${reelSet.reels.length === 1 ? '' : 's'} × ${reelSet.reels[0]?.symbols.length ?? 0} slots.`);
  }

  async function handleSpin(): Promise<void> {
    if (isSpinning) {
      try { reelSetRef.current?.skip(); } catch { /* ignore */ }
      return;
    }
    if (!reelSetRef.current && !onSpinRef.current) return;
    setIsSpinning(true);
    try {
      if (onSpinRef.current) await onSpinRef.current();
      else if (reelSetRef.current) {
        const p = reelSetRef.current.spin();
        const result = nextResultRef.current?.();
        await new Promise((r) => setTimeout(r, 150));
        if (result) reelSetRef.current.setResult(result);
        await p;
      }
    } catch (e) {
      setError(`Spin error: ${(e as Error).message}`);
    } finally {
      setIsSpinning(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,520px)]">
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative flex-1 min-h-[480px]">
          <div ref={canvasHostRef} className="h-full w-full bg-background" />
          <button
            type="button"
            onClick={() => void handleSpin()}
            disabled={!reelSetRef.current && !onSpinRef.current}
            title={isSpinning ? 'Stop' : 'Spin'}
            aria-label={isSpinning ? 'Stop' : 'Spin'}
            className={cn(
              'absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full',
              'border border-border/70 bg-background/80 text-foreground shadow-sm backdrop-blur',
              'transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary',
              isSpinning && 'bg-primary text-primary-foreground border-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isSpinning ? <Square size={14} strokeWidth={2.5} /> : <RefreshCw size={16} strokeWidth={2.25} />}
          </button>
        </div>
        <div className="flex items-start gap-2 border-t border-border/60 bg-background/40 px-3 py-2 text-xs">
          {error ? (
            <>
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-destructive" />
              <span className="text-destructive">{error}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-emerald-500" />
              <span className="text-muted-foreground">{status}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => void run()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
          >
            Run
          </button>
        </div>
      </div>

      {codeAccessible && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border/60 bg-background/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
            Code (read-only)
          </div>
          <div className="h-[560px]">
            <Editor
              defaultLanguage="typescript"
              value={config.code}
              theme="vs-dark"
              options={{
                readOnly: true,
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                tabSize: 2,
                renderWhitespace: 'selection',
                padding: { top: 10, bottom: 10 },
              }}
              onMount={(_e, monaco) => {
                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                  noSemanticValidation: true,
                  noSyntaxValidation: false,
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-[480px] items-center justify-center rounded-xl border border-border bg-card p-8">
      {children}
    </div>
  );
}
