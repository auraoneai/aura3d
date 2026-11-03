import { createPhysicsWorldProvider } from "../agent-api/physics/PhysicsWorldProvider.js";
import type { PhysicsWorldProvider } from "../agent-api/physics/PhysicsWorldAccess.js";
import { createPhysicsWithAccess } from "../agent-api/nodes/physics-core.js";
import { createGameNamespaceWithPhysicsWorldAccess } from "../agent-api/nodes/game/core.js";
import { createGamesWithPhysicsWorldAccess } from "../agent-api/nodes/games-core.js";
import { createSceneKitsWithGames } from "../agent-api/nodes/sceneKitsCore.js";
import { createAuraAppWithPhysicsWorldAccess } from "../agent-api/app/createAuraAppCore.js";
import { createGameAppWithPhysicsWorldAccess } from "../agent-api/app/createGameAppCore.js";
import { MINI_GOLF_LAYOUT, prefabs } from "../agent-api/nodes/prefabs/index.js";
import { scene } from "../agent-api/nodes/scene.js";
import { camera } from "../agent-api/nodes/camera.js";
import { lights } from "../agent-api/nodes/lights.js";
import { timeline } from "../agent-api/nodes/timeline.js";
import { createFightingGameKit, fighting } from "../agent-api/game-kits/fighting.js";
import type { AuraAppTarget, AuraCreateAppOptions, AuraCreateGameAppOptions } from "../agent-api/nodes/types/runtime.js";

/** One provider is shared by the versioned engine and its game subpath. @internal */
export const v5PhysicsWorldAccess: PhysicsWorldProvider = createPhysicsWorldProvider();

/** Load the optional physics backend before synchronous v5 world creation. */
export function preloadPhysics(): Promise<void> { return v5PhysicsWorldAccess.preload(); }

export const physics = createPhysicsWithAccess(v5PhysicsWorldAccess);
export const game = createGameNamespaceWithPhysicsWorldAccess(v5PhysicsWorldAccess);

// Live getters avoid reading shared builder bindings while cyclic modules are
// still initializing. The access itself remains owned by this entry.
export const games = createGamesWithPhysicsWorldAccess(v5PhysicsWorldAccess, {
  get layout() { return MINI_GOLF_LAYOUT; },
  get prefabs() { return prefabs; },
  get scene() { return scene; },
  get camera() { return camera; },
  get lights() { return lights; },
  get timeline() { return timeline; },
  get fightingGameKit() { return fighting; },
  get createFightingGameKit() { return createFightingGameKit; }
});
export const sceneKits = createSceneKitsWithGames(games);

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions) {
  return createAuraAppWithPhysicsWorldAccess(v5PhysicsWorldAccess, target, options);
}

export function createGameApp(target: AuraAppTarget, options: AuraCreateGameAppOptions) {
  return createGameAppWithPhysicsWorldAccess(v5PhysicsWorldAccess, target, options);
}

/** @internal The game facade uses this factory with the same entry access. */
export { createGameAppWithPhysicsWorldAccess };
