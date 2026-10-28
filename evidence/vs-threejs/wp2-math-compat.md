# WP-2: mutable three-compatible math layer (`@aura3d/math/three`)

Branch `beat3js2/wp2-math-three`, PRD `docs/prds/beat-threejs/PRD-beat-threejs-2-remaining-gaps.md` section 2.2 and WP-2. No browser or GPU work is involved, so nothing was run on the remote runner.

## What shipped

- `packages/math/src/three/{index,Vector2,Vector3,Vector4,Matrix3,Matrix4,Quaternion,Euler,Color,Box3,Sphere,Plane,Ray}.ts`: the 13 classes the PRD lists. Two more files, `Frustum.ts` and `Triangle.ts`, cover the two other pure-math rows (`Frustum`, `Triangle`) that the codemod table had as approximate.
- Every modifier mutates `this` and returns it, as in three r185. `target` out-parameters are filled and returned. Intersection misses return `null`. Each class has `fromImmutable(v)` and `toImmutable()`.
- `packages/math/package.json` exports `"./three"` (`dist/three/index.js` and `.d.ts`). `aura.exports.json`, `tsconfig.base.json`, `tsconfig.paths.generated.json`, `vite.aliases.generated.ts`, `tools/finalize-dist/manifest.generated.json`, `vitest.config.ts` and `tools/verify-exports/index.ts` know the new specifier. `tsc -p tsconfig.build.json`, `finalize-dist` and `verify-exports` pass, and `import("packages/math/dist/three/index.js")` works.
- The existing immutable `@aura3d/math` classes are unchanged (no edits under `packages/math/src` outside `three/`).

## Proof

- Goldens: `THREE_DIR=/tmp/three-185 node tests/fixtures/migrate-three/generate.mjs` with `three@0.185.1` installed exactly in a temp dir outside the repo. The 54 goldens that existed before are byte-identical after regeneration (the `Plane` case now passes a plain line object instead of `Line3`; its values did not change). 453 method-level goldens were added in `tests/fixtures/migrate-three/cases.math.mjs` (`Class#member` keys). `goldens.json` grew from 0.76 MB to 3.0 MB because each case runs dense seeded-random inputs.
- `tests/unit/math/three-compat-parity.test.ts` (497 tests): every instance member and static member that three r185 exposes on the 14 classes must have a case and must exist on the compat class; every case must reproduce the golden to 1e-11 (the compat code repeats three's operations in three's order, so results are bit-identical in practice). Also covered: return-`this` identity, receiver state, returned values, `target` out-parameters, thrown error messages, `console.warn` counts, `Math.random` through a seeded stub, aliasing (`a.add(a)`, `m.multiply(m)`, `q.multiply(q)`, `s.union(s)`), NaN propagation, `copy`/`clone` identity, change callbacks on Quaternion and Euler, and `fromImmutable`/`toImmutable` round trips.
- Mutation check of the test itself: 1,175 single-operator mutants (comparison and arithmetic swaps) were applied to `packages/math/src/three/*.ts` one at a time, each followed by the parity test. A first sweep exposed two weaknesses that were fixed: the serializer returned nothing for `Vector2/3/4` (they have `min`/`max` methods and were mistaken for boxes), and the tolerance of 1e-5 hid small-magnitude terms. After adding dense seeded-random inputs, boundary probes and a tolerance of 1e-11, every mutant is killed except 85: 80 are `<` vs `<=` style swaps that only differ at exact floating-point equality, and 5 are equivalent mutants (`style || len > 0` after `style &&`, `src[offset + 0]` vs `- 0`, `a * b < 0` vs `a / b < 0`, one extra loop iteration reading `undefined` in `Box3` `satForAxes`).

## Codemod counts (`packages/aura3d-cli/src/migrate-three/mappings.ts`)

| | exact | approximate | none | pending | total |
| --- | --- | --- | --- | --- | --- |
| before (beat3js/integration) | 34 | 164 | 47 | 0 | 245 |
| after | 48 | 150 | 47 | 0 | 245 |

Fourteen rows moved from approximate to exact, each with a passing fixture (`cases.mjs#<construct>`) and `engineImportFrom: "@aura3d/math/three"`: Vector2, Vector3, Vector4, Quaternion, Euler, Matrix3, Matrix4, Box3, Sphere, Plane, Ray, Frustum, Color, Triangle. The `emit.ts` argument emitters pass the source arguments through verbatim (`new Matrix4(...)`); `Color`, `Euler` and `Vector3` also append a one-line `a3d:` comment because Aura3D option fields still take a hex string or an `[x, y, z]` tuple.

## Acceptance

- Approximate <= 100: **not met, measured 150.** The estimate of "64+ approximate rows" in the PRD does not match the table: only 14 of the 164 approximate rows are math classes. The other 150 are scene, camera, geometry, material, light, loader, control, post-pass, helper, animation and XR constructs that this layer cannot touch. Closing the gap needs 50 more rows to graduate from other lanes; WP-2 alone caps the count at 150.
- None <= 20: **unreachable, measured 47 (unchanged).** 26 of the 47 are the deliberate loader and exporter exclusions (AD-04 and AD-05) and stay `none`. The other 21 are material, post-pass, compute and helper constructs with no public Aura3D equivalent (FontLoader, MeshNormalMaterial, MeshToonMaterial, MaskPass, GlitchPass, GPUComputationRenderer, PlaneHelper and similar); none is a math construct.
- Pending 0: met.

## Notes for the merge and for later lanes

- The emitted import is `@aura3d/math/three`, a separate package. A migrated project must list `@aura3d/math` in its dependencies; with pnpm's strict resolution the import fails otherwise. The row notes say so. Re-exporting the layer as `@aura3d/engine/math/three` was not done because it changes the engine package surface, which this WP does not own.
- Docs that quote codemod counts (`docs/migration/from-threejs.md`, `docs/aura3d-vs-threejs.md`, `docs/project/migration.md`) already disagree with `mappings.ts` (they say 21 exact and 174 approximate; the table said 34 and 164 before this change). They were not edited here; WP-11 owns them. Current counts: 48 exact, 150 approximate, 47 none, 0 pending.
- `tsconfig.base.json` already differed from the generator output before this change (`@aura3d/assets/vite` is in the file but not in `aura.exports.json`), so `resolution:check` reports a diff that predates this WP. Only the `@aura3d/math/three` path was added by hand.
- Unrelated unit tests fail in this worktree because GLB fixtures are Git LFS pointers that were not materialized (skin repair, texel density, Draco and Meshopt parity, vehicle admission); they pass in a worktree that has the LFS files. `tests/unit/docs/converted-feature-docs.test.ts` (production renderer how-to) fails identically on a clean `beat3js/integration` checkout. None of these touch the files changed here.
