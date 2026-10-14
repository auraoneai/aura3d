// apps/showcase-patrol-wing/src/v2/scene/world.ts — §6.9.11 scene (T2.1/T2.2).
// One union scene for the whole sortie: typed island heightfield + cliff,
// ocean disc with lane glints, pad + runway deck, radar tower on the peak,
// six ordered emissive ring gates + next-gate beacon shaft, cloud banks,
// the patrolAircraftMeshy hero and a pool of typed drone/orb/contrail/tracer
// runtime nodes. Sortie progress re-poses and re-hides runtime nodes only —
// the scene is built once so loading.sceneSwaps stays 0 (§7.2.1).
import { geometry, model, primitives, type AuraSceneNode, type AuraModelRole } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import {
  islandTerrainMesh,
  islandCliffMesh,
  islandProps,
  PAD_CENTER,
  PAD_HEADING_YAW,
  PAD_Y,
  RING_GATES
} from "../../legacy/sky";
import * as M from "./materials";

export const DRONE_NODE_COUNT = 10;
export const ORB_POOL_SIZE = 8;
export const CLOUD_BANKS = 7;

/** Runtime ids the boot loop reads/writes each frame. */
export interface PatrolWorld {
  readonly nodes: readonly AuraSceneNode[];
  readonly ringIds: readonly string[];
  readonly ringPassedIds: readonly string[];
  readonly droneIds: readonly string[];
  readonly droneWakeIds: readonly string[];
  readonly orbIds: readonly string[];
  readonly orbTrailIds: readonly string[];
}

function typedModel(
  id: string,
  assetKey: "patrolAircraftMeshy" | "patrolWingDroneA" | "patrolWingDroneB" | "patrolWingPadBeacon" | "propRockA" | "propRockB" | "propConifer",
  position: readonly [number, number, number],
  scale: number,
  yaw: number,
  role: AuraModelRole,
  runtimeId: string | undefined
): AuraSceneNode {
  const builder = model(assets[assetKey], {
    name: id,
    role,
    scaleMode: "fit",
    targetMaxDimension: scale
  })
    .position(position[0], position[1], position[2])
    .rotate(0, yaw, 0);
  const withRuntime = runtimeId
    ? builder.runtime({ id: runtimeId, tags: ["typed-asset"] })
    : builder;
  return withRuntime.toJSON();
}

