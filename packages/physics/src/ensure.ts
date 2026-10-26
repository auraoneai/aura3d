// Initialises the Rapier solver. A no-op in the default build (initialised at module load); required before the first world in the
// `aura3d-no-tla` build, which has no top-level await.
export { ensurePhysics, physicsInitMode } from "@aura3d/physics-rapier";
