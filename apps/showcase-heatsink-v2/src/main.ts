/**
 * THERMAL DRIFT v2 — flagship night-city combat drone racer.
 *
 * Rebuilt on the engine's real systems end to end:
 *  - createGame session/input/touch/sound/juice facade (deterministic inputs,
 *    bufferMs, flight touch preset, SFX cues, juice event map).
 *  - game.combatWorld actors + hitbox/hurtbox/guardbox volumes drive ALL
 *    damage: player bolts, rival bolts, missiles, mines, shockwaves, rams.
 *  - game.combatEvents bridges events → sparks, hit-stop, camera impact, HUD.
 *  - createCombatAi gives every rival live aggression/spacing/punish logic.
 *  - game.collisionWorld trigger volumes own cooling zones, gates, pickups,
 *    boost pads, hazards, and mine proximity.
 *  - looks.preset("night-city") + rain / volumetric fog / SSR / neon bloom /
 *    searchlight cones / aurora sky band.
 *  - game.eventLog feeds the DOM kill feed; game.hud.* bindings produce a real
 *    snapshot each frame; createCameraPathFromPreset drives the attract and
 *    finish flythroughs; game.cameraDirector owns kill-cam specials.
 */

import {
  camera,
  createCameraPathFromPreset,
  createCombatAi,
  effects,
  game,
  looks,
  material,
  model,
  primitives,
  sampleCameraPath,
  scene,
  type AuraAssetRef,
  type AuraRuntimeNodeHandle,
  type CombatAi,
  type CombatFrameData,
  type GameCombatEvent,
  type GameCombatMove,
  createAssetProvenance,
  flattenSceneSnapshot,
  isRenderableModelNode,
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets-v2";

/** Structural types for engine-internal shapes not on the public export union. */
type V3 = readonly [number, number, number];
type ModelAsset = AuraAssetRef<"model">;
type CombatWorldInstance = ReturnType<typeof game.combatWorld>;
type CombatActorInit = Parameters<CombatWorldInstance["addActor"]>[0];
type CollisionWorldInstance = ReturnType<typeof game.collisionWorld>;
type CollisionBodyRef = ReturnType<CollisionWorldInstance["addBox"]>;

// ---------------------------------------------------------------------------
// Content tables
// ---------------------------------------------------------------------------

type DroneId = "orion" | "volt" | "bastion" | "spectre" | "razor" | "nighthawk" | "wraith" | "pyre";
type CircuitId = "grand" | "dustfall" | "vesper";
type ModeId = "race" | "trial" | "elim";
type Phase = "title" | "countdown" | "racing" | "finished" | "results";

interface DroneSpec {
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
  readonly asset: ModelAsset;
}

interface CircuitSector {
  readonly name: string;
  readonly startFrac: number;
  readonly curvature: number;
  readonly pitchSlope: number;
}

interface CircuitSpec {
  readonly id: CircuitId;
  readonly name: string;
  readonly shortName: string;
  readonly length: number;
  readonly accentColor: string;
  readonly sectors: readonly CircuitSector[];
}

const DRONE_SPECS: Record<Exclude<DroneId, "pyre">, DroneSpec> & { pyre?: DroneSpec } = {
  orion: { id: "orion", name: "ORION", tag: "Balanced. Reliable. Built to race.", speed: 8, armour: 5, laser: 6, boost: 8, color: "#d2561c", nodeId: "drone-orion", maxDim: 3.8, asset: assets.heatsinkDroneOrion },
  volt: { id: "volt", name: "VOLT", tag: "Light frame. Brutal acceleration.", speed: 9, armour: 3, laser: 6, boost: 9, color: "#1f9dff", nodeId: "drone-volt", maxDim: 3.6, asset: assets.heatsinkDroneVolt },
  bastion: { id: "bastion", name: "BASTION", tag: "Heavy armour. Takes the hits.", speed: 6, armour: 9, laser: 5, boost: 6, color: "#1438df", nodeId: "drone-bastion", maxDim: 4.1, asset: assets.heatsinkDroneBastion },
  spectre: { id: "spectre", name: "SPECTRE", tag: "Cool-running guns. Long bursts.", speed: 7, armour: 6, laser: 9, boost: 7, color: "#d999ad", nodeId: "drone-spectre", maxDim: 3.75, asset: assets.heatsinkDroneSpectre },
  razor: { id: "razor", name: "RAZOR", tag: "Armoured brawler. Holds the racing line.", speed: 7, armour: 7, laser: 6, boost: 7, color: "#ad1060", nodeId: "drone-razor", maxDim: 3.85, asset: assets.heatsinkDroneRazor },
  nighthawk: { id: "nighthawk", name: "NIGHTHAWK", tag: "Heavy firepower. Sustained pressure.", speed: 7, armour: 6, laser: 8, boost: 6, color: "#611a78", nodeId: "drone-nighthawk", maxDim: 3.85, asset: assets.heatsinkDroneNighthawk },
  wraith: { id: "wraith", name: "WRAITH", tag: "Light interceptor. Speed over armour.", speed: 8, armour: 4, laser: 7, boost: 8, color: "#0d8ca8", nodeId: "drone-wraith", maxDim: 3.7, asset: assets.heatsinkDroneWraith }
};

// PYRE — the Meshy-generated 8th hero drone (gunship). Registered only when the
// generated GLB was actually shipped into public/aura-assets/.
const pyreAsset = (assets as { td2DronePyre?: ModelAsset }).td2DronePyre;
if (pyreAsset) {
  (DRONE_SPECS as Record<string, DroneSpec>).pyre = {
    id: "pyre",
    name: "PYRE",
    tag: "Meshy-forged gunship. Heavy cannons, slow-cooling core.",
    speed: 7, armour: 7, laser: 8, boost: 7,
    color: "#ff7a2f", nodeId: "drone-pyre", maxDim: 4.3,
    asset: pyreAsset
  };
}

const DRONE_ORDER: readonly DroneId[] = (
  ["orion", "volt", "bastion", "spectre", "razor", "nighthawk", "wraith"] as DroneId[]
).concat(DRONE_SPECS.pyre ? ["pyre"] : []);

const bossAsset = (assets as { td2DroneBoss?: ModelAsset }).td2DroneBoss;
const coolingTowerAsset = (assets as { td2CoolingTower?: ModelAsset }).td2CoolingTower;
const neonTowerAsset = (assets as { td2TowerNeon?: ModelAsset }).td2TowerNeon;

const RIVAL_PILOT_NAMES: readonly string[] = [
  "Vex Rallo", "Kira Dune", "Old Mott", "Saba Teel", "Rook Varn", "Jix Polo", "APEX GATEKEEPER"
];

const CIRCUITS: Record<CircuitId, CircuitSpec> = {
  grand: {
    id: "grand",
    name: "GRAND CIRCUIT · MEGACITY",
    shortName: "MEGACITY",
    length: 2400,
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

const PICKUP_ITEMS = ["TURBO CELL", "CRYO FLUSH", "EMP SURGE", "AEGIS MATRIX", "SEEKER SALVO", "HYPERDRIVE"] as const;
type PickupItem = (typeof PICKUP_ITEMS)[number];

const TRACK_HALF_WIDTH = 10.5;
const TOTAL_LAPS = 3;
const ROAD_TILE_COUNT = 16;
const ROAD_TILE_SPACING = 12;
const WALL_SEGMENT_COUNT = 14;
const PLAYER_BOLT_POOL = 10;
const RIVAL_BOLT_POOL = 8;
const MINE_POOL = 3;
const RIVAL_COUNT = 7;
const COMBO_WINDOW_S = 6.5;

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

// ---------------------------------------------------------------------------
// Runtime state shapes
// ---------------------------------------------------------------------------

interface RivalState {
  readonly index: number;
  readonly pilotName: string;
  readonly actorId: string;
  readonly ai: CombatAi;
  readonly boss: boolean;
  droneId: DroneId | "boss";
  s: number;
  lap: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  baseSpeed: number;
  eliminated: boolean;
  respawnTimer: number;
  attackCd: number;
  blockTimer: number;
  aiPhase: number;
}

interface BoltState {
  readonly actorId: string;
  active: boolean;
  team: "player" | "rival";
  x: number;
  y: number;
  relZ: number;
  vz: number;
  ttl: number;
}

interface MineState {
  readonly actorId: string;
  readonly bodyId: string;
  active: boolean;
  s: number;
  x: number;
  armTimer: number;
}

interface SceneryAnchor {
  readonly id: string;
  readonly asset: ModelAsset | undefined;
  readonly maxDim: number;
  readonly s: number;
  readonly period: number;
  readonly lateralX: number;
  readonly baseY: number;
  readonly yaw: number;
  readonly spinSpeed?: number;
  readonly trigger?: "boost" | "cooling-canister" | "shield" | "water-zone" | "lava" | "barrel";
}

const SCENERY_ANCHORS: readonly SceneryAnchor[] = [
  { id: "prop-gantry-start", asset: assets.heatsinkGantryStart, maxDim: 38, s: 68, period: 240, lateralX: 0, baseY: 0, yaw: 0 },
  { id: "prop-arch-a", asset: assets.heatsinkArch, maxDim: 38, s: 46, period: 160, lateralX: 0, baseY: 0, yaw: 0 },
  { id: "prop-arch-b", asset: assets.heatsinkArch, maxDim: 38, s: 126, period: 160, lateralX: 0, baseY: 0, yaw: 0 },
  { id: "prop-overpass", asset: assets.heatsinkOverpass, maxDim: 56, s: 94, period: 220, lateralX: 0, baseY: 4.8, yaw: 0 },
  { id: "prop-tunnel-a", asset: assets.heatsinkTunnelFrame, maxDim: 36, s: 58, period: 180, lateralX: 0, baseY: 0, yaw: 0 },
  { id: "prop-tunnel-b", asset: assets.heatsinkTunnelFrame, maxDim: 36, s: 148, period: 180, lateralX: 0, baseY: 0, yaw: 0 },
  { id: "prop-statue", asset: assets.heatsinkStatue, maxDim: 22, s: 128, period: 260, lateralX: -19.5, baseY: 0, yaw: 0.35 },
  { id: "prop-tower-l-left", asset: assets.heatsinkTowerL, maxDim: 46, s: 44, period: 150, lateralX: -28, baseY: -2, yaw: 0.1 },
  { id: "prop-tower-l-right", asset: assets.heatsinkTowerL, maxDim: 48, s: 118, period: 150, lateralX: 28.5, baseY: -2, yaw: -0.15 },
  { id: "prop-tower-t-left", asset: assets.heatsinkTowerT, maxDim: 52, s: 82, period: 170, lateralX: -29, baseY: -2, yaw: 0 },
  { id: "prop-tower-x-right", asset: assets.heatsinkTowerX, maxDim: 54, s: 156, period: 190, lateralX: 29.5, baseY: -2, yaw: 0.2 },
  { id: "prop-tower-t-right2", asset: assets.heatsinkTowerT, maxDim: 58, s: 26, period: 190, lateralX: 31, baseY: -2, yaw: 0.4 },
  { id: "prop-billboard-left", asset: assets.heatsinkHoloBillboard, maxDim: 9.5, s: 60, period: 140, lateralX: -16.2, baseY: 5.4, yaw: 0.28 },
  { id: "prop-billboard-right", asset: assets.heatsinkHoloBillboard, maxDim: 9.5, s: 130, period: 140, lateralX: 16.2, baseY: 5.6, yaw: -0.28 },
  { id: "prop-billboard-deep", asset: assets.heatsinkHoloBillboard, maxDim: 12, s: 170, period: 200, lateralX: -19, baseY: 7.2, yaw: 0.34 },
  { id: "prop-lava-fall", asset: assets.heatsinkLavaFall, maxDim: 18, s: 108, period: 210, lateralX: 18.5, baseY: 0, yaw: -0.4, trigger: "lava" },
  { id: "prop-water-emitter", asset: assets.heatsinkWaterEmitter, maxDim: 14, s: 76, period: 190, lateralX: -16.8, baseY: 0, yaw: 0.4 },
  { id: "prop-water-emitter-b", asset: assets.heatsinkWaterEmitter, maxDim: 15, s: 172, period: 230, lateralX: 17.2, baseY: 0, yaw: -0.5 },
  { id: "prop-barrier-left", asset: assets.heatsinkBarrierA, maxDim: 3.8, s: 28, period: 90, lateralX: -9.4, baseY: 0.2, yaw: 0 },
  { id: "prop-barrier-right", asset: assets.heatsinkBarrierA, maxDim: 3.8, s: 116, period: 110, lateralX: 9.4, baseY: 0.2, yaw: 0 },
  { id: "prop-checkpoint-ring", asset: assets.heatsinkCheckpointRing, maxDim: 26, s: 86, period: 150, lateralX: 0, baseY: 1.2, yaw: 0 },
  { id: "prop-boost-pad", asset: assets.heatsinkBoostPad, maxDim: 4.8, s: 42, period: 110, lateralX: -2.4, baseY: 0.12, yaw: 0, trigger: "boost" },
  { id: "prop-boost-pad-b", asset: assets.heatsinkBoostPad, maxDim: 4.8, s: 134, period: 160, lateralX: 3.4, baseY: 0.12, yaw: 0, trigger: "boost" },
  { id: "prop-cooling-canister", asset: assets.heatsinkCoolingCanister, maxDim: 2.1, s: 64, period: 125, lateralX: 3.1, baseY: 1.45, yaw: 0, spinSpeed: 1.8, trigger: "cooling-canister" },
  { id: "prop-shield-pickup", asset: assets.heatsinkShieldPickup, maxDim: 2.0, s: 98, period: 135, lateralX: -3.2, baseY: 1.65, yaw: 0, spinSpeed: 2.1, trigger: "shield" },
  { id: "prop-explosive-barrel", asset: assets.heatsinkExplosiveBarrel, maxDim: 1.9, s: 54, period: 115, lateralX: 5.6, baseY: 0.45, yaw: 0.2, trigger: "barrel" },
  { id: "prop-explosive-barrel-b", asset: assets.heatsinkExplosiveBarrel, maxDim: 1.9, s: 160, period: 175, lateralX: -5.8, baseY: 0.45, yaw: -0.3, trigger: "barrel" }
];

// Meshy hero anchors — appended only when the generated GLBs exist.
if (neonTowerAsset) {
  (SCENERY_ANCHORS as SceneryAnchor[]).push(
    { id: "prop-neon-tower-a", asset: neonTowerAsset as never, maxDim: 72, s: 34, period: 210, lateralX: -40, baseY: -3, yaw: 0.15 },
    { id: "prop-neon-tower-b", asset: neonTowerAsset as never, maxDim: 80, s: 102, period: 230, lateralX: 42, baseY: -3, yaw: -0.2 },
    { id: "prop-neon-tower-c", asset: neonTowerAsset as never, maxDim: 66, s: 180, period: 250, lateralX: -44, baseY: -3, yaw: 0.55 }
  );
}
if (coolingTowerAsset) {
  (SCENERY_ANCHORS as SceneryAnchor[]).push(
    { id: "prop-cooling-tower-a", asset: coolingTowerAsset as never, maxDim: 11, s: 76, period: 190, lateralX: -13.6, baseY: 0, yaw: 0.4 },
    { id: "prop-cooling-tower-b", asset: coolingTowerAsset as never, maxDim: 12, s: 172, period: 230, lateralX: 14.2, baseY: 0, yaw: -0.5 }
  );
}

/** Water-cooling zones: paired with the water-emitter anchors (same s/period). */
const WATER_ZONES = [
  { s: 76, period: 190, xMin: -11, xMax: -3.5 },
  { s: 172, period: 230, xMin: 3.5, xMax: 11 }
] as const;
const LAVA_ZONE = { s: 108, period: 210, xMin: 4.5, xMax: 11 } as const;

/** Checkpoint gates per lap (fractions of circuit length). */
const GATE_FRACS = [0.22, 0.46, 0.7, 0.92] as const;
const GATE_NAMES = ["SPLIT α", "SPLIT β", "SPLIT γ", "FINAL SPLIT"] as const;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

function buildScene() {
  const s = scene()
    .add(looks.preset("night-city", { fogDensityScale: 1.12, exposureEv: 0.06 }))
    .camera(
      camera.perspective({
        fov: 64,
        near: 0.25,
        far: 700,
        position: [0, 4.1, 9.6],
        target: [0, 1.9, -20]
      })
    )
    .addMany([
      // Night-city weather stack: rain, volumetric fog, wet-street SSR, neon
      // bloom on signage, sweeping searchlight cones, a dim aurora sky band.
      effects.rain({ intensity: 0.9, particleCount: 2800, speed: 30, wind: [-3, 0, -16], color: "#8fb6e8", splashes: true, mist: true }),
      effects.volumetricFog({ density: 0.028, color: "#0a1626", intensity: 0.72, heightFalloff: 0.1, heightReference: 1.5 }),
      effects.screenSpaceReflections({ intensity: 0.6 }),
      effects.neonBloom({ intensity: 0.5 }),
      effects.bloom({ intensity: 0.32, threshold: 0.62, radius: 0.55 }),
      effects.vignette({ intensity: 0.22, smoothness: 0.7 }),
      effects.colorGrade({ contrast: 1.06, saturation: 1.12 }),
      effects.auroraRibbon({ color: "#16344e", colorTop: "#0a1420", width: 320, height: 46, sway: 0.35, shimmer: 0.35 }).position(0, 96, -270),
      effects.lightCone({ position: [-16, 22, -56], direction: [0.4, -0.88, -0.22], length: 76, coneAngle: 0.14, color: "#9ec8ff", intensity: 0.55, softness: 0.6 }),
      effects.lightCone({ position: [17, 24, -104], direction: [-0.32, -0.9, -0.26], length: 88, coneAngle: 0.12, color: "#ffb27a", intensity: 0.45, softness: 0.6 }),
      effects.fogVolume({ position: [0, 2.5, -72], size: [34, 8, 46], color: "#0d1e30", density: 0.045 }),
      effects.fogVolume({ position: [0, 2.5, -150], size: [34, 8, 40], color: "#13202f", density: 0.04 })
    ]);

  // Abyss floor + horizon glow bands (minor dressing, night-wet materials)
  s.addMany([
    primitives
      .box({ name: "megacity-abyss-floor", size: [520, 0.5, 460], material: material.pbr({ color: "#05070c", roughness: 0.24, metalness: 0.55 }) })
      .position(0, -8.5, -160),
    primitives
      .box({ name: "horizon-neon-band", size: [500, 22, 2], material: material.emissive({ color: "#123c52", emissive: "#1a5e82", emissiveIntensity: 0.55 }) })
      .position(0, 20, -252),
    primitives
      .box({ name: "horizon-ember-band", size: [500, 9, 2], material: material.emissive({ color: "#ff6b2b", emissive: "#c33f14", emissiveIntensity: 0.6 }) })
      .position(0, 6, -248)
  ]);

  // Wet road deck tiles + neon spine + lane dashes
  const deckEvenMat = material.pbr({ color: "#141a24", roughness: 0.2, metalness: 0.58 });
  const deckOddMat = material.pbr({ color: "#10161f", roughness: 0.24, metalness: 0.5 });
  const spineCyanMat = material.emissive({ color: "#35d6ff", emissive: "#35d6ff", emissiveIntensity: 1.6 });
  const spineOrangeMat = material.emissive({ color: "#ff6a26", emissive: "#ff4d1f", emissiveIntensity: 1.6 });
  const laneDashMat = material.emissive({ color: "#d6deeb", emissive: "#94a3b8", emissiveIntensity: 0.5 });
  const puddleMat = material.pbr({ color: "#0a1420", roughness: 0.08, metalness: 0.7 });

  for (let i = 0; i < ROAD_TILE_COUNT; i += 1) {
    const z = 8 - i * ROAD_TILE_SPACING;
    s.addMany([
      primitives.box({ name: `road-deck-${i}`, size: [22.4, 0.36, ROAD_TILE_SPACING + 0.35], material: i % 2 === 0 ? deckEvenMat : deckOddMat }).position(0, -0.18, z).runtime(game.runtimeNode(`road-deck-${i}`)),
      primitives.box({ name: `road-spine-${i}`, size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58], material: i % 3 === 0 ? spineCyanMat : spineOrangeMat }).position(0, 0.03, z).runtime(game.runtimeNode(`road-spine-${i}`)),
      primitives.box({ name: `road-lane-l-${i}`, size: [0.18, 0.04, ROAD_TILE_SPACING * 0.45], material: laneDashMat }).position(-5.2, 0.025, z).runtime(game.runtimeNode(`road-lane-l-${i}`)),
      primitives.box({ name: `road-lane-r-${i}`, size: [0.18, 0.04, ROAD_TILE_SPACING * 0.45], material: laneDashMat }).position(5.2, 0.025, z).runtime(game.runtimeNode(`road-lane-r-${i}`)),
      primitives.box({ name: `road-puddle-l-${i}`, size: [3.2, 0.02, ROAD_TILE_SPACING * 0.7], material: puddleMat }).position(-8.2, 0.015, z).runtime(game.runtimeNode(`road-puddle-l-${i}`)),
      primitives.box({ name: `road-puddle-r-${i}`, size: [3.2, 0.02, ROAD_TILE_SPACING * 0.7], material: puddleMat }).position(8.2, 0.015, z).runtime(game.runtimeNode(`road-puddle-r-${i}`))
    ]);
  }

  // Hazard walls with neon chevrons
  const wallBaseMat = material.pbr({ color: "#1b222e", roughness: 0.42, metalness: 0.5 });
  const chevOrangeMat = material.emissive({ color: "#ff521b", emissive: "#ff521b", emissiveIntensity: 1.8 });
  const chevAmberMat = material.emissive({ color: "#ffb800", emissive: "#ffb800", emissiveIntensity: 1.7 });
  for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
    const z = 6 - i * 13.5;
    const chevMat = i % 2 === 0 ? chevOrangeMat : chevAmberMat;
    s.addMany([
      primitives.box({ name: `wall-left-${i}`, size: [0.95, 1.35, 12.8], material: wallBaseMat }).position(-11.3, 0.55, z).runtime(game.runtimeNode(`wall-left-${i}`)),
      primitives.box({ name: `wall-right-${i}`, size: [0.95, 1.35, 12.8], material: wallBaseMat }).position(11.3, 0.55, z).runtime(game.runtimeNode(`wall-right-${i}`)),
      primitives.box({ name: `chevron-left-${i}`, size: [0.22, 0.36, 9.6], material: chevMat }).position(-10.72, 0.72, z).runtime(game.runtimeNode(`chevron-left-${i}`)),
      primitives.box({ name: `chevron-right-${i}`, size: [0.22, 0.36, 9.6], material: chevMat }).position(10.72, 0.72, z).runtime(game.runtimeNode(`chevron-right-${i}`))
    ]);
  }

  // Heat-reactive thruster plumes + shockwave ring + shield bubble
  s.addMany([
    primitives
      .cylinder({ name: "player-thruster-left", size: [0.3, 1.5, 0.3], material: material.emissive({ color: "#ff8c2b", emissive: "#ff4d1f", emissiveIntensity: 2.0, opacity: 0.85 }) })
      .position(-0.55, 1.42, 1.35)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("player-thruster-left")),
    primitives
      .cylinder({ name: "player-thruster-right", size: [0.3, 1.5, 0.3], material: material.emissive({ color: "#ff8c2b", emissive: "#ff4d1f", emissiveIntensity: 2.0, opacity: 0.85 }) })
      .position(0.55, 1.42, 1.35)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("player-thruster-right")),
    primitives
      .torus({ name: "player-shockwave-ring", size: [2.2, 2.2, 0.14], material: material.emissive({ color: "#35d6ff", emissive: "#35d6ff", emissiveIntensity: 2.4 }) })
      .position(0, -60, 0)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("player-shockwave-ring")),
    primitives
      .sphere({ name: "player-shield-bubble", size: [3.4, 2.1, 3.9], material: material.emissive({ color: "#35d6ff", emissive: "#1ba8e0", emissiveIntensity: 0.6, opacity: 0.4 }) })
      .position(0, -60, 0)
      .runtime(game.runtimeNode("player-shield-bubble"))
  ]);

  // Weapon primitives — player bolts (hot orange) + rival bolts (cold cyan)
  const laserMat = material.emissive({ color: "#ff9b42", emissive: "#ff4d1f", emissiveIntensity: 2.8 });
  const rivalLaserMat = material.emissive({ color: "#7ad8ff", emissive: "#2f9fd8", emissiveIntensity: 2.6 });
  for (let i = 0; i < PLAYER_BOLT_POOL; i += 1) {
    s.add(primitives.box({ name: `laser-bolt-${i}`, size: [0.15, 0.15, 3.0], material: laserMat }).position(0, -60, 0).runtime(game.runtimeNode(`laser-bolt-${i}`)));
  }
  for (let i = 0; i < RIVAL_BOLT_POOL; i += 1) {
    s.add(primitives.box({ name: `rbolt-${i}`, size: [0.17, 0.17, 3.2], material: rivalLaserMat }).position(0, -60, 0).runtime(game.runtimeNode(`rbolt-${i}`)));
  }

  s.add(
    primitives
      .cylinder({ name: "homing-missile-active", size: [0.26, 1.9, 0.26], material: material.emissive({ color: "#ff2952", emissive: "#ff4d1f", emissiveIntensity: 2.4 }) })
      .position(0, -60, 0)
      .rotate(Math.PI * 0.5, 0, 0)
      .runtime(game.runtimeNode("homing-missile-active"))
  );

  // Drone model nodes — every selectable chassis + the Meshy boss hull.
  for (const spec of Object.values(DRONE_SPECS)) {
    if (!spec?.asset) continue;
    s.add(
      model(spec.asset, { name: spec.nodeId, role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: spec.maxDim })
        .position(0, spec.id === "orion" ? 1.45 : -60, spec.id === "orion" ? -0.4 : 0)
        .runtime(game.runtimeNode(spec.nodeId, spec.id === "orion" ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined))
    );
  }
  if (bossAsset) {
    s.add(
      model(bossAsset as never, { name: "drone-boss", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 5.4 })
        .position(0, -60, 0)
        .runtime(game.runtimeNode("drone-boss"))
    );
  }

  // Engine trail on the player drone (attaches to the runtime node by id).
  s.addMany([
    effects.trail({ target: "drone-orion", color: "#ff8c2b", width: 0.5, life: 0.55, intensity: 1.1 }),
    effects.trail({ target: "drone-boss", color: "#ff2f4f", width: 0.7, life: 0.7, intensity: 1.2 })
  ]);

  // Weapon models + scenery anchors
  s.addMany([
    model(assets.heatsinkWeaponShockwave, { name: "weapon-shockwave-emitter", role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.55 })
      .position(0, 1.12, -0.4)
      .runtime(game.runtimeNode("weapon-shockwave-emitter")),
    model(assets.heatsinkWeaponMine, { name: "weapon-mine-0", role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.45 })
      .position(0, -60, 0)
      .runtime(game.runtimeNode("weapon-mine-0")),
    model(assets.heatsinkWeaponMine, { name: "weapon-mine-1", role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.45 })
      .position(0, -60, 0)
      .runtime(game.runtimeNode("weapon-mine-1")),
    model(assets.heatsinkWeaponMine, { name: "weapon-mine-2", role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.45 })
      .position(0, -60, 0)
      .runtime(game.runtimeNode("weapon-mine-2"))
  ]);

  for (const anchor of SCENERY_ANCHORS) {
    if (!anchor.asset) continue;
    s.add(
      model(anchor.asset, { name: anchor.id, role: "setDressing", scaleMode: "fit", targetMaxDimension: anchor.maxDim })
        .position(anchor.lateralX, anchor.baseY, -anchor.s)
        .rotate(0, anchor.yaw, 0)
        .runtime(game.runtimeNode(anchor.id))
    );
  }

  return s;
}

