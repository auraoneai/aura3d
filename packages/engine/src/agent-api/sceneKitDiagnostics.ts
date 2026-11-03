/** Legacy scene-kit entry. Shared construction receives the entry's games binding. */
import type { AuraSceneKitCustomizeOptions, AuraSceneKitId } from "./nodes/types.js";
import type { AuraSceneKitBuild } from "./sceneKitDiagnosticsCore.js";
import { games } from "./nodes/games.js";
import { buildSceneKitWithGames } from "./sceneKitDiagnosticsCore.js";

export { createSceneKitPerformanceDiagnostics, sceneKitPerformanceBudget } from "./sceneKitDiagnosticsCore.js";

export function buildSceneKit(id: AuraSceneKitId, options: AuraSceneKitCustomizeOptions): AuraSceneKitBuild {
  return buildSceneKitWithGames(games, id, options);
}
