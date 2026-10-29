import {
  camera,
  createAuraApp,
  effects,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraAssetRef,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createNativeRoadster, findDrawCalls } from "./native";
import { POWERUP_SECONDS } from "./native/constants";
import { GANTRY_COUNT } from "./native/world";
import { gantryBoxes } from "./render/gantry";
import { assets } from "./assets";
import { installBlackFrameGuard } from "@aura3d/debug";
import { SHIELD_SIZE, shieldSpec } from "./art/shield";
import { groundSpec } from "./art/ground";
import { meshyVehicles } from "./meshy-vehicles";
import { SKY_DOME_SIZE, skyLook, skySpec } from "./art/sky";
import { createCameraShake, createHitStop, installGameBeacon, warmPrograms } from "@aura3d/engine/game";
import { createRoadsterPresenter, viewOf } from "./native/presentation";
import { InstancePool, parked } from "./render/instancePool";
import {
  DRAW_WINDOW,
  NEAR_CAPACITY,
  POOL_CAPACITY,
  POWERUP_KINDS,
  VEHICLE_TYPES,
  assignGroundSlots,
  assignPickupSlots,
  emptyGroundSlots,
  emptyPickupSlots,
  nearestAhead,
  splitNearFar,
  trafficYawOffset,
  type PowerupKind,
  type VehicleType
} from "./render/pools";

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
let beaconFrames = 0;
/** The beacon copies the evidence object; publish every 10th frame (and on demand) instead of every frame (audit RR-E1). */
const publishBeacon = (evidence: object, force = false): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-roadster-rush", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__"] });
  if (!force && beaconFrames++ % 10 !== 0) return;
  gameBeacon.publishEvidence(evidence);
};

installBlackFrameGuard();

type Vec3 = [number, number, number];

const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];

const urlParams = new URLSearchParams(window.location.search);
/** Start the run at once only for demos and captures; everyone else gets the title card (audit RR-10). */
const AUTOSTART = ["autoplay", "demo", "capture"].some((k) => urlParams.get(k) === "1");
const REDUCED_MOTION = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Meshy model for a vehicle type when it is shipped and enabled (`?models=0` turns it off), else the original showcase asset. */
const pickVehicleAsset = (key: string, fallback: AuraAssetRef<"model">): AuraAssetRef<"model"> =>
  meshyVehicles.enabled && key in meshyVehicles.refs ? ((meshyVehicles.refs as Record<string, AuraAssetRef<"model">>)[key] as AuraAssetRef<"model">) : fallback;

const VEHICLE_ASSET: Record<VehicleType, { maxDim: number; role: "primaryVehicle" | "setDressing"; asset: AuraAssetRef<"model"> }> = {
  sedan: { maxDim: 4.64, role: "setDressing", asset: pickVehicleAsset("sedan", assets.roadsterRushSedan) },
  hatch: { maxDim: 4.04, role: "setDressing", asset: pickVehicleAsset("hatch", assets.roadsterRushHatch) },
  suv: { maxDim: 4.94, role: "setDressing", asset: pickVehicleAsset("suv", assets.roadsterRushSuv) },
  taxi: { maxDim: 4.74, role: "setDressing", asset: pickVehicleAsset("taxi", assets.roadsterRushTaxi) },
  van: { maxDim: 5.34, role: "setDressing", asset: pickVehicleAsset("van", assets.roadsterRushVan) },
  pickup: { maxDim: 5.58, role: "setDressing", asset: pickVehicleAsset("pickup", assets.roadsterRushPickup) },
  boxtruck: { maxDim: 8.14, role: "setDressing", asset: pickVehicleAsset("boxtruck", assets.roadsterRushBoxtruck) },
  bus: { maxDim: 12.22, role: "setDressing", asset: pickVehicleAsset("bus", assets.roadsterRushBus) },
  carrier: { maxDim: 16.12, role: "primaryVehicle", asset: pickVehicleAsset("carrier", assets.roadsterRushCarrier) }
};

/** Measured from the baked Meshy GLBs at fit size: visual width over sim width. Only the two wildly wide models need a lateral squash; the rest stay within 1.3x. */
const MODEL_WIDTH_OVER_SPEC: Partial<Record<VehicleType, number>> = { boxtruck: 1.72, carrier: 3.0 };
const MODEL_WIDTH_FIT = 1.25;
const TRAFFIC_YAW = trafficYawOffset(meshyVehicles.enabled);

