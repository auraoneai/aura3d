/**
 * Thermal Drift static data: drones, circuits, pickups and track-side anchors. Pure data with no engine import, so the
 * simulation (sim.ts) and its unit tests load it directly.
 */
export type DroneId = "orion" | "volt" | "bastion" | "spectre" | "razor" | "nighthawk" | "wraith";
export type CircuitId = "grand" | "dustfall" | "vesper";
export type ModeId = "race" | "trial" | "elim";

export interface DroneSpec {
  readonly id: DroneId;
  readonly name: string;
  readonly tag: string;
  readonly speed: number;
  readonly armour: number;
  readonly laser: number;
  readonly boost: number;
  readonly color: string;
  readonly nodeId: string;
  readonly maxDim: number;
  /** Key of the drone model in aura-assets.ts. */
  readonly assetKey: string;
}

export interface CircuitSector {
  readonly name: string;
  readonly startFrac: number;
  readonly curvature: number;
  readonly pitchSlope: number;
}

/**
 * One parallax skyline layer (GU47 HS-04): silhouettes on an arc around the road ahead, drawn as instanced pieces.
 * Presentation only; the simulation never reads it.
 */
export interface SkylineLayerSpec {
  /** Distance from the drone, metres (180 / 300 / 450). */
  readonly distance: number;
  readonly count: number;
  /** Silhouette height range, metres. */
  readonly height: readonly [number, number];
  /** Footprint width range, metres. */
  readonly width: readonly [number, number];
  /** Fraction of thin, tall pieces (smokestacks, spires). */
  readonly spires: number;
  /** Half arc in degrees around the road ahead. */
  readonly arcDeg: number;
  readonly seed: number;
}

export interface CircuitSpec {
  readonly id: CircuitId;
  readonly name: string;
  readonly shortName: string;
  readonly length: number;
  /** GU47 HS-04: three parallax skyline layers (presentation only). */
  readonly skyline: readonly SkylineLayerSpec[];
  /** Backdrop behind the horizon bands. */
  readonly skyColor: string;
  /** Abyss floor under the road and the lower backdrop band. */
  readonly fogTint: string;
  /** Road spine, wall chevrons and the main horizon band. */
  readonly accentColor: string;
  /** Second (upper) horizon band. */
  readonly horizonColor: string;
  readonly sectors: readonly CircuitSector[];
}

export const DRONE_SPECS: Readonly<Record<DroneId, DroneSpec>> = {
  orion: { id: "orion", name: "ORION", tag: "Balanced. Reliable. Built to race.", speed: 8, armour: 5, laser: 6, boost: 8, color: "#d2561c", nodeId: "drone-orion", maxDim: 3.8, assetKey: "heatsinkDroneOrion" },
  volt: { id: "volt", name: "VOLT", tag: "Light frame. Brutal acceleration.", speed: 9, armour: 3, laser: 6, boost: 9, color: "#1f9dff", nodeId: "drone-volt", maxDim: 3.6, assetKey: "heatsinkDroneVolt" },
  bastion: { id: "bastion", name: "BASTION", tag: "Heavy armour. Takes the hits.", speed: 6, armour: 9, laser: 5, boost: 6, color: "#1438df", nodeId: "drone-bastion", maxDim: 4.1, assetKey: "heatsinkDroneBastion" },
  spectre: { id: "spectre", name: "SPECTRE", tag: "Cool-running guns. Long bursts.", speed: 7, armour: 6, laser: 9, boost: 7, color: "#d999ad", nodeId: "drone-spectre", maxDim: 3.75, assetKey: "heatsinkDroneSpectre" },
  razor: { id: "razor", name: "RAZOR", tag: "Armoured brawler. Holds the racing line.", speed: 7, armour: 7, laser: 6, boost: 7, color: "#ad1060", nodeId: "drone-razor", maxDim: 3.85, assetKey: "heatsinkDroneRazor" },
  nighthawk: { id: "nighthawk", name: "NIGHTHAWK", tag: "Heavy firepower. Sustained pressure.", speed: 7, armour: 6, laser: 8, boost: 6, color: "#611a78", nodeId: "drone-nighthawk", maxDim: 3.85, assetKey: "heatsinkDroneNighthawk" },
  wraith: { id: "wraith", name: "WRAITH", tag: "Light interceptor. Speed over armour.", speed: 8, armour: 4, laser: 7, boost: 8, color: "#0d8ca8", nodeId: "drone-wraith", maxDim: 3.7, assetKey: "heatsinkDroneWraith" }
};

