/** Legacy mini-game entry; the provider-bound implementation is in games-core. */
import { legacyPhysicsWorldAccess } from "../../public/legacy-physics-access.js";
import type { PhysicsWorldAccess } from "../physics/PhysicsWorldProvider.js";
import { MINI_GOLF_LAYOUT, prefabs } from "./prefabs/index.js";
import { scene } from "./scene.js";
import { camera } from "./camera.js";
import { lights } from "./lights.js";
import { timeline } from "./timeline.js";
import { createFightingGameKit, fighting as fightingGameKit } from "../game-kits/fighting.js";
import { createGamesWithPhysicsWorldAccess as createGamesCoreWithPhysicsWorldAccess } from "./games-core.js";

export { normalizeAuraVec3 } from "./games-core.js";

// Resolve entry bindings on first use so shared scene and game modules can
// finish initializing before the namespace reads them.
const bindings = {
  get layout() { return MINI_GOLF_LAYOUT; },
  get prefabs() { return prefabs; },
  get scene() { return scene; },
  get camera() { return camera; },
  get lights() { return lights; },
  get timeline() { return timeline; },
  get fightingGameKit() { return fightingGameKit; },
  get createFightingGameKit() { return createFightingGameKit; }
};

/** Bind game state to an entry while retaining the legacy prefab namespace. */
export function createGamesWithPhysicsWorldAccess(access: PhysicsWorldAccess) {
  return createGamesCoreWithPhysicsWorldAccess(access, bindings);
}

// Match the access used by the 4.x app, physics and collision-world bindings.
export const games = createGamesWithPhysicsWorldAccess(legacyPhysicsWorldAccess);
