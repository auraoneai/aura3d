// Three-compat material authoring: a row of spheres showcasing the public
// @aura3d/engine material presets (pbr, metal, rubber, glass, emissive).
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

const swatches = [
  { name: "pbr swatch", material: material.pbr({ color: "#c66f53", roughness: 0.55 }) },
  { name: "metal swatch", material: material.metal({ color: "#d7e1ec", roughness: 0.12 }) },
  { name: "rubber swatch", material: material.rubber({ color: "#22262e" }) },
  { name: "glass swatch", material: material.glass({ color: "#bfe6ff" }) },
  { name: "emissive swatch", material: material.emissive({ color: "#13202c", emissive: "#38d6ff", emissiveIntensity: 1.2 }) }
] as const;

const lab = scene()
  .background("#0c1018")
  .camera(camera.orbit({ target: [0, 0.7, 0], distance: 6.4 }))
  .add(primitives.box({ name: "swatch bench", size: [7, 0.12, 2.4], position: [0, -0.06, 0], material: material.pbr({ color: "#1c2433", roughness: 0.88 }), receiveShadow: true }));

swatches.forEach((swatch, index) => {
  lab.add(primitives.sphere({
    name: swatch.name,
    size: 0.9,
    position: [(index - (swatches.length - 1) / 2) * 1.35, 0.65, 0],
    material: swatch.material,
    castShadow: true
  }));
});

lab
  .add(lights.ambient({ intensity: 0.3 }))
  .add(lights.directional({ name: "key", position: [3, 4.5, 3.5], intensity: 1.5 }))
  .add(lights.point({ name: "cool rim", position: [-3, 2.4, -2.4], intensity: 1.3, color: "#9fc4ff" }));

createAuraApp("#app", { scene: lab });
