// apps/showcase-orbital-defense/src/v2/scene/world.ts — low-orbit arena (T2.2).
// §6.9.4 F-tier: no admitted GLBs exist yet (K7 station/interceptor/drones +
// K5 planet maps land with the content wave — until then the route stays in
// review, per §6.9.4 fallback). The shell uses authored primitives: planet
// sphere + atmosphere rim + night city lights, station stand-in, two drone
// types, bolt streaks, shield shell, thin orbit-path ribbons (not tori),
// 300 instanced asteroids, instanced star shell (K1 deep-space stand-in).
import { game, instances, primitives } from "@aura3d/engine";
import {
  ASTEROID_MATERIAL, ATMOSPHERE_MATERIAL, BOLT_MATERIAL, DRONE_HOT_MATERIAL,
  DRONE_MATERIAL, NIGHT_LIGHTS_MATERIAL, ORBIT_PATH_MATERIAL,
  PLANET_DAY_MATERIAL, SHIELD_MATERIAL, STAR_MATERIAL,
  STATION_MATERIAL, STATION_PANEL_MATERIAL
} from "./materials";
import { enemyIds, playerRadius, projectileIds, shieldIds, polar } from "../../gameplay/waves";

export const PLANET_RADIUS = 1.15;
export const PLANET_NODE = "orbital-planet";
export const STATION_NODE = "player-station";
export const SHIELD_NODE = "shield-shell";

/** Deterministic 0..1 hash for prop scatter (no Math.random at mount). */
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 72 tangential box segments making a thin flat ring (orbit ribbon). */
function orbitRing(radius: number, thickness: number) {
  const segs = 72;
  const segLen = (Math.PI * 2 * radius) / segs;
  return Array.from({ length: segs }, (_, i) => {
    const a = (i / segs) * Math.PI * 2;
    return {
      position: [Math.cos(a) * radius, Math.sin(a) * radius, 0] as const,
      scale: [segLen * 0.82, thickness, thickness] as const,
      rotation: [0, 0, a + Math.PI / 2] as const
    };
  });
}

/** Planet + atmosphere + night-lights + star shell + asteroid belt + rings. */
export function orbitalWorldNodes(): unknown[] {
  const nodes: unknown[] = [];
  nodes.push(
    primitives.sphere({ name: PLANET_NODE, material: PLANET_DAY_MATERIAL, castShadow: false, receiveShadow: true })
      .position(0, 0, 0).scale(PLANET_RADIUS * 2)
      .runtime(game.runtimeNode(PLANET_NODE, { tags: ["world", "planet"] })),
    // Atmosphere rim: slightly larger translucent emissive shell (R-14-14).
    primitives.sphere({ name: "orbital-atmosphere", material: ATMOSPHERE_MATERIAL, castShadow: false, receiveShadow: false })
      .position(0, 0, 0).scale(PLANET_RADIUS * 2.12),
    // Night-side city lights: tiny emissive specks on the hemisphere facing
    // away from the sun key ([7.5,4.2,-5.5] → dark side x<0.4 region).
    instances.sphere({
      name: "orbital-city-lights",
      material: NIGHT_LIGHTS_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: Array.from({ length: 26 }, (_, i) => {
        const az = 2.2 + rand(i) * 2.4;
        const el = (rand(i + 40) - 0.5) * 1.1;
        const r = PLANET_RADIUS * 1.005;
        return {
          position: [Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r],
          scale: [0.014, 0.014, 0.014]
        };
      })
    }),
    // Orbit-path ribbons: 72 thin instanced segments at the combat radii
    // (PRD: thin additive ribbons, not the legacy fat tori — stand-in until
    // §8.1 ribbons land).
    instances.box({
      name: "orbit-path-player",
      material: ORBIT_PATH_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: orbitRing(playerRadius, 0.006)
    }),
    instances.box({
      name: "orbit-path-outer",
      material: ORBIT_PATH_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: orbitRing(4.75, 0.004)
    }),
    // K1 deep-space stand-in: authored star shell (emissive, no shadow).
    instances.sphere({
      name: "orbital-star-shell",
      material: STAR_MATERIAL,
      castShadow: false,
      receiveShadow: false,
      transforms: Array.from({ length: 140 }, (_, i) => {
        const az = rand(i + 100) * Math.PI * 2;
        const el = (rand(i + 200) - 0.35) * Math.PI;
        const r = 42 + rand(i + 300) * 16;
        const s = 0.05 + rand(i + 400) * 0.12;
        return {
          position: [Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r],
          scale: [s, s, s]
        };
      })
    }),
    // K5 asteroid belt: 300 instanced rocks on a loose ring outside combat.
    instances.sphere({
      name: "orbital-asteroid-belt",
      material: ASTEROID_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: Array.from({ length: 300 }, (_, i) => {
        const a = (i / 300) * Math.PI * 2 + rand(i + 500) * 0.2;
        const r = 7.2 + rand(i + 600) * 3.4;
        const s = 0.05 + rand(i + 700) * 0.16;
        return {
          position: [Math.cos(a) * r, (rand(i + 800) - 0.5) * 1.6, Math.sin(a) * r],
          scale: [s, s * (0.6 + rand(i + 900) * 0.8), s],
          rotation: [rand(i + 1000) * 3, rand(i + 1100) * 3, 0]
        };
      })
    })
  );
  return nodes;
}

