# Final Subsystem Ownership

Generated from `tools/final-subsystem-ownership/index.mjs` at commit `7321247d4da8b3d57af354717455e90e5a5d6852`.

Current selected ownership inventory after evidence-gated subsystem deletion; parity and release claims still require their independent gates.

## Package dispositions

| Package | Disposition | Source lines | Source consumers | Public exports | Built JS gzip | Removal blocked by public export |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `@aura3d/animation` | `AURA-CORE` | 7527 | 75 | 1 | 53698 | yes |
| `@aura3d/apps` | `AURA-MOAT` | 162 | 16 | 1 | 1189 | yes |
| `@aura3d/asset-index` | `AURA-MOAT` | 3438 | 35 | 1 | 24216 | yes |
| `@aura3d/assets` | `AURA-MOAT` | 15854 | 97 | 3 | 109512 | yes |
| `@aura3d/audio` | `BROWSER-STANDARD` | 1696 | 23 | 1 | 13817 | yes |
| `@aura3d/cli` | `AURA-MOAT` | 8777 | 32 | 1 | 78481 | yes |
| `@aura3d/controls` | `AURA-CORE` | 2389 | 15 | 1 | 14881 | yes |
| `@aura3d/core` | `AURA-CORE` | 1186 | 54 | 1 | 7632 | yes |
| `create-aura3d` | `AURA-MOAT` | 8578 | 129 | 1 | 69214 | yes |
| `@aura3d/debug` | `AURA-MOAT` | 1133 | 13 | 1 | 6634 | yes |
| `@aura3d/ecs` | `COMPATIBILITY-ONLY` | 1480 | 23 | 1 | 10016 | yes |
| `@aura3d/editor` | `OPTIONAL-PLUGIN` | 1 | 29 | 1 | 93 | yes |
| `@aura3d/editor-runtime` | `OPTIONAL-PLUGIN` | 7537 | 29 | 1 | 50728 | yes |
| `@aura3d/engine-runtime` | `AURA-MOAT` | 57044 | 11 | 3 | 420449 | no |
| `@aura3d/environments` | `AURA-CORE` | 464 | 5 | 2 | 3059 | yes |
| `@aura3d/input` | `AURA-CORE` | 1983 | 36 | 1 | 14731 | yes |
| `@aura3d/lean` | `AURA-MOAT` | 971 | 30 | 3 | 6624 | yes |
| `@aura3d/materials` | `AURA-CORE` | 339 | 5 | 2 | 2764 | yes |
| `@aura3d/math` | `AURA-CORE` | 1220 | 51 | 1 | 8085 | yes |
| `@aura3d/navigation-recast` | `EXTERNAL-ADAPTER` | 239 | 16 | 1 | 2182 | yes |
| `@aura3d/physics` | `COMPATIBILITY-ONLY` | 6573 | 62 | 3 | 98936 | yes |
| `@aura3d/physics-rapier` | `EXTERNAL-ADAPTER` | 355 | 24 | 1 | 4248 | yes |
| `@aura3d/product-studio` | `AURA-MOAT` | 740 | 29 | 1 | 5152 | yes |
| `@aura3d/react` | `EXTERNAL-ADAPTER` | 173 | 14 | 1 | 1176 | yes |
| `@aura3d/rendering` | `AURA-CORE` | 55665 | 253 | 3 | 401117 | yes |
| `@aura3d/scene` | `AURA-CORE` | 1715 | 156 | 2 | 10512 | yes |
| `@aura3d/scripting` | `COMPATIBILITY-ONLY` | 3692 | 16 | 1 | 39258 | yes |
| `@aura3d/three-compat` | `COMPATIBILITY-ONLY` | 1234 | 19 | 3 | 10389 | yes |
| `@aura3d/workflows` | `AURA-MOAT` | 1174 | 30 | 1 | 8251 | yes |

## Runtime subsystem dispositions

Every package source file is assigned exactly once. General rows inherit the package decision; exceptional rows isolate commodity, compatibility, optional, and evidence-only ownership.

