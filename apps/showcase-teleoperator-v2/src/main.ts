import {
  camera,
  createAuraApp,
  createCameraPathFromPreset,
  createGameAudio,
  createVehicleChassis,
  createVehicleDriverAi,
  decals,
  defineAuraAssets,
  effects,
  game,
  instances,
  looks,
  material,
  model,
  primitives,
  sampleCameraPath,
  scene,
  type AuraRuntimeNodeHandle,
  type DriverRoute,
  type VehicleSurface
} from "@aura3d/engine";
import { mountTouchControls, type TouchControlsDeps } from "@aura3d/game";
import { assets as rootAssets } from "../../../src/aura-assets";
import { v2Assets } from "./aura-assets-v2";

type Vec3 = [number, number, number];

// Spec/state types that are not re-exported through the public surface —
// derive them from the public factories' signatures (structurally identical).
type VehicleChassisSpec = Parameters<typeof createVehicleChassis>[0];
type DriverVehicleState = Parameters<ReturnType<typeof createVehicleDriverAi>["decide"]>[1];

// Minimal deterministic "game feel" kit in the spirit of the engine's
// internal createGameFeel (not re-exported on the public surface): hit-stop
// freezes the simulated dt, the rest forward to Aura feel-bus-style fx.
function createRouteFeel() {
  let hitStopMs = 0;
  return {
    hitStop(durationMs: number) { hitStopMs = Math.max(hitStopMs, durationMs); },
    /** Millisecond dt scaled by hit-stop (0 while frozen). */
    effectiveDt(dtMs: number) { return hitStopMs > 0 ? 0 : dtMs; },
    update(dtMs: number) { hitStopMs = Math.max(0, hitStopMs - dtMs); },
    get hitStopActive() { return hitStopMs > 0; },
    damageFlash(_color: string) { document.body.classList.remove("gd-hitflash"); void document.body.offsetWidth; document.body.classList.add("gd-hitflash"); },
    speedLines(_intensity: number) { /* handled via FOV kick + vignette in the frame loop */ },
    landingDust(_position: Vec3) { /* dust decals already sit under the ride pad */ }
  };
}

export type PlayableCarId = "waymo" | "cybercab" | "cybertruck" | "corvette" | "roadster";
export type AutopilotLevel = "MAN" | "L3" | "L4" | "L5" | "L5 MAX";
export type WeatherPreset = "night" | "golden" | "fog" | "drizzle";
export type RideLifecycleState = "offer" | "boarding" | "ride" | "alighting" | "summary";
export type RideStyle = "comfort" | "street";
export type CamMode = 0 | 1 | 2 | 3 | 4;

const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];
const HIDDEN_POS: Vec3 = [0, -90, 140];

// ─────────────────────────────────────────────────────────────────────────────
// Assets: same admitted teleop + heatsink GLBs as the flagship, merged with the
// root manifest; v2 Meshy landmark GLBs resolve from this app's own public dir.
// ─────────────────────────────────────────────────────────────────────────────
const teleopAdmittedAssets = defineAuraAssets({
  teleopWaymoHero: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopWaymoHero.6d2a9bfb.glb",
    hash: "sha256-6d2a9bfb61613fd1e5a0fd64aa3b8222d237bc58b7486f009d014c61066ee45a",
    bounds: [2.2, 2.521, 4.5678]
  },
  teleopWaymoTraffic: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopWaymoTraffic.f476abe7.glb",
    hash: "sha256-f476abe7f85470beff321bef6c521e425a549c13e1a10cfdd3c41e1f339b4559",
    bounds: [2.2, 2.521, 4.5678]
  },
  teleopCybercab: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopCybercab.08358a58.glb",
    hash: "sha256-08358a58dd8d530ccc7b4249db3a9d2e11ccf8ecfac1c9d9d7afea452a1de291",
    bounds: [1.7532, 1.7973, 4.4179]
  },
  teleopCybertruck: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopCybertruck.6aa8f5c4.glb",
    hash: "sha256-6aa8f5c420b6362c41b6376fb8d7107e1af536450cff75580b094d201906ec7b",
    bounds: [2.34, 2.3452, 5.693]
  },
  teleopCorvette: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopCorvette.e7009c34.glb",
    hash: "sha256-e7009c3418b2d0c3163bd1af8737f3986bab9c372aea90ce81dab8fb37197598",
    bounds: [2.0458, 1.5639, 4.6749]
  },
  teleopMissions: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopMissions.6996bfa9.glb",
    hash: "sha256-6996bfa9c290d2c4a4790c9334a48dc8c1798128fb14a8a4bfc9e2800a60be6a",
    bounds: [1.9976, 1.5315, 4.5]
  },
  teleopCablecar: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopCablecar.6412a9ca.glb",
    hash: "sha256-6412a9cac8abcb7b26156602dde013b87af5d8d7127cca6606f714fc18df16de",
    bounds: [2.8885, 4.093, 8.3975]
  },
  teleopSedan: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopSedan.glb",
    hash: "sha256-teleopSedan",
    bounds: [2.2076, 1.5586, 4.8408]
  },
  teleopSuv: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopSuv.glb",
    hash: "sha256-teleopSuv",
    bounds: [2.1864, 1.7948, 4.7481]
  },
  teleopTaxi: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopTaxi.glb",
    hash: "sha256-teleopTaxi",
    bounds: [2.1061, 1.5885, 4.5967]
  },
  teleopVan: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopVan.glb",
    hash: "sha256-teleopVan",
    bounds: [2.3593, 2.3621, 5.0734]
  },
  teleopPickup: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopPickup.glb",
    hash: "sha256-teleopPickup",
    bounds: [2.3697, 1.8376, 5.2906]
  },
  teleopBus: {
    type: "model",
    format: "glb",
    url: "/aura-assets/teleopBus.glb",
    hash: "sha256-teleopBus",
    bounds: [3.8159, 5.6352, 11.9659]
  },
  heatsinkTowerL: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerL.48cef1cc.glb",
    hash: "sha256-48cef1cc6f54ab2e2f2d3a57c51279101b90b0364b4ae57fe7aba0bde6a6d1de",
    bounds: [40, 202.8, 40]
  },
  heatsinkTowerT: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerT.3e5f0a0c.glb",
    hash: "sha256-3e5f0a0cbf4bbef5e8b0f7cfdb028fd1f18c4044efc079f44f1a3d943cf9c452",
    bounds: [51, 177.4632, 19.3]
  },
  heatsinkTowerX: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerX.69d0e56e.glb",
    hash: "sha256-69d0e56ed3fec36848c16ddfec4f3953d52a27fab19eefaa5995cb64639d816c",
    bounds: [29.8922, 183.9244, 20.1828]
  },
  heatsinkOverpass: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkOverpass.c6bb161f.glb",
    hash: "sha256-c6bb161fecdc3f00f006903a20433d1905804ce99277686cbcfe9a5ff867687b",
    bounds: [80, 26.2, 12.2]
  }
});

const assets = {
  ...teleopAdmittedAssets,
  ...(rootAssets as Record<string, unknown>),
  ...v2Assets
} as typeof rootAssets & typeof teleopAdmittedAssets & typeof v2Assets;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic 1-D hash for procedural dressing. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// San Francisco street topography. California Street rolls over Nob Hill:
// gentle deterministic crests the whole world rides on. Everything rendered
// uses `ry(wy, wz)` so car, traffic, pedestrians, curbs and road share the
// same elevation field, and the chassis samples it analytically per wheel.
// ─────────────────────────────────────────────────────────────────────────────
function hillOf(z: number): number {
  return (
    1.55 * Math.sin(z * 0.0105 + 0.6) +
    0.85 * Math.sin(z * 0.0212 + 1.9) +
    0.38 * Math.sin(z * 0.047 + 3.3)
  );
}
function hillSlope(z: number): number {
  const e = 1.2;
  return (hillOf(z + e) - hillOf(z - e)) / (2 * e);
}
/** Street crown (drainage) + kerb step + sidewalk lift for the chassis. */
function streetHeight(x: number, z: number): number {
  const ax = Math.abs(x);
  const crown = ax < 10.6 ? 0.07 * (1 - (ax / 10.6) ** 2) : 0;
  const kerb = ax >= 10.6 && ax < 19.6 ? 0.13 : ax >= 19.6 ? -0.28 : 0;
  const rumble = ax < 10.6 ? 0.012 * Math.sin(z * 0.9 + x * 2.1) : 0;
  return hillOf(z) + crown + kerb + rumble;
}
function streetNormal(x: number, z: number): Vec3 {
  const e = 0.5;
  const dz = (streetHeight(x, z + e) - streetHeight(x, z - e)) / (2 * e);
  const dx = (streetHeight(x + e, z) - streetHeight(x - e, z)) / (2 * e);
  const inv = 1 / Math.hypot(dx, 1, dz);
  return [-dx * inv, inv, -dz * inv];
}
const streetSurface: VehicleSurface = {
  sample(x, z) {
    const ax = Math.abs(x);
    const grip = ax < 10.6 ? 1 : ax < 19.6 ? 0.72 : 0.45;
    return { height: streetHeight(x, z), normal: streetNormal(x, z), grip, hit: true };
  }
};

interface FleetSpec {
  id: PlayableCarId;
  name: string;
  maker: string;
  maxDim: number;
  rideY: number;
  maxSpeedMps: number;
  accel: number;
  isIce: boolean;
  accent: string;
  modeLabel: string;
  unlockUsd: number;
  chassis: VehicleChassisSpec;
}

const PLAYABLE_FLEET: Record<PlayableCarId, FleetSpec> = {
  waymo: {
    id: "waymo",
    name: "Apex Lidar Cruiser",
    maker: "Apex Autonomous",
    maxDim: 4.58,
    rideY: 0,
    maxSpeedMps: 38,
    accel: 18,
    isIce: false,
    accent: "#3fd6c6",
    modeLabel: "AUTO · APEX L5 AUTOPILOT",
    unlockUsd: 0,
    chassis: {
      wheelbase: 2.9, trackWidth: 1.64, wheelRadius: 0.36, rideHeight: 0.46,
      suspensionTravel: 0.14, springRate: 11, dampingRatio: 0.85, maxSteerAngle: 0.46
    }
  },
  cybercab: {
    id: "cybercab",
    name: "Cyber Coupe",
    maker: "Aura Autonomous",
    maxDim: 4.42,
    rideY: 0,
    maxSpeedMps: 40,
    accel: 20,
    isIce: false,
    accent: "#e8c27a",
    modeLabel: "AUTO · NEURAL AUTOPILOT",
    unlockUsd: 250,
    chassis: {
      wheelbase: 2.75, trackWidth: 1.6, wheelRadius: 0.34, rideHeight: 0.42,
      suspensionTravel: 0.12, springRate: 13, dampingRatio: 0.72, maxSteerAngle: 0.52
    }
  },
  cybertruck: {
    id: "cybertruck",
    name: "Titan EV Truck",
    maker: "Aura Heavy Industries",
    maxDim: 5.55,
    rideY: 0,
    maxSpeedMps: 43,
    accel: 22,
    isIce: false,
    accent: "#cbd5e1",
    modeLabel: "AUTO · TRI-MOTOR AWD",
    unlockUsd: 700,
    chassis: {
      wheelbase: 3.65, trackWidth: 1.86, wheelRadius: 0.42, rideHeight: 0.58,
      suspensionTravel: 0.2, springRate: 9, dampingRatio: 0.9, maxSteerAngle: 0.4
    }
  },
  corvette: {
    id: "corvette",
    name: "Vortex GT",
    maker: "Manual Override",
    maxDim: 4.66,
    rideY: 0,
    maxSpeedMps: 54,
    accel: 29,
    isIce: true,
    accent: "#ffc61a",
    modeLabel: "8-DCT · 1,250 HP V8",
    unlockUsd: 1400,
    chassis: {
      wheelbase: 2.72, trackWidth: 1.66, wheelRadius: 0.34, rideHeight: 0.36,
      suspensionTravel: 0.08, springRate: 22, dampingRatio: 0.55, maxSteerAngle: 0.58
    }
  },
  roadster: {
    id: "roadster",
    name: "Apex Interceptor",
    maker: "Aura Aero Division",
    maxDim: 4.5,
    rideY: 0,
    maxSpeedMps: 58,
    accel: 34,
    isIce: false,
    accent: "#38bdf8",
    modeLabel: "COLD-GAS THRUSTERS",
    unlockUsd: 2800,
    chassis: {
      wheelbase: 2.68, trackWidth: 1.64, wheelRadius: 0.33, rideHeight: 0.34,
      suspensionTravel: 0.07, springRate: 26, dampingRatio: 0.5, maxSteerAngle: 0.6
    }
  }
};

const PLAYABLE_IDS: readonly PlayableCarId[] = [
  "waymo",
  "cybercab",
  "cybertruck",
  "corvette",
  "roadster"
];

interface SanFranciscoDistrict {
  hood: string;
  street: string;
  cross: string;
  coords: string;
}

const SF_DISTRICTS: readonly SanFranciscoDistrict[] = [
  { hood: "Nob Hill", street: "California Street", cross: "→ Mason St · Fairmont & Grace Cathedral", coords: "37.7919° N · 122.4102° W" },
  { hood: "Chinatown", street: "California Street", cross: "→ Grant Ave · Dragon Gate", coords: "37.7924° N · 122.4058° W" },
  { hood: "Financial District", street: "California Street", cross: "→ Montgomery St · Transamerica Pyramid", coords: "37.7931° N · 122.4026° W" },
  { hood: "SoMa · Transit Center", street: "Market Street", cross: "→ Fremont St · Salesforce Tower", coords: "37.7897° N · 122.3972° W" },
  { hood: "The Embarcadero", street: "The Embarcadero", cross: "→ Washington St · Ferry Building & Bay Bridge", coords: "37.7955° N · 122.3937° W" },
  { hood: "North Beach", street: "Columbus Avenue", cross: "→ Broadway · Telegraph Hill & Coit Tower", coords: "37.7992° N · 122.4076° W" }
];

interface FareScenario {
  passenger: string;
  avatarColor: string;
  quote: string;
  pickupName: string;
  pickupStreet: string;
  dropoffName: string;
  dropoffStreet: string;
  tripMiles: number;
  fareUsd: number;
  parSec: number;
}

const WAYMO_FARES: readonly FareScenario[] = [
  {
    passenger: "Maya Lin",
    avatarColor: "#2596be",
    quote: "Heading to the Transamerica Pyramid — glad an Apex caught my hail!",
    pickupName: "Nob Hill · Fairmont",
    pickupStreet: "California St & Mason St",
    dropoffName: "Financial District · Transamerica",
    dropoffStreet: "Montgomery St & Washington St",
    tripMiles: 0.8,
    fareUsd: 28.5,
    parSec: 52
  },
  {
    passenger: "Marcus Chen",
    avatarColor: "#d97706",
    quote: "Late for a pitch deck at Salesforce Tower — smooth and steady please!",
    pickupName: "Chinatown · Grant Ave",
    pickupStreet: "California St & Grant Ave",
    dropoffName: "SoMa · Salesforce Tower",
    dropoffStreet: "Mission St & Fremont St",
    tripMiles: 0.9,
    fareUsd: 32.0,
    parSec: 56
  },
  {
    passenger: "Elena Rostova",
    avatarColor: "#8b5cf6",
    quote: "Catching the Sausalito ferry at the Embarcadero terminal!",
    pickupName: "Financial District · 555 California",
    pickupStreet: "California St & Kearny St",
    dropoffName: "Embarcadero · Ferry Building",
    dropoffStreet: "The Embarcadero & Market St",
    tripMiles: 1.1,
    fareUsd: 36.75,
    parSec: 60
  },
  {
    passenger: "Liam O'Connor",
    avatarColor: "#10b981",
    quote: "Espresso run in North Beach — love watching the roof LiDAR spin!",
    pickupName: "Embarcadero · Pier 7",
    pickupStreet: "The Embarcadero & Broadway",
    dropoffName: "North Beach · Washington Sq",
    dropoffStreet: "Columbus Ave & Union St",
    tripMiles: 0.7,
    fareUsd: 24.25,
    parSec: 48
  }
];

interface PeerDriverState {
  id: string;
  handle: string;
  carLabel: string;
  piClass: string;
  piColor: string;
  accent: string;
  laneX: number;
  targetLaneX: number;
  zOffset: number;
  speed: number;
  baseSpeed: number;
  rideY: number;
  yawOffset: number;
  isCableCar: boolean;
  worldX: number;
  worldZ: number;
  distanceMeters: number;
}

interface TrafficCarState {
  slotIdx: number;
  laneX: number;
  z: number;
  speed: number;
  direction: 1 | -1;
  phase: number;
  /** Deterministic driver-AI traffic (same-direction slots). */
  ai: boolean;
  preferredOffset: number;
  throttle: number;
  brake: number;
  steer: number;
}

const AVENUE_LANES_X = [-7.6, -3.2, 3.4, 7.4] as const;
const CURB_BEACON_X = 8.55;

// World-recycle geometry
const ROAD_SEGMENTS = 18;
const ROAD_SEGMENT_LEN = 24;
const DASH_ROWS = 14;
const DASH_STRIDE_Z = 14;
const INTERSECTION_COUNT = 4;
const INTERSECTION_STRIDE_Z = 92;
const BUILDING_PAIRS = 10;
const BUILDING_STRIDE_Z = 30;
const LAMP_PAIRS = 6;
const LAMP_STRIDE_Z = 38;
const PATH_RIBBON_COUNT = 9;
const PED_COUNT = 16;
const SKID_POOL = 22;
const SURGE_ZONES: readonly { name: string; z0: number; z1: number; mult: number }[] = [
  { name: "FIDI DEMAND ZONE", z0: -175, z1: -262, mult: 2.0 },
  { name: "EMBARCADERO NIGHT MARKET", z0: -336, z1: -430, mult: 1.75 }
];

const SCENE_CAM_POS: Vec3 = [0, 3.4, 6.5];
const SCENE_CAM_TARGET: Vec3 = [0, 1.0, -7.2];
const SCENE_CAM_FOV_DEG = 56;

