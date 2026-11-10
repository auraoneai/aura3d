// Native Aura3D source for the bridged "portal" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./portal.bridge.ts and the GLB.
import { createAuraApp, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { portalBackground, portalCamera, portalLights, portalModel, portalOutput } from "./portal.bridge";

export function createPortalScene(): AuraSceneBuilder {
  const stage = scene(portalBackground ? { background: portalBackground } : {})
    .add(portalModel())
    .addMany(portalLights());
  return portalCamera ? stage.camera(portalCamera) : stage;
}

export function mountPortal(selector = "#app") {
  return createAuraApp(selector, { scene: createPortalScene(), output: portalOutput });
}
