// apps/showcase-deep-recovery/src/v2/scene/world.ts — §6.9.14 union scene.
// One scene covers every mission state: depth-band shells + terraced floor
// sell the turquoise→abyss column, the typed GLBs (sub/buoy/wreck/crates)
// carry the gameplay truth, and every moving piece is a runtime node
// re-posed each frame — mission progress never swaps scenes
// (loading.sceneSwaps === 0, §7.2.1).
import { primitives, model, game, type AuraNodeInput } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { BUOY_STATION, WRECK_OBSTACLES, WORLD_BOUNDS } from "../../gameplay/reef";
import { initialCrateSpawns } from "../../gameplay/salvage";
import {
  BAND_ABYSS,
  BAND_SHALLOW,
  BAND_TRENCH,
  BASIN_FLOOR,
  BREACH_BEACON,
  BUOY_BEACON,
  BUOY_SERVICE_RING,
  CORAL_FAN,
  CRYSTAL,
  GRAPPLE_LINE,
  LAMP_BEAM,
  LAMP_VOLUME,
  MARINE_SNOW,
  MID_TERRACE,
  REEF_SPIRE,
  SHALLOW_SHELF,
  SILT_MOTE,
  SONAR_MARKER,
  SONAR_PULSE,
  SUB_HULL,
  VENT_GLOW,
  VENT_ROCK
} from "./materials";

export const SILT_MOTES = 14;
export const SNOW_COUNT = 40;
export const VENT_COUNT = 6;
export const CRYSTAL_COUNT = 7;
export const CORAL_FANS = 5;

const SNOW_SEED_OFFSETS: readonly (readonly [number, number, number])[] = Array.from(
  { length: SNOW_COUNT },
  (_, i) => {
    const a = i * 2.39996; // golden-angle spread around the sub
    const r = 3.5 + (i % 7) * 1.4;
    return [Math.cos(a) * r, -((i % 11) - 5) * 1.6, Math.sin(a) * r] as const;
  }
);

const SILT_OFFSETS: readonly (readonly [number, number, number])[] = Array.from(
  { length: SILT_MOTES },
  (_, i) => {
    const a = i * 1.71;
    return [Math.cos(a) * (2.2 + (i % 4) * 0.8), -0.6 + (i % 5) * 0.45, Math.sin(a) * (2.4 + (i % 3) * 0.9)] as const;
  }
);

const VENTS: readonly (readonly [number, number, number, number])[] = [
  [-24, -61.2, -30, 2.2],
  [28, -61.0, -26, 1.7],
  [34, -61.4, 18, 2.6],
  [-30, -61.1, 26, 1.9],
  [8, -61.3, -38, 2.1],
  [-12, -61.0, 38, 1.6]
];

const CRYSTALS: readonly (readonly [number, number, number, number])[] = [
  [-20, -60.8, -34, 0.7],
  [24, -60.9, -32, 0.5],
  [38, -60.7, 8, 0.9],
  [-34, -60.8, 14, 0.6],
  [12, -60.9, 36, 0.8],
  [-6, -60.7, -42, 0.55],
  [30, -60.8, 34, 0.65]
];

const FANS: readonly (readonly [number, number, number, number])[] = [
  [-14, -15.4, 20, 1.3],
  [18, -14.8, -12, 1.1],
  [-26, -15.2, -4, 1.5],
  [26, -15.0, 26, 1.2],
  [4, -15.3, 34, 1.0]
];

const SPIRES: readonly (readonly [number, number, number])[] = [
  [-22, -18, 24],
  [2, -30, 32],
  [-40, -30, -18],
  [42, -33, 4]
];

export interface DeepWorld {
  readonly nodes: readonly AuraNodeInput[];
  readonly sonarMarkerIds: readonly string[];
}

