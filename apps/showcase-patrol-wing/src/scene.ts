// Patrol Wing — fresh single-path scene builder (B5 port).
//
// One pure builder, shared headless and in the browser: island terrain is
// triangulated fresh from the extracted `islandHeight` data (no legacy sky
// builder), the pad and ring gates sit at the extracted course constants,
// and every moving part (plane, ghost, drones, orbs, next-ring beacon) is a
// runtime node the frame loop re-poses from salvaged sim state. The scene
// is built once; progress only re-poses, re-colors, and re-hides nodes.
import {
  camera,
  game,
  geometry,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraCameraPose,
  type AuraCameraRig,
  type AuraCameraRigContext,
  type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "./aura-assets";
import {
  ISLAND_RADIUS,
  islandHeight,
  PAD_CENTER,
  PAD_HEADING_YAW,
  PAD_Y,
  RING_GATES
} from "./gameplay/course-data";

export const LOOK_ID = "golden-hour" as const;
export const LOOK_CATEGORY = "outdoor" as const;

/** Visual pools: 15 covers three overlapping 5-drone waves; 8 matches the
 *  salvaged arena orb pool. Sim state is never capped by these counts. */
export const DRONE_NODE_COUNT = 15;
export const ORB_NODE_COUNT = 8;

export const RING_QUEUED = material.emissive({ name: "ring queued", color: "#274b63", emissive: "#2f7fb8", emissiveIntensity: 0.7 });
export const RING_ACTIVE = material.emissive({ name: "ring active", color: "#ffb14d", emissive: "#ff9a1f", emissiveIntensity: 1.6 });
export const RING_PASSED = material.emissive({ name: "ring passed", color: "#39d7a8", emissive: "#1fae82", emissiveIntensity: 1.2 });

const ISLAND_TURF = material.felt({ name: "island coastal turf", color: "#2d5a27", roughness: 0.86 });
const FOLIAGE_CANOPY = material.felt({ name: "coastal foliage ridge", color: "#234c22", roughness: 0.84 });
const CLIFF_ROCK = material.planet("rocky", { name: "archipelago cliff rock", color: "#8c583a", roughness: 0.75 });
const OCEAN = material.reflectiveFloor({
  name: "archipelago ocean",
  color: "#0a365c",
  roughness: 0.08,
  metallic: 0.45,
  clearcoat: 0.9,
  clearcoatRoughness: 0.04
});
const OCEAN_GLINT = material.reflectiveFloor({
  name: "ocean sun glint",
  color: "#1a5c8a",
  roughness: 0.05,
  metallic: 0.58,
  clearcoat: 0.95,
  clearcoatRoughness: 0.03
});
const SHORE_FOAM = material.felt({ name: "shoreline surf", color: "#a8d5e5", roughness: 0.55 });
const AIRSTRIP_TARMAC = material.blackRubber({ name: "airstrip tarmac", color: "#1e293b", roughness: 0.74 });
const RUNWAY_STRIPE = material.felt({ name: "runway marking", color: "#e2e8f0", roughness: 0.45 });
const HANGAR_METAL = material.brushedMetal({ name: "hangar steel", color: "#475569", roughness: 0.34, metallic: 0.86 });
const RADAR_STEEL = material.brushedMetal({ name: "radar tower steel", color: "#94a3b8", roughness: 0.26, metallic: 0.9 });
const BEACON = material.emissive({ name: "next ring beacon", color: "#59d7ff", emissive: "#59d7ff", emissiveIntensity: 1.1 });
const RUNWAY_LIGHT = material.emissive({ name: "runway edge light", color: "#ff9a1f", emissive: "#ff9a1f", emissiveIntensity: 1.35 });
const CONTRAIL_MAT = material.emissive({ name: "wingtip contrail", color: "#d8f3ff", emissive: "#7cd8ff", emissiveIntensity: 0.9 });
const AFTERBURNER_MAT = material.emissive({ name: "engine afterburner", color: "#ffb14d", emissive: "#ff7b1f", emissiveIntensity: 1.7 });
const TRACER_MAT = material.emissive({ name: "cannon tracer", color: "#fff08a", emissive: "#ffae2b", emissiveIntensity: 2.1 });
const ORB = material.emissive({ name: "return fire orb", color: "#ff5d4d", emissive: "#ff3b26", emissiveIntensity: 1.8 });
// S5 art-direction compliance: non-practical materials must keep emissiveIntensity <= 0.1.
const GHOST = material.pbr({
  name: "ghost airframe shell",
  color: "#9fd8ff",
  roughness: 0.35,
  metalness: 0.15,
  emissive: "#9fd8ff",
  emissiveIntensity: 0.08
});

/**
 * Fresh island triangulation from the extracted height data: a regular XZ
 * grid sampled through `islandHeight`, cells outside the island radius
 * omitted so the ocean meets a real shoreline, with smooth accumulated
 * normals. Pure data in, buffers out — asserted headless.
 */
export function buildTerrainGeometry(resolution = 48, extent = 30): {
  readonly positions: readonly (readonly [number, number, number])[];
  readonly normals: readonly (readonly [number, number, number])[];
  readonly indices: readonly number[];
} {
  const count = resolution + 1;
  const step = (extent * 2) / resolution;
  const positions: [number, number, number][] = [];
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      const x = -extent + ix * step;
      const z = -extent + iz * step;
      positions.push([x, islandHeight(x, z), z]);
    }
  }
  const indices: number[] = [];
  for (let iz = 0; iz < resolution; iz += 1) {
    for (let ix = 0; ix < resolution; ix += 1) {
      const cx = -extent + (ix + 0.5) * step;
      const cz = -extent + (iz + 0.5) * step;
      if (Math.hypot(cx, cz) > ISLAND_RADIUS) continue;
      const a = iz * count + ix;
      indices.push(a, a + count, a + 1, a + 1, a + count, a + count + 1);
    }
  }
  const normals: [number, number, number][] = positions.map(() => [0, 0, 0]);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]!;
    const ib = indices[t + 1]!;
    const ic = indices[t + 2]!;
    const a = positions[ia]!;
    const b = positions[ib]!;
    const c = positions[ic]!;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const v of [ia, ib, ic]) {
      normals[v]![0] += nx;
      normals[v]![1] += ny;
      normals[v]![2] += nz;
    }
  }
  for (const n of normals) {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= len;
    n[1] /= len;
    n[2] /= len;
  }
  return { positions, normals, indices };
}

