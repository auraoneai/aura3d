# Final Subsystem Ownership

Generated from `tools/final-subsystem-ownership/index.mjs` at commit `c108150216f9ac2714b97193d11a42bd9c64bf2d`.

Phase 1 ownership inventory and migration queue only; no deletion, dependency selection, parity, or release claim.

## Package dispositions

| Package | Disposition | Source lines | Source consumers | Public exports | Built JS gzip | Removal blocked by public export |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `@aura3d/animation` | `AURA-CORE` | 7783 | 74 | 1 | 53722 | yes |
| `@aura3d/apps` | `AURA-MOAT` | 162 | 16 | 1 | 1190 | yes |
| `@aura3d/asset-index` | `AURA-MOAT` | 3438 | 35 | 1 | 24286 | yes |
| `@aura3d/assets` | `AURA-MOAT` | 16584 | 88 | 3 | 109159 | yes |
| `@aura3d/audio` | `BROWSER-STANDARD` | 2225 | 18 | 1 | 13124 | yes |
| `@aura3d/cli` | `AURA-MOAT` | 8756 | 32 | 1 | 78405 | yes |
| `@aura3d/controls` | `AURA-CORE` | 2389 | 14 | 1 | 14931 | yes |
| `@aura3d/core` | `AURA-CORE` | 1186 | 52 | 1 | 7644 | yes |
| `create-aura3d` | `AURA-MOAT` | 8574 | 127 | 1 | 69180 | yes |
| `@aura3d/debug` | `AURA-MOAT` | 1133 | 13 | 1 | 6632 | yes |
| `@aura3d/ecs` | `COMPATIBILITY-ONLY` | 1480 | 22 | 1 | 10078 | yes |
| `@aura3d/editor` | `OPTIONAL-PLUGIN` | 1 | 28 | 1 | 93 | yes |
| `@aura3d/editor-runtime` | `OPTIONAL-PLUGIN` | 7915 | 28 | 1 | 50811 | yes |
| `@aura3d/engine-runtime` | `AURA-MOAT` | 56843 | 11 | 3 | 409090 | no |
| `@aura3d/environments` | `AURA-CORE` | 469 | 5 | 1 | 3050 | yes |
| `@aura3d/input` | `AURA-CORE` | 2471 | 34 | 1 | 14695 | yes |
| `@aura3d/materials` | `AURA-CORE` | 360 | 5 | 1 | 2760 | yes |
| `@aura3d/math` | `AURA-CORE` | 1220 | 49 | 1 | 8067 | yes |
| `@aura3d/physics` | `EXTERNAL-ADAPTER` | 11988 | 44 | 3 | 102048 | yes |
| `@aura3d/product-studio` | `AURA-MOAT` | 696 | 29 | 1 | 4893 | yes |
| `@aura3d/react` | `EXTERNAL-ADAPTER` | 173 | 13 | 1 | 1182 | yes |
| `@aura3d/rendering` | `AURA-CORE` | 55125 | 224 | 3 | 390609 | yes |
| `@aura3d/scene` | `AURA-CORE` | 1708 | 148 | 2 | 10343 | yes |
| `@aura3d/scripting` | `COMPATIBILITY-ONLY` | 5837 | 15 | 1 | 39403 | yes |
| `@aura3d/three-compat` | `COMPATIBILITY-ONLY` | 1234 | 19 | 3 | 10386 | yes |
| `@aura3d/workflows` | `AURA-MOAT` | 1174 | 29 | 1 | 8260 | yes |

## Runtime subsystem dispositions

Every package source file is assigned exactly once. General rows inherit the package decision; exceptional rows isolate commodity, compatibility, optional, and evidence-only ownership.