// ─────────────────────────────────────────────────────────────────────────────
// Scene
// ─────────────────────────────────────────────────────────────────────────────
function buildGridDispatchSceneV2(): ReturnType<typeof scene> {
  const s = scene()
    // One authored look owns environment/IBL, key shadow, fog, background & grade.
    .add(looks.preset("night-city", { fogDensityScale: 0.85, exposureEv: 0.15 }))
    .camera(
      camera.perspective({
        fov: SCENE_CAM_FOV_DEG,
        near: 0.25,
        far: 720,
        position: SCENE_CAM_POS,
        target: SCENE_CAM_TARGET
      })
    )
    // Night-city extras: wet asphalt SSR, Karl-style volume, drizzle, DOF.
    .add(effects.screenSpaceReflections({ name: "fx-wet-asphalt" }))
    .add(effects.volumetricFog({ name: "fx-karl-volume" }))
    .add(effects.fogVolume({ name: "fx-fogbank" }))
    .add(effects.rain({ name: "fx-drizzle" }))
    .add(effects.depthOfField({ name: "fx-cinematic-dof" }));

  // ── 1. San Francisco peninsula ground, bay water, segmented hilly avenue ──
  const asphaltMat = material.pbr({ color: "#12151d", roughness: 0.62, metalness: 0.24 });
  const brassRailMat = material.pbr({ color: "#b59449", metalness: 0.82, roughness: 0.28 });
  const graniteCurbMat = material.pbr({ color: "#8b97a8", roughness: 0.72, metalness: 0.08 });
  const sidewalkMat = material.pbr({ color: "#3d4653", roughness: 0.85, metalness: 0.05 });

  s.addMany([
    primitives
      .box({ name: "sf-peninsula-ground", size: [1400, 0.2, 720], material: material.pbr({ color: "#141922", roughness: 0.94 }) })
      .position(0, -1.4, -240)
      .runtime(game.runtimeNode("sf-peninsula-ground")),
    primitives
      .box({ name: "sf-bay-water", size: [1400, 0.08, 260], material: material.pbr({ color: "#0a2740", roughness: 0.16, metalness: 0.55 }) })
      .position(0, -0.4, -400)
      .runtime(game.runtimeNode("sf-bay-water"))
  ]);

  // 18 pitched road slabs: the drivable street follows hillOf(z) so crests are real.
  for (let i = 0; i < ROAD_SEGMENTS; i++) {
    const id = `sf-road-${i}`;
    s.add(
      primitives
        .box({ name: id, size: [21.6, 0.14, ROAD_SEGMENT_LEN + 0.5], material: asphaltMat })
        .position(0, -0.07, -i * ROAD_SEGMENT_LEN)
        .runtime(game.runtimeNode(id))
    );
    for (const [side, sx] of [["l", -10.8], ["r", 10.8]] as const) {
      s.add(
        primitives
          .box({ name: `sf-curb-${side}-${i}`, size: [0.5, 0.24, ROAD_SEGMENT_LEN + 0.5], material: graniteCurbMat })
          .position(sx, 0.12, -i * ROAD_SEGMENT_LEN)
          .runtime(game.runtimeNode(`sf-curb-${side}-${i}`))
      );
      s.add(
        primitives
          .box({ name: `sf-walk-${side}-${i}`, size: [8.5, 0.2, ROAD_SEGMENT_LEN + 0.5], material: sidewalkMat })
          .position(sx > 0 ? 15.2 : -15.2, 0.1, -i * ROAD_SEGMENT_LEN)
          .runtime(game.runtimeNode(`sf-walk-${side}-${i}`))
      );
    }
    for (const [ri, railx] of [-3.8, -2.6, 2.8, 4.0].entries()) {
      s.add(
        primitives
          .box({ name: `sf-rail-${ri}-${i}`, size: [0.09, 0.03, ROAD_SEGMENT_LEN + 0.5], material: brassRailMat })
          .position(railx, 0.016, -i * ROAD_SEGMENT_LEN)
          .runtime(game.runtimeNode(`sf-rail-${ri}-${i}`))
      );
    }
    // Centre double-yellow, segmented too.
    for (const [li, lx] of [-0.18, 0.18].entries()) {
      s.add(
        primitives
          .box({ name: `sf-yellow-${li}-${i}`, size: [0.12, 0.025, ROAD_SEGMENT_LEN + 0.5], material: material.emissive({ color: "#fbbf24", emissive: "#b45309", emissiveIntensity: 0.5 }) })
          .position(lx, 0.014, -i * ROAD_SEGMENT_LEN)
          .runtime(game.runtimeNode(`sf-yellow-${li}-${i}`))
      );
    }
  }

  // ── 2. SF landmarks (night skyline) + typed skyline GLBs + overpass ──
  const pyramidMat = material.pbr({ color: "#d7dee8", roughness: 0.42, metalness: 0.22 });
  const salesforceGlassMat = material.pbr({ color: "#1d4e66", roughness: 0.18, metalness: 0.72 });
  const ggOrangeMat = material.pbr({ color: "#b03325", roughness: 0.48, metalness: 0.35 });
  const windowGlowMat = material.emissive({ color: "#ffd27a", emissive: "#ffb347", emissiveIntensity: 0.9 });

  s.addMany([
    primitives.cylinder({ name: "sf-transamerica-spire", size: [22, 145, 22], material: pyramidMat }).position(44, 72, -210).runtime(game.runtimeNode("sf-transamerica-spire")),
    primitives.box({ name: "sf-transamerica-wing", size: [28, 78, 8], material: pyramidMat }).position(44, 39, -210).runtime(game.runtimeNode("sf-transamerica-wing")),
    primitives.sphere({ name: "sf-transamerica-crown", size: [3.2, 5.5, 3.2], material: material.emissive({ color: "#e0f2fe", emissive: "#3fd6c6", emissiveIntensity: 2.4 }) }).position(44, 145, -210).runtime(game.runtimeNode("sf-transamerica-crown")),
    primitives.cylinder({ name: "sf-salesforce-tower", size: [22, 158, 22], material: salesforceGlassMat }).position(-48, 79, -235).runtime(game.runtimeNode("sf-salesforce-tower")),
    primitives.cylinder({ name: "sf-salesforce-crown", size: [18.5, 16, 18.5], material: material.emissive({ color: "#7dd3fc", emissive: "#38bdf8", emissiveIntensity: 1.7 }) }).position(-48, 162, -235).runtime(game.runtimeNode("sf-salesforce-crown")),
    primitives.box({ name: "sf-gg-tower-w-l", size: [3.5, 118, 3.5], material: ggOrangeMat }).position(-96, 59, -335).runtime(game.runtimeNode("sf-gg-tower-w-l")),
    primitives.box({ name: "sf-gg-tower-w-r", size: [3.5, 118, 3.5], material: ggOrangeMat }).position(-78, 59, -335).runtime(game.runtimeNode("sf-gg-tower-w-r")),
    primitives.box({ name: "sf-gg-strut-w-1", size: [21, 3.2, 3.8], material: ggOrangeMat }).position(-87, 108, -335).runtime(game.runtimeNode("sf-gg-strut-w-1")),
    primitives.box({ name: "sf-gg-strut-w-2", size: [21, 3.2, 3.8], material: ggOrangeMat }).position(-87, 78, -335).runtime(game.runtimeNode("sf-gg-strut-w-2")),
    primitives.box({ name: "sf-gg-tower-e-l", size: [3.5, 118, 3.5], material: ggOrangeMat }).position(78, 59, -335).runtime(game.runtimeNode("sf-gg-tower-e-l")),
    primitives.box({ name: "sf-gg-tower-e-r", size: [3.5, 118, 3.5], material: ggOrangeMat }).position(96, 59, -335).runtime(game.runtimeNode("sf-gg-tower-e-r")),
    primitives.box({ name: "sf-gg-strut-e-1", size: [21, 3.2, 3.8], material: ggOrangeMat }).position(87, 108, -335).runtime(game.runtimeNode("sf-gg-strut-e-1")),
    primitives.box({ name: "sf-gg-deck", size: [260, 2.2, 12], material: ggOrangeMat }).position(0, 36, -335).runtime(game.runtimeNode("sf-gg-deck")),
    primitives.sphere({ name: "sf-moon-disc", size: [22, 22, 4], material: material.emissive({ color: "#dbeafe", emissive: "#93c5fd", emissiveIntensity: 1.4 }) }).position(58, 96, -380).runtime(game.runtimeNode("sf-moon-disc"))
  ]);

  s.addMany([
    model(assets.heatsinkTowerL, { name: "sf-skyline-tower-l", role: "setDressing", scaleMode: "fit", targetMaxDimension: 72 }).position(-58, 0, -145).runtime(game.runtimeNode("sf-skyline-tower-l")),
    model(assets.heatsinkTowerT, { name: "sf-skyline-tower-t", role: "setDressing", scaleMode: "fit", targetMaxDimension: 68 }).position(58, 0, -135).runtime(game.runtimeNode("sf-skyline-tower-t")),
    model(assets.heatsinkTowerX, { name: "sf-skyline-tower-x", role: "setDressing", scaleMode: "fit", targetMaxDimension: 74 }).position(-62, 0, -255).runtime(game.runtimeNode("sf-skyline-tower-x")),
    model(assets.heatsinkTowerX, { name: "sf-skyline-tower-x2", role: "setDressing", scaleMode: "fit", targetMaxDimension: 58 }).position(64, 0, -250).runtime(game.runtimeNode("sf-skyline-tower-x2")),
    model(assets.heatsinkOverpass, { name: "sf-bay-overpass", role: "setDressing", scaleMode: "fit", targetMaxDimension: 64 }).position(0, 0, -290).runtime(game.runtimeNode("sf-bay-overpass"))
  ]);

  // Meshy landmark GLBs (grid-*) — typed assets from this app's own manifest.
  s.addMany([
    model(v2Assets.gridTransamerica, { name: "v2-transamerica", role: "setDressing", scaleMode: "fit", targetMaxDimension: 150 }).position(52, 0, -200).runtime(game.runtimeNode("v2-transamerica")),
    model(v2Assets.gridFerryBuilding, { name: "v2-ferry", role: "setDressing", scaleMode: "fit", targetMaxDimension: 46 }).position(-8, 0, -346).runtime(game.runtimeNode("v2-ferry")),
    model(v2Assets.gridPaintedLadies, { name: "v2-ladies", role: "setDressing", scaleMode: "fit", targetMaxDimension: 26 }).position(-38, 0, -120).runtime(game.runtimeNode("v2-ladies")),
    model(v2Assets.gridCablecarShelter, { name: "v2-shelter-a", role: "setDressing", scaleMode: "fit", targetMaxDimension: 5.2 }).position(12.8, 0, -92).runtime(game.runtimeNode("v2-shelter-a")),
    model(v2Assets.gridCablecarShelter, { name: "v2-shelter-b", role: "setDressing", scaleMode: "fit", targetMaxDimension: 5.2 }).position(-12.8, 0, -184).runtime(game.runtimeNode("v2-shelter-b"))
  ]);

  // ── 3. Lane dashes (scroll pool) ──
  const dashMat = material.emissive({ color: "#cbd5e1", emissive: "#94a3b8", emissiveIntensity: 0.5 });
  for (let d = 0; d < 2; d++) {
    const lx = d === 0 ? -5.4 : 5.4;
    for (let i = 0; i < DASH_ROWS; i++) {
      const id = `sf-dash-${d}-${i}`;
      s.add(
        primitives
          .box({ name: id, size: [0.14, 0.025, 4.2], material: dashMat })
          .position(lx, 0.02, -i * DASH_STRIDE_Z)
          .runtime(game.runtimeNode(id))
      );
    }
  }

  // ── 4. Intersections: cross roads, zebras, signal masts, ped-call boxes ──
  const crossRoadMat = material.pbr({ color: "#1a2029", roughness: 0.7, metalness: 0.18 });
  const zebraMat = material.emissive({ color: "#f8fafc", emissive: "#cbd5e1", emissiveIntensity: 0.42 });
  const signalPoleMat = material.pbr({ color: "#2d3847", metalness: 0.72, roughness: 0.32 });
  const signalHeadMat = material.emissive({ color: "#43d17a", emissive: "#43d17a", emissiveIntensity: 2.1 });

  for (let i = 0; i < INTERSECTION_COUNT; i++) {
    const iz = -(i + 1) * INTERSECTION_STRIDE_Z;
    s.addMany([
      primitives.box({ name: `sf-cross-road-${i}`, size: [150, 0.05, 14], material: crossRoadMat }).position(0, 0.012, iz).runtime(game.runtimeNode(`sf-cross-road-${i}`)),
      primitives.box({ name: `sf-crosswalk-n-${i}`, size: [19.6, 0.04, 2.2], material: zebraMat }).position(0, 0.026, iz - 8.2).runtime(game.runtimeNode(`sf-crosswalk-n-${i}`)),
      primitives.box({ name: `sf-crosswalk-s-${i}`, size: [19.6, 0.04, 2.2], material: zebraMat }).position(0, 0.026, iz + 8.2).runtime(game.runtimeNode(`sf-crosswalk-s-${i}`)),
      primitives.cylinder({ name: `sf-sig-pole-r-${i}`, size: [0.24, 6.8, 0.24], material: signalPoleMat }).position(11.4, 3.4, iz - 9.2).runtime(game.runtimeNode(`sf-sig-pole-r-${i}`)),
      primitives.box({ name: `sf-sig-arm-r-${i}`, size: [5.6, 0.16, 0.16], material: signalPoleMat }).position(8.6, 6.5, iz - 9.2).runtime(game.runtimeNode(`sf-sig-arm-r-${i}`)),
      primitives.sphere({ name: `sf-sig-light-r-${i}`, size: [0.52, 0.52, 0.52], material: signalHeadMat }).position(6.4, 6.25, iz - 9.1).runtime(game.runtimeNode(`sf-sig-light-r-${i}`)),
      primitives.cylinder({ name: `sf-sig-pole-l-${i}`, size: [0.24, 6.8, 0.24], material: signalPoleMat }).position(-11.4, 3.4, iz - 9.2).runtime(game.runtimeNode(`sf-sig-pole-l-${i}`)),
      primitives.box({ name: `sf-sig-arm-l-${i}`, size: [5.6, 0.16, 0.16], material: signalPoleMat }).position(-8.6, 6.5, iz - 9.2).runtime(game.runtimeNode(`sf-sig-arm-l-${i}`)),
      primitives.sphere({ name: `sf-sig-light-l-${i}`, size: [0.52, 0.52, 0.52], material: signalHeadMat }).position(-6.4, 6.25, iz - 9.1).runtime(game.runtimeNode(`sf-sig-light-l-${i}`))
    ]);
  }

  // ── 5. Street-front buildings — two depth rows for a real night skyline ──
  const buildingPalette = ["#2c3646", "#3a2c3c", "#43332b", "#26334c", "#372f3f", "#2b3a44", "#40332d", "#30404e"];
  for (let i = 0; i < BUILDING_PAIRS; i++) {
    const bz = -18 - i * BUILDING_STRIDE_Z;
    const hL = 16 + ((i * 7) % 24);
    const hR = 18 + ((i * 11) % 26);
    const hL2 = 22 + ((i * 13) % 30);
    const hR2 = 24 + ((i * 17) % 34);
    s.addMany([
      primitives.box({ name: `sf-bldg-l-${i}`, size: [14, hL, 20], material: material.pbr({ color: buildingPalette[i % buildingPalette.length]!, roughness: 0.6, metalness: 0.2 }) }).position(-26.5, hL * 0.5, bz).runtime(game.runtimeNode(`sf-bldg-l-${i}`)),
      primitives.box({ name: `sf-bldg-r-${i}`, size: [14, hR, 20], material: material.pbr({ color: buildingPalette[(i + 3) % buildingPalette.length]!, roughness: 0.6, metalness: 0.2 }) }).position(26.5, hR * 0.5, bz).runtime(game.runtimeNode(`sf-bldg-r-${i}`)),
      primitives.box({ name: `sf-bldg-l2-${i}`, size: [18, hL2, 22], material: material.pbr({ color: buildingPalette[(i + 5) % buildingPalette.length]!, roughness: 0.62, metalness: 0.22 }) }).position(-44, hL2 * 0.5, bz - 9).runtime(game.runtimeNode(`sf-bldg-l2-${i}`)),
      primitives.box({ name: `sf-bldg-r2-${i}`, size: [18, hR2, 22], material: material.pbr({ color: buildingPalette[(i + 1) % buildingPalette.length]!, roughness: 0.62, metalness: 0.22 }) }).position(44, hR2 * 0.5, bz - 9).runtime(game.runtimeNode(`sf-bldg-r2-${i}`)),
      // Lit window strips (night city life)
      primitives.box({ name: `sf-bldgwin-l-${i}`, size: [10.5, 1.1, 0.1], material: windowGlowMat }).position(-26.5, 3.2 + (i % 4) * 2.2, bz + 10.05).runtime(game.runtimeNode(`sf-bldgwin-l-${i}`)),
      primitives.box({ name: `sf-bldgwin-r-${i}`, size: [10.5, 1.1, 0.1], material: windowGlowMat }).position(26.5, 3.6 + (i % 3) * 2.4, bz + 10.05).runtime(game.runtimeNode(`sf-bldgwin-r-${i}`))
    ]);
  }

  // ── 6. Streetlamps + trees + light-cone pools + bollards ──
  const lampMat = material.emissive({ color: "#fef3c7", emissive: "#fbbf24", emissiveIntensity: 1.8 });
  const treeFoliageMat = material.pbr({ color: "#14532d", roughness: 0.78 });
  const treeTrunkMat = material.pbr({ color: "#3f2d24", roughness: 0.88 });
  for (let i = 0; i < LAMP_PAIRS; i++) {
    const lz = -10 - i * LAMP_STRIDE_Z;
    s.addMany([
      primitives.cylinder({ name: `sf-lamp-l-${i}`, size: [0.16, 6.2, 0.16], material: signalPoleMat }).position(-11.2, 3.1, lz).runtime(game.runtimeNode(`sf-lamp-l-${i}`)),
      primitives.sphere({ name: `sf-globe-l-${i}`, size: [0.42, 0.42, 0.42], material: lampMat }).position(-10.8, 6.25, lz).runtime(game.runtimeNode(`sf-globe-l-${i}`)),
      primitives.cylinder({ name: `sf-lamp-r-${i}`, size: [0.16, 6.2, 0.16], material: signalPoleMat }).position(11.2, 3.1, lz).runtime(game.runtimeNode(`sf-lamp-r-${i}`)),
      primitives.sphere({ name: `sf-globe-r-${i}`, size: [0.42, 0.42, 0.42], material: lampMat }).position(10.8, 6.25, lz).runtime(game.runtimeNode(`sf-globe-r-${i}`)),
      primitives.cylinder({ name: `sf-tree-trunk-r-${i}`, size: [0.28, 3.2, 0.28], material: treeTrunkMat }).position(12.2, 1.6, lz - 14).runtime(game.runtimeNode(`sf-tree-trunk-r-${i}`)),
      primitives.sphere({ name: `sf-tree-crown-r-${i}`, size: [2.6, 3.1, 2.6], material: treeFoliageMat }).position(12.2, 4.1, lz - 14).runtime(game.runtimeNode(`sf-tree-crown-r-${i}`)),
      // Sodium streetlamp light-cone pools (volumetric cones over the kerb lane)
      effects.lightCone({ name: `fx-lampcone-${i}`, color: "#ffc46b", intensity: 0.6, length: 7.5, coneAngle: 0.42, softness: 0.7, position: [10.6, 3.1, lz] }).runtime(game.runtimeNode(`fx-lampcone-${i}`))
    ]);
  }

  // Instanced kerb bollards — one instanced primitive draw for the whole run.
  const bollardTransforms = Array.from({ length: 26 }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    return {
      position: [side * 11.0, 0.42, -16 - i * 16] as Vec3,
      scale: [1, 1, 1] as Vec3
    };
  });
  s.add(
    instances.cylinder({
      name: "sf-bollards",
      size: [0.16, 0.85, 0.16],
      material: material.pbr({ color: "#fbbf24", metalness: 0.4, roughness: 0.5 }),
      transforms: bollardTransforms,
      colors: bollardTransforms.map((_, i) => (i % 2 === 0 ? "#fbbf24" : "#d97706"))
    }).runtime(game.runtimeNode("sf-bollards"))
  );

  // ── 7. Apex kerb beacon + waiting passenger + path ribbon ──
  const beaconTealMat = material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 2.1 });
  const beaconBeamMat = material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 1.35 });
  for (let i = 0; i < PATH_RIBBON_COUNT; i++) {
    s.add(
      primitives
        .box({ name: `waymo-path-ribbon-${i}`, size: [1.35, 0.03, 3.2], material: beaconTealMat })
        .position(3.4, 0.03, -6 - i * 5.2)
        .runtime(game.runtimeNode(`waymo-path-ribbon-${i}`))
    );
  }
  s.addMany([
    primitives.torus({ name: "taxi-beacon-ring", size: [2.1, 2.1, 0.14], material: beaconTealMat }).position(CURB_BEACON_X, 0.08, -38).runtime(game.runtimeNode("taxi-beacon-ring")),
    primitives.cylinder({ name: "taxi-beacon-disc", size: [1.85, 0.04, 1.85], material: beaconBeamMat }).position(CURB_BEACON_X, 0.04, -38).runtime(game.runtimeNode("taxi-beacon-disc")),
    primitives.cylinder({ name: "taxi-beacon-beam", size: [0.42, 34, 0.42], material: beaconBeamMat }).position(CURB_BEACON_X, 17, -38).runtime(game.runtimeNode("taxi-beacon-beam")),
    primitives.cylinder({ name: "taxi-beacon-core", size: [0.16, 36, 0.16], material: material.emissive({ color: "#ffffff", emissive: "#8ff0e6", emissiveIntensity: 2.4 }) }).position(CURB_BEACON_X, 18, -38).runtime(game.runtimeNode("taxi-beacon-core")),
    primitives.cylinder({ name: "taxi-passenger-body", size: [0.44, 1.35, 0.34], material: material.pbr({ color: "#38bdf8", roughness: 0.55 }) }).position(11.35, 0.88, -38).runtime(game.runtimeNode("taxi-passenger-body")),
    primitives.sphere({ name: "taxi-passenger-head", size: [0.34, 0.36, 0.34], material: material.pbr({ color: "#fde68a", roughness: 0.6 }) }).position(11.35, 1.76, -38).runtime(game.runtimeNode("taxi-passenger-head")),
    primitives.box({ name: "taxi-passenger-arm", size: [0.14, 0.58, 0.14], material: material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 1.2 }) }).position(11.05, 1.55, -38).runtime(game.runtimeNode("taxi-passenger-arm"))
  ]);

  // ── 8. Pedestrian crowd (walkers recycled along sidewalks + crosswalks) ──
  const pedPalette = ["#7dd3fc", "#fca5a5", "#a7f3d0", "#fde68a", "#c4b5fd", "#f9a8d4"];
  for (let i = 0; i < PED_COUNT; i++) {
    const col = pedPalette[i % pedPalette.length]!;
    s.addMany([
      primitives.capsule({ name: `sf-ped-body-${i}`, size: [0.4, 1.15, 0.3], material: material.pbr({ color: col, roughness: 0.6 }) }).position(15.2, 0.95, -10 - i * 11).runtime(game.runtimeNode(`sf-ped-body-${i}`)),
      primitives.sphere({ name: `sf-ped-head-${i}`, size: [0.3, 0.32, 0.3], material: material.pbr({ color: "#f3d3a8", roughness: 0.6 }) }).position(15.2, 1.72, -10 - i * 11).runtime(game.runtimeNode(`sf-ped-head-${i}`))
    ]);
  }
  // Waiting crowd at cable-car stops — one instanced draw.
  s.add(
    instances.capsule({
      name: "sf-queue-crowd",
      size: [0.42, 1.2, 0.32],
      material: material.pbr({ color: "#94a3b8", roughness: 0.6 }),
      transforms: [
        { position: [13.4, 0.9, -91.4] as Vec3 },
        { position: [14.1, 0.9, -92.6] as Vec3 },
        { position: [12.9, 0.9, -93.5] as Vec3 },
        { position: [-13.2, 0.9, -183.2] as Vec3 },
        { position: [-14.0, 0.9, -184.5] as Vec3 }
      ],
      colors: ["#7dd3fc", "#fca5a5", "#fde68a", "#a7f3d0", "#c4b5fd"]
    }).runtime(game.runtimeNode("sf-queue-crowd"))
  );

  // ── 9. Playable hero fleet (typed GLB models) + hidden aux nodes ──
  s.addMany([
    model(assets.teleopWaymoHero, { name: "player-car-waymo", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: PLAYABLE_FLEET.waymo.maxDim })
      .position(0, 0, -0.8)
      .runtime(game.runtimeNode("player-car-waymo", { tags: ["primarySubject", "primaryVehicle", "player"] })),
    model(assets.teleopCybercab, { name: "player-car-cybercab", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: PLAYABLE_FLEET.cybercab.maxDim })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2]).scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-cybercab")),
    model(assets.teleopCybertruck, { name: "player-car-cybertruck", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: PLAYABLE_FLEET.cybertruck.maxDim })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2]).scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-cybertruck")),
    model(assets.teleopCorvette, { name: "player-car-corvette", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: PLAYABLE_FLEET.corvette.maxDim })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2]).scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-corvette")),
    model(assets.teleopMissions, { name: "player-car-roadster", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: PLAYABLE_FLEET.roadster.maxDim })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2]).scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-roadster")),
    // Apex roof LiDAR dome (spins on the waymo hero)
    primitives.cylinder({ name: "player-lidar-dome", size: [0.42, 0.2, 0.42], material: material.pbr({ color: "#0f172a", metalness: 0.85, roughness: 0.14 }) })
      .position(0, 2.18, -0.8)
      .runtime(game.runtimeNode("player-lidar-dome")),
    primitives.torus({ name: "player-lidar-ring", size: [0.26, 0.26, 0.04], material: material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 2.4 }) })
      .position(0, 2.31, -0.8)
      .runtime(game.runtimeNode("player-lidar-ring")),
    primitives.box({ name: "player-tailbar", size: [1.62, 0.08, 0.08], material: material.emissive({ color: "#ff1e27", emissive: "#ff1e27", emissiveIntensity: 1.95 }) })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-tailbar")),
    primitives.cylinder({ name: "player-thruster-l", size: [0.3, 1.35, 0.3], material: material.emissive({ color: "#67f3ff", emissive: "#38bdf8", emissiveIntensity: 2.0 }) })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-thruster-l")),
    primitives.cylinder({ name: "player-thruster-r", size: [0.3, 1.35, 0.3], material: material.emissive({ color: "#67f3ff", emissive: "#38bdf8", emissiveIntensity: 2.0 }) })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-thruster-r")),
    primitives.cylinder({ name: "player-contact-shadow", size: [2.25, 0.014, 4.55], material: material.pbr({ color: "#05070b", roughness: 0.96 }) })
      .position(0, 0.01, -0.8)
      .runtime(game.runtimeNode("player-contact-shadow"))
  ]);

  // ── 10. Skid/road-wear decals (runtime pool stamped under drifts) ──
  for (let i = 0; i < SKID_POOL; i++) {
    s.add(
      decals.project({
        name: `fx-skid-${i}`,
        color: "#05070b",
        size: [0.55, 3.4],
        position: [0, -40, 0],
        rotation: [-Math.PI / 2, 0, 0],
        normal: [0, 1, 0],
        opacity: 0.55,
        normalOffset: 0.02
      }).runtime(game.runtimeNode(`fx-skid-${i}`))
    );
  }
  // Static road wear: tar seams + oil stains along the avenue.
  for (let i = 0; i < 8; i++) {
    s.add(
      decals.project({
        name: `fx-wear-${i}`,
        color: "#090c12",
        size: [i % 2 === 0 ? 0.4 : 2.2, i % 2 === 0 ? 14 : 3.4],
        position: [(i % 3 - 1) * 5.5, 0.015, -34 - i * 42],
        rotation: [-Math.PI / 2, 0, i % 2 === 0 ? 0 : 0.4],
        normal: [0, 1, 0],
        opacity: 0.4,
        normalOffset: 0.018
      }).runtime(game.runtimeNode(`fx-wear-${i}`))
    );
  }

  // ── 11. Multiplayer peers + AI traffic (typed GLB models) ──
  s.addMany([
    model(assets.teleopWaymoTraffic, { name: "peer-car-0", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 4.58 }).position(-3.2, 0, -24).runtime(game.runtimeNode("peer-car-0")),
    primitives.torus({ name: "peer-waymo-lidar-ring", size: [0.28, 0.28, 0.045], material: beaconTealMat }).scale(HIDDEN_SCALE).runtime(game.runtimeNode("peer-waymo-lidar-ring")),
    model(assets.teleopCybercab, { name: "peer-car-1", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 4.42 }).position(7.4, 0, -32).runtime(game.runtimeNode("peer-car-1")),
    model(assets.teleopMissions, { name: "peer-car-2", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 4.5 }).position(3.4, 0, -48).runtime(game.runtimeNode("peer-car-2")),
    model(assets.teleopCablecar, { name: "peer-car-3", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 8.2 }).position(-3.2, 0, -42).runtime(game.runtimeNode("peer-car-3")),
    model(assets.teleopCorvette, { name: "peer-car-4", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 4.66 }).position(-7.6, 0, -56).runtime(game.runtimeNode("peer-car-4"))
  ]);

  const trafficSpecs = [
    { id: "traffic-0", asset: assets.teleopSedan, maxDim: 4.75 },
    { id: "traffic-1", asset: assets.teleopTaxi, maxDim: 4.6 },
    { id: "traffic-2", asset: assets.teleopSedan, maxDim: 4.75 },
    { id: "traffic-3", asset: assets.teleopSuv, maxDim: 4.75 },
    { id: "traffic-4", asset: assets.teleopSuv, maxDim: 4.75 },
    { id: "traffic-5", asset: assets.teleopTaxi, maxDim: 4.6 },
    { id: "traffic-6", asset: assets.teleopVan, maxDim: 5.05 },
    { id: "traffic-7", asset: assets.teleopPickup, maxDim: 5.25 },
    { id: "traffic-8", asset: assets.teleopPickup, maxDim: 5.25 },
    { id: "traffic-9", asset: assets.teleopBus, maxDim: 11.8 }
  ];
  for (const spec of trafficSpecs) {
    s.add(
      model(spec.asset, { name: spec.id, role: "setDressing", scaleMode: "fit", targetMaxDimension: spec.maxDim })
        .position(0, 0, -80)
        .runtime(game.runtimeNode(spec.id))
    );
  }

  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// View-space projection for floating peer nameplates — uses the live camera pose
