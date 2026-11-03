/** Legacy game namespace: synchronous collision construction retains the 4.x physics binding. */
import { createGameCollisionWorld, createGamePlanarCollisionWorld } from "../../GameRuntime.js";
import { createGameNamespaceWithCollisionFactories } from "./core.js";

export { collectGameRuntimeEvidence, createGameNamespaceWithPhysicsWorldAccess } from "./core.js";

export const game = createGameNamespaceWithCollisionFactories(createGameCollisionWorld, createGamePlanarCollisionWorld);
