import {
  camera,
  createCollisionLayers,
  game,
  groundedRenderedAssetPlacement,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import { ENEMIES, ENEMY_BODY_Y, ENEMY_VISUAL_Y } from "./enemies";
import { EYE_HEIGHT, LOOK_AHEAD, PLAYER_START } from "./state";

export const layers = createCollisionLayers({
  player: ["wall", "pickup", "enemy"],
  bullet: ["enemy", "wall"],
  enemy: ["bullet", "wall", "player"],
  wall: ["player", "bullet", "enemy"],
  pickup: ["player"]
});

export const PICKUPS = [
  { id: "ammo-1", kind: "ammo" as const, x: 1.8, z: 3.4 },
  { id: "ammo-2", kind: "ammo" as const, x: -1.6, z: -3.1 },
  { id: "med-1", kind: "health" as const, x: 0.2, z: -1.2 }
] as const;

export function buildScene() {
  const arena = groundedRenderedAssetPlacement(assets.arena, { targetMaxDimension: 16, floorY: 0, x: 0, z: -16 });
  const rifle = groundedRenderedAssetPlacement(assets.pulseRifle, { targetMaxDimension: 0.55, floorY: 0 });
  const crate = groundedRenderedAssetPlacement(assets.ammoCrate, { targetHeight: 0.38, floorY: 0.2 });
  const kit = groundedRenderedAssetPlacement(assets.medkit, { targetHeight: 0.42, floorY: 0.2 });

  return scene()
    .background("#05070c")
    .add(model(assets.arena, { name: "sci-fi corridor arena" }).position(arena.position[0], arena.position[1], arena.position[2]).scale(arena.scale))
    .add(model(assets.pulseRifle, { name: "pulse rifle viewmodel" }).position(0.28, 1.18, 5.7).scale(rifle.scale).runtime(game.runtimeNode("pulse-rifle", { tags: ["weapon"] })))
    .addMany(ENEMIES.map((enemy) => {
      const placed = groundedRenderedAssetPlacement(enemy.asset === "impA" ? assets.impA : assets.impB, {
        targetHeight: 1.25,
        floorY: ENEMY_VISUAL_Y,
        x: enemy.x,
        z: enemy.z
      });
      return model(enemy.asset === "impA" ? assets.impA : assets.impB, { name: `enemy ${enemy.id}` })
        .position(placed.position[0], placed.position[1], placed.position[2])
        .scale(placed.scale)
        .runtime(game.runtimeNode(`enemy-${enemy.id}`, { tags: ["enemy"] }));
    }))
    .addMany(PICKUPS.map((pickup) => {
      const asset = pickup.kind === "ammo" ? assets.ammoCrate : assets.medkit;
      const placed = pickup.kind === "ammo" ? crate : kit;
      return model(asset, { name: `${pickup.kind} pickup ${pickup.id}` })
        .position(pickup.x, placed.position[1], pickup.z)
        .scale(placed.scale)
        .runtime(game.runtimeNode(`pickup-${pickup.id}`, { tags: ["pickup", pickup.kind] }));
    }))
    .add(primitives.sphere({
      name: "look target",
      material: material.pbr({ color: "#05070c", roughness: 1 })
    }).position(PLAYER_START[0], EYE_HEIGHT, PLAYER_START[2] - LOOK_AHEAD).scale(0.001).runtime(game.runtimeNode("look-target", { tags: ["camera"] })))
    .add(primitives.box({
      name: "playable floor",
      material: material.emissive({ color: "#1b2836", emissive: "#1b2836", emissiveIntensity: 0.35 })
    }).position(0, -0.02, 1).scale([8.5, 0.08, 20]))
    .add(primitives.box({
      name: "left wall panel",
      material: material.glowingEmissive({ color: "#1c6d88", emissive: "#38d6ff", emissiveIntensity: 1.4 })
    }).position(-3.4, 1.4, 1).scale([0.08, 2.6, 18]))
    .add(primitives.box({
      name: "right wall panel",
      material: material.glowingEmissive({ color: "#6a2a58", emissive: "#ff4fd0", emissiveIntensity: 1.2 })
    }).position(3.4, 1.4, 1).scale([0.08, 2.6, 18]))
    .add(primitives.box({
      name: "far wall panel",
      material: material.emissive({ color: "#24364c", emissive: "#24364c", emissiveIntensity: 0.65 })
    }).position(0, 1.4, -8.8).scale([7, 2.6, 0.08]))
    .add(primitives.box({
      name: "ceiling panel",
      material: material.emissive({ color: "#1a2634", emissive: "#1a2634", emissiveIntensity: 0.45 })
    }).position(0, 2.7, 1).scale([8, 0.08, 18]))
    .add(primitives.sphere({
      name: "muzzle flash 0",
      material: material.glowingEmissive({ color: "#ff9d12", emissive: "#ff6a00", emissiveIntensity: 3.6 })
    }).position(0, -8, 0).scale(0.02).runtime(game.runtimeNode("muzzle-0", { tags: ["fx"] })))
    .add(primitives.sphere({
      name: "muzzle flash 1",
      material: material.glowingEmissive({ color: "#7ef8ff", emissive: "#3de8ff", emissiveIntensity: 3.8 })
    }).position(0, -8, 0).scale(0.02).runtime(game.runtimeNode("muzzle-1", { tags: ["fx"] })))
    .add(primitives.box({
      name: "muzzle flash 2",
      material: material.glowingEmissive({ color: "#ffb020", emissive: "#ff8a1a", emissiveIntensity: 3.8 })
    }).position(0, -8, 0).scale([0.05, 0.05, 1.7]).runtime(game.runtimeNode("muzzle-2", { tags: ["fx"] })))
    .add(primitives.sphere({
      name: "shot impact",
      material: material.glowingEmissive({ color: "#ff7a18", emissive: "#ff7a18", emissiveIntensity: 2.2 })
    }).position(0, -8, 0).scale(0.02).runtime(game.runtimeNode("shot-impact", { tags: ["fx"] })))
    .add(primitives.box({
      name: "exit marker",
      material: material.emissive({ color: "#3dffb0", emissive: "#3dffb0", emissiveIntensity: 0.7 })
    }).position(0, 1.1, -8.4).scale([0.35, 2.1, 0.18]).runtime(game.runtimeNode("exit-marker", { tags: ["exit"] })))
    .add(primitives.box({
      name: "neon rail left",
      material: material.emissive({ color: "#38d6ff", emissive: "#38d6ff", emissiveIntensity: 1.15 })
    }).position(-2.15, 0.08, -1).scale([0.05, 0.03, 8.4]))
    .add(primitives.box({
      name: "neon rail right",
      material: material.emissive({ color: "#ff4fd0", emissive: "#ff4fd0", emissiveIntensity: 0.95 })
    }).position(2.15, 0.08, -1).scale([0.05, 0.03, 8.4]))
    .add(lights.ambient({ intensity: 0.72, color: "#9eb4cc" }))
    .add(lights.directional({ position: [4, 8, 3], intensity: 2.4, color: "#fff1d6" }))
    .add(lights.directional({ position: [-3, 3, -6], intensity: 1.6, color: "#4fd0ff" }))
    .add(lights.point({ name: "spawn fill", position: [0, 2.2, 9], color: "#d7e8ff", intensity: 7.2 }))
    .add(lights.point({ name: "forward fill", position: [0, 2.0, 5], color: "#9be7ff", intensity: 6.0 }))
    .add(lights.point({ name: "enemy key", position: [0, 2.2, 0.6], color: "#ffe7c2", intensity: 5.6 }))
    .add(lights.point({ name: "mid cyan practical", position: [0.2, 2.0, -0.2], color: "#38d6ff", intensity: 3.8 }))
    .add(lights.point({ name: "warm side practical", position: [-2.1, 1.7, -2.4], color: "#ff9d5c", intensity: 2.8 }))
    .add(lights.point({ name: "deep cyan", position: [1.4, 1.9, -5.2], color: "#38d6ff", intensity: 3.2 }))
    .add(lights.point({ name: "exit glow", position: [0, 1.8, -7.6], color: "#3dffb0", intensity: 3.4 }))
    .camera(camera.follow({
      targetNode: "look-target",
      offset: [0, 0.12, LOOK_AHEAD],
      offsetMode: "target-yaw",
      fov: 68,
      smoothing: 0
    }));
}

export function createLevelBodies(physics: {
  createBody: (spec: {
    readonly name?: string;
    readonly type?: "static" | "dynamic" | "kinematic";
    readonly shape?: "box" | "sphere" | "capsule";
    readonly position?: readonly [number, number, number];
    readonly halfExtents?: readonly [number, number, number];
    readonly radius?: number;
    readonly halfHeight?: number;
    readonly mass?: number;
    readonly layer?: string;
    readonly sensor?: boolean;
    readonly linearDamping?: number;
  }) => unknown;
}): void {
  physics.createBody({
    name: "player",
    shape: "capsule",
    radius: 0.32,
    halfHeight: 0.52,
    mass: 1,
    position: [...PLAYER_START],
    layer: "player",
    linearDamping: 0.2
  });
  for (const wall of [
    { id: "floor", x: 0, y: -0.15, z: 0, hx: 6, hy: 0.2, hz: 12 },
    { id: "n", x: 0, y: 1.4, z: -10.2, hx: 5.2, hy: 1.6, hz: 0.28 },
    { id: "s", x: 0, y: 1.4, z: 10.8, hx: 5.2, hy: 1.6, hz: 0.28 },
    { id: "w", x: -5.1, y: 1.4, z: -1, hx: 0.28, hy: 1.6, hz: 9.2 },
    { id: "e", x: 5.1, y: 1.4, z: -1, hx: 0.28, hy: 1.6, hz: 9.2 }
  ]) {
    physics.createBody({
      name: `wall-${wall.id}`,
      type: "static",
      shape: "box",
      position: [wall.x, wall.y, wall.z],
      halfExtents: [wall.hx, wall.hy, wall.hz],
      layer: "wall"
    });
  }
  for (const enemy of ENEMIES) {
    physics.createBody({
      name: `enemy-${enemy.id}`,
      type: "kinematic",
      shape: "capsule",
      radius: 0.55,
      halfHeight: 0.85,
      position: [enemy.x, ENEMY_BODY_Y, enemy.z],
      layer: "enemy"
    });
  }
  for (const pickup of PICKUPS) {
    physics.createBody({
      name: `pickup-${pickup.id}`,
      type: "static",
      shape: "sphere",
      radius: 0.45,
      position: [pickup.x, 0.45, pickup.z],
      layer: "pickup",
      sensor: true
    });
  }
  physics.createBody({
    name: "exit",
    type: "static",
    shape: "box",
    position: [0, 1, -8.4],
    halfExtents: [2.6, 1.2, 0.55],
    layer: "pickup",
    sensor: true
  });
}
