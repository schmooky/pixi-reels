/**
 * Env-var driven config. Reads `.env` via dotenv in dev (`tsx watch`);
 * in production the host provides the env directly.
 */
import 'dotenv/config';

export type StorageKind = 'memory' | 's3';

export interface Config {
  port: number;
  /**
   * Base URL of the docs site that hosts the viewer (e.g.
   * `https://pixi-reels.schmooky.dev`). The API itself never serves
   * HTML — it just bakes the viewer URL into CreateShareResponse.url.
   */
  viewerBaseUrl: string;
  /** Comma-separated list of allowed CORS origins, or '*' for any. */
  corsOrigins: string[];
  /** Bearer token required on POST /api/cleanup. Empty = endpoint disabled. */
  cleanupBearer: string;
  /** POST rate limit per IP (requests per minute). */
  createRateLimitPerMin: number;
  storage: StorageKind;
  s3: {
    region: string;
    bucket: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Most S3-compatible stores need pathStyle URLs; AWS does not. */
    forcePathStyle: boolean;
  };
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function listEnv(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(): Config {
  const storage = (process.env.STORAGE ?? 'memory') as StorageKind;
  return {
    port: intEnv('PORT', 8787),
    viewerBaseUrl: process.env.VIEWER_BASE_URL ?? 'http://localhost:4321',
    corsOrigins: listEnv('CORS_ORIGIN', ['*']),
    cleanupBearer: process.env.CLEANUP_BEARER ?? '',
    createRateLimitPerMin: intEnv('CREATE_RATE_LIMIT_PER_MIN', 10),
    storage,
    s3: {
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? '',
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    },
  };
}
