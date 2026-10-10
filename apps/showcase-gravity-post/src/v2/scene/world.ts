// apps/showcase-gravity-post/src/v2/scene/world.ts — sun-lit system board (T2.2).
// §6.9.13: one board built ONCE for the whole four-contract shift — sun disc
// + corona at the system barycentre, the five NASA-textured planet GLBs on
// their authored wells with fresnel-look atmosphere rims, hairline orbit
// guides through each body, six typed station rings + dock-gate hardware +
// cyan pulse windows, the courier skiff pod with thrust cone and trail
// streaks, prediction/flown-path beads, dock sparks, flyby drones, orbital
// dust, and the Rust→Gale freightway runway. Contracts only move the pod and
// re-target the pulse rings → loading.sceneSwaps === 0 for the whole shift.
import { game, instances, material, model, primitives, type AuraNodeInput } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { WELL_BODIES } from "../../gameplay/contracts";
import { buildStations, PLAY_PLANE_Y } from "../../gameplay/stations";
import {
  ACTUAL_PATH_BEAD,
  BODY_RIM,
  DOCK_SPARK,
  DUST_AMBER,
  DUST_CYAN,
  DUST_VIOLET,
  FLYBY_DRONE,
  HAZARD_STRIPE,
  ORBIT_GUIDE,
  PREDICTION_BEAD,
  RUNWAY_LAMP,
  RUNWAY_PANEL,
  STATION_PULSE,
  STAR_POINT,
  SUN_CORONA,
  SUN_DISC,
  THRUST_CONE,
  TRAIL_STREAK
} from "./materials";

export const PREDICTION_BEADS = 30;
export const ACTUAL_PATH_BEADS = 48;
export const SPARK_COUNT = 8;
export const FLYBY_DRONES = 6;
export const TRAIL_STREAKS = 7;
export const ORBITAL_DUST_COUNT = 24;
export const RUNWAY_PANEL_COUNT = 7;
export const STAR_COUNT = 72;

/**
 * §14.4 instancing: the repeat populations (trail streaks, prediction/flown
 * path beads, dock sparks, flyby drones) ride `instances.*` pools bound to
 * live transform arrays — one draw per pool instead of one per node. boot.ts
 * writes `position`/`rotation`/`scale` on the entry objects directly;
 * `scale: [0,0,0]` is the parked/hidden state (they sit under the plane).
 */
export interface GravityPoolTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface GravityPools {
  readonly trailStreaks: GravityPoolTransform[];
  readonly predBeads: GravityPoolTransform[];
  readonly actualBeads: GravityPoolTransform[];
  readonly dockSparks: GravityPoolTransform[];
  readonly flybyDrones: GravityPoolTransform[];
}

const parkedPool = (count: number): GravityPoolTransform[] =>
  Array.from({ length: count }, () => ({
    position: [0, -4, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0]
  }));

const WELL_PLANET_ASSETS = {
  cinder: assets.gravityPlanetMercury,
  verdance: assets.gravityPlanetEarth,
  aquaria: assets.gravityPlanetNeptune,
  rust: assets.gravityPlanetMars,
  gale: assets.gravityPlanetJupiter
} as const;

const BODY_EMISSIVE: Readonly<Record<string, string>> = {
  sol: "#fb923c",
  cinder: "#f97316",
  verdance: "#22c55e",
  aquaria: "#06b6d4",
  rust: "#e11d48",
  gale: "#8b5cf6"
};

/** Runtime node names a caller may re-pose each frame. */
export interface GravityWorldNodes {
  readonly nodes: AuraNodeInput[];
  readonly stationPulseIds: readonly string[];
  readonly pools: GravityPools;
}

function orbitGuideRadius(bodyIndex: number): number {
  const body = WELL_BODIES[bodyIndex]!;
  return Math.hypot(body.position[0], body.position[1]);
}

