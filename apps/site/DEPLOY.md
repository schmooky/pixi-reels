# Deploying the site

The site is static. `pnpm site:build` writes it to `apps/site/dist`. The host
is the Timeweb Cloud app platform, as a frontend app: it builds from `main`
and serves the folder with its own web server (Caddy).

## Build settings

- Build command: `pnpm run site:build`
- Folder to serve: `/apps/site/dist/`
- Node: 22.12 or newer (the root `engines` field)

Clone the repository with its full history if the platform lets you choose.
The sitemap reads the date of each page from git and writes it as `<lastmod>`.
On a shallow clone, or with no git at all, it writes no `<lastmod>` rather
than a wrong one, so nothing breaks; the dates are just missing.

## Web server settings

Nothing in the repository configures the server. The settings live in the
panel: open the app, then **Settings**, then **Web server settings**. Saving
starts a new deploy.

### 1. Turn SPA Fallback off

With SPA Fallback on, the server answers every unknown address with
`/index.html` and status 200. A search engine then sees the home page under
any wrong address, which it reports as a soft 404 or a duplicate. A missing
`/_astro/` script also comes back as HTML with status 200.

With it off, an unknown address gets `/404.html` and status 404. The build
writes that file from `src/pages/404.astro`.

### 2. Turn compression on

Select both `gzip` and `zstd`. Googlebot and older Safari do not accept
`zstd`, so `gzip` has to be there too. Without compression the home page
alone is about 114 KB of HTML.

### 3. Add one header

| Type | Name | Value |
|---|---|---|
| `set` | `Strict-Transport-Security` | `max-age=31536000` |

Do not set `Cache-Control` here. A header rule applies to every response, and
the HTML pages must not get a long cache.

## Check after the deploy

Each command shows what a correctly set up server answers.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pixi-reels.schmooky.dev/no-such-page/
```

`404`.

```bash
curl -sI -H "Accept-Encoding: gzip" https://pixi-reels.schmooky.dev/ | grep -i content-encoding
```

`content-encoding: gzip`.

```bash
curl -sI https://pixi-reels.schmooky.dev/ | grep -i strict-transport
```

`strict-transport-security: max-age=31536000`.

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://pixi-reels.schmooky.dev/mechanics/cascade.md
```

`200 text/markdown`. Before SPA Fallback is off this answers `200 text/html`
for any address, so it only means something after step 1.

```bash
curl -s https://pixi-reels.schmooky.dev/sitemap.xml | grep -c "<lastmod>"
```

A number above zero when the platform cloned the full history, `0` when it
did not.

## What the platform cannot do

The header rules have no path. So the files under `/_astro/`, which carry a
hash in their names, get no long cache. A CDN in front of the site can add it.
