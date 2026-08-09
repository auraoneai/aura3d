# Final Subsystem Ownership

Generated from `tools/final-subsystem-ownership/index.mjs` at commit `d69c2c22056031b2c0abf4d2a40e7d78636f43ee`.

Phase 1 ownership inventory and migration queue only; no deletion, dependency selection, parity, or release claim.

## Package dispositions

| Package | Disposition | Source lines | Source consumers | Public exports | Built JS gzip | Removal blocked by public export |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `@aura3d/animation` | `AURA-CORE` | 7527 | 74 | 1 | 53722 | yes |
| `@aura3d/apps` | `AURA-MOAT` | 162 | 16 | 1 | 1190 | yes |
| `@aura3d/asset-index` | `AURA-MOAT` | 3438 | 35 | 1 | 24286 | yes |
| `@aura3d/assets` | `AURA-MOAT` | 15823 | 88 | 3 | 109159 | yes |
| `@aura3d/audio` | `BROWSER-STANDARD` | 1696 | 19 | 1 | 13124 | yes |
| `@aura3d/cli` | `AURA-MOAT` | 8757 | 32 | 1 | 78405 | yes |
| `@aura3d/controls` | `AURA-CORE` | 2389 | 14 | 1 | 14931 | yes |
| `@aura3d/core` | `AURA-CORE` | 1186 | 52 | 1 | 7644 | yes |
| `create-aura3d` | `AURA-MOAT` | 8574 | 127 | 1 | 69180 | yes |
| `@aura3d/debug` | `AURA-MOAT` | 1133 | 13 | 1 | 6632 | yes |
| `@aura3d/ecs` | `COMPATIBILITY-ONLY` | 1480 | 23 | 1 | 10078 | yes |
| `@aura3d/editor` | `OPTIONAL-PLUGIN` | 1 | 28 | 1 | 93 | yes |
| `@aura3d/editor-runtime` | `OPTIONAL-PLUGIN` | 7537 | 28 | 1 | 50811 | yes |
| `@aura3d/engine-runtime` | `AURA-MOAT` | 56873 | 11 | 3 | 409090 | no |
| `@aura3d/environments` | `AURA-CORE` | 464 | 5 | 2 | 3050 | yes |
| `@aura3d/input` | `AURA-CORE` | 1983 | 34 | 1 | 14695 | yes |
| `@aura3d/materials` | `AURA-CORE` | 339 | 5 | 2 | 2760 | yes |
| `@aura3d/math` | `AURA-CORE` | 1220 | 49 | 1 | 8067 | yes |
| `@aura3d/navigation-recast` | `EXTERNAL-ADAPTER` | 239 | 7 | 1 | 0 | yes |
| `@aura3d/physics` | `COMPATIBILITY-ONLY` | 8561 | 47 | 3 | 102048 | yes |
| `@aura3d/physics-rapier` | `EXTERNAL-ADAPTER` | 160 | 6 | 1 | 2329 | yes |
| `@aura3d/product-studio` | `AURA-MOAT` | 696 | 29 | 1 | 4893 | yes |
| `@aura3d/react` | `EXTERNAL-ADAPTER` | 173 | 14 | 1 | 1182 | yes |
| `@aura3d/rendering` | `AURA-CORE` | 54782 | 224 | 3 | 390609 | yes |
| `@aura3d/scene` | `AURA-CORE` | 1708 | 148 | 2 | 10343 | yes |
| `@aura3d/scripting` | `COMPATIBILITY-ONLY` | 3692 | 16 | 1 | 39403 | yes |
| `@aura3d/three-compat` | `COMPATIBILITY-ONLY` | 1234 | 19 | 3 | 10386 | yes |
| `@aura3d/workflows` | `AURA-MOAT` | 1174 | 29 | 1 | 8260 | yes |

## Runtime subsystem dispositions

Every package source file is assigned exactly once. General rows inherit the package decision; exceptional rows isolate commodity, compatibility, optional, and evidence-only ownership.

