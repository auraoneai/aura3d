import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";
import { createFbm2D, heightfieldGeometry } from "@aura3d/engine/procedural";

// A solid island slab from a height function: shared vertices, normals from central differences of the function,
// per-vertex colour by height and slope, and a watertight skirt (`base`) so the cut edge reads as earth.
const SIZE = 40;
const fbm = createFbm2D(21, { octaves: 5, frequency: 0.045 });
const ridged = createFbm2D(5, { octaves: 4, frequency: 0.05, ridged: true });
const heightAt = (x: number, z: number): number => {
  const rim = Math.min(1, Math.hypot(x, z) / (SIZE * 0.5));
  const island = (1 - rim ** 2.2) * 7.5;
  return island + fbm(x, z) * 2.2 + Math.max(0, ridged(x * 0.8, z * 0.8)) * 3.2 * (1 - rim) - 2.4;
};
const colorAt = (_x: number, _z: number, h: number, slope: number): [number, number, number, number] => {
  if (slope > 0.3) return [0.4, 0.35, 0.3, 1];                    // cliff rock
  if (h < 0.35) return [0.76, 0.68, 0.46, 1];                     // beach sand
  if (h < 3.6) return [0.2 + h * 0.012, 0.4 - h * 0.02, 0.14, 1]; // grass, darker with height
  if (h < 5.2) return [0.46, 0.42, 0.36, 1];                      // scree
  return [0.93, 0.95, 0.98, 1];                                   // snow
};

const island = heightfieldGeometry({ heightAt, size: SIZE, segments: 160, colorAt, base: -6 });

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fc4e8" })
    .add(sky.preetham({ sun: { elevationDeg: 30, azimuthDeg: 135, intensity: 1 } }))
    .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#4d5a3c", intensity: 0.5 }))
    .add(lights.directional({ name: "sun", position: [30, 24, 22], target: [0, 0, 0], intensity: 2.6, color: "#fff1d6", shadow: true }))
    .add(geometry.custom(island, { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(primitives.plane({ name: "sea", size: [160, 1, 160], material: material.pbr({ color: "#2b79a8", roughness: 0.06, metallic: 0.1, opacity: 0.8 }), castShadow: false }).position(0, 0.1, 0))
    .add(effects.fog({ color: "#b7d2ea", density: 0.003 }))
    .camera(camera.perspective({ position: [34, 17, 38], target: [0, 1.5, 0], fov: 42, near: 0.5, far: 400 }))
});
await app.ready();
