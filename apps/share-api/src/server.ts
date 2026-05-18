/**
 * pixi-reels Studio share relay.
 *
 * Express 5 over a swap-in storage adapter. The API never serves HTML
 * and never sees plaintext envelopes — modes 1-4 are pre-encrypted
 * client-side and stored opaquely; mode 5 ships a plaintext payload
 * and accepts that the bytes match the intent.
 *
 * Viewer lives on the docs site at `/share/<id>` — the API only bakes
 * that URL into the CreateShareResponse.
 */

import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { loadConfig } from './config.js';
import {
  ALLOWED_TTL_DAYS,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  assertModeConsistency,
  buildMeta,
  clampTtlDays,
  newShareId,
  verifySaveKey,
} from './shares.js';
import { InMemoryShareStorage, type ShareStorage } from './storage.js';
import { S3ShareStorage } from './storage-s3.js';
import type {
  CreateShareRequest,
  CreateShareResponse,
  GetShareResponse,
  ShareEnvelope,
  SharePayload,
  UpdateShareRequest,
} from './types.js';
import { SHARE_SCHEMA_VERSION } from './types.js';

// ── input validation ─────────────────────────────────────────────────

const ShareModeSchema = z.object({
  assetsEncrypted: z.boolean(),
  codeAccessible: z.boolean(),
  editable: z.boolean(),
  saveKeyDistinct: z.boolean(),
});

const ShareEnvelopeSchema = z.object({
  s: z.string().min(1),
  it: z.number().int().positive(),
  kwIv: z.string().min(1),
  kw: z.string().min(1),
  ctIv: z.string().min(1),
  ct: z.string().min(1),
});

const SharePayloadSymbolSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['sprite', 'animatedSprite', 'spine']),
  data: z.record(z.string(), z.unknown()),
});

const SharePayloadSchema = z.object({
  code: z.string(),
  symbols: z.array(SharePayloadSymbolSchema),
  assets: z.record(z.string(), z.string()),
});

const AnalyticsSchema = z.object({
  totalAssetBytes: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  spineSymbolCount: z.number().int().nonnegative(),
  studioVersion: z.string().max(32),
});

const CreateBodySchema = z.object({
  mode: ShareModeSchema,
  ttlDays: z.number().int().refine((n) => ALLOWED_TTL_DAYS.includes(n), {
    message: 'ttlDays must be one of 3, 7, 30',
  }),
  envelope: ShareEnvelopeSchema.optional(),
  payload: SharePayloadSchema.optional(),
  saveKeyHash: z.string().optional(),
  analytics: AnalyticsSchema,
});

const UpdateBodySchema = z.object({
  saveKey: z.string().min(1),
  envelope: ShareEnvelopeSchema,
});

// ── app boot ──────────────────────────────────────────────────────────

const config = loadConfig();

function buildStorage(): ShareStorage {
  if (config.storage === 'memory') return new InMemoryShareStorage();
  // STORAGE=s3 — require the bucket + credentials. Fail loud at boot
  // so a misconfigured deploy doesn't silently drop writes.
  if (!config.s3.bucket) throw new Error('STORAGE=s3 requires S3_BUCKET');
  if (!config.s3.accessKeyId || !config.s3.secretAccessKey) {
    throw new Error('STORAGE=s3 requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
  }
  return new S3ShareStorage(config.s3);
}
const storage: ShareStorage = buildStorage();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '60mb' }));
app.use(
  cors({
    // Literal '*' (not `true`) when wildcard, so the response sends
    // `Access-Control-Allow-Origin: *` instead of reflecting whatever
    // Origin the request carried. No credentials/cookies are in play,
    // so `*` is the correct anonymous-API posture.
    origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }),
);

const createLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.createRateLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit', detail: 'too many shares created from this IP' },
});

// Brute-force guard for the save-key-authenticated endpoints (PUT,
// DELETE) and the bearer-gated cleanup. A real attacker would burn
// through 30 attempts/min per IP at most before getting throttled.
const authedLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit', detail: 'too many authenticated requests from this IP' },
});

/**
 * Parse `Authorization: Bearer <token>`. Avoids a regex with
 * overlapping `\s+` / `.+` ranges (ReDoS on adversarial whitespace);
 * a fixed-prefix string check is both faster and CodeQL-clean.
 * Returns `null` when the header is absent or malformed.
 */
function parseBearer(auth: string | undefined): string | null {
  if (!auth) return null;
  if (auth.length < 8) return null;
  if (auth.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Hash-style viewer URL so the docs site's static `/share/` page can
 * resolve the id client-side (`location.hash`) — no host rewrites
 * required. Path-style support is possible with a `_redirects`
 * (Netlify/CF) or `vercel.json` rewrite; see DEPLOY.md.
 */
function viewerUrlFor(id: string): string {
  return `${config.viewerBaseUrl.replace(/\/$/, '')}/share/#${id}`;
}

// ── routes ────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    schemaVersion: SHARE_SCHEMA_VERSION,
    storage: config.storage,
  });
});

