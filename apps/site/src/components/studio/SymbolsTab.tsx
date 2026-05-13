/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Film, Bone, Upload, X, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAsset, ingestFile } from '@/lib/studio/db.js';
import type {
  StudioConfig,
  SymbolConfig,
  SymbolType,
} from '@/lib/studio/types.js';
import { SpineForm } from './SpineForm.tsx';

interface Props {
  config: StudioConfig;
  onChange: (next: StudioConfig) => void;
}

export function SymbolsTab({ config, onChange }: Props): JSX.Element {
  const [adding, setAdding] = useState<SymbolType | null>(null);

  const usedIds = new Set(config.symbols.map((s) => s.id));

  function onSave(symbol: SymbolConfig): void {
    onChange({ ...config, symbols: [...config.symbols, symbol] });
    setAdding(null);
  }

  function onDelete(id: string): void {
    onChange({ ...config, symbols: config.symbols.filter((s) => s.id !== id) });
  }

  function onUpdate(next: SymbolConfig): void {
    onChange({
      ...config,
      symbols: config.symbols.map((s) => (s.id === next.id ? next : s)),
    });
  }

  return (
    <div className="flex h-[560px] flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Add-symbol controls */}
        {adding === null ? (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <TypeButton
              type="sprite"
              label="Sprite"
              icon={<ImageIcon size={14} />}
              hint="Single PNG"
              onClick={() => setAdding('sprite')}
            />
            <TypeButton
              type="animatedSprite"
              label="Animated"
              icon={<Film size={14} />}
              hint="PNG sheet"
              onClick={() => setAdding('animatedSprite')}
            />
            <TypeButton
              type="spine"
              label="Spine"
              icon={<Bone size={14} />}
              hint="Atlas + JSON + textures"
              onClick={() => setAdding('spine')}
            />
          </div>
        ) : adding === 'spine' ? (
          <SpineForm
            usedIds={usedIds}
            onCancel={() => setAdding(null)}
            onSave={onSave}
          />
        ) : (
          <AddSymbolForm
            type={adding}
            usedIds={usedIds}
            onCancel={() => setAdding(null)}
            onSave={onSave}
          />
        )}

        {/* Symbol list */}
        {config.symbols.length === 0 ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            No symbols yet. Pick a type above to upload your first one.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {config.symbols.map((symbol) => (
              <li key={symbol.id}>
                <SymbolRow
                  symbol={symbol}
                  onDelete={() => onDelete(symbol.id)}
                  onUpdate={onUpdate}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Type-picker button ───────────────────────────────────────────────

interface TypeButtonProps {
  type: SymbolType;
  label: string;
  icon: React.ReactNode;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}

function TypeButton({ label, icon, hint, onClick, disabled }: TypeButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg border border-border bg-background/50 p-3 text-xs transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-primary hover:bg-primary/5',
      )}
    >
      <div className="flex items-center gap-1.5 font-semibold">{icon}{label}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </button>
  );
}

// ── Add-symbol form ──────────────────────────────────────────────────

interface FormProps {
  type: SymbolType;
  usedIds: Set<string>;
  onCancel: () => void;
  onSave: (symbol: SymbolConfig) => void;
}

function AddSymbolForm({ type, usedIds, onCancel, onSave }: FormProps): JSX.Element {
  // Spine is dispatched at the call site (SymbolsTab) — this component
  // handles only sprite + animatedSprite.
  const [id, setId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [frameWidth, setFrameWidth] = useState(96);
  const [frameHeight, setFrameHeight] = useState(96);
  const [frameCount, setFrameCount] = useState(8);
  const [fps, setFps] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animated sprite: when a sheet is picked, peek its dimensions to suggest
  // a frame size. Users can override; this just saves them measuring.
  useEffect(() => {
    if (type !== 'animatedSprite' || !file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Heuristic: if width is a multiple of height, assume one row of
      // frameCount frames, where frameW = height (square cells). User can
      // override. If not, leave the user's last input alone.
      if (img.naturalWidth % img.naturalHeight === 0) {
        const count = img.naturalWidth / img.naturalHeight;
        setFrameWidth(img.naturalHeight);
        setFrameHeight(img.naturalHeight);
        setFrameCount(count);
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function validate(): string | null {
    const trimmed = id.trim();
    if (!trimmed) return 'Symbol id is required.';
    if (usedIds.has(trimmed)) return `Symbol id "${trimmed}" is already used.`;
    if (!file) return 'Pick a file to upload.';
    if (type === 'animatedSprite') {
      if (frameWidth <= 0 || frameHeight <= 0) return 'Frame dimensions must be positive.';
      if (frameCount <= 0) return 'Frame count must be positive.';
      if (fps <= 0) return 'FPS must be positive.';
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
      const hash = await ingestFile(file!);
      let symbol: SymbolConfig;
      if (type === 'sprite') {
        symbol = { type: 'sprite', id: trimmed, textureHash: hash };
      } else if (type === 'animatedSprite') {
        symbol = {
          type: 'animatedSprite',
          id: trimmed,
          sheetHash: hash,
          frameWidth,
          frameHeight,
          frameCount,
          fps,
        };
      } else {
        // Spine path is gated in the type picker; defensive only.
        throw new Error('Spine symbols are not yet supported.');
      }
      onSave(symbol);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = type === 'sprite' ? 'Sprite' : type === 'animatedSprite' ? 'Animated sprite' : 'Spine';
  const accept = type === 'sprite' ? 'image/png,image/webp,image/jpeg' : 'image/png,image/webp';

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold">Add a {typeLabel} symbol</div>
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
        <Field label="Symbol id" hint='e.g. "wild" — referenced as userSymbols.wild in your code.'>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="wild"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </Field>

        <Field label={type === 'sprite' ? 'Texture' : 'Sprite sheet'}>
          <FilePicker file={file} accept={accept} onPick={setFile} />
        </Field>

        {type === 'animatedSprite' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frame width">
              <NumberInput value={frameWidth} onChange={setFrameWidth} min={1} />
            </Field>
            <Field label="Frame height">
              <NumberInput value={frameHeight} onChange={setFrameHeight} min={1} />
            </Field>
            <Field label="Frame count">
              <NumberInput value={frameCount} onChange={setFrameCount} min={1} />
            </Field>
            <Field label="FPS">
              <NumberInput value={fps} onChange={setFps} min={1} max={120} />
            </Field>
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

// ── Form primitives ──────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}): JSX.Element {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      min={min}
      max={max}
      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
    />
  );
}

function FilePicker({
  file,
  accept,
  onPick,
}: {
  file: File | null;
  accept: string;
  onPick: (file: File | null) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:border-primary"
      >
        <Upload size={12} />
        {file ? 'Replace…' : 'Pick a file…'}
      </button>
      {file && (
        <span className="truncate text-xs text-muted-foreground" title={file.name}>
          {file.name} · {Math.ceil(file.size / 1024)} KB
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

// ── Per-symbol row ───────────────────────────────────────────────────

function SymbolRow({
  symbol,
  onDelete,
  onUpdate,
}: {
  symbol: SymbolConfig;
  onDelete: () => void;
  onUpdate: (next: SymbolConfig) => void;
}): JSX.Element {
  const previewHash =
    symbol.type === 'sprite'
      ? symbol.textureHash
      : symbol.type === 'animatedSprite'
        ? symbol.sheetHash
        : null;
  const blobThumb = useAssetPreview(previewHash);
  // Spine symbols carry their own pre-rendered PNG data URL captured at
  // save time. Other types load their first/only asset blob as the thumb.
  const thumb = symbol.type === 'spine' ? symbol.previewDataUrl ?? null : blobThumb;

  const meta =
    symbol.type === 'sprite'
      ? 'Sprite'
      : symbol.type === 'animatedSprite'
        ? `Animated · ${symbol.frameCount}f · ${symbol.frameWidth}×${symbol.frameHeight} · ${symbol.fps}fps`
        : (() => {
            const pageCount = Object.keys(symbol.textureHashes).length;
            const eventCount = Object.values(symbol.events).filter(Boolean).length;
            return `Spine · ${pageCount} page${pageCount === 1 ? '' : 's'} · ${eventCount}/5 events`;
          })();

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-2">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background/60">
        {thumb ? (
          <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />
        ) : symbol.type === 'spine' ? (
          <Bone size={14} className="text-muted-foreground/40" />
        ) : (
          <ImageIcon size={14} className="text-muted-foreground/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm font-semibold">{symbol.id}</div>
        <div className="truncate text-[11px] text-muted-foreground">{meta}</div>
      </div>
      <button
        type="button"
        onClick={() => onUpdate({ ...symbol, unmask: !symbol.unmask })}
        className={cn(
          'rounded px-2 py-0.5 text-[10px] font-mono transition-colors',
          symbol.unmask
            ? 'bg-primary/15 text-primary'
            : 'bg-muted/60 text-muted-foreground hover:bg-muted',
        )}
        title="When on, the symbol renders above the reel mask — animations can spill outside the cell. The builder auto-switches to a shared mask when any symbol is unmasked."
      >
        unmask {symbol.unmask ? 'on' : 'off'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Delete ${symbol.id}`}
        title={`Delete ${symbol.id}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function useAssetPreview(hash: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!hash) { setUrl(null); return; }
    let cancelled = false;
    let created: string | null = null;
    void getAsset(hash).then((asset) => {
      if (cancelled || !asset) return;
      created = URL.createObjectURL(asset.blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) {
        try { URL.revokeObjectURL(created); } catch { /* ignore */ }
      }
    };
  }, [hash]);
  return url;
}
