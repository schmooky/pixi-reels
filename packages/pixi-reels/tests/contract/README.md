# Motion contract

The fourteen laws of [ADR 018](../../../../docs/adr/018-motion-contract.md), run
against the shipping engine in Vitest.

```bash
pnpm --filter pixi-reels test -- tests/contract
```

| File | What it pins |
|---|---|
| `motionContract.ts` | `runMotionContract(factory, axis)` / `runCrossAxisContract(...)`. The laws themselves, as fast-check properties. Takes any implementation with the `ContractMotion` shape. |
| `motion.contract.test.ts` | L1-L11 + L14 against `ReelMotion` in all four orientation x direction combinations, plus L12 (isomorphism) and L13 (mirror). |
| `reelSetAxis.contract.test.ts` | L12 / L13 one level up, at the `ReelSet`: cell geometry, landing, visible grid. Plus ADR 017's facing invariant. |
| `goldenTrace.contract.test.ts` | Frame-by-frame position traces as inline snapshots, so a behaviour change has to be acknowledged rather than discovered. |

## History

This replaced a standalone `contract.cjs` / `cross.cjs` harness that needed an
esbuild step to reach `ReelMotion.ts` and ran against a hand-maintained
`AxisMotion.cjs` reference. Vitest reads the TS directly, so the laws now hold
the shipping code rather than a copy of it, and they run in CI.

Two laws changed shape when A11 dropped the wrap callback's dead `arrayIndex`
and `direction` arguments. L10 and L14 used to read those arguments; they now
observe where the wrapped symbol actually IS in the array, which is the
statement that matters and is not forgeable by a callback that lies.

## Keeping it honest

A contract that cannot fail is decoration. These were verified by mutation -
each of the following breaks the suite, and the count is what to expect:

| Mutation | Fails |
|---|---|
| drop the polarity multiply in `advance` | 3 (L13 mirror, L14 feed edge x2) |
| `setMain` -> `setCross` in `_render` | 16 |
| off-by-one in `getCellMain` | 4 (L6 in every combination) |
| `Math.floor` -> `Math.round` for the rotation count | 4 golden traces |
| swap `toScreen`'s arguments in `ReelSet.getCellBounds` | 2 |

That last one is the reason `reelSetAxis.contract.test.ts` anchors the vertical
side to plain arithmetic before comparing the two orientations. A transposition
inside the shared projection breaks both sides identically, so a purely
relative isomorphism check passes it. Relative laws need one absolute anchor.