/** Station + drones + bolts + shield — runtime-synced each frame. */
export function orbitalCombatNodes(): unknown[] {
  const nodes: unknown[] = [];
  // Station stand-in (K7 turret GLB pending): hub + barrel + solar wings.
  const stationBase = polar(-Math.PI / 2, playerRadius, 0);
  nodes.push(
    primitives.cylinder({ name: `${STATION_NODE}-hub`, material: STATION_MATERIAL, castShadow: true, receiveShadow: true })
      .position(stationBase[0], stationBase[1], 0).scale([0.34, 0.16, 0.34])
      .runtime(game.runtimeNode(`${STATION_NODE}-hub`, { tags: ["player", "station"] })),
    primitives.box({ name: `${STATION_NODE}-barrel`, material: STATION_MATERIAL, castShadow: true, receiveShadow: true })
      .position(stationBase[0], stationBase[1], 0).scale([0.05, 0.05, 0.3])
      .runtime(game.runtimeNode(`${STATION_NODE}-barrel`, { tags: ["player", "station"] })),
    primitives.box({ name: `${STATION_NODE}-wing-l`, material: STATION_PANEL_MATERIAL, castShadow: true, receiveShadow: true })
      .position(stationBase[0], stationBase[1], 0).scale([0.34, 0.015, 0.12])
      .runtime(game.runtimeNode(`${STATION_NODE}-wing-l`, { tags: ["player", "station"] })),
    primitives.box({ name: `${STATION_NODE}-wing-r`, material: STATION_PANEL_MATERIAL, castShadow: true, receiveShadow: true })
      .position(stationBase[0], stationBase[1], 0).scale([0.34, 0.015, 0.12])
      .runtime(game.runtimeNode(`${STATION_NODE}-wing-r`, { tags: ["player", "station"] }))
  );

  // Two drone types (K7 pending): lane-even boxes, lane-odd capsules.
  for (const id of enemyIds) {
    const index = enemyIds.indexOf(id);
    const drone = index % 2 === 0
      ? primitives.box({ name: id, material: DRONE_MATERIAL, castShadow: true, receiveShadow: true })
          .position(0, 0, -40).scale([0.22, 0.1, 0.3])
      : primitives.capsule({ name: id, material: DRONE_HOT_MATERIAL, castShadow: true, receiveShadow: true })
          .position(0, 0, -40).scale([0.13, 0.13, 0.13]);
    nodes.push(drone.runtime(game.runtimeNode(id, { tags: ["enemy", "drone"] })));
  }

  // Bolt streaks (thin emissive rods; parked below until fired).
  for (const id of projectileIds) {
    nodes.push(
      primitives.box({ name: id, material: BOLT_MATERIAL, castShadow: false, receiveShadow: false })
        .position(0, 0, -40).scale([0.025, 0.025, 0.26])
        .runtime(game.runtimeNode(id, { tags: ["projectile", "bolt"] }))
    );
  }

  // Shield pulses (Fresnel+hex stand-in: translucent emissive shell).
  for (const id of shieldIds) {
    nodes.push(
      primitives.sphere({ name: id, material: SHIELD_MATERIAL, castShadow: false, receiveShadow: false })
        .position(0, 0, -40).scale(0.5)
        .runtime(game.runtimeNode(id, { tags: ["shield", "player"] }))
    );
  }
  return nodes;
}
