import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";
import { createFbm2D, createSimplexNoise2D, heightfieldGeometry, seededRandom } from "@aura3d/engine/procedural";

// Seeded noise, deterministic on every machine: plain simplex, fbm (octaves of simplex) and ridged fbm. Each swatch is a
// heightfield whose height AND colour come from the noise, so you see the field and its relief. Same seed, same pixels.
const simplex = createSimplexNoise2D(7);
const fbm = createFbm2D(7, { octaves: 5, frequency: 0.9 });
const ridged = createFbm2D(7, { octaves: 5, frequency: 0.9, ridged: true });

const swatch = (name: string, field: (x: number, y: number) => number, scale: number) => {
  const spec = heightfieldGeometry({
    size: 5, segments: 128,
    heightAt: (x, z) => 0.5 * field(x * scale, z * scale),
    colorAt: (x, z) => {
      const v = field(x * scale, z * scale) * 0.5 + 0.5;
      return [0.12 + 0.88 * v ** 1.2, 0.2 + 0.7 * v, 0.45 + 0.5 * (1 - v) * 0.6 + 0.3 * v, 1];
    }
  });
  return geometry.custom(spec, { name, material: material.pbr({ color: "#ffffff", roughness: 0.7 }) });
};

// seededRandom drives scatter that must not change between runs: a ring of small markers around each swatch.
const random = seededRandom(42);
const markers = Array.from({ length: 36 }, (_, i) => {
  const lane = i % 3, angle = random() * Math.PI * 2;
  return primitives.sphere({ name: `marker-${i}`, size: 0.12, material: material.pbr({ color: "#f4f1e8", roughness: 0.4 }) })
    .position((lane - 1) * 5.6 + Math.cos(angle) * (3.0 + random() * 0.4), 0.06, Math.sin(angle) * (3.0 + random() * 0.4));
});

let sceneBuilder = scene({ background: "#14171d" })
  .add(environments.neutral({ intensity: 0.85, background: false }))
  .add(lights.directional({ name: "key", position: [4, 9, 6], target: [0, 0, 0], intensity: 2.5, color: "#fff0dc", shadow: true }))
  .add(lights.directional({ name: "fill", position: [-6, 5, -4], target: [0, 0, 0], intensity: 1.2, color: "#9cc0ff" }))
  .add(swatch("simplex", simplex, 1.1).position(-5.6, 0.2, 0))
  .add(swatch("fbm", fbm, 1).position(0, 0.2, 0))
  .add(swatch("ridged", ridged, 1).position(5.6, 0.2, 0));
for (const marker of markers) sceneBuilder = sceneBuilder.add(marker);

const app = createAuraApp("#app", {
  scene: sceneBuilder.camera(camera.perspective({ position: [0, 9.5, 8.6], target: [0, 0, 0.4], fov: 40 }))
});
await app.ready();
