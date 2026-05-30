---
"pixi-reels": minor
---

Add: injectable `rng` on `ReelSetBuilder` (and `RandomSymbolProvider`), defaulting to `Math.random`. Regulated / provably-fair deployments can now inject a seeded, audited PRNG so the on-screen scrolling strip is reproducible from a seed for dispute resolution and frame-level regression.
