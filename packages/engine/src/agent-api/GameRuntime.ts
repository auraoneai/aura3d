/**
 * Compatibility entry for the 4.x synchronous collision-world factories.
 * Other game runtime operations live in the access-independent core.
 */
import type { PhysicsWorldDescriptor } from "@aura3d/physics/solverless";
import { legacyPhysicsWorldAccess } from "../public/legacy-physics-access.js";
import {
  createGameCollisionWorldWithPhysicsWorldAccess,
  createGamePlanarCollisionWorldWithPhysicsWorldAccess,
  type GameCollisionWorld
} from "./GameRuntimeCore.js";

export * from "./GameRuntimeCore.js";

export function createGameCollisionWorld(descriptor: PhysicsWorldDescriptor = {}): GameCollisionWorld {
  return createGameCollisionWorldWithPhysicsWorldAccess(legacyPhysicsWorldAccess, descriptor);
}

/** Create a collision-only world with zero gravity for gameplay on a fixed plane. */
export function createGamePlanarCollisionWorld(
  descriptor: Omit<PhysicsWorldDescriptor, "gravity"> = {}
): GameCollisionWorld {
  return createGamePlanarCollisionWorldWithPhysicsWorldAccess(legacyPhysicsWorldAccess, descriptor);
}
