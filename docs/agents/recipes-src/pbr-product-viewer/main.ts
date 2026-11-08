import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";

// A product on a procedural pedestal: torus knot (clear-coated metal), cylinder plinth, round stage, neutral environment.
// Metals reflect the environment, so environments.neutral is what makes this read as metal instead of grey plastic.
const app = createAuraApp("#app", {
  scene: scene({ background: "#d9dde3" })
    .add(environments.neutral({ intensity: 1.15, background: false }))
    .add(lights.directional({ name: "key", position: [4, 6.5, 4.5], target: [0, 1, 0], intensity: 2.8, color: "#fff4e6", shadow: true }))
    .add(lights.directional({ name: "fill", position: [-5, 3, 2], target: [0, 1, 0], intensity: 1, color: "#cfdcff" }))
    .add(lights.directional({ name: "rim", position: [0, 4, -6], target: [0, 1, 0], intensity: 1.6, color: "#ffffff" }))
    .add(primitives.cylinder({ name: "stage", size: [9, 0.2, 9], material: material.pbr({ color: "#eceff3", roughness: 0.55 }), castShadow: false }).position(0, -0.1, 0))
    .add(primitives.cylinder({ name: "plinth", size: [2.2, 0.9, 2.2], material: material.pbr({ color: "#f7f8fa", roughness: 0.35 }) }).position(0, 0.45, 0))
    .add(primitives.cylinder({ name: "plinth-ring", size: [2.32, 0.06, 2.32], material: material.pbr({ color: "#2a2d33", metallic: 0.9, roughness: 0.3 }) }).position(0, 0.93, 0))
    .add(primitives.torusKnot({
      name: "product",
      size: 0.72,
      params: { tubularSegments: 220, radialSegments: 32, tubeRadius: 0.2, p: 2, q: 3 },
      material: material.physical({ color: "#c9a46a", metallic: 1, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.08 })
    }).position(0, 1.8, 0).runtime({ id: "product", mutable: true }))
    .add(interactions.orbit({ target: "product" }))
    .camera(camera.orbit({ position: [4.6, 3.1, 6], target: [0, 1.5, 0], fov: 34 }))
});
let angle = 0;
app.onFrame((frame) => {
  angle += frame.dt * 0.5;
  app.nodes.require("product").setRotation(0, angle, 0); // slow turntable
});
void app.ready();
