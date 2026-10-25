import {
  camera,
  createAuraApp,
  effects,
  game,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraAssetRef,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { createNativeRoadster, findDrawCalls } from "./native";
import { POWERUP_SECONDS } from "./native/constants";
import { assets } from "../../../src/aura-assets";
import { installBlackFrameGuard } from "../../showcase-port-shared/blackframe";
import { SHIELD_SIZE, shieldSpec } from "./art/shield";
import { groundSpec } from "./art/ground";
import { meshyVehicles } from "./meshy-vehicles";
import { SKY_DOME_SIZE, skyLook, skySpec } from "./art/sky";
import { installGameBeacon } from "@aura3d/engine/game";
import { createRoadsterPresenter, viewOf } from "./native/presentation";

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
const publishBeacon = (evidence: object): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-roadster-rush", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__"] });
  gameBeacon.publishEvidence(evidence);
};

installBlackFrameGuard();

type Vec3 = [number, number, number];

type VehicleType =
  | "sedan"
  | "hatch"
  | "suv"
  | "taxi"
  | "van"
  | "pickup"
  | "boxtruck"
  | "bus"
  | "carrier";

type PickupKind = "bolt" | "air" | "magnet" | "rocket" | "shield" | "multiplier";

const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];
const HIDDEN_POS: Vec3 = [0, -80, 120];

/** Meshy model for a vehicle type when it is shipped and enabled (`?models=0` turns it off), else the original showcase asset. */
const pickVehicleAsset = (key: string, fallback: AuraAssetRef<"model">): AuraAssetRef<"model"> =>
  meshyVehicles.enabled && key in meshyVehicles.refs ? ((meshyVehicles.refs as Record<string, AuraAssetRef<"model">>)[key] as AuraAssetRef<"model">) : fallback;

const VEHICLE_POOL_SPEC: Record<
  VehicleType,
  {
    count: number;
    maxDim: number;
    role: "primaryVehicle" | "setDressing";
    asset: AuraAssetRef<"model">;
  }
> = {
  sedan: { count: 4, maxDim: 4.64, role: "setDressing", asset: pickVehicleAsset("sedan", assets.roadsterRushSedan) },
  hatch: { count: 3, maxDim: 4.04, role: "setDressing", asset: pickVehicleAsset("hatch", assets.roadsterRushHatch) },
  suv: { count: 3, maxDim: 4.94, role: "setDressing", asset: pickVehicleAsset("suv", assets.roadsterRushSuv) },
  taxi: { count: 2, maxDim: 4.74, role: "setDressing", asset: pickVehicleAsset("taxi", assets.roadsterRushTaxi) },
  van: { count: 2, maxDim: 5.34, role: "setDressing", asset: pickVehicleAsset("van", assets.roadsterRushVan) },
  pickup: { count: 2, maxDim: 5.58, role: "setDressing", asset: pickVehicleAsset("pickup", assets.roadsterRushPickup) },
  boxtruck: { count: 2, maxDim: 8.14, role: "setDressing", asset: pickVehicleAsset("boxtruck", assets.roadsterRushBoxtruck) },
  bus: { count: 1, maxDim: 12.22, role: "setDressing", asset: pickVehicleAsset("bus", assets.roadsterRushBus) },
  carrier: { count: 2, maxDim: 16.12, role: "primaryVehicle", asset: pickVehicleAsset("carrier", assets.roadsterRushCarrier) }
};

/** Measured from the baked Meshy GLBs at fit size: visual width over sim width. Only the two wildly wide models need a lateral squash; the rest stay within 1.3x. */
const MODEL_WIDTH_OVER_SPEC: Partial<Record<VehicleType, number>> = { boxtruck: 1.72, carrier: 3.0 };
const MODEL_WIDTH_FIT = 1.25;

const VEHICLE_TYPES: readonly VehicleType[] = [
  "sedan",
  "hatch",
  "suv",
  "taxi",
  "van",
  "pickup",
  "boxtruck",
  "bus",
  "carrier"
];

const SKY_CAR_POOL_COUNT = 5;
const BOLT_POOL_COUNT = 28;
const POWERUP_POOL_COUNT = 8;
const BRAKE_BAR_POOL_COUNT = 12;
const BLINKER_POOL_COUNT = 6;

const LANE_DIVIDER_X: readonly number[] = [-5.4, -1.8, 1.8, 5.4];
const DASH_COUNT_PER_DIVIDER = 14;
const DASH_STRIDE_Z = 14;

const GANTRY_POOL_COUNT = 2;
const GANTRY_STRIDE_Z = 130;

const PALM_POOL_COUNT = 0;
const PALM_STRIDE_Z = 34;

const POLE_POOL_COUNT = 8;
const POLE_STRIDE_Z = 34;

const SKYLINE_POOL_COUNT = 2;
const SKYLINE_STRIDE_Z = 140;

const POWERUP_COLORS: Record<Exclude<PickupKind, "bolt">, string> = {
  air: "#2f7dff",
  rocket: "#ff5030",
  shield: "#29c6ff",
  magnet: "#ff2a3c",
  multiplier: "#8a4bff"
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const k = clamp(t, 0, 1);
  return rgbToHex(lerp(r1, r2, k), lerp(g1, g2, k), lerp(b1, b2, k));
}