| Subsystem | Package | Disposition | Files | Lines | Built gzip | Maintenance refs | Decision |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `animation-general` | `animation` | `AURA-CORE` | 43 | 7527 | 49680 | 200 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `apps-general` | `apps` | `AURA-MOAT` | 1 | 162 | 1190 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `asset-evidence-fixtures` | `assets` | `EVIDENCE-ONLY` | 1 | 65 | 674 | 5 | Remove evidence-only source from the published runtime after consumer proof. |
| `asset-index-general` | `asset-index` | `AURA-MOAT` | 20 | 3438 | 23414 | 113 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `assets-general` | `assets` | `AURA-MOAT` | 61 | 15758 | 102750 | 230 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `audio-browser-runtime` | `audio` | `BROWSER-STANDARD` | 16 | 1696 | 8464 | 31 | Select one playback owner; retain Aura-specific cue semantics only. |
| `aura3d-cli-general` | `aura3d-cli` | `AURA-MOAT` | 31 | 8757 | 77735 | 793 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `controls-general` | `controls` | `AURA-CORE` | 15 | 2389 | 14931 | 68 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `core-general` | `core` | `AURA-CORE` | 15 | 1186 | 7644 | 123 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `create-aura3d-general` | `create-aura3d` | `AURA-MOAT` | 24 | 8574 | 69180 | 208 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `debug-general` | `debug` | `AURA-MOAT` | 16 | 1133 | 6632 | 33 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `ecs-general` | `ecs` | `COMPATIBILITY-ONLY` | 30 | 1480 | 10078 | 84 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `editor-general` | `editor` | `OPTIONAL-PLUGIN` | 1 | 1 | 93 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `editor-runtime-general` | `editor-runtime` | `OPTIONAL-PLUGIN` | 45 | 7537 | 47379 | 119 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `engine-browser-media` | `engine` | `BROWSER-STANDARD` | 4 | 521 | 3170 | 11 | Keep browser capture separate from Node encoding and publishing. |
| `engine-general` | `engine` | `AURA-MOAT` | 105 | 54793 | 380791 | 871 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `engine-node-media-publishing` | `engine` | `OPTIONAL-PLUGIN` | 9 | 1559 | 10660 | 18 | Remove Node/cloud/FFmpeg ownership from browser entries. |
| `environments-general` | `environments` | `AURA-CORE` | 9 | 464 | 3050 | 1339 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `input-general` | `input` | `AURA-CORE` | 24 | 1983 | 10744 | 74 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `materials-general` | `materials` | `AURA-CORE` | 10 | 339 | 2760 | 1341 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `math-general` | `math` | `AURA-CORE` | 19 | 1220 | 8067 | 177 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `navigation-recast-general` | `navigation-recast` | `EXTERNAL-ADAPTER` | 1 | 239 | 0 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `physics-authored-arcade-motion` | `physics` | `AURA-MOAT` | 3 | 1466 | 5075 | 14 | Keep explicitly non-physical deterministic motion and sampling; never present it as rigid-body simulation. |
| `physics-cannon-adapter` | `physics` | `EXTERNAL-ADAPTER` | 12 | 3937 | 32389 | 133 | Compare against current Rapier topology; exactly one physical solver may remain. |
| `physics-custom-physical-controller` | `physics` | `DEPRECATE-REMOVE` | 1 | 718 | 7706 | 29 | Retain only until the optional-engine migration proof identifies replacements. |
| `physics-general` | `physics` | `COMPATIBILITY-ONLY` | 9 | 2440 | 16083 | 429 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `physics-rapier-general` | `physics-rapier` | `EXTERNAL-ADAPTER` | 1 | 160 | 2329 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `product-studio-general` | `product-studio` | `AURA-MOAT` | 13 | 696 | 4893 | 15 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `react-general` | `react` | `EXTERNAL-ADAPTER` | 1 | 173 | 1182 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `rendering-general` | `rendering` | `AURA-CORE` | 252 | 54782 | 370830 | 900 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `scene-general` | `scene` | `AURA-CORE` | 22 | 1708 | 10343 | 520 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `scripting-general` | `scripting` | `COMPATIBILITY-ONLY` | 21 | 3692 | 25121 | 45 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `three-compat-general` | `three-compat` | `COMPATIBILITY-ONLY` | 20 | 1234 | 10185 | 19 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `workflows-general` | `workflows` | `AURA-MOAT` | 20 | 1174 | 8260 | 7 | Retain under the package disposition; reassess only with consumer and migration evidence. |

## External-candidate maintenance lock

A metadata score is not a selection. Runtime, bundle, determinism, disposal, worker, and isolated security measurements remain mandatory in Phase 2.

