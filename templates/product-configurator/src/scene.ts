// Configurator scene, rebuilt per variant. The `product-studio` look
// supplies the studio HDRI (IBL on the variant finish), the shadow-casting
// key light, ambient occlusion, colour grade and bloom; the emissive ring is
// what the bloom picks up. Like a create-aura3d scaffold, the look's HDRIs
// live under public/hdri/ (copy packages/create-aura3d/hdri/).
import { camera, interactions, looks, material, primitives, scene } from "@aura3d/engine";

export const LOOK_ID = "product-studio" as const;

export interface FinishVariant {
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
}

export function configuratorScene(variant: FinishVariant): ReturnType<typeof scene> {
  return scene()
    .background(looks.describe(LOOK_ID).v0.background)
    .add(looks.preset(LOOK_ID))
    .add(primitives.plane({ name: "stage floor", size: [9, 1, 9], material: material.pbr({ color: "#4a505a", roughness: 0.5, metalness: 0.05 }), receiveShadow: true }))
    .add(primitives.sphere({ name: "product body", material: material.pbr({ color: variant.color, roughness: variant.roughness, metalness: variant.metalness }), castShadow: true }).position(0, 0.78, 0).scale(1.55))
    .add(primitives.box({ name: "trim block", material: material.metal({ color: "#e8e0c8", roughness: 0.22 }), castShadow: true }).position(1.7, 0.42, -0.7).scale([0.84, 0.84, 0.84]).rotate(0, 0.6, 0))
    .add(primitives.torus({ name: "emissive ring", material: material.emissive({ color: "#2a1206", emissive: "#ff7a2e", emissiveIntensity: 3.2 }) }).position(-1.6, 0.06, 0.7).rotate(Math.PI / 2, 0, 0).scale([0.7, 0.7, 0.06]))
    .add(interactions.orbit({ target: "product body" }))
    .camera(camera.orbit({ target: [0, 0.65, 0], distance: 5.8, fov: 38 }));
}
