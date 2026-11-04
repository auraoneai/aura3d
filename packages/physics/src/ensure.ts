// Initialises the Rapier solver. A no-op in the default build (initialised at module load); required before the first world in the
// `aura3d-no-tla` build, which has no top-level await.
//
// The declared types deliberately do not mention `@dimforge/rapier3d-compat`: that package is an optional peer, so a strict
// consumer (`skipLibCheck: false`) that has not installed it would otherwise fail on `import("@dimforge/rapier3d-compat")` in
// the emitted declarations. The solver module is an implementation detail; callers get it as an opaque namespace object.
import { ensurePhysics as ensureSolver, physicsInitMode as solverInitMode } from "@aura3d/physics-rapier";

/** The initialised solver module (Rapier's namespace), typed structurally so consumers need not have it installed. */
export type PhysicsSolverModule = Readonly<Record<string, unknown>>;

/** Resolves with the initialised solver module once it is ready (immediately in the default build), or `null` when it is unavailable. */
export const ensurePhysics: () => Promise<PhysicsSolverModule | null> = ensureSolver;
/** How the solver initialises: at module load (`top-level-await`) or on the first `ensurePhysics()` (`lazy`). */
export const physicsInitMode: "top-level-await" | "lazy" = solverInitMode;
