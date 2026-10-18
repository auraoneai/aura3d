import {
  camera,
  createAuraApp,
  defineAuraAssets,
  effects,
  game,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { assets as rootAssets } from "../../../src/aura-assets";
import { v2Assets } from "./aura-assets-v2";

type Vec3 = [number, number, number];

export type PlayableCarId = "waymo" | "cybercab" | "cybertruck" | "corvette" | "roadster";
export type AutopilotLevel = "MAN" | "L3" | "L4" | "L5" | "L5 MAX";
export type WeatherPreset = "noon" | "golden" | "fog" | "night";
export type RideLifecycleState = "offer" | "boarding" | "ride" | "alighting" | "summary";
export type RideStyle = "comfort" | "street";

const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];
const HIDDEN_POS: Vec3 = [0, -90, 140];

// Merge admitted Grid Dispatch & skyline GLBs with root src/aura-assets.ts so typechecking and runtime
// resolve 100% of assets whether src/aura-assets.ts has been regenerated yet or not.
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
  ...(rootAssets as Record<string, unknown>)
} as typeof rootAssets & typeof teleopAdmittedAssets;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function rotateLocalOffset(
  root: Vec3,
  pitch: number,
  yaw: number,
  roll: number,
  local: Vec3
): Vec3 {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const x1 = local[0] * cr - local[1] * sr;
  const y1 = local[0] * sr + local[1] * cr;
  const z1 = local[2];

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x2 = x1;
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x3 = x2 * cy + z2 * sy;
  const y3 = y2;
  const z3 = -x2 * sy + z2 * cy;

  return [root[0] + x3, root[1] + y3, root[2] + z3];
}

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
  hasRoofLidar: boolean;
  hasThrusters: boolean;
  modeLabel: string;
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
    hasRoofLidar: false,
    hasThrusters: false,
    modeLabel: "AUTO · APEX L5 AUTOPILOT"
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
    hasRoofLidar: false,
    hasThrusters: false,
    modeLabel: "AUTO · NEURAL AUTOPILOT"
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
    hasRoofLidar: false,
    hasThrusters: false,
    modeLabel: "AUTO · TRI-MOTOR AWD"
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
    hasRoofLidar: false,
    hasThrusters: false,
    modeLabel: "8-DCT · 1,250 HP V8"
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
    hasRoofLidar: false,
    hasThrusters: false,
    modeLabel: "COLD-GAS THRUSTERS"
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
  {
    hood: "Nob Hill",
    street: "California Street",
    cross: "→ Mason St · Fairmont & Grace Cathedral",
    coords: "37.7919° N · 122.4102° W"
  },
  {
    hood: "Chinatown",
    street: "California Street",
    cross: "→ Grant Ave · Dragon Gate",
    coords: "37.7924° N · 122.4058° W"
  },
  {
    hood: "Financial District",
    street: "California Street",
    cross: "→ Montgomery St · Transamerica Pyramid",
    coords: "37.7931° N · 122.4026° W"
  },
  {
    hood: "SoMa · Transit Center",
    street: "Market Street",
    cross: "→ Fremont St · Salesforce Tower",
    coords: "37.7897° N · 122.3972° W"
  },
  {
    hood: "The Embarcadero",
    street: "The Embarcadero",
    cross: "→ Washington St · Ferry Building & Bay Bridge",
    coords: "37.7955° N · 122.3937° W"
  },
  {
    hood: "North Beach",
    street: "Columbus Avenue",
    cross: "→ Broadway · Telegraph Hill & Coit Tower",
    coords: "37.7992° N · 122.4076° W"
  }
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
    quote: "Heading to the Transamerica Pyramid — glad a Apex caught my hail!",
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
}

// 4-Lane SF Avenue layout:
// Lanes 0 & 1: Westbound / Oncoming (-7.6m, -3.2m)
// Center Cable Car tracks at -1.2m and +1.2m
// Lanes 2 & 3: Eastbound / Player direction (+3.4m, +7.4m), Curb pickup lane at +8.5m
const AVENUE_LANES_X = [-7.6, -3.2, 3.4, 7.4] as const;
const CURB_BEACON_X = 8.55;

const DASH_ROWS = 14;
const DASH_STRIDE_Z = 14;
const INTERSECTION_COUNT = 3;
const INTERSECTION_STRIDE_Z = 92;
const BUILDING_PAIRS = 8;
const BUILDING_STRIDE_Z = 34;
const LAMP_PAIRS = 6;
const LAMP_STRIDE_Z = 38;
const PATH_RIBBON_COUNT = 9;

// Camera view configuration matching buildGridDispatchScene()
const SCENE_CAM_POS: Vec3 = [0, 3.4, 6.5];
const SCENE_CAM_TARGET: Vec3 = [0, 1.0, -7.2];
const SCENE_CAM_FOV_DEG = 56;

