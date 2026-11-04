// Initialises the Rapier solver. A no-op in the default build (initialised at module load); required before the first world in the
// `aura3d-no-tla` build, which has no top-level await.
//
// This is a pure re-export so the root barrel keeps the solver's nominal declaration types reachable. The solver-free
// declaration surface used by `@aura3d/physics/world` (and so by the engine's declarations) is `ensureOpaque.ts`.
export { ensurePhysics, physicsInitMode } from "@aura3d/physics-rapier";