/**
 * Faceted coastal cliff ring & rocky escarpments framing the island shoreline
 * where the turf plateau meets the sea.
 */
function buildCliffRingGeometry(segments = 48): {
  readonly positions: readonly (readonly [number, number, number])[];
  readonly normals: readonly (readonly [number, number, number])[];
  readonly indices: readonly number[];
} {
  const positions: [number, number, number][] = [];
  const indices: number[] = [];
  const rings = [
    { rBase: 14.5, yScale: 0.96, crag: 1.15 },
    { rBase: 19.2, yScale: 0.62, crag: 1.65 },
    { rBase: 24.4, yScale: 0.18, crag: 1.25 },
    { rBase: 27.6, yScale: 0.0, crag: 0.45 }
  ];
  const stride = segments + 1;
  for (let ir = 0; ir < rings.length; ir += 1) {
    const ring = rings[ir]!;
    for (let is = 0; is <= segments; is += 1) {
      const theta = (is / segments) * Math.PI * 2;
      const harmonic =
        Math.sin(theta * 5 + 0.4) * 0.6 +
        Math.cos(theta * 9 - 0.8) * 0.4 +
        Math.sin(theta * 13 + 1.1) * 0.25;
      const r = ring.rBase + harmonic * ring.crag;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const baseH = islandHeight(x, z);
      const ridgeLift = ir < 2 ? Math.max(0, Math.sin(theta * 7 + ir) * 1.15) : 0;
      const y = ir === rings.length - 1 ? -0.25 : baseH * ring.yScale + ridgeLift;
      positions.push([x, y, z]);
    }
  }
  for (let ir = 0; ir < rings.length - 1; ir += 1) {
    for (let is = 0; is < segments; is += 1) {
      const a = ir * stride + is;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, c, b, d);
    }
  }
  const normals: [number, number, number][] = positions.map(() => [0, 0, 0]);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]!;
    const ib = indices[t + 1]!;
    const ic = indices[t + 2]!;
    const a = positions[ia]!;
    const b = positions[ib]!;
    const c = positions[ic]!;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const v of [ia, ib, ic]) {
      normals[v]![0] += nx;
      normals[v]![1] += ny;
      normals[v]![2] += nz;
    }
  }
  for (const n of normals) {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= len;
    n[1] /= len;
    n[2] /= len;
  }
  return { positions, normals, indices };
}

