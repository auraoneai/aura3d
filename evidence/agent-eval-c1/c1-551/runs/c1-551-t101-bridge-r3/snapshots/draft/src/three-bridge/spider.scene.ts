// Native Aura3D source for the bridged "spider" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./spider.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { spiderBackground, spiderCamera, spiderLights, spiderModel, spiderOutput } from "./spider.bridge";

export function createSpiderScene(): AuraSceneBuilder {
  const stage = scene(spiderBackground ? { background: spiderBackground } : {})
    .add(spiderModel().runtime({ id: "spider" }).animate({ clip: "walk", loop: true }))
    .addMany(spiderLights());
  return spiderCamera ? stage.camera(spiderCamera) : stage;
}

export function mountSpider(selector = "#app") {
  return createAuraApp(selector, { scene: createSpiderScene(), output: spiderOutput });
}