| Candidate | Version | License | Modified | Freshness | Integrity | Exit-risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `@dimforge/rapier3d` | `0.20.0` | Apache-2.0 | 2026-08-08 | active | `sha512-Tj5dwOG5kXgcN/JRgOLTk64UFBd9KkaCAsWHcmPXOcyuBX6Vo7/ptSwS6zW++NvZebjJOW9/njmIqTM4VsaUog==` | medium until adapter boundary is proven; tarball 985990 B; all-export browser gzip requires explicit WASM loader (✘ [ERROR] No loader is configured for ".wasm" files: node_modules/@dimforge/rapier3d/rapier_wasm3d_bg.wasm      node_modules/@dimforge/rapier3d/rapier_wasm3d.js:2:22:       2 │ import * as wasm from "./rapier_wasm3d_bg.wasm";         ╵                       ~~~~~~~~~~~~~~~~~~~~~~~~~); isolated npm audit 0 vulnerabilities |
| `@dimforge/rapier3d-compat` | `0.20.0` | Apache-2.0 | 2026-08-08 | active | `sha512-X4W9pJBdGRX5CO3c/gUNjBFEFG2fn4nYxp9k8STdBDaLa0/w5XTW2ArpayS+9jGFojTi3uFSOWAElCd4rkpekA==` | medium until adapter boundary is proven; tarball 3316431 B; all-export browser gzip 1088423 B; isolated npm audit 0 vulnerabilities |
| `cannon-es` | `0.20.0` | MIT | 2022-08-12 | dormant-risk | `sha512-eZhWTZIkFOnMAJOgfXJa9+b3kVlvG+FX4mdkpePev/w/rP5V8NRquGyEozcjPfEoXUlb+p7d9SUcmDSn14prOA==` | high; tarball 164649 B; all-export browser gzip 62507 B; isolated npm audit 0 vulnerabilities |
| `recast-navigation` | `0.43.1` | MIT | 2026-02-04 | active | `sha512-BVBQEHE6uqD36opJomVkI5TxMVZ8bBLdDn90mYtBUYJnNlqEuNFOL8DH8lLOksfVVaC+kjykYuS57P6MrxVB7A==` | medium until adapter boundary is proven; tarball 9302 B; all-export browser gzip 258473 B; isolated npm audit 0 vulnerabilities |
| `howler` | `2.2.4` | MIT | 2023-09-19 | aging | `sha512-iARIBPgcQrwtEr+tALF+rapJ8qSc+Set2GJQl7xT1MQzWaVkFebdJhR3alVlSiUf5U7nAANKuj3aWpwerocD5w==` | medium until adapter boundary is proven; tarball 72709 B; all-export browser gzip 15336 B; isolated npm audit 0 vulnerabilities |
| `yuka` | `0.7.8` | MIT | 2022-09-17 | dormant-risk | `sha512-G/pFcMZh2Azz7Yy500NSV1jQ0Ru7h9hTNyEW+HjRXcdzjJIyp/3mCGspnx7VJVP06zxORqK6mkl5TywLqVUnVg==` | high; tarball 204105 B; all-export browser gzip 64295 B; isolated npm audit 0 vulnerabilities |
| `bitecs` | `0.4.0` | MPL-2.0 | 2025-12-06 | active | `sha512-ho6Zop/L79DRTnBAfakPpGPuX7y0+lAjX06CpaAW+5tnAc7BH3L3RlSrWAXAqwnQGDZ10GsoxaxyTTsddlun3g==` | medium until adapter boundary is proven; tarball 358155 B; all-export browser gzip 6663 B; isolated npm audit 0 vulnerabilities |
| `miniplex` | `2.0.0` | MIT | 2023-07-16 | dormant-risk | `sha512-pJlxmlPf5Qyx12amgOCyRE6Lzw28ct2G0lF9xn7/xudLtA/xDOUnCIU2xOxCk8GkjePYctcNpjmFshJp/Ht66A==` | high; tarball 17283 B; all-export browser gzip 8824 B; isolated npm audit 0 vulnerabilities |

## Consumer and removal truth

The machine report retains the complete per-package paths for source, dynamic-import, route, fixture, generator/CLI, docs, and installed-consumer evidence. A package with zero direct source consumers is not deletable when its public exports, generators, docs, fixtures, or external-consumer proofs remain. All 28 packages publish at least one export, so none is a `DELETE-NOW` package in this inventory.

Known overlap queues:

- **physical integration:** duplicate physical ownership remains until the major migration. Owners: cannon-es via PhysicsWorld, CharacterController, optional Rapier adapter.
- **authored-unit arcade motion:** non-physical capability with one semantic owner split into low-level and public layers. Owners: KinematicBody/KinematicWorld, ArcadeVehicleTelemetry, GameRuntime.
- **navigation and crowd:** single selected owner after the major-version migration. Owners: optional Recast/Detour adapter.
- **audio context/mixing/effects:** potential duplicate browser ownership; Phase 2 characterization required. Owners: AudioContextManager, AudioMixer/Bus, effects wrappers, route/browser unlock handlers.
- **media encoding/publishing:** Node/browser ownership mixed in engine agent API. Owners: browser encoders, FFmpeg adapter, cloud/YouTube publishing.

## Architecture lock

The source-addition baseline is `ce01b95f6a200175b3db7d47f30f8e6fea911018`. Every added `packages/*/src` file after that commit must be mapped to an existing ADR in `tools/final-subsystem-ownership/adr-registry.json`; the current missing-ADR count is **0**. A new package also fails because it has no disposition.

## Decision boundary

No source is deleted by this audit. `DEPRECATE-REMOVE` means a candidate migration queue requiring Phase 2 bake-off, R8 deletion proof, semver review, migration tests, and rollback. `EVIDENCE-ONLY` means the code cannot support a shipped runtime claim and should move only after its consumers are relocated. Dormant-risk libraries are not selected merely because they are familiar.
