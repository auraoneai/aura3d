import { camera, createAuraApp, defineModelAssets, effects, environments, interactions, lights, material, model, primitives, scene } from "@aura3d/engine";
import type { SceneHandle } from "../../shared/glue";
import { SHA256 } from "./assets.generated";

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const assets = defineModelAssets({ truck: { url: "/model.glb", sha256: SHA256.truck } }, { license: "CC-BY 4.0, Cesium" });
  const app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    output: { toneMapping: "aces" },
    scene: scene()
      .background("#1a1d24")
      .camera(camera.orbit({ fov: 40, near: 0.1, far: 100, position: [4.5, 2.2, 5.5], target: [0, 0.8, 0] }))
      .add(environments.hdri({ name: "env", intensity: 1, background: false, texture: { type: "texture", format: "hdr", url: "/env.hdr" } as never }))
      .add(lights.directional({ color: "#fff4e0", intensity: 2.5, position: [5, 8, 4], shadow: true }))
      .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#2b2f38", roughness: 0.9 }) }))
      .add(model(assets.refs.truck, { name: "truck", targetHeight: 2, castShadow: true }))
      .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.6 }))
      .add(interactions.orbit({ target: "truck" }))
  });
  await app.ready();
  return { frame(dt) { app.step(dt); } };
}
