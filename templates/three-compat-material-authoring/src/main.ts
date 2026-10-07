// Three-compat material authoring: a grid of 64×32 tessellated swatch
// spheres (C-07 custom primitive geometry) under the `product-studio` look,
// plus one typed GLB swatch so agents see authored materials next to a real
// asset's own materials.
import { camera, createAuraApp, geometry, interactions, looks, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "product-studio" as const;

/** 64×32 UV sphere generated through C-07 custom primitive geometry — the
 *  tessellation the material demo needs without reaching for THREE.SphereGeometry. */
function uvSphereGeometry(radius: number, widthSegments = 64, heightSegments = 32) {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: number[] = [];
  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push([radius * nx, radius * ny, radius * nz]);
      normals.push([nx, ny, nz]);
    }
  }
  const stride = widthSegments + 1;
  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { kind: "aura-custom-geometry" as const, positions, normals, indices };
}

const swatchGeometry = uvSphereGeometry(0.45);
const swatches = [
  { name: "pbr swatch", material: material.pbr({ color: "#c66f53", roughness: 0.55 }) },
  { name: "metal swatch", material: material.metal({ color: "#d7e1ec", roughness: 0.12 }) },
  { name: "rubber swatch", material: material.blackRubber({ color: "#22262e" }) },
  { name: "glass swatch", material: material.clearGlass({ color: "#bfe6ff" }) },
  { name: "emissive swatch", material: material.glowingEmissive({ color: "#13202c", emissiveIntensity: 1.2 }) }
] as const;

const lab = scene()
  .add(looks.preset(LOOK_ID))
  .add(primitives.box({ name: "swatch bench", size: [7, 0.12, 2.6], position: [0, -0.06, 0], material: material.pbr({ color: "#24272e", roughness: 0.88 }), receiveShadow: true }));

swatches.forEach((swatch, index) => {
  lab.add(geometry.custom(swatchGeometry, {
    name: swatch.name,
    position: [(index - (swatches.length - 1) / 2) * 1.25, 0.55, 0.55],
    material: swatch.material,
    castShadow: true
  }));
});

// The GLB swatch: its authored materials sit beside the lab swatches so the
// grid always shows one real asset's material stack.
lab
  .add(model(assets.glbSwatch, { name: "typed GLB swatch" }).position(0, 0.42, -0.75).rotate(0, 0.5, 0).scale(0.42))
  .add(interactions.orbit({ target: "material swatch grid" }))
  .camera(camera.orbit({ target: [0, 0.55, 0], distance: 6.2, fov: 38 }));

createAuraApp("#app", { scene: lab });

(window as unknown as { __AURA3D_MATERIAL_AUTHORING__?: unknown }).__AURA3D_MATERIAL_AUTHORING__ = {
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  swatches: swatches.length,
  tessellation: [64, 32],
  glbSwatch: { assetId: assets.glbSwatch.id, provenance: "Kenney Car Kit sedan-sports, CC0-1.0" }
};