| Subsystem | Package | Disposition | Files | Lines | Built gzip | Maintenance refs | Decision |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `animation-general` | `animation` | `AURA-CORE` | 44 | 7783 | 51730 | 197 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `apps-general` | `apps` | `AURA-MOAT` | 1 | 162 | 1190 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `asset-evidence-fixtures` | `assets` | `EVIDENCE-ONLY` | 3 | 793 | 6457 | 4 | Remove evidence-only source from the published runtime after consumer proof. |
| `asset-index-general` | `asset-index` | `AURA-MOAT` | 20 | 3438 | 23414 | 112 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `assets-general` | `assets` | `AURA-MOAT` | 61 | 15791 | 102750 | 229 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `audio-browser-runtime` | `audio` | `BROWSER-STANDARD` | 16 | 1645 | 8464 | 24 | Select one playback owner; retain Aura-specific cue semantics only. |
| `audio-evidence-fixtures` | `audio` | `EVIDENCE-ONLY` | 3 | 580 | 4538 | 3 | Move non-runtime fixtures out of the published audio package. |
| `aura3d-cli-general` | `aura3d-cli` | `AURA-MOAT` | 31 | 8756 | 77735 | 778 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `controls-general` | `controls` | `AURA-CORE` | 15 | 2389 | 14931 | 66 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `core-general` | `core` | `AURA-CORE` | 15 | 1186 | 7644 | 122 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `create-aura3d-general` | `create-aura3d` | `AURA-MOAT` | 24 | 8574 | 69180 | 197 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `debug-general` | `debug` | `AURA-MOAT` | 16 | 1133 | 6632 | 32 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `ecs-general` | `ecs` | `COMPATIBILITY-ONLY` | 30 | 1480 | 10078 | 85 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `editor-evidence-fixtures` | `editor-runtime` | `EVIDENCE-ONLY` | 1 | 368 | 3467 | 2 | Move fixtures out of the optional editor runtime. |
| `editor-general` | `editor` | `OPTIONAL-PLUGIN` | 1 | 1 | 93 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `editor-runtime-general` | `editor-runtime` | `OPTIONAL-PLUGIN` | 45 | 7547 | 47379 | 118 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `engine-browser-media` | `engine` | `BROWSER-STANDARD` | 4 | 521 | 3170 | 10 | Keep browser capture separate from Node encoding and publishing. |
| `engine-general` | `engine` | `AURA-MOAT` | 105 | 54763 | 380791 | 854 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `engine-node-media-publishing` | `engine` | `OPTIONAL-PLUGIN` | 9 | 1559 | 10660 | 17 | Remove Node/cloud/FFmpeg ownership from browser entries. |
| `environments-general` | `environments` | `AURA-CORE` | 8 | 469 | 3050 | 3 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `input-general` | `input` | `AURA-CORE` | 26 | 2471 | 14623 | 69 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `materials-general` | `materials` | `AURA-CORE` | 9 | 360 | 2760 | 5 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `math-general` | `math` | `AURA-CORE` | 19 | 1220 | 8067 | 175 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `physics-cannon-adapter` | `physics` | `EXTERNAL-ADAPTER` | 12 | 3937 | 32389 | 129 | Compare against current Rapier topology; exactly one physical solver may remain. |
| `physics-custom-physical-controllers` | `physics` | `DEPRECATE-REMOVE` | 4 | 2184 | 17116 | 29 | Retain only until the optional-engine bake-off and migration proof identify replacements. |
| `physics-evidence-descriptors` | `physics` | `EVIDENCE-ONLY` | 7 | 2281 | 14925 | 7 | Move out of the published runtime; never represent descriptors as solvers. |
| `physics-general` | `physics` | `EXTERNAL-ADAPTER` | 9 | 2451 | 16083 | 417 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `physics-navigation-crowd-steering` | `physics` | `OPTIONAL-PLUGIN` | 3 | 1135 | 7650 | 21 | Bake off against Recast/Detour and maintained alternatives in Phase 2. |
| `product-studio-general` | `product-studio` | `AURA-MOAT` | 13 | 696 | 4893 | 14 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `react-general` | `react` | `EXTERNAL-ADAPTER` | 1 | 173 | 1182 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `rendering-general` | `rendering` | `AURA-CORE` | 253 | 55125 | 381532 | 897 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `scene-general` | `scene` | `AURA-CORE` | 22 | 1708 | 10343 | 518 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `scripting-general` | `scripting` | `COMPATIBILITY-ONLY` | 29 | 5837 | 39265 | 43 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `three-compat-general` | `three-compat` | `COMPATIBILITY-ONLY` | 20 | 1234 | 10185 | 18 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `workflows-general` | `workflows` | `AURA-MOAT` | 20 | 1174 | 8260 | 5 | Retain under the package disposition; reassess only with consumer and migration evidence. |

## External-candidate maintenance lock

A metadata score is not a selection. Runtime, bundle, determinism, disposal, worker, and isolated security measurements remain mandatory in Phase 2.