const BRAKE_BAR_CAPACITY = 48;
const BLINKER_CAPACITY = 24;
/** Brake bars and blinkers are small; draw them for traffic up to this far ahead. */
const LIGHT_DETAIL_AHEAD = 140;

const LANE_DIVIDER_X: readonly number[] = [-5.4, -1.8, 1.8, 5.4];
/** 24 dashes per divider at 14 m cover the deck to 322 m ahead (was 14, ending 182 m ahead). */
const DASH_COUNT_PER_DIVIDER = 24;
const DASH_STRIDE_Z = 14;

/** Light poles: world-anchored rows every 34 m from one row behind the camera to about 320 m ahead, both sides. */
const POLE_ROWS = 11;
const POLE_STRIDE_Z = 34;

/** Skyline: world-anchored rows every 140 m, one row behind the camera and four ahead, so a building only recycles after it has passed the camera (audit RR-8). */
const SKYLINE_ROWS = 5;
const SKYLINE_STRIDE_Z = 140;

/** Overhead gantry geometry, built from the collision band so what crashes the car is what is drawn (audit RR-6). */
const GANTRY_BOXES = gantryBoxes();

/** Power-ups: each kind has its own shape (audit RR-E3) and the colour its HUD timer bar uses. */
const POWERUP_LOOK: Record<PowerupKind, { color: string; shape: "capsule" | "cone" | "sphere" | "torus" | "box"; size: Vec3 }> = {
  air: { color: "#2f7dff", shape: "capsule", size: [0.62, 1.15, 0.62] },
  rocket: { color: "#ff6a3d", shape: "cone", size: [0.8, 1.2, 0.8] },
  shield: { color: "#5fe6ff", shape: "sphere", size: [1.0, 1.0, 1.0] },
  magnet: { color: "#c06bff", shape: "torus", size: [1.0, 1.0, 0.34] },
  multiplier: { color: "#ffd24d", shape: "box", size: [0.78, 0.78, 0.78] }
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

/** Runtime node id of an instanced pool node. */
const poolId = (name: string): string => `pool-${name}`;

function buildRoadsterRushScene(): ReturnType<typeof scene> {
  const s = scene()
    // One look: its HDRI, its shadowed key light, its AO, bloom and colour grade. The authored warm sun below adds colour
    // without a second shadow map, and no second bloom or grade stacks on the look's (audit RR-11).
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
      lights.directional({
        color: "#ffb178",
        intensity: 1.9,
        position: [22, 38, -45],
        target: [0, 0, -10]
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
    .add(effects.vignette({ intensity: 0.2, smoothness: 0.65 }));

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

  // 2. Lane dashes, light poles, gantries and skyline: one instanced node each (audit RR-E1: these were 150+ separate nodes)
  s.addMany([
    instances
      .box({ name: "lane-dashes", size: [0.14, 0.02, 4.2], material: material.emissive({ color: "#f8fafc", emissive: "#e2e8f0", emissiveIntensity: 0.45 }), castShadow: false, transforms: parked(LANE_DIVIDER_X.length * DASH_COUNT_PER_DIVIDER) })
      .runtime(game.runtimeNode(poolId("dashes"))),
    instances
      .box({ name: "gantry-steel", size: [1, 1, 1], material: material.pbr({ color: "#64748b", metalness: 0.65, roughness: 0.38 }), transforms: parked(GANTRY_COUNT * 3) })
      .runtime(game.runtimeNode(poolId("gantry-steel"))),
    instances
      .box({ name: "gantry-boards", size: [1, 1, 1], material: material.pbr({ color: "#0d5c3a", roughness: 0.52, metalness: 0.12 }), transforms: parked(GANTRY_COUNT * 2) })
      .runtime(game.runtimeNode(poolId("gantry-boards"))),
    instances
      .box({ name: "gantry-trims", size: [1, 1, 1], material: material.emissive({ color: "#e2f1e8", emissive: "#a7f3d0", emissiveIntensity: 0.55 }), castShadow: false, transforms: parked(GANTRY_COUNT * 4) })
      .runtime(game.runtimeNode(poolId("gantry-trims"))),
    instances
      .cylinder({ name: "light-poles", size: [0.18, 7.6, 0.18], material: material.pbr({ color: "#475569", metalness: 0.7, roughness: 0.35 }), transforms: parked(POLE_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("poles"))),
    instances
      .box({ name: "light-arms", size: [1.8, 0.12, 0.12], material: material.pbr({ color: "#475569", metalness: 0.7, roughness: 0.35 }), castShadow: false, transforms: parked(POLE_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("pole-arms"))),
    instances
      .sphere({ name: "light-lamps", size: [0.36, 0.18, 0.48], material: material.emissive({ color: "#ffd28a", emissive: "#ffae52", emissiveIntensity: 1.65 }), castShadow: false, transforms: parked(POLE_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("pole-lamps"))),
    // The skyline model has 75 meshes; instancing draws all buildings in 75 calls, and it casts no shadow (it stands 42 m off the road).
    instances
      .model(assets.showcaseModernBuildingOne, { name: "freeway-skyline", role: "setDressing", scaleMode: "fit", targetMaxDimension: 38, castShadow: false, transforms: parked(SKYLINE_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("skyline")))
  ]);

  // 3. Player Roadster Assembly (Primary Car + Lightbar + Headlights + Cold-Gas Plumes + Powerups + Shadow)
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

  // 4. Ground traffic: per type, a shadow-casting pool for the first 90 m and a shadowless pool beyond, sized to the
  //    simulation's measured peaks (audit RR-1); plus carrier ramps, brake bars and turn signals.
  for (const vType of VEHICLE_TYPES) {
    const spec = VEHICLE_ASSET[vType];
    for (const part of ["near", "far"] as const) {
      s.add(
        instances
          .model(spec.asset, {
            name: `traffic-${vType}-${part}`,
            role: spec.role,
            scaleMode: "fit",
            targetMaxDimension: spec.maxDim,
            castShadow: part === "near",
            transforms: parked(part === "near" ? NEAR_CAPACITY[vType] : POOL_CAPACITY[vType])
          })
          .runtime(game.runtimeNode(poolId(`traffic-${vType}-${part}`)))
      );
    }
  }
  s.addMany([
    instances
      .box({ name: "carrier-ramps", size: [2.38, 0.18, 6.6], material: material.emissive({ color: "#ffc928", emissive: "#ff9e00", emissiveIntensity: 0.68 }), castShadow: false, transforms: parked(POOL_CAPACITY.carrier) })
      .runtime(game.runtimeNode(poolId("carrier-ramps"))),
    instances
      .box({ name: "traffic-brake-lights", size: [1.58, 0.16, 0.09], material: material.emissive({ color: "#ff1e27", emissive: "#ff1e27", emissiveIntensity: 2.1 }), castShadow: false, transforms: parked(BRAKE_BAR_CAPACITY) })
      .runtime(game.runtimeNode(poolId("brake-lights"))),
    instances
      .sphere({ name: "traffic-blinkers", size: [0.28, 0.2, 0.34], material: material.emissive({ color: "#ffaa1d", emissive: "#ff9900", emissiveIntensity: 2.2 }), castShadow: false, transforms: parked(BLINKER_CAPACITY) })
      .runtime(game.runtimeNode(poolId("blinkers")))
  ]);

  // 5. Sky-lane traffic: lethal, so every sky car in the window gets a slot (audit RR-1)
  s.addMany([
    instances
      .model(assets.roadsterRushSkyCar, { name: "sky-cars", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 4.3, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-cars"))),
    instances
      .cylinder({ name: "sky-plumes", size: [0.42, 1.65, 0.42], material: rearPlumeMat, castShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-plumes"))),
    instances
      .torus({ name: "sky-halos", size: [1.55, 1.55, 0.075], material: material.emissive({ color: "#ff2a3c", emissive: "#ff2a3c", emissiveIntensity: 1.65 }), castShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-halos")))
  ]);

  // 6. Pickups: every bolt in the window, nearest first (audit RR-4), and one shaped pool per power-up kind (audit RR-E3)
  s.add(
    instances
      .torus({ name: "pickup-bolts", size: [0.48, 0.48, 0.14], material: material.emissive({ color: "#ffc61f", emissive: "#ffae00", emissiveIntensity: 1.45 }), castShadow: false, transforms: parked(POOL_CAPACITY.bolt) })
      .runtime(game.runtimeNode(poolId("bolts")))
  );
  for (const kind of POWERUP_KINDS) {
    const look = POWERUP_LOOK[kind];
    s.add(
      instances[look.shape]({
        name: `pickup-${kind}`,
        size: look.size,
        material: material.emissive({ color: look.color, emissive: look.color, emissiveIntensity: 1.75 }),
        castShadow: false,
        transforms: parked(POOL_CAPACITY.powerup[kind])
      }).runtime(game.runtimeNode(poolId(`power-${kind}`)))
    );
  }

  return s;
}

function showBootError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Apex Overdrive failed to start", error);
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.classList.remove("done");
  boot.classList.add("boot-failed");
  boot.innerHTML = `<div class="boot-mark">Apex Overdrive</div><div class="boot-error" role="alert"><p>The game could not start.</p><p class="boot-error-detail"></p><button type="button" class="boot-retry">Reload</button></div>`;
  const detail = boot.querySelector(".boot-error-detail");
  if (detail) detail.textContent = message.slice(0, 240);
  boot.querySelector(".boot-retry")?.addEventListener("click", () => window.location.reload());
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
  const pool = (name: string, capacity: number) => new InstancePool(req(poolId(name)), capacity);

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

  const dashPool = pool("dashes", LANE_DIVIDER_X.length * DASH_COUNT_PER_DIVIDER);
  const gantrySteel = pool("gantry-steel", GANTRY_COUNT * 3);
  const gantryBoards = pool("gantry-boards", GANTRY_COUNT * 2);
  const gantryTrims = pool("gantry-trims", GANTRY_COUNT * 4);
  const polePool = pool("poles", POLE_ROWS * 2);
  const armPool = pool("pole-arms", POLE_ROWS * 2);
  const lampPool = pool("pole-lamps", POLE_ROWS * 2);
  const skylinePool = pool("skyline", SKYLINE_ROWS * 2);

  const trafficNear = {} as Record<VehicleType, InstancePool>;
  const trafficFar = {} as Record<VehicleType, InstancePool>;
  for (const vType of VEHICLE_TYPES) {
    trafficNear[vType] = pool(`traffic-${vType}-near`, NEAR_CAPACITY[vType]);
    trafficFar[vType] = pool(`traffic-${vType}-far`, POOL_CAPACITY[vType]);
  }
  const rampPool = pool("carrier-ramps", POOL_CAPACITY.carrier);
  const brakePool = pool("brake-lights", BRAKE_BAR_CAPACITY);
  const blinkerPool = pool("blinkers", BLINKER_CAPACITY);
  const skyCarPool = pool("sky-cars", POOL_CAPACITY.skyCar);
  const skyPlumePool = pool("sky-plumes", POOL_CAPACITY.skyCar);
  const skyHaloPool = pool("sky-halos", POOL_CAPACITY.skyCar);
  const boltPool = pool("bolts", POOL_CAPACITY.bolt);
  const powerPools = {} as Record<PowerupKind, InstancePool>;
  for (const kind of POWERUP_KINDS) powerPools[kind] = pool(`power-${kind}`, POOL_CAPACITY.powerup[kind]);

  // Scratch lists reused every frame (audit RR-E1: no per-frame filter/sort arrays)
  const groundSlots = emptyGroundSlots<any>();
  const pickupSlots = emptyPickupSlots<any>();
  const skySlots: any[] = [];
  const nearScratch: any[] = [];
  const farScratch: any[] = [];

  // State Tracking
  let autopilot = urlParams.get("autoplay") === "1" || urlParams.get("demo") === "1";
  let framesRendered = 0;
  let lastTodBucket = -1;
  let manualTodOverride: number | null = null;
  let lastLightbarHot = false;
  let lastAutopilotTickMs = 0;
  let lastAutopilotStuntMs = 0;
  let gameOverSinceMs = 0;

  // Camera feel (audit RR-E2): trauma shake from the player's shake pulses, a speed FOV kick, a lagging chase anchor and a
  // short hit-stop on a crash. Reduced motion turns shake and FOV kick off.
  const shake = createCameraShake({ maxOffset: 0.22, maxRoll: 0.02, decayPerSecond: 1.8 });
  const hitStop = createHitStop();
  let hitStopHeld = false;
  let lastMode = "";
  let chaseX = 0;
  let lastFrameMs = 0;
  let lastFovKick = -1;

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

    let groundHex: string;
    if (tod <= 0.5) groundHex = lerpHexColor("#190f24", "#100d1e", tod * 2);
    else groundHex = lerpHexColor("#100d1e", "#070912", (tod - 0.5) * 2);
    const [gr, gg, gb] = hexToRgb(groundHex);
    outerGroundHandle.setUniform?.("groundColor", [gr / 255, gg / 255, gb / 255] as never);
    outerGroundHandle.setUniform?.("groundFogColor", [look.skyHorizon[0] * 0.8, look.skyHorizon[1] * 0.75, look.skyHorizon[2] * 0.8] as never);
    // Scene light follows the time of day (audit RR-E5). Light intensities are fixed at mount (no runtime light setter), so
    // the output exposure carries the change: 1 at sunset (unchanged frame), 0.8 at night. It multiplies the look's grade.
    try {
      auraApp.setOutput?.({ exposure: lerp(1, 0.8, look.nightAmount) });
    } catch {
      /* output surface not mounted */
    }
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
    // an autopiloted run is an assisted run: it cannot set the saved best (audit RR-7)
    g.markAssisted?.();
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

    const nowMs = performance.now();
    const realDt = lastFrameMs ? clamp((nowMs - lastFrameMs) / 1000, 0, 0.1) : 1 / 60;
    lastFrameMs = nowMs;

    const p = g.player;
    const px = Number(p.position?.x ?? 0);
    const py = Number(p.position?.y ?? 0);
    const pz = Number(p.position?.z ?? 0);
    const simTime = Number(g.time ?? performance.now() * 0.001);

    // Camera feel: consume the simulation's shake pulses (they are never read by the simulation itself)
    const pulse = Number(real.player.shakePulse ?? 0);
    if (pulse > 0) {
      if (!REDUCED_MOTION) shake.add(pulse * 0.6);
      real.player.shakePulse = 0;
    }
    const sh = shake.update(realDt);
    if (real.mode === "crashed" && lastMode === "playing" && !real.manual) hitStop.trigger(110);
    lastMode = real.mode;
    hitStop.update(realDt);
    if (hitStop.active !== hitStopHeld) {
      hitStopHeld = hitStop.active;
      real.simPaused = hitStopHeld;
    }
    const fovKick = REDUCED_MOTION ? 0 : Math.round(clamp(Number(p.speedLinesAmount ?? 0), 0, 1) * 7 * 10) / 10;
    if (fovKick !== lastFovKick) {
      lastFovKick = fovKick;
      try {
        auraApp.camera?.fovKick.set("speed", fovKick, 0.18);
      } catch {
        /* camera controller not mounted */
      }
    }

    // Camera-anchored relative transform: the @aura3d/engine camera sits at [0, 3.6, 6.2] looking at [0, 0.9, -6.0].
    // World coordinates are shifted by the chase anchor, so the player car stays in front of the camera while the freeway,
    // traffic, sky cars and bolts move past. The anchor lags lane changes a little, rises with altitude and carries the shake.
    const targetX = px * 0.65;
    chaseX = real.manual ? targetX : chaseX + (targetX - chaseX) * (1 - Math.exp(-9 * realDt));
    const camAnchorX = chaseX + sh.x;
    const camAnchorY = Math.max(0, py * 0.85) + sh.y;
    const rx = (wx: number) => wx - camAnchorX;
    const ry = (wy: number) => wy - camAnchorY;
    const rz = (wz: number) => wz - pz;

    // 1. Freeway deck, walls and trims
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

    dashPool.begin();
    const dashBaseZ = Math.floor(pz / DASH_STRIDE_Z) * DASH_STRIDE_Z + DASH_STRIDE_Z;
    for (let d = 0; d < LANE_DIVIDER_X.length; d++) {
      const lx = rx(LANE_DIVIDER_X[d]!);
      for (let i = 0; i < DASH_COUNT_PER_DIVIDER; i++) dashPool.add(lx, ry(0.015), rz(dashBaseZ - i * DASH_STRIDE_Z));
    }
    dashPool.commit();

    // Overhead sign gantries: one per collidable world slot (audit RR-2); empty slots are not drawn
    gantrySteel.begin();
    gantryBoards.begin();
    gantryTrims.begin();
    const worldGantries: any[] = Array.isArray(g.world?.gantries) ? g.world.gantries : [];
    for (let i = 0; i < worldGantries.length; i++) {
      const wz = Number(worldGantries[i]?.position?.z ?? 1e5);
      if (wz > 1e4) continue;
      const gz = rz(wz);
      if (gz < -560 || gz > 40) continue;
      for (const box of GANTRY_BOXES) {
        const target = box.part === "steel" ? gantrySteel : box.part === "board" ? gantryBoards : gantryTrims;
        target.add(rx(box.center[0]), ry(box.center[1]), gz + box.center[2], 0, 0, 0, box.size[0], box.size[1], box.size[2]);
      }
    }
    gantrySteel.commit();
    gantryBoards.commit();
    gantryTrims.commit();

    // Highway light poles, world-anchored rows
    polePool.begin();
    armPool.begin();
    lampPool.begin();
    const poleBaseZ = Math.floor(pz / POLE_STRIDE_Z) * POLE_STRIDE_Z + POLE_STRIDE_Z - 14;
    for (let row = 0; row < POLE_ROWS; row++) {
      const poleZ = rz(poleBaseZ - row * POLE_STRIDE_Z);
      for (const side of [-1, 1] as const) {
        const poleX = rx(side * 12.1);
        polePool.add(poleX, ry(3.8), poleZ);
        armPool.add(poleX - side * 0.8, ry(7.55), poleZ);
        lampPool.add(poleX - side * 1.55, ry(7.45), poleZ);
      }
    }
    polePool.commit();
    armPool.commit();
    lampPool.commit();

    // Skyline, world-anchored rows from one behind the camera to four ahead (audit RR-8)
    skylinePool.begin();
    const skylineBaseZ = Math.floor(pz / SKYLINE_STRIDE_Z) * SKYLINE_STRIDE_Z;
    for (let row = -1; row < SKYLINE_ROWS - 1; row++) {
      const sz = rz(skylineBaseZ - 65 - row * SKYLINE_STRIDE_Z);
      skylinePool.add(rx(-42), ry(-0.2), sz);
      skylinePool.add(rx(42), ry(-0.2), sz);
    }
    skylinePool.commit();

    updateAtmosphereForTod(Number(g.world?.timeOfDay ?? 0));

    // 3. Sync Player Roadster Assembly, Thruster Plumes, Active Powerups & Contact Shadow
    const pitch = Number(p.pivot?.rotation?.x ?? p._pitch ?? 0);
    const yaw = Number(p.mesh?.rotation?.y ?? p._yaw ?? 0);
    const roll = Number(p.pivot?.rotation?.z ?? p._bank ?? 0) + sh.roll;
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

    // Cold-Gas Thruster Plumes (no 8.8 Hz flicker under reduced motion, audit RR-E4)
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
    const flicker = REDUCED_MOTION ? 1 : 0.92 + Math.sin(simTime * 55) * 0.08;
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
      // Fades in over the first 0.25 s, then blinks over the last 1.5 s so the player can read it running out
      // (under reduced motion it dims steadily instead of blinking).
      const shieldFade = Math.min(1, (POWERUP_SECONDS.shield - shieldLeft) / 0.25 + 0.3);
      const shieldBlink = shieldLeft < 1.5 ? (REDUCED_MOTION ? 0.4 + 0.4 * (shieldLeft / 1.5) : 0.55 + 0.45 * Math.sin(simTime * 22)) : 1;
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

    // 4. Ground traffic: every vehicle in the window, in its own type's pool (audit RR-1), facing its travel direction (RR-3)
    const rawVehicles: any[] = Array.isArray(g.traffic?.vehicles) ? g.traffic.vehicles : [];
    assignGroundSlots(rawVehicles, pz, groundSlots);
    rampPool.begin();
    brakePool.begin();
    blinkerPool.begin();
    const blinkOn = (simTime * 2.8) % 1 < 0.55;
    let groundDrawn = 0;
    for (const vType of VEHICLE_TYPES) {
      const near = trafficNear[vType];
      const far = trafficFar[vType];
      near.begin();
      far.begin();
      splitNearFar(groundSlots[vType], pz, NEAR_CAPACITY[vType], nearScratch, farScratch);
      const widthScale = Math.min(1, MODEL_WIDTH_FIT / ((meshyVehicles.enabled ? MODEL_WIDTH_OVER_SPEC[vType] : undefined) ?? 1));
      for (let part = 0; part < 2; part++) {
        const list = part === 0 ? nearScratch : farScratch;
        const target = part === 0 ? near : far;
        for (let i = 0; i < list.length; i++) {
          const v = list[i];
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

          if (!target.add(vx, ry(Math.max(0, hopY)), vz, -vpitch, vyaw + TRAFFIC_YAW, -vroll, widthScale, 1, 1)) continue;
          groundDrawn++;

          // Sloped golden launch ramp at the carrier's rear (+z end; the front points along -z)
          if (vType === "carrier") {
            const rampH = Number(v.ramp?.height ?? v.roof ?? 3.0);
            const rampLen = Number(v.ramp?.length ?? 6.0);
            const rampPitch = Math.atan2(rampH, rampLen);
            rampPool.add(vx, ry(hopY + rampH * 0.48), vz + vl * 0.5 - rampLen * 0.48, rampPitch, vyaw, vroll);
          }
          const ahead = pz - Number(v.z ?? 0);
          if (ahead > LIGHT_DETAIL_AHEAD) continue;
          // Brake light bars at the rear
          if (isBraking) brakePool.add(vx, ry(hopY + (isHeavy ? 0.95 : 0.72)), vz + vl * 0.5 + 0.06, vpitch, vyaw, vroll, vw / 1.9, 1, 1);
          // Blinking turn signal at the front corner on the side the vehicle is moving to
          const changer = v.changer;
          if (changer && (changer.state === 1 || changer.state === 2) && blinkOn) {
            const dirSign = Number(changer.dir || 1);
            blinkerPool.add(vx + dirSign * (vw * 0.5 + 0.08), ry(hopY + 0.68), vz - vl * 0.35, 0, vyaw, 0);
          }
        }
      }
      near.commit();
      far.commit();
    }
    rampPool.commit();
    brakePool.commit();
    blinkerPool.commit();

    // 5. Sky-lane cars, nearest ahead first; every one in the window gets a slot
    const rawSkyCars: any[] = Array.isArray(g.traffic?.skyCars) ? g.traffic.skyCars : [];
    nearestAhead(rawSkyCars, pz, DRAW_WINDOW.skyCars, POOL_CAPACITY.skyCar, skySlots);
    skyCarPool.begin();
    skyPlumePool.begin();
    skyHaloPool.begin();
    for (let i = 0; i < skySlots.length; i++) {
      const sc = skySlots[i];
      const sx = rx(Number(sc.x ?? 0));
      const sy = ry(Number(sc.y ?? 12));
      const sz = rz(Number(sc.z ?? 0));
      const srx = Number(sc.rx ?? 0);
      const srz = Number(sc.rz ?? 0);
      const oncoming = Number(sc.dir ?? 1) > 0;
      skyCarPool.add(sx, sy, sz, srx, oncoming ? 0 : Math.PI, srz);
      const tailZ = oncoming ? sz - 2.35 : sz + 2.35;
      skyPlumePool.add(sx, sy + 0.45, tailZ, oncoming ? -Math.PI * 0.5 : Math.PI * 0.5, 0, 0, 0.9, 1.2 * flicker, 0.9);
      if (oncoming) skyHaloPool.add(sx, sy + 0.55, sz + 2.15, 0, 0, REDUCED_MOTION ? 0 : simTime * 4);
    }
    skyCarPool.commit();
    skyPlumePool.commit();
    skyHaloPool.commit();

    // 6. Bolts and power-ups, nearest ahead first (audit RR-4)
    const rawPickups: any[] = Array.isArray(g.traffic?.pickups) ? g.traffic.pickups : [];
    assignPickupSlots(rawPickups, pz, pickupSlots);
    boltPool.begin();
    for (let i = 0; i < pickupSlots.bolts.length; i++) {
      const pk = pickupSlots.bolts[i];
      const phase = Number(pk.phase ?? 0);
      const bob = pk.magnet ? 0 : Math.sin(simTime * 2.8 + phase) * 0.15;
      const s = pk.magnet ? 0.82 : 1.0;
      boltPool.add(rx(Number(pk.x ?? 0)), ry(Number(pk.y ?? 1) + bob), rz(Number(pk.z ?? 0)), 0, simTime * 3.4 + phase, Math.PI * 0.12, s, s, s);
    }
    boltPool.commit();
    let powerDrawn = 0;
    for (const kind of POWERUP_KINDS) {
      const target = powerPools[kind];
      target.begin();
      const list = pickupSlots.powerups[kind];
      for (let i = 0; i < list.length; i++) {
        const pk = list[i];
        const phase = Number(pk.phase ?? 0);
        const bob = pk.magnet ? 0 : Math.sin(simTime * 2.8 + phase) * 0.15;
        const spin = simTime * 3.4 + phase;
        // the multiplier cube tumbles; the other shapes spin upright
        const tilt = kind === "multiplier" ? spin * 0.5 : 0;
        if (target.add(rx(Number(pk.x ?? 0)), ry(Number(pk.y ?? 1) + bob), rz(Number(pk.z ?? 0)), tilt, spin, 0)) powerDrawn++;
      }
      target.commit();
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
      assisted: Boolean(real.assisted),
      score: Math.floor(Number(g.score ?? 0)),
      distance: Math.floor(Number(g.distance ?? 0)),
      bolts: Number(g.bolts ?? 0),
      multiplier: Number(g.mult ?? 1),
      timeOfDay: Number(manualTodOverride ?? g.world?.timeOfDay ?? 0),
      trafficYawOffset: TRAFFIC_YAW,
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
        groundVehicles: groundDrawn,
        skyCars: skySlots.length,
        bolts: pickupSlots.bolts.length,
        powerups: powerDrawn
      },
      drawn: drawnWithin(120, pz, worldGantries)
    };
    publishBeacon(evidence);
    (window as any).__AURA3D_SHOWCASE_ROADSTER_RUSH__ = {
      app: auraApp,
      evidence,
      triggerScenario
    };
  }

  /** Drawn entity counts within `ahead` metres in front of the player, for the capture probe (same shape on every build). */
  function drawnWithin(ahead: number, pz: number, gantrySlots: readonly { position?: { z?: number } }[]): Record<string, number> {
    const within = (list: readonly { z: number }[]): number => {
      let n = 0;
      for (const item of list) {
        const d = pz - item.z;
        if (d >= 0 && d <= ahead) n++;
      }
      return n;
    };
    let ground = 0;
    let heavy = 0;
    for (const t of VEHICLE_TYPES) {
      const n = within(groundSlots[t]);
      ground += n;
      if (t === "boxtruck" || t === "bus" || t === "carrier") heavy += n;
    }
    let powerups = 0;
    for (const k of POWERUP_KINDS) powerups += within(pickupSlots.powerups[k]);
    let gantries = 0;
    for (const slot of gantrySlots) {
      const z = Number(slot?.position?.z ?? 1e5);
      if (z < 1e4 && pz - z >= 0 && pz - z <= ahead) gantries++;
    }
    return { ground, heavy, sky: within(skySlots), bolts: within(pickupSlots.bolts), powerups, gantries };
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
    // scenario buttons refill air, grant rockets or teleport: the run is assisted and cannot set the saved best (audit RR-7)
    g.markAssisted?.();
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
    const modeBtns = [btnFreeway, btnSky, btnRamp];
    const todBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-aura-tod]"));

    if (btnAuto) {
      btnAuto.classList.toggle("active", autopilot);
      btnAuto.setAttribute("aria-pressed", String(autopilot));
      btnAuto.addEventListener("click", () => {
        autopilot = !autopilot;
        btnAuto.classList.toggle("active", autopilot);
        btnAuto.setAttribute("aria-pressed", String(autopilot));
        if (autopilot) (window as any).__GAME__?.game?.markAssisted?.();
        btnAuto.blur();
      });
    }

    const setActiveBtn = (target: HTMLElement | null) => {
      for (const b of modeBtns) {
        b?.classList.toggle("active", b === target);
      }
    };
    /** One-shot actions flash briefly and drop focus, so they never look held on (audit RR-14). */
    const momentary = (btn: HTMLElement | null, run: () => void) => {
      btn?.addEventListener("click", () => {
        run();
        btn.classList.add("active");
        window.setTimeout(() => btn.classList.remove("active"), 260);
        (btn as HTMLButtonElement).blur();
      });
    };

    btnFreeway?.addEventListener("click", () => {
      setActiveBtn(btnFreeway);
      triggerScenario("freeway");
      btnFreeway.blur();
    });
    btnSky?.addEventListener("click", () => {
      setActiveBtn(btnSky);
      triggerScenario("sky");
      btnSky.blur();
    });
    btnRamp?.addEventListener("click", () => {
      setActiveBtn(btnRamp);
      triggerScenario("ramp");
      btnRamp.blur();
    });
    momentary(btnRoll, () => triggerScenario("roll"));
    momentary(btnRocket, () => triggerScenario("rocket"));

    for (const btn of todBtns) {
      btn.addEventListener("click", () => {
        for (const b of todBtns) b.classList.toggle("active", b === btn);
        const todVal = parseFloat(btn.dataset.auraTod ?? "0");
        manualTodOverride = Number.isFinite(todVal) ? todVal : 0;
        const g = (window as any).__GAME__?.game;
        g?.world?.setTimeOfDay?.(manualTodOverride);
        btn.blur();
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

  // Demos and captures start the run at once; everyone else sees the title card (goal, controls, best) and starts it.
  if (AUTOSTART) ensureLivePlaying(nativeGame);
  syncRoadsterWorld(nativeGame);
  // Compile every program (and wait for the environment) before the boot veil lifts (checklist R2)
  await warmPrograms(auraApp);
  document.getElementById("boot")?.classList.add("done");
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  auraApp.resume();
}

bootRoadsterRushAura3D().catch(showBootError);