function rotateLocalOffset(
  root: Vec3,
  pitch: number,
  yaw: number,
  roll: number,
  local: Vec3
): Vec3 {
  // Apply Z (roll), then X (pitch), then Y (yaw) to match vehicle local-to-world
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

interface PlayerHandles {
  car: AuraRuntimeNodeHandle;
  lightbar: AuraRuntimeNodeHandle;
  headlightL: AuraRuntimeNodeHandle;
  headlightR: AuraRuntimeNodeHandle;
  rearPlumeL: AuraRuntimeNodeHandle;
  rearPlumeR: AuraRuntimeNodeHandle;
  downPlumes: AuraRuntimeNodeHandle[];
  sidePlumesL: AuraRuntimeNodeHandle[];
  sidePlumesR: AuraRuntimeNodeHandle[];
  shieldSphere: AuraRuntimeNodeHandle;
  rocketCone: AuraRuntimeNodeHandle;
  magnetRing: AuraRuntimeNodeHandle;
  contactShadow: AuraRuntimeNodeHandle;
}

interface SkyCarSlot {
  car: AuraRuntimeNodeHandle;
  plume: AuraRuntimeNodeHandle;
  halo: AuraRuntimeNodeHandle;
}

interface GantrySlot {
  pillarL: AuraRuntimeNodeHandle;
  pillarR: AuraRuntimeNodeHandle;
  beam: AuraRuntimeNodeHandle;
  boardL: AuraRuntimeNodeHandle;
  boardR: AuraRuntimeNodeHandle;
  trimL: AuraRuntimeNodeHandle;
  trimR: AuraRuntimeNodeHandle;
}

interface LightPoleSlot {
  pole: AuraRuntimeNodeHandle;
  arm: AuraRuntimeNodeHandle;
  lamp: AuraRuntimeNodeHandle;
}

function buildRoadsterRushScene(): ReturnType<typeof scene> {
  const s = scene()
    .add(looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: 0.08 }))
    .background("#1b1026")
    .camera(
      camera.perspective({
        fov: 58,
        near: 0.25,
        far: 550,
        position: [0, 3.6, 6.2],
        target: [0, 0.9, -6.0]
      })
    )
    .add(lights.ambient({ color: "#ffd8c4", intensity: 0.5 }))
    .add(
      lights.hemisphere({
        skyColor: "#ff9e75",
        groundColor: "#2a1b38",
        intensity: 0.7
      })
    )
    .add(
      lights.directional({
        color: "#ffb178",
        intensity: 1.9,
        position: [22, 38, -45],
        target: [0, 0, -10],
        shadow: { cascades: 2, maxDistance: 90, blend: 0.12 }
      })
    )
    .add(
      lights.point({
        color: "#4df0ff",
        intensity: 1.5,
        position: [0, 8, -12],
        distance: 65
      })
    )
    .add(effects.bloom({ intensity: 0.24, threshold: 0.9, radius: 0.52 }))
    .add(effects.vignette({ intensity: 0.2, smoothness: 0.65 }))
    .add(effects.colorGrade({ contrast: 1.07, saturation: 1.12 }));

  // 1. Endless Scrolling 5-Lane Sunset Freeway Deck, Shoulders, Jersey Barriers & Neon Sound Walls
  s.addMany([
    primitives
      .box({
        name: "freeway-outer-ground",
        size: [1200, 0.12, 520],
        material: material.custom(groundSpec()), castShadow: false })
      .position(0, -0.22, -160)
      .runtime(game.runtimeNode("freeway-outer-ground")),
    primitives
      .box({
        name: "freeway-asphalt-deck",
        size: [24, 0.12, 380],
        material: material.pbr({ color: "#1c1f28", roughness: 0.84, metalness: 0.08 }), castShadow: false })
      .position(0, -0.06, -150)
      .runtime(game.runtimeNode("freeway-asphalt-deck")),
    primitives
      .box({
        name: "freeway-shoulder-left",
        size: [0.18, 0.02, 380],
        material: material.emissive({ color: "#ffc72c", emissive: "#ffc72c", emissiveIntensity: 0.45 }), castShadow: false })
      .position(-9.0, 0.012, -150)
      .runtime(game.runtimeNode("freeway-shoulder-left")),
    primitives
      .box({
        name: "freeway-shoulder-right",
        size: [0.18, 0.02, 380],
        material: material.emissive({ color: "#f1f5f9", emissive: "#f1f5f9", emissiveIntensity: 0.38 }), castShadow: false })
      .position(9.0, 0.012, -150)
      .runtime(game.runtimeNode("freeway-shoulder-right")),
    primitives
      .box({
        name: "freeway-barrier-left",
        size: [0.65, 1.05, 380],
        material: material.pbr({ color: "#393e4a", roughness: 0.78 })
      })
      .position(-10.6, 0.52, -150)
      .runtime(game.runtimeNode("freeway-barrier-left")),
    primitives
      .box({
        name: "freeway-barrier-right",
        size: [0.65, 1.05, 380],
        material: material.pbr({ color: "#393e4a", roughness: 0.78 })
      })
      .position(10.6, 0.52, -150)
      .runtime(game.runtimeNode("freeway-barrier-right")),
    primitives
      .box({
        name: "freeway-soundwall-left",
        size: [0.45, 2.5, 380],
        material: material.pbr({ color: "#232634", roughness: 0.72 })
      })
      .position(-11.6, 1.25, -150)
      .runtime(game.runtimeNode("freeway-soundwall-left")),
    primitives
      .box({
        name: "freeway-soundwall-right",
        size: [0.45, 2.5, 380],
        material: material.pbr({ color: "#232634", roughness: 0.72 })
      })
      .position(11.6, 1.25, -150)
      .runtime(game.runtimeNode("freeway-soundwall-right")),
    primitives
      .box({
        name: "freeway-neon-trim-left",
        size: [0.12, 0.14, 380],
        material: material.emissive({ color: "#38bdf8", emissive: "#38bdf8", emissiveIntensity: 1.35 }), castShadow: false })
      .position(-11.3, 2.42, -150)
      .runtime(game.runtimeNode("freeway-neon-trim-left")),
    primitives
      .box({
        name: "freeway-neon-trim-right",
        size: [0.12, 0.14, 380],
        material: material.emissive({ color: "#ff2a6d", emissive: "#ff2a6d", emissiveIntensity: 1.35 }), castShadow: false })
      .position(11.3, 2.42, -150)
      .runtime(game.runtimeNode("freeway-neon-trim-right")),
    // Sunset / Dusk / Night sky dome: gradient, lit clouds, sun disc and corona, haze, city glow and stars (art/sky.ts)
    primitives
      .sphere({
        name: "horizon-sky-wall",
        size: [SKY_DOME_SIZE, SKY_DOME_SIZE, SKY_DOME_SIZE],
        material: material.custom(skySpec()),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("horizon-sky-wall"))
  ]);

  // 2. Scrolling White Lane Dashes (4 dividers × 14 dashes)
  const dashMat = material.emissive({ color: "#f8fafc", emissive: "#e2e8f0", emissiveIntensity: 0.45 });
  for (let d = 0; d < LANE_DIVIDER_X.length; d++) {
    const lx = LANE_DIVIDER_X[d]!;
    for (let i = 0; i < DASH_COUNT_PER_DIVIDER; i++) {
      const id = `lane-dash-${d}-${i}`;
      s.add(
        primitives
          .box({
            name: id,
            size: [0.14, 0.02, 4.2],
            material: dashMat, castShadow: false })
          .position(lx, 0.015, -i * DASH_STRIDE_Z)
          .runtime(game.runtimeNode(id))
      );
    }
  }

  // 3. Overhead Highway Sign Gantries (gantries with steel trusses, crossbeam & emerald exit boards)
  const steelMat = material.pbr({ color: "#64748b", metalness: 0.65, roughness: 0.38 });
  const signBoardMat = material.pbr({ color: "#0d5c3a", roughness: 0.52, metalness: 0.12 });
  const signTrimMat = material.emissive({ color: "#e2f1e8", emissive: "#a7f3d0", emissiveIntensity: 0.55 });
  for (let i = 0; i < GANTRY_POOL_COUNT; i++) {
    const gz = -(i + 1) * GANTRY_STRIDE_Z;
    s.addMany([
      primitives
        .box({ name: `gantry-pillar-l-${i}`, size: [0.55, 9.6, 0.55], material: steelMat })
        .position(-10.9, 4.8, gz)
        .runtime(game.runtimeNode(`gantry-pillar-l-${i}`)),
      primitives
        .box({ name: `gantry-pillar-r-${i}`, size: [0.55, 9.6, 0.55], material: steelMat })
        .position(10.9, 4.8, gz)
        .runtime(game.runtimeNode(`gantry-pillar-r-${i}`)),
      primitives
        .box({ name: `gantry-beam-${i}`, size: [22.6, 0.52, 0.55], material: steelMat })
        .position(0, 9.0, gz)
        .runtime(game.runtimeNode(`gantry-beam-${i}`)),
      primitives
        .box({ name: `gantry-board-l-${i}`, size: [7.6, 2.3, 0.22], material: signBoardMat })
        .position(-4.4, 8.85, gz + 0.22)
        .runtime(game.runtimeNode(`gantry-board-l-${i}`)),
      primitives
        .box({ name: `gantry-board-r-${i}`, size: [6.8, 2.1, 0.22], material: signBoardMat })
        .position(4.6, 8.85, gz + 0.22)
        .runtime(game.runtimeNode(`gantry-board-r-${i}`)),
      primitives
        .box({ name: `gantry-trim-l-${i}`, size: [7.0, 0.22, 0.26], material: signTrimMat, castShadow: false })
        .position(-4.4, 9.55, gz + 0.24)
        .runtime(game.runtimeNode(`gantry-trim-l-${i}`)),
      primitives
        .box({ name: `gantry-trim-r-${i}`, size: [6.2, 0.22, 0.26], material: signTrimMat, castShadow: false })
        .position(4.6, 9.45, gz + 0.24)
        .runtime(game.runtimeNode(`gantry-trim-r-${i}`))
    ]);
  }

  // 4. Roadside California Sunset Palm Silhouettes & Highway Light Poles
  const palmTrunkMat = material.pbr({ color: "#3d2822", roughness: 0.88 });
  for (let i = 0; i < PALM_POOL_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const px = side * (15.5 + (i % 3) * 1.8);
    const pz = -Math.floor(i / 2) * PALM_STRIDE_Z;
    const id = `freeway-palm-${i}`;
    s.add(
      primitives
        .cylinder({
          name: id,
          size: [0.34, 9.2, 0.34],
          material: palmTrunkMat, castShadow: false })
        .position(px, 4.5, pz)
        .runtime(game.runtimeNode(id))
    );
  }

  const poleMat = material.pbr({ color: "#475569", metalness: 0.7, roughness: 0.35 });
  const lampMat = material.emissive({ color: "#ffd28a", emissive: "#ffae52", emissiveIntensity: 1.65 });
  for (let i = 0; i < POLE_POOL_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const px = side * 12.1;
    const pz = -Math.floor(i / 2) * POLE_STRIDE_Z - 12;
    s.addMany([
      primitives
        .cylinder({ name: `light-pole-${i}`, size: [0.18, 7.6, 0.18], material: poleMat })
        .position(px, 3.8, pz)
        .runtime(game.runtimeNode(`light-pole-${i}`)),
      primitives
        .box({ name: `light-arm-${i}`, size: [1.8, 0.12, 0.12], material: poleMat, castShadow: false })
        .position(px - side * 0.8, 7.55, pz)
        .runtime(game.runtimeNode(`light-arm-${i}`)),
      primitives
        .sphere({ name: `light-lamp-${i}`, size: [0.36, 0.18, 0.48], material: lampMat, castShadow: false })
        .position(px - side * 1.55, 7.45, pz)
        .runtime(game.runtimeNode(`light-lamp-${i}`))
    ]);
  }

  // 5. Midground Architectural Skyline (4 instances of assets.showcaseModernBuildingOne)
  for (let i = 0; i < SKYLINE_POOL_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const sx = side * 42;
    const sz = -60 - Math.floor(i / 2) * SKYLINE_STRIDE_Z;
    const id = `freeway-skyline-${i}`;
    s.add(
      model(assets.showcaseModernBuildingOne, {
        name: id,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 38
      })
        .position(sx, -0.2, sz)
        .runtime(game.runtimeNode(id))
    );
  }

  // 6. Player Roadster Assembly (Primary Car + Lightbar + Headlights + Cold-Gas Plumes + Powerups + Shadow)
  const rearPlumeMat = material.emissive({
    color: "#67f3ff",
    emissive: "#38bdf8",
    emissiveIntensity: 1.9
  });
  const downPlumeMat = material.emissive({
    color: "#38bdf8",
    emissive: "#0ea5e9",
    emissiveIntensity: 1.75
  });
  const sidePlumeMat = material.emissive({
    color: "#7dd3fc",
    emissive: "#38bdf8",
    emissiveIntensity: 1.7
  });

  s.addMany([
    model(pickVehicleAsset("hero", assets.roadsterRushPlayerCar), {
      name: "player-roadster-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 4.35
    })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("player-roadster-car", { tags: ["primarySubject", "primaryVehicle", "player"] })),

    primitives
      .box({
        name: "player-lightbar",
        size: [1.72, 0.085, 0.09],
        material: material.emissive({ color: "#ff1830", emissive: "#ff1830", emissiveIntensity: 1.85 }), castShadow: false })
      .position(0, 0.72, 2.12)
      .runtime(game.runtimeNode("player-lightbar")),

    primitives
      .sphere({
        name: "player-headlight-l",
        size: [0.26, 0.1, 0.16],
        material: material.emissive({ color: "#eef8ff", emissive: "#bae6fd", emissiveIntensity: 1.6 }), castShadow: false })
      .position(-0.74, 0.56, -2.08)
      .runtime(game.runtimeNode("player-headlight-l")),

    primitives
      .sphere({
        name: "player-headlight-r",
        size: [0.26, 0.1, 0.16],
        material: material.emissive({ color: "#eef8ff", emissive: "#bae6fd", emissiveIntensity: 1.6 }), castShadow: false })
      .position(0.74, 0.56, -2.08)
      .runtime(game.runtimeNode("player-headlight-r")),

    // 2 Rear Thruster Plumes
    primitives
      .cylinder({
        name: "player-plume-rear-l",
        size: [0.34, 1.45, 0.34],
        material: rearPlumeMat, castShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-plume-rear-l")),
    primitives
      .cylinder({
        name: "player-plume-rear-r",
        size: [0.34, 1.45, 0.34],
        material: rearPlumeMat, castShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-plume-rear-r")),

    // Active Powerup Visuals on Player (Shield sphere, Rocket overdrive plume, Magnet torus)
    primitives
      .sphere({
        name: "player-power-shield",
        size: SHIELD_SIZE,
        material: material.custom(shieldSpec()),
        castShadow: false,
        receiveShadow: false
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-power-shield")),
    primitives
      .cylinder({
        name: "player-power-rocket",
        size: [0.68, 2.6, 0.68],
        material: material.emissive({ color: "#ff6b1a", emissive: "#ff3b00", emissiveIntensity: 2.3 }), castShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-power-rocket")),
    primitives
      .torus({
        name: "player-power-magnet",
        size: [1.65, 1.65, 0.08],
        material: material.emissive({ color: "#a855f7", emissive: "#c084fc", emissiveIntensity: 1.5 }), castShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-power-magnet")),

    // Ground Contact Shadow
    primitives
      .cylinder({
        name: "player-contact-shadow",
        size: [2.25, 0.012, 4.45],
        material: material.pbr({ color: "#07090f", roughness: 0.96 }), castShadow: false })
      .position(0, 0.03, 0)
      .runtime(game.runtimeNode("player-contact-shadow"))
  ]);

  // 4 Ventral Down-Thruster Plumes
  for (let i = 0; i < 4; i++) {
    const id = `player-plume-down-${i}`;
    s.add(
      primitives
        .cylinder({
          name: id,
          size: [0.28, 1.15, 0.28],
          material: downPlumeMat, castShadow: false })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(id))
    );
  }

  // 2 Left & 2 Right Lateral Reaction-Control Thruster Plumes
  for (let i = 0; i < 2; i++) {
    s.addMany([
      primitives
        .cylinder({
          name: `player-plume-side-l-${i}`,
          size: [0.22, 0.95, 0.22],
          material: sidePlumeMat, castShadow: false })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`player-plume-side-l-${i}`)),
      primitives
        .cylinder({
          name: `player-plume-side-r-${i}`,
          size: [0.22, 0.95, 0.22],
          material: sidePlumeMat, castShadow: false })
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`player-plume-side-r-${i}`))
    ]);
  }

  // 7. Ground Traffic Pool (42 Pooled 3D Vehicles Across All 9 Admitted Types + Carrier Launch Ramps)
  for (const vType of VEHICLE_TYPES) {
    const spec = VEHICLE_POOL_SPEC[vType];
    for (let i = 0; i < spec.count; i++) {
      const id = `traffic-${vType}-${i}`;
      s.add(
        model(spec.asset, {
          name: id,
          role: spec.role,
          scaleMode: "fit",
          targetMaxDimension: spec.maxDim
        })
          .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
          .scale(HIDDEN_SCALE)
          .runtime(game.runtimeNode(id))
      );

      if (vType === "carrier") {
        const rampId = `carrier-ramp-${i}`;
        s.add(
          primitives
            .box({
              name: rampId,
              size: [2.38, 0.18, 6.6],
              material: material.emissive({
                color: "#ffc928",
                emissive: "#ff9e00",
                emissiveIntensity: 0.68
              }), castShadow: false })
            .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
            .scale(HIDDEN_SCALE)
            .runtime(game.runtimeNode(rampId))
        );
      }
    }
  }

  // 16 Glowing Red Brake-Light Bars & 8 Blinking Amber Turn-Signal Indicators
  const brakeBarMat = material.emissive({ color: "#ff1e27", emissive: "#ff1e27", emissiveIntensity: 2.1 });
  for (let i = 0; i < BRAKE_BAR_POOL_COUNT; i++) {
    const id = `traffic-brake-${i}`;
    s.add(
      primitives
        .box({
          name: id,
          size: [1.58, 0.16, 0.09],
          material: brakeBarMat, castShadow: false })
        .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(id))
    );
  }

  const blinkerMat = material.emissive({ color: "#ffaa1d", emissive: "#ff9900", emissiveIntensity: 2.2 });
  for (let i = 0; i < BLINKER_POOL_COUNT; i++) {
    const id = `traffic-blinker-${i}`;
    s.add(
      primitives
        .sphere({
          name: id,
          size: [0.28, 0.2, 0.34],
          material: blinkerMat, castShadow: false })
        .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(id))
    );
  }

  // 8. Sky-Lane Dogfight Pool (14 Pooled assets.roadsterRushSkyCar + Thruster Plume + Oncoming Halo)
  const skyHaloMat = material.emissive({ color: "#ff2a3c", emissive: "#ff2a3c", emissiveIntensity: 1.65 });
  for (let i = 0; i < SKY_CAR_POOL_COUNT; i++) {
    const carId = `sky-car-${i}`;
    const plumeId = `sky-plume-${i}`;
    const haloId = `sky-halo-${i}`;
    s.addMany([
      model(assets.roadsterRushSkyCar, {
        name: carId,
        role: "primaryVehicle",
        scaleMode: "fit",
        targetMaxDimension: 4.3
      })
        .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(carId)),
      primitives
        .cylinder({
          name: plumeId,
          size: [0.42, 1.65, 0.42],
          material: rearPlumeMat, castShadow: false })
        .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(plumeId)),
      primitives
        .torus({
          name: haloId,
          size: [1.55, 1.55, 0.075],
          material: skyHaloMat, castShadow: false })
        .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(haloId))
    ]);
  }

  // 9. 3D Pickups Pool (42 Spinning Golden Bolts + 10 Glowing Powerup Orbs)
  const boltMat = material.emissive({
    color: "#ffc61f",
    emissive: "#ffae00",
    emissiveIntensity: 1.45
  });
  for (let i = 0; i < BOLT_POOL_COUNT; i++) {
    const id = `pickup-bolt-${i}`;
    s.add(
      primitives
        .torus({
          name: id,
          size: [0.48, 0.48, 0.14],
          material: boltMat, castShadow: false })
        .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(id))
    );
  }

  const powerupInitMat = material.emissive({
    color: "#2f7dff",
    emissive: "#2f7dff",
    emissiveIntensity: 1.65
  });
  for (let i = 0; i < POWERUP_POOL_COUNT; i++) {
    const id = `pickup-power-${i}`;
    s.add(
      primitives
        .sphere({
          name: id,
          size: [0.95, 0.95, 0.95],
          material: powerupInitMat, castShadow: false })
        .position(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(id))
    );
  }

  return s;
}