export function patrolWorldNodes(): PatrolWorld {
  const nodes: AuraSceneNode[] = [];

  // ---- authored island: same heightfield the flight model crashes on ----
  const terrain = islandTerrainMesh();
  nodes.push(
    geometry.custom(
      geometry.define({
        positions: terrain.positions,
        normals: terrain.normals,
        indices: terrain.indices
      }),
      { name: "island-terrain", material: M.ISLAND_TURF }
    ).toJSON()
  );
  const cliff = islandCliffMesh();
  nodes.push(
    geometry.custom(
      geometry.define({
        positions: cliff.positions,
        normals: cliff.normals,
        indices: cliff.indices
      }),
      { name: "island-coastal-rock-face", material: M.CLIFF_STRATA }
    ).toJSON()
  );

  // Ocean disc + broad lane glints (set dressing over the flight truth).
  nodes.push(
    primitives
      .plane({ name: "ocean", material: M.OCEAN })
      .rotate(-Math.PI / 2, 0, 0)
      .scale([90, 90, 1])
      .toJSON()
  );
  for (let lane = -2; lane <= 2; lane += 1) {
    nodes.push(
      primitives
        .box({ name: `ocean lane glint ${lane}`, material: M.OCEAN_LANE })
        .position(lane * 11, 0.06, -2)
        .rotate(0, lane % 2 === 0 ? -0.12 : 0.1, 0)
        .scale([0.08, 0.015, 24])
        .toJSON()
    );
  }

  // Cloud banks: real low-poly geometry giving the chase frame a horizon and
  // flight-scale cue. Opaque pbr (translucent shells composite near-black).
  const cloudSpecs = [
    [-18, 10.5, -30, 5.2, 0.72, 2.4],
    [3, 12.5, -38, 6.0, 0.82, 2.9],
    [22, 9.5, -27, 4.2, 0.64, 2.0],
    [-28, 8.5, -13, 4.0, 0.6, 1.9],
    [30, 13.5, -48, 6.8, 0.88, 3.1],
    [-34, 12, -52, 5.8, 0.74, 2.7],
    [14, 8, 34, 5.2, 0.62, 2.2]
  ] as const;
  for (const [index, cloud] of cloudSpecs.entries()) {
    nodes.push(
      primitives
        .sphere({ name: `coastal cloud bank ${index + 1}`, material: M.CLOUD_BANK })
        .position(cloud[0], cloud[1], cloud[2])
        .scale([cloud[3], cloud[4], cloud[5]])
        .toJSON()
    );
  }

  // Setting sun disc on the horizon the K1 sunset-ocean key points at.
  nodes.push(
    primitives
      .sphere({ name: "distant-sun", material: M.SUN_DISC })
      .position(-29, 21, -58)
      .scale(3.25)
      .toJSON()
  );

  // ---- pad + runway: raised airfield on the south cliff plateau ----
  nodes.push(
    primitives.box({ name: "pad-slab", material: M.PAD_SLAB })
      .position(PAD_CENTER[0], PAD_Y - 0.12, PAD_CENTER[2])
      .scale([5.4, 0.3, 5.4])
      .toJSON(),
    primitives.box({ name: "pad-piling", material: M.PAD_PILING })
      .position(PAD_CENTER[0], PAD_Y - 3, PAD_CENTER[2])
      .scale([4.2, 6, 4.2])
      .toJSON(),
    primitives.box({ name: "airfield runway deck", material: M.RUNWAY_DECK })
      .position(PAD_CENTER[0] - 7.4, PAD_Y - 0.02, PAD_CENTER[2])
      .scale([7.4, 0.14, 2.25])
      .toJSON(),
    primitives.box({ name: "airfield runway understructure", material: M.RUNWAY_UNDER })
      .position(PAD_CENTER[0] - 7.4, PAD_Y - 1.15, PAD_CENTER[2])
      .scale([7.55, 1.0, 2.52])
      .toJSON(),
    primitives.box({ name: "runway edge left", material: M.RUNWAY_EDGE })
      .position(PAD_CENTER[0] - 7.4, PAD_Y + 0.16, PAD_CENTER[2] - 1.95)
      .scale([7.2, 0.035, 0.07])
      .toJSON(),
    primitives.box({ name: "runway edge right", material: M.RUNWAY_EDGE })
      .position(PAD_CENTER[0] - 7.4, PAD_Y + 0.16, PAD_CENTER[2] + 1.95)
      .scale([7.2, 0.035, 0.07])
      .toJSON()
  );
  for (const [index, x] of [-2.5, -5.2, -7.9, -10.6].entries()) {
    nodes.push(
      primitives.box({ name: `runway centreline ${index}`, material: M.RUNWAY_STRIPE })
        .position(x, PAD_Y + 0.17, PAD_CENTER[2])
        .scale([0.72, 0.035, 0.11])
        .toJSON()
    );
  }
  nodes.push(
    primitives
      .torus({ name: "pad-light-ring", material: M.PAD_RING })
      .position(PAD_CENTER[0], PAD_Y + 0.08, PAD_CENTER[2])
      .rotate(-Math.PI / 2, 0, 0)
      .scale([3.6, 3.6, 3.6])
      .toJSON(),
    typedModel("pad-beacon", "patrolWingPadBeacon", [PAD_CENTER[0], PAD_Y + 0.05, PAD_CENTER[2]], 4.6, PAD_HEADING_YAW, "setDressing", undefined)
  );

  // Basalt terrace lips — set dressing over the authored elevation bands.
  const terraces = [
    [-8.5, 2.15, 9.5, 4.2, 0.24, 1.5, -0.14],
    [5.8, 4.25, 5.1, 3.7, 0.2, 1.35, 0.22],
    [-1.5, 6.55, -1.6, 3.4, 0.18, 1.1, -0.08]
  ] as const;
  for (const [index, [x, y, z, width, height, depth, yaw]] of terraces.entries()) {
    nodes.push(
      primitives.box({ name: `island basalt terrace ${index}`, material: M.TERRACE_LIP })
        .position(x, y, z)
        .rotate(0, yaw, 0)
        .scale([width, height, depth])
        .toJSON(),
      primitives.box({ name: `island terrace edge ${index}`, material: M.TERRACE_EDGE })
        .position(x, y + height + 0.035, z - depth * 0.72)
        .rotate(0, yaw, 0)
        .scale([width * 0.86, 0.025, 0.045])
        .toJSON()
    );
  }

  // Radar tower on the island peak (0, ~9.6, 0) + red beacon cap.
  nodes.push(
    primitives.cylinder({ name: "radar-tower-base", material: M.TOWER_STEEL })
      .position(0, 11.2, 0)
      .scale([0.6, 3.2, 0.6])
      .toJSON(),
    primitives.cylinder({ name: "radar-platform", material: M.TOWER_PLATFORM })
      .position(0, 12.8, 0)
      .scale([1.8, 0.15, 1.8])
      .toJSON(),
    primitives.sphere({ name: "peak-beacon-light", material: M.PEAK_BEACON })
      .position(0, 13.5, 0)
      .scale(0.35)
      .toJSON()
  );

  // Runway approach guidance light poles.
  const approachOffsets = [-4, -2, 0, 2, 4];
  approachOffsets.forEach((dz, idx) => {
    [-3.2, 3.2].forEach((dx, side) => {
      nodes.push(
        primitives.cylinder({ name: `runway-post-${idx}-${side}`, material: M.RUNWAY_POST })
          .position(PAD_CENTER[0] + dx, PAD_Y + 0.15, PAD_CENTER[2] + dz)
          .scale([0.08, 0.4, 0.08])
          .toJSON(),
        primitives.sphere({ name: `runway-light-${idx}-${side}`, material: side === 0 ? M.RUNWAY_LIGHT_GREEN : M.RUNWAY_LIGHT_AMBER })
          .position(PAD_CENTER[0] + dx, PAD_Y + 0.4, PAD_CENTER[2] + dz)
          .scale(0.12)
          .toJSON()
      );
    });
  });

  // ---- ordered ring course: six gates + next-gate beacon shaft ----
  const ringIds: string[] = [];
  const ringPassedIds: string[] = [];
  for (const gate of RING_GATES) {
    ringIds.push(`ring-${gate.index}`);
    ringPassedIds.push(`ring-${gate.index}-passed`);
    nodes.push(
      primitives
        .torus({ name: `ring-${gate.index}`, material: M.RING_QUEUED })
        .position(gate.position[0], gate.position[1], gate.position[2])
        .rotate(0, gate.yaw, 0)
        .scale([gate.radius * 2, gate.radius * 2, gate.radius * 0.9])
        .runtime({ id: `ring-${gate.index}`, tags: ["ring-gate"] })
        .toJSON(),
      primitives
        .torus({ name: `ring-${gate.index}-passed`, material: M.RING_PASSED })
        .position(gate.position[0], gate.position[1], gate.position[2])
        .rotate(0, gate.yaw, 0)
        .scale([gate.radius * 1.5, gate.radius * 1.5, gate.radius * 0.6])
        .runtime({ id: `ring-${gate.index}-passed`, tags: ["ring-gate"] })
        .toJSON()
    );
  }
  const firstGate = RING_GATES[0]!;
  nodes.push(
    primitives
      .cylinder({ name: "next-ring beacon", material: M.NEXT_RING_BEACON })
      .position(firstGate.position[0], firstGate.position[1] + 5, firstGate.position[2])
      .scale([2.2, 14, 2.2])
      .runtime({ id: "next-ring-beacon", tags: ["objective-beacon"] })
      .toJSON()
  );

  // Deterministic typed island dressing (rocks + conifers snapped to the
  // same heightfield the flight model reads).
  for (const prop of islandProps()) {
    nodes.push(
      typedModel(
        `prop-${prop.asset}-${prop.position[0].toFixed(1)}`,
        prop.asset,
        prop.position,
        prop.scale,
        prop.yaw,
        "setDressing",
        undefined
      )
    );
  }

  // ---- actors: hero plane, ghost shell, drone/orb pools, combat fx ----
  nodes.push(
    typedModel(
      "patrol-plane",
      "patrolAircraftMeshy",
      [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
      4.4,
      PAD_HEADING_YAW,
      "primaryVehicle",
      "plane"
    ),
    typedModel(
      "ghost-plane",
      "patrolAircraftMeshy",
      [0, -60, 0],
      4.4,
      PAD_HEADING_YAW,
      "setDressing",
      "ghost-plane"
    )
  );

  const droneIds: string[] = [];
  const droneWakeIds: string[] = [];
  for (let slot = 0; slot < DRONE_NODE_COUNT; slot += 1) {
    const droneId = `drone-${slot}`;
    const wakeId = `drone-wake-${slot}`;
    droneIds.push(droneId);
    droneWakeIds.push(wakeId);
    nodes.push(
      typedModel(
        droneId,
        slot % 2 === 0 ? "patrolWingDroneA" : "patrolWingDroneB",
        [0, -60 - slot, 0],
        1.7,
        0,
        "primaryCharacter",
        droneId
      ),
      primitives
        .box({ name: wakeId, material: M.ORB_TRAIL })
        .position(0, -60 - slot, 0)
        .scale([0.05, 0.05, 1.4])
        .runtime({ id: wakeId, tags: ["drone-wake"] })
        .toJSON()
    );
  }
  nodes.push(
    primitives
      .torus({ name: "lead drone target lock", material: M.DRONE_TARGET_LOCK })
      .position(0, -70, 0)
      .scale([0.8, 0.8, 0.08])
      .runtime({ id: "lead-drone-lock", tags: ["combat-fx"] })
      .toJSON()
  );

  const orbIds: string[] = [];
  const orbTrailIds: string[] = [];
  for (let index = 0; index < ORB_POOL_SIZE; index += 1) {
    const orbId = `orb-${index}`;
    const trailId = `orb-trail-${index}`;
    orbIds.push(orbId);
    orbTrailIds.push(trailId);
    nodes.push(
      primitives
        .sphere({ name: orbId, material: M.ORB_GLOW })
        .position(0, -70, 0)
        .scale(0.34)
        .runtime({ id: orbId, tags: ["orb"] })
        .toJSON(),
      primitives
        .box({ name: trailId, material: M.ORB_TRAIL })
        .position(0, -70, 0)
        .scale([0.05, 0.05, 1.0])
        .runtime({ id: trailId, tags: ["orb-trail"] })
        .toJSON()
    );
  }

  // Cannon muzzle flash + tracer, impact flash, wingtip contrails, engine
  // heat glow — all hidden/staged runtime nodes driven by the boot loop.
  nodes.push(
    primitives.sphere({ name: "combat muzzle flash", material: M.MUZZLE_FLASH })
      .position(0, -70, 0).scale(0.14)
      .runtime({ id: "combat-muzzle-flash", tags: ["combat-fx"] })
      .toJSON(),
    primitives.box({ name: "combat cannon tracer", material: M.CANNON_TRACER })
      .position(0, -70, 0).scale([0.018, 0.018, 1.3])
      .runtime({ id: "combat-cannon-tracer", tags: ["combat-fx", "projectile-feedback"] })
      .toJSON(),
    primitives.sphere({ name: "combat impact flash", material: M.IMPACT_FLASH })
      .position(0, -70, 0).scale([0.4, 0.4, 0.4])
      .runtime({ id: "combat-impact-flash", tags: ["combat-fx", "hit-feedback"] })
      .toJSON(),
    primitives.torus({ name: "combat impact ring", material: M.IMPACT_FLASH })
      .position(0, -70, 0).scale([0.54, 0.54, 0.075])
      .runtime({ id: "combat-impact-ring", tags: ["combat-fx", "hit-feedback"] })
      .toJSON(),
    primitives.box({ name: "wingtip contrail left", material: M.CONTRAIL })
      .position(0, -70, 0).scale([0.035, 0.02, 2.6])
      .runtime({ id: "contrail-left", tags: ["flight-fx"] })
      .toJSON(),
    primitives.box({ name: "wingtip contrail right", material: M.CONTRAIL })
      .position(0, -70, 0).scale([0.035, 0.02, 2.6])
      .runtime({ id: "contrail-right", tags: ["flight-fx"] })
      .toJSON(),
    primitives.sphere({ name: "engine heat glow", material: M.ENGINE_GLOW })
      .position(0, -70, 0).scale([0.2, 0.14, 0.3])
      .runtime({ id: "engine-glow", tags: ["flight-fx"] })
      .toJSON(),
    primitives.torus({ name: "ring clear pulse", material: M.RING_PASSED })
      .position(0, -70, 0).scale([1.4, 1.4, 0.12])
      .runtime({ id: "ring-clear-pulse", tags: ["flight-fx"] })
      .toJSON()
  );

  return {
    nodes,
    ringIds,
    ringPassedIds,
    droneIds,
    droneWakeIds,
    orbIds,
    orbTrailIds
  };
}
