// Legacy scene kits retain the synchronous physics binding of the 4.x entry.
import type { AuraSceneKit, AuraSceneKitCustomizeOptions, AuraSceneKitId } from "./types.js";
import { games } from "./games.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { createSceneKitsWithGames, makeSceneKitWithGames } from "./sceneKitsCore.js";

export { prd02KitLighting } from "./sceneKitsCore.js";

// Defer access to `games` until all cyclic modules have initialized.
export const sceneKits = lazyNamespace(() => createSceneKitsWithGames(games));

export function makeSceneKit(id: AuraSceneKitId, options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit {
  return makeSceneKitWithGames(games, id, options);
}