// (updated every frame from the Aura camera controller / our computed pose).
// ─────────────────────────────────────────────────────────────────────────────
const liveCam = { pos: [...SCENE_CAM_POS] as Vec3, target: [...SCENE_CAM_TARGET] as Vec3, fov: SCENE_CAM_FOV_DEG };

function projectViewPointToScreen(
  pt: Vec3,
  viewportW: number,
  viewportH: number
): { x: number; y: number; visible: boolean } {
  const fx = liveCam.target[0] - liveCam.pos[0];
  const fy = liveCam.target[1] - liveCam.pos[1];
  const fz = liveCam.target[2] - liveCam.pos[2];
  const fLen = Math.hypot(fx, fy, fz) || 1;
  const fwd: Vec3 = [fx / fLen, fy / fLen, fz / fLen];

  const rxRaw = -fwd[2];
  const rzRaw = fwd[0];
  const rLen = Math.hypot(rxRaw, rzRaw) || 1;
  const right: Vec3 = [rxRaw / rLen, 0, rzRaw / rLen];

  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0]
  ];

  const dx = pt[0] - liveCam.pos[0];
  const dy = pt[1] - liveCam.pos[1];
  const dz = pt[2] - liveCam.pos[2];

  const cx = dx * right[0] + dy * right[1] + dz * right[2];
  const cy = dx * up[0] + dy * up[1] + dz * up[2];
  const cz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];

  if (cz <= 1.2 || cz > 280) return { x: -999, y: -999, visible: false };

  const tanHalfFov = Math.tan((liveCam.fov * 0.5 * Math.PI) / 180);
  const aspect = Math.max(1, viewportW) / Math.max(1, viewportH);
  const ndcX = cx / (cz * tanHalfFov * aspect);
  const ndcY = cy / (cz * tanHalfFov);
  if (Math.abs(ndcX) > 1.12 || Math.abs(ndcY) > 1.12) return { x: -999, y: -999, visible: false };

  return { x: (ndcX * 0.5 + 0.5) * viewportW, y: (-ndcY * 0.5 + 0.5) * viewportH, visible: true };
}