async function bootRoadsterRushAura3D(): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("Missing #game canvas element for Roadster Rush.");
  }

  const builtScene = buildRoadsterRushScene();
  const auraApp = createAuraApp(canvas, {
    scene: builtScene,
    renderer: { quality: "high" },
    qualityRebuild: { flags: ["game"] }
  });

  const req = (id: string) => auraApp.nodes.require(id);

  // Resolve Player Handles
  const playerHandles: PlayerHandles = {
    car: req("player-roadster-car"),
    lightbar: req("player-lightbar"),
    headlightL: req("player-headlight-l"),
    headlightR: req("player-headlight-r"),
    rearPlumeL: req("player-plume-rear-l"),
    rearPlumeR: req("player-plume-rear-r"),
    downPlumes: Array.from({ length: 4 }, (_, i) => req(`player-plume-down-${i}`)),
    sidePlumesL: Array.from({ length: 2 }, (_, i) => req(`player-plume-side-l-${i}`)),
    sidePlumesR: Array.from({ length: 2 }, (_, i) => req(`player-plume-side-r-${i}`)),
    shieldSphere: req("player-power-shield"),
    rocketCone: req("player-power-rocket"),
    magnetRing: req("player-power-magnet"),
    contactShadow: req("player-contact-shadow")
  };

  // Resolve Freeway & Environment Handles
  const outerGroundHandle = req("freeway-outer-ground");
  const asphaltDeckHandle = req("freeway-asphalt-deck");
  const shoulderLeftHandle = req("freeway-shoulder-left");
  const shoulderRightHandle = req("freeway-shoulder-right");
  const barrierLeftHandle = req("freeway-barrier-left");
  const barrierRightHandle = req("freeway-barrier-right");
  const soundwallLeftHandle = req("freeway-soundwall-left");
  const soundwallRightHandle = req("freeway-soundwall-right");
  const neonTrimLeftHandle = req("freeway-neon-trim-left");
  const neonTrimRightHandle = req("freeway-neon-trim-right");
  const horizonWallHandle = req("horizon-sky-wall");

  const dashHandles: AuraRuntimeNodeHandle[][] = LANE_DIVIDER_X.map((_, d) =>
    Array.from({ length: DASH_COUNT_PER_DIVIDER }, (__, i) => req(`lane-dash-${d}-${i}`))
  );

  const gantrySlots: GantrySlot[] = Array.from({ length: GANTRY_POOL_COUNT }, (_, i) => ({
    pillarL: req(`gantry-pillar-l-${i}`),
    pillarR: req(`gantry-pillar-r-${i}`),
    beam: req(`gantry-beam-${i}`),
    boardL: req(`gantry-board-l-${i}`),
    boardR: req(`gantry-board-r-${i}`),
    trimL: req(`gantry-trim-l-${i}`),
    trimR: req(`gantry-trim-r-${i}`)
  }));

  const palmHandles: AuraRuntimeNodeHandle[] = Array.from({ length: PALM_POOL_COUNT }, (_, i) =>
    req(`freeway-palm-${i}`)
  );

  const poleSlots: LightPoleSlot[] = Array.from({ length: POLE_POOL_COUNT }, (_, i) => ({
    pole: req(`light-pole-${i}`),
    arm: req(`light-arm-${i}`),
    lamp: req(`light-lamp-${i}`)
  }));

  const skylineHandles: AuraRuntimeNodeHandle[] = Array.from({ length: SKYLINE_POOL_COUNT }, (_, i) =>
    req(`freeway-skyline-${i}`)
  );

  // Resolve Ground Traffic Pool Handles
  const vehiclePools: Record<VehicleType, AuraRuntimeNodeHandle[]> = {
    sedan: [],
    hatch: [],
    suv: [],
    taxi: [],
    van: [],
    pickup: [],
    boxtruck: [],
    bus: [],
    carrier: []
  };
  for (const vType of VEHICLE_TYPES) {
    const count = VEHICLE_POOL_SPEC[vType].count;
    vehiclePools[vType] = Array.from({ length: count }, (_, i) => req(`traffic-${vType}-${i}`));
  }
  const carrierRampHandles: AuraRuntimeNodeHandle[] = Array.from(
    { length: VEHICLE_POOL_SPEC.carrier.count },
    (_, i) => req(`carrier-ramp-${i}`)
  );
  const brakeBarHandles: AuraRuntimeNodeHandle[] = Array.from(
    { length: BRAKE_BAR_POOL_COUNT },
    (_, i) => req(`traffic-brake-${i}`)
  );
  const blinkerHandles: AuraRuntimeNodeHandle[] = Array.from(
    { length: BLINKER_POOL_COUNT },
    (_, i) => req(`traffic-blinker-${i}`)
  );

  // Resolve Sky-Lane Pool Handles
  const skyCarSlots: SkyCarSlot[] = Array.from({ length: SKY_CAR_POOL_COUNT }, (_, i) => ({
    car: req(`sky-car-${i}`),
    plume: req(`sky-plume-${i}`),
    halo: req(`sky-halo-${i}`)
  }));

  // Resolve Pickups Pool Handles
  const boltHandles: AuraRuntimeNodeHandle[] = Array.from({ length: BOLT_POOL_COUNT }, (_, i) =>
    req(`pickup-bolt-${i}`)
  );
  const powerupHandles: AuraRuntimeNodeHandle[] = Array.from(
    { length: POWERUP_POOL_COUNT },
    (_, i) => req(`pickup-power-${i}`)
  );
  const powerupKindCache: string[] = Array.from({ length: POWERUP_POOL_COUNT }, () => "air");

  // State Tracking
  const urlParams = new URLSearchParams(window.location.search);
  let autopilot = urlParams.get("autoplay") === "1" || urlParams.get("demo") === "1";
  let framesRendered = 0;
  let lastTodBucket = -1;
  let manualTodOverride: number | null = null;
  let lastLightbarHot = false;
  let lastAutopilotTickMs = 0;
  let lastAutopilotStuntMs = 0;
  let gameOverSinceMs = 0;

  function updateAtmosphereForTod(todRaw: number): void {
    const tod = clamp(manualTodOverride ?? todRaw, 0, 1);
    const bucket = Math.round(tod * 60);
    if (bucket === lastTodBucket) return;
    lastTodBucket = bucket;

    const look = skyLook(tod);
    const skyUniforms: Array<[string, Vec3 | [number, number] | number]> = [
      ["skyHorizon", look.skyHorizon],
      ["skyMid", look.skyMid],
      ["skyTop", look.skyTop],
      ["sunColor", look.sunColor],
      ["cityGlow", look.cityGlow],
      ["sunDir", look.sunDir],
      ["sunDirXZ", look.sunDirXZ],
      ["nightAmount", look.nightAmount]
    ];
    for (const [name, value] of skyUniforms) horizonWallHandle.setUniform?.(name, value as never);
    (auraApp.scene as any).background = rgbToHex(look.skyHorizon[0] * 80, look.skyHorizon[1] * 60, look.skyHorizon[2] * 90);

    let groundHex: string;
    if (tod <= 0.5) groundHex = lerpHexColor("#190f24", "#100d1e", tod * 2);
    else groundHex = lerpHexColor("#100d1e", "#070912", (tod - 0.5) * 2);
    const [gr, gg, gb] = hexToRgb(groundHex);
    outerGroundHandle.setUniform?.("groundColor", [gr / 255, gg / 255, gb / 255] as never);
    outerGroundHandle.setUniform?.("groundFogColor", [look.skyHorizon[0] * 0.8, look.skyHorizon[1] * 0.75, look.skyHorizon[2] * 0.8] as never);
  }

  function runSmartFreewayAutopilot(g: any): void {
    const now = performance.now();
    if (!g || !autopilot) return;

    // Auto-recover from Wrecked / Game Over screen if autopilot is active
    if (g.mode === "gameover") {
      if (gameOverSinceMs === 0) {
        gameOverSinceMs = now;
      } else if (now - gameOverSinceMs > 1600) {
        gameOverSinceMs = 0;
        g.start?.();
      }
      return;
    }
    gameOverSinceMs = 0;

    if (g.mode !== "playing" || g.paused || g.activePreset) return;
    if (now - lastAutopilotTickMs < 95) return;
    lastAutopilotTickMs = now;

    const p = g.player;
    if (!p || p.alive === false || !p.position) return;

    const px = Number(p.position.x ?? 0);
    const py = Number(p.position.y ?? 0);
    const pz = Number(p.position.z ?? 0);
    const currentLane = clamp(Number(p.targetLane ?? p.lane ?? 2), 0, 4);
    const vehicles: any[] = Array.isArray(g.traffic?.vehicles) ? g.traffic.vehicles : [];
    const skyCars: any[] = Array.isArray(g.traffic?.skyCars) ? g.traffic.skyCars : [];

    // 1. If in Sky Lane (py > 7), dodge oncoming sky-lane Roadsters
    if (py > 7) {
      let skyThreatInLane = false;
      const safeSkyLane = [true, true, true, true, true];
      for (let i = 0; i < skyCars.length; i++) {
        const sc = skyCars[i];
        if (!sc) continue;
        const dz = pz - Number(sc.z ?? 0);
        if (dz > -6 && dz < 72 && Math.abs(Number(sc.y ?? 12) - py) < 3.4) {
          const sLane = clamp(Math.round(Number(sc.x ?? 0) / 3.6 + 2), 0, 4);
          safeSkyLane[sLane] = false;
          if (sLane === currentLane || Math.abs(Number(sc.x ?? 0) - px) < 2.5) {
            skyThreatInLane = true;
          }
        }
      }
      if (skyThreatInLane) {
        if (currentLane > 0 && safeSkyLane[currentLane - 1]) {
          g.triggerAction?.((p.air ?? 0) > 40 ? "rollLeft" : "left");
          return;
        }
        if (currentLane < 4 && safeSkyLane[currentLane + 1]) {
          g.triggerAction?.((p.air ?? 0) > 40 ? "rollRight" : "right");
          return;
        }
      }
      return;
    }

    // 2. Check for a Carrier Ramp truck ahead in current or adjacent lane -> steer onto it for a Ramp Launch!
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v || v.type !== "carrier") continue;
      const rearZ = Number(v.z ?? 0) + Number(v.l ?? 16) * 0.5;
      const distAhead = pz - rearZ;
      if (distAhead > 4 && distAhead < 44 && Math.abs(v.lane - currentLane) <= 1) {
        if (v.lane < currentLane) {
          g.triggerAction?.("left");
          return;
        }
        if (v.lane > currentLane) {
          g.triggerAction?.("right");
          return;
        }
        // Aligned with carrier ramp! Boost up the ramp!
        g.triggerAction?.("boost", { duration: 0.7 });
        return;
      }
    }

    // 3. Evaluate closest obstacle distance in each of the 5 lanes
    const laneClosestDist = [999, 999, 999, 999, 999];
    let obstacleInCurrentLane: any = null;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v) continue;
      const vLane = clamp(Number(v.lane ?? 2), 0, 4);
      const rearZ = Number(v.z ?? 0) + Number(v.l ?? 4.6) * 0.5;
      const frontZ = Number(v.z ?? 0) - Number(v.l ?? 4.6) * 0.5;
      const distAhead = pz - rearZ;

      // Ignore vehicles we are already safely above (e.g. roof-running)
      const roofH = Number(v.roof ?? v.h ?? 1.5);
      if (py >= roofH - 0.15 && v.type !== "carrier") continue;

      if (pz >= frontZ - 2 && distAhead < laneClosestDist[vLane]! && distAhead > -8) {
        laneClosestDist[vLane] = distAhead;
        if (vLane === currentLane && distAhead < 28) {
          obstacleInCurrentLane = v;
        }
      }
    }

    if (obstacleInCurrentLane) {
      const dist = laneClosestDist[currentLane]!;
      const air = Number(p.air ?? 100);

      // Prefer clean lane changes first; use cold-gas hop or barrel-roll when lanes are tight or after 4s of run
      const leftDist = currentLane > 0 ? laneClosestDist[currentLane - 1]! : -999;
      const rightDist = currentLane < 4 ? laneClosestDist[currentLane + 1]! : -999;

      if (leftDist >= rightDist && leftDist > 22) {
        g.triggerAction?.("left");
        return;
      }
      if (rightDist > 22) {
        g.triggerAction?.("right");
        return;
      }

      if (air > 48 && dist < 20) {
        g.triggerAction?.("thrustHold", { duration: 0.75 });
        lastAutopilotStuntMs = now;
        return;
      }

      if (leftDist >= rightDist && leftDist > 14) {
        g.triggerAction?.("left");
        return;
      }
      if (rightDist > 14) {
        g.triggerAction?.("right");
        return;
      }
      // Both adjacent lanes tight — emergency cold-gas hop!
      if (air > 25) {
        g.triggerAction?.("thrustHold", { duration: 0.65 });
      } else if (leftDist > rightDist && currentLane > 0) {
        g.triggerAction?.("left");
      } else if (currentLane < 4) {
        g.triggerAction?.("right");
      }
      return;
    }

    // 4. Periodic showcase boost when the lane is clear
    if (now - lastAutopilotStuntMs > 5600 && (p.air ?? 0) > 62 && p.grounded) {
      lastAutopilotStuntMs = now;
      g.triggerAction?.("boost", { duration: 1.1 });
    }
  }

  function syncRoadsterWorld(real: any, g: any = real): void {
    if (!real || !real.player) return;
    framesRendered += 1;

    runSmartFreewayAutopilot(real);

    const p = g.player;
    const px = Number(p.position?.x ?? 0);
    const py = Number(p.position?.y ?? 0);
    const pz = Number(p.position?.z ?? 0);
    const simTime = Number(g.time ?? performance.now() * 0.001);

    // Camera-anchored relative transform: the @aura3d/engine camera sits at [0, 3.6, 6.2] looking at [0, 0.9, -6.0].
    // By shifting world coordinates by (camAnchorX, camAnchorY, pz), the Player Roadster stays right at z=0 in front
    // of the chase camera while the 5-lane freeway, traffic, sky-lane Roadsters, and bolts rush past at 60 FPS!
    const camAnchorX = px * 0.65;
    const camAnchorY = Math.max(0, py * 0.85);
    const rx = (wx: number) => wx - camAnchorX;
    const ry = (wy: number) => wy - camAnchorY;
    const rz = (wz: number) => wz - pz;

    // 1. Sync Endless Scrolling 5-Lane Freeway, Lane Dashes, Gantries, Palms, Poles & Skyline
    const centerZ = -150;
    outerGroundHandle.setPosition(rx(0), ry(-0.22), centerZ);
    asphaltDeckHandle.setPosition(rx(0), ry(-0.06), centerZ);
    shoulderLeftHandle.setPosition(rx(-9.0), ry(0.012), centerZ);
    shoulderRightHandle.setPosition(rx(9.0), ry(0.012), centerZ);
    barrierLeftHandle.setPosition(rx(-10.6), ry(0.52), centerZ);
    barrierRightHandle.setPosition(rx(10.6), ry(0.52), centerZ);
    soundwallLeftHandle.setPosition(rx(-11.6), ry(1.25), centerZ);
    soundwallRightHandle.setPosition(rx(11.6), ry(1.25), centerZ);
    neonTrimLeftHandle.setPosition(rx(-11.3), ry(2.42), centerZ);
    neonTrimRightHandle.setPosition(rx(11.3), ry(2.42), centerZ);

    const dashBaseZ = Math.floor(pz / DASH_STRIDE_Z) * DASH_STRIDE_Z + DASH_STRIDE_Z;
    for (let d = 0; d < LANE_DIVIDER_X.length; d++) {
      const lx = rx(LANE_DIVIDER_X[d]!);
      const col = dashHandles[d]!;
      for (let i = 0; i < DASH_COUNT_PER_DIVIDER; i++) {
        col[i]!.setPosition(lx, ry(0.015), rz(dashBaseZ - i * DASH_STRIDE_Z));
      }
    }

    // Overhead Highway Sign Gantries
    const worldGantries = Array.isArray(g.world?.gantries)
      ? g.world.gantries
      : Array.isArray(g.world?.gantries?.items)
        ? g.world.gantries.items
        : null;
    const gantryBaseZ = Math.floor(pz / GANTRY_STRIDE_Z) * GANTRY_STRIDE_Z;
    for (let i = 0; i < GANTRY_POOL_COUNT; i++) {
      const slot = gantrySlots[i]!;
      const worldGz =
        worldGantries && worldGantries[i]?.position?.z != null
          ? Number(worldGantries[i].position.z)
          : gantryBaseZ - i * GANTRY_STRIDE_Z;
      const gz = rz(worldGz);
      slot.pillarL.setPosition(rx(-10.9), ry(4.8), gz);
      slot.pillarR.setPosition(rx(10.9), ry(4.8), gz);
      slot.beam.setPosition(rx(0), ry(9.0), gz);
      slot.boardL.setPosition(rx(-4.4), ry(8.85), gz + 0.22);
      slot.boardR.setPosition(rx(4.6), ry(8.85), gz + 0.22);
      slot.trimL.setPosition(rx(-4.4), ry(9.55), gz + 0.24);
      slot.trimR.setPosition(rx(4.6), ry(9.45), gz + 0.24);
    }

    // Roadside Palm Silhouettes & Highway Streetlight Poles
    const palmBaseZ = Math.floor(pz / PALM_STRIDE_Z) * PALM_STRIDE_Z + PALM_STRIDE_Z;
    for (let i = 0; i < PALM_POOL_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const treeX = rx(side * (15.5 + (row % 2) * 1.8));
      const treeZ = rz(palmBaseZ - row * PALM_STRIDE_Z);
      palmHandles[i]!.setPosition(treeX, ry(4.5), treeZ).setRotation(0, 0, side * 0.06);
    }

    for (let i = 0; i < POLE_POOL_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const poleX = rx(side * 12.1);
      const poleZ = rz(palmBaseZ - row * POLE_STRIDE_Z - 14);
      const slot = poleSlots[i]!;
      slot.pole.setPosition(poleX, ry(3.8), poleZ);
      slot.arm.setPosition(poleX - side * 0.8, ry(7.55), poleZ);
      slot.lamp.setPosition(poleX - side * 1.55, ry(7.45), poleZ);
    }

    const skylineBaseZ = Math.floor(pz / SKYLINE_STRIDE_Z) * SKYLINE_STRIDE_Z;
    for (let i = 0; i < SKYLINE_POOL_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      skylineHandles[i]!.setPosition(rx(side * 42), ry(-0.2), rz(skylineBaseZ - 65 - row * SKYLINE_STRIDE_Z));
    }

    updateAtmosphereForTod(Number(g.world?.timeOfDay ?? 0));

    // 3. Sync Player Roadster Assembly, Thruster Plumes, Active Powerups & Contact Shadow
    const pitch = Number(p.pivot?.rotation?.x ?? p._pitch ?? 0);
    const yaw = Number(p.mesh?.rotation?.y ?? p._yaw ?? 0);
    const roll = Number(p.pivot?.rotation?.z ?? p._bank ?? 0);
    const squash: Vec3 = [
      Number(p.squashGroup?.scale?.x ?? 1),
      Number(p.squashGroup?.scale?.y ?? 1),
      Number(p.squashGroup?.scale?.z ?? 1)
    ];
    const pRoot: Vec3 = [rx(px), ry(py), -1.15];

    playerHandles.car
      .setPosition(pRoot[0], pRoot[1], pRoot[2])
      .setRotation(pitch, yaw, roll)
      .setScale(squash)
      .setVisible(true);

    const lbWorld = rotateLocalOffset(pRoot, pitch, yaw, roll, [0, 0.72, 2.12]);
    playerHandles.lightbar
      .setPosition(lbWorld[0], lbWorld[1], lbWorld[2])
      .setRotation(pitch, yaw, roll)
      .setVisible(true);

    const isHotTail = Boolean((p._brake ?? 0) > 0.15 || p.boosting || (p.rocketTimer ?? 0) > 0);
    if (isHotTail !== lastLightbarHot) {
      lastLightbarHot = isHotTail;
      playerHandles.lightbar.setMaterial(
        material.emissive({
          color: "#ff1830",
          emissive: isHotTail ? "#ff384c" : "#ff1830",
          emissiveIntensity: isHotTail ? 2.8 : 1.75
        })
      );
    }

    const hlLeftW = rotateLocalOffset(pRoot, pitch, yaw, roll, [-0.74, 0.56, -2.08]);
    const hlRightW = rotateLocalOffset(pRoot, pitch, yaw, roll, [0.74, 0.56, -2.08]);
    playerHandles.headlightL
      .setPosition(hlLeftW[0], hlLeftW[1], hlLeftW[2])
      .setRotation(pitch, yaw, roll)
      .setVisible(true);
    playerHandles.headlightR
      .setPosition(hlRightW[0], hlRightW[1], hlRightW[2])
      .setRotation(pitch, yaw, roll)
      .setVisible(true);

    // Cold-Gas Thruster Plumes
    const rearPlumeLevel = clamp(
      Math.max(
        Number(p._rearPlume ?? 0),
        p.boosting ? 1.0 : 0,
        (p.rocketTimer ?? 0) > 0 ? 1.35 : 0,
        g.mode === "playing" ? 0.28 : 0
      ),
      0,
      1.45
    );
    const flicker = 0.92 + Math.sin(simTime * 55) * 0.08;
    if (rearPlumeLevel > 0.04) {
      const rpL = rotateLocalOffset(pRoot, pitch, yaw, roll, [-0.42, 0.46, 2.45 + rearPlumeLevel * 0.35]);
      const rpR = rotateLocalOffset(pRoot, pitch, yaw, roll, [0.42, 0.46, 2.45 + rearPlumeLevel * 0.35]);
      const pScale: Vec3 = [
        0.75 * rearPlumeLevel * flicker,
        1.1 * rearPlumeLevel * flicker,
        0.75 * rearPlumeLevel * flicker
      ];
      playerHandles.rearPlumeL
        .setPosition(rpL[0], rpL[1], rpL[2])
        .setRotation(pitch + Math.PI * 0.5, yaw, roll)
        .setScale(pScale)
        .setVisible(true);
      playerHandles.rearPlumeR
        .setPosition(rpR[0], rpR[1], rpR[2])
        .setRotation(pitch + Math.PI * 0.5, yaw, roll)
        .setScale(pScale)
        .setVisible(true);
    } else {
      playerHandles.rearPlumeL.setScale(HIDDEN_SCALE).setVisible(false);
      playerHandles.rearPlumeR.setScale(HIDDEN_SCALE).setVisible(false);
    }

    const downPlumeLevel = clamp(
      Math.max(Number(p._downPlume ?? 0), p.thrusting ? 1 : 0, !p.grounded && py > 0.4 ? 0.55 : 0),
      0,
      1.2
    );
    const downOffsets: Vec3[] = [
      [-0.64, -0.18, -0.95],
      [0.64, -0.18, -0.95],
      [-0.64, -0.18, 1.05],
      [0.64, -0.18, 1.05]
    ];
    for (let i = 0; i < 4; i++) {
      const dh = playerHandles.downPlumes[i]!;
      if (downPlumeLevel > 0.04) {
        const dw = rotateLocalOffset(pRoot, pitch, yaw, roll, downOffsets[i]!);
        dh.setPosition(dw[0], dw[1], dw[2])
          .setRotation(pitch + Math.PI, yaw, roll)
          .setScale([0.85 * downPlumeLevel, 1.15 * downPlumeLevel * flicker, 0.85 * downPlumeLevel])
          .setVisible(true);
      } else {
        dh.setScale(HIDDEN_SCALE).setVisible(false);
      }
    }

    const sideL = clamp(Number(p._sidePlumeL ?? 0), 0, 1.2);
    const sideR = clamp(Number(p._sidePlumeR ?? 0), 0, 1.2);
    const sideZOffsets = [-1.45, 1.45];
    for (let i = 0; i < 2; i++) {
      const shL = playerHandles.sidePlumesL[i]!;
      if (sideL > 0.04) {
        const lw = rotateLocalOffset(pRoot, pitch, yaw, roll, [-1.18, 0.48, sideZOffsets[i]!]);
        shL
          .setPosition(lw[0], lw[1], lw[2])
          .setRotation(pitch, yaw, roll + Math.PI * 0.5)
          .setScale([0.8 * sideL, 1.1 * sideL * flicker, 0.8 * sideL])
          .setVisible(true);
      } else {
        shL.setScale(HIDDEN_SCALE).setVisible(false);
      }

      const shR = playerHandles.sidePlumesR[i]!;
      if (sideR > 0.04) {
        const rw = rotateLocalOffset(pRoot, pitch, yaw, roll, [1.18, 0.48, sideZOffsets[i]!]);
        shR
          .setPosition(rw[0], rw[1], rw[2])
          .setRotation(pitch, yaw, roll - Math.PI * 0.5)
          .setScale([0.8 * sideR, 1.1 * sideR * flicker, 0.8 * sideR])
          .setVisible(true);
      } else {
        shR.setScale(HIDDEN_SCALE).setVisible(false);
      }
    }

    // Active Powerup Visuals on Player
    if ((p.shieldTimer ?? 0) > 0) {
      const shieldLeft = Number(p.shieldTimer ?? 0);
      // Fades in over the first 0.25 s, flickers over the last 1.5 s so the player can read it running out.
      const shieldFade = Math.min(1, (POWERUP_SECONDS.shield - shieldLeft) / 0.25 + 0.3);
      const shieldBlink = shieldLeft < 1.5 ? 0.55 + 0.45 * Math.sin(simTime * 22) : 1;
      playerHandles.shieldSphere
        .setPosition(pRoot[0], pRoot[1] + 0.62, pRoot[2])
        .setRotation(pitch * 0.5, yaw, roll * 0.5)
        .setScale([1, 1, 1])
        .setVisible(true);
      playerHandles.shieldSphere.setUniform?.("shieldPulse", clamp(shieldFade, 0, 1) * shieldBlink);
    } else {
      playerHandles.shieldSphere.setScale(HIDDEN_SCALE).setVisible(false);
    }

    if ((p.rocketTimer ?? 0) > 0) {
      const rkW = rotateLocalOffset(pRoot, pitch, yaw, roll, [0, 0.52, 3.1]);
      playerHandles.rocketCone
        .setPosition(rkW[0], rkW[1], rkW[2])
        .setRotation(pitch + Math.PI * 0.5, yaw, roll)
        .setScale([1.15 * flicker, 1.35 * flicker, 1.15 * flicker])
        .setVisible(true);
    } else {
      playerHandles.rocketCone.setScale(HIDDEN_SCALE).setVisible(false);
    }

    if ((p.magnetTimer ?? 0) > 0) {
      playerHandles.magnetRing
        .setPosition(pRoot[0], pRoot[1] + 0.75, pRoot[2])
        .setRotation(Math.PI * 0.5, simTime * 3.5, 0)
        .setScale([1.1, 1.1, 1.1])
        .setVisible(true);
    } else {
      playerHandles.magnetRing.setScale(HIDDEN_SCALE).setVisible(false);
    }

    // Ground Contact Shadow
    const groundBelow = Number(p.groundBelow ?? 0);
    const alt = Math.max(0, py - groundBelow);
    const shadowScale = clamp(1 - alt * 0.045, 0.35, 1.05);
    playerHandles.contactShadow
      .setPosition(pRoot[0], ry(groundBelow + 0.035), pRoot[2])
      .setRotation(0, yaw, 0)
      .setScale([shadowScale, 1, shadowScale])
      .setVisible(alt < 20);

    // 4. Sync Ground Traffic Pool (Pooled 3D Vehicles + Carrier Golden Launch Ramps + Brake & Blinker Lights)
    const rawVehicles: any[] = Array.isArray(g.traffic?.vehicles) ? g.traffic.vehicles : [];
    const visibleVehicles = rawVehicles
      .filter((v) => v && v.z <= pz + 28 && v.z >= pz - 235)
      .sort((a, b) => Math.abs(pz - a.z) - Math.abs(pz - b.z));

    const poolCursor: Record<VehicleType, number> = {
      sedan: 0,
      hatch: 0,
      suv: 0,
      taxi: 0,
      van: 0,
      pickup: 0,
      boxtruck: 0,
      bus: 0,
      carrier: 0
    };

    let brakeUsed = 0;
    let blinkerUsed = 0;
    const blinkOn = (simTime * 2.8) % 1 < 0.55;

    for (let i = 0; i < visibleVehicles.length; i++) {
      const v = visibleVehicles[i];
      const requestedType = (VEHICLE_POOL_SPEC[v.type as VehicleType] ? v.type : "sedan") as VehicleType;
      let chosenType: VehicleType | null = null;
      if (poolCursor[requestedType] < vehiclePools[requestedType].length) {
        chosenType = requestedType;
      } else {
        for (const fallback of ["sedan", "hatch", "suv", "taxi", "van", "pickup"] as const) {
          if (poolCursor[fallback] < vehiclePools[fallback].length) {
            chosenType = fallback;
            break;
          }
        }
      }
      if (!chosenType) continue;

      const slotIdx = poolCursor[chosenType]++;
      const handle = vehiclePools[chosenType][slotIdx]!;

      const vx = rx(Number(v.x ?? 0));
      const vz = rz(Number(v.z ?? 0));
      const vw = Number(v.w ?? 1.9);
      const vh = Number(v.h ?? 1.5);
      const vl = Number(v.l ?? 4.6);
      const vyaw = Number(v.yaw ?? 0);
      const vphase = Number(v.phase ?? 0);
      const vspd = Number(v.spd ?? 14);
      const isHeavy = vh > 2.5;
      const damp = isHeavy ? 0.35 : 1;

      const hopY =
        (v.honkT > 0 ? Math.sin(Math.PI * (1 - v.honkT / 0.4)) * 0.38 : 0) +
        Math.sin(simTime * (6 + vspd * 0.35) + vphase) * 0.014 * damp;
      const vroll = Math.sin(simTime * 2.3 + vphase * 1.7) * 0.01 * damp;
      const laneBrake = Number(g.traffic?._laneBrake?.[v.flowLane ?? v.lane ?? 0] ?? 0);
      const isBraking = Number(v.dv ?? 0) < -0.5 || laneBrake > 0.5;
      const vpitch = isBraking ? -0.012 * damp : 0;

      handle
        .setPosition(vx, ry(Math.max(0, hopY)), vz)
        .setRotation(-vpitch, vyaw + Math.PI, -vroll)
        .setScale([Math.min(1, MODEL_WIDTH_FIT / ((meshyVehicles.enabled ? MODEL_WIDTH_OVER_SPEC[chosenType] : undefined) ?? 1)), 1, 1])
        .setVisible(true);

      // Sloped golden launch ramp on Carrier trucks
      if (chosenType === "carrier") {
        const rampHandle = carrierRampHandles[slotIdx];
        const rampH = Number(v.ramp?.height ?? v.roof ?? 3.0);
        const rampLen = Number(v.ramp?.length ?? 6.0);
        const rampPitch = Math.atan2(rampH, rampLen);
        rampHandle
          ?.setPosition(vx, ry(hopY + rampH * 0.48), vz + vl * 0.5 - rampLen * 0.48)
          .setRotation(rampPitch, vyaw, vroll)
          .setScale([1, 1, 1])
          .setVisible(true);
      }

      // Brake Light Bars
      if (isBraking && brakeUsed < BRAKE_BAR_POOL_COUNT) {
        brakeBarHandles[brakeUsed++]!
          .setPosition(vx, ry(hopY + (isHeavy ? 0.95 : 0.72)), vz + vl * 0.5 + 0.06)
          .setRotation(vpitch, vyaw, vroll)
          .setScale([vw / 1.9, 1, 1])
          .setVisible(true);
      }

      // Blinking Amber Turn-Signal Indicators
      const changer = v.changer;
      if (changer && (changer.state === 1 || changer.state === 2) && blinkOn && blinkerUsed < BLINKER_POOL_COUNT) {
        const dirSign = Number(changer.dir || 1);
        blinkerHandles[blinkerUsed++]!
          .setPosition(vx + dirSign * (vw * 0.5 + 0.08), ry(hopY + 0.68), vz - vl * 0.35)
          .setRotation(0, vyaw, 0)
          .setScale([1, 1, 1])
          .setVisible(true);
      }
    }

    // Hide unused ground vehicle slots
    for (const vType of VEHICLE_TYPES) {
      const pool = vehiclePools[vType];
      for (let i = poolCursor[vType]; i < pool.length; i++) {
        pool[i]!.setPosition(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2]).setScale(HIDDEN_SCALE).setVisible(false);
        if (vType === "carrier") {
          carrierRampHandles[i]
            ?.setPosition(HIDDEN_POS[0], HIDDEN_POS[1], HIDDEN_POS[2])
            .setScale(HIDDEN_SCALE)
            .setVisible(false);
        }
      }
    }
    for (let i = brakeUsed; i < BRAKE_BAR_POOL_COUNT; i++) {
      brakeBarHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }
    for (let i = blinkerUsed; i < BLINKER_POOL_COUNT; i++) {
      blinkerHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }

    // 5. Sync Sky-Lane Dogfight Pool (Pooled assets.roadsterRushSkyCar Nodes)
    const rawSkyCars: any[] = Array.isArray(g.traffic?.skyCars) ? g.traffic.skyCars : [];
    const visibleSkyCars = rawSkyCars
      .filter((sc) => sc && sc.z <= pz + 28 && sc.z >= pz - 290)
      .sort((a, b) => Math.abs(pz - a.z) - Math.abs(pz - b.z));

    let skyUsed = 0;
    for (let i = 0; i < visibleSkyCars.length && skyUsed < SKY_CAR_POOL_COUNT; i++) {
      const sc = visibleSkyCars[i];
      const slot = skyCarSlots[skyUsed++]!;
      const sx = rx(Number(sc.x ?? 0));
      const sy = ry(Number(sc.y ?? 12));
      const sz = rz(Number(sc.z ?? 0));
      const srx = Number(sc.rx ?? 0);
      const srz = Number(sc.rz ?? 0);
      const oncoming = Number(sc.dir ?? 1) > 0;
      const sry = oncoming ? 0 : Math.PI;

      slot.car
        .setPosition(sx, sy, sz)
        .setRotation(srx, sry, srz)
        .setScale([1, 1, 1])
        .setVisible(true);

      const tailZ = oncoming ? sz - 2.35 : sz + 2.35;
      slot.plume
        .setPosition(sx, sy + 0.45, tailZ)
        .setRotation(oncoming ? -Math.PI * 0.5 : Math.PI * 0.5, 0, 0)
        .setScale([0.9, 1.2 * flicker, 0.9])
        .setVisible(true);

      if (oncoming) {
        slot.halo
          .setPosition(sx, sy + 0.55, sz + 2.15)
          .setRotation(0, 0, simTime * 4)
          .setScale([1, 1, 1])
          .setVisible(true);
      } else {
        slot.halo.setScale(HIDDEN_SCALE).setVisible(false);
      }
    }

    for (let i = skyUsed; i < SKY_CAR_POOL_COUNT; i++) {
      const slot = skyCarSlots[i]!;
      slot.car.setScale(HIDDEN_SCALE).setVisible(false);
      slot.plume.setScale(HIDDEN_SCALE).setVisible(false);
      slot.halo.setScale(HIDDEN_SCALE).setVisible(false);
    }

    // 6. Sync 3D Pickups Pool (42 Spinning Golden Bolts + 10 Glowing Powerup Orbs)
    const rawPickups: any[] = Array.isArray(g.traffic?.pickups) ? g.traffic.pickups : [];
    let boltUsed = 0;
    let powerUsed = 0;

    for (let i = 0; i < rawPickups.length; i++) {
      const pk = rawPickups[i];
      if (!pk || pk.z > pz + 16 || pk.z < pz - 235) continue;
      const kx = rx(Number(pk.x ?? 0));
      const kz = rz(Number(pk.z ?? 0));
      const phase = Number(pk.phase ?? 0);
      const bob = pk.magnet ? 0 : Math.sin(simTime * 2.8 + phase) * 0.15;
      const ky = ry(Number(pk.y ?? 1) + bob);
      const spin = simTime * 3.4 + phase;

      if (pk.kind === "bolt") {
        if (boltUsed >= BOLT_POOL_COUNT) continue;
        const bh = boltHandles[boltUsed++]!;
        const s = pk.magnet ? 0.82 : 1.0;
        bh.setPosition(kx, ky, kz)
          .setRotation(0, spin, Math.PI * 0.12)
          .setScale([s, s, s])
          .setVisible(true);
      } else {
        if (powerUsed >= POWERUP_POOL_COUNT) continue;
        const idx = powerUsed++;
        const ph = powerupHandles[idx]!;
        const kind = (pk.kind as Exclude<PickupKind, "bolt">) || "air";
        if (powerupKindCache[idx] !== kind) {
          powerupKindCache[idx] = kind;
          const col = POWERUP_COLORS[kind] || "#2f7dff";
          ph.setMaterial(
            material.emissive({
              color: col,
              emissive: col,
              emissiveIntensity: 1.75
            })
          );
        }
        ph.setPosition(kx, ky, kz)
          .setRotation(spin * 0.5, spin, 0)
          .setScale([1, 1, 1])
          .setVisible(true);
      }
    }

    for (let i = boltUsed; i < BOLT_POOL_COUNT; i++) {
      boltHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }
    for (let i = powerUsed; i < POWERUP_POOL_COUNT; i++) {
      powerupHandles[i]!.setScale(HIDDEN_SCALE).setVisible(false);
    }

    // 7. Publish Aura3D Runtime Evidence & Telemetry
    const evidence = {
      route: "showcase-roadster-rush",
      engine: "@aura3d/engine",
      ready: true,
      autopilot,
      framesRendered,
      mode: g.mode,
      paused: Boolean(g.paused),
      score: Math.floor(Number(g.score ?? 0)),
      distance: Math.floor(Number(g.distance ?? 0)),
      bolts: Number(g.bolts ?? 0),
      multiplier: Number(g.mult ?? 1),
      timeOfDay: Number(manualTodOverride ?? g.world?.timeOfDay ?? 0),
      player: {
        position: [px, py, pz],
        lane: Number(p.lane ?? 2),
        speed: Number(p.speed ?? 0),
        air: Number(p.air ?? 100),
        grounded: Boolean(p.grounded),
        rolling: Boolean(p.rolling),
        boosting: Boolean(p.boosting)
      },
      visiblePools: {
        groundVehicles: visibleVehicles.length,
        skyCars: skyUsed,
        bolts: boltUsed,
        powerups: powerUsed
      }
    };
    publishBeacon(evidence);
    (window as any).__AURA3D_SHOWCASE_ROADSTER_RUSH__ = {
      app: auraApp,
      evidence,
      triggerScenario
    };
  }

  function ensureLivePlaying(g: any): void {
    if (!g) return;
    if (g.mode !== "playing" || g.activePreset) {
      g.start?.();
    }
    g.activePreset = null;
    g.simPaused = false;
    g.paused = false;
    g.manual = false;
  }

  function triggerScenario(scenario: "freeway" | "sky" | "ramp" | "roll" | "rocket"): void {
    const g = (window as any).__GAME__?.game;
    if (!g) return;
    ensureLivePlaying(g);
    const p = g.player;
    if (!p) return;

    if (scenario === "freeway") {
      p.air = 100;
      g.hud?.popup?.("Sunset Freeway Live", 0, "cyan small");
      return;
    }

    if (scenario === "sky") {
      p.air = 100;
      const pz = Number(p.position?.z ?? 0);
      const lane = clamp(Number(p.lane ?? 2), 0, 4);
      p.setPose?.({ lane, y: 14.2, vy: 3.2, thrust: true });
      g.triggerAction?.("thrustHold", { duration: 1.65 });
      if (g.traffic?._spawnSky) {
        g.traffic._spawnSky(0, Math.max(0, lane - 1), 14.0, pz - 58, 1);
        g.traffic._spawnSky(1, Math.min(4, lane + 1), 14.4, pz - 72, 1);
        g.traffic._spawnSky(2, lane, 14.2, pz - 96, 1);
      }
      g.hud?.popup?.("Sky-Lane Dogfight!", 270, "cyan");
      return;
    }

    if (scenario === "ramp") {
      p.air = 100;
      const pz = Number(p.position?.z ?? 0);
      const lane = clamp(Number(p.lane ?? 2), 0, 4);
      p.setPose?.({ lane, y: 0, vy: 0, grounded: true });
      if (g.traffic?._placeVehicle) {
        // Clear any vehicle directly blocking the ramp approach in the player's lane
        const vehicles: any[] = g.traffic.vehicles || [];
        for (let i = vehicles.length - 1; i >= 0; i--) {
          const v = vehicles[i];
          if (v && v.lane === lane && v.z < pz + 5 && v.z > pz - 95) {
            g.traffic._recycleVehicleAt?.(i);
          }
        }
        const carrier = g.traffic._placeVehicle("carrier", lane, pz - 26, 4);
        if (carrier) {
          g.traffic._rampLine?.(carrier);
          let cursorZ = carrier.z - carrier.l * 0.5 - 2.2;
          for (const followType of ["boxtruck", "bus", "boxtruck"] as const) {
            const follow = g.traffic._placeVehicle(followType, lane, cursorZ, 3);
            if (follow) {
              g.traffic._roofLine?.(follow);
              cursorZ = follow.z - follow.l * 0.5 - 2.2;
            }
          }
        }
      }
      g.triggerAction?.("boost", { duration: 1.1 });
      g.hud?.popup?.("Carrier Ramp Ahead!", 150, "cyan");
      return;
    }

    if (scenario === "roll") {
      p.air = Math.max(Number(p.air ?? 100), 75);
      const lane = clamp(Number(p.lane ?? 2), 0, 4);
      g.triggerAction?.(lane < 2 ? "rollRight" : "rollLeft");
      return;
    }

    if (scenario === "rocket") {
      p.air = 100;
      g._pickup?.("rocket", 1, p.position);
    }
  }

  function bindToolbar(): void {
    const btnFreeway = document.getElementById("aura-btn-freeway");
    const btnSky = document.getElementById("aura-btn-sky");
    const btnRamp = document.getElementById("aura-btn-ramp");
    const btnRoll = document.getElementById("aura-btn-roll");
    const btnRocket = document.getElementById("aura-btn-rocket");
    const btnAuto = document.getElementById("aura-btn-auto") as HTMLButtonElement | null;
    const modeBtns = [btnFreeway, btnSky, btnRamp, btnRoll, btnRocket];
    const todBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-aura-tod]"));

    if (btnAuto) {
      btnAuto.classList.toggle("active", autopilot);
      btnAuto.addEventListener("click", () => {
        autopilot = !autopilot;
        btnAuto.classList.toggle("active", autopilot);
        btnAuto.blur();
      });
    }

    const setActiveBtn = (target: HTMLElement | null) => {
      for (const b of modeBtns) {
        b?.classList.toggle("active", b === target);
      }
    };

    btnFreeway?.addEventListener("click", () => {
      setActiveBtn(btnFreeway);
      triggerScenario("freeway");
    });
    btnSky?.addEventListener("click", () => {
      setActiveBtn(btnSky);
      triggerScenario("sky");
    });
    btnRamp?.addEventListener("click", () => {
      setActiveBtn(btnRamp);
      triggerScenario("ramp");
    });
    btnRoll?.addEventListener("click", () => {
      setActiveBtn(btnRoll);
      triggerScenario("roll");
    });
    btnRocket?.addEventListener("click", () => {
      setActiveBtn(btnRocket);
      triggerScenario("rocket");
    });

    for (const btn of todBtns) {
      btn.addEventListener("click", () => {
        for (const b of todBtns) b.classList.toggle("active", b === btn);
        const todVal = parseFloat(btn.dataset.auraTod ?? "0");
        manualTodOverride = Number.isFinite(todVal) ? todVal : 0;
        const g = (window as any).__GAME__?.game;
        g?.world?.setTimeOfDay?.(manualTodOverride);
      });
    }
  }

  bindToolbar();

  // Wait for all GLB assets & scene nodes to finish loading before starting simulation or setting ready flags
  await auraApp.ready();

  // Native Apex Overdrive simulation (apps/showcase-roadster-rush/src/native): fixed-step player, traffic, scoring and HUD
  // written for Aura3D; this page only mirrors that state onto the scene nodes below.
  const nativeGame = createNativeRoadster({
    hudRoot: document.getElementById("hud"),
    drawCalls: () => {
      try {
        return findDrawCalls(auraApp.diagnostics());
      } catch {
        return 0;
      }
    }
  });

  // Register Aura3D 60 FPS dynamic render loop callback after assets & simulation are ready
  const presenter = createRoadsterPresenter(() => nativeGame);
  nativeGame.afterStep = () => presenter.afterStep();
  auraApp.onFrame(() => {
    nativeGame.frameTick(performance.now());
    // draw the poses between the last two simulation steps (smooth on 120 and 144 Hz displays); manual and paused runs draw the exact latest step
    const live = !nativeGame.manual && !nativeGame.paused && !nativeGame.simPaused;
    syncRoadsterWorld(nativeGame, live ? viewOf(nativeGame, presenter.present(nativeGame, true)) : nativeGame);
  });

  // Ensure initial live playing state and first synchronous world sync
  ensureLivePlaying(nativeGame);
  syncRoadsterWorld(nativeGame);
  auraApp.step(1 / 60);
  document.getElementById("boot")?.classList.add("done");
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  auraApp.resume();
}

void bootRoadsterRushAura3D();
