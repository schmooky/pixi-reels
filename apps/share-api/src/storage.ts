/**
 * Storage adapter interface plus an in-memory implementation for dev.
 *
 * Modes 1-4 carry an opaque encrypted envelope; mode 5 carries a
 * plaintext payload. A share record has exactly one of them, never both
 * — see `assertModeConsistency` in `shares.ts`. Wire shape matches the
 * spine-benchmark S3 layout when an S3 adapter lands later
 * (`studios/<id>/meta.json` + either `envelope.json` or `payload.json`).
 */

import type { ShareEnvelope, ShareMeta, SharePayload } from './types.js';

export interface ShareRecord {
  meta: ShareMeta;
  /** Present for modes 1-4. */
  envelope?: ShareEnvelope;
  /** Present for mode 5. */
  payload?: SharePayload;
}

export interface ShareStorage {
  put(record: ShareRecord): Promise<void>;
  get(id: string): Promise<ShareRecord | null>;
  /**
   * Replace the envelope on an existing share (used by PUT /:id). Only
   * editable modes call this; mode 5 is never editable.
   */
  updateEnvelope(id: string, envelope: ShareEnvelope): Promise<void>;
  delete(id: string): Promise<void>;
  /** Return ids of shares whose expiresAt <= now. */
  listExpired(now: number): Promise<string[]>;
}

export class InMemoryShareStorage implements ShareStorage {
  private records = new Map<string, ShareRecord>();

  async put(record: ShareRecord): Promise<void> {
    this.records.set(record.meta.id, record);
  }

  async get(id: string): Promise<ShareRecord | null> {
    return this.records.get(id) ?? null;
  }

  async updateEnvelope(id: string, envelope: ShareEnvelope): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Share ${id} not found`);
    this.records.set(id, { ...existing, envelope });
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async listExpired(now: number): Promise<string[]> {
    const out: string[] = [];
    for (const [id, rec] of this.records) {
      if (rec.meta.expiresAt <= now) out.push(id);
    }
    return out;
  }
}
