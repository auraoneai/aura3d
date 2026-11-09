// Native Aura3D source for the bridged "windmill" asset. `aura3d import-three` writes this file once
// and never overwrites it: edit freely. Regeneration only rewrites ./windmill.bridge.ts and the GLB.
//
// NATIVE EDITS (kept across regeneration; evidence/2026-11-08b/README.md):
//   1. an added warm lantern light beside the door (a native lights.point, not in the three.js scene),
//   2. the barrel and the crate moved by stable id through model({ nodeTransforms }),
//   3. the flag hidden by stable id; the exported clips still play (rotor_spin on loop, breeze as a layer).
import { createAuraApp, lights, scene, type AuraActorAnimationApi, type AuraSceneBuilder } from "@aura3d/engine";
import { windmillBackground, windmillCamera, windmillLights, windmillModel, windmillOutput, type WindmillNodeId } from "./windmill.bridge";

const moved: Partial<Record<WindmillNodeId, { position?: [number, number, number]; rotation?: [number, number, number] }>> = {
  barrel: { position: [1.7, 0.4, 2.3] },
  crate: { position: [0.95, 0.35, 2.9], rotation: [0, -0.5, 0] }
};
const hidden: WindmillNodeId[] = ["flag"];

export function createWindmillScene(): AuraSceneBuilder {
  const stage = scene(windmillBackground ? { background: windmillBackground } : {})
    .add(windmillModel({ nodeTransforms: moved, hiddenNodeNames: hidden }).runtime({ id: "windmill" }).animate({ clip: "rotor_spin", loop: true }))
    .add(lights.point({ name: "lantern", color: "#ffb347", intensity: 14, position: [0.9, 1.3, 2.3], distance: 6, decay: 2 }))
    .addMany(windmillLights());
  return windmillCamera ? stage.camera(windmillCamera) : stage;
}

export function mountWindmill(selector = "#app") {
  const app = createAuraApp(selector, { scene: createWindmillScene(), output: windmillOutput });
  void app.ready().then(() => {
    const animation = (app.nodes.get("windmill") as { readonly animation?: AuraActorAnimationApi } | undefined)?.animation;
    animation?.playLayer("breeze", "breeze");
  });
  return app;
}