export function gravityWorldNodes(): GravityWorldNodes {
  const nodes: AuraNodeInput[] = [];
  const stations = buildStations();
  const pools: GravityPools = {
    trailStreaks: parkedPool(TRAIL_STREAKS),
    predBeads: parkedPool(PREDICTION_BEADS),
    actualBeads: parkedPool(ACTUAL_PATH_BEADS),
    dockSparks: parkedPool(SPARK_COUNT),
    flybyDrones: parkedPool(FLYBY_DRONES)
  };

  // ------------------------------------------------------------ wells ------
  const sol = WELL_BODIES[0]!;
  nodes.push(
    primitives.sphere({ name: "sol-disc", material: SUN_DISC })
      .position(sol.position[0], PLAY_PLANE_Y + 0.02, sol.position[1])
      .scale([sol.visualRadius * 2.4, sol.visualRadius * 2.4, sol.visualRadius * 2.4])
      .runtime(game.runtimeNode("sol-disc")),
    primitives.sphere({ name: "sol-corona", material: SUN_CORONA })
      .position(sol.position[0], PLAY_PLANE_Y + 0.02, sol.position[1])
      .scale([sol.visualRadius * 3.4, sol.visualRadius * 3.4, sol.visualRadius * 3.4])
      .runtime(game.runtimeNode("sol-corona"))
  );
  for (const body of WELL_BODIES.slice(1)) {
    const ref = WELL_PLANET_ASSETS[body.id as keyof typeof WELL_PLANET_ASSETS];
    nodes.push(
      model(ref, {
        name: `gravity-post-planet-${body.id}`,
        role: "primaryWorld",
        scaleMode: "fit",
        targetMaxDimension: body.visualRadius * 4.4
      })
        .position(body.position[0], PLAY_PLANE_Y + 0.02, body.position[1])
        .runtime(game.runtimeNode(`gravity-post-planet-${body.id}`)),
      primitives.sphere({ name: `planet-rim-${body.id}`, material: BODY_RIM(BODY_EMISSIVE[body.id] ?? "#67e8f9") })
        .position(body.position[0], PLAY_PLANE_Y + 0.02, body.position[1])
        .scale([body.visualRadius * 5.1, body.visualRadius * 5.1, body.visualRadius * 5.1])
        .runtime(game.runtimeNode(`planet-rim-${body.id}`)),
      // Hairline orbit guide: a flat torus centred on sol through the body.
      primitives.torus({ name: `orbit-guide-${body.id}`, material: ORBIT_GUIDE })
        .position(sol.position[0], PLAY_PLANE_Y - 0.02, sol.position[1])
        .rotate(Math.PI / 2, 0, 0)
        .scale([orbitGuideRadius(WELL_BODIES.indexOf(body)), orbitGuideRadius(WELL_BODIES.indexOf(body)), 0.004])
        .runtime(game.runtimeNode(`orbit-guide-${body.id}`))
    );
  }

  // ------------------------------------------------------------ stations ---
  for (const station of stations) {
    nodes.push(
      model(assets.gravityPostStationRing, {
        name: station.nodeId,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.5
      })
        .position(station.x, PLAY_PLANE_Y + 0.05, station.z)
        .runtime(game.runtimeNode(station.nodeId, { tags: ["typed-asset", "station-ring"] })),
      model(assets.gravityPostDockGate, {
        name: station.id + " dock gate",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.9,
        material: material.pbr({
          name: station.id + " dock gate finish",
          color: "#b7f4ff",
          roughness: 0.26,
          metallic: 0.42,
          emissive: "#22d3ee",
          emissiveIntensity: 0.18
        })
      })
        .position(station.x, PLAY_PLANE_Y + 0.14, station.z)
        .runtime(game.runtimeNode(station.id + "-dock-gate", { tags: ["typed-asset", "destination-gate"] })),
      primitives.torus({ name: station.pulseNodeId + " capture window pulse ring", material: STATION_PULSE })
        .position(station.x, PLAY_PLANE_Y + 0.01, station.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale([station.dockRadius * 2.8, station.dockRadius * 2.8, 0.014])
        .runtime(game.runtimeNode(station.pulseNodeId))
    );
  }

  // ---------------------------------------------------------------- pod ----
  nodes.push(
    model(assets.gravityPostCourierSkiff, {
      name: "mail-pod",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 0.42
    })
      .position(0, PLAY_PLANE_Y + 0.06, 0)
      .runtime(game.runtimeNode("mail-pod", { tags: ["hero", "typed-asset"] })),
    // Thrust cone: small stretched cylinder behind the pod, hidden until burn.
    primitives.cylinder({ name: "pod-thrust-cone", material: THRUST_CONE })
      .position(0, -4, 0)
      .scale([0.05, 0.22, 0.05])
      .runtime(game.runtimeNode("pod-thrust-cone"))
  );
  // §14.4 instanced pools — the transform arrays are live-bound; boot.ts
  // writes entries each frame instead of posing named nodes.
  nodes.push(
    instances.box({ name: "mail pod trail streak pool", material: TRAIL_STREAK, transforms: pools.trailStreaks })
  );

  // ------------------------------------------------------- path markers ----
  nodes.push(
    instances.sphere({ name: "prediction bead pool", material: PREDICTION_BEAD, transforms: pools.predBeads }),
    instances.sphere({ name: "flown path bead pool", material: ACTUAL_PATH_BEAD, transforms: pools.actualBeads })
  );

  // ------------------------------------------------------------ fx props ---
  nodes.push(
    instances.sphere({ name: "dock spark pool", material: DOCK_SPARK, transforms: pools.dockSparks }),
    instances.sphere({ name: "flyby drone pool", material: FLYBY_DRONE, transforms: pools.flybyDrones })
  );

  // ------------------------------------------------- freightway corridor ---
  // Rust Exchange -> Gale Terminal runway: grounded paving + lamp posts + the
  // contract-4 hazard zones, all static set dressing on the real route line.
  const rust = stations.find((s) => s.id === "rust-exchange")!;
  const gale = stations.find((s) => s.id === "gale-terminal")!;
  const rdx = gale.x - rust.x;
  const rdz = gale.z - rust.z;
  const rlen = Math.hypot(rdx, rdz) || 1;
  const dirX = rdx / rlen;
  const dirZ = rdz / rlen;
  const perpX = -dirZ;
  const perpZ = dirX;
  const runwayPanels: GravityPoolTransform[] = [];
  const runwayLamps: GravityPoolTransform[] = [];
  const hazardMarkers: GravityPoolTransform[] = [];
  for (let index = 0; index < RUNWAY_PANEL_COUNT; index += 1) {
    const t = (index + 0.5) / RUNWAY_PANEL_COUNT;
    runwayPanels.push({
      position: [rust.x + dirX * rlen * t, PLAY_PLANE_Y - 0.035, rust.z + dirZ * rlen * t],
      rotation: [0, Math.atan2(dirX, dirZ), 0],
      scale: [0.34, 0.012, rlen / RUNWAY_PANEL_COUNT * 0.92]
    });
    for (const side of [-1, 1] as const) {
      runwayLamps.push({
        position: [
          rust.x + dirX * rlen * t + perpX * 0.22 * side,
          PLAY_PLANE_Y + 0.04,
          rust.z + dirZ * rlen * t + perpZ * 0.22 * side
        ],
        rotation: [0, 0, 0],
        scale: [0.02, 0.1, 0.02]
      });
    }
  }
  for (let index = 0; index < 3; index += 1) {
    const t = 0.28 + index * 0.22;
    hazardMarkers.push({
      position: [rust.x + dirX * rlen * t, PLAY_PLANE_Y - 0.02, rust.z + dirZ * rlen * t],
      rotation: [0, Math.atan2(dirX, dirZ), 0],
      scale: [0.5, 0.006, 0.06]
    });
  }
  nodes.push(
    instances.box({ name: "runway panel pool", material: RUNWAY_PANEL, transforms: runwayPanels }),
    instances.box({ name: "runway lamp pool", material: RUNWAY_LAMP, transforms: runwayLamps }),
    instances.box({ name: "hazard marker pool", material: HAZARD_STRIPE, transforms: hazardMarkers })
  );

  // ------------------------------------------------------ orbital dust -----
  // Three authored emissive tones stay as three small pools (per-instance
  // colors would not tint the emissive channel the same way).
  const dustMats = [DUST_CYAN, DUST_VIOLET, DUST_AMBER];
  const dustByTone: GravityPoolTransform[][] = [[], [], []];
  for (let index = 0; index < ORBITAL_DUST_COUNT; index += 1) {
    const angle = (index / ORBITAL_DUST_COUNT) * Math.PI * 2;
    const radius = 2.2 + (index % 5) * 0.7;
    const s = 0.02 + (index % 3) * 0.008;
    dustByTone[index % 3]!.push({
      position: [
        Math.cos(angle) * radius,
        PLAY_PLANE_Y - 0.15 + (index % 4) * 0.08,
        Math.sin(angle) * radius
      ],
      rotation: [0, 0, 0],
      scale: [s, s, s]
    });
  }
  nodes.push(
    ...dustByTone.map((transforms, tone) =>
      instances.sphere({ name: `orbital dust pool ${tone}`, material: dustMats[tone]!, transforms }))
  );

  // ------------------------------------------------------------- stars -----
  // §14.4 instanced stars: a fixed far shell around the system, golden-angle
  // spread with deterministic size variation — one draw for the whole field.
  const stars: GravityPoolTransform[] = Array.from({ length: STAR_COUNT }, (_, index) => {
    const angle = index * 2.399963;
    const band = index % 9;
    const y = PLAY_PLANE_Y + 6 + band * 4.5;
    const radius = 46 + (index % 7) * 4.5;
    const s = 0.014 + (index % 4) * 0.006;
    return {
      position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
      rotation: [0, 0, 0],
      scale: [s, s, s]
    };
  });
  nodes.push(
    instances.sphere({ name: "orbital star shell", material: STAR_POINT, transforms: stars })
  );

  return {
    nodes,
    stationPulseIds: stations.map((station) => station.pulseNodeId),
    pools
  };
}
