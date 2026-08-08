/**
 * Scenario 2 — product viewer, Aura3D.
 *
 * glTF loading, PBR, orbit controls, lighting, environment. The most common real first project, and
 * the one where Aura3D's integrated environment presets and asset handling should start paying off.
 */
import { createAuraApp, camera, environments, interactions, lights, material, model, primitives, scene } from "@aura3d/engine/lean-product";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const app = createAuraApp(canvas, {
  scene: scene()
    .background("#101720")
    .camera(camera.orbit({ target: [0, 0.6, 0], distance: 3.2 }))
    .add(interactions.orbit())
    .add(environments.studio())
    .add(lights.directional({ intensity: 2.4 }).position(2.4, 3.2, 2.8))
    .add(model({ id: "product", type: "model", format: "glb", url: "/model.glb", hash: "sha256-bundle-scenario" }))
    .add(primitives.sphere({ material: material.clearcoatPaint({ color: "#b3202f" }) }).position(0, 0.6, 0))
    .add(primitives.plane({ material: material.pbr({ color: "#2a3038", roughness: 0.8 }) }).scale([8, 1, 8]))
});
(globalThis as { __app?: unknown }).__app = app;
