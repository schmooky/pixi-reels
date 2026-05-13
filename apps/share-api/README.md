# share-api

Tiny Express 5 relay over S3 for **pixi-reels Studio shares**. Modelled on
[`schmooky/spine-benchmark`'s `reports-api`](https://github.com/schmooky/spine-benchmark/tree/main/apps/reports-api):
client-side encrypt-then-upload, server is a dumb relay. The proxy never
sees plaintext envelopes.

## What it stores

Five share modes collapse onto four boolean flags (`mode.assetsEncrypted`,
`mode.codeExposed`, `mode.editable`, `mode.saveKeyDistinct`). See
`src/types.ts` for the wire shape.

Per share:

```
studios/<id>/meta.json      ShareMeta — plaintext, queryable by you
studios/<id>/public.json    SharePublic — plaintext, code (when exposed)
                            + symbol manifest (refs only)
studios/<id>/envelope.json  ShareEnvelope — opaque ciphertext (omitted
                            on the fully-public mode)
```

The current scaffold ships only the in-memory storage adapter for the
local studio dev loop. The S3 adapter lands in a separate commit on this
branch.

## Dev

```bash
cp .env.example .env
pnpm install
pnpm --filter @pixi-reels/share-api dev   # tsx watch on :8787
```

Studio talks to it at `http://localhost:8787` while the rest of the
docs site runs on `:4321` — CORS allow-list defaults to that origin.

## Endpoints

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/studios` | `{ mode, ttlDays, public, envelope?, saveKeyHash?, analytics }` |
| `GET` | `/api/studios/:id` | — |
| `PUT` | `/api/studios/:id` | `{ saveKey, public, envelope }` |
| `DELETE` | `/api/studios/:id` | (bearer save key in `Authorization`) |
| `POST` | `/api/cleanup` | (bearer `CLEANUP_BEARER` in `Authorization`) |
| `GET` | `/health` | — |

TTL options: 3 / 7 / 30 days (server clamps anything else).

## Notes

- All crypto is client-side; the server validates the wire shape via
  zod but treats the envelope as opaque.
- Rate limit on `POST /api/studios` is per-IP (20/min by default).
- `POST /api/cleanup` is bearer-gated and disabled by default
  (`CLEANUP_BEARER` empty).
- Save-key hashing uses PBKDF2-SHA256 at 210,000 iterations, salted
  per share, format `base64(salt):base64(hash)` — same parameters as
  spine-benchmark for one shared client helper.
