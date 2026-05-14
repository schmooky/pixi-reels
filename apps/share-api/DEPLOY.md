# Deploying share-api

Stateless Express service, single process. Any host that can run `node`
with env vars will do — Coolify, Dokploy, Northflank, Railway, fly.io,
plain systemd, bare PM2.

## Build

The share-api is a workspace member; its build needs the whole
`pnpm-workspace.yaml` graph resolved, then a single `pnpm` filter.

```bash
pnpm install --frozen-lockfile
pnpm share-api:build
```

That produces `apps/share-api/dist/server.js` plus sourcemaps. The
runtime entry point is `node apps/share-api/dist/server.js`.

> **Gotcha — install/build order.** If your deploy platform
> auto-generates a Dockerfile or build script, double-check it doesn't
> run `pnpm install` *before* copying the full source. pnpm needs
> every workspace's `package.json` present at install time to set up
> the per-package `node_modules` symlinks. The standard buildpack
> sequence is:
>
> ```
> COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
> RUN pnpm install --frozen-lockfile     # ← WRONG if workspace pkgs not yet copied
> COPY . .
> RUN pnpm share-api:build
> ```
>
> That installs only the root devDeps and leaves the workspace
> packages without `node_modules`, so `tsc` (and every other workspace
> binary) is missing at build time. Either copy the source *before*
> installing, or use a build hook that runs after the full COPY:
>
> ```
> # Build hook on your platform:
> pnpm install --frozen-lockfile && pnpm share-api:build
> ```

## Environment

| Var | Required | Default | What |
|---|---|---|---|
| `PORT` | no | `8787` | TCP listen port. |
| `VIEWER_BASE_URL` | yes (prod) | `http://localhost:4321` | Docs-site root the share-api bakes into `CreateShareResponse.url`. |
| `CORS_ORIGIN` | yes (prod) | `*` | Comma-separated allow-list of origins; tighten in prod. |
| `CLEANUP_BEARER` | optional | empty (disabled) | Bearer required on `POST /api/cleanup`. Leave empty to disable. |
| `CREATE_RATE_LIMIT_PER_MIN` | no | `10` | Per-IP rate cap on POST. |
| `STORAGE` | no | `memory` | `memory` (dev) or `s3` (prod). |
| `S3_REGION` | when `STORAGE=s3` | `us-east-1` | S3 bucket region. |
| `S3_BUCKET` | when `STORAGE=s3` | (empty) | Bucket name. |
| `S3_ENDPOINT` | when `STORAGE=s3`, non-AWS | (empty) | Custom endpoint (e.g. Twin Cloud, Selectel, MinIO). |
| `S3_ACCESS_KEY_ID` | when `STORAGE=s3` | (empty) | IAM access key. |
| `S3_SECRET_ACCESS_KEY` | when `STORAGE=s3` | (empty) | IAM secret. |
| `S3_FORCE_PATH_STYLE` | no | `true` | Most non-AWS S3-compatibles need this. |

A complete prod env:

```env
PORT=8787
STORAGE=s3
VIEWER_BASE_URL=https://pixi-reels.schmooky.dev
CORS_ORIGIN=https://pixi-reels.schmooky.dev
CLEANUP_BEARER=<random-long-string>
CREATE_RATE_LIMIT_PER_MIN=10
S3_REGION=ru-1
S3_BUCKET=pixi-reels-share
S3_ENDPOINT=https://s3.twcstorage.ru
S3_ACCESS_KEY_ID=<your access key>
S3_SECRET_ACCESS_KEY=<your secret>
S3_FORCE_PATH_STYLE=true
```

## Docs site env

The site that calls the share-api also has one env var, baked at build
time (Astro exposes `PUBLIC_*` to the client):

```env
PUBLIC_SHARE_API_URL=https://share.pixi-reels.schmooky.dev
```

Default (when unset) is `http://localhost:8787` for the dev loop.

## Operations

### Smoke test

`apps/share-api/scripts/smoke.sh` does a POST/GET round-trip against
the running server. Run it after every deploy:

```bash
SHARE_API=https://share.pixi-reels.schmooky.dev bash apps/share-api/scripts/smoke.sh
```

### Cleanup

Expired shares are visible to `GET` (they 404 with `share expired`) but
the S3 objects stay until purged. Run cleanup on a cron — any cadence
slower than the shortest TTL (3 days) is enough:

```bash
curl -X POST -H "Authorization: Bearer $CLEANUP_BEARER" \
  https://share.pixi-reels.schmooky.dev/api/cleanup
```

Response: `{ "ok": true, "removed": N }`.

### Path-style URLs (optional)

The default URL is hash-style: `https://pixi-reels.schmooky.dev/share/#<id>`.
Works on any static host with zero rewrites. To switch to path-style
(`/share/<id>`):

- **Cloudflare Pages / Netlify**: drop `apps/site/public/_redirects`:
  ```
  /share/* /share/index.html 200
  ```
- **Vercel**: `apps/site/vercel.json`:
  ```json
  { "rewrites": [{ "source": "/share/:id", "destination": "/share/" }] }
  ```

Then change `viewerUrlFor` in `apps/share-api/src/server.ts` to drop
the `#`. The `ShareViewer` component already resolves both URL shapes
via `readIdFromLocation()`, so no client-side change needed.
