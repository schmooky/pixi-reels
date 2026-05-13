/** @jsxImportSource react */
import { useEffect, useState } from 'react';
import { Upload, X, AlertCircle, Check, Circle } from 'lucide-react';
import { ingestFile } from '@/lib/studio/db.js';
import { parseAtlasTexturePages, parseSpineAnimations } from '@/lib/studio/spine.js';
import type { SpineSymbolConfig, SpineEvent } from '@/lib/studio/types.js';

interface Props {
  usedIds: Set<string>;
  onCancel: () => void;
  onSave: (symbol: SpineSymbolConfig) => void;
}

/**
 * Multi-file Spine symbol form. Three phases:
 *   1. Atlas + skeleton pick — parses each to extract texture filenames
 *      (from atlas) and animation names (from skeleton).
 *   2. Texture pages — user uploads PNG/WebP files. Files match against
 *      the atlas's expected filenames by name; missing pages stay flagged.
 *   3. Event mapping — five dropdowns (idle / spin / landing / win /
 *      destroy), populated from the skeleton's animations.
 */
export function SpineForm({ usedIds, onCancel, onSave }: Props): JSX.Element {
  const [id, setId] = useState('');
  const [skeletonFile, setSkeletonFile] = useState<File | null>(null);
  const [atlasFile, setAtlasFile] = useState<File | null>(null);
  /** filename (atlas-reference) → File */
  const [textureFiles, setTextureFiles] = useState<Record<string, File>>({});

  const [animations, setAnimations] = useState<string[]>([]);
  const [requiredTextures, setRequiredTextures] = useState<string[]>([]);
  const [events, setEvents] = useState<Partial<Record<SpineEvent, string>>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse skeleton on pick.
  useEffect(() => {
    if (!skeletonFile) { setAnimations([]); return; }
    let cancelled = false;
    void skeletonFile.text().then((text) => {
      if (cancelled) return;
      const names = parseSpineAnimations(text);
      setAnimations(names);
      // Auto-suggest event bindings when names look obvious.
      setEvents((prev) => ({
        idle: prev.idle ?? pickFirstMatch(names, ['idle', 'idle_loop', 'Idle']),
        spin: prev.spin ?? pickFirstMatch(names, ['blur', 'spin', 'spinning']),
        landing: prev.landing ?? pickFirstMatch(names, ['landing', 'land', 'bounce', 'stop']),
        win: prev.win ?? pickFirstMatch(names, ['win', 'win_big', 'win_loop', 'celebrate']),
        destroy: prev.destroy ?? pickFirstMatch(names, ['out', 'disintegration', 'vanish', 'destroy', 'exit']),
      }));
    });
    return () => { cancelled = true; };
  }, [skeletonFile]);

  // Parse atlas on pick.
  useEffect(() => {
    if (!atlasFile) { setRequiredTextures([]); return; }
    let cancelled = false;
    void atlasFile.text().then((text) => {
      if (cancelled) return;
      setRequiredTextures(parseAtlasTexturePages(text));
    });
    return () => { cancelled = true; };
  }, [atlasFile]);

  function ingestTextures(files: FileList | File[]): void {
    setTextureFiles((prev) => {
      const next = { ...prev };
      for (const f of Array.from(files)) {
        next[f.name] = f;
      }
      return next;
    });
  }

  function validate(): string | null {
    const trimmed = id.trim();
    if (!trimmed) return 'Symbol id is required.';
    if (usedIds.has(trimmed)) return `Symbol id "${trimmed}" is already used.`;
    if (!skeletonFile) return 'Pick the skeleton (.json).';
    if (!atlasFile) return 'Pick the atlas (.atlas).';
    if (requiredTextures.length === 0) return 'Atlas has no texture pages — is the file valid?';
    for (const t of requiredTextures) {
      if (!textureFiles[t]) return `Missing texture page "${t}". Upload it under that exact filename.`;
    }
    return null;
  }

  async function handleSave(): Promise<void> {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    setError(null);
    try {
      const trimmed = id.trim();
      const skeletonHash = await ingestFile(skeletonFile!);
      const atlasHash = await ingestFile(atlasFile!);
      const textureHashes: Record<string, string> = {};
      for (const filename of requiredTextures) {
        textureHashes[filename] = await ingestFile(textureFiles[filename]);
      }
      onSave({
        type: 'spine',
        id: trimmed,
        skeletonHash,
        atlasHash,
        textureHashes,
        events: pruneEmptyValues(events),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold">Add a Spine symbol</div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Symbol id
          </span>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="wild"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            e.g. "wild" — referenced as <code className="rounded bg-muted px-1">userSymbols.wild</code> in your code.
          </span>
        </label>

        <FilePickField
          label="Skeleton (.json)"
          file={skeletonFile}
          accept=".json,application/json"
          onPick={setSkeletonFile}
          hint={animations.length > 0
            ? `${animations.length} animation${animations.length === 1 ? '' : 's'}: ${animations.join(', ')}`
            : skeletonFile
              ? 'Parsed 0 animations — is this a valid skeleton JSON?'
              : undefined}
        />

        <FilePickField
          label="Atlas (.atlas)"
          file={atlasFile}
          accept=".atlas,text/plain,application/octet-stream"
          onPick={setAtlasFile}
          hint={requiredTextures.length > 0
            ? `${requiredTextures.length} texture page${requiredTextures.length === 1 ? '' : 's'} required: ${requiredTextures.join(', ')}`
            : atlasFile
              ? 'No texture pages detected — is this a valid atlas?'
              : undefined}
        />

        {requiredTextures.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Texture pages
              </span>
              <MultiPick onPick={ingestTextures} />
            </div>
            <ul className="space-y-1 rounded-md border border-border/60 bg-background/40 p-2">
              {requiredTextures.map((filename) => {
                const file = textureFiles[filename];
                return (
                  <li key={filename} className="flex items-center gap-2 text-xs">
                    {file
                      ? <Check size={12} className="flex-shrink-0 text-emerald-500" />
                      : <Circle size={12} className="flex-shrink-0 text-muted-foreground/40" />}
                    <span className="font-mono">{filename}</span>
                    {file && (
                      <span className="ml-auto text-muted-foreground">
                        {Math.ceil(file.size / 1024)} KB
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {animations.length > 0 && (
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Animation events
            </span>
            <div className="space-y-1.5 rounded-md border border-border/60 bg-background/40 p-2">
              {(['idle', 'spin', 'landing', 'win', 'destroy'] as const).map((evt) => (
                <label key={evt} className="flex items-center gap-2 text-xs">
                  <span className="w-16 font-mono text-muted-foreground">{evt}</span>
                  <select
                    value={events[evt] ?? ''}
                    onChange={(e) => setEvents((p) => ({ ...p, [evt]: e.target.value || undefined }))}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                  >
                    <option value="">(none)</option>
                    {animations.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              "spin" maps to the engine's <code className="rounded bg-muted px-1">blur</code> slot; "destroy" maps to <code className="rounded bg-muted px-1">out</code>. Pick "(none)" to leave a slot unbound.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add symbol'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function pickFirstMatch(haystack: string[], candidates: string[]): string | undefined {
  for (const c of candidates) if (haystack.includes(c)) return c;
  return undefined;
}

function pruneEmptyValues<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out as Partial<T>;
}

function FilePickField({
  label,
  file,
  accept,
  onPick,
  hint,
}: {
  label: string;
  file: File | null;
  accept: string;
  onPick: (file: File | null) => void;
  hint?: string;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="relative inline-flex">
          <input
            type="file"
            accept={accept}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:border-primary">
            <Upload size={12} />
            {file ? 'Replace…' : 'Pick a file…'}
          </span>
        </span>
        {file && (
          <span className="truncate text-xs text-muted-foreground" title={file.name}>
            {file.name} · {Math.ceil(file.size / 1024)} KB
          </span>
        )}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function MultiPick({ onPick }: { onPick: (files: FileList) => void }): JSX.Element {
  return (
    <span className="relative inline-flex">
      <input
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple
        onChange={(e) => { if (e.target.files?.length) onPick(e.target.files); }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:border-primary">
        <Upload size={10} />
        Pick textures…
      </span>
    </span>
  );
}
