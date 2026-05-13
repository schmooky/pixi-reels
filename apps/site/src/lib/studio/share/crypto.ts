/**
 * Client-side crypto for studio shares.
 *
 * PBKDF2-SHA256 (210,000 iterations) → AES-256-GCM, same parameters
 * spine-benchmark uses. Two roles:
 *
 *   1. Wrap a fresh DEK with the password-derived key, encrypt content
 *      with the DEK. Two-key design lets us re-key later without
 *      re-encrypting content (not used today; future-proofing).
 *
 *   2. Hash a save key with PBKDF2 + a separate salt for the server to
 *      verify on PUT. Server never sees the raw save key.
 *
 * All multi-byte values are base64 on the wire. Uses SubtleCrypto only —
 * no extra deps.
 */

import type { ShareEnvelope } from './types.js';
import { SHARE_SCHEMA_VERSION } from './types.js';

const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_LEN_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12; // GCM standard

// ── base64 helpers ───────────────────────────────────────────────────

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

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ── key derivation ───────────────────────────────────────────────────

async function deriveWrapKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const pwKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    pwKey,
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  );
}

async function newDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    true /* extractable for wrapKey */,
    ['encrypt', 'decrypt'],
  );
}

// ── envelope encode / decode ─────────────────────────────────────────

/** Encrypt arbitrary string content under `password`. */
export async function sealEnvelope(password: string, plaintext: string): Promise<ShareEnvelope> {
  const salt = randomBytes(SALT_BYTES);
  const kwIv = randomBytes(IV_BYTES);
  const ctIv = randomBytes(IV_BYTES);

  const wrapKey = await deriveWrapKey(password, salt);
  const dek = await newDek();

  // Wrap the DEK under the password-derived key. wrapKey returns raw
  // AES-GCM ciphertext+tag of the exported DEK material.
  const wrapped = await crypto.subtle.wrapKey('raw', dek, wrapKey, {
    name: 'AES-GCM',
    iv: kwIv,
  });

  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ctIv },
    dek,
    new TextEncoder().encode(plaintext),
  );

  return {
    v: SHARE_SCHEMA_VERSION,
    s: bytesToB64(salt),
    it: PBKDF2_ITERATIONS,
    kwIv: bytesToB64(kwIv),
    kw: bytesToB64(new Uint8Array(wrapped)),
    ctIv: bytesToB64(ctIv),
    ct: bytesToB64(new Uint8Array(ctBuf)),
  };
}

/** Reverse of sealEnvelope. Throws on bad password (or tampered ct). */
export async function openEnvelope(password: string, env: ShareEnvelope): Promise<string> {
  const salt = b64ToBytes(env.s);
  const kwIv = b64ToBytes(env.kwIv);
  const ctIv = b64ToBytes(env.ctIv);
  const wrapped = b64ToBytes(env.kw);
  const ct = b64ToBytes(env.ct);

  const wrapKey = await deriveWrapKey(password, salt);
  let dek: CryptoKey;
  try {
    dek = await crypto.subtle.unwrapKey(
      'raw',
      wrapped,
      wrapKey,
      { name: 'AES-GCM', iv: kwIv },
      { name: 'AES-GCM', length: KEY_LEN_BITS },
      false,
      ['decrypt'],
    );
  } catch {
    throw new Error('Wrong password (or envelope tampered with)');
  }

  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ctIv }, dek, ct);
  return new TextDecoder().decode(ptBuf);
}

// ── save-key hashing (verified server-side on PUT) ───────────────────

/**
 * Produce a `base64(salt):base64(pbkdf2Hash)` string the server stores
 * and compares against on PUT /api/studios/:id. Salt is fresh per share.
 */
export async function hashSaveKey(saveKey: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2Raw(saveKey, salt, PBKDF2_ITERATIONS, 32);
  return `${bytesToB64(salt)}:${bytesToB64(hash)}`;
}

async function pbkdf2Raw(
  password: string,
  salt: Uint8Array,
  iterations: number,
  byteLen: number,
): Promise<Uint8Array> {
  const pwKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    pwKey,
    byteLen * 8,
  );
  return new Uint8Array(bits);
}
