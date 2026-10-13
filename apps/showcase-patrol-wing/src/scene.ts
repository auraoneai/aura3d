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

const ISLAND_TURF = material.pbr({ color: "#3f6b3a", roughness: 0.92, metalness: 0.0 });
const OCEAN = material.pbr({ color: "#1d4a63", roughness: 0.35, metalness: 0.05 });
const BEACON = material.emissive({ name: "next ring beacon", color: "#59d7ff", emissive: "#59d7ff", emissiveIntensity: 1.1 });
const ORB = material.emissive({ name: "return fire orb", color: "#ff5d4d", emissive: "#ff3b26", emissiveIntensity: 1.8 });
const GHOST = material.pbr({ color: "#9fd8ff", roughness: 0.4, metalness: 0.1, emissive: "#9fd8ff", emissiveIntensity: 0.35 });

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

export function buildPatrolScene() {
  const terrain = buildTerrainGeometry();
  const nodes: AuraNodeInput[] = [
    geometry.custom(
      geometry.define({
        positions: terrain.positions,
        normals: terrain.normals,
        indices: terrain.indices
      }),
      { name: "island-terrain", material: ISLAND_TURF }
    ),
    primitives.plane({ name: "ocean", material: OCEAN }).rotate(-Math.PI / 2, 0, 0).scale([180, 180, 1]),
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
      targetMaxDimension: 3.2,
      castShadow: true
    })
      .position(PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2])
      .rotate(0, PAD_HEADING_YAW, 0)
      .runtime(game.runtimeNode("patrol-plane", { tags: ["typed-asset", "player"] })),
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
        targetMaxDimension: 1.8,
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
    // One warm low key over the island; the golden-hour look supplies sky,
    // fog, and grade. No ambient fill.
    lights
      .directional({
        name: "evening sun key",
        color: "#ffd9a8",
        intensity: 3.2,
        position: [-40, 28, -30],
        target: [0, 2, 0],
        shadow: true
      })
      .toJSON()
  ];
  return scene()
    .background("#1b2f47")
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(
      camera.perspective({
        position: [PAD_CENTER[0] + 11, PAD_Y + 4.2, PAD_CENTER[2] + 2],
        target: [PAD_CENTER[0], PAD_Y + 0.6, PAD_CENTER[2]],
        fov: 68
      })
    );
}

// ---- chase rig -----------------------------------------------------------------

export interface PatrolRigState {
  position: [number, number, number];
  forward: [number, number, number];
  up: [number, number, number];
}

const RIG_BACK = 10;
const RIG_UP_WORLD = 3.4;
const RIG_UP_BODY = 0.8;
const RIG_LOOK_AHEAD = 7;
const RIG_LOOK_DROP = 1.2;
const RIG_FOV = 68;

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
    reset: snap,
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.22);
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
