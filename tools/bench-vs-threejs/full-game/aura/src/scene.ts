import { camera, looks, material, primitives, scene } from "@aura3d/engine";
import { ARENA, type Coin } from "../../../shared/coin-sim";

// @concern scene
// Benchmark game: primitives stand in for the player, coins and ground (no typed GLB assets).
export function buildScene(coins: readonly Coin[]) {
  const world = scene()
    .add(looks.preset("outdoor-day"))
    .camera(camera.perspective({ fov: 50, near: 0.1, far: 100, position: [0, 16, 14], target: [0, 0, 0] }))
    .add(primitives.plane({ name: "ground", size: [ARENA * 2 + 2, 1, ARENA * 2 + 2], material: material.pbr({ color: "#2b678e", roughness: 0.9 }) }))
    .add(primitives.box({ name: "player", size: [1, 1, 1], material: material.pbr({ color: "#f3f0dc", roughness: 0.6 }), castShadow: true }).runtime({ id: "player" }));
  return coins.reduce(
    (acc, coin, i) =>
      acc.add(
        primitives
          .cylinder({ name: `coin-${i}`, size: [0.8, 0.1, 0.8], material: material.pbr({ color: "#ffd24a", metallic: 0.8, roughness: 0.3 }), castShadow: true })
          .position(coin.x, 0.5, coin.z)
          .runtime({ id: `coin-${i}` })
      ),
    world
  );
}
