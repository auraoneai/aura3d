// Native Aura3D source for the bridged "product" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./product.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { productBackground, productCamera, productLights, productModel, productOutput } from "./product.bridge";

export function createProductScene(): AuraSceneBuilder {
  const stage = scene(productBackground ? { background: productBackground } : {})
    .add(productModel())
    .addMany(productLights());
  return productCamera ? stage.camera(productCamera) : stage;
}

export function mountProduct(selector = "#app") {
  return createAuraApp(selector, { scene: createProductScene(), output: productOutput });
}
