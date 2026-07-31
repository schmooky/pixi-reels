# Motion contract harness

Runnable harness for the fourteen laws in [ADR 018](../../../../docs/adr/018-motion-contract.md).

The package is `"type": "module"`, so these are `.cjs`. Validated standalone (Node + fast-check) because `ReelMotion.ts` has no runtime
dependencies — its only import is `import type { ReelSymbol }`, which erases.

    npm i --no-save fast-check esbuild
    npx esbuild ../../src/core/ReelMotion.ts --format=cjs --outfile=ReelMotion.cjs
    IMPL=v1 node contract.cjs                      # current engine  -> L7 FAILS
    IMPL=v2 POLARITY=1  PROP=y node contract.cjs   # ADR 016 ref, vertical forward
    IMPL=v2 POLARITY=-1 PROP=y node contract.cjs   # vertical reverse
    IMPL=v2 POLARITY=1  PROP=x node contract.cjs   # horizontal forward
    IMPL=v2 POLARITY=-1 PROP=x node contract.cjs   # horizontal reverse
    node cross.cjs                                 # L12 isomorphism, L13 mirror, L14 feed edge

`AxisMotion.cjs` is the ADR 016 §3.2 reference: positions derived from array index,
rotation count derived from total travel. Passes 14/14 in all four combinations.

Port to Vitest + `pixi-reels/testing` as `runMotionContract(factory)` in ADR 016 PR 2.
