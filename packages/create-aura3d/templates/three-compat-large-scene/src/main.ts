// Three-compat large scene: a deterministic grid of many boxes (a city-block
// style stress layout) authored through the public @aura3d/engine API.
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

const palette = ["#39465e", "#46587a", "#54688f", "#62799f", "#4d5a74"] as const;
const grid = scene()
  .background("#0a0e15")
  .camera(camera.orbit({ target: [0, 1, 0], distance: 16 }))
  .add(primitives.box({ name: "large scene ground", size: [22, 0.1, 22], position: [0, -0.05, 0], material: material.pbr({ color: "#141b28", roughness: 0.95 }), receiveShadow: true }));

const span = 9; // 9 x 9 = 81 boxes
for (let row = 0; row < span; row += 1) {
  for (let col = 0; col < span; col += 1) {
    const index = row * span + col;
    const height = 0.5 + ((index * 37) % 23) / 23 * 2.6;
    grid.add(primitives.box({
      name: `block r${row} c${col}`,
      size: [1.1, height, 1.1],
      position: [(col - (span - 1) / 2) * 2.2, height / 2, (row - (span - 1) / 2) * 2.2],
      material: material.pbr({ color: palette[index % palette.length], roughness: 0.62 }),
      castShadow: true,
      receiveShadow: true
    }));
  }
}

grid
  .add(lights.ambient({ intensity: 0.3 }))
  .add(lights.directional({ name: "low sun", position: [8, 10, 6], intensity: 1.4, color: "#ffe7c8" }));

createAuraApp("#app", { scene: grid });
