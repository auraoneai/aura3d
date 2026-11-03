import { createAuraApp, scene, type AuraApp, type AuraLightingRuntime } from "@aura3d/engine";
import { createAuraRouteHealth } from "@aura3d/engine/devtools";
import { createGame } from "@aura3d/engine/game";
import { createWorkerRenderer } from "@aura3d/engine/worker";
import { NativeLightmapBake } from "@aura3d/engine/lighting";

const factory: typeof createAuraApp = createAuraApp;
const builder: ReturnType<typeof scene> = scene();
const health: typeof createAuraRouteHealth = createAuraRouteHealth;
const game: typeof createGame = createGame;
const worker: typeof createWorkerRenderer = createWorkerRenderer;
const attachLightmap = (runtime: AuraLightingRuntime, bake: NativeLightmapBake) =>
  runtime.attachLightmap("card", bake.createRenderData(), { composition: "add-indirect" });
export type App = AuraApp;
export { factory, builder, health, game, worker, attachLightmap };
