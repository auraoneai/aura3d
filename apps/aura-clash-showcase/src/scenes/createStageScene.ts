import { camera, effects, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "../aura-assets";

export function createStageScene() {
  const cyan = material.emissive({ color: "#00ffbf", emissive: "#00ffbf" });

  return scene()
    .background("#020806")
    .add(model(assets.auraClashDuelStage, {
      name: "Aura Clash clean duel stage",
      receiveShadow: true,
    }).position(0, -0.16, 0.12).scale(1.38))
    .add(primitives.torus({ name: "stage center camera-safe ring", material: cyan }).position(0, 0.04, 0.16).rotate(Math.PI / 2, 0, 0).scale([0.36, 0.36, 0.012]))
    .add(lights.ambient({ name: "emerald rooftop ambient", intensity: 0.22, color: "#83ffd3" }))
    .add(lights.directional({ name: "rooftop key light", position: [1.2, 3.8, 4.6], intensity: 1.75, color: "#f3fff8" }))
    .add(effects.fog({ name: "neon rooftop depth fog", density: 0.032, color: "#08251b" }))
    .add(effects.bloom({ name: "controlled signage bloom", intensity: 0.28, color: "#00ff9f", threshold: 0.78, radius: 0.28, maxIntensity: 0.38 }))
    .camera(camera.perspective({ position: [0, 0.82, 4.65], target: [0, 0.58, 0.12], fov: 32 }));
}

