# Q-08-2 — lane 08 converges `@aura3d/input` index names onto their owners

- **Requester:** lane 15 (PRD-15 T5.8, `unique-ownership` gate)
- **Owner:** lane 08
- **SLA:** 2 working days
- **Files:** `packages/input/src/controls/{ControlTypes,OrbitControls,FirstPersonControls,PointerLockControls}.ts`, `packages/input/src/InteractionSystem.ts`

## What

`unique-ownership` fails on names two package indexes export with different
declarations. Input-side collisions:

| Name | Canonical owner | Input-side declaration |
|---|---|---|
| `Vec3Like` | `@aura3d/scene/math` (see also Q-09-4, audio side) | `input/src/controls/ControlTypes.ts` |
| `OrbitControls`, `FirstPersonControls`, `PointerLockControls` | `@aura3d/controls` (T6.9 controls dedup) | `input/src/controls/*.ts` |
| `InteractionRayProvider` | `controls/src/InteractionControls.ts` | `input/src/InteractionSystem.ts` |

## Ask

Re-export the canonical declarations instead of keeping input-side copies
(the controls trio collapse onto `@aura3d/controls` is lane 15's T6.9 work —
the input-side exports just need to converge or rename). Allowlisted until then.