| Subsystem | Package | Disposition | Files | Lines | Built gzip | Maintenance refs | Decision |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `animation-general` | `animation` | `AURA-CORE` | 43 | 7527 | 49641 | 204 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `apps-general` | `apps` | `AURA-MOAT` | 1 | 162 | 1189 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `asset-evidence-fixtures` | `assets` | `EVIDENCE-ONLY` | 1 | 65 | 668 | 5 | Remove evidence-only source from the published runtime after consumer proof. |
| `asset-index-general` | `asset-index` | `AURA-MOAT` | 20 | 3438 | 23364 | 112 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `assets-general` | `assets` | `AURA-MOAT` | 61 | 15789 | 103113 | 248 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `audio-browser-runtime` | `audio` | `BROWSER-STANDARD` | 16 | 1696 | 9134 | 34 | Select one playback owner; retain Aura-specific cue semantics only. |
| `aura3d-cli-general` | `aura3d-cli` | `AURA-MOAT` | 31 | 8777 | 77848 | 825 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `controls-general` | `controls` | `AURA-CORE` | 15 | 2389 | 14881 | 81 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `core-general` | `core` | `AURA-CORE` | 15 | 1186 | 7632 | 128 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `create-aura3d-general` | `create-aura3d` | `AURA-MOAT` | 24 | 8578 | 69214 | 212 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `debug-general` | `debug` | `AURA-MOAT` | 16 | 1133 | 6634 | 33 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `ecs-general` | `ecs` | `COMPATIBILITY-ONLY` | 30 | 1480 | 10016 | 86 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `editor-general` | `editor` | `OPTIONAL-PLUGIN` | 1 | 1 | 93 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `editor-runtime-general` | `editor-runtime` | `OPTIONAL-PLUGIN` | 45 | 7537 | 47290 | 121 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `engine-browser-media` | `engine` | `BROWSER-STANDARD` | 4 | 521 | 3159 | 12 | Keep browser capture separate from Node encoding and publishing. |
| `engine-general` | `engine` | `AURA-MOAT` | 105 | 54964 | 386373 | 924 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `engine-node-media-publishing` | `engine` | `OPTIONAL-PLUGIN` | 9 | 1559 | 10651 | 17 | Keep Node/cloud/FFmpeg ownership isolated behind the dedicated media-node export; never include it in browser entries. |
| `environments-general` | `environments` | `AURA-CORE` | 9 | 464 | 3059 | 1446 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `input-general` | `input` | `AURA-CORE` | 24 | 1983 | 10931 | 86 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `lean-general` | `lean` | `AURA-MOAT` | 5 | 971 | 6624 | 1380 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `materials-general` | `materials` | `AURA-CORE` | 10 | 339 | 2764 | 1448 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `math-general` | `math` | `AURA-CORE` | 19 | 1220 | 8085 | 196 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `navigation-recast-general` | `navigation-recast` | `EXTERNAL-ADAPTER` | 1 | 239 | 2182 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `physics-authored-arcade-motion` | `physics` | `AURA-MOAT` | 4 | 1597 | 11036 | 24 | Keep explicitly non-physical deterministic motion and sampling; never present it as rigid-body simulation. |
| `physics-general` | `physics` | `COMPATIBILITY-ONLY` | 10 | 2519 | 16505 | 451 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `physics-rapier-contract` | `physics` | `EXTERNAL-ADAPTER` | 11 | 2457 | 17396 | 136 | Keep backend-neutral public descriptors over the sole Rapier physical solver. |
| `physics-rapier-general` | `physics-rapier` | `EXTERNAL-ADAPTER` | 1 | 355 | 4248 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `product-studio-general` | `product-studio` | `AURA-MOAT` | 13 | 740 | 5152 | 16 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `react-general` | `react` | `EXTERNAL-ADAPTER` | 1 | 173 | 1176 | 0 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `rendering-general` | `rendering` | `AURA-CORE` | 253 | 55665 | 387797 | 962 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `scene-general` | `scene` | `AURA-CORE` | 22 | 1715 | 10512 | 551 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `scripting-general` | `scripting` | `COMPATIBILITY-ONLY` | 21 | 3692 | 24998 | 45 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `three-compat-general` | `three-compat` | `COMPATIBILITY-ONLY` | 20 | 1234 | 10191 | 19 | Retain under the package disposition; reassess only with consumer and migration evidence. |
| `workflows-general` | `workflows` | `AURA-MOAT` | 20 | 1174 | 8251 | 8 | Retain under the package disposition; reassess only with consumer and migration evidence. |

## External-candidate maintenance lock

A metadata score is not a selection. The retained decisions are bound to runtime, bundle, determinism, disposal, worker, and isolated security measurements; future dependency changes must rerun the same evidence.

