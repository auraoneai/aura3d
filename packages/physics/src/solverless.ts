/**
 * WS-2.2 — the parts of `@aura3d/physics` that do NOT reach the rigid-body solver.
 *
 * ## Why this exists
 *
 * `createAuraApp` needs a handful of physics values at module scope: `Shape` to translate a declared
 * collider, `PhysicsStepper` to drive a fixed timestep, `ScenePhysicsBridge` to push transforms, and
 * `PhysicsDebugDraw` to draw colliders. Every one of those files is **cannon-free** — they import
 * `PhysicsWorld` as a *type* only.
 *
 * But they were reached through `@aura3d/physics`, whose barrel is a chain of `export *`, and one of
 * those re-exports is `PhysicsWorld` — which imports `cannon-es`. So a scene with **no bodies at all**
 * downloaded the whole solver. Measured on scenario 1 (one cube, no physics): a **77,081-byte gzip
 * chunk** on the critical path, of which `cannon-es` is 83,869 bytes raw.
 *
 * This is *not* the same defect as eager construction. `createAuraApp` already constructs its world
 * lazily and carries a comment recording that eager construction cost 85 KB — that fix was correct and
 * insufficient, because a lazy `new` still leaves a static `import`. A bundler keeps the module either
 * way. Deferring the *import* is what actually removes the bytes.
 *
 * ## What is deliberately absent
 *
 * `PhysicsWorld`, `NarrowPhase`, `CharacterController`, `HitboxWorld`, arcade vehicle telemetry and the
 * fixture modules. Anything that simulates. `@aura3d/physics` still exports all of them, and
 * `createAuraApp` loads the world through `await import("@aura3d/physics")` when a scene actually
 * declares a body — so behaviour is unchanged and only the download moves.
 */
export { Shape } from "./Shape.js";
export type { BoxShape, Bounds, CapsuleShape, ConvexHullShape, HeightfieldShape, MeshShape, PhysicsShape, PlaneShape, SphereShape, Vec3 } from "./Shape.js";
export { EPSILON, vec3 } from "./Shape.js";
export { PhysicsStepper } from "./PhysicsStepper.js";
export type { PhysicsStepperResult } from "./PhysicsStepper.js";
export { ScenePhysicsBridge } from "./ScenePhysicsBridge.js";
export type { ScenePhysicsBinding, ScenePhysicsNode } from "./ScenePhysicsBridge.js";
export { PhysicsDebugDraw } from "./PhysicsDebugDraw.js";
export type { DebugLine } from "./PhysicsDebugDraw.js";
/*
 * Mesh queries are geometry, not simulation. `MeshBVH` and `SurfaceQuery` import only `Shape`'s
 * types, so grounding a vehicle or a character on a real mesh needs no solver — which is also WS-4.5's
 * point about MeshBVH having responsibilities beyond physics contact.
 */
export { buildMeshBVH, raycastMesh, raycastMeshBruteForce } from "./MeshBVH.js";
export type { MeshBVH, MeshBVHBuildOptions, MeshRayHit, RaycastMeshOptions } from "./MeshBVH.js";
export { createMeshSurfaceQuery } from "./SurfaceQuery.js";
export type { MeshSurfaceQuery, MeshSurfaceQueryOptions, SurfaceSample } from "./SurfaceQuery.js";
