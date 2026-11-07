// Typed missing-Rapier-backend error contract, kept in its own leaf module so the app core can recognise it without
// importing the provider.
/** Stable code carried by the typed missing-backend error (same value as `@aura3d/physics-rapier`). */
export const PHYSICS_BACKEND_MISSING_CODE = "PHYSICS_BACKEND_MISSING";
export const PHYSICS_BACKEND_INSTALL_COMMAND = "npm install @dimforge/rapier3d-compat@0.20.0";

/** Structural check: the engine never imports the backend package, so it recognises the typed error by its code. */
export function isPhysicsBackendMissing(error: unknown): boolean {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) return false;
  try { return Reflect.get(error, "code") === PHYSICS_BACKEND_MISSING_CODE; } catch { return false; }
}

export function physicsBackendMissingError(cause: unknown): Error {
  if (isPhysicsBackendMissing(cause)) return cause as Error;
  return Object.assign(
    new Error(`${PHYSICS_BACKEND_MISSING_CODE}: Aura3D physics needs the Rapier backend @dimforge/rapier3d-compat, which is not installed. Install it with: ${PHYSICS_BACKEND_INSTALL_COMMAND}`, { cause }),
    { name: "PhysicsBackendMissingError", code: PHYSICS_BACKEND_MISSING_CODE, installCommand: PHYSICS_BACKEND_INSTALL_COMMAND }
  );
}