function buildGridDispatchScene(): ReturnType<typeof scene> {
  const s = scene()
    .add(looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.1 }))
    .background("#69abe0")
    .camera(
      camera.perspective({
        fov: SCENE_CAM_FOV_DEG,
        near: 0.25,
        far: 620,
        position: SCENE_CAM_POS,
        target: SCENE_CAM_TARGET
      })
    )
    .add(lights.ambient({ color: "#fff6eb", intensity: 0.78 }))
    .add(
      lights.hemisphere({
        skyColor: "#8ed0ff",
        groundColor: "#2d3748",
        intensity: 0.92
      })
    )
    .add(
      lights.directional({
        color: "#fff1d6",
        intensity: 2.45,
        position: [36, 62, -48],
        shadow: true
      })
    )
    .add(
      lights.point({
        color: "#3fd6c6",
        intensity: 1.65,
        position: [6, 5, -18],
        distance: 65
      })
    )
    .add(effects.bloom({ intensity: 0.24, threshold: 0.78, radius: 0.45 }))
    .add(effects.vignette({ intensity: 0.16, smoothness: 0.65 }))
    .add(effects.colorGrade({ contrast: 1.06, saturation: 1.1 }));

  // 1. San Francisco Peninsula Ground, Bay Water Vista, California Street Asphalt, Cable Car Tracks & Sidewalks
  const brassRailMat = material.pbr({ color: "#b59449", metalness: 0.82, roughness: 0.28 });
  const graniteCurbMat = material.pbr({ color: "#94a3b8", roughness: 0.72, metalness: 0.08 });
  const sidewalkMat = material.pbr({ color: "#475569", roughness: 0.85, metalness: 0.05 });

  s.addMany([
    primitives
      .box({
        name: "sf-peninsula-ground",
        size: [1400, 0.2, 620],
        material: material.pbr({ color: "#1e293b", roughness: 0.94 })
      })
      .position(0, -0.25, -180)
      .runtime(game.runtimeNode("sf-peninsula-ground")),
    primitives
      .box({
        name: "sf-bay-water",
        size: [1400, 0.08, 220],
        material: material.pbr({ color: "#0c4a6e", roughness: 0.22, metalness: 0.45 })
      })
      .position(0, -0.1, -330)
      .runtime(game.runtimeNode("sf-bay-water")),
    primitives
      .box({
        name: "sf-avenue-asphalt",
        size: [21.6, 0.12, 420],
        material: material.pbr({ color: "#1e232d", roughness: 0.82, metalness: 0.08 })
      })
      .position(0, -0.06, -160)
      .runtime(game.runtimeNode("sf-avenue-asphalt")),
    // Double yellow center line & California St Cable Car steel/brass slot rails
    primitives
      .box({
        name: "sf-center-yellow-l",
        size: [0.12, 0.02, 420],
        material: material.emissive({ color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: 0.42 })
      })
      .position(-0.18, 0.014, -160)
      .runtime(game.runtimeNode("sf-center-yellow-l")),
    primitives
      .box({
        name: "sf-center-yellow-r",
        size: [0.12, 0.02, 420],
        material: material.emissive({ color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: 0.42 })
      })
      .position(0.18, 0.014, -160)
      .runtime(game.runtimeNode("sf-center-yellow-r")),
    primitives
      .box({
        name: "sf-cable-rail-1",
        size: [0.09, 0.025, 420],
        material: brassRailMat
      })
      .position(-3.8, 0.016, -160)
      .runtime(game.runtimeNode("sf-cable-rail-1")),
    primitives
      .box({
        name: "sf-cable-rail-2",
        size: [0.09, 0.025, 420],
        material: brassRailMat
      })
      .position(-2.6, 0.016, -160)
      .runtime(game.runtimeNode("sf-cable-rail-2")),
    primitives
      .box({
        name: "sf-cable-rail-3",
        size: [0.09, 0.025, 420],
        material: brassRailMat
      })
      .position(2.8, 0.016, -160)
      .runtime(game.runtimeNode("sf-cable-rail-3")),
    primitives
      .box({
        name: "sf-cable-rail-4",
        size: [0.09, 0.025, 420],
        material: brassRailMat
      })
      .position(4.0, 0.016, -160)
      .runtime(game.runtimeNode("sf-cable-rail-4")),
    // Raised Granite Curbs & Wide Sidewalks
    primitives
      .box({
        name: "sf-curb-left",
        size: [0.45, 0.22, 420],
        material: graniteCurbMat
      })
      .position(-10.8, 0.11, -160)
      .runtime(game.runtimeNode("sf-curb-left")),
    primitives
      .box({
        name: "sf-curb-right",
        size: [0.45, 0.22, 420],
        material: graniteCurbMat
      })
      .position(10.8, 0.11, -160)
      .runtime(game.runtimeNode("sf-curb-right")),
    primitives
      .box({
        name: "sf-sidewalk-left",
        size: [8.5, 0.18, 420],
        material: sidewalkMat
      })
      .position(-15.2, 0.09, -160)
      .runtime(game.runtimeNode("sf-sidewalk-left")),
    primitives
      .box({
        name: "sf-sidewalk-right",
        size: [8.5, 0.18, 420],
        material: sidewalkMat
      })
      .position(15.2, 0.09, -160)
      .runtime(game.runtimeNode("sf-sidewalk-right")),
    // Horizon Sky Backdrop & California Sun / Golden Gate Towers
    primitives
      .box({
        name: "sf-horizon-sky",
        size: [1400, 340, 2],
        material: material.emissive({ color: "#7ec8ff", emissive: "#bae6fd", emissiveIntensity: 0.35 })
      })
      .position(0, 72, -350)
      .runtime(game.runtimeNode("sf-horizon-sky")),
    primitives
      .sphere({
        name: "sf-sun-disc",
        size: [26, 26, 4],
        material: material.emissive({ color: "#fff4cc", emissive: "#fde047", emissiveIntensity: 1.65 })
      })
      .position(42, 58, -320)
      .runtime(game.runtimeNode("sf-sun-disc"))
  ]);

  // 2. Iconic San Francisco Landmarks: Transamerica Pyramid, Salesforce Tower & Golden Gate / Bay Bridge Suspension Towers
  const pyramidMat = material.pbr({ color: "#f1f5f9", roughness: 0.42, metalness: 0.18 });
  const salesforceGlassMat = material.pbr({ color: "#38bdf8", roughness: 0.18, metalness: 0.72 });
  const ggOrangeMat = material.pbr({ color: "#c0362c", roughness: 0.48, metalness: 0.35 });

  s.addMany([
    // Transamerica Pyramid (tapered white tower + east/west elevator shaft wings + glowing crown jewel)
    primitives
      .cylinder({
        name: "sf-transamerica-spire",
        size: [22, 145, 22],
        material: pyramidMat
      })
      .position(44, 72, -210)
      .runtime(game.runtimeNode("sf-transamerica-spire")),
    primitives
      .box({
        name: "sf-transamerica-wing",
        size: [28, 78, 8],
        material: pyramidMat
      })
      .position(44, 39, -210)
      .runtime(game.runtimeNode("sf-transamerica-wing")),
    primitives
      .sphere({
        name: "sf-transamerica-crown",
        size: [3.2, 5.5, 3.2],
        material: material.emissive({ color: "#e0f2fe", emissive: "#3fd6c6", emissiveIntensity: 2.2 })
      })
      .position(44, 145, -210)
      .runtime(game.runtimeNode("sf-transamerica-crown")),

    // Salesforce Tower (sculpted glass obelisk + glowing crown)
    primitives
      .cylinder({
        name: "sf-salesforce-tower",
        size: [22, 158, 22],
        material: salesforceGlassMat
      })
      .position(-48, 79, -235)
      .runtime(game.runtimeNode("sf-salesforce-tower")),
    primitives
      .cylinder({
        name: "sf-salesforce-crown",
        size: [18.5, 16, 18.5],
        material: material.emissive({ color: "#7dd3fc", emissive: "#38bdf8", emissiveIntensity: 1.65 })
      })
      .position(-48, 162, -235)
      .runtime(game.runtimeNode("sf-salesforce-crown")),

    // Golden Gate / Bay Bridge Suspension Towers on the Bay Horizon
    primitives
      .box({
        name: "sf-gg-tower-w-l",
        size: [3.5, 118, 3.5],
        material: ggOrangeMat
      })
      .position(-96, 59, -315)
      .runtime(game.runtimeNode("sf-gg-tower-w-l")),
    primitives
      .box({
        name: "sf-gg-tower-w-r",
        size: [3.5, 118, 3.5],
        material: ggOrangeMat
      })
      .position(-78, 59, -315)
      .runtime(game.runtimeNode("sf-gg-tower-w-r")),
    primitives
      .box({
        name: "sf-gg-strut-w-1",
        size: [21, 3.2, 3.8],
        material: ggOrangeMat
      })
      .position(-87, 108, -315)
      .runtime(game.runtimeNode("sf-gg-strut-w-1")),
    primitives
      .box({
        name: "sf-gg-strut-w-2",
        size: [21, 3.2, 3.8],
        material: ggOrangeMat
      })
      .position(-87, 78, -315)
      .runtime(game.runtimeNode("sf-gg-strut-w-2")),
    primitives
      .box({
        name: "sf-gg-tower-e-l",
        size: [3.5, 118, 3.5],
        material: ggOrangeMat
      })
      .position(78, 59, -315)
      .runtime(game.runtimeNode("sf-gg-tower-e-l")),
    primitives
      .box({
        name: "sf-gg-tower-e-r",
        size: [3.5, 118, 3.5],
        material: ggOrangeMat
      })
      .position(96, 59, -315)
      .runtime(game.runtimeNode("sf-gg-tower-e-r")),
    primitives
      .box({
        name: "sf-gg-strut-e-1",
        size: [21, 3.2, 3.8],
        material: ggOrangeMat
      })
      .position(87, 108, -315)
      .runtime(game.runtimeNode("sf-gg-strut-e-1")),
    primitives
      .box({
        name: "sf-gg-deck",
        size: [260, 2.2, 12],
        material: ggOrangeMat
      })
      .position(0, 36, -315)
      .runtime(game.runtimeNode("sf-gg-deck"))
  ]);

  // 3. 4 Admitted Skyline & Overpass 3D Models (heatsinkTowerL, heatsinkTowerT, heatsinkTowerX, heatsinkOverpass)
  s.addMany([
    model(assets.heatsinkTowerL, {
      name: "sf-skyline-tower-l",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 72
    })
      .position(-58, 0, -145)
      .runtime(game.runtimeNode("sf-skyline-tower-l")),
    model(assets.heatsinkTowerT, {
      name: "sf-skyline-tower-t",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 68
    })
      .position(58, 0, -135)
      .runtime(game.runtimeNode("sf-skyline-tower-t")),
    model(assets.heatsinkTowerX, {
      name: "sf-skyline-tower-x",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 74
    })
      .position(-62, 0, -255)
      .runtime(game.runtimeNode("sf-skyline-tower-x")),
    model(assets.heatsinkOverpass, {
      name: "sf-bay-overpass",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 64
    })
      .position(0, 0, -275)
      .runtime(game.runtimeNode("sf-bay-overpass")),
    model(v2Assets.gridTransamerica, {
      name: "v2-transamerica",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 145
    })
      .position(52, 0, -200)
      .runtime(game.runtimeNode("v2-transamerica")),
    model(v2Assets.gridFerryBuilding, {
      name: "v2-ferry",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 58
    })
      .position(-8, 0, -346)
      .runtime(game.runtimeNode("v2-ferry")),
    model(v2Assets.gridPaintedLadies, {
      name: "v2-ladies",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 26
    })
      .position(-38, 0, -120)
      .rotate(0, Math.PI * 0.5, 0)
      .runtime(game.runtimeNode("v2-ladies")),
    model(v2Assets.gridCablecarShelter, {
      name: "v2-shelter-a",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.4
    })
      .position(12.8, 0, -92)
      .runtime(game.runtimeNode("v2-shelter-a"))
  ]);

  // 4. White Lane Divider Dashes (2 dividers: x = -5.4m and x = +5.4m)
  const dashMat = material.emissive({ color: "#f8fafc", emissive: "#e2e8f0", emissiveIntensity: 0.45 });
  for (let d = 0; d < 2; d++) {
    const lx = d === 0 ? -5.4 : 5.4;
    for (let i = 0; i < DASH_ROWS; i++) {
      const id = `sf-dash-${d}-${i}`;
      s.add(
        primitives
          .box({
            name: id,
            size: [0.14, 0.02, 4.2],
            material: dashMat
          })
          .position(lx, 0.018, -i * DASH_STRIDE_Z)
          .runtime(game.runtimeNode(id))
      );
    }
  }

  // 5. Signalized Cross-Street Intersections (Cross Asphalt + Zebra Crosswalks + Traffic Signal Masts + Red/Yellow/Green Signal Heads)
  const crossRoadMat = material.pbr({ color: "#222834", roughness: 0.84 });
  const zebraMat = material.emissive({ color: "#f8fafc", emissive: "#e2e8f0", emissiveIntensity: 0.4 });
  const signalPoleMat = material.pbr({ color: "#334155", metalness: 0.72, roughness: 0.32 });
  const signalHeadMat = material.emissive({ color: "#43d17a", emissive: "#43d17a", emissiveIntensity: 2.1 });

  for (let i = 0; i < INTERSECTION_COUNT; i++) {
    const iz = -(i + 1) * INTERSECTION_STRIDE_Z;
    s.addMany([
      primitives
        .box({
          name: `sf-cross-road-${i}`,
          size: [140, 0.03, 14],
          material: crossRoadMat
        })
        .position(0, 0.01, iz)
        .runtime(game.runtimeNode(`sf-cross-road-${i}`)),
      primitives
        .box({
          name: `sf-crosswalk-n-${i}`,
          size: [19.6, 0.035, 2.2],
          material: zebraMat
        })
        .position(0, 0.022, iz - 8.2)
        .runtime(game.runtimeNode(`sf-crosswalk-n-${i}`)),
      primitives
        .box({
          name: `sf-crosswalk-s-${i}`,
          size: [19.6, 0.035, 2.2],
          material: zebraMat
        })
        .position(0, 0.022, iz + 8.2)
        .runtime(game.runtimeNode(`sf-crosswalk-s-${i}`)),
      primitives
        .cylinder({
          name: `sf-sig-pole-r-${i}`,
          size: [0.24, 6.8, 0.24],
          material: signalPoleMat
        })
        .position(11.4, 3.4, iz - 9.2)
        .runtime(game.runtimeNode(`sf-sig-pole-r-${i}`)),
      primitives
        .box({
          name: `sf-sig-arm-r-${i}`,
          size: [5.6, 0.16, 0.16],
          material: signalPoleMat
        })
        .position(8.6, 6.5, iz - 9.2)
        .runtime(game.runtimeNode(`sf-sig-arm-r-${i}`)),
      primitives
        .sphere({
          name: `sf-sig-light-r-${i}`,
          size: [0.52, 0.52, 0.52],
          material: signalHeadMat
        })
        .position(6.4, 6.25, iz - 9.1)
        .runtime(game.runtimeNode(`sf-sig-light-r-${i}`)),
      primitives
        .cylinder({
          name: `sf-sig-pole-l-${i}`,
          size: [0.24, 6.8, 0.24],
          material: signalPoleMat
        })
        .position(-11.4, 3.4, iz - 9.2)
        .runtime(game.runtimeNode(`sf-sig-pole-l-${i}`)),
      primitives
        .box({
          name: `sf-sig-arm-l-${i}`,
          size: [5.6, 0.16, 0.16],
          material: signalPoleMat
        })
        .position(-8.6, 6.5, iz - 9.2)
        .runtime(game.runtimeNode(`sf-sig-arm-l-${i}`)),
      primitives
        .sphere({
          name: `sf-sig-light-l-${i}`,
          size: [0.52, 0.52, 0.52],
          material: signalHeadMat
        })
        .position(-6.4, 6.25, iz - 9.1)
        .runtime(game.runtimeNode(`sf-sig-light-l-${i}`))
    ]);
  }

  // 6. San Francisco Street-Front Buildings (Victorian, Edwardian, Chinatown & FiDi Mid-Rises) & Streetlamps/Trees
  const buildingPalette = [
    "#cbd5e1",
    "#94a3b8",
    "#d6c7b2",
    "#7f1d1d",
    "#334155",
    "#e2e8f0",
    "#475569",
    "#b45309"
  ];
  for (let i = 0; i < BUILDING_PAIRS; i++) {
    const bz = -18 - i * BUILDING_STRIDE_Z;
    const hL = 18 + ((i * 7) % 22);
    const hR = 20 + ((i * 11) % 24);
    const colL = buildingPalette[i % buildingPalette.length]!;
    const colR = buildingPalette[(i + 3) % buildingPalette.length]!;
    s.addMany([
      primitives
        .box({
          name: `sf-bldg-l-${i}`,
          size: [14, hL, 22],
          material: material.pbr({ color: colL, roughness: 0.62, metalness: 0.18 })
        })
        .position(-26.5, hL * 0.5, bz)
        .runtime(game.runtimeNode(`sf-bldg-l-${i}`)),
      primitives
        .box({
          name: `sf-bldg-r-${i}`,
          size: [14, hR, 22],
          material: material.pbr({ color: colR, roughness: 0.62, metalness: 0.18 })
        })
        .position(26.5, hR * 0.5, bz)
        .runtime(game.runtimeNode(`sf-bldg-r-${i}`))
    ]);
  }

  const lampMat = material.emissive({ color: "#fef3c7", emissive: "#fbbf24", emissiveIntensity: 1.55 });
  const treeFoliageMat = material.pbr({ color: "#15803d", roughness: 0.78 });
  const treeTrunkMat = material.pbr({ color: "#5c4033", roughness: 0.88 });
  for (let i = 0; i < LAMP_PAIRS; i++) {
    const lz = -10 - i * LAMP_STRIDE_Z;
    s.addMany([
      primitives
        .cylinder({ name: `sf-lamp-l-${i}`, size: [0.16, 6.2, 0.16], material: signalPoleMat })
        .position(-11.2, 3.1, lz)
        .runtime(game.runtimeNode(`sf-lamp-l-${i}`)),
      primitives
        .sphere({ name: `sf-globe-l-${i}`, size: [0.42, 0.42, 0.42], material: lampMat })
        .position(-10.8, 6.25, lz)
        .runtime(game.runtimeNode(`sf-globe-l-${i}`)),
      primitives
        .cylinder({ name: `sf-lamp-r-${i}`, size: [0.16, 6.2, 0.16], material: signalPoleMat })
        .position(11.2, 3.1, lz)
        .runtime(game.runtimeNode(`sf-lamp-r-${i}`)),
      primitives
        .sphere({ name: `sf-globe-r-${i}`, size: [0.42, 0.42, 0.42], material: lampMat })
        .position(10.8, 6.25, lz)
        .runtime(game.runtimeNode(`sf-globe-r-${i}`)),
      primitives
        .cylinder({ name: `sf-tree-trunk-r-${i}`, size: [0.28, 3.2, 0.28], material: treeTrunkMat })
        .position(12.2, 1.6, lz - 14)
        .runtime(game.runtimeNode(`sf-tree-trunk-r-${i}`)),
      primitives
        .sphere({ name: `sf-tree-crown-r-${i}`, size: [2.6, 3.1, 2.6], material: treeFoliageMat })
        .position(12.2, 4.1, lz - 14)
        .runtime(game.runtimeNode(`sf-tree-crown-r-${i}`))
    ]);
  }

  // 7. 3D Glowing Apex Kerb Beacon (TaxiBeacon: Ring + Floor Disc + 36m Vertical Beam + Core + Waiting Passenger)
  const beaconTealMat = material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 2.1 });
  const beaconBeamMat = material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 1.35 });
  for (let i = 0; i < PATH_RIBBON_COUNT; i++) {
    s.add(
      primitives
        .box({
          name: `waymo-path-ribbon-${i}`,
          size: [1.35, 0.03, 3.2],
          material: beaconTealMat
        })
        .position(3.4, 0.03, -6 - i * 5.2)
        .runtime(game.runtimeNode(`waymo-path-ribbon-${i}`))
    );
  }

  s.addMany([
    primitives
      .torus({
        name: "taxi-beacon-ring",
        size: [2.1, 2.1, 0.14],
        material: beaconTealMat
      })
      .position(CURB_BEACON_X, 0.08, -38)
      .runtime(game.runtimeNode("taxi-beacon-ring")),
    primitives
      .cylinder({
        name: "taxi-beacon-disc",
        size: [1.85, 0.04, 1.85],
        material: beaconBeamMat
      })
      .position(CURB_BEACON_X, 0.04, -38)
      .runtime(game.runtimeNode("taxi-beacon-disc")),
    primitives
      .cylinder({
        name: "taxi-beacon-beam",
        size: [0.42, 34, 0.42],
        material: beaconBeamMat
      })
      .position(CURB_BEACON_X, 17, -38)
      .runtime(game.runtimeNode("taxi-beacon-beam")),
    primitives
      .cylinder({
        name: "taxi-beacon-core",
        size: [0.16, 36, 0.16],
        material: material.emissive({ color: "#ffffff", emissive: "#8ff0e6", emissiveIntensity: 2.4 })
      })
      .position(CURB_BEACON_X, 18, -38)
      .runtime(game.runtimeNode("taxi-beacon-core")),
    // 3D Waiting Passenger on Sidewalk beside Beacon
    primitives
      .cylinder({
        name: "taxi-passenger-body",
        size: [0.44, 1.35, 0.34],
        material: material.pbr({ color: "#38bdf8", roughness: 0.55 })
      })
      .position(11.35, 0.88, -38)
      .runtime(game.runtimeNode("taxi-passenger-body")),
    primitives
      .sphere({
        name: "taxi-passenger-head",
        size: [0.34, 0.36, 0.34],
        material: material.pbr({ color: "#fde68a", roughness: 0.6 })
      })
      .position(11.35, 1.76, -38)
      .runtime(game.runtimeNode("taxi-passenger-head")),
    primitives
      .box({
        name: "taxi-passenger-arm",
        size: [0.14, 0.58, 0.14],
        material: material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 1.2 })
      })
      .position(11.05, 1.55, -38)
      .runtime(game.runtimeNode("taxi-passenger-arm"))
  ]);

  // 8. 5 Playable Hero Vehicles (Apex I-PACE active by default; others swapped via Fleet Switcher)
  s.addMany([
    model(assets.teleopWaymoHero, {
      name: "player-car-waymo",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: PLAYABLE_FLEET.waymo.maxDim
    })
      .position(0, PLAYABLE_FLEET.waymo.rideY, -0.8)
      .runtime(game.runtimeNode("player-car-waymo", { tags: ["primarySubject", "primaryVehicle", "player"] })),

    model(assets.teleopCybercab, {
      name: "player-car-cybercab",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: PLAYABLE_FLEET.cybercab.maxDim
    })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-cybercab")),

    model(assets.teleopCybertruck, {
      name: "player-car-cybertruck",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: PLAYABLE_FLEET.cybertruck.maxDim
    })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-cybertruck")),

    model(assets.teleopCorvette, {
      name: "player-car-corvette",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: PLAYABLE_FLEET.corvette.maxDim
    })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-corvette")),

    model(assets.teleopMissions, {
      name: "player-car-roadster",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: PLAYABLE_FLEET.roadster.maxDim
    })
      .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-car-roadster")),

    // Auxiliary primitive nodes kept hidden (vehicles have baked PBR wheels, lamps, and LiDAR domes)
    primitives
      .cylinder({
        name: "player-lidar-dome",
        size: [0.46, 0.24, 0.46],
        material: material.pbr({ color: "#0f172a", metalness: 0.85, roughness: 0.14 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-lidar-dome")),
    primitives
      .torus({
        name: "player-lidar-ring",
        size: [0.28, 0.28, 0.045],
        material: material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 2.35 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-lidar-ring")),
    primitives
      .box({
        name: "player-lidar-fin",
        size: [0.38, 0.06, 0.08],
        material: material.emissive({ color: "#a5f3fc", emissive: "#38bdf8", emissiveIntensity: 2.1 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-lidar-fin")),
    primitives
      .sphere({
        name: "player-headlight-l",
        size: [0.24, 0.1, 0.16],
        material: material.emissive({ color: "#f0f9ff", emissive: "#bae6fd", emissiveIntensity: 1.8 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-headlight-l")),
    primitives
      .sphere({
        name: "player-headlight-r",
        size: [0.24, 0.1, 0.16],
        material: material.emissive({ color: "#f0f9ff", emissive: "#bae6fd", emissiveIntensity: 1.8 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-headlight-r")),
    primitives
      .box({
        name: "player-tailbar",
        size: [1.62, 0.08, 0.08],
        material: material.emissive({ color: "#ff1e27", emissive: "#ff1e27", emissiveIntensity: 1.95 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-tailbar")),
    primitives
      .cylinder({
        name: "player-thruster-l",
        size: [0.3, 1.35, 0.3],
        material: material.emissive({ color: "#67f3ff", emissive: "#38bdf8", emissiveIntensity: 2.0 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-thruster-l")),
    primitives
      .cylinder({
        name: "player-thruster-r",
        size: [0.3, 1.35, 0.3],
        material: material.emissive({ color: "#67f3ff", emissive: "#38bdf8", emissiveIntensity: 2.0 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-thruster-r")),
    primitives
      .cylinder({
        name: "player-contact-shadow",
        size: [2.25, 0.014, 4.55],
        material: material.pbr({ color: "#05070b", roughness: 0.96 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-contact-shadow"))
  ]);

  // 9. 5 Multiplayer Peer Vehicles (Textured GLBs + projected .mpTag nameplates)
  s.addMany([
    model(assets.teleopWaymoTraffic, {
      name: "peer-car-0",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 4.58
    })
      .position(-3.2, 0, -24)
      .runtime(game.runtimeNode("peer-car-0")),
    primitives
      .torus({
        name: "peer-waymo-lidar-ring",
        size: [0.28, 0.28, 0.045],
        material: material.emissive({ color: "#3fd6c6", emissive: "#3fd6c6", emissiveIntensity: 2.1 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("peer-waymo-lidar-ring")),

    model(assets.teleopCybercab, {
      name: "peer-car-1",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 4.42
    })
      .position(7.4, 0, -32)
      .runtime(game.runtimeNode("peer-car-1")),

    model(assets.teleopMissions, {
      name: "peer-car-2",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 4.5
    })
      .position(3.4, 0, -48)
      .runtime(game.runtimeNode("peer-car-2")),

    model(assets.teleopCablecar, {
      name: "peer-car-3",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 8.2
    })
      .position(-3.2, 0, -42)
      .runtime(game.runtimeNode("peer-car-3")),

    model(assets.teleopCorvette, {
      name: "peer-car-4",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 4.66
    })
      .position(-7.6, 0, -56)
      .runtime(game.runtimeNode("peer-car-4"))
  ]);

  // 10. 10 AI City Traffic Vehicles (2 Sedan, 2 Taxi, 2 SUV, 1 Van, 2 Pickup, 1 Transit Bus)
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
      model(spec.asset, {
        name: spec.id,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: spec.maxDim
      })
        .position(0, 0, -80)
        .runtime(game.runtimeNode(spec.id))
    );
  }

  return s;
}

// Project 3D view-space point [vx, vy, vz] to 2D viewport pixel coordinates [sx, sy, visible]
function projectViewPointToScreen(
  pt: Vec3,
  viewportW: number,
  viewportH: number
): { x: number; y: number; visible: boolean } {
  const fx = SCENE_CAM_TARGET[0] - SCENE_CAM_POS[0];
  const fy = SCENE_CAM_TARGET[1] - SCENE_CAM_POS[1];
  const fz = SCENE_CAM_TARGET[2] - SCENE_CAM_POS[2];
  const fLen = Math.hypot(fx, fy, fz) || 1;
  const fwd: Vec3 = [fx / fLen, fy / fLen, fz / fLen];

  // Right = normalize(cross(fwd, [0, 1, 0]))
  const rxRaw = -fwd[2];
  const rzRaw = fwd[0];
  const rLen = Math.hypot(rxRaw, rzRaw) || 1;
  const right: Vec3 = [rxRaw / rLen, 0, rzRaw / rLen];

  // Up = cross(right, fwd)
  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0]
  ];

  const dx = pt[0] - SCENE_CAM_POS[0];
  const dy = pt[1] - SCENE_CAM_POS[1];
  const dz = pt[2] - SCENE_CAM_POS[2];

  const cx = dx * right[0] + dy * right[1] + dz * right[2];
  const cy = dx * up[0] + dy * up[1] + dz * up[2];
  const cz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];

  if (cz <= 1.2 || cz > 240) {
    return { x: -999, y: -999, visible: false };
  }

  const tanHalfFov = Math.tan((SCENE_CAM_FOV_DEG * 0.5 * Math.PI) / 180);
  const aspect = Math.max(1, viewportW) / Math.max(1, viewportH);

  const ndcX = cx / (cz * tanHalfFov * aspect);
  const ndcY = cy / (cz * tanHalfFov);

  if (Math.abs(ndcX) > 1.12 || Math.abs(ndcY) > 1.12) {
    return { x: -999, y: -999, visible: false };
  }

  const sx = (ndcX * 0.5 + 0.5) * viewportW;
  const sy = (-ndcY * 0.5 + 0.5) * viewportH;
  return { x: sx, y: sy, visible: true };
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
    return `M${p0[0]} ${p0[1]}A${r} ${r} 0 ${largeArc} 1 ${p1[0]} ${p1[1]}`;
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

async function bootGridDispatchAura3D(): Promise<void> {
  const canvas = document.getElementById("c") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("Missing #c canvas element for Grid Dispatch.");
  }

  const builtScene = buildGridDispatchScene();
  const auraApp = createAuraApp(canvas, {
    scene: builtScene,
    renderer: {
      quality: "high",
      qualityRebuild: { flags: ["game", "-compiler", "-post", "-vfxFog"] }
    }
  });

  const req = (id: string) => auraApp.nodes.require(id);

  // Resolve Player Fleet Handles
  const playerCarHandles: Record<PlayableCarId, AuraRuntimeNodeHandle> = {
    waymo: req("player-car-waymo"),
    cybercab: req("player-car-cybercab"),
    cybertruck: req("player-car-cybertruck"),
    corvette: req("player-car-corvette"),
    roadster: req("player-car-roadster")
  };

  const playerLidarDome = req("player-lidar-dome");
  const playerLidarRing = req("player-lidar-ring");
  const playerLidarFin = req("player-lidar-fin");
  const playerHeadlightL = req("player-headlight-l");
  const playerHeadlightR = req("player-headlight-r");
  const playerTailbar = req("player-tailbar");
  const playerThrusterL = req("player-thruster-l");
  const playerThrusterR = req("player-thruster-r");
  const playerShadow = req("player-contact-shadow");

  // Resolve Environment & Landmark Handles
  const groundHandle = req("sf-peninsula-ground");
  const bayWaterHandle = req("sf-bay-water");
  const horizonSkyHandle = req("sf-horizon-sky");
  const sunDiscHandle = req("sf-sun-disc");

  const dashHandles: AuraRuntimeNodeHandle[][] = [0, 1].map((d) =>
    Array.from({ length: DASH_ROWS }, (_, i) => req(`sf-dash-${d}-${i}`))
  );

  const intersectionHandles = Array.from({ length: INTERSECTION_COUNT }, (_, i) => ({
    crossRoad: req(`sf-cross-road-${i}`),
    crosswalkN: req(`sf-crosswalk-n-${i}`),
    crosswalkS: req(`sf-crosswalk-s-${i}`),
    poleR: req(`sf-sig-pole-r-${i}`),
    armR: req(`sf-sig-arm-r-${i}`),
    lightR: req(`sf-sig-light-r-${i}`),
    poleL: req(`sf-sig-pole-l-${i}`),
    armL: req(`sf-sig-arm-l-${i}`),
    lightL: req(`sf-sig-light-l-${i}`)
  }));

  const buildingHandles = Array.from({ length: BUILDING_PAIRS }, (_, i) => ({
    left: req(`sf-bldg-l-${i}`),
    right: req(`sf-bldg-r-${i}`),
    hL: 18 + ((i * 7) % 22),
    hR: 20 + ((i * 11) % 24)
  }));

  const lampHandles = Array.from({ length: LAMP_PAIRS }, (_, i) => ({
    lampL: req(`sf-lamp-l-${i}`),
    globeL: req(`sf-globe-l-${i}`),
    lampR: req(`sf-lamp-r-${i}`),
    globeR: req(`sf-globe-r-${i}`),
    trunkR: req(`sf-tree-trunk-r-${i}`),
    crownR: req(`sf-tree-crown-r-${i}`)
  }));

  // Resolve Apex Beacon, Passenger & Path Ribbon Handles
  const pathRibbonHandles = Array.from({ length: PATH_RIBBON_COUNT }, (_, i) =>
    req(`waymo-path-ribbon-${i}`)
  );
  const beaconRingHandle = req("taxi-beacon-ring");
  const beaconDiscHandle = req("taxi-beacon-disc");
  const beaconBeamHandle = req("taxi-beacon-beam");
  const beaconCoreHandle = req("taxi-beacon-core");
  const passengerBodyHandle = req("taxi-passenger-body");
  const passengerHeadHandle = req("taxi-passenger-head");
  const passengerArmHandle = req("taxi-passenger-arm");

  // Resolve 5 Multiplayer Peer Handles
  const peerCarHandles = Array.from({ length: 5 }, (_, i) => req(`peer-car-${i}`));
  const peerApexLidarRing = req("peer-waymo-lidar-ring");

  // Resolve 10 AI Traffic Handles
  const trafficHandles = Array.from({ length: 10 }, (_, i) => req(`traffic-${i}`));

  // Live Simulation State
  const urlParams = new URLSearchParams(window.location.search);
  let framesRendered = 0;
  let simTime = 0;
  let activeCarId: PlayableCarId = "waymo";
  let autopilotLevel: AutopilotLevel =
    urlParams.get("autoplay") === "1" || urlParams.get("demo") === "1" ? "L5" : "MAN";
  let weatherPreset: WeatherPreset = "noon";
  let camMode: 0 | 1 | 2 | 3 = 0;
  let useMph = true;
  let absOn = true;
  let tcsOn = true;
  let espOn = true;

  // Player Kinematics (World Z decreases as we drive forward down California St)
  let playerX = 3.4;
  let playerY = 0;
  let playerZ = 0;
  let playerSpeedMps = 11.5; // Starts cruising smoothly in manual or L5
  let playerSteer = 0;
  let playerYaw = 0;
  let playerPitch = 0;
  let playerRoll = 0;
  let regenRatio = 0.22;
  let powerRatio = 0.44;
  let lastManualInputTime = -99;

  // Apex Robotaxi Fare State
  let fareIndex = 0;
  let rideState: RideLifecycleState = "offer";
  let rideStyle: RideStyle = "comfort";
  let totalEarningsUsd = 1420;
  let completedRides = 14;
  let ratingAvg = 4.96;
  let comfortScore = 98;
  let streetBounty = 4250;
  let streetMultiplier = 3.0;
  let beaconWorldZ = -115; // First Pickup (P) beacon 115m ahead on the right curb
  let stateTimerSec = 0;
  let rideElapsedSec = 0;
  let lastBeaconColorMode: "pickup" | "dropoff" = "pickup";

  // 5 Multiplayer Peers State
  const peers: PeerDriverState[] = [
    {
      id: "peer-0",
      handle: "devon_ai",
      carLabel: "Apex Cruiser",
      piClass: "S 918",
      piColor: "#3fd6c6",
      accent: "#3fd6c6",
      laneX: 7.4,
      targetLaneX: 7.4,
      zOffset: -22,
      speed: 14.8,
      baseSpeed: 14.8,
      rideY: 0,
      yawOffset: 0,
      isCableCar: false,
      worldX: 7.4,
      worldZ: -22,
      distanceMeters: 23
    },
    {
      id: "peer-1",
      handle: "kaya_sf",
      carLabel: "Cyber Coupe",
      piClass: "A 742",
      piColor: "#ffb347",
      accent: "#ffb347",
      laneX: -3.2,
      targetLaneX: -3.2,
      zOffset: -38,
      speed: 15.1,
      baseSpeed: 15.1,
      rideY: 0,
      yawOffset: 0,
      isCableCar: false,
      worldX: -3.2,
      worldZ: -38,
      distanceMeters: 38
    },
    {
      id: "peer-2",
      handle: "elena_x",
      carLabel: "Apex Interceptor",
      piClass: "X 999",
      piColor: "#c45bff",
      accent: "#c45bff",
      laneX: 3.4,
      targetLaneX: 3.4,
      zOffset: -46,
      speed: 15.8,
      baseSpeed: 15.8,
      rideY: 0,
      yawOffset: 0,
      isCableCar: false,
      worldX: 3.4,
      worldZ: -46,
      distanceMeters: 46
    },
    {
      id: "peer-3",
      handle: "sf_muni",
      carLabel: "Cable Car",
      piClass: "C 104",
      piColor: "#43d17a",
      accent: "#43d17a",
      laneX: -3.2,
      targetLaneX: -3.2,
      zOffset: -19,
      speed: 11.5,
      baseSpeed: 11.5,
      rideY: 0,
      yawOffset: Math.PI,
      isCableCar: true,
      worldX: -3.2,
      worldZ: -19,
      distanceMeters: 19
    },
    {
      id: "peer-4",
      handle: "marcus_v8",
      carLabel: "Vortex GT",
      piClass: "S 990",
      piColor: "#ff5a1f",
      accent: "#ff5a1f",
      laneX: -7.6,
      targetLaneX: -7.6,
      zOffset: -31,
      speed: 15.6,
      baseSpeed: 15.6,
      rideY: 0,
      yawOffset: 0,
      isCableCar: false,
      worldX: -7.6,
      worldZ: -31,
      distanceMeters: 32
    }
  ];

  // Create Floating Peer Nameplate DOM Elements (#mpTags > .mpTag)
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

  // 10 AI City Traffic Cars State
  const trafficCars: TrafficCarState[] = Array.from({ length: 10 }, (_, i) => {
    const oncoming = i < 4;
    const laneX = oncoming
      ? AVENUE_LANES_X[i % 2]!
      : AVENUE_LANES_X[2 + (i % 2)]!;
    return {
      slotIdx: i,
      laneX,
      z: -22 - i * 24,
      speed: oncoming ? 13 + (i % 3) * 2.2 : 10.5 + (i % 4) * 1.8,
      direction: oncoming ? -1 : 1,
      phase: i * 1.3
    };
  });

  // Keyboard Controls
  const keysHeld = new Set<string>();
  window.addEventListener("keydown", (ev) => {
    keysHeld.add(ev.code);
    if (
      ev.code === "KeyW" ||
      ev.code === "KeyA" ||
      ev.code === "KeyS" ||
      ev.code === "KeyD" ||
      ev.code === "ArrowUp" ||
      ev.code === "ArrowDown" ||
      ev.code === "ArrowLeft" ||
      ev.code === "ArrowRight" ||
      ev.code === "Space"
    ) {
      lastManualInputTime = simTime;
    }
    if (ev.code === "KeyI") {
      cycleAutopilotLevel();
    } else if (ev.code === "KeyC") {
      setCameraMode(((camMode + 1) % 4) as 0 | 1 | 2 | 3);
    } else if (ev.code === "KeyT") {
      const order: WeatherPreset[] = ["noon", "golden", "fog", "night"];
      const next = order[(order.indexOf(weatherPreset) + 1) % order.length]!;
      setWeatherPreset(next);
    } else if (ev.code === "KeyU") {
      useMph = !useMph;
      const unitEl = document.getElementById("unit");
      if (unitEl) unitEl.textContent = useMph ? "MPH" : "KM/H";
    } else if (ev.code === "KeyF") {
      advanceApexFareStage();
    } else if (ev.code === "Digit1") {
      selectPlayableVehicle("waymo");
    } else if (ev.code === "Digit2") {
      selectPlayableVehicle("cybercab");
    } else if (ev.code === "Digit3") {
      selectPlayableVehicle("cybertruck");
    } else if (ev.code === "Digit4") {
      selectPlayableVehicle("corvette");
    } else if (ev.code === "Digit5") {
      selectPlayableVehicle("roadster");
    }
  });

  window.addEventListener("keyup", (ev) => {
    keysHeld.delete(ev.code);
  });

  let toastTimeout = 0;
  function showToast(title: string, subtitle: string): void {
    const toastEl = document.getElementById("toast");
    if (!toastEl) return;
    toastEl.innerHTML = `<span>${title}</span><small>${subtitle}</small>`;
    toastEl.classList.add("on");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      toastEl.classList.remove("on");
    }, 2600);
  }

  function pushPenaltyOrBonusPopup(title: string, detail: string, kind: "good" | "bad" | "nfs"): void {
    const penEl = document.getElementById("taxiPen");
    if (!penEl) return;
    const pop = document.createElement("div");
    pop.className = `pop ${kind}`;
    pop.innerHTML = `<b>${title}</b><small>${detail}</small>`;
    penEl.appendChild(pop);
    while (penEl.children.length > 2) {
      penEl.firstElementChild?.remove();
    }
    window.setTimeout(() => {
      pop.remove();
    }, 2400);
  }

  function updateBeaconColors(mode: "pickup" | "dropoff"): void {
    if (mode === lastBeaconColorMode) return;
    lastBeaconColorMode = mode;
    const col = mode === "pickup" ? "#3fd6c6" : "#ffb347";
    const coreCol = mode === "pickup" ? "#a5f3fc" : "#fde68a";
    beaconRingHandle.setMaterial(
      material.emissive({ color: col, emissive: col, emissiveIntensity: 2.2 })
    );
    beaconDiscHandle.setMaterial(
      material.emissive({ color: col, emissive: col, emissiveIntensity: 1.45 })
    );
    beaconBeamHandle.setMaterial(
      material.emissive({ color: col, emissive: col, emissiveIntensity: 1.35 })
    );
    beaconCoreHandle.setMaterial(
      material.emissive({ color: "#ffffff", emissive: coreCol, emissiveIntensity: 2.4 })
    );
    for (const h of pathRibbonHandles) {
      h.setMaterial(material.emissive({ color: col, emissive: col, emissiveIntensity: 1.9 }));
    }
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
    if (!totalEl) return;
    totalEl.innerHTML = `<b>$${totalEarningsUsd.toLocaleString("en-US")}</b><small>${completedRides} rides · ★ ${ratingAvg.toFixed(2)} · Teleop Room #SF-401</small>`;
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
        hintEl.textContent =
          rideState === "boarding"
            ? `Boarding ${fare.passenger} at kerb…`
            : rideState === "alighting"
              ? `Dropping off ${fare.passenger} at kerb…`
              : `${autopilotLevel.startsWith("L5") ? "L5 Autonomous Approach" : "Pull up to the glowing kerb"} · ${formatDist(distToBeacon)}`;
      }
    }

    if (isOfferOrBoard && cardEl) {
      const tagText = rideState === "boarding" ? "PICKING UP · KERB LOCKED" : "NEW APEX FARE · PICKUP → DROPOFF";
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
          <div>
            <b>${fare.passenger}</b>
            <small>“${fare.quote}”</small>
          </div>
        </div>
        <div class="leg">
          <span class="dot p"></span>
          <div>
            <b>${fare.pickupName}</b>
            <small>${fare.pickupStreet}</small>
          </div>
          <em>${distText}</em>
        </div>
        <div class="leg">
          <span class="dot d"></span>
          <div>
            <b>${fare.dropoffName}</b>
            <small>${fare.tripMiles.toFixed(1)} mi · Fare $${fare.fareUsd.toFixed(2)}</small>
          </div>
          <em style="color:#ffb347">DROPOFF</em>
        </div>
      `;
    }

    if (isRideOrAlight && tripEl) {
      const timeLeft = Math.max(0, fare.parSec - rideElapsedSec);
      const distText = rideState === "alighting" ? "arrived" : formatDist(distToBeacon);
      const barRatio =
        rideStyle === "comfort"
          ? clamp(comfortScore / 100, 0.1, 1)
          : clamp((streetMultiplier - 1) / 4, 0.25, 1);

      tripEl.innerHTML = `
        <div class="tx-head">
          <div class="tg">ACTIVE TRIP · PICKUP → DROPOFF</div>
          <button type="button" class="style-toggle ${rideStyle === "street" ? "street" : ""}" data-toggle-style="1">
            ${rideStyle === "comfort" ? "Comfort Mode" : `Street Bounty ×${streetMultiplier.toFixed(1)}`}
          </button>
        </div>
        <div class="dst">
          <span class="dot d"></span>
          <div>
            <b>${fare.dropoffName}</b>
            <small>${fare.dropoffStreet} · Passenger: ${fare.passenger}</small>
          </div>
          <em style="font-family:var(--font-code);font-size:11px;color:#3fd6c6;font-style:normal">${fare.pickupName.split("·")[0]?.trim()} →</em>
        </div>
        <div class="row">
          <div>
            <small>DISTANCE</small>
            <b>${distText}</b>
          </div>
          <div>
            <small>TIME LEFT</small>
            <b>${formatClock(timeLeft)}</b>
          </div>
          <div>
            <small>FARE</small>
            <b>$${fare.fareUsd.toFixed(2)}</b>
          </div>
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
      const earned = Math.round(fare.fareUsd + tipUsd);
      sumEl.innerHTML = `
        <div class="tg">RIDE COMPLETE · APEX TELEOP</div>
        <div class="st">★★★★★</div>
        <div class="who2">${fare.passenger} · ${fare.pickupName} → ${fare.dropoffName}</div>
        <div class="ln"><span>Base Fare</span><b>$${fare.fareUsd.toFixed(2)}</b></div>
        <div class="ln"><span>${rideStyle === "comfort" ? `Comfort Tip (${Math.round(comfortScore)}%)` : `Street Bounty Bonus (×${streetMultiplier.toFixed(1)})`}</span><b style="color:#43d17a">+$${tipUsd.toFixed(2)}</b></div>
        <div class="tot"><span>EARNED</span><b>$${earned.toFixed(2)}</b></div>
      `;
    }

    // Bind dynamic Ride Style toggle button inside #taxiCard / #taxiTrip
    document.querySelectorAll<HTMLButtonElement>("[data-toggle-style]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        rideStyle = rideStyle === "comfort" ? "street" : "comfort";
        if (rideStyle === "street") {
          pushPenaltyOrBonusPopup("STREET BOUNTY ×3.0", "Near-miss & speed multiplier active", "nfs");
        } else {
          pushPenaltyOrBonusPopup("COMFORT 98% MODE", "Smooth autonomous deceleration & tip bonus", "good");
        }
        renderApexFareCards(distToBeacon);
      };
    });
  }

  function advanceApexFareStage(): void {
    const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
    if (rideState === "offer" || rideState === "boarding") {
      rideState = "ride";
      rideElapsedSec = 0;
      beaconWorldZ = playerZ - 145;
      updateBeaconColors("dropoff");
      pushPenaltyOrBonusPopup(`${fare.passenger} Aboard`, `En route to ${fare.dropoffName}`, "good");
    } else if (rideState === "ride" || rideState === "alighting") {
      const earned = Math.round(fare.fareUsd + (rideStyle === "comfort" ? 6.5 : 9.0));
      totalEarningsUsd += earned;
      completedRides += 1;
      ratingAvg = Math.min(5.0, Number((ratingAvg + 0.003).toFixed(2)));
      renderTaxiTotalDom();
      fareIndex = (fareIndex + 1) % WAYMO_FARES.length;
      rideState = "offer";
      beaconWorldZ = playerZ - 115;
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
    activeCarId = carId;
    const spec = PLAYABLE_FLEET[carId];
    initSpeedometerDial(spec.isIce);

    const gmodeEl = document.getElementById("gmode");
    if (gmodeEl) gmodeEl.textContent = spec.modeLabel;

    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-car]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.car === carId);
    });

    showToast(`Switched Vehicle: ${spec.name}`, `${spec.maker} · ${spec.modeLabel}`);
  }

  function cycleAutopilotLevel(): void {
    const order: AutopilotLevel[] = ["L5", "L5 MAX", "MAN", "L3", "L4"];
    const next = order[(order.indexOf(autopilotLevel) + 1) % order.length]!;
    setAutopilotLevel(next);
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
        level === "L5"
          ? "L5 Self-Driving"
          : level === "L5 MAX"
            ? "L5 Mad Max"
            : level === "L4"
              ? "L4 Lane Cruise"
              : level === "L3"
                ? "L3 Guidance"
                : "Manual Override";
      dockBtn.classList.toggle("active", level !== "MAN");
    }
    showToast(`Driver Assist: ${level}`, level.startsWith("L5") ? "Autonomous Apex route & kerb stops active" : "Use W/A/S/D or Arrows to drive");
  }

  function setCameraMode(mode: 0 | 1 | 2 | 3): void {
    camMode = mode;
    const names = ["Chase Cam", "Far Chase Cam", "Roof LiDAR Sensor Cam", "Front Bumper Cam"];
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-cam]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.cam) === mode);
    });
    showToast(names[mode]!, "Press C to cycle camera views");
  }

  function setWeatherPreset(preset: WeatherPreset): void {
    weatherPreset = preset;
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-tod]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tod === preset);
    });

    const presets: Record<
      WeatherPreset,
      { sky: string; horizonEmissive: string; sunColor: string; sunY: number; ground: string; water: string; label: string }
    > = {
      noon: {
        sky: "#69abe0",
        horizonEmissive: "#bae6fd",
        sunColor: "#fde047",
        sunY: 58,
        ground: "#1e293b",
        water: "#0c4a6e",
        label: "Sunny San Francisco Noon"
      },
      golden: {
        sky: "#d97757",
        horizonEmissive: "#fb923c",
        sunColor: "#f97316",
        sunY: 28,
        ground: "#271c24",
        water: "#1e3a5f",
        label: "California Golden Hour"
      },
      fog: {
        sky: "#94a3b8",
        horizonEmissive: "#cbd5e1",
        sunColor: "#e2e8f0",
        sunY: 46,
        ground: "#334155",
        water: "#3b5266",
        label: "Karl the Fog · Marine Layer"
      },
      night: {
        sky: "#090d16",
        horizonEmissive: "#1e293b",
        sunColor: "#38bdf8",
        sunY: 64,
        ground: "#0b0f19",
        water: "#081c2e",
        label: "San Francisco Neon Night"
      }
    };

    const cfg = presets[preset];
    (auraApp.scene as unknown as { background: string }).background = cfg.sky;
    horizonSkyHandle.setMaterial(
      material.emissive({ color: cfg.sky, emissive: cfg.horizonEmissive, emissiveIntensity: 0.35 })
    );
    sunDiscHandle
      .setPosition(42, cfg.sunY, -320)
      .setMaterial(material.emissive({ color: cfg.sunColor, emissive: cfg.sunColor, emissiveIntensity: 1.65 }));
    groundHandle.setMaterial(material.pbr({ color: cfg.ground, roughness: 0.94 }));
    bayWaterHandle.setMaterial(material.pbr({ color: cfg.water, roughness: 0.22, metalness: 0.45 }));

    showToast(cfg.label, "Shared with Teleop Room #SF-401");
  }

  function teleportToPeer(peerIdx: number): void {
    const peer = peers[peerIdx];
    if (!peer) return;
    playerX = clamp(peer.laneX, -7.6, 7.6);
    peer.zOffset = -18;
    showToast(`Driving with @${peer.handle}`, `${peer.carLabel} · ${peer.piClass} in Room #SF-401`);
  }

  function renderMultiplayerRoomList(): void {
    const listEl = document.getElementById("mpPeerList");
    if (!listEl) return;
    const spec = PLAYABLE_FLEET[activeCarId];
    let html = `<li class="me"><b style="color:#3fd6c6">@you_teleop (You)</b><small>${spec.name}</small></li>`;
    peers.forEach((peer, idx) => {
      html += `<li>
        <b>@${peer.handle}</b>
        <small>${peer.carLabel} · ${peer.distanceMeters} m</small>
        <button type="button" data-goto-peer="${idx}">Go to</button>
      </li>`;
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll<HTMLButtonElement>("[data-goto-peer]").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.gotoPeer ?? 0);
        teleportToPeer(idx);
      };
    });
  }

  // Bind UI Controls
  function bindGridDispatchUI(): void {
    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-car]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const carId = (btn.dataset.car as PlayableCarId) || "waymo";
        selectPlayableVehicle(carId);
      });
    });

    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-cam]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = clamp(Number(btn.dataset.cam ?? 0), 0, 3) as 0 | 1 | 2 | 3;
        setCameraMode(mode);
      });
    });

    document.querySelectorAll<HTMLButtonElement>("#teleopDock button[data-tod]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tod = (btn.dataset.tod as WeatherPreset) || "noon";
        setWeatherPreset(tod);
      });
    });

    document.getElementById("dockAutopilotBtn")?.addEventListener("click", () => cycleAutopilotLevel());
    document.getElementById("aDA")?.addEventListener("click", () => cycleAutopilotLevel());
    document.getElementById("bNextFare")?.addEventListener("click", () => advanceApexFareStage());

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
    document.getElementById("mpCloseBtn")?.addEventListener("click", () => {
      mpPanel?.classList.remove("on");
    });
    document.getElementById("mpCopyBtn")?.addEventListener("click", () => {
      showToast("Invite Link Copied", "https://teleoperator.mindblown.ai/?room=SF-401");
    });
    let nextPeerFocus = 0;
    document.getElementById("mpCyclePeerBtn")?.addEventListener("click", () => {
      teleportToPeer(nextPeerFocus % peers.length);
      nextPeerFocus += 1;
    });
    document.getElementById("mini")?.addEventListener("click", () => {
      teleportToPeer(nextPeerFocus % peers.length);
      nextPeerFocus += 1;
    });
  }

  // Render Bottom-Left 2D Vector Minimap (#miniC)
  const miniCanvas = document.getElementById("miniC") as HTMLCanvasElement | null;
  const miniCtx = miniCanvas?.getContext("2d") ?? null;

  function renderVectorMinimap(distToBeacon: number): void {
    if (!miniCtx || !miniCanvas) return;
    const w = miniCanvas.width;
    const h = miniCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.58;
    const scale = 2.1; // pixels per world meter

    miniCtx.clearRect(0, 0, w, h);

    // 1. Dark SF Peninsula background + Bay Water at top right
    miniCtx.fillStyle = "#0b1017";
    miniCtx.fillRect(0, 0, w, h);

    miniCtx.fillStyle = "#0c2d48";
    miniCtx.beginPath();
    miniCtx.moveTo(w * 0.72, 0);
    miniCtx.lineTo(w, 0);
    miniCtx.lineTo(w, h * 0.48);
    miniCtx.closePath();
    miniCtx.fill();

    // 2. SF City Blocks & Parks (Huntington Park / Portsmouth Sq)
    const scrollOffsetPx = ((-playerZ * scale) % 96 + 96) % 96;
    for (let row = -3; row <= 4; row++) {
      const by = cy + row * 96 + scrollOffsetPx - 42;
      for (let col = -3; col <= 3; col++) {
        if (col === 0) continue;
        const bx = cx + col * 68 - (col > 0 ? 22 : 42) - playerX * scale;
        const isPark = (row + col) % 4 === 0;
        miniCtx.fillStyle = isPark ? "#143326" : "#161f2c";
        miniCtx.strokeStyle = "rgba(255,255,255,0.08)";
        miniCtx.lineWidth = 1;
        miniCtx.fillRect(bx, by, 54, 72);
        miniCtx.strokeRect(bx, by, 54, 72);
      }
    }

    // 3. Orthogonal SF Street Grid (California St vertical corridor + cross streets)
    const roadCenterX = cx - playerX * scale;
    miniCtx.fillStyle = "#263244";
    miniCtx.fillRect(roadCenterX - 22, 0, 44, h);

    for (let row = -3; row <= 4; row++) {
      const iy = cy + row * 96 + scrollOffsetPx;
      miniCtx.fillStyle = "#222c3c";
      miniCtx.fillRect(0, iy - 12, w, 24);
    }

    // 4. Glowing Autonomous Route Line from Player to Active Pickup (P) or Dropoff (D) Beacon
    const beaconScreenX = roadCenterX + CURB_BEACON_X * scale;
    const beaconScreenY = clamp(cy - distToBeacon * scale, 26, h - 26);
    const routeColor = rideState === "offer" || rideState === "boarding" ? "#3fd6c6" : "#ffb347";

    miniCtx.strokeStyle = routeColor;
    miniCtx.lineWidth = 4.5;
    miniCtx.beginPath();
    miniCtx.moveTo(cx, cy);
    miniCtx.quadraticCurveTo(cx, (cy + beaconScreenY) * 0.5, beaconScreenX, beaconScreenY);
    miniCtx.stroke();

    // 5. Pickup (P) / Dropoff (D) Badge on Minimap
    miniCtx.fillStyle = routeColor;
    miniCtx.beginPath();
    miniCtx.arc(beaconScreenX, beaconScreenY, 11, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.fillStyle = "#061412";
    miniCtx.font = '600 12px "DIN Pro", sans-serif';
    miniCtx.textAlign = "center";
    miniCtx.textBaseline = "middle";
    miniCtx.fillText(rideState === "offer" || rideState === "boarding" ? "P" : "D", beaconScreenX, beaconScreenY + 0.5);

    // 6. AI Traffic Dots
    for (const tc of trafficCars) {
      const tx = roadCenterX + tc.laneX * scale;
      const ty = cy + (tc.z - playerZ) * scale;
      if (ty < 8 || ty > h - 8) continue;
      miniCtx.fillStyle = "#94a3b8";
      miniCtx.beginPath();
      miniCtx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      miniCtx.fill();
    }

    // 7. Multiplayer Peer Arrows
    for (const peer of peers) {
      const px = roadCenterX + peer.laneX * scale;
      const py = cy + peer.zOffset * scale;
      if (py < 12 || py > h - 12) continue;
      miniCtx.save();
      miniCtx.translate(px, py);
      miniCtx.fillStyle = peer.accent;
      miniCtx.beginPath();
      miniCtx.moveTo(0, -7);
      miniCtx.lineTo(5.5, 6);
      miniCtx.lineTo(0, 3.5);
      miniCtx.lineTo(-5.5, 6);
      miniCtx.closePath();
      miniCtx.fill();
      miniCtx.restore();
    }

    // 8. Player Vehicle Arrow at Center
    miniCtx.save();
    miniCtx.translate(cx, cy);
    miniCtx.rotate(-playerYaw);
    miniCtx.fillStyle = "rgba(63, 214, 198, 0.28)";
    miniCtx.beginPath();
    miniCtx.arc(0, 0, 14, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.fillStyle = "#ffffff";
    miniCtx.strokeStyle = "#071018";
    miniCtx.lineWidth = 2;
    miniCtx.beginPath();
    miniCtx.moveTo(0, -10);
    miniCtx.lineTo(7.5, 8);
    miniCtx.lineTo(0, 4.5);
    miniCtx.lineTo(-7.5, 8);
    miniCtx.closePath();
    miniCtx.fill();
    miniCtx.stroke();
    miniCtx.restore();
  }

  // Initialize Speedometer Dial & Initial UI
  initSpeedometerDial(false);
  bindGridDispatchUI();
  renderTaxiTotalDom();
  renderApexFareCards(115);
  renderMultiplayerRoomList();

  // Style Titan EV stainless steel and Apex pearl white body
  playerCarHandles.cybertruck.setMaterial(
    material.pbr({ color: "#cbd5e1", metalness: 0.8, roughness: 0.22 })
  );
  peerCarHandles[1]?.setMaterial(
    material.pbr({ color: "#e8c27a", metalness: 0.65, roughness: 0.26 })
  );

  // Wait for all GLB assets & scene nodes to finish loading before starting simulation or setting ready flags
  await auraApp.ready();
  setAutopilotLevel(autopilotLevel);

  // Main 60 FPS Simulation & Render Sync Loop (Required by @aura3d/engine)
  let lastHudDomUpdateSec = -1;
  let lastSignalPhase = -1;

  auraApp.onFrame(({ dt }) => {
    const safeDt = clamp(dt || 1 / 60, 0.001, 0.05);
    framesRendered += 1;
    simTime += safeDt;

    const spec = PLAYABLE_FLEET[activeCarId];
    const manualActive = autopilotLevel === "MAN";

    // 1. Update Apex Fare Lifecycle & L5 Autonomous Navigation
    const distToBeacon = Math.max(0, playerZ - beaconWorldZ);
    let targetSpeedMps = autopilotLevel === "L5 MAX" ? 21.5 : 15.2;
    let targetLaneX = 3.4;
    let brakeCueActive = false;

    if (rideState === "offer") {
      updateBeaconColors("pickup");
      if (distToBeacon < 46) {
        targetLaneX = CURB_BEACON_X - 0.9; // Pull smoothly toward the pickup curb
      }
      if (distToBeacon < 24) {
        targetSpeedMps = clamp(distToBeacon * 0.55, 2.2, 12.0);
      }
      if (distToBeacon < 4.2) {
        rideState = "boarding";
        stateTimerSec = 0;
        targetSpeedMps = 0;
        const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
        pushPenaltyOrBonusPopup(`Picking up ${fare.passenger}`, fare.pickupName, "good");
      }
    } else if (rideState === "boarding") {
      targetLaneX = CURB_BEACON_X - 0.9;
      targetSpeedMps = 0;
      stateTimerSec += safeDt;
      if (stateTimerSec >= 1.6) {
        rideState = "ride";
        rideElapsedSec = 0;
        beaconWorldZ = playerZ - 165;
        updateBeaconColors("dropoff");
        const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
        pushPenaltyOrBonusPopup(`${fare.passenger} Aboard`, `Destination: ${fare.dropoffName}`, "good");
      }
    } else if (rideState === "ride") {
      updateBeaconColors("dropoff");
      rideElapsedSec += safeDt;
      if (distToBeacon < 46) {
        targetLaneX = CURB_BEACON_X - 0.9;
      } else {
        // Weave smoothly between Eastbound lanes 3.4m and 7.4m around slower traffic
        targetLaneX = Math.sin(simTime * 0.35) > 0.35 ? 7.4 : 3.4;
      }
      if (distToBeacon < 24) {
        targetSpeedMps = clamp(distToBeacon * 0.55, 2.2, 12.5);
      }
      if (distToBeacon < 4.2) {
        rideState = "alighting";
        stateTimerSec = 0;
        targetSpeedMps = 0;
      }
    } else if (rideState === "alighting") {
      targetLaneX = CURB_BEACON_X - 0.9;
      targetSpeedMps = 0;
      stateTimerSec += safeDt;
      if (stateTimerSec >= 1.4) {
        const fare = WAYMO_FARES[fareIndex % WAYMO_FARES.length]!;
        const earned = Math.round(fare.fareUsd + (rideStyle === "comfort" ? 6.5 : 9.0));
        totalEarningsUsd += earned;
        completedRides += 1;
        renderTaxiTotalDom();
        rideState = "summary";
        stateTimerSec = 0;
      }
    } else if (rideState === "summary") {
      stateTimerSec += safeDt;
      targetSpeedMps = 13.5;
      targetLaneX = 3.4;
      if (stateTimerSec >= 2.6) {
        fareIndex = (fareIndex + 1) % WAYMO_FARES.length;
        rideState = "offer";
        beaconWorldZ = playerZ - 135;
        updateBeaconColors("pickup");
      }
    }

    // Obstacle avoidance in Player's lane for L3 / L4 / L5
    for (const tc of trafficCars) {
      if (tc.direction === 1) {
        const dz = playerZ - tc.z;
        if (dz > 0 && dz < 22 && Math.abs(tc.laneX - playerX) < 2.1) {
          if (autopilotLevel === "L3") {
            brakeCueActive = true;
          }
          if (!manualActive && distToBeacon > 38) {
            targetLaneX = tc.laneX > 5 ? 3.4 : 7.4;
          }
        }
      }
    }

    // 2. Apply Manual Input or Autonomous Control
    const throttleHeld = keysHeld.has("KeyW") || keysHeld.has("ArrowUp");
    const brakeHeld = keysHeld.has("KeyS") || keysHeld.has("ArrowDown");
    const leftHeld = keysHeld.has("KeyA") || keysHeld.has("ArrowLeft");
    const rightHeld = keysHeld.has("KeyD") || keysHeld.has("ArrowRight");
    const boostHeld = keysHeld.has("ShiftLeft") || keysHeld.has("ShiftRight");
    const driftHeld = keysHeld.has("Space");

    if (manualActive) {
      const steerInput = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
      playerSteer = lerp(playerSteer, steerInput, safeDt * 7.5);
      playerX = clamp(playerX + playerSteer * Math.max(4, playerSpeedMps * 0.55) * safeDt, -9.2, 9.2);

      if (throttleHeld) {
        const top = boostHeld ? spec.maxSpeedMps * 1.18 : spec.maxSpeedMps;
        playerSpeedMps = Math.min(top, playerSpeedMps + spec.accel * safeDt);
        powerRatio = clamp(playerSpeedMps / spec.maxSpeedMps + (boostHeld ? 0.25 : 0.12), 0.15, 1);
        regenRatio = boostHeld ? 0.92 : 0.08;
      } else if (brakeHeld) {
        playerSpeedMps = Math.max(0, playerSpeedMps - 26 * safeDt);
        powerRatio = 0.05;
        regenRatio = 0.88;
      } else {
        // EV urban cruise coasting floor so the vehicle keeps rolling until S/ArrowDown is pressed
        playerSpeedMps =
          playerSpeedMps > 9.5
            ? Math.max(9.5, playerSpeedMps - 3.2 * safeDt)
            : Math.min(9.5, playerSpeedMps + 4.0 * safeDt);
        powerRatio = clamp((playerSpeedMps / spec.maxSpeedMps) * 0.6, 0.18, 0.7);
        regenRatio = 0.22;
      }
      // Keep beacon ahead if player passes it in manual mode without stopping
      if (playerZ < beaconWorldZ - 12) {
        beaconWorldZ = playerZ - 125;
      }
    } else {
      const dx = targetLaneX - playerX;
      playerSteer = clamp(dx * 0.35, -0.65, 0.65);
      playerX = lerp(playerX, targetLaneX, safeDt * 3.1);
      const speedDiff = targetSpeedMps - playerSpeedMps;
      playerSpeedMps = clamp(
        playerSpeedMps + clamp(speedDiff * 2.6, -16, spec.accel) * safeDt,
        0,
        spec.maxSpeedMps
      );
      powerRatio = clamp(
        (playerSpeedMps / spec.maxSpeedMps) * 0.85 + Math.max(0, speedDiff * 0.04),
        0.04,
        0.96
      );
      regenRatio = speedDiff < -0.6 ? clamp(-speedDiff * 0.16, 0.25, 0.95) : 0.22;
    }

    // Advance Player World Z along California Street
    playerZ -= playerSpeedMps * safeDt;
    playerYaw = clamp(-playerSteer * 0.16, -0.28, 0.28);
    playerRoll = clamp(playerSteer * 0.045, -0.08, 0.08);
    playerPitch = clamp((targetSpeedMps - playerSpeedMps) * 0.004, -0.03, 0.03);

    // Drift & Brake Cue Overlays
    document.getElementById("drift")?.classList.toggle("on", driftHeld && playerSpeedMps > 10);
    document.getElementById("brakeCue")?.classList.toggle("on", brakeCueActive);

    // Camera Mode Offsets (Chase, Far Chase, Roof LiDAR Cam, Bumper)
    const camOffsets: Record<0 | 1 | 2 | 3, { y: number; z: number }> = {
      0: { y: 0, z: 0 },
      1: { y: -0.55, z: -2.4 },
      2: { y: 1.45, z: 5.2 },
      3: { y: 2.15, z: 7.4 }
    };
    const camOff = camOffsets[camMode];
    const rx = (wx: number) => wx - playerX * 0.72;
    const ry = (wy: number) => wy - playerY + camOff.y;
    const rz = (wz: number) => wz - playerZ + camOff.z;

    // 3. Sync Player Hero Vehicle & Spinning Apex Roof LiDAR Sensor Suite
    const pRoot: Vec3 = [rx(playerX), ry(playerY + spec.rideY), -0.8 + camOff.z];
    for (const id of PLAYABLE_IDS) {
      const h = playerCarHandles[id];
      if (id === activeCarId) {
        h.setPosition(pRoot[0], pRoot[1], pRoot[2])
          .setRotation(playerPitch, playerYaw, playerRoll)
          .setScale([1, 1, 1])
          .setVisible(true);
      } else {
        h.setPosition(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
          .setScale(HIDDEN_SCALE)
          .setVisible(false);
      }
    }

    // Keep auxiliary primitive attachments hidden so baked 3D vehicle GLBs render cleanly
    playerLidarDome.setScale(HIDDEN_SCALE).setVisible(false);
    playerLidarRing.setScale(HIDDEN_SCALE).setVisible(false);
    playerLidarFin.setScale(HIDDEN_SCALE).setVisible(false);
    playerHeadlightL.setScale(HIDDEN_SCALE).setVisible(false);
    playerHeadlightR.setScale(HIDDEN_SCALE).setVisible(false);
    playerTailbar.setScale(HIDDEN_SCALE).setVisible(false);
    playerThrusterL.setScale(HIDDEN_SCALE).setVisible(false);
    playerThrusterR.setScale(HIDDEN_SCALE).setVisible(false);
    playerShadow.setScale(HIDDEN_SCALE).setVisible(false);

    // 4. Sync Scrolling SF Lane Dashes, Signalized Intersections, Buildings & Streetlamps
    const dashBaseZ = Math.floor(playerZ / DASH_STRIDE_Z) * DASH_STRIDE_Z + DASH_STRIDE_Z;
    for (let d = 0; d < 2; d++) {
      const lx = rx(d === 0 ? -5.4 : 5.4);
      const col = dashHandles[d]!;
      for (let i = 0; i < DASH_ROWS; i++) {
        col[i]!.setPosition(lx, ry(0.018), rz(dashBaseZ - i * DASH_STRIDE_Z));
      }
    }

    // Signal Phasing: Green wave (10s Green, 2.5s Yellow, 3.5s Red cycle)
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
    }

    const interBaseZ = Math.floor(playerZ / INTERSECTION_STRIDE_Z) * INTERSECTION_STRIDE_Z;
    for (let i = 0; i < INTERSECTION_COUNT; i++) {
      const iz = rz(interBaseZ - i * INTERSECTION_STRIDE_Z);
      const slot = intersectionHandles[i]!;
      slot.crossRoad.setPosition(rx(0), ry(0.01), iz);
      slot.crosswalkN.setPosition(rx(0), ry(0.022), iz - 8.2);
      slot.crosswalkS.setPosition(rx(0), ry(0.022), iz + 8.2);
      slot.poleR.setPosition(rx(11.4), ry(3.4), iz - 9.2);
      slot.armR.setPosition(rx(8.6), ry(6.5), iz - 9.2);
      slot.lightR.setPosition(rx(6.4), ry(6.25), iz - 9.1);
      slot.poleL.setPosition(rx(-11.4), ry(3.4), iz - 9.2);
      slot.armL.setPosition(rx(-8.6), ry(6.5), iz - 9.2);
      slot.lightL.setPosition(rx(-6.4), ry(6.25), iz - 9.1);
    }

    const bldgBaseZ = Math.floor(playerZ / BUILDING_STRIDE_Z) * BUILDING_STRIDE_Z + BUILDING_STRIDE_Z;
    for (let i = 0; i < BUILDING_PAIRS; i++) {
      const bz = rz(bldgBaseZ - i * BUILDING_STRIDE_Z);
      const b = buildingHandles[i]!;
      b.left.setPosition(rx(-26.5), ry(b.hL * 0.5), bz);
      b.right.setPosition(rx(26.5), ry(b.hR * 0.5), bz);
    }

    const lampBaseZ = Math.floor(playerZ / LAMP_STRIDE_Z) * LAMP_STRIDE_Z + LAMP_STRIDE_Z;
    for (let i = 0; i < LAMP_PAIRS; i++) {
      const lz = rz(lampBaseZ - i * LAMP_STRIDE_Z);
      const l = lampHandles[i]!;
      l.lampL.setPosition(rx(-11.2), ry(3.1), lz);
      l.globeL.setPosition(rx(-10.8), ry(6.25), lz);
      l.lampR.setPosition(rx(11.2), ry(3.1), lz);
      l.globeR.setPosition(rx(10.8), ry(6.25), lz);
      l.trunkR.setPosition(rx(12.2), ry(1.6), lz - 14);
      l.crownR.setPosition(rx(12.2), ry(4.1), lz - 14);
    }

    // 5. Sync 3D Apex Kerb Beacon, Waiting Passenger & Autonomous Path Ribbon
    const pulse = 0.5 + 0.5 * Math.sin(simTime * 3.8);
    const bViewX = rx(CURB_BEACON_X);
    const bViewZ = rz(beaconWorldZ);
    const ringScale = 1 + 0.08 * pulse;
    beaconRingHandle
      .setPosition(bViewX, ry(0.08), bViewZ)
      .setRotation(Math.PI * 0.5, simTime * 1.4, 0)
      .setScale([ringScale, ringScale, 1])
      .setVisible(true);
    beaconDiscHandle
      .setPosition(bViewX, ry(0.04), bViewZ)
      .setScale([1, 1, 1])
      .setVisible(true);
    beaconBeamHandle
      .setPosition(bViewX, ry(17), bViewZ)
      .setScale([0.92 + pulse * 0.14, 1, 0.92 + pulse * 0.14])
      .setVisible(true);
    beaconCoreHandle
      .setPosition(bViewX, ry(18), bViewZ)
      .setScale([1, 1, 1])
      .setVisible(true);

    // Waiting / waving passenger at Pickup or Alighting
    const showPassenger = rideState === "offer" || rideState === "boarding" || rideState === "alighting";
    if (showPassenger) {
      const walkProgress = rideState === "boarding" ? clamp(stateTimerSec / 1.5, 0, 1) : 0;
      const pedWorldX = lerp(11.35, CURB_BEACON_X + 0.85, walkProgress);
      const pvX = rx(pedWorldX);
      const waveAngle = Math.sin(simTime * 8.5) * 0.45;
      passengerBodyHandle.setPosition(pvX, ry(0.88), bViewZ).setScale([1, 1, 1]).setVisible(true);
      passengerHeadHandle.setPosition(pvX, ry(1.76), bViewZ).setScale([1, 1, 1]).setVisible(true);
      passengerArmHandle
        .setPosition(pvX - 0.28, ry(1.55), bViewZ)
        .setRotation(0, 0, 0.55 + waveAngle)
        .setScale([1, 1, 1])
        .setVisible(true);
    } else {
      passengerBodyHandle.setScale(HIDDEN_SCALE).setVisible(false);
      passengerHeadHandle.setScale(HIDDEN_SCALE).setVisible(false);
      passengerArmHandle.setScale(HIDDEN_SCALE).setVisible(false);
    }

    // 9-Segment Glowing Autonomous Telemetry Path Ribbon ahead of Player
    for (let i = 0; i < PATH_RIBBON_COUNT; i++) {
      const frac = (i + 1) / PATH_RIBBON_COUNT;
      const segWorldZ = playerZ - 5.5 - i * 5.4;
      const pullToCurb = distToBeacon < 58 ? clamp(1 - Math.abs(segWorldZ - beaconWorldZ) / 52, 0, 1) : 0;
      const segWorldX = lerp(playerX, pullToCurb > 0.2 ? CURB_BEACON_X - 0.8 : targetLaneX, frac * 0.85);
      const nextWorldX = lerp(playerX, pullToCurb > 0.2 ? CURB_BEACON_X - 0.8 : targetLaneX, Math.min(1, (i + 2) / PATH_RIBBON_COUNT));
      const ribbonYaw = Math.atan2(-(nextWorldX - segWorldX), 5.4);
      const waveBrightness = 0.82 + 0.24 * Math.sin(simTime * 7 - i * 0.7);
      pathRibbonHandles[i]!
        .setPosition(rx(segWorldX), ry(0.032), rz(segWorldZ))
        .setRotation(0, ribbonYaw, 0)
        .setScale([waveBrightness, 1, 1])
        .setVisible(true);
    }

    // 6. Sync 5 Multiplayer Peer Vehicles & Project 3D-to-2D Floating Nameplates (.mpTag)
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;

    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i]!;
      const handle = peerCarHandles[i]!;

      // Relative longitudinal motion so peers stay within visible range (-68m to -14m) in front of the camera
      const relSpeed = peer.baseSpeed + Math.sin(simTime * 0.7 + i * 1.4) * 2.2 - playerSpeedMps;
      peer.zOffset += relSpeed * safeDt * 0.35;
      if (peer.zOffset > -13) peer.zOffset = -64;
      if (peer.zOffset < -68) peer.zOffset = -16;

      if (!peer.isCableCar) {
        const laneWave = Math.sin(simTime * 0.42 + i * 2.1);
        peer.laneX = lerp(peer.laneX, peer.targetLaneX + laneWave * 0.55, safeDt * 2.0);
      }

      peer.worldX = peer.laneX;
      peer.worldZ = playerZ + peer.zOffset;
      peer.distanceMeters = Math.max(8, Math.round(Math.hypot(peer.worldX - playerX, peer.zOffset)));

      const pvx = rx(peer.worldX);
      const pvy = ry(peer.rideY);
      const pvz = peer.zOffset + camOff.z;

      handle
        .setPosition(pvx, pvy, pvz)
        .setRotation(0, peer.yawOffset, 0)
        .setScale([1, 1, 1])
        .setVisible(true);

      if (i === 0) {
        peerApexLidarRing.setScale(HIDDEN_SCALE).setVisible(false);
      }

      // Project 3D Roof Anchor to 2D Screen for .mpTag
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

    // 7. Sync 10 AI City Traffic Vehicles
    for (let i = 0; i < trafficCars.length; i++) {
      const tc = trafficCars[i]!;
      const th = trafficHandles[i]!;

      if (tc.direction === 1) {
        tc.z -= tc.speed * safeDt;
        if (tc.z > playerZ + 18) tc.z = playerZ - 195;
        if (tc.z < playerZ - 205) tc.z = playerZ + 12;
      } else {
        // Oncoming Westbound traffic
        tc.z += tc.speed * safeDt;
        if (tc.z > playerZ + 22) tc.z = playerZ - 210 - (i % 3) * 18;
      }

      const tvx = rx(tc.laneX);
      const tvy = ry(0);
      const tvz = rz(tc.z);
      const tyaw = tc.direction === 1 ? Math.PI : 0;

      th.setPosition(tvx, tvy, tvz)
        .setRotation(0, tyaw, 0)
        .setScale([1, 1, 1])
        .setVisible(tvz < 18 && tvz > -220);
    }

    // 8. Update Speedometer Dial (#hud / #dial), District (#where), Apex Cards & Vector Minimap
    const displaySpeed = Math.round(playerSpeedMps * (useMph ? 2.23694 : 3.6));
    const spdEl = document.getElementById("spd");
    if (spdEl) spdEl.textContent = String(displaySpeed).padStart(3, "0");

    const gearEl = document.getElementById("gear");
    if (gearEl) {
      gearEl.textContent = spec.isIce
        ? String(clamp(Math.ceil(displaySpeed / 18), 1, 8))
        : brakeHeld && playerSpeedMps < 0.5
          ? "R"
          : "D";
    }

    const rpmPath = document.getElementById("rpm");
    if (rpmPath) {
      rpmPath.style.strokeDashoffset = (100 - clamp(powerRatio * 100, 3, 98)).toFixed(1);
    }
    const nosPath = document.getElementById("nos");
    if (nosPath) {
      nosPath.style.strokeDashoffset = (100 - clamp(regenRatio * 100, 6, 98)).toFixed(1);
    }

    // Update District (#where) & Fare Card DOM at 10 Hz
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
    }

    renderVectorMinimap(distToBeacon);

    // 9. Expose Aura3D Runtime Evidence & Grid Dispatch Telemetry
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
      streetBounty,
      player: {
        position: [Number(playerX.toFixed(2)), Number(playerY.toFixed(2)), Number(playerZ.toFixed(2))],
        speedMps: Number(playerSpeedMps.toFixed(2)),
        speedMph: displaySpeed
      },
      peers: peers.map((p) => ({
        handle: p.handle,
        car: p.carLabel,
        distanceMeters: p.distanceMeters
      }))
    };

    (window as unknown as Record<string, unknown>).__AURA3D_GAME_EVIDENCE__ = evidence;
    (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = evidence;
    const handleObj = {
      app: auraApp,
      evidence,
      selectPlayableVehicle,
      setAutopilotLevel,
      setCameraMode,
      setWeatherPreset,
      advanceApexFareStage,
      teleportToPeer
    };
    (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_TELEOPERATOR__ = handleObj;
    (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_TELEOPERATOR_V2__ = handleObj;
  });

  auraApp.step(1 / 60);
  document.getElementById("boot")?.classList.add("done");
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  auraApp.resume();
}

void bootGridDispatchAura3D();
