// Native Aura3D source for the bridged "stage" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./stage.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { stageBackground, stageCamera, stageLights, stageModel, stageOutput } from "./stage.bridge";

export function createStageScene(): AuraSceneBuilder {
  const stage = scene(stageBackground ? { background: stageBackground } : {})
    .add(stageModel())
    .addMany(stageLights());
  return stageCamera ? stage.camera(stageCamera) : stage;
}

export function mountStage(selector = "#app") {
  return createAuraApp(selector, { scene: createStageScene(), output: stageOutput });
}
