// apps/showcase-neon-swarm/src/v2/scene/world.ts — night-plaza world (T2.2).
// §6.9.8: typed arena + barricade/lamp props, district frame + instanced
// window dressing, pressure rails, pickup doors + risk pickup, the courier
// mech with its pulse carbine and accents, all event fx nodes, and the two
// live instanced drone pools bound to the seeded sim transforms.
import {
  game, geometry, instances, material, model, primitives, type AuraNodeInput,
  type AuraTransformSpec
} from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { createArenaLayout } from "../../gameplay/arena";
import type { SwarmSimulation } from "../../gameplay/swarm";
import type { CombatFeel } from "../../legacy/combat-feel";
import { PICKUP_DOORS } from "../../gameplay/pickups";
import {
  AIM_VECTOR, BURST_RADIUS, BURST_RING, COURIER_ACCENT, DOOR_GLOW,
  MUZZLE_FLASH, PICKUP_GOLD, PRESSURE_CYAN, PRESSURE_MAGENTA, PULSE_IMPACT,
  PULSE_RAY
} from "./materials";

export interface SwarmWorldNodes {
  readonly nodes: AuraNodeInput[];
}

// ------------------------------------------------------------ faceted drones --

/**
 * Legacy faceted threat geometry: elites get a threat silhouette with a nose,
 * swept wings and a notched tail; grunts keep their pebble disc. Ported
 * verbatim — the instanced pools stay at two draw submissions.
 */
function createFacetedThreatGeometry(elite: boolean) {
  const ring: Array<[number, number]> = elite
    ? [
      [0, 1.0], [0.35, 0.35], [0.9, 0.1], [0.4, -0.12], [0.25, -0.7],
      [0, -0.45], [-0.25, -0.7], [-0.4, -0.12], [-0.9, 0.1], [-0.35, 0.35]
    ]
    : [
      [0, 0.92], [0.34, 0.68], [0.5, 0.2], [0.42, -0.52],
      [0, -0.9], [-0.42, -0.52], [-0.5, 0.2], [-0.34, 0.68]
    ];
  const positions: Array<[number, number, number]> = [[0, elite ? 0.52 : 0.42, 0]];
  const indices: number[] = [];
  for (const [x, z] of ring) positions.push([x, 0.16, z]);
  const bottomCenter = positions.length;
  positions.push([0, 0.02, 0]);
  const bottomStart = positions.length;
  for (const [x, z] of ring) positions.push([x * 0.92, 0.04, z * 0.92]);
  for (let index = 0; index < ring.length; index += 1) {
    const next = (index + 1) % ring.length;
    const topA = 1 + index;
    const topB = 1 + next;
    const bottomA = bottomStart + index;
    const bottomB = bottomStart + next;
    indices.push(0, topA, topB);
    indices.push(bottomCenter, bottomB, bottomA);
    indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
  }
  return geometry.define({ positions, indices });
}

// --------------------------------------------------------------- skyline -----

function skylineNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  // District frames: 14 staggered edge towers at the arena lip.
  for (let index = 0; index < 14; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2);
    const z = -14 + lane * 4.35;
    const x = side * (13.8 + (lane % 3) * 1.2);
    const height = 4.5 + (lane % 4) * 1.35;
    const tint = index % 4 === 0 ? "#ff4fd8" : index % 3 === 0 ? "#7c6cff" : "#35e6ff";
    nodes.push(
      primitives.box({
        name: `district frame ${index}`,
        material: material.pbr({ name: `district frame mat ${index}`, color: "#0d1524", roughness: 0.5, metallic: 0.3 })
      })
        .position(x, height / 2 - 0.5, z)
        .scale([0.9, height, 0.55])
        .toJSON()
    );
    nodes.push(
      primitives.box({
        name: `district crown ${index}`,
        material: material.emissive({ name: `district crown mat ${index}`, color: "#0d1524", emissive: tint, emissiveIntensity: 0.9 })
      })
        .position(x, height - 0.28, z)
        .scale([1.0, 0.12, 0.65])
        .toJSON()
    );
  }
  return nodes;
}

// ----------------------------------------------------------------- world -----

