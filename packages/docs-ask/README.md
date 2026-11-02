# @pixi-reels/docs-ask

Search and Ask for a static docs site, in three swappable pieces:

```
llms.txt  --build-->  index.json  --Retriever-->  chunks  --Answerer-->  streamed answer
(corpus)              (static)     (browser)                (server or none)
```

- **Corpus**: the site's `llms.txt` (`apps/site/scripts/build-llms.mjs` writes
  it). The chunker reads its heading grammar: `## Section`, `### Page` with a
  `URL:` line, `####` sub-headings with an optional `URL:` deep link.
- **Build step** (`docs-ask build <llms.txt> --out <dir>`): chunks by heading
  into 300 to 600 token pieces, embeds each with a local model
  (`Xenova/all-MiniLM-L6-v2`, q8, through `@huggingface/transformers`, no API
  key) and writes `index.json` with int8 vectors. Weights and finished indexes
  are cached under `node_modules/.cache/docs-ask`; an unchanged corpus rebuilds
  in milliseconds.
- **Retriever** `{ search(query, k): Promise<Chunk[]> }`:
  `LocalEmbeddingRetriever` (same model in the browser, cosine over the
  index, loaded on the first question) and `PagefindRetriever` (the keyword
  index, no model download).
- **Answerer** `{ answer(question, chunks): AsyncIterable<string> }`:
  `RemoteAnswerer` (POST to an `apps/ask` style endpoint, streams back) and
  `NoAnswerer` (sources only; the box works with no server at all).

## Use on another site

```ts
import { LocalEmbeddingRetriever, RemoteAnswerer, NoAnswerer } from '@pixi-reels/docs-ask';

const retriever = new LocalEmbeddingRetriever({ indexUrl: '/ask/index.json' });
const answerer = endpoint ? new RemoteAnswerer({ url: endpoint }) : new NoAnswerer();

const chunks = await retriever.search(question, 6);
for await (const piece of answerer.answer(question, chunks)) render(piece);
```

Build the index after the site build, from the same `llms.txt` the site
serves: `node packages/docs-ask/dist/cli.js build public/llms.txt --out dist/ask`
(or the `docs-ask` bin once the package is published). Flags: `--model`,
`--min`, `--max`, `--site`.

The `.` export points at TypeScript source for the monorepo's Vite and tsc;
`pnpm --filter @pixi-reels/docs-ask build` compiles `dist/` for the CLI.
Publishing it means pointing `exports` at `dist/` too.

## Tests

`pnpm --filter @pixi-reels/docs-ask test` runs the chunker and cosine tests
(vitest). `typecheck` runs tsc over src and tests.