// Initialize Grid Dispatch SVG Speedometer Dial (#dial)
function initSpeedometerDial(isIce: boolean): void {
  const startDeg = -135;
  const endDeg = 135;
  const polar = (r: number, deg: number): [string, string] => {
    const rad = (deg * Math.PI) / 180;
    return [(120 + r * Math.sin(rad)).toFixed(2), (120 - r * Math.cos(rad)).toFixed(2)];
  };
  const arcPath = (r: number, a0: number, a1: number): string => {
    const p0 = polar(r, a0);
    const p1 = polar(r, a1);
    const largeArc = a1 - a0 > 180 ? 1 : 0;
    return `M${p0[0]} ${p0[1]}A${r} ${r} 0 ${largeArc} 1 ${p0[0]} ${p1[1]}`;
  };

  document.getElementById("rpmT")?.setAttribute("d", arcPath(86, startDeg, endDeg));
  document.getElementById("rpm")?.setAttribute("d", arcPath(86, startDeg, endDeg));
  document.getElementById("red")?.setAttribute("d", arcPath(86, startDeg + ((endDeg - startDeg) * 8) / 9, endDeg));
  document.getElementById("nosT")?.setAttribute("d", arcPath(110, -160, -95));
  document.getElementById("nos")?.setAttribute("d", arcPath(110, -160, -95));

  const ticksEl = document.getElementById("ticks");
  if (!ticksEl) return;

  let svg = "";
  if (!isIce) {
    for (let pct = 0; pct <= 100; pct += 5) {
      const deg = startDeg + ((endDeg - startDeg) * pct) / 100;
      const major = pct % 25 === 0;
      const pInner = polar(major ? 74 : 78, deg);
      const pOuter = polar(81, deg);
      svg += `<line class="tick${major ? "" : " min"}" x1="${pInner[0]}" y1="${pInner[1]}" x2="${pOuter[0]}" y2="${pOuter[1]}"/>`;
      if (major) {
        const pNum = polar(63, deg);
        svg += `<text class="num" x="${pNum[0]}" y="${pNum[1]}">${pct}</text>`;
      }
    }
  } else {
    for (let rpm = 0; rpm <= 9000; rpm += 500) {
      const deg = startDeg + ((endDeg - startDeg) * rpm) / 9000;
      const major = rpm % 1000 === 0;
      const pInner = polar(major ? 74 : 77, deg);
      const pOuter = polar(81, deg);
      svg += `<line class="tick${major ? "" : " min"}" x1="${pInner[0]}" y1="${pInner[1]}" x2="${pOuter[0]}" y2="${pOuter[1]}"/>`;
      if (major) {
        const pNum = polar(64, deg);
        svg += `<text class="num${rpm >= 8000 ? " r" : ""}" x="${pNum[0]}" y="${pNum[1]}">${rpm / 1000}</text>`;
      }
    }
  }
  const nosDot = polar(110, -165);
  svg += `<circle class="nosI" cx="${nosDot[0]}" cy="${nosDot[1]}" r="3.2"/>`;
  ticksEl.innerHTML = svg;
  document.body.classList.toggle("ice", isIce);
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────
async function bootGridDispatchV2(): Promise<void> {
  const canvas = document.getElementById("c") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("Missing #c canvas element for Grid Dispatch V2.");

  const builtScene = buildGridDispatchSceneV2();
  const auraApp = createAuraApp(canvas, {
    scene: builtScene,
    ...looks.appOptions("night-city"),
    // Enable the real camera/time/feel/effects/game lanes (stub-safe defaults off).
    qualityRebuild: { flags: ["camera", "vfx", "world", "game"] }
  });
  const req = (id: string) => auraApp.nodes.require(id);

  // ── Aura camera controller (real under A3D_QR_CAMERA) ──
  interface CamCtl {
    setPose(pose: { position: Vec3; target: Vec3; fov?: number; roll?: number }): void;
    fovKick?: { set?(v: number): void; add?(v: number): void } | number;
    punch?: ((p?: number) => void) | { set?(v: number): void; add?(v: number): void };
    shake?: { add?(v: number): void; set?(v: number): void } | ((v: number) => void);
  }
  const camCtl = (auraApp as unknown as { camera?: CamCtl }).camera;
  const camSetPose = (position: Vec3, target: Vec3, fov = SCENE_CAM_FOV_DEG, roll = 0) => {
    liveCam.pos = [...position] as Vec3;
    liveCam.target = [...target] as Vec3;
    liveCam.fov = fov;
    camCtl?.setPose({ position, target, fov, roll });
  };
  const camFovKick = (v: number) => {
    const fk = camCtl?.fovKick;
    if (fk && typeof fk === "object") (fk.add ?? fk.set)?.call(fk, v);
  };
  const camPunch = (v: number) => {
    const p = camCtl?.punch;
    if (typeof p === "function") p(v);
    else if (p && typeof p === "object") (p.add ?? p.set)?.call(p, v);
  };
  const camTrauma = (v: number) => {
    const sh = camCtl?.shake;
    if (typeof sh === "function") sh(v);
    else if (sh && typeof sh === "object") (sh.add ?? sh.set)?.call(sh, v);
  };

  // ── Engine systems: deterministic input, event log, HUD bindings, feel, audio ──
  const input = game.input({
    actions: {
      throttle: ["KeyW", "ArrowUp"],
      brake: ["KeyS", "ArrowDown"],
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      boost: ["ShiftLeft", "ShiftRight"],
      drift: ["Space"],
      interact: ["KeyF"],
      assist: ["KeyI"],
      cameraMode: ["KeyC"],
      weather: ["KeyT"],
      units: ["KeyU"],
      reset: ["KeyR"],
      pause: ["Escape", "KeyP"],
      car1: ["Digit1"], car2: ["Digit2"], car3: ["Digit3"], car4: ["Digit4"], car5: ["Digit5"]
    },
    axes: {
      steer: { negative: "left", positive: "right", smoothing: 0.16, deadzone: 0.05 }
    },
    bufferMs: 140,
    autoListen: true
  });

  const dispatchLog = game.eventLog({ label: "Grid Dispatch", maxEvents: 48 });
  const dispatchEl = document.getElementById("dispatch");
  const renderDispatch = () => {
    if (!dispatchEl) return;
    const evts = dispatchLog.events().slice(-4).reverse();
    dispatchEl.innerHTML = evts
      .map((e) => `<div class="ev ${e.severity === "warning" ? "warn" : e.severity === "error" ? "bad" : e.severity === "success" ? "good" : ""}"><b>${e.label}</b><small>${e.tags.join(" · ") || e.type}</small></div>`)
      .join("");
  };
  const dispatch = (type: string, label: string, severity: "info" | "success" | "warning" | "error" = "info", tags: string[] = []) => {
    dispatchLog.push({ type, label, severity, tags });
    renderDispatch();
  };

  const hudObjective = game.hud.objective({ id: "hud:objective", label: "Active Fare", valuePath: "runtime.objective" });
  const hudTimer = game.hud.timer({ id: "hud:timer", label: "Trip Timer", valuePath: "runtime.timerMs" });
  const hudScore = game.hud.score({ id: "hud:score", label: "Earnings", valuePath: "runtime.scoreUsd" });
  const hudRating = game.hud.value({ id: "hud:rating", label: "Rating", valuePath: "runtime.rating" });
  const hudEventLog = game.hud.eventLog({ id: "hud:dispatch", label: "Dispatch Feed" });
  const hudBindings = game.hud.bindings([hudObjective, hudTimer, hudScore, hudRating]);

  const feel = createRouteFeel();
  type AudioCue = "engine" | "bell" | "beep" | "chime" | "cash" | "horn" | "whoosh";
  const audio = createGameAudio<AudioCue>({
    browserContext: true,
    cues: {
      engine: {
        id: "engine",
        bus: "sfx", volume: 0.32, loop: true,
        play: (ctx, destination) => {
          const c = ctx as unknown as AudioContext;
          const osc = c.createOscillator();
          const osc2 = c.createOscillator();
          const g = c.createGain();
          const f = c.createBiquadFilter();
          osc.type = "sawtooth"; osc.frequency.value = 44;
          osc2.type = "sine"; osc2.frequency.value = 88;
          f.type = "lowpass"; f.frequency.value = 320;
          g.gain.value = 0.5;
          osc.connect(f); osc2.connect(f); f.connect(g); g.connect(destination);
          osc.start(); osc2.start();
          (engineVoice as { nodes?: unknown[] }).nodes = [osc, osc2, f, g];
        }
      },
      bell: {
        id: "bell",
        bus: "sfx", volume: 0.55,
        play: (ctx, destination) => {
          const c = ctx as unknown as AudioContext;
          const t = c.currentTime;
          [1648, 2093].forEach((fr, i) => {
            const o = c.createOscillator(); const g = c.createGain();
            o.type = "sine"; o.frequency.value = fr;
            g.gain.setValueAtTime(0.001, t + i * 0.16);
            g.gain.exponentialRampToValueAtTime(0.5, t + i * 0.16 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.16 + 0.7);
            o.connect(g); g.connect(destination);
            o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.75);
          });
        }
      },
      beep: {
        id: "beep",
        bus: "ui", volume: 0.4,
        play: (ctx, destination) => {
          const c = ctx as unknown as AudioContext;
          const o = c.createOscillator(); const g = c.createGain();
          o.type = "square"; o.frequency.value = 1180;
          g.gain.setValueAtTime(0.16, c.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.09);
          o.connect(g); g.connect(destination); o.start(); o.stop(c.currentTime + 0.1);
        }
      },
      chime: {
        id: "chime",
        bus: "ui", volume: 0.5,
        play: (ctx, destination) => {
          const c = ctx as unknown as AudioContext; const t = c.currentTime;
          [880, 1320, 1760].forEach((fr, i) => {
            const o = c.createOscillator(); const g = c.createGain();
            o.type = "sine"; o.frequency.value = fr;
            g.gain.setValueAtTime(0.001, t + i * 0.09);
            g.gain.exponentialRampToValueAtTime(0.4, t + i * 0.09 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.5);
            o.connect(g); g.connect(destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.55);
          });
        }
      },
      cash: {
        id: "cash",
        bus: "ui", volume: 0.5,
        play: (ctx, destination) => {
          const c = ctx as unknown as AudioContext; const t = c.currentTime;
          [660, 990].forEach((fr, i) => {
            const o = c.createOscillator(); const g = c.createGain();
            o.type = "triangle"; o.frequency.value = fr;
            g.gain.setValueAtTime(0.3, t + i * 0.07);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.3);
            o.connect(g); g.connect(destination); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.32);
          });
        }
      },
      horn: {
        id: "horn",
        bus: "sfx", volume: 0.5,
        play: (ctx, destination) => {
          const c = ctx as unknown as AudioContext;
          const o = c.createOscillator(); const g = c.createGain();
          o.type = "square"; o.frequency.value = 310;
          g.gain.setValueAtTime(0.22, c.currentTime);
          g.gain.setValueAtTime(0.22, c.currentTime + 0.28);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.36);
          o.connect(g); g.connect(destination); o.start(); o.stop(c.currentTime + 0.38);
        }
      },
      whoosh: {
        id: "whoosh",
        bus: "sfx", volume: 0.45,
        play: (ctx, destination) => {
          const c = ctx as unknown as AudioContext;
          const len = c.sampleRate * 0.4;
          const buf = c.createBuffer(1, len, c.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
          const src = c.createBufferSource(); src.buffer = buf;
          const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 1.4;
          const g = c.createGain(); g.gain.value = 0.4;
          src.connect(f); f.connect(g); g.connect(destination); src.start();
        }
      }
    }
  });
  const engineVoice: { nodes?: unknown[] } = {};
  let audioMuted = false;
  const cue = (id: AudioCue, position?: { x: number; y: number; z: number }) => {
    if (audioMuted) return;
    if (position) void audio.playPositional(id, position).catch(() => {});
    else void audio.cue(id).catch(() => {});
  };
  const unlockAudio = () => {
    void audio.unlock().then(() => {
      void audio.cue("engine").catch(() => {});
    }).catch(() => {});
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });

  // Touch controls (steer + pedals) wired into the deterministic input sink.
  let touchControls: { update(): void } | undefined;
  try {
    const host = document.getElementById("touchHost");
    if (host) {
      touchControls = mountTouchControls(input, {
        preset: "steer-pedals",
        bindings: {
          "stick.left": "left", "stick.right": "right",
          "stick.up": "throttle", "stick.down": "brake",
          gas: "throttle", brake: "brake",
          a: "boost", b: "drift", x: "interact", y: "assist"
        },
        show: undefined,
        haptics: { ms: 14 }
      }, {
        doc: document as unknown as TouchControlsDeps["doc"],
        root: host as unknown as TouchControlsDeps["root"],
        coarsePointer: () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches
      });
    }
  } catch { /* touch layer is progressive enhancement */ }

  // Accessibility runtime settings (reduced motion / flash / high contrast).
  const a11y = game.accessibility.settings([
    game.accessibility.reducedMotion(),
    game.accessibility.reducedFlash(),
    game.accessibility.highContrast()
  ]);
  const a11yState = {
    reducedMotion: a11y.reducedMotion,
    reducedFlash: a11y.reducedFlash,
    highContrast: a11y.highContrast
  };
  const applyA11y = () => {
    document.body.classList.toggle("rm", a11yState.reducedMotion);
    document.body.classList.toggle("hc", a11yState.highContrast);
  };

  // ── Node handles ──
  const playerCarHandles: Record<PlayableCarId, AuraRuntimeNodeHandle> = {
    waymo: req("player-car-waymo"),
    cybercab: req("player-car-cybercab"),
    cybertruck: req("player-car-cybertruck"),
    corvette: req("player-car-corvette"),
    roadster: req("player-car-roadster")
  };
  const playerLidarDome = req("player-lidar-dome");
  const playerLidarRing = req("player-lidar-ring");
  const playerTailbar = req("player-tailbar");
  const playerThrusterL = req("player-thruster-l");
  const playerThrusterR = req("player-thruster-r");
  const playerShadow = req("player-contact-shadow");

  const roadHandles = Array.from({ length: ROAD_SEGMENTS }, (_, i) => req(`sf-road-${i}`));
  const curbLHandles = Array.from({ length: ROAD_SEGMENTS }, (_, i) => req(`sf-curb-l-${i}`));
  const curbRHandles = Array.from({ length: ROAD_SEGMENTS }, (_, i) => req(`sf-curb-r-${i}`));
  const walkLHandles = Array.from({ length: ROAD_SEGMENTS }, (_, i) => req(`sf-walk-l-${i}`));
  const walkRHandles = Array.from({ length: ROAD_SEGMENTS }, (_, i) => req(`sf-walk-r-${i}`));
  const railHandles = [0, 1, 2, 3].map((r) => Array.from({ length: ROAD_SEGMENTS }, (_, i) => req(`sf-rail-${r}-${i}`)));
  const yellowHandles = [0, 1].map((l) => Array.from({ length: ROAD_SEGMENTS }, (_, i) => req(`sf-yellow-${l}-${i}`)));

  const landmarkHandles = {
    pyramidSpire: req("sf-transamerica-spire"),
    pyramidWing: req("sf-transamerica-wing"),
    pyramidCrown: req("sf-transamerica-crown"),
    salesforce: req("sf-salesforce-tower"),
    salesforceCrown: req("sf-salesforce-crown"),
    ggW1: req("sf-gg-tower-w-l"), ggW2: req("sf-gg-tower-w-r"), ggW3: req("sf-gg-strut-w-1"), ggW4: req("sf-gg-strut-w-2"),
    ggE1: req("sf-gg-tower-e-l"), ggE2: req("sf-gg-tower-e-r"), ggE3: req("sf-gg-strut-e-1"),
    ggDeck: req("sf-gg-deck"),
    moon: req("sf-moon-disc"),
    towerL: req("sf-skyline-tower-l"), towerT: req("sf-skyline-tower-t"), towerX: req("sf-skyline-tower-x"), towerX2: req("sf-skyline-tower-x2"),
    overpass: req("sf-bay-overpass"),
    v2Transamerica: req("v2-transamerica"), v2Ferry: req("v2-ferry"), v2Ladies: req("v2-ladies"),
    v2ShelterA: req("v2-shelter-a"), v2ShelterB: req("v2-shelter-b"),
    bayWater: req("sf-bay-water"), ground: req("sf-peninsula-ground")
  };
  const landmarkWorldZ: Record<string, number> = {
    pyramidSpire: -210, pyramidWing: -210, pyramidCrown: -210, salesforce: -235, salesforceCrown: -235,
    ggW1: -335, ggW2: -335, ggW3: -335, ggW4: -335, ggE1: -335, ggE2: -335, ggE3: -335, ggDeck: -335, moon: -380,
    towerL: -145, towerT: -135, towerX: -255, towerX2: -250, overpass: -290,
    v2Transamerica: -200, v2Ferry: -346, v2Ladies: -120, v2ShelterA: -92, v2ShelterB: -184,
    bayWater: -400, ground: -240
  };

  const dashHandles: AuraRuntimeNodeHandle[][] = [0, 1].map((d) =>
    Array.from({ length: DASH_ROWS }, (_, i) => req(`sf-dash-${d}-${i}`))
  );
  const intersectionHandles = Array.from({ length: INTERSECTION_COUNT }, (_, i) => ({
    crossRoad: req(`sf-cross-road-${i}`),
    crosswalkN: req(`sf-crosswalk-n-${i}`),
    crosswalkS: req(`sf-crosswalk-s-${i}`),
    poleR: req(`sf-sig-pole-r-${i}`), armR: req(`sf-sig-arm-r-${i}`), lightR: req(`sf-sig-light-r-${i}`),
    poleL: req(`sf-sig-pole-l-${i}`), armL: req(`sf-sig-arm-l-${i}`), lightL: req(`sf-sig-light-l-${i}`)
  }));
  const buildingHandles = Array.from({ length: BUILDING_PAIRS }, (_, i) => ({
    left: req(`sf-bldg-l-${i}`), right: req(`sf-bldg-r-${i}`),
    left2: req(`sf-bldg-l2-${i}`), right2: req(`sf-bldg-r2-${i}`),
    winL: req(`sf-bldgwin-l-${i}`), winR: req(`sf-bldgwin-r-${i}`),
    hL: 16 + ((i * 7) % 24), hR: 18 + ((i * 11) % 26), hL2: 22 + ((i * 13) % 30), hR2: 24 + ((i * 17) % 34),
    winY: [3.2 + (i % 4) * 2.2, 3.6 + (i % 3) * 2.4] as const
  }));
  const lampHandles = Array.from({ length: LAMP_PAIRS }, (_, i) => ({
    lampL: req(`sf-lamp-l-${i}`), globeL: req(`sf-globe-l-${i}`),
    lampR: req(`sf-lamp-r-${i}`), globeR: req(`sf-globe-r-${i}`),
    trunkR: req(`sf-tree-trunk-r-${i}`), crownR: req(`sf-tree-crown-r-${i}`),
    cone: req(`fx-lampcone-${i}`)
  }));
  const pathRibbonHandles = Array.from({ length: PATH_RIBBON_COUNT }, (_, i) => req(`waymo-path-ribbon-${i}`));
  const beaconRingHandle = req("taxi-beacon-ring");
  const beaconDiscHandle = req("taxi-beacon-disc");
  const beaconBeamHandle = req("taxi-beacon-beam");
  const beaconCoreHandle = req("taxi-beacon-core");
  const passengerBodyHandle = req("taxi-passenger-body");
  const passengerHeadHandle = req("taxi-passenger-head");
  const passengerArmHandle = req("taxi-passenger-arm");
  const pedHandles = Array.from({ length: PED_COUNT }, (_, i) => ({
    body: req(`sf-ped-body-${i}`), head: req(`sf-ped-head-${i}`)
  }));
  const skidHandles = Array.from({ length: SKID_POOL }, (_, i) => req(`fx-skid-${i}`));
  const wearHandles = Array.from({ length: 8 }, (_, i) => req(`fx-wear-${i}`));
  const peerCarHandles = Array.from({ length: 5 }, (_, i) => req(`peer-car-${i}`));
  const peerApexLidarRing = req("peer-waymo-lidar-ring");
  const trafficHandles = Array.from({ length: 10 }, (_, i) => req(`traffic-${i}`));

  // ── Live simulation state (all reset by resetSession()) ──
  let framesRendered = 0;
  let simTime = 0;
  let activeCarId: PlayableCarId = "waymo";
  let autopilotLevel: AutopilotLevel = "L5";
  let weatherPreset: WeatherPreset = "night";
  let camMode: CamMode = 0;
  let useMph = true;
  let absOn = true, tcsOn = true, espOn = true;
  let paused = false;
  let introT = 0;
  const INTRO_LEN = 4.6;

  // Player kinematics — world Z decreases as we drive east down California St.
  let playerX = 3.4;
  let playerY = 0;
  let playerZ = 0;
  let playerSpeedMps = 14.5;
  let playerSteer = 0;
  let playerYaw = 0;
  let playerPitch = 0;
  let playerRoll = 0;
  let regenRatio = 0.22;
  let powerRatio = 0.44;
  let lastManualInputTime = -99;
  let airbornePrev = false;
  let trauma = 0;

  // Apex robotaxi fare state
  let fareIndex = 0;
  let rideState: RideLifecycleState = "offer";
  let rideStyle: RideStyle = "comfort";
  let totalEarningsUsd = 0;
  let completedRides = 0;
  let ratingAvg = 5.0;
  let comfortScore = 98;
  let streetBounty = 0;
  let streetMultiplier = 1.0;
  let surgeMult = 1.0;
  let beaconWorldZ = -115;
  let stateTimerSec = 0;
  let rideElapsedSec = 0;
  let lastBeaconColorMode: "pickup" | "dropoff" = "pickup";
  let skidIdx = 0;
  let skidCooldown = 0;
  let nearMissCooldown = 0;
  let bumpCooldown = 0;
  let curbContact = false;

  // Per-vehicle chassis simulators (distinct suspension/steering feel)
  const chassisByCar: Record<PlayableCarId, ReturnType<typeof createVehicleChassis>> = {
    waymo: createVehicleChassis(PLAYABLE_FLEET.waymo.chassis, streetSurface),
    cybercab: createVehicleChassis(PLAYABLE_FLEET.cybercab.chassis, streetSurface),
    cybertruck: createVehicleChassis(PLAYABLE_FLEET.cybertruck.chassis, streetSurface),
    corvette: createVehicleChassis(PLAYABLE_FLEET.corvette.chassis, streetSurface),
    roadster: createVehicleChassis(PLAYABLE_FLEET.roadster.chassis, streetSurface)
  };
  let chassis = chassisByCar.waymo;

  // ── Driver AI: L5 autopilot on the avenue route (progress = metres travelled) ──
  const ROUTE_LEN = 480;
  const headingForward = -Math.PI / 2; // heading 0 faces +X; we drive toward -Z
  const fareRoute: DriverRoute = {
    length: ROUTE_LEN,
    sample(progress) {
      const wz = -(progress * ROUTE_LEN + 6);
      // The line bends toward the kerb when a beacon is near that progress point.
      const dist = Math.abs(beaconWorldZ - wz);
      const pull = dist < 52 ? clamp(1 - dist / 52, 0, 1) : 0;
      const lane = lerp(targetLaneX, CURB_BEACON_X - 0.9, pull);
      return { x: lane, y: wz, heading: headingForward };
    },
    // Half of the drivable asphalt (two lanes + a parking lane each way).
    halfWidth: () => 6.8
  };
  let targetLaneX = 3.4;
  const driver = createVehicleDriverAi(fareRoute, {
    maxSpeed: 17.5,
    paceFraction: 0.94,
    lookAheadSeconds: 1.6,
    minLookAhead: 7,
    lineGain: 1.35,
    headingGain: 1.6,
    corneringAcceleration: 4.2,
    aggression: "cautious",
    seed: 20261017
  });
  const driverMax = createVehicleDriverAi(fareRoute, {
    maxSpeed: 24, paceFraction: 1, lookAheadSeconds: 1.15, minLookAhead: 8,
    lineGain: 1.7, headingGain: 1.9, corneringAcceleration: 6.5,
    aggression: "aggressive", seed: 7
  });
  // Traffic driver AIs (same-direction slots hold their lanes deterministically)
  const trafficRoute: DriverRoute = {
    length: ROUTE_LEN,
    sample(progress) {
      return { x: 0, y: -progress * ROUTE_LEN, heading: headingForward };
    },
    halfWidth: () => 6.8
  };
  const trafficDrivers = [0, 1, 2, 3].map((i) =>
    createVehicleDriverAi(trafficRoute, {
      maxSpeed: 12 + i * 1.6,
      paceFraction: 0.9,
      lookAheadSeconds: 1.4,
      aggression: i % 2 === 0 ? "cautious" : "balanced",
      seed: 40 + i
    })
  );

  // 5 multiplayer peers
  const peers: PeerDriverState[] = [
    { id: "peer-0", handle: "devon_ai", carLabel: "Apex Cruiser", piClass: "S 918", piColor: "#3fd6c6", accent: "#3fd6c6", laneX: 7.4, targetLaneX: 7.4, zOffset: -22, speed: 14.8, baseSpeed: 14.8, rideY: 0, yawOffset: 0, isCableCar: false, worldX: 7.4, worldZ: -22, distanceMeters: 23 },
    { id: "peer-1", handle: "kaya_sf", carLabel: "Cyber Coupe", piClass: "A 742", piColor: "#ffb347", accent: "#ffb347", laneX: -3.2, targetLaneX: -3.2, zOffset: -38, speed: 15.1, baseSpeed: 15.1, rideY: 0, yawOffset: 0, isCableCar: false, worldX: -3.2, worldZ: -38, distanceMeters: 38 },
    { id: "peer-2", handle: "elena_x", carLabel: "Apex Interceptor", piClass: "X 999", piColor: "#c45bff", accent: "#c45bff", laneX: 3.4, targetLaneX: 3.4, zOffset: -46, speed: 15.8, baseSpeed: 15.8, rideY: 0, yawOffset: 0, isCableCar: false, worldX: 3.4, worldZ: -46, distanceMeters: 46 },
    { id: "peer-3", handle: "sf_muni", carLabel: "Cable Car", piClass: "C 104", piColor: "#43d17a", accent: "#43d17a", laneX: -1.2, targetLaneX: -1.2, zOffset: -19, speed: 9.5, baseSpeed: 9.5, rideY: 0, yawOffset: Math.PI, isCableCar: true, worldX: -1.2, worldZ: -19, distanceMeters: 19 },
    { id: "peer-4", handle: "marcus_v8", carLabel: "Vortex GT", piClass: "S 990", piColor: "#ff5a1f", accent: "#ff5a1f", laneX: -7.6, targetLaneX: -7.6, zOffset: -31, speed: 15.6, baseSpeed: 15.6, rideY: 0, yawOffset: 0, isCableCar: false, worldX: -7.6, worldZ: -31, distanceMeters: 32 }
  ];

  const mpTagsContainer = document.getElementById("mpTags");
  const peerTagEls: HTMLElement[] = peers.map((peer, idx) => {
    const el = document.createElement("div");
    el.className = "mpTag";
    el.style.borderColor = peer.accent;
    el.style.color = peer.accent;
    el.innerHTML = `<b>@${peer.handle}</b><small>${peer.carLabel} · <span style="color:${peer.piColor}">${peer.piClass}</span></small><i id="mp-dist-${idx}">${peer.distanceMeters} m</i>`;
    el.addEventListener("click", () => teleportToPeer(idx));
    mpTagsContainer?.appendChild(el);
    return el;
  });

  // Pedestrian crowd state
  interface PedState { side: 1 | -1; x: number; z: number; speed: number; mode: "walk" | "wait" | "cross"; phase: number; }
  const peds: PedState[] = Array.from({ length: PED_COUNT }, (_, i) => ({
    side: i % 2 === 0 ? 1 : -1,
    x: i % 2 === 0 ? 15.2 : -15.2,
    z: -8 - i * 13,
    speed: 0.9 + hash01(i * 3.3) * 0.8,
    mode: i % 5 === 4 ? "cross" : "walk",
    phase: hash01(i * 7.7) * Math.PI * 2
  }));

  // 10 AI city traffic cars — same-direction slots 4-9 get real driver AI
  const trafficCars: TrafficCarState[] = Array.from({ length: 10 }, (_, i) => {
    const oncoming = i < 4;
    const laneX = oncoming ? AVENUE_LANES_X[i % 2]! : AVENUE_LANES_X[2 + (i % 2)]!;
    return {
      slotIdx: i,
      laneX,
      z: -22 - i * 24,
      speed: oncoming ? 13 + (i % 3) * 2.2 : 10.5 + (i % 4) * 1.8,
      direction: oncoming ? -1 : 1,
      phase: i * 1.3,
      ai: !oncoming,
      preferredOffset: laneX,
      throttle: 0, brake: 0, steer: 0
    };
  });

  // ── UI helpers (toast, popups, cards) ──
  let toastTimeout = 0;
  function showToast(title: string, subtitle: string): void {
    const toastEl = document.getElementById("toast");
    if (!toastEl) return;
    toastEl.innerHTML = `<span>${title}</span><small>${subtitle}</small>`;
    toastEl.classList.add("on");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toastEl.classList.remove("on"), 2600);
  }

  function pushPenaltyOrBonusPopup(title: string, detail: string, kind: "good" | "bad" | "nfs"): void {
    const penEl = document.getElementById("taxiPen");
    if (!penEl) return;
    const pop = document.createElement("div");
    pop.className = `pop ${kind}`;
    pop.innerHTML = `<b>${title}</b><small>${detail}</small>`;
    penEl.appendChild(pop);
    while (penEl.children.length > 2) penEl.firstElementChild?.remove();
    window.setTimeout(() => pop.remove(), 2400);
  }

  function updateBeaconColors(mode: "pickup" | "dropoff"): void {
    if (mode === lastBeaconColorMode) return;
    lastBeaconColorMode = mode;
    const col = mode === "pickup" ? "#3fd6c6" : "#ffb347";
    const coreCol = mode === "pickup" ? "#a5f3fc" : "#fde68a";
    beaconRingHandle.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 2.2 }));
    beaconDiscHandle.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 1.45 }));
    beaconBeamHandle.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 1.35 }));
    beaconCoreHandle.setMaterial(material.emissive({ color: "#ffffff", emissive: coreCol, emissiveIntensity: 2.4 }));
    for (const h of pathRibbonHandles) h.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 1.9 }));
  }

  function formatDist(meters: number): string {
    const d = Math.max(0, meters);
    if (useMph) {
      const feet = d * 3.28084;
      if (feet >= 528) return `${(d / 1609.34).toFixed(1)} mi`;
      return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
    }
    if (d >= 1000) return `${(d / 1000).toFixed(1)} km`;
    return `${Math.max(10, Math.round(d / 10) * 10)} m`;
  }
  function formatClock(sec: number): string {
    const s = Math.max(0, Math.ceil(Math.abs(sec)));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  function renderTaxiTotalDom(): void {
    const totalEl = document.getElementById("taxiTotal");
    if (totalEl) {
      totalEl.innerHTML = `<b>$${totalEarningsUsd.toLocaleString("en-US")}</b><small>${completedRides} rides · ★ ${ratingAvg.toFixed(2)} · Teleop Room #SF-401</small>`;
    }
    // Fleet unlock badges
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-car]").forEach((btn) => {
      const carId = (btn.dataset.car as PlayableCarId) || "waymo";
      const locked = totalEarningsUsd < PLAYABLE_FLEET[carId].unlockUsd;
      btn.classList.toggle("locked", locked);
      if (locked) btn.title = `Unlock at $${PLAYABLE_FLEET[carId].unlockUsd} earnings (currently $${totalEarningsUsd})`;
      else btn.title = PLAYABLE_FLEET[carId].name;
    });
  }

  function renderApexFareCards(distToBeacon: number): void {
    const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
    const cardEl = document.getElementById("taxiCard");
    const tripEl = document.getElementById("taxiTrip");
    const sumEl = document.getElementById("taxiSum");
    const hintEl = document.getElementById("taxiHint");

    const isOfferOrBoard = rideState === "offer" || rideState === "boarding";
    const isRideOrAlight = rideState === "ride" || rideState === "alighting";

    cardEl?.classList.toggle("on", isOfferOrBoard);
    tripEl?.classList.toggle("on", isRideOrAlight);
    tripEl?.classList.toggle("arc", rideStyle === "street");
    sumEl?.classList.toggle("on", rideState === "summary");

    if (hintEl) {
      const showHint = (isOfferOrBoard || isRideOrAlight) && distToBeacon < 36;
      hintEl.classList.toggle("on", showHint);
      if (showHint) {
        hintEl.textContent = rideState === "boarding"
          ? `Boarding ${fare.passenger} at kerb…`
          : rideState === "alighting"
            ? `Dropping off ${fare.passenger} at kerb…`
            : `${autopilotLevel.startsWith("L5") ? "L5 Autonomous Approach" : "Pull up to the glowing kerb"} · ${formatDist(distToBeacon)}`;
      }
    }

    if (isOfferOrBoard && cardEl) {
      const tagText = rideState === "boarding" ? "PICKING UP · KERB LOCKED" : `NEW APEX FARE · PICKUP → DROPOFF${surgeMult > 1 ? ` · SURGE ×${surgeMult}` : ""}`;
      const distText = rideState === "boarding" ? "boarding…" : formatDist(distToBeacon);
      cardEl.innerHTML = `
        <div class="tx-head">
          <div class="tg">${tagText}</div>
          <button type="button" class="style-toggle ${rideStyle === "street" ? "street" : ""}" data-toggle-style="1">
            ${rideStyle === "comfort" ? `Comfort ${Math.round(comfortScore)}%` : `Street Bounty ×${streetMultiplier.toFixed(1)}`}
          </button>
        </div>
        <div class="who">
          <i style="background:${fare.avatarColor}">${fare.passenger[0]}</i>
          <div><b>${fare.passenger}</b><small>“${fare.quote}”</small></div>
        </div>
        <div class="leg"><span class="dot p"></span><div><b>${fare.pickupName}</b><small>${fare.pickupStreet}</small></div><em>${distText}</em></div>
        <div class="leg"><span class="dot d"></span><div><b>${fare.dropoffName}</b><small>${fare.tripMiles.toFixed(1)} mi · Fare $${(fare.fareUsd * surgeMult).toFixed(2)}</small></div><em style="color:#ffb347">DROPOFF</em></div>
      `;
    }

    if (isRideOrAlight && tripEl) {
      const timeLeft = Math.max(0, fare.parSec - rideElapsedSec);
      const distText = rideState === "alighting" ? "arrived" : formatDist(distToBeacon);
      const barRatio = rideStyle === "comfort" ? clamp(comfortScore / 100, 0.1, 1) : clamp((streetMultiplier - 1) / 4, 0.25, 1);
      tripEl.innerHTML = `
        <div class="tx-head">
          <div class="tg">ACTIVE TRIP · PICKUP → DROPOFF${surgeMult > 1 ? ` · ×${surgeMult}` : ""}</div>
          <button type="button" class="style-toggle ${rideStyle === "street" ? "street" : ""}" data-toggle-style="1">
            ${rideStyle === "comfort" ? "Comfort Mode" : `Street Bounty ×${streetMultiplier.toFixed(1)}`}
          </button>
        </div>
        <div class="dst"><span class="dot d"></span><div><b>${fare.dropoffName}</b><small>${fare.dropoffStreet} · Passenger: ${fare.passenger}</small></div><em style="font-family:var(--font-code);font-size:11px;color:#3fd6c6;font-style:normal">${fare.pickupName.split("·")[0]?.trim()} →</em></div>
        <div class="row">
          <div><small>DISTANCE</small><b>${distText}</b></div>
          <div><small>TIME LEFT</small><b>${formatClock(timeLeft)}</b></div>
          <div><small>FARE</small><b>$${(fare.fareUsd * surgeMult).toFixed(2)}</b></div>
        </div>
        <div class="cf">
          <small>${rideStyle === "comfort" ? `${fare.passenger.toUpperCase()} · COMFORT` : "STREET BOUNTY"}</small>
          <div class="bar"><i style="transform:scaleX(${barRatio.toFixed(3)})"></i></div>
          <b>${rideStyle === "comfort" ? `${Math.round(comfortScore)}%` : `${streetBounty.toLocaleString()} ×${streetMultiplier.toFixed(1)}`}</b>
        </div>
      `;
    }

    if (rideState === "summary" && sumEl) {
      const tipUsd = rideStyle === "comfort" ? 6.5 : 9.0;
      const earned = Math.round((fare.fareUsd * surgeMult) + tipUsd);
      sumEl.innerHTML = `
        <div class="tg">RIDE COMPLETE · APEX TELEOP</div>
        <div class="st">★★★★★</div>
        <div class="who2">${fare.passenger} · ${fare.pickupName} → ${fare.dropoffName}</div>
        <div class="ln"><span>Base Fare${surgeMult > 1 ? ` (×${surgeMult} surge)` : ""}</span><b>$${(fare.fareUsd * surgeMult).toFixed(2)}</b></div>
        <div class="ln"><span>${rideStyle === "comfort" ? `Comfort Tip (${Math.round(comfortScore)}%)` : `Street Bounty Bonus (×${streetMultiplier.toFixed(1)})`}</span><b style="color:#43d17a">+$${tipUsd.toFixed(2)}</b></div>
        <div class="tot"><span>EARNED</span><b>$${earned.toFixed(2)}</b></div>
      `;
    }

    document.querySelectorAll<HTMLButtonElement>("[data-toggle-style]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        rideStyle = rideStyle === "comfort" ? "street" : "comfort";
        if (rideStyle === "street") pushPenaltyOrBonusPopup("STREET BOUNTY ×3.0", "Near-miss & speed multiplier active", "nfs");
        else pushPenaltyOrBonusPopup("COMFORT 98% MODE", "Smooth autonomous deceleration & tip bonus", "good");
        dispatch("ride-style", rideStyle === "street" ? "Street bounty mode armed" : "Comfort mode armed", "info", [rideStyle]);
        renderApexFareCards(distToBeacon);
      };
    });
  }

  function awardRidePayout(fare: FareScenario, reason: string): number {
    const tipUsd = rideStyle === "comfort" ? 6.5 : 9.0;
    const latePenalty = rideElapsedSec > fare.parSec ? Math.min(0.25, (rideElapsedSec - fare.parSec) / fare.parSec * 0.5) : 0;
    const comfortBonus = rideStyle === "comfort" && comfortScore >= 95 ? 1.1 : 1;
    const earned = Math.round(((fare.fareUsd * surgeMult) * (1 - latePenalty) * comfortBonus) + tipUsd);
    totalEarningsUsd += earned;
    completedRides += 1;
    const stars = latePenalty > 0.15 ? 4.7 : 5.0;
    ratingAvg = Number(((ratingAvg * completedRides + stars) / (completedRides + 1)).toFixed(2));
    renderTaxiTotalDom();
    cue("cash");
    dispatch("fare-complete", `${reason} +$${earned}`, "success", [fare.passenger, surgeMult > 1 ? `surge ×${surgeMult}` : "standard"]);
    checkUnlocks();
    return earned;
  }

  function checkUnlocks(): void {
    for (const id of PLAYABLE_IDS) {
      const spec = PLAYABLE_FLEET[id];
      if (spec.unlockUsd > 0 && totalEarningsUsd >= spec.unlockUsd && totalEarningsUsd - 200 < spec.unlockUsd) {
        dispatch("unlock", `${spec.name} unlocked`, "success", [`$${spec.unlockUsd} milestone`]);
        showToast(`Unlocked: ${spec.name}`, spec.maker);
      }
    }
  }

  function advanceApexFareStage(): void {
    const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
    if (rideState === "offer" || rideState === "boarding") {
      rideState = "ride";
      rideElapsedSec = 0;
      beaconWorldZ = playerZ - 165;
      updateBeaconColors("dropoff");
      pushPenaltyOrBonusPopup(`${fare.passenger} Aboard`, `En route to ${fare.dropoffName}`, "good");
      dispatch("fare-boarded", `${fare.passenger} aboard`, "info", [fare.dropoffName]);
      cue("chime");
    } else if (rideState === "ride" || rideState === "alighting") {
      const earned = awardRidePayout(fare, "Ride complete");
      fareIndex = (fareIndex + 1) % WAYMO_FARES.length;
      rideState = "offer";
      beaconWorldZ = playerZ - 125;
      updateBeaconColors("pickup");
      const nextFare = WAYMO_FARES[fareIndex]!;
      showToast(`Earned +$${earned} · Next Fare`, `${nextFare.passenger} at ${nextFare.pickupName}`);
    } else {
      rideState = "offer";
      beaconWorldZ = playerZ - 110;
      updateBeaconColors("pickup");
    }
    renderApexFareCards(Math.max(0, playerZ - beaconWorldZ));
  }

  function selectPlayableVehicle(carId: PlayableCarId): void {
    const spec = PLAYABLE_FLEET[carId];
    if (totalEarningsUsd < spec.unlockUsd) {
      showToast(`${spec.name} locked`, `Earn $${spec.unlockUsd} in fares to unlock`);
      cue("beep");
      return;
    }
    activeCarId = carId;
    chassis = chassisByCar[carId];
    chassis.reset({ x: playerX, z: playerZ, heading: headingForward, speed: playerSpeedMps, steer: 0 });
    initSpeedometerDial(spec.isIce);
    const gmodeEl = document.getElementById("gmode");
    if (gmodeEl) gmodeEl.textContent = spec.modeLabel;
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-car]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.car === carId);
    });
    showToast(`Switched Vehicle: ${spec.name}`, `${spec.maker} · ${spec.modeLabel}`);
    dispatch("vehicle", spec.name, "info", [spec.maker]);
  }

  function cycleAutopilotLevel(): void {
    const order: AutopilotLevel[] = ["L5", "L5 MAX", "MAN", "L3", "L4"];
    setAutopilotLevel(order[(order.indexOf(autopilotLevel) + 1) % order.length]!);
  }

  function setAutopilotLevel(level: AutopilotLevel): void {
    autopilotLevel = level;
    const aDA = document.getElementById("aDA");
    const aDAl = document.getElementById("aDAl");
    const dockBtn = document.getElementById("dockAutopilotBtn");
    if (aDAl) aDAl.textContent = level;
    if (aDA) {
      aDA.classList.toggle("drive", level === "L5" || level === "L5 MAX" || level === "L4");
      aDA.classList.toggle("boost", level === "L5 MAX");
      aDA.classList.toggle("take", level === "MAN");
    }
    if (dockBtn) {
      dockBtn.textContent =
        level === "L5" ? "L5 Self-Driving"
          : level === "L5 MAX" ? "L5 Mad Max"
            : level === "L4" ? "L4 Lane Cruise"
              : level === "L3" ? "L3 Guidance"
                : "Manual Override";
      dockBtn.classList.toggle("active", level !== "MAN");
    }
    dispatch("assist", `Driver assist ${level}`, "info", [level.startsWith("L5") ? "driver-ai active" : "manual blend"]);
    showToast(`Driver Assist: ${level}`, level.startsWith("L5") ? "Autonomous Apex route & kerb stops active" : "Use W/A/S/D or Arrows to drive");
  }

  function setCameraMode(mode: CamMode): void {
    camMode = mode;
    const names = ["Chase Cam", "Far Chase Cam", "Roof LiDAR Sensor Cam", "Front Bumper Cam", "Passenger Cabin Cam"];
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-cam]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.cam) === mode);
    });
    showToast(names[mode]!, "Press C to cycle camera views");
  }

  const atmosphere = (auraApp as unknown as { atmosphere?: {
    setSky(spec: Record<string, unknown>, o?: { transitionSeconds?: number }): void;
    setFog(spec: Record<string, unknown> | null, o?: { transitionSeconds?: number }): void;
    setWetness(v: number, o?: { transitionSeconds?: number }): void;
  } }).atmosphere;

  function setWeatherPreset(preset: WeatherPreset): void {
    weatherPreset = preset;
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-tod]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tod === preset);
    });
    const label = preset === "night" ? "San Francisco Neon Night" : preset === "golden" ? "California Golden Hour" : preset === "fog" ? "Karl the Fog · Marine Layer" : "Bay Drizzle · Wet Asphalt";
    // Atmosphere runtime: the look still owns the base grade; we bend fog/sky/wetness.
    try {
      if (preset === "fog") {
        atmosphere?.setFog({ density: 0.055, color: "#9fb4cc", heightFalloff: 0.8 } as never, { transitionSeconds: 1.2 });
        atmosphere?.setWetness(0.35, { transitionSeconds: 1.2 });
      } else if (preset === "drizzle") {
        atmosphere?.setFog({ density: 0.028, color: "#5f7896" } as never, { transitionSeconds: 1.2 });
        atmosphere?.setWetness(1.0, { transitionSeconds: 1.4 });
      } else if (preset === "golden") {
        atmosphere?.setSky({ horizonColor: "#fb923c", zenithColor: "#7c3f61", groundColor: "#1c1216" } as never, { transitionSeconds: 1.6 });
        atmosphere?.setFog({ density: 0.014, color: "#d99a66" } as never, { transitionSeconds: 1.6 });
        atmosphere?.setWetness(0.15, { transitionSeconds: 1.6 });
      } else {
        atmosphere?.setSky({ horizonColor: "#1a2b45", zenithColor: "#05070e", groundColor: "#05070e" } as never, { transitionSeconds: 1.6 });
        atmosphere?.setFog({ density: 0.02, color: "#3d5578" } as never, { transitionSeconds: 1.6 });
        atmosphere?.setWetness(0.55, { transitionSeconds: 1.6 });
      }
    } catch { /* atmosphere lane optional */ }
    dispatch("weather", label, "info", [preset]);
    showToast(label, "Shared with Teleop Room #SF-401");
  }

  function teleportToPeer(peerIdx: number): void {
    const peer = peers[peerIdx];
    if (!peer) return;
    playerX = clamp(peer.laneX, -7.6, 7.6);
    peer.zOffset = -18;
    showToast(`Driving with @${peer.handle}`, `${peer.carLabel} · ${peer.piClass} in Room #SF-401`);
    dispatch("peer-teleport", `Joined @${peer.handle}`, "info", [peer.carLabel]);
  }

  function renderMultiplayerRoomList(): void {
    const listEl = document.getElementById("mpPeerList");
    if (!listEl) return;
    const spec = PLAYABLE_FLEET[activeCarId];
    let html = `<li class="me"><b style="color:#3fd6c6">@you_teleop (You)</b><small>${spec.name}</small></li>`;
    peers.forEach((peer, idx) => {
      html += `<li><b>@${peer.handle}</b><small>${peer.carLabel} · ${peer.distanceMeters} m</small><button type="button" data-goto-peer="${idx}">Go to</button></li>`;
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll<HTMLButtonElement>("[data-goto-peer]").forEach((btn) => {
      btn.onclick = () => teleportToPeer(Number(btn.dataset.gotoPeer ?? 0));
    });
  }

  // Pause shell
  const shellEl = document.getElementById("shell");
  function setPaused(p: boolean): void {
    paused = p;
    shellEl?.classList.toggle("on", p);
    const t = document.getElementById("shellTitle");
    if (t) t.textContent = p ? "Paused" : "Grid Dispatch";
    const e = document.getElementById("shellEarn"); if (e) e.textContent = `$${totalEarningsUsd.toLocaleString()}`;
    const r = document.getElementById("shellRides"); if (r) r.textContent = String(completedRides);
    const ra = document.getElementById("shellRating"); if (ra) ra.textContent = ratingAvg.toFixed(2);
    const b = document.getElementById("shellBounty"); if (b) b.textContent = String(Math.round(streetBounty));
    if (p) auraApp.pause(); else auraApp.resume();
  }

  function resetSession(): void {
    // Full deterministic reset — gameplay, peers, traffic, peds, skids, DOM.
    simTime = 0; framesRendered = 0; introT = INTRO_LEN; trauma = 0;
    playerX = 3.4; playerY = 0; playerZ = 0; playerSpeedMps = 14.5;
    playerSteer = 0; playerYaw = 0; playerPitch = 0; playerRoll = 0;
    fareIndex = 0; rideState = "offer"; rideStyle = "comfort";
    totalEarningsUsd = 0; completedRides = 0; ratingAvg = 5.0;
    comfortScore = 98; streetBounty = 0; streetMultiplier = 1.0; surgeMult = 1.0;
    beaconWorldZ = -115; stateTimerSec = 0; rideElapsedSec = 0; lastBeaconColorMode = "pickup";
    skidIdx = 0; skidCooldown = 0; nearMissCooldown = 0; bumpCooldown = 0; curbContact = false;
    lastManualInputTime = -99; airbornePrev = false;
    trafficCars.forEach((tc, i) => {
      const oncoming = i < 4;
      tc.laneX = oncoming ? AVENUE_LANES_X[i % 2]! : AVENUE_LANES_X[2 + (i % 2)]!;
      tc.z = -22 - i * 24;
      tc.speed = oncoming ? 13 + (i % 3) * 2.2 : 10.5 + (i % 4) * 1.8;
      tc.throttle = 0; tc.brake = 0; tc.steer = 0;
    });
    peers.forEach((peer, i) => {
      peer.zOffset = [-22, -38, -46, -19, -31][i] ?? -30;
      peer.distanceMeters = Math.abs(peer.zOffset);
    });
    peds.forEach((ped, i) => { ped.z = -8 - i * 13; ped.mode = i % 5 === 4 ? "cross" : "walk"; });
    skidHandles.forEach((h) => h.setPosition(0, -40, 0));
    for (const id of PLAYABLE_IDS) chassisByCar[id].reset({ x: 3.4, z: 0, heading: headingForward, speed: 0, steer: 0 });
    dispatchLog.clear();
    updateBeaconColors("pickup");
    initSpeedometerDial(PLAYABLE_FLEET[activeCarId].isIce);
    renderTaxiTotalDom();
    renderApexFareCards(115);
    renderDispatch();
    dispatch("session", "Session reset — back to Nob Hill", "info", ["deterministic"]);
    if (paused) setPaused(false);
    showToast("Session Reset", "California Street · Nob Hill");
  }

  function bindGridDispatchUI(): void {
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-car]").forEach((btn) => {
      btn.addEventListener("click", () => selectPlayableVehicle((btn.dataset.car as PlayableCarId) || "waymo"));
    });
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-cam]").forEach((btn) => {
      btn.addEventListener("click", () => setCameraMode(clamp(Number(btn.dataset.cam ?? 0), 0, 4) as CamMode));
    });
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-tod]").forEach((btn) => {
      btn.addEventListener("click", () => setWeatherPreset((btn.dataset.tod as WeatherPreset) || "night"));
    });
    document.getElementById("dockAutopilotBtn")?.addEventListener("click", () => cycleAutopilotLevel());
    document.getElementById("aDA")?.addEventListener("click", () => cycleAutopilotLevel());
    document.getElementById("bNextFare")?.addEventListener("click", () => advanceApexFareStage());
    document.getElementById("bPause")?.addEventListener("click", () => setPaused(!paused));
    document.getElementById("bReset")?.addEventListener("click", () => resetSession());
    document.getElementById("shellResume")?.addEventListener("click", () => setPaused(false));
    document.getElementById("shellReset")?.addEventListener("click", () => resetSession());
    document.getElementById("setRM")?.addEventListener("change", (e) => { a11yState.reducedMotion = (e.target as HTMLInputElement).checked; applyA11y(); });
    document.getElementById("setRF")?.addEventListener("change", (e) => { a11yState.reducedFlash = (e.target as HTMLInputElement).checked; applyA11y(); });
    document.getElementById("setHC")?.addEventListener("change", (e) => { a11yState.highContrast = (e.target as HTMLInputElement).checked; applyA11y(); });
    document.getElementById("setMute")?.addEventListener("change", (e) => {
      audioMuted = (e.target as HTMLInputElement).checked;
      audio.setMuted(audioMuted);
    });
    document.getElementById("unit")?.addEventListener("click", () => {
      useMph = !useMph;
      const unitEl = document.getElementById("unit");
      if (unitEl) unitEl.textContent = useMph ? "MPH" : "KM/H";
    });
    document.getElementById("aABS")?.addEventListener("click", (e) => {
      absOn = !absOn;
      (e.currentTarget as HTMLElement).classList.toggle("act", absOn);
      (e.currentTarget as HTMLElement).classList.toggle("off", !absOn);
    });
    document.getElementById("aTCS")?.addEventListener("click", (e) => {
      tcsOn = !tcsOn;
      (e.currentTarget as HTMLElement).classList.toggle("act", tcsOn);
      (e.currentTarget as HTMLElement).classList.toggle("off", !tcsOn);
    });
    document.getElementById("aESP")?.addEventListener("click", (e) => {
      espOn = !espOn;
      (e.currentTarget as HTMLElement).classList.toggle("act", espOn);
      (e.currentTarget as HTMLElement).classList.toggle("off", !espOn);
    });
    const mpPanel = document.getElementById("mpPanel");
    document.getElementById("mpChip")?.addEventListener("click", () => {
      renderMultiplayerRoomList();
      mpPanel?.classList.toggle("on");
    });
    document.getElementById("mpCloseBtn")?.addEventListener("click", () => mpPanel?.classList.remove("on"));
    document.getElementById("mpCopyBtn")?.addEventListener("click", () => showToast("Invite Link Copied", "https://aura3d.auraone.ai/apps/showcase-teleoperator-v2/?room=SF-401"));
    let nextPeerFocus = 0;
    document.getElementById("mpCyclePeerBtn")?.addEventListener("click", () => { teleportToPeer(nextPeerFocus % peers.length); nextPeerFocus += 1; });
    document.getElementById("mini")?.addEventListener("click", () => { teleportToPeer(nextPeerFocus % peers.length); nextPeerFocus += 1; });
  }

  // Vector minimap
  const miniCanvas = document.getElementById("miniC") as HTMLCanvasElement | null;
  const miniCtx = miniCanvas?.getContext("2d") ?? null;

  function renderVectorMinimap(distToBeacon: number): void {
    if (!miniCtx || !miniCanvas) return;
    const w = miniCanvas.width;
    const h = miniCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.58;
    const scale = 2.1;

    miniCtx.clearRect(0, 0, w, h);
    miniCtx.fillStyle = "#0a0d14";
    miniCtx.fillRect(0, 0, w, h);
    miniCtx.fillStyle = "#0c2d48";
    miniCtx.beginPath();
    miniCtx.moveTo(w * 0.72, 0); miniCtx.lineTo(w, 0); miniCtx.lineTo(w, h * 0.48);
    miniCtx.closePath(); miniCtx.fill();

    const scrollOffsetPx = ((-playerZ * scale) % 96 + 96) % 96;
    for (let row = -3; row <= 4; row++) {
      const by = cy + row * 96 + scrollOffsetPx - 42;
      for (let col = -3; col <= 3; col++) {
        if (col === 0) continue;
        const bx = cx + col * 68 - (col > 0 ? 22 : 42) - playerX * scale;
        const isPark = (row + col) % 4 === 0;
        miniCtx.fillStyle = isPark ? "#143326" : "#131a26";
        miniCtx.strokeStyle = "rgba(255,255,255,0.08)";
        miniCtx.lineWidth = 1;
        miniCtx.fillRect(bx, by, 54, 72);
        miniCtx.strokeRect(bx, by, 54, 72);
      }
    }

    const roadCenterX = cx - playerX * scale;
    miniCtx.fillStyle = "#232f42";
    miniCtx.fillRect(roadCenterX - 22, 0, 44, h);
    for (let row = -3; row <= 4; row++) {
      const iy = cy + row * 96 + scrollOffsetPx;
      miniCtx.fillStyle = "#1f2836";
      miniCtx.fillRect(0, iy - 12, w, 24);
    }

    // Surge zones
    for (const zone of SURGE_ZONES) {
      const zy0 = cy + (zone.z0 - playerZ) * scale;
      const zy1 = cy + (zone.z1 - playerZ) * scale;
      miniCtx.fillStyle = "rgba(255,179,71,0.16)";
      miniCtx.fillRect(roadCenterX - 22, Math.min(zy0, zy1), 44, Math.abs(zy1 - zy0));
    }

    const beaconScreenX = roadCenterX + CURB_BEACON_X * scale;
    const beaconScreenY = clamp(cy - distToBeacon * scale, 26, h - 26);
    const routeColor = rideState === "offer" || rideState === "boarding" ? "#3fd6c6" : "#ffb347";
    miniCtx.strokeStyle = routeColor;
    miniCtx.lineWidth = 4.5;
    miniCtx.beginPath();
    miniCtx.moveTo(cx, cy);
    miniCtx.quadraticCurveTo(cx, (cy + beaconScreenY) * 0.5, beaconScreenX, beaconScreenY);
    miniCtx.stroke();

    miniCtx.fillStyle = routeColor;
    miniCtx.beginPath();
    miniCtx.arc(beaconScreenX, beaconScreenY, 11, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.fillStyle = "#061412";
    miniCtx.font = '600 12px "DIN Pro", sans-serif';
    miniCtx.textAlign = "center";
    miniCtx.textBaseline = "middle";
    miniCtx.fillText(rideState === "offer" || rideState === "boarding" ? "P" : "D", beaconScreenX, beaconScreenY + 0.5);

    for (const tc of trafficCars) {
      const tx = roadCenterX + tc.laneX * scale;
      const ty = cy + (tc.z - playerZ) * scale;
      if (ty < 8 || ty > h - 8) continue;
      miniCtx.fillStyle = tc.ai ? "#94a3b8" : "#64748b";
      miniCtx.beginPath();
      miniCtx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      miniCtx.fill();
    }

    for (const peer of peers) {
      const px = roadCenterX + peer.laneX * scale;
      const py = cy + peer.zOffset * scale;
      if (py < 12 || py > h - 12) continue;
      miniCtx.save();
      miniCtx.translate(px, py);
      miniCtx.fillStyle = peer.accent;
      miniCtx.beginPath();
      miniCtx.moveTo(0, -7); miniCtx.lineTo(5.5, 6); miniCtx.lineTo(0, 3.5); miniCtx.lineTo(-5.5, 6);
      miniCtx.closePath(); miniCtx.fill();
      miniCtx.restore();
    }

    miniCtx.save();
    miniCtx.translate(cx, cy);
    miniCtx.rotate(-playerYaw);
    miniCtx.fillStyle = "rgba(63, 214, 198, 0.28)";
    miniCtx.beginPath(); miniCtx.arc(0, 0, 14, 0, Math.PI * 2); miniCtx.fill();
    miniCtx.fillStyle = "#ffffff";
    miniCtx.strokeStyle = "#071018";
    miniCtx.lineWidth = 2;
    miniCtx.beginPath();
    miniCtx.moveTo(0, -10); miniCtx.lineTo(7.5, 8); miniCtx.lineTo(0, 4.5); miniCtx.lineTo(-7.5, 8);
    miniCtx.closePath(); miniCtx.fill(); miniCtx.stroke();
    miniCtx.restore();
  }

  // Init UI
  initSpeedometerDial(false);
  bindGridDispatchUI();
  renderTaxiTotalDom();
  renderApexFareCards(115);
  renderMultiplayerRoomList();
  setWeatherPreset("night");
  dispatch("boot", "Grid Dispatch V2 online — Room #SF-401", "success", ["Aura3D 4.0.1"]);
  document.getElementById("introTitle")?.classList.add("on");
  window.setTimeout(() => document.getElementById("introTitle")?.classList.remove("on"), 4200);

  // Cinematic intro sweep — Golden-Gate-style crane pass into the chase cam.
  const introPath = createCameraPathFromPreset({
    id: "intro-sweep",
    presetId: "establishing",
    startTime: 0,
    endTime: INTRO_LEN,
    subjectPosition: [0, 1.4, -4]
  });

  playerCarHandles.cybertruck.setMaterial(material.pbr({ color: "#cbd5e1", metalness: 0.8, roughness: 0.22 }));
  peerCarHandles[1]?.setMaterial(material.pbr({ color: "#e8c27a", metalness: 0.65, roughness: 0.26 }));

  let lastHudDomUpdateSec = -1;
  let lastSignalPhase = -1;

  auraApp.onFrame(({ dt }) => {
    touchControls?.update();
    const safeDt = clamp(dt || 1 / 60, 0.001, 0.05);
    if (paused) return;
    const simDt = feel.effectiveDt(safeDt * 1000) / 1000;
    feel.update(safeDt * 1000);
    framesRendered += 1;
    simTime += simDt;

    const spec = PLAYABLE_FLEET[activeCarId];
    input.update(simDt);
    const throttleHeld = input.held("throttle");
    const brakeHeld = input.held("brake");
    const boostHeld = input.held("boost");
    const driftHeld = input.held("drift");
    const steerAxis = input.axis("steer");

    // Deterministic action edges
    if (input.pressed("assist")) cycleAutopilotLevel();
    if (input.pressed("cameraMode")) setCameraMode(((camMode + 1) % 5) as CamMode);
    if (input.pressed("weather")) {
      const order: WeatherPreset[] = ["night", "golden", "fog", "drizzle"];
      setWeatherPreset(order[(order.indexOf(weatherPreset) + 1) % order.length]!);
    }
    if (input.pressed("units")) {
      useMph = !useMph;
      const unitEl = document.getElementById("unit");
      if (unitEl) unitEl.textContent = useMph ? "MPH" : "KM/H";
    }
    if (input.pressed("interact")) advanceApexFareStage();
    if (input.pressed("reset")) resetSession();
    if (input.pressed("pause")) setPaused(!paused);
    for (let i = 0; i < 5; i++) if (input.pressed(`car${i + 1}`)) selectPlayableVehicle(PLAYABLE_IDS[i]!);
    if (throttleHeld || brakeHeld || Math.abs(steerAxis) > 0.15 || driftHeld) lastManualInputTime = simTime;
    if (introT < INTRO_LEN && (throttleHeld || Math.abs(steerAxis) > 0.3)) introT = INTRO_LEN; // skip intro

    const manualActive = autopilotLevel === "MAN" || simTime - lastManualInputTime < 3.5;

    // ── 1. Fare lifecycle + L5 driver-AI navigation ──
    const distToBeacon = Math.max(0, playerZ - beaconWorldZ);
    let targetSpeedMps = autopilotLevel === "L5 MAX" ? 21.5 : 15.2;
    let brakeCueActive = false;
    let driverBrake = 0;
    let driverThrottle = 0;

    if (rideState === "offer") {
      updateBeaconColors("pickup");
      if (distToBeacon < 46) targetLaneX = CURB_BEACON_X - 0.9;
      else targetLaneX = Math.sin(simTime * 0.35) > 0.35 ? 7.4 : 3.4;
      if (distToBeacon < 24) targetSpeedMps = clamp(distToBeacon * 0.55, 2.2, 12.0);
      if (distToBeacon < 4.2) {
        rideState = "boarding";
        stateTimerSec = 0;
        targetSpeedMps = 0;
        const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
        pushPenaltyOrBonusPopup(`Picking up ${fare.passenger}`, fare.pickupName, "good");
        dispatch("fare-pickup", `Kerb pickup: ${fare.passenger}`, "info", [fare.pickupName]);
        cue("chime");
      }
    } else if (rideState === "boarding") {
      targetLaneX = CURB_BEACON_X - 0.9;
      targetSpeedMps = 0;
      stateTimerSec += simDt;
      if (stateTimerSec >= 1.6) {
        rideState = "ride";
        rideElapsedSec = 0;
        beaconWorldZ = playerZ - 165;
        updateBeaconColors("dropoff");
        const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
        pushPenaltyOrBonusPopup(`${fare.passenger} Aboard`, `Destination: ${fare.dropoffName}`, "good");
        dispatch("fare-boarded", `${fare.passenger} aboard`, "success", [fare.dropoffName, `par ${fare.parSec}s`]);
        cue("bell");
      }
    } else if (rideState === "ride") {
      updateBeaconColors("dropoff");
      rideElapsedSec += simDt;
      if (distToBeacon < 46) targetLaneX = CURB_BEACON_X - 0.9;
      else targetLaneX = Math.sin(simTime * 0.35) > 0.35 ? 7.4 : 3.4;
      if (distToBeacon < 24) targetSpeedMps = clamp(distToBeacon * 0.55, 2.2, 12.5);
      if (distToBeacon < 4.2) {
        rideState = "alighting";
        stateTimerSec = 0;
        targetSpeedMps = 0;
      }
    } else if (rideState === "alighting") {
      targetLaneX = CURB_BEACON_X - 0.9;
      targetSpeedMps = 0;
      stateTimerSec += simDt;
      if (stateTimerSec >= 1.4) {
        const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
        awardRidePayout(fare, "Ride complete");
        rideState = "summary";
        stateTimerSec = 0;
      }
    } else if (rideState === "summary") {
      stateTimerSec += simDt;
      targetSpeedMps = 13.5;
      targetLaneX = 3.4;
      if (stateTimerSec >= 2.6) {
        fareIndex = (fareIndex + 1) % WAYMO_FARES.length;
        rideState = "offer";
        beaconWorldZ = playerZ - 135;
        updateBeaconColors("pickup");
        const nextFare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
        dispatch("fare-offer", `New fare: ${nextFare.passenger}`, "info", [nextFare.pickupName]);
        cue("beep");
      }
    }

    // Surge zones — fares pay extra while inside a demand polygon.
    const zone = SURGE_ZONES.find((sz) => playerZ <= sz.z0 && playerZ >= sz.z1);
    const newSurge = zone?.mult ?? 1;
    if (newSurge !== surgeMult) {
      surgeMult = newSurge;
      const surgeEl = document.getElementById("surge");
      if (surgeEl) {
        surgeEl.textContent = zone ? `SURGE ×${zone.mult.toFixed(2)} · ${zone.name}` : "";
        surgeEl.classList.toggle("on", Boolean(zone));
      }
      if (zone) dispatch("surge", `Surge ×${zone.mult} — ${zone.name}`, "warning", ["pricing"]);
    }

    // Driver AI decides throttle/brake/steer along the fare route.
    const driverState: DriverVehicleState = {
      progress: ((Math.max(0, -playerZ) % ROUTE_LEN) + ROUTE_LEN) % ROUTE_LEN / ROUTE_LEN,
      speed: playerSpeedMps,
      heading: headingForward - playerYaw,
      signedTrackOffset: playerX - targetLaneX,
      position: { x: playerX, y: playerZ },
      offTrack: Math.abs(playerX) > 10.6,
      preferredSignedOffset: 0
    };
    const ai = autopilotLevel === "L5 MAX" ? driverMax : driver;
    const decision = ai.decide(simDt, driverState);
    if (!manualActive) {
      // Blend driver output with the lifecycle's kerb-stop speed gating.
      const aiTarget = clamp(decision.throttle * (autopilotLevel === "L5 MAX" ? 24 : 17.5) - decision.brake * 20, 0, 99);
      targetSpeedMps = Math.min(targetSpeedMps, aiTarget < 2 ? targetSpeedMps : aiTarget + 2.5);
      driverThrottle = decision.throttle;
      driverBrake = decision.brake;
      const dx = targetLaneX - playerX;
      playerSteer = clamp(decision.steer * 0.5 + dx * 0.22, -0.65, 0.65);
      playerX = lerp(playerX, targetLaneX + decision.steer * 0.4, simDt * 3.1);
      const speedDiff = targetSpeedMps - playerSpeedMps;
      playerSpeedMps = clamp(
        playerSpeedMps + clamp(speedDiff * 2.6, -16, spec.accel) * simDt,
        0,
        spec.maxSpeedMps
      );
      powerRatio = clamp((playerSpeedMps / spec.maxSpeedMps) * 0.85 + Math.max(0, speedDiff * 0.04), 0.04, 0.96);
      regenRatio = speedDiff < -0.6 ? clamp(-speedDiff * 0.16, 0.25, 0.95) : 0.22;
    } else {
      const steerInput = steerAxis;
      playerSteer = lerp(playerSteer, steerInput, simDt * 7.5);
      playerX = clamp(playerX + playerSteer * Math.max(4, playerSpeedMps * 0.55) * simDt, -9.4, 9.4);
      if (throttleHeld) {
        const top = boostHeld ? spec.maxSpeedMps * 1.18 : spec.maxSpeedMps;
        playerSpeedMps = Math.min(top, playerSpeedMps + spec.accel * simDt);
        powerRatio = clamp(playerSpeedMps / spec.maxSpeedMps + (boostHeld ? 0.25 : 0.12), 0.15, 1);
        regenRatio = boostHeld ? 0.92 : 0.08;
      } else if (brakeHeld) {
        playerSpeedMps = Math.max(0, playerSpeedMps - 26 * simDt);
        powerRatio = 0.05;
        regenRatio = 0.88;
      } else {
        playerSpeedMps = Math.max(0, playerSpeedMps - 4.8 * simDt);
        powerRatio = clamp((playerSpeedMps / spec.maxSpeedMps) * 0.6, 0.04, 0.7);
        regenRatio = playerSpeedMps > 2 ? 0.54 : 0.12;
      }
      if (playerZ < beaconWorldZ - 12) beaconWorldZ = playerZ - 125;
    }

    // L3 brake cue + lane assist weave around slower traffic
    for (const tc of trafficCars) {
      if (tc.direction === 1) {
        const dz = playerZ - tc.z;
        if (dz > 0 && dz < 22 && Math.abs(tc.laneX - playerX) < 2.1) {
          if (autopilotLevel === "L3") brakeCueActive = true;
          if (!manualActive && distToBeacon > 38) targetLaneX = tc.laneX > 5 ? 3.4 : 7.4;
          // Near-miss street bounty
          if (rideStyle === "street" && dz < 8 && nearMissCooldown <= 0) {
            nearMissCooldown = 2.2;
            streetBounty += Math.round(140 * streetMultiplier);
            streetMultiplier = Math.min(5, streetMultiplier + 0.15);
            pushPenaltyOrBonusPopup(`Near Miss +${Math.round(140 * streetMultiplier)}`, `×${streetMultiplier.toFixed(1)} street bounty`, "nfs");
            camPunch(0.35);
            cue("whoosh");
            dispatch("near-miss", "Near miss — bounty banked", "warning", [`×${streetMultiplier.toFixed(1)}`]);
          }
        }
      }
    }
    nearMissCooldown = Math.max(0, nearMissCooldown - simDt);

    // Advance the player down California Street
    playerZ -= playerSpeedMps * simDt;
    playerYaw = clamp(-playerSteer * 0.16, -0.28, 0.28);
    playerRoll = clamp(playerSteer * 0.045, -0.08, 0.08);
    playerPitch = clamp((targetSpeedMps - playerSpeedMps) * 0.004, -0.03, 0.03);

    // ── 2. Chassis: suspension resolves ride height, pitch & roll on the hills ──
    const throttle01 = manualActive ? (throttleHeld ? 1 : 0) : driverThrottle;
    const brake01 = manualActive ? (brakeHeld ? 1 : 0) : Math.max(driverBrake, targetSpeedMps < playerSpeedMps - 1 ? 0.6 : 0);
    const pose = chassis.step(simDt, {
      x: playerX,
      z: playerZ,
      heading: headingForward - playerYaw,
      speed: playerSpeedMps,
      steer: playerSteer,
      throttle: throttle01,
      brake: brake01,
      slip: driftHeld && playerSpeedMps > 10 ? 0.7 : 0
    });
    const tele = chassis.telemetry();
    playerY = pose.groundedPosition[1] - hillOf(playerZ);
    const chassisPitch = pose.rotation[0];
    const chassisRoll = pose.rotation[2];

    // Landing dust when the wheels settle after leaving the surface on a crest
    const airborne = !pose.grounded || tele.maxContactGap > 0.3;
    if (airbornePrev && !airborne) {
      feel.landingDust([playerX, pose.groundedPosition[1], playerZ]);
      if (playerSpeedMps > 14) camTrauma(0.3);
    }
    airbornePrev = airborne;

    // Kerb bump when the car rides the sidewalk edge
    const onKerb = Math.abs(playerX) > 10.4;
    if (onKerb && !curbContact && playerSpeedMps > 6) {
      camTrauma(0.45);
      feel.hitStop(60);
      if (!a11yState.reducedFlash) feel.damageFlash("#ffb347");
      dispatch("kerb", "Kerb strike — comfort -4", "warning");
      comfortScore = Math.max(60, comfortScore - 4);
    }
    curbContact = onKerb;

    // Comfort score decays with hard inputs, recovers when smooth
    const harsh = Math.abs(playerSteer) > 0.5 || brake01 > 0.8 || throttle01 > 0.95;
    comfortScore = clamp(comfortScore + (harsh ? -6 : 1.5) * simDt, 55, 100);
    if (rideStyle === "street" && playerSpeedMps > spec.maxSpeedMps * 0.7) {
      streetBounty += playerSpeedMps * simDt * streetMultiplier;
    }

    // Drift skid decals under hard street driving
    skidCooldown = Math.max(0, skidCooldown - simDt);
    if (driftHeld && playerSpeedMps > 10 && skidCooldown <= 0) {
      skidCooldown = 0.09;
      const skid = skidHandles[skidIdx % SKID_POOL]!;
      skidIdx += 1;
      skid.setPosition(playerX * 0.28, 0.02, -1.6 - (skidIdx % 4) * 1.1)
        .setRotation(-Math.PI / 2, playerYaw * 2, 0)
        .setScale([1, 1, 1])
        .setVisible(true);
      streetBounty += Math.round(9 * streetMultiplier);
      if (skidIdx % 8 === 0) cue("whoosh");
    }
    if (driftHeld && playerSpeedMps > 10) {
      streetMultiplier = Math.min(5, streetMultiplier + simDt * 0.25);
    } else {
      streetMultiplier = Math.max(1, streetMultiplier - simDt * 0.35);
    }

    document.getElementById("drift")?.classList.toggle("on", driftHeld && playerSpeedMps > 10);
    document.getElementById("brakeCue")?.classList.toggle("on", brakeCueActive || (manualActive && brakeHeld && playerSpeedMps > 8));

    // ── 3. Camera: intro sweep → chase/roof/bumper/passenger via app.camera ──
    const rx = (wx: number) => wx - playerX * 0.72;
    const ry = (wy: number, wz: number) => wy + hillOf(wz) - hillOf(playerZ) - playerY * 0.82;
    const rz = (wz: number) => wz - playerZ;
    const pViewX = rx(playerX);
    const pViewY = playerY + 0.02;

    // Trauma decay + reduced-motion scaling
    trauma = Math.max(0, trauma - simDt * 1.4);
    const shakeAmp = a11yState.reducedMotion ? 0 : trauma;
    const shx = shakeAmp * 0.14 * Math.sin(simTime * 61);
    const shy = shakeAmp * 0.1 * Math.sin(simTime * 47 + 1.3);
    const boostFov = manualActive && boostHeld ? 7 : clamp((playerSpeedMps - 20) * 0.22, 0, 6);

    if (introT < INTRO_LEN) {
      introT += simDt;
      const s = sampleCameraPath(introPath, introT);
      // Fly from high over the GG towers down into the chase position.
      const t = clamp(introT / INTRO_LEN, 0, 1);
      const ease = t * t * (3 - 2 * t);
      const sx: Vec3 = [-60 + 60 * ease, 46 - 42 * ease, -300 + 294 * ease];
      const tx: Vec3 = [lerp(0, pViewX, ease), lerp(20, pViewY + 1.0, ease), lerp(-200, -7.5, ease)];
      const pathPos: Vec3 = [s.position[0] * 0.12, s.position[1], s.position[2] + 2];
      const px = lerp(pathPos[0], sx[0], ease);
      const py = lerp(pathPos[1], sx[1], ease);
      const pz = lerp(pathPos[2], sx[2], ease);
      camSetPose([px, py, pz], tx, lerp(50, SCENE_CAM_FOV_DEG, ease));
      if (introT >= INTRO_LEN) document.getElementById("introTitle")?.classList.remove("on");
    } else {
      // Cinematic drift during boarding/alighting: eases to a 3/4 front view.
      const cinematic = rideState === "boarding" || rideState === "alighting";
      const cine = cinematic ? 1 : 0;
      cineBlend = lerp(cineBlend, cine, simDt * 2.2);
      const modes: Record<CamMode, { pos: Vec3; tgt: Vec3; fov: number }> = {
        0: { pos: [pViewX * 0.7, pViewY + 3.3, 5.9], tgt: [pViewX, pViewY + 1.0, -8.2], fov: SCENE_CAM_FOV_DEG },
        1: { pos: [pViewX * 0.62, pViewY + 4.0, 9.4], tgt: [pViewX, pViewY + 1.0, -10], fov: SCENE_CAM_FOV_DEG - 4 },
        2: { pos: [pViewX, pViewY + 2.42, -1.5], tgt: [pViewX, pViewY + 1.2, -42], fov: 62 },
        3: { pos: [pViewX, pViewY + 0.9, 0.9], tgt: [pViewX, pViewY + 0.8, -32], fov: 66 },
        4: { pos: [pViewX - 0.55, pViewY + 1.55, 0.4], tgt: [pViewX + 0.8, pViewY + 1.15, -9], fov: 58 }
      };
      const m = modes[camMode];
      const cx = lerp(m.pos[0], pViewX + 4.6, cineBlend);
      const cy = lerp(m.pos[1], pViewY + 1.9, cineBlend);
      const cz = lerp(m.pos[2], 3.2, cineBlend);
      const tx2 = lerp(m.tgt[0], pViewX, cineBlend);
      const ty2 = lerp(m.tgt[1], pViewY + 1.1, cineBlend);
      const tz2 = lerp(m.tgt[2], -1.2, cineBlend);
      camSetPose(
        [cx + shx, cy + shy, cz],
        [tx2, ty2 + (hillOf(playerZ - 30) - hillOf(playerZ)) * 0.5, tz2],
        m.fov + boostFov,
        playerSteer * 0.01
      );
    }
    if (boostHeld && manualActive && playerSpeedMps > 20) camFovKick(0.12);
    if (playerSpeedMps > spec.maxSpeedMps * 0.85 && !a11yState.reducedMotion) feel.speedLines(0.5);

    // ── 4. Sync player hero + LiDAR + shadow on the hilly street ──
    const pRoot: Vec3 = [pViewX, pViewY + spec.rideY, -0.8];
    for (const id of PLAYABLE_IDS) {
      const h = playerCarHandles[id];
      if (id === activeCarId) {
        h.setPosition(pRoot[0], pRoot[1], pRoot[2])
          .setRotation(chassisPitch + playerPitch, playerYaw, chassisRoll + playerRoll)
          .setScale([1, 1, 1])
          .setVisible(true);
      } else {
        h.setPosition(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2]).setScale(HIDDEN_SCALE).setVisible(false);
      }
    }
    // Spinning LiDAR suite on the Apex cruiser
    const lidarOn = activeCarId === "waymo";
    playerLidarDome
      .setPosition(pRoot[0], pRoot[1] + 2.18, pRoot[2])
      .setScale(lidarOn ? [1, 1, 1] : HIDDEN_SCALE)
      .setVisible(lidarOn);
    playerLidarRing
      .setPosition(pRoot[0], pRoot[1] + 2.31, pRoot[2])
      .setRotation(0, simTime * 9.5, 0)
      .setScale(lidarOn ? [1, 1, 1] : HIDDEN_SCALE)
      .setVisible(lidarOn);
    const brakeLit = brake01 > 0.2 || regenRatio > 0.6;
    playerTailbar
      .setPosition(pRoot[0], pRoot[1] + 0.82, pRoot[2] + 2.1)
      .setScale(brakeLit ? [1, 1, 1] : HIDDEN_SCALE)
      .setVisible(brakeLit);
    const boostLit = manualActive && boostHeld && playerSpeedMps > 18;
    playerThrusterL
      .setPosition(pRoot[0] - 0.5, pRoot[1] + 0.4, pRoot[2] + 2.2)
      .setRotation(Math.PI / 2, 0, 0)
      .setScale(boostLit ? [0.8, 0.8 + playerSpeedMps * 0.01, 0.8] : HIDDEN_SCALE)
      .setVisible(boostLit);
    playerThrusterR
      .setPosition(pRoot[0] + 0.5, pRoot[1] + 0.4, pRoot[2] + 2.2)
      .setRotation(Math.PI / 2, 0, 0)
      .setScale(boostLit ? [0.8, 0.8 + playerSpeedMps * 0.01, 0.8] : HIDDEN_SCALE)
      .setVisible(boostLit);
    playerShadow.setPosition(pRoot[0], 0.015, pRoot[2]).setScale([1, 1, 1]).setVisible(true);

    // ── 5. Scroll the hilly world: road slabs, curbs, walks, rails, dashes ──
    const segBase = Math.floor(playerZ / ROAD_SEGMENT_LEN) * ROAD_SEGMENT_LEN + ROAD_SEGMENT_LEN;
    for (let i = 0; i < ROAD_SEGMENTS; i++) {
      const wz = segBase - i * ROAD_SEGMENT_LEN;
      const vz = rz(wz);
      const pitch = Math.atan(hillSlope(wz));
      roadHandles[i]!.setPosition(rx(0), ry(-0.07, wz), vz).setRotation(-pitch, 0, 0);
      curbLHandles[i]!.setPosition(rx(-10.8), ry(0.12, wz), vz).setRotation(-pitch, 0, 0);
      curbRHandles[i]!.setPosition(rx(10.8), ry(0.12, wz), vz).setRotation(-pitch, 0, 0);
      walkLHandles[i]!.setPosition(rx(-15.2), ry(0.1, wz), vz).setRotation(-pitch, 0, 0);
      walkRHandles[i]!.setPosition(rx(15.2), ry(0.1, wz), vz).setRotation(-pitch, 0, 0);
      for (let r = 0; r < 4; r++) {
        const railx = [-3.8, -2.6, 2.8, 4.0][r]!;
        railHandles[r]![i]!.setPosition(rx(railx), ry(0.016, wz), vz).setRotation(-pitch, 0, 0);
      }
      for (let l = 0; l < 2; l++) {
        yellowHandles[l]![i]!.setPosition(rx(l === 0 ? -0.18 : 0.18), ry(0.014, wz), vz).setRotation(-pitch, 0, 0);
      }
    }

    const dashBaseZ = Math.floor(playerZ / DASH_STRIDE_Z) * DASH_STRIDE_Z + DASH_STRIDE_Z;
    for (let d = 0; d < 2; d++) {
      const lx = rx(d === 0 ? -5.4 : 5.4);
      const col = dashHandles[d]!;
      for (let i = 0; i < DASH_ROWS; i++) {
        const wz = dashBaseZ - i * DASH_STRIDE_Z;
        col[i]!.setPosition(lx, ry(0.02, wz), rz(wz));
      }
    }

    // Signals: green wave phasing shared with the room
    const sigCycle = simTime % 16;
    const sigPhase = sigCycle < 10.5 ? 0 : sigCycle < 13.0 ? 1 : 2;
    if (sigPhase !== lastSignalPhase) {
      lastSignalPhase = sigPhase;
      const sigColor = sigPhase === 0 ? "#43d17a" : sigPhase === 1 ? "#ffb347" : "#ff4a3d";
      const sigMat = material.emissive({ color: sigColor, emissive: sigColor, emissiveIntensity: 2.2 });
      for (const inter of intersectionHandles) {
        inter.lightL.setMaterial(sigMat);
        inter.lightR.setMaterial(sigMat);
      }
      if (sigPhase === 2 && playerSpeedMps > 4) dispatch("signal", "Signal phase: red ahead", "info", ["california st"]);
    }

    const interBaseZ = Math.floor(playerZ / INTERSECTION_STRIDE_Z) * INTERSECTION_STRIDE_Z;
    for (let i = 0; i < INTERSECTION_COUNT; i++) {
      const iwz = interBaseZ - i * INTERSECTION_STRIDE_Z;
      const iz = rz(iwz);
      const slot = intersectionHandles[i]!;
      slot.crossRoad.setPosition(rx(0), ry(0.012, iwz), iz);
      slot.crosswalkN.setPosition(rx(0), ry(0.026, iwz - 8.2), rz(iwz - 8.2));
      slot.crosswalkS.setPosition(rx(0), ry(0.026, iwz + 8.2), rz(iwz + 8.2));
      slot.poleR.setPosition(rx(11.4), ry(3.4, iwz - 9.2), rz(iwz - 9.2));
      slot.armR.setPosition(rx(8.6), ry(6.5, iwz - 9.2), rz(iwz - 9.2));
      slot.lightR.setPosition(rx(6.4), ry(6.25, iwz - 9.1), rz(iwz - 9.1));
      slot.poleL.setPosition(rx(-11.4), ry(3.4, iwz - 9.2), rz(iwz - 9.2));
      slot.armL.setPosition(rx(-8.6), ry(6.5, iwz - 9.2), rz(iwz - 9.2));
      slot.lightL.setPosition(rx(-6.4), ry(6.25, iwz - 9.1), rz(iwz - 9.1));
    }

    const bldgBaseZ = Math.floor(playerZ / BUILDING_STRIDE_Z) * BUILDING_STRIDE_Z + BUILDING_STRIDE_Z;
    for (let i = 0; i < BUILDING_PAIRS; i++) {
      const bwz = bldgBaseZ - i * BUILDING_STRIDE_Z;
      const bz = rz(bwz);
      const b = buildingHandles[i]!;
      const baseY = ry(0, bwz);
      b.left.setPosition(rx(-26.5), baseY + b.hL * 0.5, bz);
      b.right.setPosition(rx(26.5), baseY + b.hR * 0.5, bz);
      b.left2.setPosition(rx(-44), baseY + b.hL2 * 0.5, bz - 9);
      b.right2.setPosition(rx(44), baseY + b.hR2 * 0.5, bz - 9);
      b.winL.setPosition(rx(-26.5), baseY + b.winY[0], bz + 10.05);
      b.winR.setPosition(rx(26.5), baseY + b.winY[1], bz + 10.05);
    }

    const lampBaseZ = Math.floor(playerZ / LAMP_STRIDE_Z) * LAMP_STRIDE_Z + LAMP_STRIDE_Z;
    for (let i = 0; i < LAMP_PAIRS; i++) {
      const lwz = lampBaseZ - i * LAMP_STRIDE_Z;
      const lz = rz(lwz);
      const l = lampHandles[i]!;
      l.lampL.setPosition(rx(-11.2), ry(3.1, lwz), lz);
      l.globeL.setPosition(rx(-10.8), ry(6.25, lwz), lz);
      l.lampR.setPosition(rx(11.2), ry(3.1, lwz), lz);
      l.globeR.setPosition(rx(10.8), ry(6.25, lwz), lz);
      l.trunkR.setPosition(rx(12.2), ry(1.6, lwz - 14), rz(lwz - 14));
      l.crownR.setPosition(rx(12.2), ry(4.1, lwz - 14), rz(lwz - 14));
      l.cone.setPosition(rx(10.6), ry(3.1, lwz), lz);
    }

    // Landmarks ride their fixed world-Z slots (bay/GG/moon beyond the recycle horizon)
    const setLandmark = (h: AuraRuntimeNodeHandle, wx: number, wy: number, wz: number) => {
      h.setPosition(rx(wx), wy + hillOf(wz) * (wz > -330 ? 0.9 : 0.15) - hillOf(playerZ) - playerY * 0.82, rz(wz));
    };
    setLandmark(landmarkHandles.pyramidSpire, 44, 72, -210);
    setLandmark(landmarkHandles.pyramidWing, 44, 39, -210);
    setLandmark(landmarkHandles.pyramidCrown, 44, 145, -210);
    setLandmark(landmarkHandles.salesforce, -48, 79, -235);
    setLandmark(landmarkHandles.salesforceCrown, -48, 162, -235);
    setLandmark(landmarkHandles.ggW1, -96, 59, -335);
    setLandmark(landmarkHandles.ggW2, -78, 59, -335);
    setLandmark(landmarkHandles.ggW3, -87, 108, -335);
    setLandmark(landmarkHandles.ggW4, -87, 78, -335);
    setLandmark(landmarkHandles.ggE1, 78, 59, -335);
    setLandmark(landmarkHandles.ggE2, 96, 59, -335);
    setLandmark(landmarkHandles.ggE3, 87, 108, -335);
    setLandmark(landmarkHandles.ggDeck, 0, 36, -335);
    setLandmark(landmarkHandles.moon, 58, 96, -380);
    setLandmark(landmarkHandles.towerL, -58, 0, -145);
    setLandmark(landmarkHandles.towerT, 58, 0, -135);
    setLandmark(landmarkHandles.towerX, -62, 0, -255);
    setLandmark(landmarkHandles.towerX2, 64, 0, -250);
    setLandmark(landmarkHandles.overpass, 0, 0, -290);
    setLandmark(landmarkHandles.v2Transamerica, 52, 0, -200);
    setLandmark(landmarkHandles.v2Ferry, -8, 0, -346);
    setLandmark(landmarkHandles.v2Ladies, -38, 0, -120);
    setLandmark(landmarkHandles.v2ShelterA, 12.8, 0, -92);
    setLandmark(landmarkHandles.v2ShelterB, -12.8, 0, -184);
    // Ground + bay don't ride hills (the peninsula floor stays level)
    landmarkHandles.ground.setPosition(rx(0), -1.4 - hillOf(playerZ) - playerY * 0.82, rz(-240));
    landmarkHandles.bayWater.setPosition(rx(0), -0.4 - hillOf(playerZ) - playerY * 0.82, rz(-400));

    // Road-wear decals scroll
    for (let i = 0; i < wearHandles.length; i++) {
      const wwz = -34 - i * 42;
      wearHandles[i]!.setPosition(rx((i % 3 - 1) * 5.5), ry(0.015, wwz), rz(wwz));
    }

    // ── 6. Beacon, passenger, path ribbon ──
    const pulse = 0.5 + 0.5 * Math.sin(simTime * 3.8);
    const bViewX = rx(CURB_BEACON_X);
    const bViewZ = rz(beaconWorldZ);
    const ringScale = 1 + 0.08 * pulse;
    beaconRingHandle.setPosition(bViewX, ry(0.08, beaconWorldZ), bViewZ).setRotation(Math.PI * 0.5, simTime * 1.4, 0).setScale([ringScale, ringScale, 1]).setVisible(true);
    beaconDiscHandle.setPosition(bViewX, ry(0.04, beaconWorldZ), bViewZ).setScale([1, 1, 1]).setVisible(true);
    beaconBeamHandle.setPosition(bViewX, ry(17, beaconWorldZ), bViewZ).setScale([0.92 + pulse * 0.14, 1, 0.92 + pulse * 0.14]).setVisible(true);
    beaconCoreHandle.setPosition(bViewX, ry(18, beaconWorldZ), bViewZ).setScale([1, 1, 1]).setVisible(true);

    const showPassenger = rideState === "offer" || rideState === "boarding" || rideState === "alighting";
    if (showPassenger) {
      const walkProgress = rideState === "boarding" ? clamp(stateTimerSec / 1.5, 0, 1) : 0;
      const pedWorldX = lerp(11.35, CURB_BEACON_X + 0.85, walkProgress);
      const pvX = rx(pedWorldX);
      const waveAngle = Math.sin(simTime * 8.5) * 0.45;
      const pbY = ry(0.88, beaconWorldZ);
      passengerBodyHandle.setPosition(pvX, pbY, bViewZ).setScale([1, 1, 1]).setVisible(true);
      passengerHeadHandle.setPosition(pvX, ry(1.76, beaconWorldZ), bViewZ).setScale([1, 1, 1]).setVisible(true);
      passengerArmHandle.setPosition(pvX - 0.28, ry(1.55, beaconWorldZ), bViewZ).setRotation(0, 0, 0.55 + waveAngle).setScale([1, 1, 1]).setVisible(true);
    } else {
      passengerBodyHandle.setScale(HIDDEN_SCALE).setVisible(false);
      passengerHeadHandle.setScale(HIDDEN_SCALE).setVisible(false);
      passengerArmHandle.setScale(HIDDEN_SCALE).setVisible(false);
    }

    for (let i = 0; i < PATH_RIBBON_COUNT; i++) {
      const frac = (i + 1) / PATH_RIBBON_COUNT;
      const segWorldZ = playerZ - 5.5 - i * 5.4;
      const pullToCurb = distToBeacon < 58 ? clamp(1 - Math.abs(segWorldZ - beaconWorldZ) / 52, 0, 1) : 0;
      const segWorldX = lerp(playerX, pullToCurb > 0.2 ? CURB_BEACON_X - 0.8 : targetLaneX, frac * 0.85);
      const nextWorldX = lerp(playerX, pullToCurb > 0.2 ? CURB_BEACON_X - 0.8 : targetLaneX, Math.min(1, (i + 2) / PATH_RIBBON_COUNT));
      const ribbonYaw = Math.atan2(-(nextWorldX - segWorldX), 5.4);
      const waveBrightness = 0.82 + 0.24 * Math.sin(simTime * 7 - i * 0.7);
      pathRibbonHandles[i]!
        .setPosition(rx(segWorldX), ry(0.032, segWorldZ), rz(segWorldZ))
        .setRotation(Math.atan(hillSlope(segWorldZ)) * -1, ribbonYaw, 0)
        .setScale([waveBrightness, 1, 1])
        .setVisible(true);
    }

    // ── 7. Pedestrians: sidewalks + signal-phased crosswalks ──
    for (let i = 0; i < PED_COUNT; i++) {
      const ped = peds[i]!;
      const handles = pedHandles[i]!;
      if (ped.mode === "cross") {
        // Cross the avenue on the red phase at the nearest intersection
        ped.x += ped.side * -1 * 0.9 * simDt;
        if ((ped.side === 1 && ped.x < -15) || (ped.side === -1 && ped.x > 15)) {
          ped.side = ped.side === 1 ? -1 : 1;
          ped.mode = "walk";
          ped.x = ped.side * 15.2;
        }
      } else {
        ped.z -= ped.speed * simDt * (ped.side === 1 ? 1 : -1);
        if (ped.z > playerZ + 10) ped.z = playerZ - 210 - i * 3;
        if (ped.z < playerZ - 215) ped.z = playerZ + 8;
        // Near an intersection on red: cross!
        const nearInter = interBaseZ - Math.round((ped.z - interBaseZ) / INTERSECTION_STRIDE_Z) * INTERSECTION_STRIDE_Z;
        if (sigPhase === 2 && Math.abs(ped.z - nearInter) < 4 && hash01(i + Math.floor(simTime)) > 0.35) {
          ped.mode = "cross";
        }
      }
      const bob = Math.sin(simTime * 7 + ped.phase) * 0.04;
      const pvy = ry(0.95 + bob, ped.z);
      handles.body.setPosition(rx(ped.x), pvy, rz(ped.z)).setRotation(0, ped.mode === "cross" ? ped.side * -Math.PI / 2 : (ped.side === 1 ? 0 : Math.PI), 0).setScale([1, 1, 1]).setVisible(true);
      handles.head.setPosition(rx(ped.x), ry(1.72 + bob, ped.z), rz(ped.z)).setScale([1, 1, 1]).setVisible(true);
    }

    // ── 8. Multiplayer peers + nameplate projection ──
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i]!;
      const handle = peerCarHandles[i]!;
      const relSpeed = peer.baseSpeed + Math.sin(simTime * 0.7 + i * 1.4) * 2.2 - playerSpeedMps;
      peer.zOffset += relSpeed * simDt * 0.35;
      if (peer.zOffset > -13) peer.zOffset = -64;
      if (peer.zOffset < -68) peer.zOffset = -16;
      if (!peer.isCableCar) {
        const laneWave = Math.sin(simTime * 0.42 + i * 2.1);
        peer.laneX = lerp(peer.laneX, peer.targetLaneX + laneWave * 0.55, simDt * 2.0);
      } else {
        // Cable car rides the centre tracks
        peer.laneX = -1.2 + Math.sin(simTime * 0.18) * 0.2;
      }
      peer.worldX = peer.laneX;
      peer.worldZ = playerZ + peer.zOffset;
      peer.distanceMeters = Math.max(8, Math.round(Math.hypot(peer.worldX - playerX, peer.zOffset)));
      const pvx = rx(peer.worldX);
      const pvy = ry(peer.rideY, peer.worldZ);
      const pvz = peer.zOffset - 0.8;
      handle.setPosition(pvx, pvy, pvz).setRotation(Math.atan(hillSlope(peer.worldZ)) * -1, peer.yawOffset, 0).setScale([1, 1, 1]).setVisible(true);
      if (i === 0) peerApexLidarRing.setScale(HIDDEN_SCALE).setVisible(false);
      const proj = projectViewPointToScreen([pvx, pvy + (peer.isCableCar ? 3.55 : 2.15), pvz], vw, vh);
      const tagEl = peerTagEls[i];
      if (tagEl) {
        if (proj.visible) {
          tagEl.style.display = "flex";
          tagEl.style.transform = `translate3d(${proj.x.toFixed(1)}px, ${proj.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
          const distEl = document.getElementById(`mp-dist-${i}`);
          if (distEl) distEl.textContent = `${peer.distanceMeters} m`;
        } else {
          tagEl.style.display = "none";
        }
      }
    }

    // ── 9. AI traffic: driver-AI same-direction + scripted oncoming ──
    for (let i = 0; i < trafficCars.length; i++) {
      const tc = trafficCars[i]!;
      const th = trafficHandles[i]!;
      if (tc.direction === 1) {
        if (tc.ai && i < 4 + trafficDrivers.length) {
          const drv = trafficDrivers[i - 4];
          if (drv) {
            const st: DriverVehicleState = {
              progress: ((Math.max(0, -tc.z) % ROUTE_LEN) + ROUTE_LEN) % ROUTE_LEN / ROUTE_LEN,
              speed: tc.speed,
              heading: headingForward,
              signedTrackOffset: tc.laneX - tc.preferredOffset,
              position: { x: tc.laneX, y: tc.z },
              offTrack: false,
              preferredSignedOffset: tc.preferredOffset
            };
            const d = drv.decide(simDt, st);
            tc.throttle = d.throttle; tc.brake = d.brake; tc.steer = d.steer;
            tc.speed = clamp(tc.speed + (d.throttle * 9 - d.brake * 14) * simDt, 4, 16);
            tc.laneX = clamp(tc.laneX + d.steer * 2.4 * simDt, 2.2, 9.0);
          }
        }
        tc.z -= tc.speed * simDt;
        if (tc.z > playerZ + 18) tc.z = playerZ - 195;
        if (tc.z < playerZ - 205) tc.z = playerZ + 12;
      } else {
        tc.z += tc.speed * simDt;
        if (tc.z > playerZ + 22) tc.z = playerZ - 210 - (i % 3) * 18;
      }
      const tvx = rx(tc.laneX);
      const tvy = ry(0, tc.z);
      const tvz = rz(tc.z);
      const tyaw = tc.direction === 1 ? Math.PI : 0;
      th.setPosition(tvx, tvy, tvz)
        .setRotation(Math.atan(hillSlope(tc.z)) * -1, tyaw + (tc.direction === 1 ? -tc.steer * 0.2 : 0), 0)
        .setScale([1, 1, 1])
        .setVisible(tvz < 18 && tvz > -220);

      // Player-vs-traffic bump (manual carelessness costs comfort + trauma)
      const bumpDz = Math.abs(tc.z - playerZ);
      const bumpDx = Math.abs(tc.laneX - playerX);
      if (bumpDz < 3.2 && bumpDx < 1.9 && bumpCooldown <= 0) {
        bumpCooldown = 2.0;
        trauma = Math.min(1, trauma + 0.55);
        camTrauma(0.7);
        feel.hitStop(90);
        if (!a11yState.reducedFlash) feel.damageFlash("#ff5a4f");
        comfortScore = Math.max(55, comfortScore - 8);
        playerSpeedMps *= 0.55;
        cue("horn");
        dispatch("collision", "Traffic contact — comfort -8", "error", ["smoothness"]);
        pushPenaltyOrBonusPopup("Contact!", "Comfort -8 · speed scrubbed", "bad");
      }
    }
    bumpCooldown = Math.max(0, bumpCooldown - simDt);

    // ── 10. HUD: speedometer, district, ghud chips (game.hud.*), minimap ──
    const displaySpeed = Math.round(playerSpeedMps * (useMph ? 2.23694 : 3.6));
    const spdEl = document.getElementById("spd");
    if (spdEl) spdEl.textContent = String(displaySpeed).padStart(3, "0");
    const gearEl = document.getElementById("gear");
    if (gearEl) {
      gearEl.textContent = spec.isIce ? String(clamp(Math.ceil(displaySpeed / 18), 1, 8)) : brakeHeld && playerSpeedMps < 0.5 ? "R" : "D";
    }
    const rpmPath = document.getElementById("rpm");
    if (rpmPath) rpmPath.style.strokeDashoffset = (100 - clamp(powerRatio * 100, 3, 98)).toFixed(1);
    const nosPath = document.getElementById("nos");
    if (nosPath) nosPath.style.strokeDashoffset = (100 - clamp(regenRatio * 100, 6, 98)).toFixed(1);

    if (simTime - lastHudDomUpdateSec >= 0.1) {
      lastHudDomUpdateSec = simTime;
      const distIdx = Math.abs(Math.floor(-playerZ / 160)) % SF_DISTRICTS.length;
      const distInfo = SF_DISTRICTS[distIdx]!;
      const hoodEl = document.getElementById("wHood");
      const stEl = document.getElementById("wSt");
      const xEl = document.getElementById("wX");
      const coordsEl = document.getElementById("wCoords");
      if (hoodEl) hoodEl.textContent = distInfo.hood;
      if (stEl) stEl.textContent = distInfo.street;
      if (xEl) xEl.textContent = distInfo.cross;
      if (coordsEl) coordsEl.textContent = distInfo.coords;
      renderApexFareCards(distToBeacon);

      // Engine audio follows drivetrain state
      audio.setCueLevel("engine", {
        volume: audioMuted ? 0 : clamp(0.1 + powerRatio * 0.5, 0, 0.6),
        rate: 0.75 + powerRatio * 1.35
      });
    }

    // game.hud.* snapshot → DOM chips (bindings resolve real state each frame)
    const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
    const hudSnap = game.hud.snapshot({
      bindings: hudBindings,
      runtime: {
        objective: rideState === "offer" || rideState === "boarding" ? `Pickup · ${fare.passenger}` : rideState === "summary" ? "Ride complete" : `Dropoff · ${fare.dropoffName}`,
        timerMs: rideState === "ride" || rideState === "alighting" ? Math.max(0, (fare.parSec - rideElapsedSec) * 1000) : distToBeacon * 80,
        scoreUsd: totalEarningsUsd,
        rating: ratingAvg
      }
    });
    for (const v of hudSnap.values) {
      if (v.id === "hud:objective") { const el = document.getElementById("ghudObjective"); if (el) el.textContent = String(v.value); }
      if (v.id === "hud:timer") {
        const el = document.getElementById("ghudTimer");
        if (el) el.textContent = formatClock(Number(v.value) / 1000);
      }
      if (v.id === "hud:score") { const el = document.getElementById("ghudScore"); if (el) el.textContent = `$${Number(v.value).toLocaleString()}`; }
      if (v.id === "hud:rating") { const el = document.getElementById("ghudRating"); if (el) el.textContent = Number(v.value).toFixed(2); }
    }

    renderVectorMinimap(distToBeacon);

    // ── 11. Evidence ──
    const evidence = {
      route: "showcase-teleoperator-v2",
      engine: "@aura3d/engine",
      version: "4.0.1",
      ready: true,
      framesRendered,
      vehicle: activeCarId,
      autopilotLevel,
      weatherPreset,
      cameraMode: camMode,
      rideState,
      rideStyle,
      totalEarningsUsd,
      completedRides,
      ratingAvg,
      comfortScore,
      streetBounty: Math.round(streetBounty),
      surgeMult,
      unlockedCars: PLAYABLE_IDS.filter((id) => totalEarningsUsd >= PLAYABLE_FLEET[id].unlockUsd),
      chassis: {
        grounded: pose.grounded,
        groundedWheels: tele.groundedWheels,
        contactGap: Number(tele.maxContactGap.toFixed(3)),
        compression: Number(tele.averageCompression.toFixed(3)),
        surfaceGrip: Number(tele.surfaceGrip.toFixed(2)),
        speedKph: Number(tele.speedKph.toFixed(1))
      },
      driverAi: {
        decisionCount: ai.telemetry().decisionCount,
        targetSpeed: Number(ai.telemetry().targetSpeed.toFixed(1)),
        recovering: ai.telemetry().recovering
      },
      eventLog: { count: dispatchLog.snapshot().count, last: dispatchLog.snapshot().last?.label },
      hudEventLog: hudEventLog.id,
      accessibility: { ...a11yState, runtimeEvidence: a11y.evidence.length },
      audio: { cues: 7, muted: audioMuted, playedCueCount: audio.evidence.playedCueCount },
      player: {
        position: [Number(playerX.toFixed(2)), Number(playerY.toFixed(2)), Number(playerZ.toFixed(2))],
        speedMps: Number(playerSpeedMps.toFixed(2)),
        speedMph: displaySpeed
      },
      peers: peers.map((p) => ({ handle: p.handle, car: p.carLabel, distanceMeters: p.distanceMeters }))
    };
    (window as unknown as Record<string, unknown>).__AURA3D_GAME_EVIDENCE__ = evidence;
    (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = evidence;
    (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_TELEOPERATOR_V2__ = {
      app: auraApp,
      evidence,
      selectPlayableVehicle,
      setAutopilotLevel,
      setCameraMode,
      setWeatherPreset,
      advanceApexFareStage,
      teleportToPeer,
      resetSession,
      setPaused
    };
  });

  let cineBlend = 0;

  auraApp.step(1 / 60);
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  auraApp.resume();
}

void bootGridDispatchV2();
