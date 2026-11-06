import { camera, createAuraApp, effects, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";

// Heightfield island: one custom mesh with per-vertex colour from height, a glossy water plane, fog and a procedural sky.
const CELLS = 120; // quads per side: vertex colours and normals need vertices
const SIZE = 64;   // metres per side

const height = (x: number, z: number): number => {
  const rim = Math.hypot(x, z) / (SIZE * 0.5);
  const hills = 4.4 * Math.sin(x * 0.13 + 1.3) * Math.cos(z * 0.1) + 1.5 * Math.sin(x * 0.29 + z * 0.21) + 0.45 * Math.sin(x * 0.7) * Math.sin(z * 0.63);
  return hills + 3.2 - rim * rim * 9; // dome falloff: land in the middle, sea floor at the rim
};
const shade = (h: number): [number, number, number, number] =>
  h < 0.45 ? [0.7, 0.6, 0.38, 1] : h < 3.4 ? [0.16, 0.36, 0.12, 1] : h < 5.4 ? [0.34, 0.28, 0.22, 1] : [0.9, 0.92, 0.95, 1]; // sand, grass, rock, snow

const positions = new Float32Array((CELLS + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const colors = new Float32Array((CELLS + 1) ** 2 * 4);
const indices: number[] = [];
for (let j = 0; j <= CELLS; j += 1) for (let i = 0; i <= CELLS; i += 1) {
  const v = j * (CELLS + 1) + i;
  const x = (i / CELLS - 0.5) * SIZE;
  const z = (j / CELLS - 0.5) * SIZE;
  const h = height(x, z);
  positions.set([x, h, z], v * 3);
  const e = 0.2; // central differences give a smooth normal
  const nx = height(x - e, z) - height(x + e, z);
  const nz = height(x, z - e) - height(x, z + e);
  const len = Math.hypot(nx, 2 * e, nz);
  normals.set([nx / len, (2 * e) / len, nz / len], v * 3);
  colors.set(shade(h), v * 4);
  if (i < CELLS && j < CELLS) indices.push(v, v + CELLS + 1, v + 1, v + 1, v + CELLS + 1, v + CELLS + 2);
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fc4e8" })
    .add(sky.preetham({ sun: { elevationDeg: 32, azimuthDeg: 130, intensity: 1 } }))
    .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#4d5a3c", intensity: 0.45 }))
    .add(lights.directional({ name: "sun", position: [30, 26, 22], target: [0, 0, 0], intensity: 2.4, color: "#fff1d6", shadow: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -8, -SIZE / 2], max: [SIZE / 2, 8, SIZE / 2] } }),
      { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    ))
    .add(primitives.plane({ name: "water", size: [SIZE * 2, 1, SIZE * 2], material: material.pbr({ color: "#2b79a8", roughness: 0.06, metallic: 0.1, opacity: 0.82 }), castShadow: false }).position(0, 0, 0))
    .add(effects.fog({ color: "#b7d2ea", density: 0.004 }))
    .camera(camera.perspective({ position: [30, 13, 34], target: [0, 1, 0], fov: 45, near: 0.5, far: 400 }))
});
await app.ready();