export function deepWorldNodes(): DeepWorld {
  const nodes: AuraNodeInput[] = [];
  const crates = initialCrateSpawns();
  const markerIds: string[] = [];

  // ------------------------------------------------------------ terrain ---
  // Three terraced shelves read the depth zones: a bright shallow shelf,
  // a mid-trench terrace the wreck field sits on, and the abyssal floor.
  nodes.push(
    primitives.cylinder({ name: "abyssal basin floor", material: BASIN_FLOOR })
      .position(0, WORLD_BOUNDS.seabedY - 0.4, 0)
      .scale([92, 0.8, 92]),
    primitives.cylinder({ name: "mid trench terrace", material: MID_TERRACE })
      .position(0, -35.4, 0)
      .scale([58, 0.8, 58]),
    primitives.cylinder({ name: "shallow reef shelf", material: SHALLOW_SHELF })
      .position(-8, -15.4, 6)
      .scale([46, 0.7, 46]),
    // Depth-band shells: open columns of zone-tinted water so the camera
    // reads turquoise → trench → abyss through the fog at any depth.
    primitives.cylinder({ name: "water band shallow", material: BAND_SHALLOW })
      .position(0, -7.5, 0)
      .scale([120, 15, 120]),
    primitives.cylinder({ name: "water band trench", material: BAND_TRENCH })
      .position(0, -25, 0)
      .scale([130, 20, 130]),
    primitives.cylinder({ name: "water band abyss", material: BAND_ABYSS })
      .position(0, -48, 0)
      .scale([140, 28, 140])
  );

  // Reef spires + coral fans dress the shallow and mid zones.
  for (const [x, y, z] of SPIRES) {
    nodes.push(
      primitives.cylinder({ name: `reef-spire-${x}-${z}`, material: REEF_SPIRE })
        .position(x, y, z)
        .scale([1.6, 7, 1.6])
    );
  }
  for (const [x, y, z, s] of FANS) {
    nodes.push(
      primitives.box({ name: `coral-fan-${x}-${z}`, material: CORAL_FAN })
        .position(x, y, z)
        .rotate(0, x * 0.35, 0.16)
        .scale([s, s * 1.4, 0.08])
    );
  }

  // Hydrothermal vents + crystal clusters sell the abyssal floor.
  VENTS.forEach(([x, y, z, h], i) => {
    nodes.push(
      primitives.cylinder({ name: `vent-chimney-${i}`, material: VENT_ROCK })
        .position(x, y + h / 2, z)
        .scale([0.8, h, 0.8]),
      primitives.sphere({ name: `vent-glow-${i}`, material: VENT_GLOW })
        .position(x, y + h + 0.15, z)
        .scale([0.7, 0.4, 0.7])
        .runtime(game.runtimeNode(`vent-glow-${i}`))
    );
  });
  CRYSTALS.forEach(([x, y, z, s], i) => {
    nodes.push(
      primitives.box({ name: `abyss-crystal-${i}`, material: CRYSTAL })
        .position(x, y + s, z)
        .rotate(0.2, i * 1.1, 0.34)
        .scale([s * 0.4, s * 1.7, s * 0.4])
        .runtime(game.runtimeNode(`abyss-crystal-${i}`))
    );
  });

  // ------------------------------------------------------- typed assets ---
  // Wreck obstacles: the same field the collision code tests against.
  for (const obs of WRECK_OBSTACLES) {
    nodes.push(
      model(assets.deepRecoveryWreckHull, {
        name: `wreck-${obs.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: obs.radius * 2.2
      })
        .position(obs.x, obs.y, obs.z)
        .runtime(game.runtimeNode(`wreck-${obs.id}`, { tags: ["sonar-target", "authored-collision"] }))
    );
  }
  // Landmark + distant dressing wrecks.
  nodes.push(
    model(assets.deepRecoveryWreckHull, {
      name: "sonar reveal wreck landmark",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 7.2,
      material: {
        color: "#64796b",
        emissive: "#2d5b51",
        emissiveIntensity: 0.58,
        roughness: 0.52,
        metallic: 0.34,
        clearcoat: 0.12,
        clearcoatRoughness: 0.42
      }
    }).position(-6.4, -11.7, -11.6),
    model(assets.deepRecoveryWreckHull, {
      name: "deep recovery distant wreck dressing",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 6.0,
      material: { color: "#5c3b31", roughness: 0.68, metallic: 0.2 }
    }).position(14, -27, -8)
  );

  // Recovery buoy + beacon + service-zone ring at the surface station.
  nodes.push(
    model(assets.deepRecoveryBuoyBeacon, {
      name: "buoy-station",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 4.25
    }).position(BUOY_STATION.x, BUOY_STATION.y, BUOY_STATION.z),
    primitives.sphere({ name: "buoy-beacon-light-shell", material: BUOY_BEACON })
      .position(BUOY_STATION.x, BUOY_STATION.y + 2.2, BUOY_STATION.z)
      .scale(0.45)
      .runtime(game.runtimeNode("buoy-beacon")),
    primitives.torus({ name: "buoy-service-ring", material: BUOY_SERVICE_RING })
      .position(BUOY_STATION.x, BUOY_STATION.y - 0.6, BUOY_STATION.z)
      .rotate(Math.PI / 2, 0, 0)
      .scale([BUOY_STATION.dockRadius, BUOY_STATION.dockRadius, 0.06])
      .runtime(game.runtimeNode("buoy-service-ring")),
    primitives.cylinder({ name: "buoy-mooring-chain", material: REEF_SPIRE })
      .position(BUOY_STATION.x, -30, BUOY_STATION.z)
      .scale([0.06, 30, 0.06])
  );

  // Submarine + attached light-cue meshes (the searchlight story the spot
  // key supports; the beams track the hull in syncSubVisual).
  nodes.push(
    model(assets.deepRecoverySub, {
      name: "sub-root",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 8.4,
      material: SUB_HULL
    })
      .position(0, -6, 0)
      .runtime(game.runtimeNode("sub-root", { tags: ["player", "primary-vehicle"] })),
    primitives.sphere({ name: "sub-lamp-volume", material: LAMP_VOLUME })
      .position(0, -6, 4)
      .scale([1.8, 0.9, 3.2])
      .runtime(game.runtimeNode("sub-lamp-volume")),
    primitives.cylinder({ name: "sub-lamp-port", material: LAMP_BEAM })
      .rotate(Math.PI / 2, 0, 0)
      .position(-0.5, -6.2, 3)
      .scale([0.16, 2.0, 0.16])
      .runtime(game.runtimeNode("sub-lamp-port")),
    primitives.cylinder({ name: "sub-lamp-starboard", material: LAMP_BEAM })
      .rotate(Math.PI / 2, 0, 0)
      .position(0.5, -6.2, 3)
      .scale([0.16, 2.0, 0.16])
      .runtime(game.runtimeNode("sub-lamp-starboard")),
    primitives.sphere({ name: "breach-beacon", material: BREACH_BEACON })
      .position(0, -100, 0)
      .scale(0.28)
      .runtime(game.runtimeNode("breach-beacon")),
    primitives.box({ name: "grapple-line", material: GRAPPLE_LINE })
      .position(0, -100, 0)
      .scale([0.045, 0.045, 0.1])
      .runtime(game.runtimeNode("grapple-line"))
  );

  // Bioluminescent silt near the sub + ambient marine snow.
  SILT_OFFSETS.forEach((offset, index) => {
    nodes.push(
      primitives.sphere({ name: `silt-mote-${index}`, material: SILT_MOTE(index) })
        .position(offset[0], -6 + offset[1], offset[2])
        .scale(index % 4 === 0 ? 0.2 : 0.12)
        .runtime(game.runtimeNode(`silt-mote-${index}`, { tags: ["underwater-particle"] }))
    );
  });
  SNOW_SEED_OFFSETS.forEach((offset, index) => {
    nodes.push(
      primitives.sphere({ name: `marine-snow-${index}`, material: MARINE_SNOW })
        .position(offset[0], -30 + offset[1] * 3, offset[2])
        .scale(0.07 + (index % 3) * 0.02)
        .runtime(game.runtimeNode(`marine-snow-${index}`, { tags: ["underwater-particle", "ambient"] }))
    );
  });

  // Sonar pulse wave.
  nodes.push(
    primitives.cylinder({ name: "sonar-pulse-ring", material: SONAR_PULSE })
      .position(0, -100, 0)
      .scale([0.1, 0.05, 0.1])
      .runtime(game.runtimeNode("sonar-pulse-ring"))
  );

  // -------------------------------------------------------------- crates --
  for (const crate of crates) {
    nodes.push(
      model(crate.kind === "crate-heavy" ? assets.deepRecoveryCrateHeavy : assets.deepRecoveryCrateStandard, {
        name: `crate-node-${crate.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: crate.kind === "crate-heavy" ? 1.8 : 1.35
      })
        .position(crate.x, crate.y, crate.z)
        .runtime(game.runtimeNode(`crate-node-${crate.id}`, { tags: ["salvage", crate.kind] }))
    );
  }

  // Sonar contact markers occupy each target's real position; hidden until
  // a spherical sonar query returns that target id.
  const sonarTargetIds = [
    "buoy",
    ...WRECK_OBSTACLES.map((o) => o.id),
    ...crates.map((c) => c.id)
  ];
  for (const id of sonarTargetIds) {
    markerIds.push(`sonar-marker-${id}`);
    const pos =
      id === "buoy" ? { x: BUOY_STATION.x, y: BUOY_STATION.y, z: BUOY_STATION.z }
      : WRECK_OBSTACLES.find((o) => o.id === id) ?? crates.find((c) => c.id === id)!;
    nodes.push(
      primitives.torus({ name: `sonar-marker-${id}`, material: SONAR_MARKER })
        .position(pos.x, pos.y + 0.6, pos.z)
        .scale([1.05, 1.05, 0.1])
        .runtime(game.runtimeNode(`sonar-marker-${id}`, { tags: ["sonar-return"] }))
    );
  }

  return { nodes, sonarMarkerIds: markerIds };
}
