# Claim lineage — R1, and how to satisfy it

> **No parity, performance, compatibility, or visual claim may be generated from evidence that does
> not execute the public production path of the thing being claimed.**

This is R1 of [`Aura3D-1.6-Replatform-PRD.md`](../../Aura3D-1.6-Replatform-PRD.md) and the
controlling principle of the 1.6 effort. It is enforced by `pnpm check:claim-lineage`
(`tools/claim-lineage/index.ts`), which runs inside `check:release`.

## Why the rule exists

Three instruments supplied this project's claims, and none of them measured what its name said:

| Instrument | What it actually did |
|---|---|
| `tests/browser/external-parity-large-scene.spec.ts` | `canvas.getContext("2d")`, 640 `fillRect`s, returned `cpuFrameMs: 13.8` as a **literal constant in its own source**, then asserted `< 16.7` |
| `tools/compare-engines` browser measurement | raw WebGL2 context, own 6-line shader, 3-vertex triangle, **imported none of the three engines** — so every frame-time "tie" was the same triangle against itself |
| `tests/performance/*` frame budgets | `backend: "mock"` — no GL commands, no GPU, reported as `frameMs` |

Each was deleted, relabelled or quarantined in P1. R1 is the rule that stops the next one.

## The test is reachability, not syntax

A rule requiring the spec file itself to contain `import ... from "@aura3d/engine"` would be
satisfied by adding a decorative import that improves nothing. So lineage resolves **transitively**,
and four evidence shapes all satisfy it:

| Shape | Example |
|---|---|
| `direct-test-import` | `tests/unit/physics/public-joints.test.ts` imports `@aura3d/engine` |
| `harness-import` | `createAuraApp-morph-targets.spec.ts` → `createAuraApp-morph-targets-harness.ts` → `@aura3d/engine` |
| `generated-clean-room` | a project under `tests/clean-room/` whose entry uses only the public API |
| `bundle-from-public-entry` | `tools/production-path-benchmark` bundles `@aura3d/engine` with esbuild and runs it in Chrome |

A browser spec that reaches the engine by **navigating** to a served harness page also resolves: the
dev server maps bare specifiers onto `/packages/<pkg>/src/index.ts`, and that barrel is the public
entry.

## What does not satisfy it

**A deep import satisfies nothing.** This is the one place where syntax is decisive, because a deep
import is by definition not the public path:

```ts
import { solvePlatformerMotion } from "@aura3d/engine/src/agent-api/PlatformerMotion";        // NO
import { solvePlatformerMotion } from "../../../packages/engine/src/agent-api/PlatformerMotion"; // NO — same thing
import { game } from "../../../packages/engine/src/agent-api";                                // YES — the barrel
```

`packages/<pkg>/src/index.ts` is exactly what `package.json` `exports` points at once built, so the
relative spelling of the **barrel** is the public surface. A relative path to a **file** inside the
package is not.

The reachability walk therefore **stops at the barrier**. It will not step from a test into
`PlatformerMotion.ts` and keep walking: every internal file is transitively connected to some file
that mentions a public specifier, so traversing internals would resolve *every* deep import and make
the tool a no-op. This was caught by sabotage and is locked by
`tests/unit/tools/claim-lineage.test.ts`.

## Adding a claim

1. Add the row to `tools/product-remediation/build-threejs-parity.mjs`.
2. Add `"<capability>": "<path to test>"` to `tools/claim-lineage/production-path-tests.json`.
3. Run `pnpm check:claim-lineage`. A capability with no entry is forced to `unproven`.

**The tool verifies reachability. It cannot verify relevance.** An entry naming a reachable but
unrelated test is a lie this file makes *reviewable*, not one it prevents — which is why the map is a
committed artifact with the capability name beside the path, rather than a heuristic.

## `gap` rows are exempt

A `gap` is the honest absence of a capability. Demanding a production-path test proving a thing does
not exist would be incoherent, so `gap` rows carry `productionPathTest: null` and are skipped.

## What the earlier rules did and did not cover

`build-threejs-parity.mjs` already refused to claim `parity` without a **consumer** and `exceed`
without a **retained artifact**. Both are real checks, and neither is R1:

- a consumer proves *someone imports a symbol*
- an artifact proves *a file exists on disk*

Neither proves a test executed the public path and observed the claimed behaviour. Before WS-1.6,
**42 rows sat at `parity` with `runtimeEvidence: []`**.

## Two faults this enforcement found in the generator itself

1. **`morph targets` was published as `gap` and should not have been.** The generator grepped
   `MorphTargetMixer` and `MorphTargetWeight`; **neither symbol exists.** The real ones are
   `MorphTargetMixerThreeCompat` and the `applyMorphTargets` family — and there is a full public
   browser contract test. A generator can understate as easily as overstate.
2. **`context loss recovery` was correctly `gap` for a subtly wrong reason.**
   `WebGL2Device.ts:349-350` *does* listen for `webglcontextlost`/`webglcontextrestored`. The gap is
   that nothing surfaces through the root API. The vaguer note invited closing the row by pointing at
   the listeners. Note also that `tests/browser/production-runtime-webgl2-context-loss.spec.ts` is a
   **one-line re-export shell containing no test** — the kind of file that makes a capability look
   covered. WS-2.6 closes the real gap.
