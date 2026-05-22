/**
 * Convert between the studio's local representation (StudioConfig +
 * IndexedDB asset blobs) and the wire-format SharePayload (code +
 * symbols + base64-encoded asset bytes).
 */

import type { StudioConfig, StoredAsset, SymbolConfig } from '../types.js';
import { getAsset, sha256Hex } from '../db.js';
import type { ShareAnalytics, SharePayload, SharePayloadSymbol } from './types.js';
import { SHARE_SCHEMA_VERSION } from './types.js';

// ── encode (studio -> wire) ──────────────────────────────────────────

/** Collect every asset hash referenced by the symbols in a config. */
export function collectAssetHashes(symbols: SymbolConfig[]): string[] {
  const hashes = new Set<string>();
  for (const s of symbols) {
    if (s.type === 'sprite') {
      hashes.add(s.textureHash);
    } else if (s.type === 'animatedSprite') {
      hashes.add(s.sheetHash);
    } else if (s.type === 'spine') {
      hashes.add(s.skeletonHash);
      hashes.add(s.atlasHash);
      for (const h of Object.values(s.textureHashes)) hashes.add(h);
    }
  }
  return Array.from(hashes);
}

/**
 * Build a SharePayload from the studio's local config. Pulls each
 * referenced asset out of IndexedDB and base64-encodes its bytes.
 * Throws if any referenced blob is missing.
 */
export async function buildPayloadFromConfig(config: StudioConfig): Promise<{
  payload: SharePayload;
  analytics: ShareAnalytics;
}> {
  const hashes = collectAssetHashes(config.symbols);
  const assets: Record<string, string> = {};
  let totalBytes = 0;
  for (const hash of hashes) {
    const asset = await getAsset(hash);
    if (!asset) throw new Error(`Asset ${hash} not found in IndexedDB`);
    const buf = new Uint8Array(await asset.blob.arrayBuffer());
    assets[hash] = bytesToB64(buf);
    totalBytes += buf.byteLength;
  }

  const symbols: SharePayloadSymbol[] = config.symbols.map((s) => ({
    id: s.id,
    type: s.type,
    data: s as unknown as Record<string, unknown>,
  }));

  const payload: SharePayload = {
    v: SHARE_SCHEMA_VERSION,
    code: config.code,
    symbols,
    assets,
  };

  const analytics: ShareAnalytics = {
    totalAssetBytes: totalBytes,
    symbolCount: config.symbols.length,
    spineSymbolCount: config.symbols.filter((s) => s.type === 'spine').length,
    studioVersion: STUDIO_VERSION,
  };

  return { payload, analytics };
}

// ── decode (wire -> studio) ──────────────────────────────────────────

export interface DecodedShare {
  config: StudioConfig;
  /** In-memory asset map for the viewer. fed to applyStudioConfig
   *  via the injected getAsset. Not written to the user's IndexedDB. */
  assets: Map<string, StoredAsset>;
}

/**
 * Decode a SharePayload into a config + in-memory asset map. The viewer
 * uses this to run the studio against shared content without touching
 * the visitor's local IndexedDB.
 */
export async function decodePayload(payload: SharePayload): Promise<DecodedShare> {
  const assets = new Map<string, StoredAsset>();
  for (const [hash, b64] of Object.entries(payload.assets)) {
    const bytes = b64ToBytes(b64);
    const blob = new Blob([new Uint8Array(bytes)]);
    // The studio's StoredAsset shape needs more than just the bytes.
    // mime hints, original filename, size. Reconstruct sensibly.
    assets.set(hash, {
      hash,
      blob,
      mime: 'application/octet-stream',
      name: `share-asset-${hash.slice(0, 8)}`,
      size: bytes.byteLength,
      createdAt: Date.now(),
    });
  }

  // SymbolConfig union. we stored the raw object in `.data`. Cast
  // back; runtime shape is identical to what the studio writes.
  const symbols = payload.symbols.map((s) => s.data as unknown as SymbolConfig);

  return {
    config: { code: payload.code, symbols },
    assets,
  };
}

/**
 * Compute sha256 of every asset blob we received and verify it matches
 * the key it was stored under. Cheap guard against a tampered payload
 * that swapped an asset out.
 */
export async function verifyPayloadHashes(payload: SharePayload): Promise<void> {
  for (const [hash, b64] of Object.entries(payload.assets)) {
    const bytes = b64ToBytes(b64);
    const blob = new Blob([new Uint8Array(bytes)]);
    const actual = await sha256Hex(blob);
    if (actual !== hash) {
      throw new Error(`Share asset hash mismatch (expected ${hash}, got ${actual})`);
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────

const STUDIO_VERSION = '0.4.0';

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