app.post('/api/studios', createLimiter, async (req, res, next) => {
  try {
    const parsed = CreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`invalid body: ${parsed.error.message}`);
    }
    const body: CreateShareRequest = parsed.data as CreateShareRequest;

    assertModeConsistency(body.mode, {
      envelope: body.envelope ? { v: SHARE_SCHEMA_VERSION, ...body.envelope } : undefined,
      payload: body.payload ? { v: SHARE_SCHEMA_VERSION, ...body.payload } : undefined,
      saveKeyHash: body.saveKeyHash,
    });

    const id = newShareId();
    const ttlDays = clampTtlDays(body.ttlDays);
    const meta = buildMeta({
      id,
      mode: body.mode,
      ttlDays,
      saveKeyHash: body.saveKeyHash,
      analytics: body.analytics,
    });
    const envelope: ShareEnvelope | undefined = body.envelope
      ? { v: SHARE_SCHEMA_VERSION, ...body.envelope }
      : undefined;
    const payload: SharePayload | undefined = body.payload
      ? { v: SHARE_SCHEMA_VERSION, ...body.payload }
      : undefined;

    await storage.put({ meta, envelope, payload });

    const response: CreateShareResponse = {
      id,
      url: viewerUrlFor(id),
      expiresAt: meta.expiresAt,
    };
    res.status(201).json(response);
  } catch (e) {
    next(e);
  }
});

app.get('/api/studios/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '');
    const record = await storage.get(id);
    if (!record) throw new NotFoundError('share not found');
    if (record.meta.expiresAt <= Date.now()) throw new NotFoundError('share expired');

    // Strip server-only fields. `saveKeyHash` is a brute-force gift if
    // leaked; `analytics` is operator-private.
    const safeMeta: GetShareResponse['meta'] = {
      v: record.meta.v,
      id: record.meta.id,
      mode: record.meta.mode,
      createdAt: record.meta.createdAt,
      expiresAt: record.meta.expiresAt,
    };
    const body: GetShareResponse = {
      meta: safeMeta,
      envelope: record.envelope,
      payload: record.payload,
    };
    res.json(body);
  } catch (e) {
    next(e);
  }
});

app.put('/api/studios/:id', authedLimiter, async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '');
    const parsed = UpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`invalid body: ${parsed.error.message}`);
    }
    const body: UpdateShareRequest = parsed.data;
    const record = await storage.get(id);
    if (!record) throw new NotFoundError('share not found');
    if (record.meta.expiresAt <= Date.now()) throw new NotFoundError('share expired');
    if (!record.meta.mode.editable) throw new ForbiddenError('share is not editable');
    if (!record.meta.saveKeyHash) {
      // Defence-in-depth — editable shares always carry a hash by
      // construction (assertModeConsistency).
      throw new ForbiddenError('share has no save key configured');
    }
    const ok = await verifySaveKey(body.saveKey, record.meta.saveKeyHash);
    if (!ok) throw new UnauthorizedError('invalid save key');

    const envelope: ShareEnvelope = { v: SHARE_SCHEMA_VERSION, ...body.envelope };
    await storage.updateEnvelope(id, envelope);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/studios/:id', authedLimiter, async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '');
    const record = await storage.get(id);
    if (!record) throw new NotFoundError('share not found');
    if (!record.meta.mode.editable) throw new ForbiddenError('share is not editable');
    if (!record.meta.saveKeyHash) throw new ForbiddenError('share has no save key configured');

    const token = parseBearer(req.header('authorization'));
    if (!token) throw new UnauthorizedError('missing bearer save key');
    const ok = await verifySaveKey(token, record.meta.saveKeyHash);
    if (!ok) throw new UnauthorizedError('invalid save key');

    await storage.delete(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Operator cleanup — bearer-gated; can be cron'd from the host.
app.post('/api/cleanup', authedLimiter, async (req, res, next) => {
  try {
    if (!config.cleanupBearer) {
      throw new ForbiddenError('cleanup endpoint is disabled (CLEANUP_BEARER unset)');
    }
    const token = parseBearer(req.header('authorization'));
    if (!token || token !== config.cleanupBearer) {
      throw new UnauthorizedError('invalid cleanup bearer');
    }
    const expired = await storage.listExpired(Date.now());
    for (const id of expired) await storage.delete(id);
    res.json({ ok: true, removed: expired.length });
  } catch (e) {
    next(e);
  }
});

// ── error handler ─────────────────────────────────────────────────────

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[share-api]', err);
  }
  res.status(status).json({ error: err.name || 'Error', detail: err.message });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[share-api] listening on :${config.port} (storage=${config.storage})`);
});
