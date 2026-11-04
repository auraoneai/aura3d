/** Compatibility bindings for the 4.x synchronous physics entry. */
import type { AuraSceneSnapshot } from "./types.js";
import type { PhysicsWorldAccess } from "../physics/PhysicsWorldProvider.js";
import { legacyPhysicsWorldAccess } from "../../public/legacy-physics-access.js";
import { createPhysicsWithAccess, createRuntimeScenePhysicsWithAccess, type AuraRuntimeScenePhysics } from "./physics-core.js";

export * from "./physics-core.js";

// Preserve the original 4.x async loader and its initialization/error behavior.
// Isolated entries instead use their own access.preload() implementation.
const legacyNamespaceAccess: PhysicsWorldAccess = {
  requireReady: () => legacyPhysicsWorldAccess.requireReady(),
  async preload() {
    const { ensurePhysics } = await import("@aura3d/physics/world");
    await ensurePhysics();
  }
};

// Annotated explicitly: an inferred type would let tsc spell the physics types through the `@aura3d/physics` root barrel, whose
// declarations reach the optional Rapier peer. `physics-core` names them from the solver-free `@aura3d/physics/solverless`.
export const physics: ReturnType<typeof createPhysicsWithAccess> = createPhysicsWithAccess(legacyNamespaceAccess);

export function createRuntimeScenePhysics(snapshot: AuraSceneSnapshot): AuraRuntimeScenePhysics | undefined {
  return createRuntimeScenePhysicsWithAccess(legacyPhysicsWorldAccess, snapshot);
}