export const DRONE_ORDER: readonly DroneId[] = ["orion", "volt", "bastion", "spectre", "razor", "nighthawk", "wraith"];

export const RIVAL_PILOT_NAMES: readonly string[] = [
  "Vex Rallo", "Kira Dune", "Old Mott", "Saba Teel", "Rook Varn", "Jix Polo", "Mara Quell", "Dusk Ondo", "Tavi Rhee", "Gorran", "Zell Fane"
];

export const CIRCUITS: Readonly<Record<CircuitId, CircuitSpec>> = {
  grand: {
    id: "grand",
    name: "GRAND CIRCUIT · MEGACITY",
    shortName: "MEGACITY",
    length: 2400,
    // Dense foundry towers.
    skyline: [
      { distance: 180, count: 16, height: [40, 150], width: [14, 30], spires: 0.2, arcDeg: 80, seed: 11 },
      { distance: 300, count: 20, height: [60, 190], width: [18, 40], spires: 0.15, arcDeg: 85, seed: 23 },
      { distance: 450, count: 24, height: [70, 220], width: [24, 55], spires: 0.1, arcDeg: 90, seed: 37 }
    ],
    skyColor: "#141b2b",
    fogTint: "#1a2230",
    accentColor: "#ff4d1f",
    horizonColor: "#35d6ff",
    sectors: [
      { name: "MEGACITY AVE", startFrac: 0.0, curvature: 0.18, pitchSlope: 0.02 },
      { name: "INDUSTRIAL TUNNEL", startFrac: 0.2, curvature: -0.34, pitchSlope: -0.05 },
      { name: "FLOODED UNDERPASS", startFrac: 0.42, curvature: 0.28, pitchSlope: -0.03 },
      { name: "GEOTHERMAL FOUNDRY", startFrac: 0.64, curvature: -0.42, pitchSlope: 0.06 },
      { name: "RUINED CIVIC DISTRICT", startFrac: 0.82, curvature: 0.22, pitchSlope: 0.01 }
    ]
  },
  dustfall: {
    id: "dustfall",
    name: "DUSTFALL FOREST",
    shortName: "DUSTFALL",
    length: 2650,
    // Smokestacks and squat cooling blocks on the dust plain.
    skyline: [
      { distance: 180, count: 10, height: [25, 110], width: [16, 40], spires: 0.45, arcDeg: 80, seed: 13 },
      { distance: 300, count: 12, height: [20, 90], width: [30, 70], spires: 0.35, arcDeg: 85, seed: 29 },
      { distance: 450, count: 14, height: [15, 60], width: [40, 90], spires: 0.2, arcDeg: 90, seed: 41 }
    ],
    skyColor: "#2a1d14",
    fogTint: "#2b1f16",
    accentColor: "#ffb800",
    horizonColor: "#e0602a",
    sectors: [
      { name: "START YARD", startFrac: 0.0, curvature: 0.12, pitchSlope: 0.01 },
      { name: "DUST BASIN", startFrac: 0.16, curvature: -0.38, pitchSlope: -0.04 },
      { name: "FOREST STRAIGHT", startFrac: 0.34, curvature: 0.08, pitchSlope: 0.03 },
      { name: "BERM HAIRPIN", startFrac: 0.52, curvature: 0.52, pitchSlope: -0.02 },
      { name: "AQUEDUCT CROSSING", startFrac: 0.72, curvature: -0.3, pitchSlope: 0.04 },
      { name: "REACTOR PERIMETER", startFrac: 0.88, curvature: 0.24, pitchSlope: -0.01 }
    ]
  },
  vesper: {
    id: "vesper",
    name: "VESPER HEIGHTS",
    shortName: "VESPER",
    length: 2800,
    // Thin spires and broken ruins on the heights.
    skyline: [
      { distance: 180, count: 12, height: [30, 130], width: [8, 22], spires: 0.6, arcDeg: 80, seed: 17 },
      { distance: 300, count: 14, height: [40, 160], width: [10, 26], spires: 0.5, arcDeg: 85, seed: 31 },
      { distance: 450, count: 16, height: [30, 120], width: [16, 40], spires: 0.3, arcDeg: 90, seed: 43 }
    ],
    skyColor: "#101a33",
    fogTint: "#151f38",
    accentColor: "#35d6ff",
    horizonColor: "#9a6bff",
    sectors: [
      { name: "BONEWAKE CAUSEWAY", startFrac: 0.0, curvature: -0.22, pitchSlope: 0.04 },
      { name: "SHARD ASCENT", startFrac: 0.2, curvature: 0.44, pitchSlope: 0.07 },
      { name: "LUMINOUS REEF", startFrac: 0.4, curvature: -0.36, pitchSlope: -0.05 },
      { name: "RIFT CROSSING", startFrac: 0.6, curvature: 0.3, pitchSlope: -0.04 },
      { name: "CROWN RISE", startFrac: 0.78, curvature: -0.46, pitchSlope: 0.05 },
      { name: "RESONANCE WELL", startFrac: 0.9, curvature: 0.2, pitchSlope: -0.03 }
    ]
  }
};

