# @aura3d/physics-rapier

Optional physical simulation for Aura3D, backed by exact
`@dimforge/rapier3d-compat@0.19.3`. The package is asynchronous and optional.
The compat build is selected because it is portable across the supported
bundlers without requiring each application to configure a raw-WASM loader; its
larger lazy payload is disclosed by the retained bundle report.

It is deliberately absent from core, product, and authored-unit arcade bundles.
Install and initialize it only for physical rigid bodies, joints, queries,
character collision, or raycast vehicles:

```ts
import { createRapierPhysics } from "@aura3d/physics-rapier";

const physics = await createRapierPhysics({ gravity: [0, -9.81, 0] });
const floor = physics.createBody({ type: "fixed", shape: { kind: "box", halfExtents: [10, 0.5, 10] } });
const ball = physics.createBody({ position: [0, 4, 0], shape: { kind: "sphere", radius: 0.5 } });
physics.step(1 / 60);
physics.dispose();
```

This is physical simulation. `game.racing` and the default authored-unit arcade
helpers remain separate and do not claim physical tyre, mass, or force semantics.

## Public API

- `createRapierPhysics(options?)` lazily initializes Rapier and returns the sole
  Aura3D-owned physical-world adapter.
- `RapierPhysics` owns rigid bodies, colliders, stepping, ray queries, fixed
  joints, native character controllers, native vehicle controllers, and final
  disposal.
- `RapierBody` exposes explicit transform, velocity, impulse, and removal
  operations without hiding Rapier's authored-unit physical semantics.
- `rawModule` and `rawWorld` are documented escape hatches for unsupported
  Rapier features; no private import is required.

## Verification

Run `pnpm exec vitest run tests/unit/physics-rapier` for adapter and dependency-
boundary coverage. Run `pnpm exec playwright test
tests/browser/optional-rapier-physics.spec.ts` for cold/cached initialization,
browser queries/controllers, repeated disposal, and console-error evidence.
