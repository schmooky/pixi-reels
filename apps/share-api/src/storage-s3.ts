/**
 * S3 storage adapter. Mirrors spine-benchmark's flat-keys-under-prefix
 * layout so the operator can browse the bucket directly and reason
 * about cost. One share = up to three small JSON objects under
 * `studios/<id>/`:
 *
 *   studios/<id>/meta.json      ShareMeta (always)
 *   studios/<id>/envelope.json  ShareEnvelope (modes 1-4)
 *   studios/<id>/payload.json   SharePayload (mode 5 only)
 *
 * Works against any S3-compatible store (AWS, MinIO, Selectel, Twin
 * Cloud, …). Constructor accepts the credentials directly; env-var
 * loading lives in `config.ts`.
 */

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ShareEnvelope, ShareMeta, SharePayload } from './types.js';
import type { ShareRecord, ShareStorage } from './storage.js';

export interface S3StorageOptions {
  region: string;
  bucket: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export class S3ShareStorage implements ShareStorage {
  private client: S3Client;
  private bucket: string;

  constructor(opts: S3StorageOptions) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    });
  }

  async put(record: ShareRecord): Promise<void> {
    const id = record.meta.id;
    await this.putJson(`studios/${id}/meta.json`, record.meta);
    if (record.envelope) {
      await this.putJson(`studios/${id}/envelope.json`, record.envelope);
    }
    if (record.payload) {
      await this.putJson(`studios/${id}/payload.json`, record.payload);
    }
  }

  async get(id: string): Promise<ShareRecord | null> {
    const meta = await this.getJson<ShareMeta>(`studios/${id}/meta.json`);
    if (!meta) return null;
    const envelope = meta.mode.assetsEncrypted
      ? await this.getJson<ShareEnvelope>(`studios/${id}/envelope.json`)
      : null;
    const payload = !meta.mode.assetsEncrypted
      ? await this.getJson<SharePayload>(`studios/${id}/payload.json`)
      : null;
    return { meta, envelope: envelope ?? undefined, payload: payload ?? undefined };
  }

  async updateEnvelope(id: string, envelope: ShareEnvelope): Promise<void> {
    // Replaces the envelope object only; meta and (non-existent for
    // editable modes) payload are untouched.
    await this.putJson(`studios/${id}/envelope.json`, envelope);
  }

  async delete(id: string): Promise<void> {
    // Three potential keys; ask S3 to delete all of them in one round-trip.
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: [
            { Key: `studios/${id}/meta.json` },
            { Key: `studios/${id}/envelope.json` },
            { Key: `studios/${id}/payload.json` },
          ],
          Quiet: true,
        },
      }),
    );
  }

  async listExpired(now: number): Promise<string[]> {
    const out: string[] = [];
    let continuationToken: string | undefined;
    // Walk the `studios/` prefix. Each `studios/<id>/` has at most three
    // objects; we only need meta.json to decide expiry. Listing returns
    // all keys flat — filter to meta.json and parse each.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'studios/',
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (res.Contents ?? [])
        .map((o) => o.Key ?? '')
        .filter((k) => k.endsWith('/meta.json'));
      for (const key of keys) {
        const meta = await this.getJson<ShareMeta>(key);
        if (meta && meta.expiresAt <= now) out.push(meta.id);
      }
      if (!res.IsTruncated) break;
      continuationToken = res.NextContinuationToken;
    }
    return out;
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async putJson(key: string, value: unknown): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'application/json',
        Body: JSON.stringify(value),
      }),
    );
  }

  private async getJson<T>(key: string): Promise<T | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = await res.Body?.transformToString();
      if (!body) return null;
      return JSON.parse(body) as T;
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      // Other S3 errors propagate — let the route handler 500.
      throw e;
    }
  }
}
