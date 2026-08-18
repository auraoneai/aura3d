import {
  camera,
  createCollisionLayers,
  effects,
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

/**
 * Hostiles are solid against hitscan and the corridor hull, but NOT against the
 * player capsule: touch damage is proximity-authored in enemies.ts, and keeping
 * the player able to move through hostiles keeps the rush deterministic instead
 * of turning corpses into physics wedges. Route-local design, documented in
 * KNOWN-LIMITS.md.
 */
export const layers = createCollisionLayers({
  player: ["wall", "pickup"],
  bullet: ["enemy", "wall"],
  enemy: ["bullet", "wall"],
  wall: ["player", "bullet", "enemy"],
  pickup: ["player"]
});

/**
 * ammo-1 sits on the playable spec's walk path (strafe right, then forward from
 * spawn) so the pickup trigger is provably reachable. The others reward pushing
 * deeper into the corridor.
 */
export const PICKUPS = [
  { id: "ammo-1", kind: "ammo" as const, x: 1.9, z: 7.4 },
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
        targetHeight: 1.5,
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
      material: material.pbr({ color: "#101a26", roughness: 0.55, metalness: 0.4 })
    }).position(-3.4, 1.4, 1).scale([0.08, 2.6, 18]))
    .add(primitives.box({
      name: "right wall panel",
      material: material.pbr({ color: "#1a1022", roughness: 0.55, metalness: 0.4 })
    }).position(3.4, 1.4, 1).scale([0.08, 2.6, 18]))
    .add(primitives.box({
      name: "far wall panel",
      material: material.emissive({ color: "#24364c", emissive: "#24364c", emissiveIntensity: 0.65 })
    }).position(0, 1.4, -8.8).scale([7, 2.6, 0.08]))
    .add(primitives.box({
      name: "ceiling panel",
      material: material.emissive({ color: "#141d29", emissive: "#141d29", emissiveIntensity: 0.28 })
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
      material: material.emissive({ color: "#38d6ff", emissive: "#38d6ff", emissiveIntensity: 1.35 })
    }).position(-2.15, 0.08, -1).scale([0.05, 0.03, 8.4]))
    .add(primitives.box({
      name: "neon rail right",
      material: material.emissive({ color: "#ff4fd0", emissive: "#ff4fd0", emissiveIntensity: 1.15 })
    }).position(2.15, 0.08, -1).scale([0.05, 0.03, 8.4]))
    .add(primitives.box({
      name: "hazard strip left",
      material: material.glowingEmissive({ color: "#5a3a12", emissive: "#ffb020", emissiveIntensity: 1.5 })
    }).position(-3.3, 0.22, -3.4).scale([0.06, 0.05, 6.2]))
    .add(primitives.box({
      name: "hazard strip right",
      material: material.glowingEmissive({ color: "#5a3a12", emissive: "#ffb020", emissiveIntensity: 1.5 })
    }).position(3.3, 0.22, -3.4).scale([0.06, 0.05, 6.2]))
    .add(primitives.box({
      name: "ceiling strip near",
      material: material.glowingEmissive({ color: "#274056", emissive: "#9be7ff", emissiveIntensity: 1.7 })
    }).position(0, 2.62, 5.6).scale([3.2, 0.04, 0.14]))
    .add(primitives.box({
      name: "ceiling strip mid",
      material: material.glowingEmissive({ color: "#274056", emissive: "#9be7ff", emissiveIntensity: 1.5 })
    }).position(0, 2.62, 0.4).scale([3.2, 0.04, 0.14]))
    .add(primitives.box({
      name: "ceiling strip far",
      material: material.glowingEmissive({ color: "#3d2a20", emissive: "#ffb020", emissiveIntensity: 1.4 })
    }).position(0, 2.62, -5.4).scale([3.2, 0.04, 0.14]))
    .addMany([
      [-3.36, 6.2, "#38d6ff"],
      [-3.36, 1.2, "#38d6ff"],
      [-3.36, -3.8, "#38d6ff"],
      [-3.36, -8.2, "#38d6ff"],
      [3.36, 6.2, "#ff4fd0"],
      [3.36, 1.2, "#ff4fd0"],
      [3.36, -3.8, "#ff4fd0"],
      [3.36, -8.2, "#ff4fd0"]
    ].map(([x, z, color], index) =>
      primitives.box({
        name: "wall neon strip " + index,
        material: material.glowingEmissive({ color: "#0a0f16", emissive: String(color), emissiveIntensity: 1.6 })
      }).position(Number(x), 1.5, Number(z)).scale([0.05, 2.2, 0.09])
    ))
    // Scene fog: depth haze toward the exit, not a CSS wash.
    .add(effects.fog({ density: 0.052, color: "#0a1520" }))
    // Authored hierarchy: dim cool ambient, warm key from the corridor depths,
    // cyan rim from behind the player so the rifle silhouette reads.
    .add(lights.ambient({ intensity: 0.34, color: "#3a5570" }))
    .add(lights.directional({ position: [0, 6, -10], intensity: 1.5, color: "#ffd9a0" }))
    .add(lights.directional({ position: [0, 4, 12], intensity: 1.9, color: "#4fd0ff" }))
    .add(lights.point({ name: "spawn fill", position: [0, 2.3, 9], color: "#bfe0ff", intensity: 4.2 }))
    .add(lights.point({ name: "forward fill", position: [0, 2.1, 5.6], color: "#9be7ff", intensity: 4.6 }))
    .add(lights.point({ name: "enemy key", position: [0, 2.2, 0.6], color: "#ffe7c2", intensity: 6.6 }))
    .add(lights.point({ name: "mid cyan practical", position: [0.2, 2.0, -0.2], color: "#38d6ff", intensity: 3.4 }))
    .add(lights.point({ name: "warm side practical", position: [-2.1, 1.7, -2.4], color: "#ff9d5c", intensity: 3.2 }))
    .add(lights.point({ name: "deep cyan", position: [1.4, 1.9, -5.2], color: "#38d6ff", intensity: 3.0 }))
    .add(lights.point({ name: "hazard amber practical", position: [2.6, 1.2, -3.4], color: "#ffb020", intensity: 2.4 }))
    .add(lights.point({ name: "exit glow", position: [0, 1.8, -7.6], color: "#3dffb0", intensity: 3.6 }))
    // Muzzle light: parked under the floor until a shot teleports it to the barrel.
    // Runtime handles cannot change light intensity, so the attenuation does the
    // hiding while it sits nine metres below the deck.
    .add(lights.point({ name: "shot light", position: [0, -8, 0], color: "#ff9d12", intensity: 5.5 })
      .runtime(game.runtimeNode("shot-light", { tags: ["fx"] })))
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