export function swarmWorldNodes(swarm: SwarmSimulation, combatFeel: CombatFeel): SwarmWorldNodes {
  const nodes: AuraNodeInput[] = [];
  const layout = createArenaLayout();

  // Typed arena model is the plaza centerpiece; barricades and lamps land on
  // the authored obstacle placements the steering sim collides with.
  nodes.push(
    model(assets.neonArena, {
      name: "neon plaza arena",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 52,
      receiveShadow: true
    }).position(0, -0.05, 0).toJSON()
  );
  for (const obstacle of layout.obstacles) {
    nodes.push(
      model(assets.neonBarricadeProp, {
        name: `barricade ${obstacle.x},${obstacle.z}`,
        role: "primaryWorld",
        scaleMode: "fit",
        targetMaxDimension: 2.6,
        castShadow: true
      })
        .position(obstacle.x, 0, obstacle.z)
        .rotate(0, obstacle.rotationY, 0)
        .toJSON()
    );
  }
  for (const lamp of layout.lamps) {
    nodes.push(
      model(assets.neonStreetLampProp, {
        name: `lamp ${lamp.x},${lamp.z}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 3.4,
        castShadow: true
      })
        .position(lamp.x, 0, lamp.z)
        .rotate(0, lamp.rotationY, 0)
        .toJSON()
    );
  }

  nodes.push(...skylineNodes());

  // Pressure rails trace the live arena rect every frame (runState inset).
  for (const side of ["north", "south", "east", "west"] as const) {
    nodes.push(
      primitives.box({
        name: `arena pressure ${side}`,
        material: side === "north" || side === "west" ? PRESSURE_CYAN : PRESSURE_MAGENTA
      })
        .position(0, -8, 0)
        .scale([1, 1, 1])
        .runtime(game.runtimeNode(`arena-pressure-${side}`, { tags: ["arena-pressure", "renderer-owned"] }))
        .toJSON()
    );
  }

  // Intermission upgrade doors + the per-wave risk pickup (both hidden until
  // the sim activates them).
  for (const door of PICKUP_DOORS) {
    nodes.push(
      primitives.torus({
        name: `pickup gate ${door.kind}`,
        material: DOOR_GLOW
      })
        .position(door.x, 0.9, door.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale(0.9)
        .runtime(game.runtimeNode(`pickup-gate-${door.kind}`, { tags: ["pickup-door", "renderer-owned"] }))
        .toJSON()
    );
  }
  nodes.push(
    primitives.sphere({
      name: "risk pickup orb",
      material: PICKUP_GOLD
    })
      .position(0, -8, 0)
      .scale(0.34)
      .runtime(game.runtimeNode("swarm-pickup", { tags: ["risk-pickup", "renderer-owned"] }))
      .toJSON()
  );

  // Courier mech: typed avatar + renderer-owned accents and the pulse carbine.
  nodes.push(
    model(assets.neonCourierAvatar, {
      name: "neon-player",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 1.9,
      castShadow: true
    })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("neon-player", { tags: ["player", "physics-synced"] }))
      .toJSON(),
    primitives.box({ name: "courier visor", material: COURIER_ACCENT })
      .position(0, -8, 0).scale([0.34, 0.1, 0.12])
      .runtime(game.runtimeNode("neon-courier-visor-accent", { tags: ["courier-accent", "renderer-owned"] }))
      .toJSON(),
    primitives.sphere({ name: "courier chest core", material: COURIER_ACCENT })
      .position(0, -8, 0).scale([0.16, 0.16, 0.1])
      .runtime(game.runtimeNode("neon-courier-chest-core", { tags: ["courier-accent", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "courier shoulder frame", material: COURIER_ACCENT })
      .position(0, -8, 0).scale([0.42, 0.42, 0.42])
      .runtime(game.runtimeNode("neon-courier-shoulder-frame", { tags: ["courier-accent", "renderer-owned"] }))
      .toJSON(),
    primitives.box({ name: "courier pulse emitter", material: COURIER_ACCENT })
      .position(0, -8, 0).scale([0.16, 0.34, 0.16])
      .runtime(game.runtimeNode("neon-courier-pulse-emitter", { tags: ["courier-accent", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "courier core ring", material: COURIER_ACCENT })
      .position(0, -8, 0).scale([0.3, 0.3, 0.06])
      .runtime(game.runtimeNode("neon-courier-core-ring", { tags: ["courier-accent", "renderer-owned"] }))
      .toJSON()
  );

  // Pulse carbine: typed weapon GLB + emissive core + muzzle ring + flash.
  nodes.push(
    model(assets.mechWeaponA, {
      name: "courier pulse carbine",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 0.95,
      castShadow: true
    })
      .position(0, -8, 0)
      .runtime(game.runtimeNode("neon-courier-pulse-carbine", { tags: ["courier-weapon", "renderer-owned"] }))
      .toJSON(),
    primitives.box({ name: "carbine core", material: COURIER_ACCENT })
      .position(0, -8, 0).scale([0.05, 0.05, 0.34])
      .runtime(game.runtimeNode("neon-courier-pulse-carbine-core", { tags: ["courier-weapon", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "muzzle ring", material: COURIER_ACCENT })
      .position(0, -8, 0).scale([0.12, 0.12, 0.12])
      .runtime(game.runtimeNode("neon-courier-pulse-muzzle-ring", { tags: ["courier-weapon", "renderer-owned"] }))
      .toJSON()
  );

  // Event fx: pulse ray, impact ring + 6 shards, muzzle flash, burst ring +
  // 8 spokes, burst radius, aim vector — all runtime-hidden until fired.
  nodes.push(
    primitives.box({ name: "pulse shot ray", material: PULSE_RAY })
      .position(0, -8, 0).scale([0.06, 0.06, 3.0])
      .runtime(game.runtimeNode("neon-pulse-shot-ray", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "pulse impact ring", material: PULSE_IMPACT })
      .position(0, -8, 0).scale([0.5, 0.5, 0.5])
      .runtime(game.runtimeNode("neon-pulse-impact-ring", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON(),
    primitives.sphere({ name: "muzzle flash", material: MUZZLE_FLASH })
      .position(0, -8, 0).scale(0.16)
      .runtime(game.runtimeNode("neon-courier-pulse-muzzle-flash", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "burst event ring", material: BURST_RING })
      .position(0, -8, 0).scale(0.4)
      .runtime(game.runtimeNode("neon-burst-event-ring", { tags: ["contact-feedback", "renderer-owned"] }))
      .toJSON(),
    primitives.torus({ name: "burst radius meter", material: BURST_RADIUS })
      .position(0, -8, 0).rotate(Math.PI / 2, 0, 0).scale(4.2)
      .runtime(game.runtimeNode("neon-player-burst-radius", { tags: ["courier-accent", "renderer-owned"] }))
      .toJSON(),
    primitives.box({ name: "aim vector tick", material: AIM_VECTOR })
      .position(0, -8, 0).scale([0.05, 0.03, 0.5])
      .runtime(game.runtimeNode("neon-player-aim-vector", { tags: ["courier-accent", "renderer-owned"] }))
      .toJSON()
  );
  for (let index = 0; index < 6; index += 1) {
    nodes.push(
      primitives.box({ name: `pulse impact shard ${index}`, material: PULSE_IMPACT })
        .position(0, -8, 0).scale([0.04, 0.04, 0.3])
        .runtime(game.runtimeNode(`neon-pulse-impact-shard-${index}`, { tags: ["contact-feedback", "renderer-owned"] }))
        .toJSON()
    );
  }
  for (let index = 0; index < 8; index += 1) {
    nodes.push(
      primitives.box({ name: `burst spoke ${index}`, material: BURST_RING })
        .position(0, -8, 0)
        .rotate(0, (index * Math.PI) / 4, 0)
        .scale([0.05, 0.04, 0.9])
        .runtime(game.runtimeNode(`neon-burst-spoke-${index}`, { tags: ["contact-feedback", "renderer-owned"] }))
        .toJSON()
    );
  }

  // Two live instanced drone pools bound to the seeded sim transforms.
  nodes.push(
    instances.custom(createFacetedThreatGeometry(false), {
      name: "thorn moth swarm grunt pool",
      transforms: swarm.gruntTransforms,
      colors: swarm.gruntColors,
      material: material.pbr({ name: "grunt pool material", color: "#315f57", emissive: "#73b99d", emissiveIntensity: 0.5, roughness: 0.48, metallic: 0.12 })
    }),
    instances.custom(createFacetedThreatGeometry(true), {
      name: "crown hunter elite pool",
      transforms: swarm.eliteTransforms,
      colors: swarm.eliteColors,
      material: material.pbr({ name: "elite pool material", color: "#7a1f3d", emissive: "#ff4d7e", emissiveIntensity: 0.55, roughness: 0.42, metallic: 0.12 })
    }),
    instances.sphere({
      name: "impact spark pool",
      transforms: combatFeel.sparkTransforms as unknown as readonly AuraTransformSpec[],
      colors: combatFeel.sparkColors,
      material: material.emissive({ name: "spark pool material", color: "#201409", emissive: "#ffd166" }),
      size: 0.16
    })
  );

  return { nodes };
}
