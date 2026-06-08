# Aura3D Character Controller (template)

Input-driven locomotion: keyboard → kinematic speed → `@aura3d/animation` locomotion kit
(idle/walk/run blended by speed via `BlendTree1D` + the locomotion state graph) → live proof.

Hold **W/A/S/D** (or arrows) to walk; hold **Shift** to run.

## Commands

```bash
npm install
npm run dev      # live preview route (exposes window.__AURA3D_CHARACTER_CONTROLLER_PROOF__)
npm run build
npm test         # route-health + screenshot
```

## How it composes the engine

- `src/controller.ts` — pure kinematic `stepCharacterSpeed` (accel/decel toward walk/run targets).
- `src/main.ts` — keyboard input → `stepCharacterSpeed` → `createLocomotionKit(...).sample(speed)` →
  blended clip weights + state, exposed as a proof object.

## Physics capsule path (optional)

For a grounded 3D capsule instead of the kinematic model, swap `stepCharacterSpeed` for
`@aura3d/physics` `createFightingCharacterController()` and feed its resulting speed into the same
locomotion kit. That requires a physics world + a rigged GLB character (see
`docs/animation/runtime-support.md`).

## Non-goals

Not a Unity Mecanim / Unreal Control Rig replacement; no motion matching, no full-body IK, no
ragdoll. See `docs/project/known-limits.md`.
