/** @jsxImportSource react */
import { useState } from 'react';
import { X, Share2, AlertCircle, CheckCircle2, Copy, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createShare, ShareApiError } from '@/lib/studio/share/api.js';
import { sealEnvelope, hashSaveKey } from '@/lib/studio/share/crypto.js';
import { buildPayloadFromConfig } from '@/lib/studio/share/payload.js';
import {
  modeFromPreset,
  SHARE_SCHEMA_VERSION,
  type ShareModePreset,
  type ShareEnvelope,
} from '@/lib/studio/share/types.js';
import type { StudioConfig } from '@/lib/studio/types.js';

type Ttl = 3 | 7 | 30;

interface Props {
  config: StudioConfig;
  onClose: () => void;
}

const PRESETS: Array<{ id: ShareModePreset; label: string; hint: string }> = [
  { id: 'view-no-code', label: 'View only, no code', hint: 'Password to view. Code tab hidden.' },
  { id: 'view-with-code', label: 'View with code', hint: 'Password to view. Code visible read-only.' },
  { id: 'edit-separate-save-pw', label: 'Editable, separate save password', hint: 'Two passwords — one to view, one to save.' },
  { id: 'edit-shared-pw', label: 'Editable, view password saves', hint: 'One password unlocks view + save.' },
  { id: 'public', label: 'Public', hint: 'No password. Anyone with the link can view.' },
];

export function ShareDialog({ config, onClose }: Props): JSX.Element {
  const [preset, setPreset] = useState<ShareModePreset>('view-with-code');
  const [viewPassword, setViewPassword] = useState('');
  const [savePassword, setSavePassword] = useState('');
  const [ttl, setTtl] = useState<Ttl>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; expiresAt: number } | null>(null);

  const mode = modeFromPreset(preset);

  const needsViewPw = mode.assetsEncrypted;
  const needsSavePw = mode.editable && mode.saveKeyDistinct;

  function validate(): string | null {
    if (config.symbols.length === 0) return 'No symbols configured — add at least one in the Symbols tab.';
    if (needsViewPw && viewPassword.length < 6) return 'View password must be at least 6 characters.';
    if (needsSavePw && savePassword.length < 6) return 'Save password must be at least 6 characters.';
    return null;
  }

  async function handleCreate(): Promise<void> {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    setError(null);
    try {
      const { payload, analytics } = await buildPayloadFromConfig(config);

      // Mode 5: plaintext payload upload. Modes 1-4: seal the payload
      // under the view password.
      let envelope: ShareEnvelope | undefined;
      let payloadOnWire: typeof payload | undefined;
      if (mode.assetsEncrypted) {
        envelope = await sealEnvelope(viewPassword, JSON.stringify(payload));
      } else {
        payloadOnWire = payload;
      }

      // Save-key hash: required for editable modes. saveKeyDistinct=true
      // hashes the separate save password; false reuses the view password.
      let saveKeyHash: string | undefined;
      if (mode.editable) {
        const raw = mode.saveKeyDistinct ? savePassword : viewPassword;
        saveKeyHash = await hashSaveKey(raw);
      }

      const res = await createShare({
        mode,
        ttlDays: ttl,
        envelope: envelope ? { s: envelope.s, it: envelope.it, kwIv: envelope.kwIv, kw: envelope.kw, ctIv: envelope.ctIv, ct: envelope.ct } : undefined,
        payload: payloadOnWire ? { code: payloadOnWire.code, symbols: payloadOnWire.symbols, assets: payloadOnWire.assets } : undefined,
        saveKeyHash,
        analytics,
      });
      // Server returns a URL pointing at our docs site (viewer base);
      // we display it as-is for copying.
      setResult({ url: res.url, expiresAt: res.expiresAt });
    } catch (e) {
      const msg = e instanceof ShareApiError ? e.detail : (e as Error).message;
      setError(`Couldn't create share: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(): Promise<void> {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.url); } catch { /* noop */ }
  }

  // ── render ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Share2 size={14} /> Share this studio
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {result ? (
            <ResultBlock url={result.url} expiresAt={result.expiresAt} onCopy={copyUrl} />
          ) : (
            <>
              <FieldGroup label="Mode">
                <div className="space-y-1">
                  {PRESETS.map((p) => (
                    <label
                      key={p.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2',
                        preset === p.id && 'border-primary bg-primary/5',
                      )}
                    >
                      <input
                        type="radio"
                        name="preset"
                        className="mt-1"
                        checked={preset === p.id}
                        onChange={() => setPreset(p.id)}
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold">{p.label}</div>
                        <div className="text-[11px] text-muted-foreground">{p.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </FieldGroup>

              {needsViewPw && (
                <FieldGroup label="View password">
                  <input
                    type="password"
                    value={viewPassword}
                    onChange={(e) => setViewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </FieldGroup>
              )}

              {needsSavePw && (
                <FieldGroup label="Save password">
                  <input
                    type="password"
                    value={savePassword}
                    onChange={(e) => setSavePassword(e.target.value)}
                    placeholder="Must differ from view password"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </FieldGroup>
              )}

              <FieldGroup label="Expires after">
                <div className="flex gap-2">
                  {([3, 7, 30] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setTtl(days)}
                      className={cn(
                        'flex-1 rounded-md border border-border px-3 py-1.5 text-xs',
                        ttl === days
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'bg-background/40 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {days} days
                    </button>
                  ))}
                </div>
              </FieldGroup>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
              {busy ? 'Creating…' : 'Create share'}
            </button>
          </div>
        )}
      </div>
      {/* Reference SHARE_SCHEMA_VERSION so the import isn't dropped if the
          dialog later wants to read it for diagnostics. */}
      <span hidden>{SHARE_SCHEMA_VERSION}</span>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ResultBlock({
  url,
  expiresAt,
  onCopy,
}: {
  url: string;
  expiresAt: number;
  onCopy: () => void;
}): JSX.Element {
  const expires = new Date(expiresAt).toLocaleString();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
        <CheckCircle2 size={14} /> Share created
      </div>
      <div>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Share link
        </span>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Copy to clipboard"
            aria-label="Copy to clipboard"
          >
            <Copy size={12} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Expires {expires}.</p>
      </div>
    </div>
  );
}