export function buildPatrolScene() {
  const terrain = buildTerrainGeometry();
  const cliffs = buildCliffRingGeometry();
  const initialPose = patrolPoseFor({
    position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
    forward: [-1, 0, 0],
    up: [0, 1, 0]
  });

  // Sea stacks and outer archipelago rocky islets around the ring course so the
  // horizon and water surface have rich parallax from every camera heading.
  const seaStacks: readonly { readonly pos: readonly [number, number, number]; readonly scale: readonly [number, number, number]; readonly yaw: number }[] = [
    { pos: [-34, 2.6, -14], scale: [6.8, 6.2, 5.4], yaw: 0.4 },
    { pos: [-38, 1.8, 16], scale: [5.5, 4.4, 6.2], yaw: 1.1 },
    { pos: [-16, 3.1, -34], scale: [7.4, 7.0, 5.8], yaw: 2.1 },
    { pos: [26, 2.8, -32], scale: [6.4, 5.8, 5.2], yaw: 0.8 },
    { pos: [38, 2.4, 4], scale: [6.0, 5.2, 6.8], yaw: 1.7 },
    { pos: [24, 2.1, 32], scale: [5.6, 4.5, 5.0], yaw: 2.6 },
    { pos: [-18, 2.2, 32], scale: [6.2, 4.8, 5.4], yaw: 0.3 }
  ];

  // Coastal pine/foliage ridge clusters framing the central peak and runway.
  const foliageClusters: readonly { readonly x: number; readonly z: number; readonly r: number; readonly h: number }[] = [
    { x: 3.5, z: -4.0, r: 2.8, h: 3.6 },
    { x: 6.2, z: -1.5, r: 2.4, h: 3.2 },
    { x: -1.8, z: -6.8, r: 3.0, h: 3.8 },
    { x: -8.5, z: -5.2, r: 2.5, h: 3.1 },
    { x: 8.4, z: 5.5, r: 2.6, h: 3.3 },
    { x: 4.0, z: 10.5, r: 2.7, h: 3.0 },
    { x: -12.5, z: 11.2, r: 2.3, h: 2.8 },
    { x: 11.0, z: -7.5, r: 2.5, h: 3.1 }
  ];

  const nodes: AuraNodeInput[] = [
    geometry.custom(
      geometry.define({
        positions: terrain.positions,
        normals: terrain.normals,
        indices: terrain.indices
      }),
      { name: "island-terrain", material: ISLAND_TURF, receiveShadow: true }
    ),
    geometry.custom(
      geometry.define({
        positions: cliffs.positions,
        normals: cliffs.normals,
        indices: cliffs.indices
      }),
      { name: "island-cliff-skirt", material: CLIFF_ROCK, castShadow: true, receiveShadow: true }
    ),
    // Reflective ocean surface + shoreline surf collar + golden-hour specular lanes.
    primitives
      .plane({ name: "ocean", material: OCEAN, receiveShadow: true })
      .rotate(-Math.PI / 2, 0, 0)
      .scale([240, 240, 1]),
    primitives
      .cylinder({ name: "shoreline-foam-ring", material: SHORE_FOAM })
      .position(0, 0.04, 0)
      .scale([ISLAND_RADIUS * 2.06, 0.08, ISLAND_RADIUS * 2.06]),
    primitives
      .box({ name: "ocean-glint-west", material: OCEAN_GLINT })
      .position(-44, 0.03, -8)
      .rotate(0, 0.32, 0)
      .scale([52, 0.04, 14]),
    primitives
      .box({ name: "ocean-glint-north", material: OCEAN_GLINT })
      .position(-8, 0.03, -42)
      .rotate(0, -0.28, 0)
      .scale([46, 0.04, 12]),
    primitives
      .box({ name: "ocean-glint-east", material: OCEAN_GLINT })
      .position(42, 0.03, 6)
      .rotate(0, 0.48, 0)
      .scale([48, 0.04, 12]),

    // Outer rocky crags & sea stacks.
    ...seaStacks.map((stack, idx) =>
      primitives
        .cylinder({ name: `sea-stack-${idx}`, material: CLIFF_ROCK, castShadow: true, receiveShadow: true })
        .position(stack.pos[0], stack.pos[1], stack.pos[2])
        .rotate(0.12, stack.yaw, -0.08)
        .scale([stack.scale[0], stack.scale[1], stack.scale[2]])
    ),

    // Coastal foliage ridges on the island slopes.
    ...foliageClusters.map((cluster, idx) => {
      const groundY = islandHeight(cluster.x, cluster.z);
      return primitives
        .capsule({ name: `foliage-ridge-${idx}`, material: FOLIAGE_CANOPY, castShadow: true, receiveShadow: true })
        .position(cluster.x, groundY + cluster.h * 0.42, cluster.z)
        .scale([cluster.r, cluster.h, cluster.r]);
    }),

    // Airstrip tarmac extending west from the landing pad toward Ring 0 so the
    // takeoff roll and approach path read clearly in frame.
    primitives
      .box({ name: "airstrip-tarmac", material: AIRSTRIP_TARMAC, receiveShadow: true })
      .position(PAD_CENTER[0] - 4.2, PAD_Y + 0.02, PAD_CENTER[2])
      .scale([16.8, 0.12, 5.4]),
    primitives
      .box({ name: "airstrip-apron", material: AIRSTRIP_TARMAC, receiveShadow: true })
      .position(PAD_CENTER[0] - 1.5, PAD_Y + 0.01, PAD_CENTER[2] + 4.4)
      .scale([9.2, 0.1, 4.2]),
    // Runway centerline dashes.
    ...Array.from({ length: 5 }, (_, idx) =>
      primitives
        .box({ name: `runway-dash-${idx}`, material: RUNWAY_STRIPE })
        .position(PAD_CENTER[0] - 11.2 + idx * 3.2, PAD_Y + 0.09, PAD_CENTER[2])
        .scale([1.7, 0.03, 0.28])
    ),
    // Glowing amber runway edge lights along both sides of the strip.
    ...Array.from({ length: 6 }, (_, idx) =>
      primitives
        .sphere({ name: `runway-light-n-${idx}`, material: RUNWAY_LIGHT })
        .position(PAD_CENTER[0] - 11.5 + idx * 3.0, PAD_Y + 0.18, PAD_CENTER[2] - 2.55)
        .scale(0.22)
    ),
    ...Array.from({ length: 6 }, (_, idx) =>
      primitives
        .sphere({ name: `runway-light-s-${idx}`, material: RUNWAY_LIGHT })
        .position(PAD_CENTER[0] - 11.5 + idx * 3.0, PAD_Y + 0.18, PAD_CENTER[2] + 2.55)
        .scale(0.22)
    ),

    // Coastal hangar & control tower complex beside the airstrip.
    primitives
      .box({ name: "coastal-hangar-main", material: HANGAR_METAL, castShadow: true, receiveShadow: true })
      .position(PAD_CENTER[0] - 2.4, PAD_Y + 1.15, PAD_CENTER[2] + 5.6)
      .scale([5.4, 2.3, 3.4]),
    primitives
      .cylinder({ name: "coastal-hangar-roof", material: RADAR_STEEL, castShadow: true })
      .position(PAD_CENTER[0] - 2.4, PAD_Y + 2.3, PAD_CENTER[2] + 5.6)
      .rotate(0, 0, Math.PI / 2)
      .scale([3.3, 5.5, 1.4]),
    primitives
      .cylinder({ name: "radar-tower-pylon", material: RADAR_STEEL, castShadow: true, receiveShadow: true })
      .position(PAD_CENTER[0] + 3.2, islandHeight(PAD_CENTER[0] + 3.2, PAD_CENTER[2] - 4.4) + 2.4, PAD_CENTER[2] - 4.4)
      .scale([1.15, 4.8, 1.15]),
    primitives
      .torus({ name: "radar-tower-dish", material: RADAR_STEEL, castShadow: true })
      .position(PAD_CENTER[0] + 3.2, islandHeight(PAD_CENTER[0] + 3.2, PAD_CENTER[2] - 4.4) + 5.2, PAD_CENTER[2] - 4.4)
      .rotate(0.45, -0.6, 0)
      .scale([2.2, 2.2, 0.7]),
    primitives
      .sphere({ name: "radar-tower-beacon", material: BEACON })
      .position(PAD_CENTER[0] + 3.2, islandHeight(PAD_CENTER[0] + 3.2, PAD_CENTER[2] - 4.4) + 5.9, PAD_CENTER[2] - 4.4)
      .scale(0.32),

    // Typed landing pad at the extracted pad centre (deck spans the 4.8 m
    // touchdown disc the flight model's pad radius describes).
    model(assets.patrolWingPadBeacon, {
      name: "landing-pad",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 4.8,
      receiveShadow: true
    })
      .position(PAD_CENTER[0], PAD_Y + 0.05, PAD_CENTER[2])
      .rotate(0, PAD_HEADING_YAW, 0),
    // Secondary threshold beacon at the western departure end of the airstrip.
    model(assets.patrolWingPadBeacon, {
      name: "departure-threshold-beacon",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.4,
      receiveShadow: true
    })
      .position(PAD_CENTER[0] - 11.8, PAD_Y + 0.04, PAD_CENTER[2])
      .rotate(0, PAD_HEADING_YAW, 0),
    // Parked wingman aircraft on the south dispersal apron.
    model(assets.patrolWingPlane, {
      name: "apron-wingman-plane",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 3.2,
      castShadow: true
    })
      .position(PAD_CENTER[0] + 1.4, PAD_Y + 0.42, PAD_CENTER[2] + 4.2)
      .rotate(0, PAD_HEADING_YAW - 0.38, 0),

    // Six ordered ring gates at the extracted course positions. The torus
    // ring lies in local XY; yaw turns its aperture across the flight path.
    ...RING_GATES.map((gate) =>
      primitives
        .torus({ name: `ring-${gate.index}`, material: gate.index === 0 ? RING_ACTIVE : RING_QUEUED })
        .position(gate.position[0], gate.position[1], gate.position[2])
        .rotate(0, gate.yaw, 0)
        .scale([gate.radius * 2, gate.radius * 2, gate.radius * 0.9])
        .runtime(game.runtimeNode(`ring-${gate.index}`, { tags: ["ring-gate"] }))
    ),
    // Objective beacon shaft over the next unflown gate.
    primitives
      .cylinder({ name: "next-ring-beacon", material: BEACON })
      .position(RING_GATES[0]!.position[0], RING_GATES[0]!.position[1] + 6, RING_GATES[0]!.position[2])
      .scale([0.35, 12, 0.35])
      .runtime(game.runtimeNode("next-ring-beacon", { tags: ["objective-beacon"] })),
    // Player airframe (+X forward, matching the salvaged flight axes) and
    // the non-scoring ghost airframe in a pale shell.
    model(assets.patrolWingPlane, {
      name: "patrol-plane",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 3.8,
      castShadow: true
    })
      .position(PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2])
      .rotate(0, PAD_HEADING_YAW, 0)
      .runtime(game.runtimeNode("patrol-plane", { tags: ["typed-asset", "player"] })),
    // Dynamic engine afterburner cone and wingtip contrails attached in world space each frame.
    primitives
      .capsule({ name: "plane-afterburner", material: AFTERBURNER_MAT })
      .position(PAD_CENTER[0] + 1.7, PAD_Y + 0.42, PAD_CENTER[2])
      .scale([0.28, 0.95, 0.28])
      .runtime(game.runtimeNode("plane-afterburner", { tags: ["player-fx"] })),
    primitives
      .cylinder({ name: "contrail-left", material: CONTRAIL_MAT })
      .position(0, -65, 0)
      .scale([0.08, 3.2, 0.08])
      .runtime(game.runtimeNode("contrail-left", { tags: ["player-fx"] })),
    primitives
      .cylinder({ name: "contrail-right", material: CONTRAIL_MAT })
      .position(0, -65, 0)
      .scale([0.08, 3.2, 0.08])
      .runtime(game.runtimeNode("contrail-right", { tags: ["player-fx"] })),
    primitives
      .cylinder({ name: "cannon-tracer", material: TRACER_MAT })
      .position(0, -65, 0)
      .scale([0.1, 5.5, 0.1])
      .runtime(game.runtimeNode("cannon-tracer", { tags: ["player-fx"] })),
    model(assets.patrolWingPlane, {
      name: "patrol-ghost",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 3.2,
      material: GHOST
    })
      .position(0, -60, 0)
      .runtime(game.runtimeNode("patrol-ghost", { tags: ["typed-asset", "ghost"] })),
    // Drone pool alternating the two typed variants, parked below the sea.
    ...Array.from({ length: DRONE_NODE_COUNT }, (_, index) =>
      model(index % 2 === 0 ? assets.patrolWingDroneA : assets.patrolWingDroneB, {
        name: `drone-${index}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.95,
        castShadow: true
      })
        .position(0, -60 - index, 0)
        .runtime(game.runtimeNode(`drone-${index}`, { tags: ["typed-asset", "drone"] }))
    ),
    // Return-fire orb pool.
    ...Array.from({ length: ORB_NODE_COUNT }, (_, index) =>
      primitives
        .sphere({ name: `orb-${index}`, material: ORB })
        .position(0, -70 - index, 0)
        .scale(0.5)
        .runtime(game.runtimeNode(`orb-${index}`, { tags: ["orb"] }))
    ),
    // Warm sunset rim key over the island; shadow is disabled here because
    // looks.preset("golden-hour") already mounts the single shadowed key
    // light permitted by the flight art-direction contract (S5).
    lights
      .directional({
        name: "evening sun key",
        color: "#ffd9a8",
        intensity: 1.45,
        position: [-40, 28, -30],
        target: [0, 2, 0],
        shadow: false
      })
      .toJSON()
  ];
  return scene()
    .background("#1b2f47")
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(
      camera.perspective({
        position: [initialPose.position[0], initialPose.position[1], initialPose.position[2]],
        target: [initialPose.target[0], initialPose.target[1], initialPose.target[2]],
        fov: initialPose.fov
      })
    );
}

// ---- chase rig -----------------------------------------------------------------

export interface PatrolRigState {
  position: [number, number, number];
  forward: [number, number, number];
  up: [number, number, number];
}

const RIG_BACK = 8.4;
const RIG_UP_WORLD = 2.35;
const RIG_UP_BODY = 0.75;
const RIG_LOOK_AHEAD = 8.5;
const RIG_LOOK_DROP = 0.35;
const RIG_FOV = 66;

/** Desired chase pose for an aircraft state: trailing behind and above the
 *  nose along its forward axis, aimed ahead so the ring corridor reads. */
export function patrolPoseFor(state: {
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}): AuraCameraPose {
  const f = state.forward;
  const u = state.up;
  return {
    position: [
      state.position[0] - f[0] * RIG_BACK + u[0] * RIG_UP_BODY,
      state.position[1] - f[1] * RIG_BACK + RIG_UP_WORLD + u[1] * RIG_UP_BODY,
      state.position[2] - f[2] * RIG_BACK + u[2] * RIG_UP_BODY
    ],
    target: [
      state.position[0] + f[0] * RIG_LOOK_AHEAD,
      state.position[1] + f[1] * RIG_LOOK_AHEAD - RIG_LOOK_DROP,
      state.position[2] + f[2] * RIG_LOOK_AHEAD
    ],
    up: [0, 1, 0],
    roll: 0,
    fov: RIG_FOV,
    near: 0.05,
    far: 260
  };
}

/** True when `point` sits inside the rig pose's forward cone. */
export function pointInRigFrame(
  pose: AuraCameraPose,
  point: readonly [number, number, number],
  margin = 0.92
): boolean {
  const fx = pose.target[0] - pose.position[0];
  const fy = pose.target[1] - pose.position[1];
  const fz = pose.target[2] - pose.position[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const dx = point[0] - pose.position[0];
  const dy = point[1] - pose.position[1];
  const dz = point[2] - pose.position[2];
  const dl = Math.hypot(dx, dy, dz) || 1;
  const cos = (fx * dx + fy * dy + fz * dz) / (fl * dl);
  const halfAngleRad = ((pose.fov / 2) * Math.PI) / 180;
  return cos >= Math.cos(halfAngleRad * margin);
}

/** Smoothed chase rig reading a live aircraft state object each frame. */
export function createPatrolRig(state: {
  readonly position: readonly [number, number, number];
  readonly forward: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}): AuraCameraRig {
  const eye: [number, number, number] = [0, 0, 0];
  const target: [number, number, number] = [0, 0, 0];
  const snap = (): void => {
    const want = patrolPoseFor(state);
    for (let i = 0; i < 3; i += 1) {
      eye[i] = want.position[i]!;
      target[i] = want.target[i]!;
    }
  };
  snap();
  return {
    id: "patrol-wing.flight",
    continuous: true,
    reset: snap,
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.18);
      const want = patrolPoseFor(state);
      for (let i = 0; i < 3; i += 1) {
        eye[i] += (want.position[i]! - eye[i]) * k;
        target[i] += (want.target[i]! - target[i]) * k;
      }
      return {
        position: [eye[0], eye[1], eye[2]],
        target: [target[0], target[1], target[2]],
        up: [0, 1, 0],
        roll: 0,
        fov: RIG_FOV,
        near: 0.05,
        far: 260
      };
    }
  };
}