| Candidate | Version | License | Modified | Freshness | Integrity | Exit-risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `@dimforge/rapier3d` | `0.19.3` | Apache-2.0 | 2026-08-08 | active | `sha512-tkD1tvHTDML0W9s9rUYAsx0btO9LbVTnMBKJWVgOsas5haGFbYY+pzr5hbwYysv/IJmgmMrIFoVWIcsaCUE9ow==` | medium until adapter boundary is proven; tarball 781538 B; all-export browser gzip requires explicit WASM loader (✘ [ERROR] No loader is configured for ".wasm" files: node_modules/@dimforge/rapier3d/rapier_wasm3d_bg.wasm      node_modules/@dimforge/rapier3d/rapier_wasm3d.js:1:22:       1 │ import * as wasm from "./rapier_wasm3d_bg.wasm";         ╵                       ~~~~~~~~~~~~~~~~~~~~~~~~~); isolated npm audit 0 vulnerabilities |
| `@dimforge/rapier3d-compat` | `0.19.3` | Apache-2.0 | 2026-08-08 | active | `sha512-mMVdSj1PRTT108s9Swbu2GQOmHbn8kbJANRV5xfczL3s0T4vkgZAuoMRgvBzQcHanpKusbC0ZJj6z3mC3aj3vg==` | medium until adapter boundary is proven; tarball 2602383 B; all-export browser gzip 838598 B; isolated npm audit 0 vulnerabilities |
| `cannon-es` | `0.20.0` | MIT | 2022-08-12 | dormant-risk | `sha512-eZhWTZIkFOnMAJOgfXJa9+b3kVlvG+FX4mdkpePev/w/rP5V8NRquGyEozcjPfEoXUlb+p7d9SUcmDSn14prOA==` | high; tarball 164649 B; all-export browser gzip 62507 B; isolated npm audit 0 vulnerabilities |
| `recast-navigation` | `0.43.1` | MIT | 2026-02-04 | active | `sha512-BVBQEHE6uqD36opJomVkI5TxMVZ8bBLdDn90mYtBUYJnNlqEuNFOL8DH8lLOksfVVaC+kjykYuS57P6MrxVB7A==` | medium until adapter boundary is proven; tarball 9302 B; all-export browser gzip 258473 B; isolated npm audit 0 vulnerabilities |
| `howler` | `2.2.4` | MIT | 2023-09-19 | aging | `sha512-iARIBPgcQrwtEr+tALF+rapJ8qSc+Set2GJQl7xT1MQzWaVkFebdJhR3alVlSiUf5U7nAANKuj3aWpwerocD5w==` | medium until adapter boundary is proven; tarball 72709 B; all-export browser gzip 15336 B; isolated npm audit 0 vulnerabilities |
| `yuka` | `0.7.8` | MIT | 2022-09-17 | dormant-risk | `sha512-G/pFcMZh2Azz7Yy500NSV1jQ0Ru7h9hTNyEW+HjRXcdzjJIyp/3mCGspnx7VJVP06zxORqK6mkl5TywLqVUnVg==` | high; tarball 204105 B; all-export browser gzip 64295 B; isolated npm audit 0 vulnerabilities |
| `bitecs` | `0.4.0` | MPL-2.0 | 2025-12-06 | active | `sha512-ho6Zop/L79DRTnBAfakPpGPuX7y0+lAjX06CpaAW+5tnAc7BH3L3RlSrWAXAqwnQGDZ10GsoxaxyTTsddlun3g==` | medium until adapter boundary is proven; tarball 358155 B; all-export browser gzip 6663 B; isolated npm audit 0 vulnerabilities |
| `miniplex` | `2.0.0` | MIT | 2023-07-16 | dormant-risk | `sha512-pJlxmlPf5Qyx12amgOCyRE6Lzw28ct2G0lF9xn7/xudLtA/xDOUnCIU2xOxCk8GkjePYctcNpjmFshJp/Ht66A==` | high; tarball 17283 B; all-export browser gzip 8824 B; isolated npm audit 0 vulnerabilities |

## Consumer and removal truth

The machine report retains the complete per-package paths for source, dynamic-import, route, fixture, generator/CLI, docs, and installed-consumer evidence. A package with zero direct source consumers is not deletable when its public exports, generators, docs, fixtures, or external-consumer proofs remain. All 26 packages publish at least one export, so none is a `DELETE-NOW` package in Phase 1.

Known overlap queues:

- **physical integration:** duplicate custom physical controller ownership; Phase 2 removal candidate. Owners: cannon-es via PhysicsWorld, KinematicBody/KinematicWorld, CharacterController, VehicleDynamics.
- **navigation and steering:** overlap requires bake-off and consumer graph. Owners: Navigation, Crowd, Steering, route-local AI.
- **audio context/mixing/effects:** potential duplicate browser ownership; Phase 2 characterization required. Owners: AudioContextManager, AudioMixer/Bus, effects wrappers, route/browser unlock handlers.
- **media encoding/publishing:** Node/browser ownership mixed in engine agent API. Owners: browser encoders, FFmpeg adapter, cloud/YouTube publishing.

## Architecture lock

The source-addition baseline is `ce01b95f6a200175b3db7d47f30f8e6fea911018`. Every added `packages/*/src` file after that commit must be mapped to an existing ADR in `tools/final-subsystem-ownership/adr-registry.json`; the current missing-ADR count is **0**. A new package also fails because it has no disposition.

## Decision boundary

No source is deleted by this audit. `DEPRECATE-REMOVE` means a candidate migration queue requiring Phase 2 bake-off, R8 deletion proof, semver review, migration tests, and rollback. `EVIDENCE-ONLY` means the code cannot support a shipped runtime claim and should move only after its consumers are relocated. Dormant-risk libraries are not selected merely because they are familiar.
