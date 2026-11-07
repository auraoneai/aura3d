// Minimal LOOK_HDRI_MISSING probe: looks.preset("golden-hour") over a few primitives. Served from apps/_color514-probe (not committed there).
import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("golden-hour"))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#8a7a66", roughness: 0.85 }) }).rotate(-1.5708, 0, 0).scale([12, 1, 12]))
    .add(primitives.sphere({ name: "metal ball", material: material.pbr({ color: "#d9dde3", metallic: 1, roughness: 0.18 }) }).position(-1.2, 0.8, 0).scale(1.4))
    .add(primitives.sphere({ name: "clay ball", material: material.pbr({ color: "#c46b4a", roughness: 0.6 }) }).position(0.4, 0.5, 0.4).scale(1))
    .add(primitives.box({ name: "white block", material: material.pbr({ color: "#f2efe8", roughness: 0.5 }) }).position(1.8, 0.45, -0.3).scale([0.9, 0.9, 0.9]))
    .camera(camera.perspective({ position: [0.4, 1.6, 5.2], target: [0.2, 0.7, 0], fov: 38 })),
  ...looks.appOptions("golden-hour")
});
(window as unknown as { __probe: unknown }).__probe = app;
