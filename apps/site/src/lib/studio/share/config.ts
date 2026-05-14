/**
 * Where the share-api lives, from build-time env. Set
 * `PUBLIC_SHARE_API_URL` in `.env` (or the deploy environment) — Astro
 * exposes anything `PUBLIC_*` to the client.
 *
 *   dev:  http://localhost:8787
 *   prod: https://share.pixi-reels.schmooky.dev
 */
export const SHARE_API_URL: string =
  (import.meta.env.PUBLIC_SHARE_API_URL as string | undefined) ?? 'http://localhost:8787';
