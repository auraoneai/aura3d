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
    const { ensurePhysics } = await import("@aura3d/physics");
    await ensurePhysics();
  }
};

export const physics = createPhysicsWithAccess(legacyNamespaceAccess);

export function createRuntimeScenePhysics(snapshot: AuraSceneSnapshot): AuraRuntimeScenePhysics | undefined {
  return createRuntimeScenePhysicsWithAccess(legacyPhysicsWorldAccess, snapshot);
}
