/**
 * Business logic for share creation, mode validation, and save-key
 * verification. Crypto is the bare minimum (PBKDF2-SHA256 with the
 * same 210k iters spine-benchmark uses) so a single client helper
 * works across both apps.
 */

import { customAlphabet } from 'nanoid';
import { pbkdf2, timingSafeEqual } from 'node:crypto';
import type {
  ShareAnalytics,
  ShareEnvelope,
  ShareMeta,
  ShareMode,
  SharePayload,
} from './types.js';
import { SHARE_SCHEMA_VERSION } from './types.js';

// 12-char alphanumeric ids — same shape as spine-benchmark. A share
// link `/share/<id>` is short enough to paste and long enough to
// enumerate-resist (36^12 ~= 4.7e18).
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEY_LEN = 32;

export const ALLOWED_TTL_DAYS: readonly number[] = [3, 7, 30];

export function newShareId(): string {
  return nanoid();
}

export function clampTtlDays(input: number): 3 | 7 | 30 {
  if (input === 3 || input === 7 || input === 30) return input;
  // Forgiving rounding — keeps the public API tolerant of clients
  // that compute a TTL and pick the nearest allowed value.
  if (input <= 5) return 3;
  if (input <= 18) return 7;
  return 30;
}

export function buildMeta(opts: {
  id: string;
  mode: ShareMode;
  ttlDays: 3 | 7 | 30;
  saveKeyHash?: string;
  analytics: ShareAnalytics;
}): ShareMeta {
  const now = Date.now();
  return {
    v: SHARE_SCHEMA_VERSION,
    id: opts.id,
    mode: opts.mode,
    createdAt: now,
    expiresAt: now + opts.ttlDays * 24 * 60 * 60 * 1000,
    saveKeyHash: opts.saveKeyHash,
    analytics: opts.analytics,
  };
}

/**
 * Validate that the body's mode flags line up with what was uploaded.
 * Catches inconsistencies (envelope present on a public share, no save
 * key on an editable share, etc.) before they hit storage.
 */
export function assertModeConsistency(
  mode: ShareMode,
  data: {
    envelope?: ShareEnvelope;
    payload?: SharePayload;
    saveKeyHash?: string;
  },
): void {
  // Exactly one of envelope/payload per mode.assetsEncrypted.
  if (mode.assetsEncrypted) {
    if (!data.envelope) throw new BadRequestError('mode.assetsEncrypted is true but no envelope was provided');
    if (data.payload) throw new BadRequestError('mode.assetsEncrypted is true but a plaintext payload was provided');
  } else {
    if (!data.payload) throw new BadRequestError('mode.assetsEncrypted is false but no plaintext payload was provided');
    if (data.envelope) throw new BadRequestError('mode.assetsEncrypted is false but an envelope was provided');
    // Mode 5 (the only !assetsEncrypted mode) is never editable.
    if (mode.editable) throw new BadRequestError('public shares (assetsEncrypted=false) cannot be editable');
  }
  // saveKeyHash gates editability.
  if (mode.editable && !data.saveKeyHash) {
    throw new BadRequestError('mode.editable is true but saveKeyHash is missing');
  }
  if (!mode.editable && data.saveKeyHash) {
    throw new BadRequestError('mode.editable is false but a saveKeyHash was provided');
  }
}

/**
 * Verify a raw save key against the stored PBKDF2 hash. Constant-time
 * compare to keep the wall-clock cost of a wrong guess independent of
 * the prefix of correctness.
 *
 * `saveKeyHash` format: `base64(salt):base64(hash)`. Salt is fresh per
 * share, generated client-side at create time.
 */
export async function verifySaveKey(
  rawSaveKey: string,
  saveKeyHash: string,
): Promise<boolean> {
  const [saltB64, hashB64] = saveKeyHash.split(':');
  if (!saltB64 || !hashB64) return false;
  let salt: Buffer;
  let stored: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    stored = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  const derived = await new Promise<Buffer>((resolve, reject) => {
    pbkdf2(rawSaveKey, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, 'sha256', (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

export class BadRequestError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequest';
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFound';
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = 'Unauthorized';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'Forbidden';
  }
}
