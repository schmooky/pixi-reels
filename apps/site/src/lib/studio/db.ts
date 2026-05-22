/**
 * IndexedDB layer for the studio.
 *
 * Two stores: `config` (single row at key='current') and `assets`
 * (content-addressed by SHA-256). Wrapping `idb` would be overkill for two
 * stores. the raw IDB API is fine here.
 */

import type { StudioConfig, StoredAsset } from './types.js';
import { STUDIO_CONFIG_KEY, EMPTY_STUDIO_CONFIG } from './types.js';

const DB_NAME = 'pixi-reels-studio';
const DB_VERSION = 1;
const CONFIG_STORE = 'config';
const ASSETS_STORE = 'assets';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'hash' });
      }
    };
  });
}

function txPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadConfig(): Promise<StudioConfig> {
  const db = await openDB();
  try {
    const tx = db.transaction(CONFIG_STORE, 'readonly');
    const record = await txPromise(tx.objectStore(CONFIG_STORE).get(STUDIO_CONFIG_KEY));
    if (!record) return { ...EMPTY_STUDIO_CONFIG };
    // Stored shape: { id: 'current', ...StudioConfig }
    const { id: _id, ...rest } = record as { id: string } & StudioConfig;
    return { ...EMPTY_STUDIO_CONFIG, ...rest };
  } finally {
    db.close();
  }
}

export async function saveConfig(config: StudioConfig): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(CONFIG_STORE, 'readwrite');
    await txPromise(tx.objectStore(CONFIG_STORE).put({ id: STUDIO_CONFIG_KEY, ...config }));
    await txComplete(tx);
  } finally {
    db.close();
  }
}

export async function getAsset(hash: string): Promise<StoredAsset | null> {
  const db = await openDB();
  try {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const record = await txPromise(tx.objectStore(ASSETS_STORE).get(hash));
    return (record as StoredAsset) ?? null;
  } finally {
    db.close();
  }
}

export async function putAsset(asset: StoredAsset): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    await txPromise(tx.objectStore(ASSETS_STORE).put(asset));
    await txComplete(tx);
  } finally {
    db.close();
  }
}

export async function listAssets(): Promise<StoredAsset[]> {
  const db = await openDB();
  try {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const records = await txPromise(tx.objectStore(ASSETS_STORE).getAll());
    return records as StoredAsset[];
  } finally {
    db.close();
  }
}

export async function deleteAsset(hash: string): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    await txPromise(tx.objectStore(ASSETS_STORE).delete(hash));
    await txComplete(tx);
  } finally {
    db.close();
  }
}

export async function clearAll(): Promise<void> {
  const db = await openDB();
  try {
    const tx = db.transaction([CONFIG_STORE, ASSETS_STORE], 'readwrite');
    await txPromise(tx.objectStore(CONFIG_STORE).clear());
    await txPromise(tx.objectStore(ASSETS_STORE).clear());
    await txComplete(tx);
  } finally {
    db.close();
  }
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

/**
 * Compute SHA-256 hex of a blob's bytes. The studio uses this as the
 * canonical asset id. same bytes deduplicate, regardless of filename.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** Convenience: ingest a File, store it if new, return its hash. */
export async function ingestFile(file: File): Promise<string> {
  const hash = await sha256Hex(file);
  const existing = await getAsset(hash);
  if (existing) return hash;
  await putAsset({
    hash,
    blob: file,
    mime: file.type || 'application/octet-stream',
    name: file.name,
    size: file.size,
    createdAt: Date.now(),
  });
  return hash;
}
