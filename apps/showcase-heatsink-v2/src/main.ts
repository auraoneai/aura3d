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
  type AuraAssetDefinition,
  type AuraAssetRef,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { assets as catalogAssets } from "../../../src/aura-assets";
import { v2Assets } from "./aura-assets-v2";

const heatsinkFallbackDefinitions = {
  heatsinkArch: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkArch.9a90ebd4.glb",
    hash: "sha256-9a90ebd4",
    bounds: [28, 16, 8]
  },
  heatsinkBarrierA: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkBarrierA.ac31de34.glb",
    hash: "sha256-ac31de34",
    bounds: [4.2, 1.4, 1.2]
  },
  heatsinkBoostPad: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkBoostPad.e58b4f3c.glb",
    hash: "sha256-e58b4f3c",
    bounds: [4.5, 0.35, 5.5]
  },
  heatsinkCheckpointRing: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkCheckpointRing.67ee1db8.glb",
    hash: "sha256-67ee1db8",
    bounds: [18, 18, 2.4]
  },
  heatsinkCoolingCanister: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkCoolingCanister.0199c8d5.glb",
    hash: "sha256-0199c8d5",
    bounds: [1.4, 2.2, 1.4]
  },
  heatsinkDroneBastion: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneBastion.6a09c499.glb",
    hash: "sha256-6a09c499",
    bounds: [3.2, 1.2, 3.8]
  },
  heatsinkDroneNighthawk: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneNighthawk.8113ba27.glb",
    hash: "sha256-8113ba27",
    bounds: [3.1, 1.1, 3.7]
  },
  heatsinkDroneOrion: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneOrion.988f172d.glb",
    hash: "sha256-988f172d",
    bounds: [3.0, 1.1, 3.6]
  },
  heatsinkDroneRazor: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneRazor.2f28a258.glb",
    hash: "sha256-2f28a258",
    bounds: [3.1, 1.1, 3.6]
  },
  heatsinkDroneSpectre: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneSpectre.f66809c1.glb",
    hash: "sha256-f66809c1",
    bounds: [3.0, 1.05, 3.7]
  },
  heatsinkDroneVolt: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneVolt.f1825d10.glb",
    hash: "sha256-f1825d10",
    bounds: [2.9, 1.0, 3.5]
  },
  heatsinkDroneWraith: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkDroneWraith.c0a00195.glb",
    hash: "sha256-c0a00195",
    bounds: [2.95, 1.0, 3.6]
  },
  heatsinkExplosiveBarrel: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkExplosiveBarrel.543538b2.glb",
    hash: "sha256-543538b2",
    bounds: [1.3, 1.9, 1.3]
  },
  heatsinkGantryStart: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkGantryStart.7f73743e.glb",
    hash: "sha256-7f73743e",
    bounds: [28, 14, 6]
  },
  heatsinkHoloBillboard: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkHoloBillboard.d3d7edc7.glb",
    hash: "sha256-d3d7edc7",
    bounds: [12, 8, 2.2]
  },
  heatsinkLavaFall: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkLavaFall.71c51eb3.glb",
    hash: "sha256-71c51eb3",
    bounds: [10, 22, 6]
  },
  heatsinkOverpass: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkOverpass.c6bb161f.glb",
    hash: "sha256-c6bb161f",
    bounds: [32, 14, 10]
  },
  heatsinkShieldPickup: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkShieldPickup.e3b41a15.glb",
    hash: "sha256-e3b41a15",
    bounds: [1.8, 1.8, 1.8]
  },
  heatsinkStatue: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkStatue.7ac4ef8a.glb",
    hash: "sha256-7ac4ef8a",
    bounds: [14, 28, 14]
  },
  heatsinkTowerL: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerL.48cef1cc.glb",
    hash: "sha256-48cef1cc",
    bounds: [22, 64, 22]
  },
  heatsinkTowerT: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerT.3e5f0a0c.glb",
    hash: "sha256-3e5f0a0c",
    bounds: [24, 72, 24]
  },
  heatsinkTowerX: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTowerX.69d0e56e.glb",
    hash: "sha256-69d0e56e",
    bounds: [26, 78, 26]
  },
  heatsinkTunnelFrame: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkTunnelFrame.1678ba89.glb",
    hash: "sha256-1678ba89",
    bounds: [26, 15, 8]
  },
  heatsinkWaterEmitter: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWaterEmitter.7721726f.glb",
    hash: "sha256-7721726f",
    bounds: [8, 14, 5]
  },
  heatsinkWeaponMine: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWeaponMine.10baedc3.glb",
    hash: "sha256-10baedc3",
    bounds: [1.6, 0.9, 1.6]
  },
  heatsinkWeaponShockwave: {
    type: "model",
    format: "glb",
    url: "/aura-assets/heatsinkWeaponShockwave.816dd6ed.glb",
    hash: "sha256-816dd6ed",
    bounds: [2.4, 0.8, 2.4]
  }
} satisfies Record<string, AuraAssetDefinition>;

const assets = {
  ...defineAuraAssets(heatsinkFallbackDefinitions),
  ...catalogAssets
};

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
  readonly asset: AuraAssetRef<"model">;
}

export interface CircuitSector {
  readonly name: string;
  readonly startFrac: number;
  readonly curvature: number;
  readonly pitchSlope: number;
}

export interface CircuitSpec {
  readonly id: CircuitId;
  readonly name: string;
  readonly shortName: string;
  readonly length: number;
  readonly skyColor: string;
  readonly fogTint: string;
  readonly accentColor: string;
  readonly sectors: readonly CircuitSector[];
}

const DRONE_SPECS: Record<DroneId, DroneSpec> = {
  orion: {
    id: "orion",
    name: "ORION",
    tag: "Balanced. Reliable. Built to race.",
    speed: 8,
    armour: 5,
    laser: 6,
    boost: 8,
    color: "#d2561c",
    nodeId: "drone-orion",
    maxDim: 3.8,
    asset: assets.heatsinkDroneOrion
  },
  volt: {
    id: "volt",
    name: "VOLT",
    tag: "Light frame. Brutal acceleration.",
    speed: 9,
    armour: 3,
    laser: 6,
    boost: 9,
    color: "#1f9dff",
    nodeId: "drone-volt",
    maxDim: 3.6,
    asset: assets.heatsinkDroneVolt
  },
  bastion: {
    id: "bastion",
    name: "BASTION",
    tag: "Heavy armour. Takes the hits.",
    speed: 6,
    armour: 9,
    laser: 5,
    boost: 6,
    color: "#1438df",
    nodeId: "drone-bastion",
    maxDim: 4.1,
    asset: assets.heatsinkDroneBastion
  },
  spectre: {
    id: "spectre",
    name: "SPECTRE",
    tag: "Cool-running guns. Long bursts.",
    speed: 7,
    armour: 6,
    laser: 9,
    boost: 7,
    color: "#d999ad",
    nodeId: "drone-spectre",
    maxDim: 3.75,
    asset: assets.heatsinkDroneSpectre
  },
  razor: {
    id: "razor",
    name: "RAZOR",
    tag: "Armoured brawler. Holds the racing line.",
    speed: 7,
    armour: 7,
    laser: 6,
    boost: 7,
    color: "#ad1060",
    nodeId: "drone-razor",
    maxDim: 3.85,
    asset: assets.heatsinkDroneRazor
  },
  nighthawk: {
    id: "nighthawk",
    name: "NIGHTHAWK",
    tag: "Heavy firepower. Sustained pressure.",
    speed: 7,
    armour: 6,
    laser: 8,
    boost: 6,
    color: "#611a78",
    nodeId: "drone-nighthawk",
    maxDim: 3.85,
    asset: assets.heatsinkDroneNighthawk
  },
  wraith: {
    id: "wraith",
    name: "WRAITH",
    tag: "Light interceptor. Speed over armour.",
    speed: 8,
    armour: 4,
    laser: 7,
    boost: 8,
    color: "#0d8ca8",
    nodeId: "drone-wraith",
    maxDim: 3.7,
    asset: assets.heatsinkDroneWraith
  }
};

const DRONE_ORDER: readonly DroneId[] = [
  "orion",
  "volt",
  "bastion",
  "spectre",
  "razor",
  "nighthawk",
  "wraith"
];

const RIVAL_PILOT_NAMES: readonly string[] = [
  "Vex Rallo",
  "Kira Dune",
  "Old Mott",
  "Saba Teel",
  "Rook Varn",
  "Jix Polo",
  "Mara Quell",
  "Dusk Ondo",
  "Tavi Rhee",
  "Gorran",
  "Zell Fane"
];

