/**
 * Studio-side mirror of `apps/share-api/src/types.ts`. The two stay in
 * sync by convention — keep the JSON shape simple so drift is obvious
 * if it ever happens.
 *
 * See the server's types.ts for design notes on the five share modes
 * and what gets stored where.
 */

export const SHARE_SCHEMA_VERSION = 1 as const;

export interface ShareMode {
  assetsEncrypted: boolean;
  codeAccessible: boolean;
  editable: boolean;
  saveKeyDistinct: boolean;
}

export interface ShareAnalytics {
  totalAssetBytes: number;
  symbolCount: number;
  spineSymbolCount: number;
  studioVersion: string;
}

export interface ShareMeta {
  v: typeof SHARE_SCHEMA_VERSION;
  id: string;
  mode: ShareMode;
  createdAt: number;
  expiresAt: number;
}

export interface ShareEnvelope {
  v: typeof SHARE_SCHEMA_VERSION;
  s: string;
  it: number;
  kwIv: string;
  kw: string;
  ctIv: string;
  ct: string;
}

export interface SharePayloadSymbol {
  id: string;
  type: 'sprite' | 'animatedSprite' | 'spine';
  data: Record<string, unknown>;
}

export interface SharePayload {
  v: typeof SHARE_SCHEMA_VERSION;
  code: string;
  symbols: SharePayloadSymbol[];
  /** Asset blobs keyed by content hash (sha256 hex). Base64-encoded bytes. */
  assets: Record<string, string>;
}

// ── HTTP wire types ──────────────────────────────────────────────────

export interface CreateShareRequest {
  mode: ShareMode;
  ttlDays: 3 | 7 | 30;
  envelope?: Omit<ShareEnvelope, 'v'>;
  payload?: Omit<SharePayload, 'v'>;
  saveKeyHash?: string;
  analytics: ShareAnalytics;
}

export interface CreateShareResponse {
  id: string;
  url: string;
  expiresAt: number;
}

export interface UpdateShareRequest {
  saveKey: string;
  envelope: Omit<ShareEnvelope, 'v'>;
}

export interface GetShareResponse {
  meta: ShareMeta;
  envelope?: ShareEnvelope;
  payload?: SharePayload;
}

/** One of the five user-facing presets. UI picks one, code derives the flags. */
export type ShareModePreset =
  | 'view-no-code'           // 1
  | 'view-with-code'         // 2
  | 'edit-separate-save-pw'  // 3
  | 'edit-shared-pw'         // 4
  | 'public';                // 5

export function modeFromPreset(preset: ShareModePreset): ShareMode {
  switch (preset) {
    case 'view-no-code':
      return { assetsEncrypted: true, codeAccessible: false, editable: false, saveKeyDistinct: false };
    case 'view-with-code':
      return { assetsEncrypted: true, codeAccessible: true, editable: false, saveKeyDistinct: false };
    case 'edit-separate-save-pw':
      return { assetsEncrypted: true, codeAccessible: true, editable: true, saveKeyDistinct: true };
    case 'edit-shared-pw':
      return { assetsEncrypted: true, codeAccessible: true, editable: true, saveKeyDistinct: false };
    case 'public':
      return { assetsEncrypted: false, codeAccessible: true, editable: false, saveKeyDistinct: false };
  }
}
