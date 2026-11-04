// Solver-free declaration view of `ensure.ts`, used by the `@aura3d/physics/world` entry (which the engine's declarations reach).
//
// The declared types deliberately do not mention `@aura3d/physics-rapier` or `@dimforge/rapier3d-compat`: the latter is an optional
// peer, so a strict consumer (`skipLibCheck: false`) that has not installed it would otherwise fail on the solver's declarations.
// The solver module is an implementation detail; callers get it as an opaque namespace object. Runtime behaviour is identical to
// `ensure.ts` (the same functions).
import { ensurePhysics as ensureSolver, physicsInitMode as solverInitMode } from "./ensure.js";

/** The initialised solver module (Rapier's namespace), typed structurally so consumers need not have it installed. */
export type PhysicsSolverModule = Readonly<Record<string, unknown>>;

/** Resolves with the initialised solver module once it is ready (immediately in the default build), or `null` when the optional solver is absent. */
export const ensurePhysics: () => Promise<PhysicsSolverModule | null> = ensureSolver;
/** How the solver initialises: at module load (`top-level-await`) or on the first `ensurePhysics()` (`lazy`). */
export const physicsInitMode: "top-level-await" | "lazy" = solverInitMode;