// ---------------------------------------------------------------------------
// Audio cues + juice event map
// ---------------------------------------------------------------------------

type CueId =
  | "laser" | "rival-laser" | "hit" | "takedown" | "shockwave" | "mine-deploy"
  | "mine-hit" | "missile" | "boost" | "cooling" | "checkpoint" | "lap" | "win"
  | "lose" | "ui" | "warning" | "overdrive" | "pickup" | "elimination" | "countdown"
  | "blocked" | "engine" | "rain" | "heat-warn" | "finish-horn";

type JuiceEventId =
  | "fire" | "rival-fire" | "hit" | "takedown" | "shock" | "mine" | "mine-hit"
  | "missile" | "boost" | "overdrive" | "cooling" | "checkpoint" | "lap" | "finish"
  | "player-hit" | "shield-block" | "warning" | "elimination" | "pickup" | "ko-slow";

const SFX = (id: string) => ({ url: sfxUrl(id) });

function steamVentSynth(
  ctx: { createOscillator(): { type: string; frequency: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void; start(t: number): void; stop(t: number): void }; createGain(): { gain: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }; connect(n: unknown): void }; destination: AudioNode; currentTime: number },
  dest: AudioNode
): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(190, now);
  osc.frequency.exponentialRampToValueAtTime(48, now + 0.5);
  g.gain.setValueAtTime(0.09, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc.connect(g);
  g.connect(dest);
  osc.start(now);
  osc.stop(now + 0.55);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

async function boot(): Promise<void> {

  const td = createGame<CueId, JuiceEventId>({
    id: "showcase-heatsink-v2",
    target: "#app",
    scene: buildScene,
    ...looks.appOptions("night-city"),
    diagnostics: false,
    qualityRebuild: { flags: ["game"] },
    input: {
      actions: {
        fire: ["Space"],
        boost: ["ShiftLeft", "ShiftRight"],
        brake: ["KeyB"],
        shock: ["KeyQ"],
        roll: ["KeyR"],
        mine: ["KeyC"],
        item: ["KeyE"],
        missile: ["KeyF"],
        vent: ["KeyV"],
        pause: ["Escape", "KeyP"],
        confirm: ["Enter"],
        steerLeft: ["KeyA", "ArrowLeft"],
        steerRight: ["KeyD", "ArrowRight"],
        climbUp: ["KeyW", "ArrowUp"],
        climbDown: ["KeyS", "ArrowDown"]
      },
      axes: {
        steer: { negative: "KeyA", positive: "KeyD", gamepadAxis: 0 },
        climb: { negative: "KeyS", positive: "KeyW", gamepadAxis: 1 }
      },
      bufferMs: { fire: 160, shock: 150, roll: 150, mine: 150, item: 150, missile: 150, vent: 150, pause: 140 },
      pointer: true,
      gamepad: true
    },
    touch: {
      preset: "flight",
      bindings: {
        throttle: "boost",
        brake: "brake",
        fire: "fire",
        "camera-reset": "mine",
        "stick.left": "steerLeft",
        "stick.right": "steerRight",
        "stick.up": "climbUp",
        "stick.down": "climbDown"
      }
    },
    sound: {
      buses: [
        { id: "master", volume: 1 },
        { id: "weapons", volume: 0.9 },
        { id: "engine", volume: 0.8 },
        { id: "ambience", volume: 0.55 },
        { id: "ui", volume: 0.8 }
      ],
      cues: {
        laser: { id: "laser", bus: "weapons", volume: 0.5, asset: SFX("explosion.laser.00") },
        "rival-laser": { id: "rival-laser", bus: "weapons", volume: 0.34, asset: SFX("explosion.laser.02") },
        hit: { id: "hit", bus: "weapons", volume: 0.7, asset: SFX("impact.energy.medium.00") },
        takedown: { id: "takedown", bus: "weapons", volume: 0.9, asset: SFX("explosion.medium.00") },
        shockwave: { id: "shockwave", bus: "weapons", volume: 0.85, asset: SFX("explosion.charge-up.00") },
        "mine-deploy": { id: "mine-deploy", bus: "ui", volume: 0.6, asset: SFX("ui.click.00") },
        "mine-hit": { id: "mine-hit", bus: "weapons", volume: 0.9, asset: SFX("explosion.small.00") },
        missile: { id: "missile", bus: "weapons", volume: 0.8, asset: SFX("explosion.zap.00") },
        boost: { id: "boost", bus: "engine", volume: 0.6, asset: SFX("vehicle.boost") },
        cooling: { id: "cooling", bus: "ui", volume: 0.65, asset: SFX("explosion.shield-hit.00") },
        checkpoint: { id: "checkpoint", bus: "ui", volume: 0.7, asset: SFX("stinger.checkpoint.00") },
        lap: { id: "lap", bus: "ui", volume: 0.8, asset: SFX("ui.confirm.00") },
        win: { id: "win", bus: "ui", volume: 0.9, asset: SFX("stinger.win.00") },
        lose: { id: "lose", bus: "ui", volume: 0.9, asset: SFX("stinger.lose.00") },
        ui: { id: "ui", bus: "ui", volume: 0.55, asset: SFX("ui.confirm.00") },
        warning: { id: "warning", bus: "ui", volume: 0.75, asset: SFX("stinger.alarm.00") },
        overdrive: { id: "overdrive", bus: "engine", volume: 0.7, play: steamVentSynth as never },
        pickup: { id: "pickup", bus: "ui", volume: 0.7, asset: SFX("pickup.power-up.00") },
        elimination: { id: "elimination", bus: "ui", volume: 0.8, asset: SFX("creature.announcer.ko.00") },
        countdown: { id: "countdown", bus: "ui", volume: 0.7, asset: SFX("ui.countdown-go.00") },
        blocked: { id: "blocked", bus: "weapons", volume: 0.5, asset: SFX("explosion.shield-hit.01") },
        engine: { id: "engine", bus: "engine", volume: 0.4, loop: true, asset: SFX("vehicle.jet.layer0.on") },
        rain: { id: "rain", bus: "ambience", volume: 0.5, loop: true, asset: SFX("ambience.city-night") },
        "heat-warn": { id: "heat-warn", bus: "ui", volume: 0.7, asset: SFX("stinger.alarm.01") },
        "finish-horn": { id: "finish-horn", bus: "ui", volume: 0.9, asset: SFX("stinger.level-start.00") }
      }
    },
    juice: {
      fire: { cue: "laser", shake: 0.05, fx: { kind: "streak", count: 4, color: "#ff9b42" } },
      "rival-fire": { cue: "rival-laser", fx: { kind: "streak", count: 3, color: "#7ad8ff" } },
      hit: { cue: "hit", shake: 0.22, punch: { fovDeg: 2.5, ms: 140 }, fx: { kind: "spark", count: 22, color: "#ffb800" } },
      takedown: { cue: "takedown", shake: 0.55, punch: { fovDeg: 5, ms: 320 }, hitStop: 0.09, flash: { color: "#ff6a26", peak: 0.28, ms: 220 }, rumble: { ms: 240, strong: 0.9, weak: 0.5 }, fx: { kind: "impact-flash", count: 30 } },
      shock: { cue: "shockwave", shake: 0.4, punch: { fovDeg: 4, ms: 260 }, fx: { kind: "ring", count: 26, color: "#35d6ff" } },
      mine: { cue: "mine-deploy", shake: 0.06 },
      "mine-hit": { cue: "mine-hit", shake: 0.5, hitStop: 0.07, flash: { color: "#ffb800", peak: 0.3, ms: 200 }, rumble: { ms: 200, strong: 0.8 }, fx: { kind: "impact-flash", count: 24, color: "#ffb800" } },
      missile: { cue: "missile", shake: 0.16, fx: { kind: "streak", count: 8, color: "#ff2952" } },
      boost: { cue: "boost", punch: { fovDeg: 3.5, ms: 300 }, rumble: { ms: 160, weak: 0.7 } },
      overdrive: { cue: "overdrive", punch: { fovDeg: 5.5, ms: 420 }, shake: 0.3, fx: { kind: "streak", count: 12, color: "#4fd8e8" } },
      cooling: { cue: "cooling", vignette: { amount: 0.14, ms: 500, color: "#4fd8e8" }, fx: { kind: "dust", count: 18, color: "#9fe8f4" } },
      checkpoint: { cue: "checkpoint", punch: { fovDeg: 1.6, ms: 160 } },
      lap: { cue: "lap", flash: { color: "#35d6ff", peak: 0.14, ms: 260 } },
      finish: { cue: "win", shake: 0.3, flash: { color: "#f4f2ec", peak: 0.22, ms: 500 }, vignette: { amount: 0.2, ms: 800 } },
      "player-hit": { cue: "hit", shake: 0.5, flash: { color: "#ff2952", peak: 0.3, ms: 180 }, rumble: { ms: 180, strong: 0.8, weak: 0.4 }, vignette: { amount: 0.3, ms: 260, color: "#ff2952" } },
      "shield-block": { cue: "blocked", shake: 0.18, flash: { color: "#35d6ff", peak: 0.16, ms: 140 }, fx: { kind: "spark", count: 14, color: "#35d6ff" } },
      warning: { cue: "warning", vignette: { amount: 0.22, ms: 420, color: "#ff2952" } },
      elimination: { cue: "elimination", flash: { color: "#ff2952", peak: 0.18, ms: 240 } },
      pickup: { cue: "pickup", punch: { fovDeg: 1.8, ms: 150 } },
      "ko-slow": { hitStop: 0.12, flash: { color: "#ffb800", peak: 0.22, ms: 260 } }
    },
    evidence: {
      schema: 1,
      legacyGlobals: ["__THERMAL_DRIFT_V2_EVIDENCE__"],
      sections: {
        race: () => ({
          phase, circuit: selectedCircuit, mode: selectedMode, drone: selectedDrone,
          lap: currentLap, speedKmh: Math.round(playerSpeedKmh), heat: Math.round(coreHeat),
          coolant: Math.round(coolantCharge), hull: Math.round(hull), takedowns,
          combo: comboChain, position: playerPos, gatesCleared: gatesCleared.size
        }),
        combat: () => ({
          actors: combatWorld.snapshot().actors.length,
          activeAttacks: combatWorld.snapshot().activeAttacks.length,
          rivalDecisions: rivals.map((r) => r.ai.telemetry().decisionCount),
          collisionBodies: collisionWorld.snapshot().bodies?.length ?? 0
        })
      }
    }
  });

  const app = td.app;
  const ev: Record<string, unknown> = { ready: "pending" };
  (window as unknown as Record<string, unknown>).__auraEvidence = ev;
  try {
    const snapRaw = (buildScene() as any).toJSON?.() ?? (buildScene() as any);
    const flat = (flattenSceneSnapshot as any)(snapRaw)?.nodes ?? [];
    ev.flatCount = flat.length;
    ev.models = (flat as any[]).filter((n) => isRenderableModelNode(n)).map((n) => {
      try { return { name: n?.name ?? "?", prov: createAssetProvenance(n?.asset)?.source, hasHash: Boolean(n?.asset?.hash) }; } catch { return { name: "?", prov: "err" }; }
    });
    ev.inlineModels = (ev.models as any[]).filter((m) => m.prov !== "typed-aura-assets-manifest");
  } catch { /* evidence only */ }
  setInterval(() => {
    try {
      ev.diag = (app as { diagnostics?: () => unknown }).diagnostics?.();
      ev.marks = performance.getEntriesByType("mark").filter((m) => m.name.startsWith("a3d")).map((m) => `${m.name}@${Math.round(m.startTime)}`);
    } catch { /* evidence only */ }
  }, 500);
  (app as unknown as { ready?: () => Promise<unknown> }).ready?.().then(() => { ev.ready = "ok"; }).catch((e: unknown) => { ev.ready = `err:${(e as Error)?.message ?? e}`; });
  const input = td.input!;
  const session = td.session;
  const sessionImpl = td.sessionImpl;
  const juice = td.juice;
  const sound = td.sound;

  // -------------------------------------------------------------------
  // DOM handles
  // -------------------------------------------------------------------
  const topBar = getEl<HTMLElement>("top-bar");
  const hudEl = getEl<HTMLElement>("hud");
  const titleScreen = getEl<HTMLElement>("title-screen");
  const pauseScreen = getEl<HTMLElement>("pause-screen");
  const resultsScreen = getEl<HTMLElement>("results-screen");
  const killFeedEl = getEl<HTMLElement>("kill-feed");
  const comboBadge = getEl<HTMLElement>("combo-badge");
  const comboX = getEl<HTMLElement>("combo-x");
  const comboDecay = getEl<HTMLElement>("combo-decay");
  const meltdownEl = getEl<HTMLElement>("meltdown");
  const gateToast = getEl<HTMLElement>("gate-toast");
  const damageVignette = getEl<HTMLElement>("damage-vignette");
  const controlsStrip = getEl<HTMLElement>("controls-strip");

  const hMode = getEl<HTMLElement>("h-mode");
  const hPos = getEl<HTMLElement>("h-pos");
  const hPosOf = getEl<HTMLElement>("h-posof");
  const hLap = getEl<HTMLElement>("h-lap");
  const hTime = getEl<HTMLElement>("h-time");
  const hBest = getEl<HTMLElement>("h-best");
  const hGate = getEl<HTMLElement>("h-gate");
  const hGateName = getEl<HTMLElement>("h-gate-name");
  const hElimCard = getEl<HTMLElement>("h-elim-card");
  const hElimTime = getEl<HTMLElement>("h-elim-time");
  const hElimLast = getEl<HTMLElement>("h-elim-last");
  const hGhostCard = getEl<HTMLElement>("h-ghost-card");
  const hGhostDelta = getEl<HTMLElement>("h-ghost-delta");
  const hGhostNote = getEl<HTMLElement>("h-ghost-note");
  const hHull = getEl<HTMLElement>("h-hull");
  const hTd = getEl<HTMLElement>("h-td");
  const hDroneName = getEl<HTMLElement>("h-drone-name");
  const hSectorName = getEl<HTMLElement>("h-sector-name");
  const hDroneTag = getEl<HTMLElement>("h-drone-tag");
  const hItem = getEl<HTMLElement>("h-item");
  const hShock = getEl<HTMLElement>("h-shock");
  const hRoll = getEl<HTMLElement>("h-roll");
  const hMine = getEl<HTMLElement>("h-mine");
  const hOd = getEl<HTMLElement>("h-od");
  const hSpeed = getEl<HTMLElement>("h-speed");
  const hAb = getEl<HTMLElement>("h-ab");
  const hHeat = getEl<HTMLElement>("h-heat");
  const hCool = getEl<HTMLElement>("h-cool");
  const hShield = getEl<HTMLElement>("h-shield");
  const hGun = getEl<HTMLElement>("h-gun");
  const hLock = getEl<HTMLElement>("lock");
  const hLockLabel = getEl<HTMLElement>("lock-label");
  const hIncoming = getEl<HTMLElement>("incoming");
  const hMsg = getEl<HTMLElement>("msg");
  const hMsgText = getEl<HTMLElement>("msg-text");
  const hMsgSub = getEl<HTMLElement>("msg-sub");
  const hBanner = getEl<HTMLElement>("banner");
  const hHyper = getEl<HTMLElement>("hyper-status");
  const hAutopilot = getEl<HTMLElement>("h-autopilot");
  const fxSpeedLines = getEl<HTMLElement>("speed-lines");
  const fxHeatGlaze = getEl<HTMLElement>("heat-glaze");
  const minimapCanvas = getEl<HTMLCanvasElement>("minimap");
  const minimapCtx = minimapCanvas?.getContext("2d") ?? null;

  const resKicker = getEl<HTMLElement>("res-kicker");
  const resTitle = getEl<HTMLElement>("res-title");
  const resPos = getEl<HTMLElement>("res-pos");
  const resTime = getEl<HTMLElement>("res-time");
  const resBest = getEl<HTMLElement>("res-best");
  const resTd = getEl<HTMLElement>("res-td");
  const resCombo = getEl<HTMLElement>("res-combo");
  const resHeat = getEl<HTMLElement>("res-heat");

  // -------------------------------------------------------------------
  // Runtime node handles
  // -------------------------------------------------------------------
  await app.ready();
  const req = (id: string): AuraRuntimeNodeHandle => app.nodes.require(id);

  const droneHandles = new Map<string, AuraRuntimeNodeHandle>();
  for (const spec of Object.values(DRONE_SPECS)) {
    if (spec?.asset) droneHandles.set(spec.id, req(spec.nodeId));
  }
  const bossHandle = bossAsset ? req("drone-boss") : null;

  const roadTiles = Array.from({ length: ROAD_TILE_COUNT }, (_, i) => ({
    deck: req(`road-deck-${i}`),
    spine: req(`road-spine-${i}`),
    laneL: req(`road-lane-l-${i}`),
    laneR: req(`road-lane-r-${i}`),
    puddleL: req(`road-puddle-l-${i}`),
    puddleR: req(`road-puddle-r-${i}`)
  }));
  const wallSegments = Array.from({ length: WALL_SEGMENT_COUNT }, (_, i) => ({
    left: req(`wall-left-${i}`),
    right: req(`wall-right-${i}`),
    chevL: req(`chevron-left-${i}`),
    chevR: req(`chevron-right-${i}`)
  }));
  const thrusterL = req("player-thruster-left");
  const thrusterR = req("player-thruster-right");
  const shockRing = req("player-shockwave-ring");
  const shieldBubble = req("player-shield-bubble");
  const shockEmitter = req("weapon-shockwave-emitter");
  const missileHandle = req("homing-missile-active");
  const boltHandles = Array.from({ length: PLAYER_BOLT_POOL }, (_, i) => req(`laser-bolt-${i}`));
  const rboltHandles = Array.from({ length: RIVAL_BOLT_POOL }, (_, i) => req(`rbolt-${i}`));
  const mineHandles = Array.from({ length: MINE_POOL }, (_, i) => req(`weapon-mine-${i}`));
  const sceneryHandles = SCENERY_ANCHORS.filter((a) => a.asset).map((anchor) => ({ anchor, handle: req(anchor.id) }));

  // -------------------------------------------------------------------
  // Engine game systems
  // -------------------------------------------------------------------
  const combatWorld = game.combatWorld({
    stageBounds: { minX: -14, maxX: 14, minY: 0.4, maxY: 8, minZ: -150, maxZ: 60 }
  });
  const collisionWorld = game.collisionWorld();
  const combatFx = game.effects({ app });
  const camDirector = game.cameraDirector({ mode: "follow", baseFov: 60, distance: 11, targetY: 1.8 });
  const eventLog = game.eventLog({ label: "td2-combat", maxEvents: 64 });
  const a11y = game.accessibility.settings();

  const PLAYER_HURTBOX = game.hurtbox.box({ size: [2.2, 1.5, 3.2], tags: ["hull"] });
  const PLAYER_GUARD = game.guardbox.box({ size: [3.4, 2.3, 4.4], tags: ["shield"] });
  const PLAYER_PUSH = game.pushbox.box({ size: [2.6, 1.5, 3.6] });
  const RIVAL_HURTBOX = game.hurtbox.box({ size: [2.2, 1.5, 3.2], tags: ["hull"] });
  const RIVAL_GUARD = game.guardbox.box({ size: [3.0, 2.1, 4.0], tags: ["shield"] });
  const RIVAL_PUSH = game.pushbox.box({ size: [2.6, 1.5, 3.6] });
  const BOLT_HURTBOX = game.hurtbox.box({ size: [0.4, 0.4, 0.4] });

  const BOLT_MOVE: GameCombatMove = {
    id: "bolt-strike",
    damage: 12,
    hitStop: 0.05,
    hitStun: 10,
    activeFrames: [1, 2],
    durationFrames: 3,
    hitbox: game.hitbox.box({ size: [1.5, 1.5, 3.4] }),
    knockback: [0.3, 0, -1.4]
  };
  const RIVAL_BOLT_MOVE: GameCombatMove = {
    id: "rbolt-strike",
    damage: 8,
    hitStop: 0.045,
    hitStun: 8,
    activeFrames: [1, 2],
    durationFrames: 3,
    hitbox: game.hitbox.box({ size: [1.5, 1.5, 3.4] }),
    knockback: [0.25, 0, 1.2]
  };
  const SHOCKWAVE_MOVE: GameCombatMove = {
    id: "emp-shockwave",
    damage: 30,
    hitStop: 0.09,
    hitStun: 20,
    activeFrames: [1, 5],
    durationFrames: 10,
    hitboxes: [
      game.hitbox.box({ size: [17, 6.5, 28], offset: [0, 0, -13] }),
      game.hitbox.box({ size: [17, 6.5, 18], offset: [0, 0, 9] })
    ],
    knockback: [2.2, 0.4, 9]
  };
  const MINE_MOVE: GameCombatMove = {
    id: "mine-detonate",
    damage: 38,
    hitStop: 0.1,
    hitStun: 22,
    activeFrames: [1, 3],
    durationFrames: 6,
    hitbox: game.hitbox.box({ size: [6, 4.5, 6] }),
    knockback: [1.4, 0.8, 8]
  };
  const MISSILE_MOVE: GameCombatMove = {
    id: "missile-hit",
    damage: 46,
    hitStop: 0.12,
    hitStun: 26,
    activeFrames: [1, 2],
    durationFrames: 3,
    hitbox: game.hitbox.box({ size: [2.1, 2.1, 2.4] }),
    knockback: [0.8, 0.5, 6]
  };
  const SHOVE_MOVE: GameCombatMove = {
    id: "shove",
    damage: 12,
    hitStop: 0.06,
    hitStun: 14,
    activeFrames: [1, 4],
    durationFrames: 8,
    hitbox: game.hitbox.box({ size: [4.4, 2.6, 5.2], offset: [0, 0, 0.8] }),
    knockback: [3.4, 0.2, 2]
  };

  const RIVAL_AI_MOVES: readonly CombatFrameData[] = [
    { id: "laser", startup: 12, active: 5, recovery: 34, hitstun: 8, blockstun: 5, range: 34, damage: 8, knockback: 0.15, hitstop: 3 },
    { id: "shove", startup: 9, active: 4, recovery: 22, hitstun: 12, blockstun: 8, range: 8, damage: 12, knockback: 0.6, hitstop: 5 }
  ];

  combatWorld.addActor({
    id: "player",
    team: "player",
    position: [0, 1.55, 0],
    health: 100,
    guard: 80,
    hurtboxes: [PLAYER_HURTBOX],
    guardboxes: [PLAYER_GUARD],
    pushboxes: [PLAYER_PUSH]
  });

  const hudBindings = game.hud.bindings([
    game.hud.health({ actorId: "player", label: "HULL" }),
    game.hud.meter({ actorId: "player", label: "HEAT", valuePath: "combat.actors.player.meter" }),
    game.hud.combo({ actorId: "player", label: "KILL CHAIN" }),
    game.hud.checkpoint({ label: "GATE" }),
    game.hud.eventLog({ label: "FEED" })
  ]);

  // -------------------------------------------------------------------
  // Collision bodies (trigger volumes)
  // -------------------------------------------------------------------
  const playerBody = collisionWorld.addBox("player-hull", [1.3, 0.9, 2.1], {
    type: "kinematic",
    position: [0, 1.55, 0],
    tags: ["player"]
  });

  interface ZoneBody { id: string; tag: string; handle: CollisionBodyRef; s: number; period: number; x: number; halfW: number; kind: "cooling" | "boost" | "pickup" | "hazard" | "gate"; }
  const zoneBodies: ZoneBody[] = [];

  for (const z of WATER_ZONES) {
    zoneBodies.push({
      id: `zone-cool-${z.s}`, tag: "cooling", kind: "cooling", s: z.s, period: z.period,
      x: (z.xMin + z.xMax) / 2, halfW: (z.xMax - z.xMin) / 2,
      handle: collisionWorld.addBox(`zone-cool-${z.s}`, [(z.xMax - z.xMin) / 2, 4, 9], { type: "kinematic", position: [0, 2, -60], sensor: true, tags: ["cooling-zone"] })
    });
  }
  zoneBodies.push({
    id: "zone-lava", tag: "lava", kind: "hazard", s: LAVA_ZONE.s, period: LAVA_ZONE.period,
    x: (LAVA_ZONE.xMin + LAVA_ZONE.xMax) / 2, halfW: (LAVA_ZONE.xMax - LAVA_ZONE.xMin) / 2,
    handle: collisionWorld.addBox("zone-lava", [(LAVA_ZONE.xMax - LAVA_ZONE.xMin) / 2, 4, 9], { type: "kinematic", position: [0, 2, -60], sensor: true, tags: ["hazard-zone"] })
  });
  for (const anchor of SCENERY_ANCHORS) {
    if (anchor.trigger === "boost") {
      zoneBodies.push({ id: `trig-${anchor.id}`, tag: "boost", kind: "boost", s: anchor.s, period: anchor.period, x: anchor.lateralX, halfW: 2.6, handle: collisionWorld.addBox(`trig-${anchor.id}`, [2.6, 2.4, 3], { type: "kinematic", position: [0, -60, 0], sensor: true, tags: ["boost-pad"] }) });
    } else if (anchor.trigger === "cooling-canister") {
      zoneBodies.push({ id: `trig-${anchor.id}`, tag: "coolant", kind: "pickup", s: anchor.s, period: anchor.period, x: anchor.lateralX, halfW: 2.2, handle: collisionWorld.addBox(`trig-${anchor.id}`, [2.2, 2.4, 3], { type: "kinematic", position: [0, -60, 0], sensor: true, tags: ["pickup-coolant"] }) });
    } else if (anchor.trigger === "shield") {
      zoneBodies.push({ id: `trig-${anchor.id}`, tag: "shield", kind: "pickup", s: anchor.s, period: anchor.period, x: anchor.lateralX, halfW: 2.2, handle: collisionWorld.addBox(`trig-${anchor.id}`, [2.2, 2.4, 3], { type: "kinematic", position: [0, -60, 0], sensor: true, tags: ["pickup-shield"] }) });
    } else if (anchor.trigger === "barrel") {
      zoneBodies.push({ id: `trig-${anchor.id}`, tag: "barrel", kind: "hazard", s: anchor.s, period: anchor.period, x: anchor.lateralX, halfW: 1.9, handle: collisionWorld.addBox(`trig-${anchor.id}`, [1.9, 2.2, 2.4], { type: "kinematic", position: [0, -60, 0], sensor: true, tags: ["hazard-barrel"] }) });
    }
  }
  // Checkpoint gates — four trigger volumes spanning the road each lap.
  for (let i = 0; i < GATE_FRACS.length; i += 1) {
    zoneBodies.push({
      id: `gate-${i}`, tag: "gate", kind: "gate", s: 0, period: 1,
      x: 0, halfW: 11,
      handle: collisionWorld.addBox(`gate-${i}`, [11, 6, 1.4], { type: "kinematic", position: [0, 2.4, -999], sensor: true, tags: ["gate"] })
    });
  }

  // -------------------------------------------------------------------
  // Race state
  // -------------------------------------------------------------------
  let phase: Phase = "title";
  let paused = false;
  let selectedDrone: DroneId = "orion";
  let selectedCircuit: CircuitId = "grand";
  let selectedMode: ModeId = "race";
  let demoMode = false;

  let simTime = 0;
  let lapTime = 0;
  let raceTime = 0;
  let bestLapSeconds: number | null = null;
  let currentLap = 1;
  let playerS = 18;
  let playerX = 0;
  let playerY = 1.55;
  let playerVx = 0;
  let playerVy = 0;
  let playerSpeedKmh = 120;
  let playerRoll = 0;
  let playerPitch = 0;
  let playerYaw = 0;

  let hull = 100;
  let takedowns = 0;
  let afterburnerEnergy = 88;
  let coreHeat = 18;
  let coolantCharge = 30;
  let overheated = false;
  let overheatTimer = 0;
  let shieldEnergy = 60;
  let gunEnergy = 92;
  let peakHeat = 0;

  let shockCooldown = 0;
  let shockActiveTimer = 0;
  let rollCooldown = 0;
  let barrelRollTimer = 0;
  let mineCooldown = 0;
  let ventCooldown = 0;
  let overdriveTimer = 0;
  let heldItem: PickupItem | null = null;
  let hyperdriveTimer = 0;
  let incomingWarningTimer = 0;
  let bannerTimer = 0;
  let centerMsgTimer = 0;
  let gateToastTimer = 0;
  let damageFlashTimer = 0;
  let countdownTimer = 0;
  let countdownStage = -1;
  let killCamTimer = 0;
  let killCamFocus: V3 = [0, 1.6, -20];
  let finishTimer = 0;
  let fireCooldown = 0;

  let comboChain = 0;
  let comboTimer = 0;
  let maxCombo = 0;

  let elimCountdown = 20;
  let lastEliminatedName = "—";
  let playerPos = 1;

  let nextGateIdx = 0;
  const gatesCleared = new Set<number>();
  let lapLineArmed = false;

  let missileActive = false;
  let missileX = 0;
  let missileY = -60;
  let missileRelZ = 0;
  let missileTargetIdx = -1;
  let missileTtl = 0;
  let missileActorLive = false;

  const playerBolts: BoltState[] = Array.from({ length: PLAYER_BOLT_POOL }, (_, i) => ({ actorId: `bolt-${i}`, active: false, team: "player", x: 0, y: -60, relZ: 0, vz: -150, ttl: 0 }));
  const rivalBolts: BoltState[] = Array.from({ length: RIVAL_BOLT_POOL }, (_, i) => ({ actorId: `rbolt-${i}`, active: false, team: "rival", x: 0, y: -60, relZ: 0, vz: 150, ttl: 0 }));
  const mines: MineState[] = Array.from({ length: MINE_POOL }, (_, i) => ({ actorId: `mine-${i}`, bodyId: `mine-trig-${i}`, active: false, s: 0, x: 0, armTimer: 0 }));

  const rivals: RivalState[] = [];

  function buildRivals(): void {
    rivals.length = 0;
    const pool = DRONE_ORDER.filter((d) => d !== selectedDrone);
    for (let i = 0; i < RIVAL_COUNT; i += 1) {
      const boss = i === RIVAL_COUNT - 1 && bossAsset != null;
      const droneId = boss ? "boss" : pool[i % pool.length] ?? "volt";
      const spec = boss ? null : DRONE_SPECS[droneId as DroneId];
      rivals.push({
        index: i,
        pilotName: RIVAL_PILOT_NAMES[i] ?? `RIVAL-${i + 1}`,
        actorId: `rival-${i}`,
        boss,
        ai: createCombatAi({
          moves: RIVAL_AI_MOVES,
          reactionFrames: 9 + (i % 6),
          aggression: boss ? "aggressive" : i % 3 === 0 ? "aggressive" : i % 3 === 1 ? "balanced" : "defensive",
          seed: 37 + i * 7919,
          cooldownFrames: boss ? 26 : 44,
          preferredRange: 18
        }),
        droneId: droneId as DroneId | "boss",
        s: 26 + i * 16,
        lap: 1,
        x: ((i % 4) - 1.5) * 3.4,
        y: 1.5 + (i % 3) * 0.55,
        targetX: ((i % 4) - 1.5) * 3.2,
        targetY: 1.55 + (i % 3) * 0.5,
        speed: 440 + (i % 4) * 18,
        baseSpeed: (boss ? 478 : 444) + (i % 5) * 15 + (spec?.speed ?? 7) * 4,
        eliminated: false,
        respawnTimer: 0,
        attackCd: 1.5 + i * 0.4,
        blockTimer: 0,
        aiPhase: i * 1.17
      });
    }
  }

  function spawnRivalActors(): void {
    for (const r of rivals) {
      const hullMax = r.boss ? 170 : 80 + (DRONE_SPECS[r.droneId as DroneId]?.armour ?? 6) * 8;
      combatWorld.setActor(r.actorId, {
        id: r.actorId,
        team: "rival",
        position: [r.x, r.y, -(r.s - playerS)],
        health: hullMax,
        guard: 60,
        hurtboxes: [RIVAL_HURTBOX],
        guardboxes: [RIVAL_GUARD],
        pushboxes: [RIVAL_PUSH],
        knockedOut: false,
        guarding: false
      });
    }
  }

  /** Rebuild the combat world after a KO (the world round-locks on knockout). */
  function rebuildCombat(): void {
    const snap = combatWorld.snapshot();
    const actors: CombatActorInit[] = snap.actors.map((a) => ({
      id: a.id,
      team: a.team,
      position: a.position,
      facing: a.facing,
      health: a.health,
      guard: a.guard,
      meter: a.meter,
      hurtboxes: a.hurtboxes,
      guardboxes: a.guardboxes,
      pushboxes: a.pushboxes,
      guarding: a.guarding,
      knockedOut: a.knockedOut
    }));
    combatWorld.reset(actors);
  }

  function feed(icon: string, text: string, cls: "" | "kill" | "warn" | "cool" | "danger" = ""): void {
    if (!killFeedEl) return;
    const el = document.createElement("div");
    el.className = `feed-item${cls ? ` ${cls}` : ""}`;
    el.innerHTML = `<span class="fi-ic">${icon}</span><span>${text}</span>`;
    killFeedEl.prepend(el);
    requestAnimationFrame(() => el.classList.add("show"));
    while (killFeedEl.children.length > 5) killFeedEl.lastElementChild?.remove();
    window.setTimeout(() => { el.classList.remove("show"); window.setTimeout(() => el.remove(), 260); }, 4200);
    eventLog.push({ type: "feed", label: text, severity: cls === "kill" ? "success" : cls === "danger" ? "error" : "info" });
  }

  function showBanner(text: string, duration = 1.6, cls?: string): void {
    if (hBanner) {
      hBanner.textContent = text;
      hBanner.className = `banner show${cls ? ` ${cls}` : ""}`;
    }
    bannerTimer = duration;
  }

  function showCenter(big: string, sub: string, duration = 2.0, danger = false): void {
    if (hMsgText) { hMsgText.textContent = big; hMsgText.classList.toggle("danger", danger); }
    if (hMsgSub) hMsgSub.textContent = sub;
    hMsg?.classList.add("show");
    centerMsgTimer = duration;
  }

  function gateToastMsg(text: string): void {
    if (gateToast) { gateToast.textContent = text; gateToast.classList.add("show"); }
    gateToastTimer = 1.4;
  }

  // -------------------------------------------------------------------
  // Selection + phase control
  // -------------------------------------------------------------------
  function allDroneSpecs(): DroneSpec[] {
    return DRONE_ORDER.map((d) => DRONE_SPECS[d]).filter((s): s is DroneSpec => Boolean(s));
  }

  function selectDrone(id: DroneId): void {
    if (!DRONE_SPECS[id]) return;
    selectedDrone = id;
    const spec = DRONE_SPECS[id]!;
    if (hDroneName) hDroneName.textContent = spec.name;
    if (hDroneTag) hDroneTag.textContent = spec.tag;
    document.querySelectorAll<HTMLButtonElement>("[data-drone]").forEach((b) => b.classList.toggle("active", b.dataset.drone === id));
    void sound?.cue("ui");
    if (phase === "racing") buildRivals(), spawnRivalActors(), rebuildCombat();
  }

  function selectCircuit(id: CircuitId): void {
    if (!CIRCUITS[id]) return;
    selectedCircuit = id;
    document.querySelectorAll<HTMLButtonElement>("[data-circuit]").forEach((b) => b.classList.toggle("active", b.dataset.circuit === id));
    void sound?.cue("ui");
  }

  function selectMode(id: ModeId): void {
    selectedMode = id;
    if (hMode) hMode.textContent = id === "race" ? "RACE" : id === "trial" ? "TIME TRIAL" : "ELIMINATION";
    if (hElimCard) hElimCard.style.display = id === "elim" ? "flex" : "none";
    if (hGhostCard) hGhostCard.style.display = id === "trial" ? "flex" : "none";
    document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === id));
    void sound?.cue("ui");
  }

  function setPhaseUi(): void {
    titleScreen?.classList.toggle("show", phase === "title");
    pauseScreen?.classList.toggle("show", paused);
    resultsScreen?.classList.toggle("show", phase === "results");
    hudEl?.classList.toggle("hidden", phase === "title" || phase === "results");
    topBar?.classList.toggle("hidden", phase !== "racing");
    controlsStrip?.classList.toggle("hidden", phase === "results");
  }

  function resetRaceState(): void {
    simTime = 0;
    lapTime = 0;
    raceTime = 0;
    currentLap = 1;
    playerS = 18;
    playerX = 0;
    playerY = 1.55;
    playerVx = 0;
    playerVy = 0;
    playerSpeedKmh = 120;
    playerRoll = playerPitch = playerYaw = 0;
    hull = 100;
    takedowns = 0;
    afterburnerEnergy = 88;
    coreHeat = 18;
    coolantCharge = 30;
    overheated = false;
    overheatTimer = 0;
    shieldEnergy = 60;
    gunEnergy = 92;
    peakHeat = 18;
    shockCooldown = rollCooldown = mineCooldown = ventCooldown = 0;
    shockActiveTimer = barrelRollTimer = overdriveTimer = hyperdriveTimer = 0;
    incomingWarningTimer = damageFlashTimer = killCamTimer = 0;
    heldItem = null;
    comboChain = maxCombo = comboTimer = 0;
    elimCountdown = 20;
    lastEliminatedName = "—";
    playerPos = RIVAL_COUNT + 1;
    nextGateIdx = 0;
    gatesCleared.clear();
    lapLineArmed = false;
    missileActive = false;
    missileActorLive = false;
    playerBolts.forEach((b) => { b.active = false; combatWorld.removeActor(b.actorId); });
    rivalBolts.forEach((b) => { b.active = false; combatWorld.removeActor(b.actorId); });
    mines.forEach((m) => { m.active = false; m.armTimer = 0; combatWorld.removeActor(m.actorId); try { collisionWorld.remove(m.bodyId); } catch { /* absent */ } });
    buildRivals();
    combatWorld.clear();
    combatWorld.addActor({
      id: "player", team: "player", position: [0, playerY, 0], health: 100, guard: 80,
      hurtboxes: [PLAYER_HURTBOX], guardboxes: [PLAYER_GUARD], pushboxes: [PLAYER_PUSH]
    });
    spawnRivalActors();
    eventLog.clear();
    eventLog.push({ type: "race", label: "RACE RESET", severity: "info" });
  }

  function startCountdown(): void {
    resetRaceState();
    phase = "countdown";
    countdownTimer = 3.6;
    countdownStage = -1;
    setPhaseUi();
    void sound?.cue("engine");
    void sound?.cue("rain");
  }

  function finishRace(dnf: boolean): void {
    phase = "finished";
    finishTimer = 1.6;
    session.slowMo(0.35, 1400, {});
    juice.fire("finish");
    void sound?.cue(dnf ? "lose" : "finish-horn");
    feed(dnf ? "✖" : "★", dnf ? "CORE BREACH · DNF" : `FINISH · P${playerPos}`, dnf ? "danger" : "kill");
    camDirector.special([playerX, playerY, -6], 2.2);
  }

  function showResults(dnf: boolean): void {
    phase = "results";
    sessionImpl.transition("results");
    if (resKicker) resKicker.textContent = dnf ? "RACE OVER · CORE BREACH" : "RACE COMPLETE";
    if (resTitle) resTitle.textContent = dnf ? "DNF · MELTDOWN" : playerPos === 1 ? "P1 · VICTORY" : `P${playerPos} · FINISH`;
    if (resPos) resPos.textContent = dnf ? "DNF" : `P${playerPos}`;
    if (resTime) resTime.textContent = formatRaceTime(raceTime);
    if (resBest) resBest.textContent = bestLapSeconds !== null ? formatRaceTime(bestLapSeconds) : "--:--.-";
    if (resTd) resTd.textContent = String(takedowns);
    if (resCombo) resCombo.textContent = `×${maxCombo}`;
    if (resHeat) resHeat.textContent = `${Math.round(peakHeat)}°`;
    setPhaseUi();
  }

  // -------------------------------------------------------------------
  // Weapons (all damage flows through combatWorld)
  // -------------------------------------------------------------------
  function fireLaserBurst(): void {
    if (overheated || gunEnergy < 6 || fireCooldown > 0) return;
    fireCooldown = 0.11;
    const spec = DRONE_SPECS[selectedDrone]!;
    const heatCost = Math.max(1.8, 4.2 - spec.laser * 0.22);
    coreHeat = Math.min(100, coreHeat + heatCost);
    gunEnergy = Math.max(0, gunEnergy - 7);

    let spawned = 0;
    for (const bolt of playerBolts) {
      if (!bolt.active) {
        bolt.active = true;
        bolt.x = playerX + (spawned === 0 ? -0.85 : 0.85);
        bolt.y = playerY - 0.08;
        bolt.relZ = -2.2;
        bolt.vz = -165;
        bolt.ttl = 0.72;
        combatWorld.setActor(bolt.actorId, {
          id: bolt.actorId, team: "player", position: [bolt.x, bolt.y, bolt.relZ],
          health: 1, hurtboxes: [BOLT_HURTBOX], pushboxes: []
        });
        spawned += 1;
        if (spawned >= 2) break;
      }
    }
    juice.fire("fire");
  }

  function rivalFire(r: RivalState): void {
    for (const bolt of rivalBolts) {
      if (bolt.active) continue;
      bolt.active = true;
      bolt.x = r.x;
      bolt.y = r.y;
      bolt.relZ = -(r.s - playerS) + 1.6;
      bolt.vz = 118 + playerSpeedKmh / 9.2;
      bolt.ttl = 0.9;
      combatWorld.setActor(bolt.actorId, {
        id: bolt.actorId, team: "rival", position: [bolt.x, bolt.y, bolt.relZ],
        health: 1, hurtboxes: [BOLT_HURTBOX], pushboxes: []
      });
      juice.fire("rival-fire");
      return;
    }
  }

  function triggerShockwave(): void {
    if (shockCooldown > 0 || overheated) return;
    shockCooldown = 8.0;
    shockActiveTimer = 0.65;
    coreHeat = Math.min(100, coreHeat + 6);
    combatWorld.attack("player", SHOCKWAVE_MOVE);
    juice.fire("shock");
    feed("◎", "EMP SHOCKWAVE", "");
  }

  function triggerBarrelRoll(): void {
    if (rollCooldown > 0) return;
    rollCooldown = 4.0;
    barrelRollTimer = 0.58;
    incomingWarningTimer = 0;
    shieldEnergy = Math.min(100, shieldEnergy + 14);
    combatWorld.setActor("player", { guarding: true });
    showBanner("BARREL ROLL · EVADE");
    void sound?.cue("ui");
  }

  function dropMine(): void {
    if (mineCooldown > 0) return;
    mineCooldown = 6.0;
    const mine = mines.find((m) => !m.active);
    if (!mine) return;
    mine.active = true;
    mine.s = playerS - 3;
    mine.x = playerX;
    mine.armTimer = 0.5;
    combatWorld.setActor(mine.actorId, {
      id: mine.actorId, team: "hazard", position: [mine.x, 0.5, 4],
      health: 999, hurtboxes: [game.hurtbox.box({ size: [1.6, 1.2, 1.6] })], pushboxes: []
    });
    collisionWorld.addBox(mine.bodyId, [2.6, 2.4, 2.6], { type: "kinematic", position: [mine.x, 0.6, 4], sensor: true, tags: ["mine-trigger"] });
    juice.fire("mine");
    feed("◆", "PROXIMITY MINE ARMED", "");
  }

  function detonateMine(mine: MineState, victimId: string): void {
    combatWorld.attack(mine.actorId, MINE_MOVE);
    juice.fire("mine-hit");
    feed("✸", `MINE DETONATED · ${victimId.replace("rival-", "RIVAL ").replace("player", "YOU")}`, "warn");
    mine.active = false;
    window.setTimeout(() => { combatWorld.removeActor(mine.actorId); }, 60);
    try { collisionWorld.remove(mine.bodyId); } catch { /* gone */ }
  }

  function fireMissile(): void {
    if (missileActive || overheated) return;
    let bestIdx = -1;
    let bestDist = 110;
    for (const r of rivals) {
      if (r.eliminated || r.respawnTimer > 0) continue;
      const ds = r.s - playerS;
      if (ds > 4 && ds < bestDist) { bestDist = ds; bestIdx = r.index; }
    }
    missileActive = true;
    missileTargetIdx = bestIdx;
    missileX = playerX;
    missileY = playerY - 0.2;
    missileRelZ = -2.2;
    missileTtl = 2.0;
    coreHeat = Math.min(100, coreHeat + 7);
    combatWorld.setActor("missile", {
      id: "missile", team: "player", position: [missileX, missileY, missileRelZ],
      health: 1, hurtboxes: [BOLT_HURTBOX], pushboxes: []
    });
    missileActorLive = true;
    juice.fire("missile");
    feed("➤", "SEEKER LAUNCHED", "");
  }

  function ventHeat(): void {
    if (ventCooldown > 0 || coolantCharge < 30) return;
    ventCooldown = 3.5;
    const dump = Math.min(coreHeat, 55);
    coreHeat = Math.max(8, coreHeat - dump);
    coolantCharge = Math.max(0, coolantCharge - 45);
    overheated = false;
    overdriveTimer = 1.4;
    juice.fire("overdrive");
    combatFx.groundDust([playerX, playerY - 0.5, 0], { color: "#4fd8e8", intensity: 1.3, duration: 0.6 });
    feed("❄", `CRYO VENT · −${Math.round(dump)}°`, "cool");
  }

  function useHeldItem(): void {
    if (!heldItem) return;
    const item = heldItem;
    heldItem = null;
    juice.fire("pickup");
    if (item === "TURBO CELL") { afterburnerEnergy = 100; playerSpeedKmh = Math.min(760, playerSpeedKmh + 140); showBanner("TURBO CELL IGNITED"); }
    else if (item === "CRYO FLUSH") { coreHeat = 0; coolantCharge = 100; overheated = false; showBanner("CRYO FLUSH · CORE COOLED", 1.6, "cool"); }
    else if (item === "EMP SURGE") { shockCooldown = 0; triggerShockwave(); }
    else if (item === "AEGIS MATRIX") { shieldEnergy = 100; hull = Math.min(100, hull + 35); combatWorld.setActor("player", { health: hull }); showBanner("AEGIS SHIELD RESTORED"); }
    else if (item === "SEEKER SALVO") { fireMissile(); showBanner("SEEKER SALVO LAUNCHED"); }
    else if (item === "HYPERDRIVE") { hyperdriveTimer = 4.5; coreHeat = Math.max(0, coreHeat - 30); showBanner("HYPERDRIVE ENGAGED"); }
  }

  function applyTakedown(victimId: string, label: string): void {
    const r = rivals.find((v) => v.actorId === victimId);
    takedowns += 1;
    comboChain += 1;
    maxCombo = Math.max(maxCombo, comboChain);
    comboTimer = COMBO_WINDOW_S;
    juice.fire("takedown");
    if (comboChain >= 2) juice.fire("ko-slow");
    if (r) {
      feed("✕", `${label} · ${r.pilotName.toUpperCase()}${comboChain > 1 ? ` ×${comboChain}` : ""}`, "kill");
      r.respawnTimer = selectedMode === "elim" ? 9999 : 2.4;
      r.s = playerS - 34;
      if (selectedMode === "elim") r.eliminated = true;
      killCamTimer = 0.85;
      killCamFocus = [r.x, r.y, -(r.s - playerS)];
      camDirector.special(killCamFocus, 0.85);
    }
    app.effects?.burst?.("impact-flash", killCamFocus, { count: 34, speed: 9, color: "#ff8c2b" });
    app.effects?.burst?.("spark", killCamFocus, { count: 26, speed: 12, color: "#ffb800" });
    session.hitStop(0.11, {});
  }

  // -------------------------------------------------------------------
  // Combat event processing
  // -------------------------------------------------------------------
  function processCombatEvents(events: readonly GameCombatEvent[]): void {
    if (events.length === 0) return;
    game.combatEvents(events, {
      effects: combatFx,
      camera: camDirector,
      time: app.time,
      hudBindings,
      combat: combatWorld,
      appState: { lap: currentLap, gates: gatesCleared.size, combo: comboChain }
    });
    for (const ev of events) {
      if (ev.type === "hit") {
        const onRival = ev.targetId?.startsWith("rival-");
        const onPlayer = ev.targetId === "player";
        if (onPlayer) {
          damageFlashTimer = 0.28;
          incomingWarningTimer = Math.max(incomingWarningTimer, 0.8);
          juice.fire("player-hit");
          feed("▼", `HULL HIT −${ev.damage ?? 8}`, "danger");
        } else if (onRival) {
          juice.fire("hit");
          feed("◇", `HIT · ${Math.round(ev.damage ?? 8)} DMG`, "");
        }
      } else if (ev.type === "blocked") {
        if (ev.targetId === "player") {
          shieldEnergy = Math.max(0, shieldEnergy - (ev.guardDamage ?? 6));
          juice.fire("shield-block");
        }
      } else if (ev.type === "knockout" && ev.targetId) {
        if (ev.targetId === "player") {
          hull = 0;
          finishRace(true);
        } else {
          const label = ev.moveId === "emp-shockwave" ? "EMP TAKEDOWN" : ev.moveId === "mine-detonate" ? "MINE TAKEDOWN" : ev.moveId === "missile-hit" ? "MISSILE TAKEDOWN" : "TAKEDOWN";
          applyTakedown(ev.targetId, label);
          rebuildCombat();
        }
      } else if (ev.type === "push") {
        if (ev.attackerId === "player" || ev.targetId === "player") {
          juice.fire("shield-block");
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Camera — chase rig + director specials + preset flythrough
  // -------------------------------------------------------------------
  const camPos = { x: 0, y: 4.4, z: 9.8 };
  let camShake = 0;
  const introPath = createCameraPathFromPreset({
    id: "td2-intro",
    presetId: "crane",
    startTime: 0,
    endTime: 1,
    subjectPosition: [0, 1.6, -16],
    interpolation: "catmull-rom"
  });
  const directorTargets = [{ id: "player", position: [0, 1.6, -0.4] as V3 }];

  function driveCamera(step: number): void {
    if (phase === "title") {
      // Attract: preset path loops over the start gantry.
      const t = (simTime % 14) / 14;
      const tt = t < 0.5 ? t * 2 : 2 - t * 2;
      const sample = sampleCameraPath(introPath, tt);
      camPos.x = lerp(camPos.x, sample.position[0] * 2.4, clamp(step * 1.6, 0, 1));
      camPos.y = lerp(camPos.y, 3.2 + sample.position[1] * 0.9, clamp(step * 1.6, 0, 1));
      camPos.z = lerp(camPos.z, 8.5 + sample.position[2] * 0.4, clamp(step * 1.6, 0, 1));
      app.camera?.setPose({ position: [camPos.x + Math.sin(simTime * 0.4) * 3, camPos.y, camPos.z], target: [Math.sin(simTime * 0.22) * 4, 1.7, -18], fov: 58 });
      return;
    }

    camShake = Math.max(0, camShake - step * 2.6);
    const speedT = clamp((playerSpeedKmh - 120) / 640, 0, 1);
    const desiredFov = 60 + speedT * 14 + (overdriveTimer > 0 ? 6 : 0) + (boostHeld ? 4 : 0);
    const chaseX = playerX * 0.55;
    const chaseY = 3.4 + (playerY - 1.55) * 0.6 - speedT * 0.5;
    const chaseZ = 9.4 + speedT * 1.1;
    camPos.x = lerp(camPos.x, chaseX, clamp(step * 7, 0, 1));
    camPos.y = lerp(camPos.y, chaseY, clamp(step * 7, 0, 1));
    camPos.z = lerp(camPos.z, chaseZ, clamp(step * 7, 0, 1));

    const dirSnap = camDirector.update(step, directorTargets);
    const shake = reducedMotionOn ? 0 : dirSnap.shake * 1.4 + camShake;
    const shakeX = shake * Math.sin(simTime * 61) * 0.16;
    const shakeY = shake * Math.cos(simTime * 53) * 0.1;

    if (killCamTimer > 0) {
      // Kill-cam: push toward the KO point via the director's special focus.
      const kt = killCamTimer / 0.85;
      const fx = lerp(camPos.x, killCamFocus[0] * 0.7, 1 - kt);
      const fy = lerp(camPos.y, killCamFocus[1] + 1.6, 1 - kt);
      app.camera?.setPose({
        position: [fx + shakeX, fy + shakeY, lerp(chaseZ, killCamFocus[2] + 9, 1 - kt)],
        target: [killCamFocus[0], killCamFocus[1], killCamFocus[2]],
        fov: desiredFov - 6
      });
      return;
    }

    if (phase === "finished" || phase === "results") {
      // Podium orbit driven by the camera director's snapshot framing.
      const a = simTime * 0.5;
      app.camera?.setPose({
        position: [playerX + Math.sin(a) * 7.5, 2.6 + Math.sin(a * 0.6) * 0.8, -0.4 + Math.cos(a) * 7.5],
        target: [playerX, playerY, -0.4],
        fov: 44
      });
      return;
    }

    app.camera?.setPose({
      position: [camPos.x + shakeX, camPos.y + shakeY, camPos.z],
      target: [playerX * 0.92 + playerYaw * -6, playerY + 0.5 - speedT * 0.3, -14 - speedT * 6],
      fov: desiredFov
    });
  }

  // -------------------------------------------------------------------
  // HUD + feed + minimap
  // -------------------------------------------------------------------
  function drawMinimap(circuit: CircuitSpec, lockedIdx: number): void {
    if (!minimapCtx || !minimapCanvas) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    minimapCtx.clearRect(0, 0, w, h);
    minimapCtx.strokeStyle = "rgba(244,242,236,0.08)";
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, 52, 0, Math.PI * 2);
    minimapCtx.arc(cx, cy, 28, 0, Math.PI * 2);
    minimapCtx.stroke();
    const pointForFrac = (frac: number, lat = 0): [number, number] => {
      const a = frac * Math.PI * 2 - Math.PI * 0.5;
      const harmonic =
        circuit.id === "grand" ? Math.sin(a * 3) * 9 + Math.cos(a * 2) * 6
        : circuit.id === "dustfall" ? Math.sin(a * 2) * 12 + Math.sin(a * 4) * 5
        : Math.cos(a * 3) * 11 + Math.sin(a * 5) * 6;
      const r = 44 + harmonic + lat * 0.35;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86];
    };
    minimapCtx.strokeStyle = "rgba(244,242,236,0.26)";
    minimapCtx.lineWidth = 3.2;
    minimapCtx.beginPath();
    for (let i = 0; i <= 64; i += 1) {
      const [px, py] = pointForFrac(i / 64);
      if (i === 0) minimapCtx.moveTo(px, py); else minimapCtx.lineTo(px, py);
    }
    minimapCtx.closePath();
    minimapCtx.stroke();
    minimapCtx.fillStyle = "#35d6ff";
    for (const sec of circuit.sectors) {
      const [gx, gy] = pointForFrac(sec.startFrac);
      minimapCtx.fillRect(gx - 2, gy - 2, 4, 4);
    }
    for (const gf of GATE_FRACS) {
      const [gx, gy] = pointForFrac(gf);
      minimapCtx.fillStyle = "#35d6ff";
      minimapCtx.beginPath();
      minimapCtx.arc(gx, gy, 2.4, 0, Math.PI * 2);
      minimapCtx.strokeStyle = "#35d6ff";
      minimapCtx.stroke();
    }
    for (const r of rivals) {
      if (r.eliminated) continue;
      const frac = wrapPositive(r.s, circuit.length) / circuit.length;
      const [rx, ry] = pointForFrac(frac, r.x);
      minimapCtx.fillStyle = r.index === lockedIdx ? "#ffb800" : r.boss ? "#ff2952" : "#f4f2ec";
      minimapCtx.beginPath();
      minimapCtx.arc(rx, ry, r.index === lockedIdx ? 3.2 : r.boss ? 3 : 2.3, 0, Math.PI * 2);
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

  // -------------------------------------------------------------------
  // UI wiring — title/pause/results buttons + garage pickers
  // -------------------------------------------------------------------
  function buildGarageButtons(): void {
    const droneBar = getEl<HTMLElement>("drone-bar");
    const titleDroneRow = getEl<HTMLElement>("title-drone-row");
    const circuitBar = getEl<HTMLElement>("circuit-bar");
    for (const spec of allDroneSpecs()) {
      for (const host of [droneBar, titleDroneRow]) {
        if (!host) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = `bar-pill${spec.id === selectedDrone ? " active" : ""}`;
        b.dataset.drone = spec.id;
        b.textContent = spec.name;
        b.addEventListener("click", () => selectDrone(spec.id));
        host.appendChild(b);
      }
    }
    if (circuitBar) {
      for (const [id, c] of Object.entries(CIRCUITS)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `bar-pill cyan${id === selectedCircuit ? " active" : ""}`;
        b.dataset.circuit = id;
        b.textContent = c.shortName;
        b.addEventListener("click", () => selectCircuit(id as CircuitId));
        circuitBar.appendChild(b);
      }
    }
    document.querySelectorAll<HTMLButtonElement>("#title-circuit-row [data-circuit]").forEach((b) =>
      b.addEventListener("click", () => selectCircuit(b.dataset.circuit as CircuitId))
    );
    document.querySelectorAll<HTMLButtonElement>("#mode-bar [data-mode], #title-mode-row [data-mode]").forEach((b) =>
      b.addEventListener("click", () => selectMode(b.dataset.mode as ModeId))
    );
  }

  function setPaused(v: boolean): void {
    if (phase !== "racing" && phase !== "countdown") return;
    paused = v;
    if (v) session.pause("menu"); else session.resume();
    setPhaseUi();
  }

  getEl<HTMLButtonElement>("btn-start")?.addEventListener("click", () => { demoMode = false; startCountdown(); });
  getEl<HTMLButtonElement>("btn-demo")?.addEventListener("click", () => { demoMode = true; startCountdown(); });
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1") {
    setTimeout(() => { demoMode = true; startCountdown(); }, 800);
  }
  getEl<HTMLButtonElement>("btn-resume")?.addEventListener("click", () => setPaused(false));
  getEl<HTMLButtonElement>("btn-restart")?.addEventListener("click", () => { paused = false; session.resume(); startCountdown(); });
  getEl<HTMLButtonElement>("btn-quit")?.addEventListener("click", () => { paused = false; session.resume(); phase = "title"; sessionImpl.transition("title"); setPhaseUi(); });
  getEl<HTMLButtonElement>("btn-retry")?.addEventListener("click", () => startCountdown());
  getEl<HTMLButtonElement>("btn-next")?.addEventListener("click", () => {
    const order: CircuitId[] = ["grand", "dustfall", "vesper"];
    selectCircuit(order[(order.indexOf(selectedCircuit) + 1) % order.length]!);
    startCountdown();
  });
  getEl<HTMLButtonElement>("btn-title")?.addEventListener("click", () => { phase = "title"; sessionImpl.transition("title"); setPhaseUi(); });

  // Settings toggles → engine accessibility settings + audio mute.
  const setMute = getEl<HTMLInputElement>("set-mute");
  const setRMotion = getEl<HTMLInputElement>("set-rmotion");
  const setRFlash = getEl<HTMLInputElement>("set-rflash");
  const setHC = getEl<HTMLInputElement>("set-hc");
  let reducedMotionOn = false;
  let reducedFlashOn = false;
  let highContrastOn = false;
  function syncA11y(): void {
    reducedMotionOn = Boolean(setRMotion?.checked);
    reducedFlashOn = Boolean(setRFlash?.checked);
    highContrastOn = Boolean(setHC?.checked);
    document.body.dataset.a11yReducedmotion = String(reducedMotionOn);
    document.body.dataset.a11yReducedflash = String(reducedFlashOn);
    document.body.dataset.a11yHighcontrast = String(highContrastOn);
    sessionImpl.setAccessibility({ reducedMotion: reducedMotionOn, reducedFlash: reducedFlashOn, highContrast: highContrastOn });
  }
  setMute?.addEventListener("change", () => sound?.setMuted?.(setMute.checked) ?? undefined);
  for (const el of [setRMotion, setRFlash, setHC]) el?.addEventListener("change", syncA11y);

  // Pointer → deterministic input actions.
  const stageEl = document.getElementById("app");
  stageEl?.addEventListener("mousedown", (ev) => {
    if (ev.button === 0) input.setAction?.("fire", true);
    if (ev.button === 2) input.setAction?.("boost", true);
  });
  window.addEventListener("mouseup", (ev) => {
    if (ev.button === 0) input.setAction?.("fire", false);
    if (ev.button === 2) input.setAction?.("boost", false);
  });
  stageEl?.addEventListener("contextmenu", (ev) => ev.preventDefault());

  buildGarageButtons();
  selectMode("race");
  setPhaseUi();

  // -------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------
  let boostHeld = false;

  app.onFrame(({ dt }) => {
    const rawStep = clamp(dt, 1 / 240, 0.05);
    const step = session.scaledDt(rawStep);
    simTime += step;

    if (input.consume("pause")) setPaused(!paused);
    if (paused) return;

    const circuit = CIRCUITS[selectedCircuit];
    const spec = DRONE_SPECS[selectedDrone]!;

    // ----- title / attract -----
    if (phase === "title") {
      driveCamera(step);
      // Idle scroll so the attract flythrough sees a living track.
      playerS += 12 * step;
      const trackSample = sampleTrack(circuit, playerS);
      scrollWorld(trackSample, step, true);
      return;
    }

    // ----- countdown -----
    if (phase === "countdown") {
      countdownTimer -= step;
      const stage = Math.floor(3.6 - countdownTimer);
      if (stage !== countdownStage) {
        countdownStage = stage;
        const label = stage === 0 ? "3" : stage === 1 ? "2" : stage === 2 ? "1" : "RACE LIVE";
        showCenter(label, circuit.name, stage === 3 ? 1.4 : 0.9, false);
        void sound?.cue(stage === 3 ? "countdown" : "ui");
        if (stage === 3) feed("⚑", `${circuit.shortName} · ${RIVAL_COUNT + 1} RACERS`, "cool");
      }
      if (countdownTimer <= 0) {
        phase = "racing";
        sessionImpl.transition("playing");
        setPhaseUi();
        showCenter("RACE LIVE", circuit.name, 1.6);
      }
      const trackSample = sampleTrack(circuit, playerS);
      scrollWorld(trackSample, step, false);
      driveCamera(step);
      syncHud(circuit);
      return;
    }

    // ----- results / finish orbit -----
    if (phase === "finished") {
      finishTimer -= step;
      if (finishTimer <= 0) showResults(hull <= 0);
      driveCamera(step);
      return;
    }
    if (phase === "results") {
      driveCamera(step);
      return;
    }

    // ----- racing -----
    raceTime += step;
    lapTime += step;

    const trackSample = sampleTrack(circuit, playerS);
    if (hSectorName) hSectorName.textContent = trackSample.sectorName;

    // Input → flight commands
    const axisSteer = input.axis("steer");
    const axisClimb = input.axis("climb");
    let steerCmd = clamp(axisSteer + (input.held("steerRight") ? 1 : 0) - (input.held("steerLeft") ? 1 : 0), -1, 1);
    let pitchCmd = clamp(axisClimb + (input.held("climbUp") ? 1 : 0) - (input.held("climbDown") ? 1 : 0), -1, 1);
    boostHeld = input.held("boost");
    const brakeHeld = input.held("brake");
    let fireHeld = input.held("fire");

    if (demoMode) {
      const idealX = Math.sin(simTime * 0.85) * 4.2 - trackSample.curvature * 5.2;
      const idealY = 1.65 + Math.sin(simTime * 1.35) * 0.48;
      steerCmd = clamp((idealX - playerX) * 0.42, -1, 1);
      pitchCmd = clamp((idealY - playerY) * 0.65, -1, 1);
      boostHeld = !overheated && afterburnerEnergy > 30 && Math.sin(simTime * 0.9) > -0.25;
      fireHeld = !overheated && gunEnergy > 24 && Math.sin(simTime * 3.2) > 0.3;
      if (shockCooldown <= 0 && Math.sin(simTime * 0.41) > 0.96) triggerShockwave();
      if (!missileActive && Math.sin(simTime * 0.53) > 0.95) fireMissile();
      if (coolantCharge > 60 && coreHeat > 72 && ventCooldown <= 0) ventHeat();
    } else {
      if (input.consume("shock")) triggerShockwave();
      if (input.consume("roll")) triggerBarrelRoll();
      if (input.consume("mine")) dropMine();
      if (input.consume("item")) useHeldItem();
      if (input.consume("missile")) fireMissile();
      if (input.consume("vent")) ventHeat();
    }
    if (demoMode || fireHeld) fireLaserBurst();

    // Cooldowns
    shockCooldown = Math.max(0, shockCooldown - step);
    shockActiveTimer = Math.max(0, shockActiveTimer - step);
    rollCooldown = Math.max(0, rollCooldown - step);
    barrelRollTimer = Math.max(0, barrelRollTimer - step);
    if (barrelRollTimer <= 0) combatWorld.setActor("player", { guarding: shieldEnergy > 60 });
    mineCooldown = Math.max(0, mineCooldown - step);
    ventCooldown = Math.max(0, ventCooldown - step);
    overdriveTimer = Math.max(0, overdriveTimer - step);
    hyperdriveTimer = Math.max(0, hyperdriveTimer - step);
    incomingWarningTimer = Math.max(0, incomingWarningTimer - step);
    fireCooldown = Math.max(0, fireCooldown - step);
    damageFlashTimer = Math.max(0, damageFlashTimer - step);
    killCamTimer = Math.max(0, killCamTimer - step);
    comboTimer = Math.max(0, comboTimer - step);
    if (comboTimer <= 0) comboChain = 0;

    // Thermal + coolant + meltdown
    peakHeat = Math.max(peakHeat, coreHeat);
    if (overheated) {
      overheatTimer -= step;
      if (coolantCharge > 0) {
        // Coolant auto-burn suppresses the lockout and saves hull.
        coolantCharge = Math.max(0, coolantCharge - 55 * step);
        coreHeat = Math.max(0, coreHeat - 58 * step);
      } else {
        coreHeat = Math.max(0, coreHeat - 34 * step);
        hull = Math.max(0, hull - 15 * step); // meltdown chews the hull
        combatWorld.setActor("player", { health: hull });
        if (hull <= 0) finishRace(true);
      }
      if (overheatTimer <= 0 || coreHeat <= 16) overheated = false;
    }

    const topBaseKmh = 415 + spec.speed * 19;
    const abBonus = boostHeld && !overheated && afterburnerEnergy > 2 ? 135 + spec.boost * 8 : 0;
    const hyperBonus = hyperdriveTimer > 0 ? 185 : 0;
    const odBonus = overdriveTimer > 0 ? 95 : 0;
    const brakeDrop = brakeHeld ? 240 : 0;
    playerSpeedKmh = lerp(playerSpeedKmh, topBaseKmh + abBonus + hyperBonus + odBonus - brakeDrop, clamp(step * 4.2, 0, 1));

    if (boostHeld && !overheated && afterburnerEnergy > 2) {
      afterburnerEnergy = Math.max(0, afterburnerEnergy - 22 * step);
      coreHeat = Math.min(100, coreHeat + 14.5 * step);
      if (coreHeat >= 99.5) { overheated = true; overheatTimer = 2.2; showBanner("AFTERBURNER OVERHEAT", 1.6, "danger"); juice.fire("warning"); feed("▲", "AFTERBURNER OVERHEAT", "danger"); }
    } else {
      afterburnerEnergy = Math.min(100, afterburnerEnergy + 16 * step);
      coreHeat = Math.max(10, coreHeat - 15 * step);
    }
    gunEnergy = Math.min(100, gunEnergy + (14 + spec.laser * 1.4) * step);
    shieldEnergy = Math.min(100, shieldEnergy + 4.5 * step);
    hull = Math.min(100, hull + 1.0 * step);

    if (coreHeat >= 99.5 && !overheated) { overheated = true; overheatTimer = 2.2; showBanner("THERMAL OVERLOAD", 1.6, "danger"); juice.fire("warning"); }

    // Advance along track — gates must be cleared in order to finish a lap.
    const prevS = playerS;
    playerS += (playerSpeedKmh / 9.2) * step;
    if (playerS >= circuit.length) {
      playerS -= circuit.length;
      if (gatesCleared.size >= GATE_FRACS.length) {
        if (bestLapSeconds === null || lapTime < bestLapSeconds) bestLapSeconds = lapTime;
        lapTime = 0;
        currentLap += 1;
        nextGateIdx = 0;
        gatesCleared.clear();
        if (currentLap > TOTAL_LAPS && selectedMode !== "elim") {
          finishRace(false);
        } else {
          currentLap = Math.min(currentLap, TOTAL_LAPS);
          showCenter(`LAP ${currentLap}/${TOTAL_LAPS}`, circuit.name, 1.8);
          juice.fire("lap");
          feed("⚑", `LAP ${currentLap}`, "cool");
        }
      } else {
        // Missed a gate — hold the lap until the player clears the next pass.
        lapTime = 0;
        showBanner(`MISSED GATE ${nextGateIdx + 1} — LAP VOID`, 2.0, "danger");
        feed("✖", `LAP VOID — GATE ${nextGateIdx + 1} MISSED`, "danger");
      }
    }

    // Flight model
    const centrifugal = -trackSample.curvature * 5.5;
    playerVx = lerp(playerVx, steerCmd * 15.5 + centrifugal, clamp(step * 7.5, 0, 1));
    playerVy = lerp(playerVy, pitchCmd * 6.5, clamp(step * 7.5, 0, 1));
    playerX = clamp(playerX + playerVx * step, -TRACK_HALF_WIDTH + 1.6, TRACK_HALF_WIDTH - 1.6);
    playerY = clamp(playerY + playerVy * step, 0.95, 3.8);

    const rollAngle = barrelRollTimer > 0 ? (1 - barrelRollTimer / 0.58) * Math.PI * 2 : 0;
    playerRoll = lerp(playerRoll, -steerCmd * 0.46, clamp(step * 9, 0, 1)) + rollAngle;
    playerPitch = lerp(playerPitch, pitchCmd * 0.18 - 0.04, clamp(step * 8, 0, 1));
    playerYaw = lerp(playerYaw, -steerCmd * 0.14, clamp(step * 8, 0, 1));

    // World scroll + zone triggers
    scrollWorld(trackSample, step, false);

    // Rivals: racing line + combat AI
    let lockedIdx = -1;
    let lockedBestZ = -999;
    const rivalSlotDrones = DRONE_ORDER.filter((d) => d !== selectedDrone);
    let slot = 0;
    for (const r of rivals) {
      if (r.eliminated) continue;
      r.respawnTimer = Math.max(0, r.respawnTimer - step);
      r.attackCd = Math.max(0, r.attackCd - step);
      r.blockTimer = Math.max(0, r.blockTimer - step);
      const actor = combatWorld.snapshot().actors.find((a) => a.id === r.actorId);

      const waveSpeed = r.baseSpeed + Math.sin(simTime * 1.1 + r.aiPhase) * 30;
      const stunned = (actor?.stun ?? 0) > 0;
      r.speed = lerp(r.speed, stunned ? waveSpeed * 0.4 : waveSpeed, clamp(step * 2.5, 0, 1));
      r.s += (r.speed / 9.2) * step;
      if (r.s >= circuit.length) { r.s -= circuit.length; r.lap += 1; }
      const deltaS = r.s - playerS;
      if (deltaS < -30) r.s = playerS + 56 + (r.index % 5) * 9;
      else if (deltaS > 110) r.s = playerS + 16 + (r.index % 6) * 8;

      // combat AI decides aggression each frame
      const decision = r.ai.decide({
        distance: Math.abs(deltaS),
        opponentMoveId: fireHeld ? "twin-laser" : undefined,
        opponentMoveFrame: fireHeld ? 1 : undefined,
        stunned,
        ownRecoveryFrames: actor?.recovery ?? 0,
        ownHealthFraction: (actor?.health ?? 100) / (r.boss ? 170 : 140),
        opponentHealthFraction: hull / 100
      });
      if (decision.approach !== 0) r.baseSpeed += decision.approach * 2.4 * step;
      r.blockTimer = decision.block ? 0.4 : r.blockTimer;
      const relZ = -(r.s - playerS);
      if (decision.moveId === "laser" && r.attackCd <= 0 && Math.abs(relZ) < 62 && relZ < 6) {
        r.attackCd = r.boss ? 1.1 : 1.9;
        rivalFire(r);
        incomingWarningTimer = Math.max(incomingWarningTimer, 0.7);
      } else if (decision.moveId === "shove" && Math.abs(relZ) < 7 && Math.abs(r.x - playerX) < 4) {
        combatWorld.attack(r.actorId, SHOVE_MOVE);
      }
      if (decision.block) combatWorld.setActor(r.actorId, { guarding: true });
      else if (r.blockTimer <= 0) combatWorld.setActor(r.actorId, { guarding: false });

      r.targetX = Math.sin(simTime * 0.9 + r.aiPhase) * 6.8;
      r.targetY = 1.45 + (r.index % 3) * 0.45 + Math.cos(simTime * 1.4 + r.aiPhase) * 0.32;
      r.x = lerp(r.x, r.targetX, clamp(step * 3.2, 0, 1));
      r.y = lerp(r.y, r.targetY, clamp(step * 3.2, 0, 1));

      // sync combat actor pose
      combatWorld.setActor(r.actorId, { position: [r.x, r.y, relZ] });
      if (actor && actor.health <= 0 && !r.eliminated && r.respawnTimer <= 0) {
        // handled by knockout event normally; safety respawn
        r.respawnTimer = 2.2;
      }

      // render rival
      const handle = r.boss ? bossHandle : droneHandles.get(rivalSlotDrones[slot % rivalSlotDrones.length]!);
      slot += 1;
      if (!handle) continue;
      if (r.respawnTimer > 0) { handle.setPosition(0, -60, 0).setVisible(false); continue; }
      const z = -0.4 + relZ;
      const distAhead = Math.max(0, -z);
      const curveX = trackSample.curvature * distAhead * distAhead * 0.0026;
      const slopeY = trackSample.pitchSlope * distAhead * 0.08;
      const bankRoll = clamp((r.x - r.targetX) * 0.22, -0.45, 0.45);
      handle.setPosition(curveX + r.x, r.y + slopeY, z).setRotation(-0.04, 0, bankRoll).setVisible(true);
      if (z < -6 && z > -70 && z > lockedBestZ) { lockedBestZ = z; lockedIdx = r.index; }
    }
    // hide unused drone slots
    for (const dId of rivalSlotDrones.slice(slot)) {
      droneHandles.get(dId)?.setPosition(0, -60, 0).setVisible(false);
    }
    if (bossAsset && !rivals.some((r) => r.boss && !r.eliminated)) {
      bossHandle?.setPosition(0, -60, 0).setVisible(false);
    }

    const lockedRival = lockedIdx >= 0 ? rivals[lockedIdx] ?? null : null;

    // Player actor pose + shield state
    combatWorld.setActor("player", {
      position: [playerX, playerY, 0],
      guarding: barrelRollTimer > 0 || shieldEnergy > 55
    });
    playerBody.setPosition([playerX, playerY, -0.4]);

    // Bolts — flight + combat hitbox tracking
    for (let i = 0; i < playerBolts.length; i += 1) {
      const b = playerBolts[i]!;
      const h = boltHandles[i]!;
      if (!b.active) { h.setPosition(0, -60, 0).setVisible(false); continue; }
      b.ttl -= step;
      b.relZ += b.vz * step;
      if (b.ttl <= 0 || b.relZ < -135) {
        b.active = false;
        combatWorld.removeActor(b.actorId);
        h.setPosition(0, -60, 0).setVisible(false);
        continue;
      }
      const wz = -0.4 + b.relZ;
      const da = Math.max(0, -wz);
      h.setPosition(trackSample.curvature * da * da * 0.0026 + b.x, b.y + trackSample.pitchSlope * da * 0.08, wz).setVisible(true);
      combatWorld.setActor(b.actorId, { position: [b.x, b.y, b.relZ] });
      combatWorld.attack(b.actorId, BOLT_MOVE);
    }
    for (let i = 0; i < rivalBolts.length; i += 1) {
      const b = rivalBolts[i]!;
      const h = rboltHandles[i]!;
      if (!b.active) { h.setPosition(0, -60, 0).setVisible(false); continue; }
      b.ttl -= step;
      b.relZ += b.vz * step;
      if (b.ttl <= 0 || b.relZ > 24) {
        b.active = false;
        combatWorld.removeActor(b.actorId);
        h.setPosition(0, -60, 0).setVisible(false);
        continue;
      }
      const wz = -0.4 + b.relZ;
      const da = Math.max(0, -wz);
      h.setPosition(trackSample.curvature * da * da * 0.0026 + b.x, b.y, wz).setVisible(true);
      combatWorld.setActor(b.actorId, { position: [b.x, b.y, b.relZ] });
      combatWorld.attack(b.actorId, RIVAL_BOLT_MOVE);
    }

    // Missile — homing actor
    if (missileActive) {
      missileTtl -= step;
      missileRelZ -= 95 * step;
      const target = rivals.find((r) => r.index === missileTargetIdx) ?? lockedRival;
      if (target && !target.eliminated && target.respawnTimer <= 0) {
        const tz = -(target.s - playerS);
        missileX = lerp(missileX, target.x, clamp(step * 9, 0, 1));
        missileY = lerp(missileY, target.y, clamp(step * 9, 0, 1));
        combatWorld.setActor("missile", { position: [missileX, missileY, missileRelZ] });
        combatWorld.attack("missile", MISSILE_MOVE);
        if (Math.abs(missileRelZ - tz) < 4) { missileActive = false; }
      }
      if (missileTtl <= 0 || missileRelZ < -140) missileActive = false;
      if (missileActive) {
        const mwz = -0.4 + missileRelZ;
        const da = Math.max(0, -mwz);
        missileHandle.setPosition(trackSample.curvature * da * da * 0.0026 + missileX, missileY + trackSample.pitchSlope * da * 0.08, mwz).setVisible(true);
      } else {
        missileHandle.setPosition(0, -60, 0).setVisible(false);
        if (missileActorLive) { combatWorld.removeActor("missile"); missileActorLive = false; }
      }
    } else {
      missileHandle.setPosition(0, -60, 0).setVisible(false);
    }

    // Mines — proximity trigger volumes + detonation
    for (let i = 0; i < mines.length; i += 1) {
      const m = mines[i]!;
      const mh = mineHandles[i]!;
      if (!m.active) { mh.setPosition(0, -60, 0).setVisible(false); continue; }
      m.armTimer = Math.max(0, m.armTimer - step);
      const relZ = -(m.s - playerS);
      const wz = -0.4 + relZ;
      if (relZ > 30 || relZ < -120) {
        m.active = false;
        mh.setPosition(0, -60, 0).setVisible(false);
        combatWorld.removeActor(m.actorId);
        try { collisionWorld.remove(m.bodyId); } catch { /* already gone */ }
        continue;
      }
      mh.setPosition(m.x, 0.4, wz).setRotation(0, simTime * 2.2, 0).setVisible(true);
      combatWorld.setActor(m.actorId, { position: [m.x, 0.5, relZ] });
      collisionWorld.get(m.bodyId)?.setPosition([m.x, 0.6, wz]);
      if (m.armTimer <= 0) {
        for (const r of rivals) {
          if (r.eliminated || r.respawnTimer > 0) continue;
          const dr = Math.abs(-(r.s - playerS) - relZ);
          if (dr < 3.4 && Math.abs(r.x - m.x) < 2.8) { detonateMine(m, r.actorId); break; }
        }
        // player circling back over own mine also detonates
        if (m.active && Math.abs(relZ) < 2.6 && Math.abs(playerX - m.x) < 2.4) detonateMine(m, "player");
      }
    }

    // Collision world step → trigger events (cooling/boost/pickup/hazard/gates)
    if (step > 0) collisionWorld.step(step);
    for (const contact of collisionWorld.overlaps({ ids: ["player-hull"] })) {
      const other = contact.a.id === "player-hull" ? contact.b : contact.a;
      const zone = zoneBodies.find((z2) => z2.id === other.id);
      if (!zone) continue;
      if (zone.kind === "cooling") {
        coreHeat = Math.max(0, coreHeat - 34 * step);
        coolantCharge = Math.min(100, coolantCharge + 40 * step);
        if (overheated) { overheated = false; showBanner("WATER COOLING · CORE FLUSHED", 1.4, "cool"); }
        if (Math.random() < step * 6) {
          combatFx.groundDust([playerX, playerY + 0.6, -2], { color: "#9fe8f4", intensity: 1.1, duration: 0.5 });
          juice.fire("cooling");
        }
      } else if (zone.kind === "hazard" && zone.tag === "lava") {
        coreHeat = Math.min(100, coreHeat + 18 * step);
      } else if (zone.kind === "hazard" && zone.tag === "barrel") {
        // explosive barrel contact — hull damage via combat push
        if (Math.abs(other.position[2] - -0.4) < 2.5) {
          hull = Math.max(0, hull - 12);
          combatWorld.setActor("player", { health: hull });
          damageFlashTimer = 0.3;
          juice.fire("player-hit");
          feed("✸", "BARREL STRIKE −12 HULL", "danger");
          try { collisionWorld.remove(zone.id); } catch { /* once */ }
        }
      } else if (zone.kind === "boost") {
        playerSpeedKmh = Math.min(760, playerSpeedKmh + 85 * step * 12);
        afterburnerEnergy = Math.min(100, afterburnerEnergy + 18);
      } else if (zone.kind === "pickup" && Math.abs(other.position[2] - -0.4) < 3) {
        if (zone.tag === "coolant") {
          coreHeat = Math.max(0, coreHeat - 38);
          coolantCharge = Math.min(100, coolantCharge + 50);
          if (!heldItem) heldItem = PICKUP_ITEMS[Math.floor(simTime * 3) % PICKUP_ITEMS.length] ?? "TURBO CELL";
          juice.fire("cooling");
          feed("❄", "CRYO CANISTER · COOLANT +50", "cool");
        } else if (zone.tag === "shield") {
          shieldEnergy = Math.min(100, shieldEnergy + 40);
          if (!heldItem) heldItem = PICKUP_ITEMS[(Math.floor(simTime * 5) + 2) % PICKUP_ITEMS.length] ?? "AEGIS MATRIX";
          juice.fire("pickup");
          feed("⬡", "AEGIS CELL · SHIELD +40", "");
        }
      } else if (zone.kind === "gate") {
        // Gate crossing resolved by s-progress ordering (lap integrity).
      }
    }

    // Gate progression via lap fractions + ring visuals
    const gateS = GATE_FRACS[nextGateIdx]! * circuit.length;
    const crossed = prevS < gateS && playerS >= gateS;
    if (crossed) {
      gatesCleared.add(nextGateIdx);
      gateToastMsg(`GATE ${nextGateIdx + 1}/4 · ${GATE_NAMES[nextGateIdx]}`);
      juice.fire("checkpoint");
      nextGateIdx = Math.min(nextGateIdx + 1, GATE_FRACS.length);
    }

    // combatWorld tick + events
    const combatSnap = combatWorld.update(step);
    processCombatEvents(combatSnap.events);

    // Sync hull/shield/heat from combat actor (authoritative damage store)
    const pActor = combatSnap.actors.find((a) => a.id === "player");
    if (pActor) {
      hull = pActor.health;
      if (barrelRollTimer <= 0 && pActor.guard < shieldEnergy) shieldEnergy = pActor.guard;
      combatWorld.setActor("player", { guard: shieldEnergy, meter: coreHeat });
    }

    // Elimination timer
    if (selectedMode === "elim") {
      const alive = rivals.filter((r) => !r.eliminated);
      if (alive.length > 1) {
        elimCountdown -= step;
        if (elimCountdown <= 0) {
          elimCountdown = 20;
          const victim = alive[alive.length - 1]!;
          victim.eliminated = true;
          combatWorld.setActor(victim.actorId, { knockedOut: true, health: 0 });
          lastEliminatedName = victim.pilotName.toUpperCase();
          juice.fire("elimination");
          feed("✖", `ELIMINATED · ${lastEliminatedName}`, "danger");
          rebuildCombat();
        }
      } else if (alive.length === 1 && currentLap >= TOTAL_LAPS) {
        finishRace(false);
      }
      if (hElimTime) hElimTime.textContent = `${elimCountdown.toFixed(1)}s`;
      if (hElimLast) hElimLast.textContent = lastEliminatedName;
    }

    // Trial ghost
    if (selectedMode === "trial") {
      const ghostDelta = Math.sin(simTime * 0.45) * 0.65 - 0.28;
      if (hGhostDelta) hGhostDelta.textContent = `${ghostDelta >= 0 ? "+" : ""}${ghostDelta.toFixed(2)}s`;
      if (hGhostNote) hGhostNote.textContent = ghostDelta <= 0 ? "AHEAD OF BEST PACE" : "CHASING GHOST LINE";
    }

    // Position P1–P8
    let ahead = 0;
    for (const r of rivals) if (!r.eliminated && r.s > playerS + 2) ahead += 1;
    playerPos = clamp(1 + ahead, 1, RIVAL_COUNT + 1);

    // Thruster heat tint — engine FX colour shifts with core temperature
    const heatT = clamp(coreHeat / 100, 0, 1);
    const thrusterColor = heatT > 0.85 ? "#ff2952" : heatT > 0.55 ? "#ff6a26" : "#35d6ff";
    const thrusterGlow = 1.4 + heatT * 2.2 + (boostHeld ? 0.9 : 0);
    const thrusterScale = 1 + heatT * 0.5 + (boostHeld ? 0.4 : 0) + (overdriveTimer > 0 ? 0.5 : 0);
    thrusterL.setPosition(playerX - 0.55, playerY - 0.02, -0.4 + 1.55).setScale([1, thrusterScale, 1]).setMaterial({ color: thrusterColor, emissive: thrusterColor, emissiveIntensity: thrusterGlow, opacity: 0.8 });
    thrusterR.setPosition(playerX + 0.55, playerY - 0.02, -0.4 + 1.55).setScale([1, thrusterScale, 1]).setMaterial({ color: thrusterColor, emissive: thrusterColor, emissiveIntensity: thrusterGlow, opacity: 0.8 });

    // Player drone pose
    const pHandle = droneHandles.get(selectedDrone)!;
    pHandle.setPosition(playerX, playerY, -0.4).setRotation(playerPitch, playerYaw, playerRoll).setVisible(true);

    // Shield bubble follows drone while shield is strong
    const shieldOn = shieldEnergy > 55;
    shieldBubble.setPosition(playerX, playerY, -0.4).setVisible(shieldOn);

    // Shockwave ring
    if (shockActiveTimer > 0) {
      const p = 1 - shockActiveTimer / 0.65;
      const rs = 1 + p * 8.5;
      shockRing.setPosition(playerX, playerY, -0.4).setScale([rs, rs, 1]).setVisible(true);
    } else shockRing.setPosition(0, -60, 0).setVisible(false);
    shockEmitter.setPosition(-6.8, 0.35, -34).setRotation(0, simTime * 1.4, 0);

    // Target lock bracket
    if (hLock) {
      if (lockedRival) {
        const tz = -0.4 - (lockedRival.s - playerS);
        const da = Math.max(1, -tz);
        const tx = trackSample.curvature * da * da * 0.0026 + lockedRival.x;
        const ty = lockedRival.y + trackSample.pitchSlope * da * 0.08;
        const sx = clamp(50 + ((tx - playerX * 0.35) / da) * 105, 18, 82);
        const sy = clamp(46 - ((ty - 1.8) / da) * 85, 22, 74);
        hLock.style.left = `${sx.toFixed(1)}%`;
        hLock.style.top = `${sy.toFixed(1)}%`;
        hLock.classList.add("visible");
        if (hLockLabel) hLockLabel.textContent = `LOCK · ${lockedRival.pilotName.toUpperCase()} · ${Math.round(da)}M`;
      } else hLock.classList.remove("visible");
    }

    // Camera + HUD
    driveCamera(step);
    syncHud(circuit);
    drawMinimap(circuit, lockedIdx);
    updateOverlays(step);
  });

  // -------------------------------------------------------------------
  // Track sampling + world scroll (shared by title + race phases)
  // -------------------------------------------------------------------
  function sampleTrack(circuit: CircuitSpec, sPos: number): { curvature: number; pitchSlope: number; sectorName: string } {
    const frac = wrapPositive(sPos, circuit.length) / circuit.length;
    let active = circuit.sectors[0]!;
    for (const sec of circuit.sectors) if (frac >= sec.startFrac) active = sec;
    const wave = Math.sin(frac * Math.PI * 4) * active.curvature + Math.cos(frac * Math.PI * 6) * active.curvature * 0.45;
    const slope = Math.sin(frac * Math.PI * 6) * active.pitchSlope;
    return { curvature: wave, pitchSlope: slope, sectorName: active.name };
  }

  function scrollWorld(trackSample: { curvature: number; pitchSlope: number }, step: number, titleOnly: boolean): void {
    const roadScroll = wrapPositive(playerS, ROAD_TILE_SPACING);
    for (let i = 0; i < ROAD_TILE_COUNT; i += 1) {
      const z = 8 - i * ROAD_TILE_SPACING + roadScroll;
      const da = Math.max(0, -z);
      const cx = trackSample.curvature * da * da * 0.0026;
      const sy = trackSample.pitchSlope * da * 0.08;
      const tile = roadTiles[i]!;
      tile.deck.setPosition(cx, -0.18 + sy, z);
      tile.spine.setPosition(cx, 0.03 + sy, z);
      tile.laneL.setPosition(cx - 5.2, 0.025 + sy, z);
      tile.laneR.setPosition(cx + 5.2, 0.025 + sy, z);
      tile.puddleL.setPosition(cx - 8.2, 0.015 + sy, z);
      tile.puddleR.setPosition(cx + 8.2, 0.015 + sy, z);
    }
    const wallScroll = wrapPositive(playerS, 13.5);
    for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
      const z = 6 - i * 13.5 + wallScroll;
      const da = Math.max(0, -z);
      const cx = trackSample.curvature * da * da * 0.0026;
      const sy = trackSample.pitchSlope * da * 0.08;
      const seg = wallSegments[i]!;
      seg.left.setPosition(cx - 11.3, 0.55 + sy, z);
      seg.right.setPosition(cx + 11.3, 0.55 + sy, z);
      seg.chevL.setPosition(cx - 10.72, 0.72 + sy, z);
      seg.chevR.setPosition(cx + 10.72, 0.72 + sy, z);
    }
    for (const item of sceneryHandles) {
      const { anchor, handle } = item;
      const relS = wrapPositive(anchor.s - playerS, anchor.period);
      const z = 14 - relS;
      const da = Math.max(0, -z);
      const cx = trackSample.curvature * da * da * 0.0026;
      const sy = trackSample.pitchSlope * da * 0.08;
      const worldX = cx + anchor.lateralX;
      const worldY = z > -2.5 ? -140 : anchor.baseY + sy;
      handle.setPosition(worldX, worldY, z);
      if (anchor.spinSpeed) handle.setRotation(0, anchor.yaw + simTime * anchor.spinSpeed, 0);
    }
    // Zone sensor bodies ride the scroll (world-space tracking for triggers).
    for (const zb of zoneBodies) {
      if (zb.kind === "gate") continue;
      const relS = wrapPositive(zb.s - playerS, zb.period);
      const z = 14 - relS;
      const da = Math.max(0, -z);
      const cx = trackSample.curvature * da * da * 0.0026;
      const sy = trackSample.pitchSlope * da * 0.08;
      zb.handle.setPosition([cx + zb.x, z > -2.5 ? -60 : 1.6 + sy, z]);
    }
    void step;
    void titleOnly;
  }

  // -------------------------------------------------------------------
  // HUD + overlay sync
  // -------------------------------------------------------------------
  function syncHud(circuit: CircuitSpec): void {
    if (hPos) hPos.textContent = String(playerPos);
    if (hPosOf) hPosOf.textContent = `/${selectedMode === "trial" ? 1 : RIVAL_COUNT + 1}`;
    if (hLap) hLap.textContent = String(Math.min(currentLap, TOTAL_LAPS));
    if (hTime) hTime.textContent = formatRaceTime(lapTime);
    if (hBest) hBest.textContent = bestLapSeconds !== null ? formatRaceTime(bestLapSeconds) : "--:--.-";
    if (hGate) hGate.textContent = `${gatesCleared.size}/4`;
    if (hGateName) hGateName.textContent = nextGateIdx < GATE_FRACS.length ? GATE_NAMES[nextGateIdx]! : "LAP LINE";
    if (hHull) {
      hHull.style.width = `${clamp(hull, 0, 100).toFixed(1)}%`;
      hHull.classList.toggle("warn", hull < 55 && hull >= 28);
      hHull.classList.toggle("crit", hull < 28);
    }
    if (hTd) hTd.textContent = String(takedowns);
    if (hSpeed) hSpeed.textContent = String(Math.round(playerSpeedKmh));
    if (hAb) hAb.style.width = `${clamp(afterburnerEnergy, 0, 100).toFixed(1)}%`;
    if (hHeat) {
      hHeat.style.width = `${clamp(coreHeat, 0, 100).toFixed(1)}%`;
      hHeat.classList.toggle("overheat", overheated);
    }
    if (hCool) hCool.style.width = `${clamp(coolantCharge, 0, 100).toFixed(1)}%`;
    if (hShield) hShield.style.width = `${clamp(shieldEnergy, 0, 100).toFixed(1)}%`;
    if (hGun) hGun.style.width = `${clamp(gunEnergy, 0, 100).toFixed(1)}%`;
    if (hItem) {
      hItem.textContent = heldItem ?? "— NONE —";
      hItem.classList.toggle("empty", !heldItem);
    }
    if (hShock) { hShock.classList.toggle("cooling", shockCooldown > 0); hShock.innerHTML = shockCooldown > 0 ? `<b>Q</b>${shockCooldown.toFixed(0)}S` : `<b>Q</b>SHOCK`; }
    if (hRoll) { hRoll.classList.toggle("cooling", rollCooldown > 0); hRoll.innerHTML = rollCooldown > 0 ? `<b>R</b>${rollCooldown.toFixed(0)}S` : `<b>R</b>BARREL`; }
    if (hMine) { hMine.classList.toggle("cooling", mineCooldown > 0); hMine.innerHTML = mineCooldown > 0 ? `<b>C</b>${mineCooldown.toFixed(0)}S` : `<b>C</b>MINE`; }
    if (hOd) { hOd.classList.toggle("cooling", ventCooldown > 0 || coolantCharge < 30); hOd.innerHTML = ventCooldown > 0 ? `<b>V</b>${ventCooldown.toFixed(0)}S` : `<b>V</b>VENT`; }
    if (hHyper) hHyper.classList.toggle("show", hyperdriveTimer > 0);
    if (hIncoming) hIncoming.classList.toggle("show", incomingWarningTimer > 0);
    if (hAutopilot) {
      hAutopilot.textContent = demoMode ? "AI DEMO FLIGHT: ACTIVE" : phase === "racing" ? "PILOT CONTROL: MANUAL" : "STANDBY";
      hAutopilot.classList.toggle("manual", !demoMode);
    }
    if (meltdownEl) meltdownEl.classList.toggle("show", overheated || (coreHeat > 88 && !overheated));
    if (comboBadge && comboX) {
      comboBadge.classList.toggle("show", comboChain >= 2);
      comboX.textContent = `×${comboChain}`;
      if (comboDecay) comboDecay.style.transform = `scaleX(${clamp(comboTimer / COMBO_WINDOW_S, 0, 1)})`;
    }
    void circuit;
  }

  function updateOverlays(step: number): void {
    if (bannerTimer > 0) { bannerTimer = Math.max(0, bannerTimer - step); if (bannerTimer <= 0) hBanner?.classList.remove("show"); }
    if (centerMsgTimer > 0) { centerMsgTimer = Math.max(0, centerMsgTimer - step); if (centerMsgTimer <= 0) hMsg?.classList.remove("show"); }
    if (gateToastTimer > 0) { gateToastTimer = Math.max(0, gateToastTimer - step); if (gateToastTimer <= 0) gateToast?.classList.remove("show"); }
    if (damageVignette) damageVignette.style.opacity = damageFlashTimer > 0 ? "1" : "0";
    if (fxSpeedLines) fxSpeedLines.style.opacity = clamp((playerSpeedKmh - 480) / 240, 0, 0.85).toFixed(2);
    if (fxHeatGlaze) fxHeatGlaze.style.opacity = (overheated ? 0.85 : clamp((coreHeat - 72) / 35, 0, 0.65)).toFixed(2);
  }

  // -------------------------------------------------------------------
  // Start + global handle
  // -------------------------------------------------------------------
  td.start();

  const globalApi = {
    app,
    game: td,
    session,
    combatWorld,
    collisionWorld,
    eventLog,
    selectDrone,
    selectCircuit,
    selectMode,
    startRace: startCountdown,
    resetRace: resetRaceState,
    triggerShockwave,
    triggerBarrelRoll,
    fireHomingMissile: fireMissile,
    ventHeat,
    getState: () => ({
      ready: true,
      phase,
      drone: selectedDrone,
      circuit: selectedCircuit,
      mode: selectedMode,
      lap: currentLap,
      position: playerPos,
      speedKmh: Math.round(playerSpeedKmh),
      hull: Math.round(hull),
      heat: Math.round(coreHeat),
      coolant: Math.round(coolantCharge),
      takedowns,
      combo: comboChain,
      gatesCleared: gatesCleared.size,
      rivalsAlive: rivals.filter((r) => !r.eliminated).length,
      modelNodeCount: droneHandles.size + sceneryHandles.length + 4 + (bossHandle ? 1 : 0),
      meshyAssets: ["td2DronePyre", "td2DroneBoss", "td2CoolingTower", "td2TowerNeon"].filter((k) => (assets as Record<string, unknown>)[k])
    })
  };
  (window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_HEATSINK_V2__ = globalApi;
  document.body.dataset.aura3dReady = "true";
}

void boot().catch((err) => {
  console.error("[thermal-drift-v2] boot failed", err);
  document.body.dataset.aura3dError = String(err);
});
