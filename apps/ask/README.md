# @pixi-reels/ask

The answer endpoint behind the docs site's Ask tab. A single Node 24 `http`
handler, no framework: it takes a question plus the passages the browser
already retrieved, asks the Anthropic Messages API for an answer grounded in
those passages only, streams the text back and appends one audit line per
question. The browser never holds a provider key; this service does.

## Endpoints

| Method | Path        | Body / headers                              | Response |
|--------|-------------|---------------------------------------------|----------|
| POST   | `/ask`      | `{ question, chunks: [{ id, url, section, title, heading?, text }] }` | `text/plain` streamed as it is written; `X-Ask-Id` header carries the exchange id |
| POST   | `/feedback` | `{ id, vote: "up" \| "down" }`              | `204` |
| GET    | `/audit`    | `Authorization: Bearer $ASK_AUDIT_TOKEN`    | the audit log, one JSON object per line |
| GET    | `/healthz`  |                                             | `{ ok: true, model }` |

Every `/ask` call appends to `ASK_LOG_FILE`:

```json
{"type":"ask","id":"...","time":"2026-11-01T20:00:00.000Z","question":"...","chunkIds":["/guides/nudge/#0"],"answer":"...","model":"claude-haiku-4-5","latencyMs":1830,"tokens":{"input":2210,"output":96},"stopReason":"end_turn","error":null,"ip":"..."}
```

A thumbs vote appends `{"type":"feedback","id":"<same id>","vote":"up"}`.

## Environment

| Variable | Required | Meaning |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | yes | Server-side key. Never ships to the browser or the repo. |
| `ASK_ALLOWED_ORIGINS` | yes | Comma-separated origins allowed by CORS, e.g. `https://pixi-reels.schmooky.dev,http://localhost:4321`. Requests without an `Origin` header (curl, same origin) pass. |
| `ASK_AUDIT_TOKEN` | yes | Bearer token for `GET /audit`. |
| `ASK_LOG_FILE` | no | Audit log path. Default `./data/ask-audit.jsonl`; the Dockerfile sets `/app/data/ask-audit.jsonl` and declares it a volume. |
| `ASK_MODEL` | no | Default `claude-haiku-4-5`. `claude-haiku-5-5` is the current Haiku and about ten times cheaper per token. |
| `ASK_MAX_TOKENS` | no | Answer cap, default `1024`. |
| `ASK_RATE_LIMIT` / `ASK_RATE_WINDOW_MS` | no | Per-IP questions per window, in memory. Default 20 per 10 minutes. |
| `PORT` | no | Default `8787`. |

## Run locally

```bash
export ANTHROPIC_API_KEY=...   # from your shell, never a file in the repo
export ASK_ALLOWED_ORIGINS=http://localhost:4321
export ASK_AUDIT_TOKEN=dev
pnpm --filter @pixi-reels/ask start
```

Then point the site at it when building: `PUBLIC_ASK_ENDPOINT=http://localhost:8787/ask pnpm site:build`
(see `apps/site/src/ask.config.ts`).

Smoke test with curl:

```bash
curl -N -D - http://localhost:8787/ask -H 'content-type: application/json' -d '{
  "question": "How do I nudge one reel after it lands?",
  "chunks": [{ "id": "/guides/nudge/#0", "url": "https://pixi-reels.schmooky.dev/guides/nudge/",
               "section": "Guides", "title": "Nudge",
               "text": "await reelSet.nudge(2, { distance: 1, direction: \"forward\", incoming: [\"wild\"] }); Reel 2 moves one cell." }]
}'
curl -H 'authorization: Bearer dev' http://localhost:8787/audit
```

## Docker

```bash
docker build -t pixi-reels-ask apps/ask
docker run -p 8787:8787 -v ask-data:/app/data \
  -e ANTHROPIC_API_KEY -e ASK_ALLOWED_ORIGINS=https://pixi-reels.schmooky.dev -e ASK_AUDIT_TOKEN=... \
  pixi-reels-ask
```

On Timeweb Cloud Apps, deploy this directory as a Docker app, set the three
required variables in the app's environment and mount a persistent volume at
`/app/data` so the audit log outlives redeploys.

## Cost

Per question the request is the system prompt (~120 tokens), the question and
up to 12 passages of at most 6000 characters each. With the site's defaults
(k = 6 chunks of 300 to 600 tokens) that is roughly 2000 to 3500 input tokens
and 100 to 250 output tokens. At Haiku 4.5 list prices ($1 / $5 per million)
a question costs about $0.003 to $0.005; on Haiku 5.5 ($0.10 / $0.50) about
a tenth of that. The exact numbers for every question are in the audit log's
`tokens` field.

## Vendor note: replacing this service

The browser talks to an `Answerer`, an interface in `@pixi-reels/docs-ask`:

```ts
interface Answerer {
  answer(question: string, chunks: Chunk[], opts?): AsyncIterable<string>;
  feedback?(id: string, vote: 'up' | 'down'): Promise<void>;
}
```

`RemoteAnswerer` is the implementation that POSTs to this service. A hosted
vendor (an Algolia or Inkeep style ask API, a different LLM provider, a
company gateway) takes its place by implementing the same two methods, or by
exposing the same `POST /ask` contract so `RemoteAnswerer` can be pointed at
it unchanged. Retrieval is a separate interface (`Retriever`), so a vendor
that also wants to own retrieval replaces that one and sends its own chunks.
The corpus stays `llms.txt`, which is what the site already publishes.
