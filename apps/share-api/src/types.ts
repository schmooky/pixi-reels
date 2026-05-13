/**
 * Wire-format types shared between share-api and the studio client.
 *
 * The studio in `apps/site` duplicates these (see
 * `apps/site/src/lib/studio/share/types.ts`) — the two stay in sync by
 * convention because the share-api's tsconfig doesn't reach into the
 * site app. JSON shape is intentionally simple so drift is obvious.
 */

/** Schema version. Bump if the wire shape changes incompatibly. */
export const SHARE_SCHEMA_VERSION = 1 as const;

/**
 * Five user-facing modes collapse onto four flags:
 *
 *   1. view, no code, password           assetsEncrypted=true, codeAccessible=false, editable=false
 *   2. view, code, password              assetsEncrypted=true, codeAccessible=true,  editable=false
 *   3. edit, separate save password      assetsEncrypted=true, codeAccessible=true,  editable=true,  saveKeyDistinct=true
 *   4. edit, view password saves too     assetsEncrypted=true, codeAccessible=true,  editable=true,  saveKeyDistinct=false
 *   5. public                            assetsEncrypted=false, codeAccessible=true, editable=false
 *
 * `codeAccessible` is a *display* flag (whether the viewer shows the
 * Code tab after decrypt), not a storage flag — server stores the code
 * inside the encrypted envelope regardless. Only mode 5 stores the code
 * in plaintext (in `SharePayload`).
 */
export interface ShareMode {
  assetsEncrypted: boolean;
  codeAccessible: boolean;
  editable: boolean;
  /**
   * Meaningful only when `editable` is true. true = save password is a
   * separate secret from the view password; false = the same secret
   * unlocks both view and save.
   */
  saveKeyDistinct: boolean;
}

/**
 * Plaintext metadata, returned on every GET. The save-key hash and the
 * analytics block stay server-side — viewers never see them.
 */
export interface ShareMeta {
  v: typeof SHARE_SCHEMA_VERSION;
  id: string;
  mode: ShareMode;
  createdAt: number;
  expiresAt: number;
  /**
   * Present only on editable modes. PBKDF2-SHA256 hash of the save key,
   * format `base64(salt):base64(hash)`. Salt is fresh per share.
   */
  saveKeyHash?: string;
  /**
   * Operator analytics — counts and sizes the operator can aggregate
   * without decrypting anything. Stripped from GET responses.
   */
  analytics: ShareAnalytics;
}

export interface ShareAnalytics {
  totalAssetBytes: number;
  symbolCount: number;
  spineSymbolCount: number;
  /** Studio version string (from pixi-reels package.json). */
  studioVersion: string;
}

/**
 * Opaque ciphertext for modes 1-4. The decrypted plaintext is a
 * `SharePayload`. Envelope shape matches spine-benchmark's so the same
 * client crypto helpers work for both apps:
 *
 *   PBKDF2-SHA256, 210,000 iterations → AES-256-GCM
 *
 * All byte fields are base64 on the wire.
 */
export interface ShareEnvelope {
  v: typeof SHARE_SCHEMA_VERSION;
  s: string;
  it: number;
  kwIv: string;
  kw: string;
  ctIv: string;
  ct: string;
}

/**
 * Plaintext payload for mode 5 (public), or the *decrypted* contents
 * of the envelope for modes 1-4. The two paths converge here in the
 * client — once you have a `SharePayload`, you have the studio config.
 */
export interface SharePayload {
  v: typeof SHARE_SCHEMA_VERSION;
  code: string;
  symbols: SharePayloadSymbol[];
  /**
   * Asset blobs keyed by content hash (sha256 hex, same convention as
   * the studio's IndexedDB). Each value is base64 of the raw bytes.
   * Bundled into a single object for transport simplicity — at the v1
   * scale (a few spine bundles per share) this is well under any
   * useful cap. Refactor to per-asset S3 objects when shares routinely
   * exceed ~20 MB.
   */
  assets: Record<string, string>;
}

export interface SharePayloadSymbol {
  id: string;
  type: 'sprite' | 'animatedSprite' | 'spine';
  /** Type-specific config; structure matches the studio's SymbolConfig. */
  data: Record<string, unknown>;
}

// ── HTTP wire types ──────────────────────────────────────────────────

export interface CreateShareRequest {
  mode: ShareMode;
  /** TTL in days. Server clamps to allowed set (3 | 7 | 30). */
  ttlDays: 3 | 7 | 30;
  /** Required for modes 1-4 (`mode.assetsEncrypted=true`). */
  envelope?: Omit<ShareEnvelope, 'v'>;
  /** Required for mode 5 (`mode.assetsEncrypted=false`). */
  payload?: Omit<SharePayload, 'v'>;
  /** Required when `mode.editable` is true. PBKDF2 hash, format above. */
  saveKeyHash?: string;
  analytics: ShareAnalytics;
}

export interface CreateShareResponse {
  id: string;
  /** Viewer URL — points at the docs site, not the share-api host. */
  url: string;
  expiresAt: number;
}

export interface UpdateShareRequest {
  /** Required — server verifies via PBKDF2 + constant-time compare. */
  saveKey: string;
  envelope: Omit<ShareEnvelope, 'v'>;
}

export interface GetShareResponse {
  meta: Omit<ShareMeta, 'saveKeyHash' | 'analytics'>;
  /** Present on modes 1-4. */
  envelope?: ShareEnvelope;
  /** Present on mode 5. */
  payload?: SharePayload;
}