| Candidate | Version | License | Modified | Freshness | Integrity | Exit-risk note |
| --- | --- | --- | --- | --- | --- | --- |
| `@dimforge/rapier3d` | `0.20.0` | Apache-2.0 | 2026-08-08 | active | `sha512-Tj5dwOG5kXgcN/JRgOLTk64UFBd9KkaCAsWHcmPXOcyuBX6Vo7/ptSwS6zW++NvZebjJOW9/njmIqTM4VsaUog==` | medium until adapter boundary is proven; tarball 985990 B; all-export browser gzip requires explicit WASM loader (✘ [ERROR] No loader is configured for ".wasm" files: node_modules/@dimforge/rapier3d/rapier_wasm3d_bg.wasm      node_modules/@dimforge/rapier3d/rapier_wasm3d.js:2:22:       2 │ import * as wasm from "./rapier_wasm3d_bg.wasm";         ╵                       ~~~~~~~~~~~~~~~~~~~~~~~~~); isolated npm audit 0 vulnerabilities |
| `@dimforge/rapier3d-compat` | `0.20.0` | Apache-2.0 | 2026-08-08 | active | `sha512-X4W9pJBdGRX5CO3c/gUNjBFEFG2fn4nYxp9k8STdBDaLa0/w5XTW2ArpayS+9jGFojTi3uFSOWAElCd4rkpekA==` | medium until adapter boundary is proven; tarball 3316431 B; all-export browser gzip 1088423 B; isolated npm audit 0 vulnerabilities |
| `recast-navigation` | `0.43.1` | MIT | 2026-02-04 | active | `sha512-BVBQEHE6uqD36opJomVkI5TxMVZ8bBLdDn90mYtBUYJnNlqEuNFOL8DH8lLOksfVVaC+kjykYuS57P6MrxVB7A==` | medium until adapter boundary is proven; tarball 9302 B; all-export browser gzip 258473 B; isolated npm audit 0 vulnerabilities |
| `howler` | `2.2.4` | MIT | 2023-09-19 | aging | `sha512-iARIBPgcQrwtEr+tALF+rapJ8qSc+Set2GJQl7xT1MQzWaVkFebdJhR3alVlSiUf5U7nAANKuj3aWpwerocD5w==` | medium until adapter boundary is proven; tarball 72709 B; all-export browser gzip 15336 B; isolated npm audit 0 vulnerabilities |
| `yuka` | `0.7.8` | MIT | 2022-09-17 | dormant-risk | `sha512-G/pFcMZh2Azz7Yy500NSV1jQ0Ru7h9hTNyEW+HjRXcdzjJIyp/3mCGspnx7VJVP06zxORqK6mkl5TywLqVUnVg==` | high; tarball 204105 B; all-export browser gzip 64295 B; isolated npm audit 0 vulnerabilities |
| `bitecs` | `0.4.0` | MPL-2.0 | 2025-12-06 | active | `sha512-ho6Zop/L79DRTnBAfakPpGPuX7y0+lAjX06CpaAW+5tnAc7BH3L3RlSrWAXAqwnQGDZ10GsoxaxyTTsddlun3g==` | medium until adapter boundary is proven; tarball 358155 B; all-export browser gzip 6663 B; isolated npm audit 0 vulnerabilities |
| `miniplex` | `2.0.0` | MIT | 2023-07-16 | dormant-risk | `sha512-pJlxmlPf5Qyx12amgOCyRE6Lzw28ct2G0lF9xn7/xudLtA/xDOUnCIU2xOxCk8GkjePYctcNpjmFshJp/Ht66A==` | high; tarball 17283 B; all-export browser gzip 8824 B; isolated npm audit 0 vulnerabilities |

## Consumer and removal truth

The machine report retains the complete per-package paths for source, dynamic-import, route, fixture, generator/CLI, docs, and installed-consumer evidence. A package with zero direct source consumers is not deletable when its public exports, generators, docs, fixtures, or external-consumer proofs remain. All 29 packages publish at least one export, so none is a `DELETE-NOW` package in this inventory.

Known overlap queues:

- **physical integration:** single selected owner; PhysicsWorld is the backend-neutral public contract. Owners: @dimforge/rapier3d-compat through @aura3d/physics-rapier.
- **authored-unit arcade motion:** non-physical capability with one semantic owner split into low-level and public layers. Owners: KinematicBody/KinematicWorld, ArcadeVehicleTelemetry, GameRuntime.
- **navigation and crowd:** single selected owner after the major-version migration. Owners: optional Recast/Detour adapter.
- **audio context/mixing/effects:** single selected browser-standard owner; Howler rejected because it would duplicate context, cache, playback, spatial, and unlock ownership. Owners: @aura3d/audio over Web Audio.
- **media encoding/publishing:** browser and Node ownership separated by public export graph and browser-entry purity tests. Owners: browser capture/encoders in browser exports, FFmpeg/cloud/YouTube adapters in @aura3d/engine/media-node.

## Architecture lock

The source-addition baseline is `ce01b95f6a200175b3db7d47f30f8e6fea911018`. Every added `packages/*/src` file after that commit must be mapped to an existing ADR in `tools/final-subsystem-ownership/adr-registry.json`; the current missing-ADR count is **0**. A new package also fails because it has no disposition.

## Decision boundary

No source is deleted by this audit. `DEPRECATE-REMOVE` means a candidate migration queue requiring Phase 2 bake-off, R8 deletion proof, semver review, migration tests, and rollback. `EVIDENCE-ONLY` means the code cannot support a shipped runtime claim and should move only after its consumers are relocated. Dormant-risk libraries are not selected merely because they are familiar.