const CIRCUITS: Record<CircuitId, CircuitSpec> = {
  grand: {
    id: "grand",
    name: "GRAND CIRCUIT · MEGACITY",
    shortName: "MEGACITY",
    length: 2400,
    skyColor: "#11151d",
    fogTint: "#1a2230",
    accentColor: "#ff4d1f",
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
    skyColor: "#1a1410",
    fogTint: "#2b1f16",
    accentColor: "#ffb800",
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
    skyColor: "#0d1222",
    fogTint: "#151f38",
    accentColor: "#35d6ff",
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

const PICKUP_ITEMS = [
  "TURBO CELL",
  "CRYO FLUSH",
  "EMP SURGE",
  "AEGIS MATRIX",
  "SEEKER SALVO",
  "HYPERDRIVE"
] as const;
type PickupItem = (typeof PICKUP_ITEMS)[number];

const TRACK_HALF_WIDTH = 10.5;
const TOTAL_LAPS = 3;
const ROAD_TILE_COUNT = 16;
const ROAD_TILE_SPACING = 12;
const WALL_SEGMENT_COUNT = 14;
const LASER_BOLT_COUNT = 6;
const RAIN_STREAK_COUNT = 18;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const wrapPositive = (v: number, period: number): number => ((v % period) + period) % period;

function formatRaceTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const secs = Math.floor(rem);
  const tenths = Math.floor((rem - secs) * 10);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}.${tenths}`;
}

interface RivalState {
  readonly index: number;
  readonly pilotName: string;
  droneId: DroneId;
  s: number;
  lap: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  baseSpeed: number;
  hull: number;
  respawnTimer: number;
  eliminated: boolean;
  aiPhase: number;
}

interface LaserBoltState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
}

interface SceneryAnchor {
  readonly id: string;
  readonly asset: AuraAssetRef<"model">;
  readonly maxDim: number;
  readonly s: number;
  readonly period: number;
  readonly lateralX: number;
  readonly baseY: number;
  readonly yaw: number;
  readonly spinSpeed?: number;
}

class ThermalDriftAudioSynth {
  private ctx: AudioContext | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        try {
          this.ctx = new Ctor();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playLaser(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(145, now + 0.085);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playShockwave(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.36);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  playChime(freq = 540): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.45, now + 0.16);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }
}

const sfx = new ThermalDriftAudioSynth();

// 21 Track Architecture, Megacity Towers, Gantries, Hazards & Pickups
// Together with 7 Drone models + 2 Weapon models = 30 total `model(...)` nodes covering all 26 `heatsink*` assets!
const SCENERY_ANCHORS: readonly SceneryAnchor[] = [
  { id: "prop-gantry-start", asset: assets.heatsinkGantryStart, maxDim: 38, s: 68, period: 240, lateralX: 0, baseY: 0.0, yaw: 0 },
  { id: "prop-arch-a", asset: assets.heatsinkArch, maxDim: 38, s: 46, period: 160, lateralX: 0, baseY: 0.0, yaw: 0 },
  { id: "prop-arch-b", asset: assets.heatsinkArch, maxDim: 38, s: 126, period: 160, lateralX: 0, baseY: 0.0, yaw: 0 },
  { id: "prop-overpass", asset: assets.heatsinkOverpass, maxDim: 56, s: 94, period: 220, lateralX: 0, baseY: 4.8, yaw: 0 },
  { id: "prop-tunnel-a", asset: assets.heatsinkTunnelFrame, maxDim: 36, s: 58, period: 180, lateralX: 0, baseY: 0.0, yaw: 0 },
  { id: "prop-tunnel-b", asset: assets.heatsinkTunnelFrame, maxDim: 36, s: 148, period: 180, lateralX: 0, baseY: 0.0, yaw: 0 },
  { id: "prop-statue", asset: assets.heatsinkStatue, maxDim: 22, s: 128, period: 260, lateralX: -19.5, baseY: 0.0, yaw: 0.35 },
  { id: "prop-tower-l-left", asset: assets.heatsinkTowerL, maxDim: 46, s: 44, period: 150, lateralX: -28.0, baseY: -2.0, yaw: 0.1 },
  { id: "prop-tower-l-right", asset: assets.heatsinkTowerL, maxDim: 48, s: 118, period: 150, lateralX: 28.5, baseY: -2.0, yaw: -0.15 },
  { id: "prop-tower-t-left", asset: assets.heatsinkTowerT, maxDim: 52, s: 82, period: 170, lateralX: -29.0, baseY: -2.0, yaw: 0 },
  { id: "prop-tower-x-right", asset: assets.heatsinkTowerX, maxDim: 54, s: 156, period: 190, lateralX: 29.5, baseY: -2.0, yaw: 0.2 },
  { id: "prop-billboard-left", asset: assets.heatsinkHoloBillboard, maxDim: 9.5, s: 60, period: 140, lateralX: -16.2, baseY: 5.4, yaw: 0.28 },
  { id: "prop-billboard-right", asset: assets.heatsinkHoloBillboard, maxDim: 9.5, s: 130, period: 140, lateralX: 16.2, baseY: 5.6, yaw: -0.28 },
  { id: "prop-lava-fall", asset: assets.heatsinkLavaFall, maxDim: 18, s: 108, period: 210, lateralX: 18.5, baseY: 0.0, yaw: -0.4 },
  { id: "prop-water-emitter", asset: assets.heatsinkWaterEmitter, maxDim: 14, s: 76, period: 190, lateralX: -16.8, baseY: 0.0, yaw: 0.4 },
  { id: "prop-barrier-left", asset: assets.heatsinkBarrierA, maxDim: 3.8, s: 28, period: 90, lateralX: -9.4, baseY: 0.2, yaw: 0 },
  { id: "prop-checkpoint-ring", asset: assets.heatsinkCheckpointRing, maxDim: 26.0, s: 86, period: 150, lateralX: -11.5, baseY: 1.2, yaw: 0 },
  { id: "prop-boost-pad", asset: assets.heatsinkBoostPad, maxDim: 4.8, s: 42, period: 110, lateralX: -2.4, baseY: 0.12, yaw: 0 },
  { id: "prop-cooling-canister", asset: assets.heatsinkCoolingCanister, maxDim: 2.1, s: 64, period: 125, lateralX: 3.1, baseY: 1.45, yaw: 0, spinSpeed: 1.8 },
  { id: "prop-shield-pickup", asset: assets.heatsinkShieldPickup, maxDim: 2.0, s: 98, period: 135, lateralX: -3.2, baseY: 1.65, yaw: 0, spinSpeed: 2.1 },
  { id: "prop-explosive-barrel", asset: assets.heatsinkExplosiveBarrel, maxDim: 1.9, s: 54, period: 115, lateralX: 5.6, baseY: 0.45, yaw: 0.2 },
  { id: "v2-cooling-tower", asset: v2Assets.td2CoolingTower, maxDim: 24, s: 138, period: 220, lateralX: -22.5, baseY: 0.0, yaw: 0.25 },
  { id: "v2-tower-neon", asset: v2Assets.td2TowerNeon, maxDim: 48, s: 172, period: 210, lateralX: 28.0, baseY: -2.0, yaw: -0.18 },
  { id: "v2-drone-pyre", asset: v2Assets.td2DronePyre, maxDim: 3.85, s: 72, period: 165, lateralX: -6.4, baseY: 2.8, yaw: 0 },
  { id: "v2-drone-boss", asset: v2Assets.td2DroneBoss, maxDim: 4.8, s: 114, period: 185, lateralX: 6.2, baseY: 3.2, yaw: 0 }
];

function buildThermalDriftScene() {
  const s = scene()
    .add(looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.12 }))
    .background("#11151d")
    .camera(
      camera.perspective({
        fov: 68,
        near: 0.25,
        far: 650,
        position: [0, 4.2, 9.5],
        target: [0, 1.8, -18.0]
      })
    )
    .addMany([
      lights.ambient({ color: "#d8e4f2", intensity: 0.72 }),
      lights.hemisphere({ skyColor: "#7d93b5", groundColor: "#3a312a", intensity: 0.88 }),
      lights.directional({ color: "#ffc483", intensity: 2.35, position: [-28, 42, -55], shadow: true }),
      lights.point({ color: "#ff7a1f", intensity: 1.8, position: [0, 6, -10], distance: 75 }),
      lights.point({ color: "#35d6ff", intensity: 1.5, position: [0, 8, -32], distance: 85 }),
      effects.bloom({ intensity: 0.32, threshold: 0.72, radius: 0.5 }),
      effects.vignette({ intensity: 0.22, smoothness: 0.65 }),
      effects.colorGrade({ contrast: 1.08, saturation: 1.12 })
    ]);

  s.addMany([
    primitives
      .box({
        name: "megacity-abyss-floor",
        size: [480, 0.5, 420],
        material: material.pbr({ color: "#090c12", roughness: 0.92, metalness: 0.12 })
      })
      .position(0, -8.5, -150),
    primitives
      .box({
        name: "horizon-sunset-band",
        size: [460, 26, 2],
        material: material.emissive({ color: "#ff6b2b", emissive: "#ff551a", emissiveIntensity: 0.75 })
      })
      .position(0, 18, -235),
    primitives
      .box({
        name: "horizon-cyan-band",
        size: [460, 10, 2],
        material: material.emissive({ color: "#35d6ff", emissive: "#1ca3d4", emissiveIntensity: 0.65 })
      })
      .position(0, 6, -232)
  ]);

  // 16 Wet reflective megacity road deck tiles + center glowing race line + lane dashes
  const deckEvenMat = material.pbr({ color: "#171c26", roughness: 0.34, metalness: 0.42 });
  const deckOddMat = material.pbr({ color: "#141922", roughness: 0.38, metalness: 0.36 });
  const spineCyanMat = material.emissive({ color: "#35d6ff", emissive: "#35d6ff", emissiveIntensity: 1.45 });
  const spineOrangeMat = material.emissive({ color: "#ff6a26", emissive: "#ff4d1f", emissiveIntensity: 1.45 });
  const laneDashMat = material.emissive({ color: "#d6deeb", emissive: "#94a3b8", emissiveIntensity: 0.45 });

  for (let i = 0; i < ROAD_TILE_COUNT; i += 1) {
    const z = 8 - i * ROAD_TILE_SPACING;
    s.addMany([
      primitives
        .box({
          name: `road-deck-${i}`,
          size: [22.4, 0.36, ROAD_TILE_SPACING + 0.35],
          material: i % 2 === 0 ? deckEvenMat : deckOddMat
        })
        .position(0, -0.18, z)
        .runtime(game.runtimeNode(`road-deck-${i}`)),
      primitives
        .box({
          name: `road-spine-${i}`,
          size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58],
          material: i % 3 === 0 ? spineCyanMat : spineOrangeMat
        })
        .position(0, 0.03, z)
        .runtime(game.runtimeNode(`road-spine-${i}`)),
      primitives
        .box({
          name: `road-lane-l-${i}`,
          size: [0.18, 0.04, ROAD_TILE_SPACING * 0.45],
          material: laneDashMat
        })
        .position(-5.2, 0.025, z)
        .runtime(game.runtimeNode(`road-lane-l-${i}`)),
      primitives
        .box({
          name: `road-lane-r-${i}`,
          size: [0.18, 0.04, ROAD_TILE_SPACING * 0.45],
          material: laneDashMat
        })
        .position(5.2, 0.025, z)
        .runtime(game.runtimeNode(`road-lane-r-${i}`))
    ]);
  }

  // 14 Left & Right glowing orange/amber hazard jersey walls (matching hero.jpg track edges)
  const wallBaseMat = material.pbr({ color: "#232936", roughness: 0.52, metalness: 0.45 });
  const chevOrangeMat = material.emissive({ color: "#ff521b", emissive: "#ff521b", emissiveIntensity: 1.65 });
  const chevAmberMat = material.emissive({ color: "#ffb800", emissive: "#ffb800", emissiveIntensity: 1.65 });

  for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
    const z = 6 - i * 13.5;
    const chevMat = i % 2 === 0 ? chevOrangeMat : chevAmberMat;
    s.addMany([
      primitives
        .box({
          name: `wall-left-${i}`,
          size: [0.95, 1.35, 12.8],
          material: wallBaseMat
        })
        .position(-11.3, 0.55, z)
        .runtime(game.runtimeNode(`wall-left-${i}`)),
      primitives
        .box({
          name: `wall-right-${i}`,
          size: [0.95, 1.35, 12.8],
          material: wallBaseMat
        })
        .position(11.3, 0.55, z)
        .runtime(game.runtimeNode(`wall-right-${i}`)),
      primitives
        .box({
          name: `chevron-left-${i}`,
          size: [0.22, 0.36, 9.6],
          material: chevMat
        })
        .position(-10.72, 0.72, z)
        .runtime(game.runtimeNode(`chevron-left-${i}`)),
      primitives
        .box({
          name: `chevron-right-${i}`,
          size: [0.22, 0.36, 9.6],
          material: chevMat
        })
        .position(10.72, 0.72, z)
        .runtime(game.runtimeNode(`chevron-right-${i}`))
    ]);
  }

  // Player drone twin ramjet thruster plumes + shockwave ring + shield bubble
  const thrusterMat = material.emissive({ color: "#ff8c2b", emissive: "#ff4d1f", emissiveIntensity: 2.2 });
  s.addMany([
    primitives
      .cylinder({
        name: "player-thruster-left",
        size: [0.34, 1.35, 0.34],
        material: thrusterMat
      })
      .position(-0.52, 1.42, 1.15)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("player-thruster-left")),
    primitives
      .cylinder({
        name: "player-thruster-right",
        size: [0.34, 1.35, 0.34],
        material: thrusterMat
      })
      .position(0.52, 1.42, 1.15)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("player-thruster-right")),
    primitives
      .torus({
        name: "player-shockwave-ring",
        size: [2.2, 2.2, 0.14],
        material: material.emissive({ color: "#35d6ff", emissive: "#35d6ff", emissiveIntensity: 2.4 })
      })
      .position(0, -60, 0)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("player-shockwave-ring")),
    primitives
      .sphere({
        name: "player-shield-bubble",
        size: [2.8, 1.7, 3.2],
        material: material.emissive({ color: "#35d6ff", emissive: "#1ba8e0", emissiveIntensity: 0.75 })
      })
      .position(0, -60, 0)
      .runtime(game.runtimeNode("player-shield-bubble"))
  ]);

  // Laser cannon bolts & homing missile primitives
  const laserMat = material.emissive({ color: "#ff9b42", emissive: "#ff4d1f", emissiveIntensity: 2.6 });
  for (let i = 0; i < LASER_BOLT_COUNT; i += 1) {
    s.add(
      primitives
        .box({
          name: `laser-bolt-${i}`,
          size: [0.14, 0.14, 2.8],
          material: laserMat
        })
        .position(0, -60, 0)
        .runtime(game.runtimeNode(`laser-bolt-${i}`))
    );
  }

  s.add(
    primitives
      .cylinder({
        name: "homing-missile-active",
        size: [0.26, 1.9, 0.26],
        material: material.emissive({ color: "#ff2952", emissive: "#ff4d1f", emissiveIntensity: 2.4 })
      })
      .position(0, -60, 0)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("homing-missile-active"))
  );

  // Atmospheric megacity rain streaks
  const rainMat = material.emissive({ color: "#9ec5e8", emissive: "#60a5fa", emissiveIntensity: 0.55 });
  for (let i = 0; i < RAIN_STREAK_COUNT; i += 1) {
    const rx = ((i * 7.3) % 28) - 14;
    const ry = 1.5 + ((i * 3.7) % 11);
    const rz = -4 - ((i * 9.1) % 72);
    s.add(
      primitives
        .box({
          name: `rain-streak-${i}`,
          size: [0.03, 1.35, 0.03],
          material: rainMat
        })
        .position(rx, ry, rz)
        .rotate(0.18, 0, -0.06)
        .runtime(game.runtimeNode(`rain-streak-${i}`))
    );
  }

  // ============================================================================
  // EXACT 30 `model(assets.heatsink*)` NODES COVERING ALL 26 ADMITTED ASSETS
  // ============================================================================

  // 1–7: The 7 Combat Drones (1 acts as Player Drone, 6 act as active Rival AI Drones)
  for (const dId of DRONE_ORDER) {
    const spec = DRONE_SPECS[dId];
    s.add(
      model(spec.asset, {
        name: spec.nodeId,
        role: "primaryVehicle",
        scaleMode: "fit",
        targetMaxDimension: spec.maxDim
      })
        .position(0, 1.45, dId === "orion" ? -0.4 : -24)
        .runtime(
          game.runtimeNode(
            spec.nodeId,
            dId === "orion" ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined
          )
        )
    );
  }

  // 8–9: Combat Weapon Attachments & Dropped Proximity Mine (2 nodes)
  s.addMany([
    model(assets.heatsinkWeaponShockwave, {
      name: "weapon-shockwave-emitter",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.55
    })
      .position(0, 1.12, -0.4)
      .runtime(game.runtimeNode("weapon-shockwave-emitter")),
    model(assets.heatsinkWeaponMine, {
      name: "weapon-mine-active",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.45
    })
      .position(1.8, 0.35, -28)
      .runtime(game.runtimeNode("weapon-mine-active"))
  ]);

  // 10–30: 21 Track Architecture, Megacity Towers, Gantries, Hazards & Pickups (Total = 30 models)
  for (const anchor of SCENERY_ANCHORS) {
    s.add(
      model(anchor.asset, {
        name: anchor.id,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: anchor.maxDim
      })
        .position(anchor.lateralX, anchor.baseY, -anchor.s)
        .rotate(0, anchor.yaw, 0)
        .runtime(game.runtimeNode(anchor.id))
    );
  }

  return s;
}

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

const hudMode = getEl<HTMLElement>("h-mode");
const hudPos = getEl<HTMLElement>("h-pos");
const hudPosOf = getEl<HTMLElement>("h-posof");
const hudLap = getEl<HTMLElement>("h-lap");
const hudTime = getEl<HTMLElement>("h-time");
const hudBest = getEl<HTMLElement>("h-best");
const hudElimCard = getEl<HTMLElement>("h-elim-card");
const hudElimTime = getEl<HTMLElement>("h-elim-time");
const hudElimLast = getEl<HTMLElement>("h-elim-last");
const hudGhostCard = getEl<HTMLElement>("h-ghost-card");
const hudGhostDelta = getEl<HTMLElement>("h-ghost-delta");
const hudGhostNote = getEl<HTMLElement>("h-ghost-note");
const hudHull = getEl<HTMLElement>("h-hull");
const hudTd = getEl<HTMLElement>("h-td");
const hudDroneName = getEl<HTMLElement>("h-drone-name");
const hudSectorName = getEl<HTMLElement>("h-sector-name");
const hudDroneTag = getEl<HTMLElement>("h-drone-tag");
const hudItem = getEl<HTMLElement>("h-item");
const hudShock = getEl<HTMLElement>("h-shock");
const hudRoll = getEl<HTMLElement>("h-roll");
const hudMine = getEl<HTMLElement>("h-mine");
const hudSpeed = getEl<HTMLElement>("h-speed");
const hudAb = getEl<HTMLElement>("h-ab");
const hudHeat = getEl<HTMLElement>("h-heat");
const hudShield = getEl<HTMLElement>("h-shield");
const hudGun = getEl<HTMLElement>("h-gun");
const hudLock = getEl<HTMLElement>("lock");
const hudLockLabel = getEl<HTMLElement>("lock-label");
const hudIncoming = getEl<HTMLElement>("incoming");
const hudMsg = getEl<HTMLElement>("msg");
const hudMsgText = getEl<HTMLElement>("msg-text");
const hudMsgSub = getEl<HTMLElement>("msg-sub");
const hudBanner = getEl<HTMLElement>("banner");
const hudHyperStatus = getEl<HTMLElement>("hyper-status");
const hudAutopilot = getEl<HTMLElement>("h-autopilot");
const fxSpeedLines = getEl<HTMLElement>("speed-lines");
const fxHeatGlaze = getEl<HTMLElement>("heat-glaze");
const minimapCanvas = getEl<HTMLCanvasElement>("minimap");
const minimapCtx = minimapCanvas?.getContext("2d") ?? null;

async function bootThermalDriftShowcase(): Promise<void> {
  const auraApp = createAuraApp("#app", {
    scene: buildThermalDriftScene(),
    renderer: {
      quality: "high"
    },
    diagnostics: false
  });

  const req = (id: string): AuraRuntimeNodeHandle => auraApp.nodes.require(id);

  // Lookup runtime handles once
  const droneHandles: Record<DroneId, AuraRuntimeNodeHandle> = {
    orion: req("drone-orion"),
    volt: req("drone-volt"),
    bastion: req("drone-bastion"),
    spectre: req("drone-spectre"),
    razor: req("drone-razor"),
    nighthawk: req("drone-nighthawk"),
    wraith: req("drone-wraith")
  };

  const roadTiles = Array.from({ length: ROAD_TILE_COUNT }, (_, i) => ({
    deck: req(`road-deck-${i}`),
    spine: req(`road-spine-${i}`),
    laneL: req(`road-lane-l-${i}`),
    laneR: req(`road-lane-r-${i}`)
  }));

  const wallSegments = Array.from({ length: WALL_SEGMENT_COUNT }, (_, i) => ({
    left: req(`wall-left-${i}`),
    right: req(`wall-right-${i}`),
    chevL: req(`chevron-left-${i}`),
    chevR: req(`chevron-right-${i}`)
  }));

  const thrusterLeftHandle = req("player-thruster-left");
  const thrusterRightHandle = req("player-thruster-right");
  const shockwaveRingHandle = req("player-shockwave-ring");
  const shieldBubbleHandle = req("player-shield-bubble");
  const shockwaveEmitterHandle = req("weapon-shockwave-emitter");
  const mineHandle = req("weapon-mine-active");
  const missileHandle = req("homing-missile-active");

  const laserHandles = Array.from({ length: LASER_BOLT_COUNT }, (_, i) => req(`laser-bolt-${i}`));
  const rainHandles = Array.from({ length: RAIN_STREAK_COUNT }, (_, i) => req(`rain-streak-${i}`));
  const sceneryHandles = SCENERY_ANCHORS.map((anchor) => ({
    anchor,
    handle: req(anchor.id)
  }));

  // Live Race State
  let selectedDrone: DroneId = "orion";
  let selectedCircuit: CircuitId = "grand";
  let selectedMode: ModeId = "race";

  let simTime = 0;
  let lapTime = 0;
  let bestLapSeconds: number | null = 98.4;
  let currentLap = 1;
  let playerS = 18;
  let playerX = 0;
  let playerY = 1.55;
  let playerVx = 0;
  let playerVy = 0;
  let playerSpeedKmh = 465;
  let playerRoll = 0;
  let playerPitch = 0;
  let playerYaw = 0;

  // Combat & Thermal Telemetry
  let hull = 100;
  let takedowns = 2;
  let afterburnerEnergy = 88;
  let coreHeat = 24;
  let overheated = false;
  let overheatTimer = 0;
  let shieldEnergy = 78;
  let gunEnergy = 92;

  // Tactical Cooldowns & Active Effects
  let shockCooldown = 0;
  let shockActiveTimer = 0;
  let rollCooldown = 0;
  let barrelRollTimer = 0;
  let mineCooldown = 0;
  let mineTrackS = -100;
  let mineTrackX = 0;
  let heldItem: PickupItem | null = "TURBO CELL";
  let hyperdriveTimer = 0;
  let incomingWarningTimer = 0;
  let bannerTimer = 0;
  let centerMsgTimer = 2.4;

  // Elimination & Ghost Mode State
  let elimCountdown = 20.0;
  let lastEliminatedName = "—";
  let activeFieldCount = 12;

  // Homing Missile State
  let missileActive = false;
  let missileX = 0;
  let missileY = -60;
  let missileZ = 0;
  let missileTargetIndex = -1;
  let missileTtl = 0;

  // Laser Bolt Pool
  const laserBolts: LaserBoltState[] = Array.from({ length: LASER_BOLT_COUNT }, () => ({
    active: false,
    x: 0,
    y: -60,
    z: 0,
    vx: 0,
    vy: 0,
    vz: -140,
    ttl: 0
  }));
  let fireCooldown = 0;

  // 11 Rival AI Pilots
  const rivals: RivalState[] = RIVAL_PILOT_NAMES.map((pilotName, idx) => {
    const rivalDronePool = DRONE_ORDER.filter((d) => d !== selectedDrone);
    const droneId = rivalDronePool[idx % rivalDronePool.length] ?? "volt";
    return {
      index: idx,
      pilotName,
      droneId,
      s: 32 + idx * 18,
      lap: 1,
      x: ((idx % 5) - 2) * 2.9,
      y: 1.5 + (idx % 3) * 0.55,
      targetX: ((idx % 5) - 2) * 2.6,
      targetY: 1.55 + (idx % 3) * 0.5,
      speed: 445 + (idx % 4) * 18,
      baseSpeed: 448 + (idx % 5) * 16,
      hull: 100,
      respawnTimer: 0,
      eliminated: false,
      aiPhase: idx * 1.17
    };
  });

  const pressedKeys = new Set<string>();
  let lastManualInputTime = -10;
  let pointerFireHeld = false;
  let pointerBoostHeld = false;

  function showBanner(text: string, duration = 1.6): void {
    if (hudBanner) {
      hudBanner.textContent = text;
      hudBanner.classList.add("show");
    }
    bannerTimer = duration;
  }

  function showCenterMessage(big: string, sub: string, duration = 2.0): void {
    if (hudMsgText) hudMsgText.textContent = big;
    if (hudMsgSub) hudMsgSub.textContent = sub;
    if (hudMsg) hudMsg.classList.add("show");
    centerMsgTimer = duration;
  }

  function sampleTrackCurvature(circuit: CircuitSpec, s: number): {
    curvature: number;
    pitchSlope: number;
    sectorName: string;
  } {
    const frac = wrapPositive(s, circuit.length) / circuit.length;
    let activeSector = circuit.sectors[0]!;
    for (const sec of circuit.sectors) {
      if (frac >= sec.startFrac) {
        activeSector = sec;
      }
    }
    const wave =
      Math.sin(frac * Math.PI * 4) * activeSector.curvature +
      Math.cos(frac * Math.PI * 6) * (activeSector.curvature * 0.45);
    const slope = Math.sin(frac * Math.PI * 6) * activeSector.pitchSlope;
    return {
      curvature: wave,
      pitchSlope: slope,
      sectorName: activeSector.name
    };
  }

  function reassignRivalDroneModels(): void {
    const rivalDrones = DRONE_ORDER.filter((d) => d !== selectedDrone);
    rivals.forEach((r, idx) => {
      r.droneId = rivalDrones[idx % rivalDrones.length] ?? "volt";
    });
  }

  function selectDrone(droneId: DroneId): void {
    if (!DRONE_SPECS[droneId]) return;
    selectedDrone = droneId;
    reassignRivalDroneModels();
    const spec = DRONE_SPECS[droneId];
    if (hudDroneName) hudDroneName.textContent = spec.name;
    if (hudDroneTag) hudDroneTag.textContent = spec.tag;
    document.querySelectorAll<HTMLButtonElement>("#drone-bar [data-drone]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.drone === droneId);
    });
    showBanner(`DRONE · ${spec.name}`);
    sfx.playChime(580);
  }

  function selectCircuit(circuitId: CircuitId): void {
    if (!CIRCUITS[circuitId]) return;
    selectedCircuit = circuitId;
    const circuit = CIRCUITS[circuitId];
    document.querySelectorAll<HTMLButtonElement>("#circuit-bar [data-circuit]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.circuit === circuitId);
    });
    showCenterMessage(circuit.shortName, circuit.name, 2.1);
    sfx.playChime(640);
  }

  function selectMode(modeId: ModeId): void {
    selectedMode = modeId;
    if (hudMode) {
      hudMode.textContent =
        modeId === "race" ? "RACE" : modeId === "trial" ? "TIME TRIAL" : "ELIMINATION";
    }
    if (hudElimCard) {
      hudElimCard.style.display = modeId === "elim" ? "flex" : "none";
    }
    if (hudGhostCard) {
      hudGhostCard.style.display = modeId === "trial" ? "flex" : "none";
    }
    if (modeId === "elim") {
      elimCountdown = 20.0;
      activeFieldCount = 12;
      rivals.forEach((r) => {
        r.eliminated = false;
      });
    }
    document.querySelectorAll<HTMLButtonElement>("#mode-bar [data-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === modeId);
    });
    showBanner(`MODE · ${modeId.toUpperCase()}`);
    sfx.playChime(520);
  }

  function triggerShockwave(): void {
    if (shockCooldown > 0) return;
    shockCooldown = 8.0;
    shockActiveTimer = 0.65;
    sfx.playShockwave();
    let hitAny = false;
    for (const rival of rivals) {
      if (rival.eliminated || rival.respawnTimer > 0) continue;
      const ds = Math.abs(rival.s - playerS);
      const dx = Math.abs(rival.x - playerX);
      if (ds < 26 && dx < 7.5) {
        rival.hull -= 55;
        rival.speed *= 0.68;
        hitAny = true;
        if (rival.hull <= 0) {
          rival.hull = 100;
          rival.respawnTimer = 2.4;
          rival.s = playerS - 32;
          takedowns += 1;
          showBanner(`EMP TAKEDOWN · ${rival.pilotName.toUpperCase()}`);
        }
      }
    }
    if (!hitAny) {
      showBanner("SHOCKWAVE PULSE");
    }
  }

  function triggerBarrelRoll(): void {
    if (rollCooldown > 0) return;
    rollCooldown = 4.0;
    barrelRollTimer = 0.58;
    incomingWarningTimer = 0;
    shieldEnergy = Math.min(100, shieldEnergy + 14);
    showBanner("BARREL ROLL · EVADE");
    sfx.playChime(720);
  }

  function dropProximityMine(): void {
    if (mineCooldown > 0) return;
    mineCooldown = 6.0;
    mineTrackS = playerS - 4;
    mineTrackX = playerX;
    showBanner("PROXIMITY MINE DEPLOYED");
    sfx.playChime(440);
  }

  function fireHomingMissile(): void {
    if (missileActive) return;
    let bestIdx = -1;
    let bestDist = 95;
    for (const r of rivals) {
      if (r.eliminated || r.respawnTimer > 0) continue;
      const ds = r.s - playerS;
      if (ds > 4 && ds < bestDist) {
        bestDist = ds;
        bestIdx = r.index;
      }
    }
    missileActive = true;
    missileTargetIndex = bestIdx;
    missileX = playerX;
    missileY = playerY - 0.2;
    missileZ = -2.2;
    missileTtl = 1.8;
    sfx.playChime(660);
  }

  function useHeldItem(): void {
    if (!heldItem) return;
    const item = heldItem;
    heldItem = null;
    if (item === "TURBO CELL") {
      afterburnerEnergy = 100;
      playerSpeedKmh = Math.min(760, playerSpeedKmh + 140);
      showBanner("TURBO CELL IGNITED");
    } else if (item === "CRYO FLUSH") {
      coreHeat = 0;
      overheated = false;
      showBanner("CRYO FLUSH · CORE COOLED");
    } else if (item === "EMP SURGE") {
      shockCooldown = 0;
      triggerShockwave();
    } else if (item === "AEGIS MATRIX") {
      shieldEnergy = 100;
      hull = Math.min(100, hull + 35);
      showBanner("AEGIS SHIELD RESTORED");
    } else if (item === "SEEKER SALVO") {
      fireHomingMissile();
      showBanner("SEEKER SALVO LAUNCHED");
    } else if (item === "HYPERDRIVE") {
      hyperdriveTimer = 4.5;
      coreHeat = Math.max(0, coreHeat - 30);
      showBanner("HYPERDRIVE ENGAGED");
    }
    sfx.playChime(780);
  }

  function fireLaserBurst(): void {
    if (overheated || gunEnergy < 6 || fireCooldown > 0) return;
    fireCooldown = 0.11;
    const spec = DRONE_SPECS[selectedDrone];
    const heatCost = Math.max(1.8, 4.2 - spec.laser * 0.22);
    coreHeat = Math.min(100, coreHeat + heatCost);
    gunEnergy = Math.max(0, gunEnergy - 7);
    if (coreHeat >= 99.5) {
      overheated = true;
      overheatTimer = 2.2;
      showBanner("THERMAL OVERLOAD · VENTING");
    }

    let spawned = 0;
    for (const bolt of laserBolts) {
      if (!bolt.active) {
        bolt.active = true;
        bolt.x = playerX + (spawned === 0 ? -0.85 : 0.85);
        bolt.y = playerY - 0.08;
        bolt.z = -1.8;
        bolt.vx = 0;
        bolt.vy = 0;
        bolt.vz = -165;
        bolt.ttl = 0.72;
        spawned += 1;
        if (spawned >= 2) break;
      }
    }
    sfx.playLaser();
  }

  function resetRace(): void {
    simTime = 0;
    lapTime = 0;
    currentLap = 1;
    playerS = 18;
    playerX = 0;
    playerY = 1.55;
    playerSpeedKmh = 465;
    hull = 100;
    coreHeat = 18;
    afterburnerEnergy = 92;
    shieldEnergy = 85;
    gunEnergy = 100;
    overheated = false;
    showCenterMessage("RACE LIVE", CIRCUITS[selectedCircuit].name, 2.0);
  }

  // Bind UI buttons
  document.querySelectorAll<HTMLButtonElement>("#drone-bar [data-drone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.drone as DroneId | undefined;
      if (id) selectDrone(id);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("#circuit-bar [data-circuit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.circuit as CircuitId | undefined;
      if (id) selectCircuit(id);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("#mode-bar [data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.mode as ModeId | undefined;
      if (id) selectMode(id);
    });
  });

  // Keyboard listeners for continuous flight + tactical abilities
  window.addEventListener("keydown", (ev) => {
    pressedKeys.add(ev.code);
    if (ev.code.startsWith("Digit")) {
      const idx = Number(ev.code.replace("Digit", "")) - 1;
      const dId = DRONE_ORDER[idx];
      if (dId) selectDrone(dId);
    } else if (ev.code === "KeyQ") {
      lastManualInputTime = simTime;
      triggerShockwave();
    } else if (ev.code === "KeyR") {
      lastManualInputTime = simTime;
      triggerBarrelRoll();
    } else if (ev.code === "KeyC") {
      lastManualInputTime = simTime;
      dropProximityMine();
    } else if (ev.code === "KeyE") {
      lastManualInputTime = simTime;
      useHeldItem();
    } else if (ev.code === "KeyF") {
      lastManualInputTime = simTime;
      fireHomingMissile();
    }
  });

  window.addEventListener("keyup", (ev) => {
    pressedKeys.delete(ev.code);
  });

  const stageEl = document.getElementById("app");
  stageEl?.addEventListener("mousedown", (ev) => {
    lastManualInputTime = simTime;
    if (ev.button === 0) pointerFireHeld = true;
    if (ev.button === 2) pointerBoostHeld = true;
  });
  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 0) pointerFireHeld = false;
    if (ev.button === 2) pointerBoostHeld = false;
  });
  stageEl?.addEventListener("contextmenu", (ev) => ev.preventDefault());

  function drawMinimapRadar(circuit: CircuitSpec, lockedRivalIdx: number): void {
    if (!minimapCtx || !minimapCanvas) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    minimapCtx.clearRect(0, 0, w, h);

    minimapCtx.strokeStyle = "rgba(244, 242, 236, 0.08)";
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, 52, 0, Math.PI * 2);
    minimapCtx.arc(cx, cy, 28, 0, Math.PI * 2);
    minimapCtx.stroke();

    const pointForFrac = (frac: number, lateralOffset = 0): [number, number] => {
      const a = frac * Math.PI * 2 - Math.PI * 0.5;
      const harmonic =
        circuit.id === "grand"
          ? Math.sin(a * 3) * 9 + Math.cos(a * 2) * 6
          : circuit.id === "dustfall"
            ? Math.sin(a * 2) * 12 + Math.sin(a * 4) * 5
            : Math.cos(a * 3) * 11 + Math.sin(a * 5) * 6;
      const r = 44 + harmonic + lateralOffset * 0.35;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86];
    };

    minimapCtx.strokeStyle = "rgba(244, 242, 236, 0.26)";
    minimapCtx.lineWidth = 3.2;
    minimapCtx.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const [px, py] = pointForFrac(i / 64);
      if (i === 0) minimapCtx.moveTo(px, py);
      else minimapCtx.lineTo(px, py);
    }
    minimapCtx.closePath();
    minimapCtx.stroke();

    minimapCtx.fillStyle = "#35d6ff";
    for (const sec of circuit.sectors) {
      const [gx, gy] = pointForFrac(sec.startFrac);
      minimapCtx.fillRect(gx - 2, gy - 2, 4, 4);
    }

    for (const r of rivals) {
      if (r.eliminated) continue;
      const rFrac = wrapPositive(r.s, circuit.length) / circuit.length;
      const [rx, ry] = pointForFrac(rFrac, r.x);
      minimapCtx.fillStyle = r.index === lockedRivalIdx ? "#ffb800" : "#f4f2ec";
      minimapCtx.beginPath();
      minimapCtx.arc(rx, ry, r.index === lockedRivalIdx ? 3.2 : 2.3, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    const pFrac = wrapPositive(playerS, circuit.length) / circuit.length;
    const [ux, uy] = pointForFrac(pFrac, playerX);
    minimapCtx.fillStyle = "#ff4d1f";
    minimapCtx.beginPath();
    minimapCtx.arc(ux, uy, 4.2, 0, Math.PI * 2);
    minimapCtx.fill();
    minimapCtx.strokeStyle = "#ffb800";
    minimapCtx.lineWidth = 1.2;
    minimapCtx.stroke();
  }

  // Main 60 FPS Combat & Racing Frame Loop
  auraApp.onFrame(({ dt }) => {
    const step = clamp(dt, 1 / 240, 0.05);
    simTime += step;
    lapTime += step;

    const circuit = CIRCUITS[selectedCircuit];
    const droneSpec = DRONE_SPECS[selectedDrone];

    const manualSteer =
      (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0) -
      (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0);
    const manualPitch =
      (pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0) -
      (pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0);
    const manualBoost =
      pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight") || pointerBoostHeld;
    const manualFire = pressedKeys.has("Space") || pointerFireHeld;

    if (
      Math.abs(manualSteer) > 0.05 ||
      Math.abs(manualPitch) > 0.05 ||
      manualBoost ||
      manualFire
    ) {
      lastManualInputTime = simTime;
    }

    const autopilotActive = simTime - lastManualInputTime > 1.2;
    if (hudAutopilot) {
      hudAutopilot.textContent = autopilotActive
        ? "AI DEMO FLIGHT: ACTIVE"
        : "PILOT CONTROL: MANUAL";
      hudAutopilot.classList.toggle("manual", !autopilotActive);
    }

    const trackSample = sampleTrackCurvature(circuit, playerS);
    if (hudSectorName) {
      hudSectorName.textContent = trackSample.sectorName;
    }

    let steerCmd = manualSteer;
    let pitchCmd = manualPitch;
    let boostActive = manualBoost;
    let fireActive = manualFire;

    if (autopilotActive) {
      const idealX = Math.sin(simTime * 0.85) * 4.2 - trackSample.curvature * 5.2;
      const idealY = 1.65 + Math.sin(simTime * 1.35) * 0.48;
      steerCmd = clamp((idealX - playerX) * 0.42, -1, 1);
      pitchCmd = clamp((idealY - playerY) * 0.65, -1, 1);
      boostActive = !overheated && afterburnerEnergy > 32 && Math.sin(simTime * 0.9) > -0.25;
      fireActive = !overheated && gunEnergy > 24 && Math.sin(simTime * 3.2) > 0.35;

      if (shockCooldown <= 0 && Math.sin(simTime * 0.41) > 0.96) {
        triggerShockwave();
      }
      if (!missileActive && Math.sin(simTime * 0.53) > 0.95) {
        fireHomingMissile();
      }
    }

    // Cooldowns & timers
    shockCooldown = Math.max(0, shockCooldown - step);
    shockActiveTimer = Math.max(0, shockActiveTimer - step);
    rollCooldown = Math.max(0, rollCooldown - step);
    barrelRollTimer = Math.max(0, barrelRollTimer - step);
    mineCooldown = Math.max(0, mineCooldown - step);
    hyperdriveTimer = Math.max(0, hyperdriveTimer - step);
    incomingWarningTimer = Math.max(0, incomingWarningTimer - step);
    fireCooldown = Math.max(0, fireCooldown - step);

    if (bannerTimer > 0) {
      bannerTimer = Math.max(0, bannerTimer - step);
      if (bannerTimer <= 0 && hudBanner) hudBanner.classList.remove("show");
    }
    if (centerMsgTimer > 0) {
      centerMsgTimer = Math.max(0, centerMsgTimer - step);
      if (centerMsgTimer <= 0 && hudMsg) hudMsg.classList.remove("show");
    }

    if (overheated) {
      overheatTimer -= step;
      coreHeat = Math.max(0, coreHeat - 36 * step);
      if (overheatTimer <= 0 || coreHeat <= 18) {
        overheated = false;
      }
    }

    // Speed, Afterburner & Thermal balance
    const topBaseKmh = 415 + droneSpec.speed * 19;
    const abBonusKmh =
      boostActive && !overheated && afterburnerEnergy > 2 ? 135 + droneSpec.boost * 8 : 0;
    const hyperBonusKmh = hyperdriveTimer > 0 ? 185 : 0;
    const targetKmh = topBaseKmh + abBonusKmh + hyperBonusKmh;
    playerSpeedKmh = lerp(playerSpeedKmh, targetKmh, clamp(step * 4.2, 0, 1));

    if (boostActive && !overheated && afterburnerEnergy > 2) {
      afterburnerEnergy = Math.max(0, afterburnerEnergy - 22 * step);
      coreHeat = Math.min(100, coreHeat + 14.5 * step);
      if (coreHeat >= 99.5) {
        overheated = true;
        overheatTimer = 2.2;
        showBanner("AFTERBURNER OVERHEAT");
      }
    } else {
      afterburnerEnergy = Math.min(100, afterburnerEnergy + 16 * step);
      coreHeat = Math.max(10, coreHeat - 15 * step);
    }

    gunEnergy = Math.min(100, gunEnergy + (14 + droneSpec.laser * 1.4) * step);
    shieldEnergy = Math.min(100, shieldEnergy + 4.5 * step);
    hull = Math.min(100, hull + 1.2 * step);

    if (fireActive) {
      fireLaserBurst();
    }

    // Advance player along track spline
    const metersPerSec = playerSpeedKmh / 9.2;
    playerS += metersPerSec * step;
    if (playerS >= circuit.length) {
      playerS -= circuit.length;
      if (bestLapSeconds === null || lapTime < bestLapSeconds) {
        bestLapSeconds = lapTime;
      }
      lapTime = 0;
      currentLap = (currentLap % TOTAL_LAPS) + 1;
      showCenterMessage(`LAP ${currentLap}/${TOTAL_LAPS}`, circuit.name, 1.8);
      sfx.playChime(680);
    }

    // Lateral & vertical flight physics
    const centrifugalPull = -trackSample.curvature * 5.5;
    playerVx = lerp(playerVx, steerCmd * 15.5 + centrifugalPull, clamp(step * 7.5, 0, 1));
    playerVy = lerp(playerVy, pitchCmd * 6.5, clamp(step * 7.5, 0, 1));
    playerX = clamp(playerX + playerVx * step, -TRACK_HALF_WIDTH + 1.6, TRACK_HALF_WIDTH - 1.6);
    playerY = clamp(playerY + playerVy * step, 0.95, 3.6);

    const barrelRollAngle =
      barrelRollTimer > 0 ? (1 - barrelRollTimer / 0.58) * Math.PI * 2 : 0;
    playerRoll = lerp(playerRoll, -steerCmd * 0.46, clamp(step * 9, 0, 1)) + barrelRollAngle;
    playerPitch = lerp(playerPitch, pitchCmd * 0.18 - 0.04, clamp(step * 8, 0, 1));
    playerYaw = lerp(playerYaw, -steerCmd * 0.14, clamp(step * 8, 0, 1));

    // Update road deck tiles & glowing walls with curvature bending
    const roadScroll = wrapPositive(playerS, ROAD_TILE_SPACING);
    for (let i = 0; i < ROAD_TILE_COUNT; i += 1) {
      const z = 8 - i * ROAD_TILE_SPACING + roadScroll;
      const distAhead = Math.max(0, -z);
      const curveX = trackSample.curvature * (distAhead * distAhead) * 0.0026;
      const slopeY = trackSample.pitchSlope * distAhead * 0.08;
      const tile = roadTiles[i]!;
      tile.deck.setPosition(curveX, -0.18 + slopeY, z);
      tile.spine.setPosition(curveX, 0.03 + slopeY, z);
      tile.laneL.setPosition(curveX - 5.2, 0.025 + slopeY, z);
      tile.laneR.setPosition(curveX + 5.2, 0.025 + slopeY, z);
    }

    const wallScroll = wrapPositive(playerS, 13.5);
    for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
      const z = 6 - i * 13.5 + wallScroll;
      const distAhead = Math.max(0, -z);
      const curveX = trackSample.curvature * (distAhead * distAhead) * 0.0026;
      const slopeY = trackSample.pitchSlope * distAhead * 0.08;
      const seg = wallSegments[i]!;
      seg.left.setPosition(curveX - 11.3, 0.55 + slopeY, z);
      seg.right.setPosition(curveX + 11.3, 0.55 + slopeY, z);
      seg.chevL.setPosition(curveX - 10.72, 0.72 + slopeY, z);
      seg.chevR.setPosition(curveX + 10.72, 0.72 + slopeY, z);
    }

    // Update Megacity architecture, gantries, tunnels, pickups & hazards
    for (const item of sceneryHandles) {
      const { anchor, handle } = item;
      const relS = wrapPositive(anchor.s - playerS, anchor.period);
      const z = 14 - relS;
      const distAhead = Math.max(0, -z);
      const curveX = trackSample.curvature * (distAhead * distAhead) * 0.0026;
      const slopeY = trackSample.pitchSlope * distAhead * 0.08;
      const worldX = curveX + anchor.lateralX;
      const worldY = z > -2.5 ? -140 : anchor.baseY + slopeY;
      handle.setPosition(worldX, worldY, z);
      if (anchor.spinSpeed) {
        handle.setRotation(0, anchor.yaw + simTime * anchor.spinSpeed, 0);
      }

      if (Math.abs(z - -0.4) < 3.6 && Math.abs(worldX - playerX) < 3.4) {
        if (anchor.id === "prop-boost-pad") {
          playerSpeedKmh = Math.min(760, playerSpeedKmh + 85 * step * 12);
          afterburnerEnergy = Math.min(100, afterburnerEnergy + 18);
        } else if (anchor.id === "prop-cooling-canister") {
          coreHeat = Math.max(0, coreHeat - 38);
          overheated = false;
          if (!heldItem) {
            heldItem =
              PICKUP_ITEMS[Math.floor(simTime * 3) % PICKUP_ITEMS.length] ?? "TURBO CELL";
          }
        } else if (anchor.id === "prop-shield-pickup") {
          shieldEnergy = Math.min(100, shieldEnergy + 32);
          if (!heldItem) {
            heldItem =
              PICKUP_ITEMS[(Math.floor(simTime * 5) + 2) % PICKUP_ITEMS.length] ?? "AEGIS MATRIX";
          }
        }
      }
      if (anchor.id === "prop-water-emitter" && Math.abs(z) < 8 && playerX < -2.5) {
        coreHeat = Math.max(0, coreHeat - 28 * step);
      }
      if (anchor.id === "prop-lava-fall" && Math.abs(z) < 8 && playerX > 3.5) {
        coreHeat = Math.min(100, coreHeat + 18 * step);
      }
    }

    // Update Rivals & map the 6 closest visible rivals onto the 6 non-player drone GLB handles
    let lockedRivalIdx = -1;
    let lockedRivalBestZ = -999;

    for (const r of rivals) {
      if (r.eliminated) continue;
      if (r.respawnTimer > 0) {
        r.respawnTimer = Math.max(0, r.respawnTimer - step);
      }
      const waveSpeed = r.baseSpeed + Math.sin(simTime * 1.1 + r.aiPhase) * 34;
      r.speed = lerp(r.speed, waveSpeed, clamp(step * 2.5, 0, 1));
      r.s += (r.speed / 9.2) * step;
      if (r.s >= circuit.length) {
        r.s -= circuit.length;
        r.lap += 1;
      }

      const deltaS = r.s - playerS;
      if (deltaS < -28) {
        r.s = playerS + 52 + (r.index % 5) * 9;
      } else if (deltaS > 96) {
        r.s = playerS + 14 + (r.index % 6) * 8;
      }

      r.targetX = Math.sin(simTime * 0.9 + r.aiPhase) * 6.8;
      r.targetY = 1.45 + (r.index % 3) * 0.45 + Math.cos(simTime * 1.4 + r.aiPhase) * 0.32;
      r.x = lerp(r.x, r.targetX, clamp(step * 3.2, 0, 1));
      r.y = lerp(r.y, r.targetY, clamp(step * 3.2, 0, 1));
    }

    // Position the Player's selected Drone Handle at [playerX, playerY, -0.4]
    const activePlayerHandle = droneHandles[selectedDrone];
    activePlayerHandle
      .setPosition(playerX, playerY, -0.4)
      .setRotation(playerPitch, playerYaw, playerRoll)
      .setVisible(true);

    // Position the other 6 Drone Handles as the 6 visible Rivals ahead on the track
    const otherDroneIds = DRONE_ORDER.filter((id) => id !== selectedDrone);
    const visibleRivals = rivals.filter((r) => !r.eliminated).slice(0, otherDroneIds.length);

    otherDroneIds.forEach((dId, slotIdx) => {
      const h = droneHandles[dId];
      const rival = visibleRivals[slotIdx];
      if (!rival || rival.respawnTimer > 0) {
        h.setPosition(0, -60, 0).setVisible(false);
        return;
      }
      const deltaS = rival.s - playerS;
      const z = -0.4 - deltaS;
      const distAhead = Math.max(0, -z);
      const curveX = trackSample.curvature * (distAhead * distAhead) * 0.0026;
      const slopeY = trackSample.pitchSlope * distAhead * 0.08;
      const rx = curveX + rival.x;
      const ry = rival.y + slopeY;
      const bankRoll = clamp((rival.x - rival.targetX) * 0.22, -0.45, 0.45);
      h.setPosition(rx, ry, z).setRotation(-0.04, 0, bankRoll).setVisible(true);

      if (z < -6 && z > -68 && z > lockedRivalBestZ) {
        lockedRivalBestZ = z;
        lockedRivalIdx = rival.index;
      }
    });

    const lockedRival = lockedRivalIdx >= 0 ? rivals[lockedRivalIdx] ?? null : null;

    // Keep primitive cylinders & opaque shield sphere hidden so the 3D Drone GLB with its built-in EMIT_Thruster & EMIT_Team materials is 100% unobstructed
    thrusterLeftHandle.setPosition(0, -60, 0).setVisible(false);
    thrusterRightHandle.setPosition(0, -60, 0).setVisible(false);
    shieldBubbleHandle.setPosition(0, -60, 0).setVisible(false);
    shockwaveEmitterHandle.setPosition(-6.8, 0.35, -34).setRotation(0, simTime * 1.4, 0);

    if (shockActiveTimer > 0) {
      const progress = 1 - shockActiveTimer / 0.65;
      const ringScale = 1 + progress * 8.5;
      shockwaveRingHandle
        .setPosition(playerX, playerY, -0.4)
        .setScale([ringScale, ringScale, 1])
        .setVisible(true);
    } else {
      shockwaveRingHandle.setPosition(0, -60, 0).setVisible(false);
    }

    // Update Dropped Proximity Mine
    if (mineTrackS > 0) {
      const mineZ = -0.4 - (mineTrackS - playerS);
      if (mineZ > 15 || mineZ < -120) {
        mineHandle.setPosition(2.2, 0.35, -36);
      } else {
        mineHandle.setPosition(mineTrackX, 0.35, mineZ);
      }
    } else {
      mineHandle.setPosition(2.2, 0.35, -36);
    }

    // Update Laser Bolts & check hits against rivals
    for (let i = 0; i < LASER_BOLT_COUNT; i += 1) {
      const bolt = laserBolts[i]!;
      const handle = laserHandles[i]!;
      if (!bolt.active) {
        handle.setPosition(0, -60, 0).setVisible(false);
        continue;
      }
      bolt.ttl -= step;
      bolt.x += bolt.vx * step;
      bolt.y += bolt.vy * step;
      bolt.z += bolt.vz * step;
      if (bolt.ttl <= 0 || bolt.z < -130) {
        bolt.active = false;
        handle.setPosition(0, -60, 0).setVisible(false);
        continue;
      }
      handle.setPosition(bolt.x, bolt.y, bolt.z).setVisible(true);

      for (const rival of visibleRivals) {
        if (rival.respawnTimer > 0) continue;
        const rz = -0.4 - (rival.s - playerS);
        const distAhead = Math.max(0, -rz);
        const rx = trackSample.curvature * (distAhead * distAhead) * 0.0026 + rival.x;
        const ry = rival.y + trackSample.pitchSlope * distAhead * 0.08;
        if (
          Math.abs(bolt.z - rz) < 3.4 &&
          Math.abs(bolt.x - rx) < 2.2 &&
          Math.abs(bolt.y - ry) < 1.8
        ) {
          bolt.active = false;
          handle.setPosition(0, -60, 0).setVisible(false);
          rival.hull -= 24 + droneSpec.laser * 2;
          if (rival.hull <= 0) {
            rival.hull = 100;
            rival.respawnTimer = 2.2;
            rival.s = playerS - 26;
            takedowns += 1;
            showBanner(`TAKEDOWN · ${rival.pilotName.toUpperCase()}`);
            sfx.playChime(820);
          }
          break;
        }
      }
    }

    // Update Homing Missile
    if (missileActive) {
      missileTtl -= step;
      missileZ -= 95 * step;
      const targetRival =
        rivals.find((r) => r.index === missileTargetIndex) ?? lockedRival;
      if (targetRival && targetRival.respawnTimer <= 0) {
        const tz = -0.4 - (targetRival.s - playerS);
        const distAhead = Math.max(0, -tz);
        const tx = trackSample.curvature * (distAhead * distAhead) * 0.0026 + targetRival.x;
        const ty = targetRival.y + trackSample.pitchSlope * distAhead * 0.08;
        missileX = lerp(missileX, tx, clamp(step * 9, 0, 1));
        missileY = lerp(missileY, ty, clamp(step * 9, 0, 1));
        if (Math.abs(missileZ - tz) < 4.0) {
          missileActive = false;
          targetRival.hull = 100;
          targetRival.respawnTimer = 2.5;
          targetRival.s = playerS - 30;
          takedowns += 1;
          showBanner(`MISSILE TAKEDOWN · ${targetRival.pilotName.toUpperCase()}`);
          sfx.playShockwave();
        }
      }
      if (missileTtl <= 0 || missileZ < -140) {
        missileActive = false;
      }
      if (missileActive) {
        missileHandle.setPosition(missileX, missileY, missileZ).setVisible(true);
      } else {
        missileHandle.setPosition(0, -60, 0).setVisible(false);
      }
    } else {
      missileHandle.setPosition(0, -60, 0).setVisible(false);
    }

    // Animate Rain Streaks
    for (let i = 0; i < RAIN_STREAK_COUNT; i += 1) {
      const h = rainHandles[i]!;
      const rx = ((i * 7.3) % 26) - 13 + playerX * 0.35;
      const ry = wrapPositive(12 - simTime * 26 - i * 1.9, 12) + 0.5;
      const rz = -3 - wrapPositive(simTime * 88 + i * 6.7, 65);
      h.setPosition(rx, ry, rz);
    }

    // Elimination Mode Timer
    if (selectedMode === "elim" && activeFieldCount > 1) {
      elimCountdown -= step;
      if (elimCountdown <= 0) {
        elimCountdown = 20.0;
        const victim = rivals.find((r) => !r.eliminated);
        if (victim) {
          victim.eliminated = true;
          lastEliminatedName = victim.pilotName.toUpperCase();
          activeFieldCount = Math.max(1, activeFieldCount - 1);
          showBanner(`ELIMINATED · ${lastEliminatedName}`);
        }
      }
      if (hudElimTime) hudElimTime.textContent = `${elimCountdown.toFixed(1)}s`;
      if (hudElimLast) hudElimLast.textContent = lastEliminatedName;
    }

    // Time Trial Ghost Delta
    if (selectedMode === "trial") {
      const ghostDelta = Math.sin(simTime * 0.45) * 0.65 - 0.28;
      if (hudGhostDelta) {
        hudGhostDelta.textContent = `${ghostDelta >= 0 ? "+" : ""}${ghostDelta.toFixed(2)}s`;
      }
      if (hudGhostNote) {
        hudGhostNote.textContent =
          ghostDelta <= 0 ? "AHEAD OF BEST PACE" : "CHASING GHOST LINE";
      }
    }

    // Compute Player Race Position (P1–P12)
    let aheadCount = 0;
    for (const r of rivals) {
      if (!r.eliminated && r.s > playerS + 2) {
        aheadCount += 1;
      }
    }
    const playerPos = clamp(1 + Math.min(3, Math.floor(aheadCount / 3)), 1, activeFieldCount);

    // Update DOM HUD Elements
    if (hudPos) hudPos.textContent = String(playerPos);
    if (hudPosOf) hudPosOf.textContent = `/${selectedMode === "trial" ? 1 : activeFieldCount}`;
    if (hudLap) hudLap.textContent = String(currentLap);
    if (hudTime) hudTime.textContent = formatRaceTime(lapTime);
    if (hudBest) {
      hudBest.textContent = bestLapSeconds !== null ? formatRaceTime(bestLapSeconds) : "--:--.-";
    }
    if (hudHull) {
      hudHull.style.width = `${clamp(hull, 0, 100).toFixed(1)}%`;
      hudHull.classList.toggle("warn", hull < 55 && hull >= 28);
      hudHull.classList.toggle("crit", hull < 28);
    }
    if (hudTd) hudTd.textContent = String(takedowns);
    if (hudSpeed) hudSpeed.textContent = String(Math.round(playerSpeedKmh));
    if (hudAb) hudAb.style.width = `${clamp(afterburnerEnergy, 0, 100).toFixed(1)}%`;
    if (hudHeat) {
      hudHeat.style.width = `${clamp(coreHeat, 0, 100).toFixed(1)}%`;
      hudHeat.classList.toggle("overheat", overheated);
    }
    if (hudShield) hudShield.style.width = `${clamp(shieldEnergy, 0, 100).toFixed(1)}%`;
    if (hudGun) hudGun.style.width = `${clamp(gunEnergy, 0, 100).toFixed(1)}%`;

    if (hudItem) {
      hudItem.textContent = heldItem ?? "— NONE —";
      hudItem.classList.toggle("empty", !heldItem);
    }
    if (hudShock) {
      hudShock.classList.toggle("cooling", shockCooldown > 0);
      hudShock.innerHTML =
        shockCooldown > 0 ? `<b>Q</b>${shockCooldown.toFixed(0)}S` : `<b>Q</b>SHOCK`;
    }
    if (hudRoll) {
      hudRoll.classList.toggle("cooling", rollCooldown > 0);
      hudRoll.innerHTML =
        rollCooldown > 0 ? `<b>R</b>${rollCooldown.toFixed(0)}S` : `<b>R</b>BARREL`;
    }
    if (hudMine) {
      hudMine.classList.toggle("cooling", mineCooldown > 0);
      hudMine.innerHTML =
        mineCooldown > 0 ? `<b>C</b>${mineCooldown.toFixed(0)}S` : `<b>C</b>MINE`;
    }
    if (hudHyperStatus) {
      hudHyperStatus.classList.toggle("show", hyperdriveTimer > 0);
    }
    if (hudIncoming) {
      hudIncoming.classList.toggle("show", incomingWarningTimer > 0);
    }

    if (fxSpeedLines) {
      const speedAlpha = clamp((playerSpeedKmh - 480) / 240, 0, 0.85);
      fxSpeedLines.style.opacity = speedAlpha.toFixed(2);
    }
    if (fxHeatGlaze) {
      const heatAlpha = overheated ? 0.85 : clamp((coreHeat - 72) / 35, 0, 0.65);
      fxHeatGlaze.style.opacity = heatAlpha.toFixed(2);
    }

    // Project 3D Target Lock Bracket onto the locked rival drone
    if (hudLock) {
      if (lockedRival) {
        const tz = -0.4 - (lockedRival.s - playerS);
        const distAhead = Math.max(1, -tz);
        const tx = trackSample.curvature * (distAhead * distAhead) * 0.0026 + lockedRival.x;
        const ty = lockedRival.y + trackSample.pitchSlope * distAhead * 0.08;
        const screenX = clamp(50 + ((tx - playerX * 0.35) / distAhead) * 105, 18, 82);
        const screenY = clamp(46 - ((ty - 1.8) / distAhead) * 85, 22, 74);
        hudLock.style.left = `${screenX.toFixed(1)}%`;
        hudLock.style.top = `${screenY.toFixed(1)}%`;
        hudLock.classList.add("visible");
        if (hudLockLabel) {
          hudLockLabel.textContent = `LOCK · ${lockedRival.pilotName.toUpperCase()} · ${Math.round(distAhead)}M`;
        }
      } else {
        hudLock.classList.remove("visible");
      }
    }

    // Render live 2D Minimap Radar
    drawMinimapRadar(circuit, lockedRivalIdx);

    const frameEvidence = {
      route: "showcase-heatsink-v2",
      engine: "@aura3d/engine",
      ready: true,
      drone: selectedDrone,
      circuit: selectedCircuit,
      mode: selectedMode,
      lap: currentLap,
      speedKmh: Math.round(playerSpeedKmh),
      hull: Math.round(hull),
      heat: Math.round(coreHeat),
      takedowns,
      modelNodeCount: 34,
      admittedAssetKeyCount: 30
    };
    (window as unknown as Record<string, unknown>).__AURA3D_GAME_EVIDENCE__ = frameEvidence;
    (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = frameEvidence;
  });

  const globalApi = {
    app: auraApp,
    selectDrone,
    selectCircuit,
    selectMode,
    triggerShockwave,
    triggerBarrelRoll,
    fireHomingMissile,
    resetRace,
    getState: () => ({
      route: "showcase-heatsink-v2",
      ready: true,
      drone: selectedDrone,
      circuit: selectedCircuit,
      mode: selectedMode,
      lap: currentLap,
      speedKmh: Math.round(playerSpeedKmh),
      hull: Math.round(hull),
      heat: Math.round(coreHeat),
      takedowns,
      modelNodeCount: 34,
      admittedAssetKeyCount: 30
    })
  };

  (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_HEATSINK__ = globalApi;
  (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_HEATSINK_V2__ = globalApi;
  document.body.dataset.aura3dReady = "true";
}

void bootThermalDriftShowcase();
