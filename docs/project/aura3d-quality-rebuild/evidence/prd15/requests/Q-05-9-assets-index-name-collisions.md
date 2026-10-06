# Q-05-9 — lane 05 converges asset-package index names onto their owners

- **Requester:** lane 15 (PRD-15 T5.8, `unique-ownership` gate)
- **Owner:** lane 05
- **SLA:** 2 working days
- **Files:** `packages/asset-index/src/animation-profile.ts`, `packages/assets/src/TexturePipeline.ts`, `packages/aura3d-cli/src/index.ts`

## What

`unique-ownership` fails on names two package indexes export with different
declarations. 05-side collisions:

| Name | Other owner(s) | 05-side declaration |
|---|---|---|
| `AnimationAssetCategory` | `@aura3d/editor` + `@aura3d/editor-runtime` | `asset-index/src/animation-profile.ts` |
| `TextureMipLevel` | `rendering/src/Texture.ts` | `assets/src/TexturePipeline.ts` |
| `inspectAsset` | `@aura3d/engine` (deprecated → `./assets`, removed 4.0.0) | `aura3d-cli/src/index.ts` |

## Ask

One package per name: import the canonical declaration, re-export it under a
scoped name, or drop the duplicate export. Engine's `inspectAsset` re-export
disappears at 4.0.0 (T8.1) so only the CLI re-export needs to survive.
Allowlisted until then.
