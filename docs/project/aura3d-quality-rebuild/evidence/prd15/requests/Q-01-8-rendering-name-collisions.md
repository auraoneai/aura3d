# Q-01-8 — lane 01 converges `@aura3d/rendering` index names onto their owners

- **Requester:** lane 15 (PRD-15 T5.8, `unique-ownership` gate)
- **Owner:** lane 01
- **SLA:** 2 working days
- **Files:** `packages/rendering/src/PbrReference.ts`, `Geometry.ts`, `LightingDebug.ts`, `Texture.ts`

## What

`unique-ownership` fails on names two package indexes export with different
declarations. Rendering-side collisions:

| Name | Canonical owner | Rendering-side declaration |
|---|---|---|
| `Vec3` | `@aura3d/scene/math` | `rendering/src/PbrReference.ts` (barrel-only; §12.4 Q-01-3 asks for delete-or-import) |
| `Bounds3` | `scene/src/Bounds.ts` | `rendering/src/Geometry.ts` |
| `DebugLine` | `physics/src/PhysicsDebugDraw.ts` | `rendering/src/LightingDebug.ts` |
| `TextureMipLevel` | `assets/src/TexturePipeline.ts` | `rendering/src/Texture.ts` |

## Ask

Import the canonical declaration (e.g. `Vec3` from `@aura3d/scene/math`),
alias/rename the rendering-side export, or delete it where the file is
barrel-only anyway (Q-01-7 covers the D-10 orphan list). Allowlisted until then.
