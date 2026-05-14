/**
 * Thin fetch wrapper over the share-api. Studio dialog and viewer both
 * go through these helpers — keeps URL building, error mapping, and
 * JSON parsing in one place.
 */

import { SHARE_API_URL } from './config.js';
import type {
  CreateShareRequest,
  CreateShareResponse,
  GetShareResponse,
  UpdateShareRequest,
} from './types.js';

export class ShareApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`share-api ${status}: ${detail}`);
    this.name = 'ShareApiError';
  }
}

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const obj = JSON.parse(text);
      detail = obj.detail ?? obj.error ?? text;
    } catch { /* fall through */ }
    throw new ShareApiError(res.status, detail);
  }
  return JSON.parse(text) as T;
}

export async function createShare(body: CreateShareRequest): Promise<CreateShareResponse> {
  const res = await fetch(`${SHARE_API_URL}/api/studios`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return asJson<CreateShareResponse>(res);
}

export async function getShare(id: string): Promise<GetShareResponse> {
  const res = await fetch(`${SHARE_API_URL}/api/studios/${encodeURIComponent(id)}`);
  return asJson<GetShareResponse>(res);
}

export async function updateShare(id: string, body: UpdateShareRequest): Promise<void> {
  const res = await fetch(`${SHARE_API_URL}/api/studios/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await asJson<{ ok: true }>(res);
}
