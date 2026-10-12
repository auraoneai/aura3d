// Viewport scene. The `product-studio` look supplies the studio HDRI (IBL
// reflections on the metal and clearcoat), the shadow-casting key light,
// ambient occlusion, colour grade and bloom; the emissive ring is what the
// bloom picks up. Like a create-aura3d scaffold, the look's HDRIs live under
// public/hdri/ (copy packages/create-aura3d/hdri/).
import { camera, interactions, looks, material, primitives, scene } from "@aura3d/engine";

export const LOOK_ID = "product-studio" as const;

export const starterScene = scene()
  .background(looks.describe(LOOK_ID).v0.background)
  .add(looks.preset(LOOK_ID))
  .add(primitives.plane({ name: "stage floor", size: [9, 1, 9], material: material.pbr({ color: "#4a505a", roughness: 0.5, metalness: 0.05 }), receiveShadow: true }))
  .add(primitives.sphere({ name: "chrome sphere", material: material.metal({ color: "#e6e9ee", roughness: 0.1 }), castShadow: true }).position(-1.25, 0.62, 0.1).scale(1.2))
  .add(primitives.sphere({ name: "clearcoat sphere", material: material.clearcoatPaint({ color: "#d9472b" }), castShadow: true }).position(1.25, 0.62, 0.1).scale(1.2))
  .add(primitives.box({ name: "ceramic block", material: material.ceramic({ color: "#eef1f4" }), castShadow: true }).position(0, 0.42, -1.1).scale([0.84, 0.84, 0.84]).rotate(0, 0.6, 0))
  .add(primitives.torus({ name: "emissive ring", material: material.emissive({ color: "#2a1206", emissive: "#ff7a2e", emissiveIntensity: 3.2 }) }).position(0, 0.06, 0.9).rotate(Math.PI / 2, 0, 0).scale([0.7, 0.7, 0.06]))
  .add(interactions.orbit({ target: "chrome sphere" }))
  .camera(camera.orbit({ target: [0, 0.55, 0], distance: 5.8, fov: 38 }));
