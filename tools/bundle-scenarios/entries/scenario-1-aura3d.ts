/**
 * Scenario 1 — core primitive scene, Aura3D.
 *
 * WebGL2 renderer, scene graph, camera, one material, one cube. No glTF, no WebGPU, no diagnostics,
 * no compressed textures, no physics. This is the smallest thing a developer can build, and it is the
 * number that decides whether they keep reading.
 */
import { createAuraApp, camera, material, primitives, scene } from "@aura3d/engine";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const app = createAuraApp(canvas, {
  scene: scene()
    .background("#0b0f16")
    .camera(camera.perspective({ position: [2.4, 1.8, 3.2], target: [0, 0, 0], fov: 45 }))
    .add(primitives.box({ material: material.pbr({ color: "#c8d3e0", roughness: 0.4 }) }))
});
(globalThis as { __app?: unknown }).__app = app;