export const CIRCUIT_ORDER: readonly CircuitId[] = ["grand", "dustfall", "vesper"];

export const PICKUP_ITEMS = ["TURBO CELL", "CRYO FLUSH", "EMP SURGE", "AEGIS MATRIX", "SEEKER SALVO", "HYPERDRIVE"] as const;
export type PickupItem = (typeof PICKUP_ITEMS)[number];

export const TRACK_HALF_WIDTH = 10.5;
/** Lateral limit of the drone centre: past it the drone scrapes the wall. */
export const WALL_LIMIT = TRACK_HALF_WIDTH - 1.6;
export const TOTAL_LAPS = 3;

/** What touching an anchor does. `decor` has no gameplay effect (it spans the road high above, or stands beside it). */
export type AnchorKind = "decor" | "boost" | "coolant" | "shield" | "recharge" | "barrel" | "water" | "lava";

export interface SceneryAnchor {
  readonly id: string;
  readonly assetKey: string;
  readonly maxDim: number;
  /** Track distance of the first copy; copies repeat every `period` metres of race progress. */
  readonly s: number;
  readonly period: number;
  readonly lateralX: number;
  readonly baseY: number;
  readonly yaw: number;
  readonly kind: AnchorKind;
  readonly spinSpeed?: number;
}

// 22 track-side anchors: arches, gantry, tunnels, towers, hazards, pickups and the shockwave pylon.
// With the 7 drones and the mine, 30 `model(...)` nodes cover all 26 admitted `heatsink*` assets.
export const SCENERY_ANCHORS: readonly SceneryAnchor[] = [
  { id: "prop-gantry-start", assetKey: "heatsinkGantryStart", maxDim: 38, s: 68, period: 240, lateralX: 0, baseY: 0.0, yaw: 0, kind: "decor" },
  { id: "prop-arch-a", assetKey: "heatsinkArch", maxDim: 38, s: 46, period: 160, lateralX: 0, baseY: 0.0, yaw: 0, kind: "decor" },
  { id: "prop-arch-b", assetKey: "heatsinkArch", maxDim: 38, s: 126, period: 160, lateralX: 0, baseY: 0.0, yaw: 0, kind: "decor" },
  { id: "prop-overpass", assetKey: "heatsinkOverpass", maxDim: 56, s: 94, period: 220, lateralX: 0, baseY: 4.8, yaw: 0, kind: "decor" },
  { id: "prop-tunnel-a", assetKey: "heatsinkTunnelFrame", maxDim: 36, s: 58, period: 180, lateralX: 0, baseY: 0.0, yaw: 0, kind: "decor" },
  { id: "prop-tunnel-b", assetKey: "heatsinkTunnelFrame", maxDim: 36, s: 148, period: 180, lateralX: 0, baseY: 0.0, yaw: 0, kind: "decor" },
  { id: "prop-statue", assetKey: "heatsinkStatue", maxDim: 22, s: 128, period: 260, lateralX: -19.5, baseY: 0.0, yaw: 0.35, kind: "decor" },
  { id: "prop-tower-l-left", assetKey: "heatsinkTowerL", maxDim: 46, s: 44, period: 150, lateralX: -28.0, baseY: -2.0, yaw: 0.1, kind: "decor" },
  { id: "prop-tower-l-right", assetKey: "heatsinkTowerL", maxDim: 48, s: 118, period: 150, lateralX: 28.5, baseY: -2.0, yaw: -0.15, kind: "decor" },
  { id: "prop-tower-t-left", assetKey: "heatsinkTowerT", maxDim: 52, s: 82, period: 170, lateralX: -29.0, baseY: -2.0, yaw: 0, kind: "decor" },
  { id: "prop-tower-x-right", assetKey: "heatsinkTowerX", maxDim: 54, s: 156, period: 190, lateralX: 29.5, baseY: -2.0, yaw: 0.2, kind: "decor" },
  { id: "prop-billboard-left", assetKey: "heatsinkHoloBillboard", maxDim: 9.5, s: 60, period: 140, lateralX: -16.2, baseY: 5.4, yaw: 0.28, kind: "decor" },
  { id: "prop-billboard-right", assetKey: "heatsinkHoloBillboard", maxDim: 9.5, s: 130, period: 140, lateralX: 16.2, baseY: 5.6, yaw: -0.28, kind: "decor" },
  { id: "prop-lava-fall", assetKey: "heatsinkLavaFall", maxDim: 18, s: 108, period: 210, lateralX: 18.5, baseY: 0.0, yaw: -0.4, kind: "lava" },
  { id: "prop-water-emitter", assetKey: "heatsinkWaterEmitter", maxDim: 14, s: 76, period: 190, lateralX: -16.8, baseY: 0.0, yaw: 0.4, kind: "water" },
  { id: "prop-barrier-left", assetKey: "heatsinkBarrierA", maxDim: 3.8, s: 28, period: 90, lateralX: -9.4, baseY: 0.2, yaw: 0, kind: "decor" },
  { id: "prop-checkpoint-ring", assetKey: "heatsinkCheckpointRing", maxDim: 26.0, s: 86, period: 150, lateralX: -11.5, baseY: 1.2, yaw: 0, kind: "decor" },
  { id: "prop-boost-pad", assetKey: "heatsinkBoostPad", maxDim: 4.8, s: 42, period: 110, lateralX: -2.4, baseY: 0.12, yaw: 0, kind: "boost" },
  { id: "prop-cooling-canister", assetKey: "heatsinkCoolingCanister", maxDim: 2.1, s: 64, period: 125, lateralX: 3.1, baseY: 1.45, yaw: 0, kind: "coolant", spinSpeed: 1.8 },
  { id: "prop-shield-pickup", assetKey: "heatsinkShieldPickup", maxDim: 2.0, s: 98, period: 135, lateralX: -3.2, baseY: 1.65, yaw: 0, kind: "shield", spinSpeed: 2.1 },
  { id: "prop-explosive-barrel", assetKey: "heatsinkExplosiveBarrel", maxDim: 1.9, s: 54, period: 115, lateralX: 5.6, baseY: 0.45, yaw: 0.2, kind: "barrel" },
  // The shockwave pylon used to be pinned 34 m ahead of the player every frame (audit C8). It is now a track pickup:
  // flying through it recharges the shockwave.
  { id: "weapon-shockwave-emitter", assetKey: "heatsinkWeaponShockwave", maxDim: 1.55, s: 172, period: 200, lateralX: -6.8, baseY: 0.35, yaw: 0, kind: "recharge", spinSpeed: 1.4 }
];

/** Pickup half-width across the track, metres. */
export const PICKUP_REACH = 3.4;
