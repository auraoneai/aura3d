import {
  camera,
  createAuraApp,
  effects,
  game,
  gameFeel,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  text3D,
  type AuraAssetRef,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  APEX_BLOOM,
  APEX_FOG_DENSITY_SCALE,
  APEX_GOD_RAY_DENSITY,
  APEX_GRADE,
  APEX_IBL_HDRI,
  APEX_IBL_ROTATION_DEG,
  APEX_LOOK,
  APEX_MOTION_BLUR,
  APEX_PALETTE,
  APEX_PRACTICALS,
  APEX_SUN,
  apexLookAt,
  hexToUnit,
  parseTodParam
} from "./art/look";
import { apexFlash, apexFlashAlpha, apexPostPlan, applyApexPostPlan, type ApexFlashKind } from "./art/post";
import { APEX_LUT_INTENSITY, apexGradePatch } from "./art/lut";
import { createNativeRoadster, findDrawCalls } from "./native";
import { POWERUP_SECONDS } from "./native/constants";
import { GANTRY_COUNT } from "./native/world";
import { gantryBoxes } from "./render/gantry";
import { assets } from "./assets";
import { installBlackFrameGuard } from "@aura3d/debug";
import { SHIELD_SIZE, shieldSpec } from "./art/shield";
import { HAZE_FLOOR_Y, groundSpec } from "./art/ground";
import { asphaltMaterial, concreteMaterial } from "./art/surfaces";
import { apexHeroPaint, apexRivalPaint } from "./art/paint";
import { PYLON_KIT, PYLON_ROWS, pylonLayout } from "./render/pylons";
import {
  BILLBOARD_FACE_SIZE,
  BILLBOARD_FRAME_SIZE,
  BILLBOARD_SLOTS,
  GANTRY_LABELS,
  GANTRY_LABEL_OFFSET,
  RING_ROWS,
  RING_SIZE,
  SPAN_DECK_SIZE,
  SPAN_PIER_SIZE,
  SPAN_SLOTS,
  billboardLayout,
  ringLayout,
  spanLayout
} from "./render/dressing";
import { TOWER_CAPACITY_PER_VARIANT, TOWER_VARIANTS, towerGlassSpec, towerLayout, type TowerVariant } from "./render/towers";
import { meshyFarVehicles, meshyVehicles } from "./meshy-vehicles";
import { SKY_DOME_SIZE, skyLook, skySpec } from "./art/sky";
import { createCameraShake, createHitStop, installGameBeacon, warmPrograms } from "@aura3d/engine/game";
import { createRoadsterPresenter, displayRoll, viewOf } from "./native/presentation";
import { apexSpeedLines, apexVfxEvents, countSkyDodges, type ApexVfxFrame } from "./render/vfxDirector";
import { APEX_CHASE_POSE, SLOW_MO_SECONDS, apexTitleDurationSeconds, apexTitleSequence, chaseCameraOffsets, createApexSlowMo } from "./render/cinematics";
import { registerApexVfx } from "./art/vfx";
import { InstancePool, parked } from "./render/instancePool";
import { apexQaCrops, type QaCrop } from "./render/qa";
import {
  DRAW_WINDOW,
  NEAR_CAPACITY,
  SHADOW_NEAR,
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
/** `?tod=sunset|dusk|night|0..1` pins the presented time of day (capture variants); presentation only, like the quick bar. */
const TOD_PARAM = parseTodParam(urlParams.get("tod"));
/** Reduced flash (PRD §6.3): reduced motion or `?flash=0` skips the output-overlay flashes. */
const REDUCED_FLASH = REDUCED_MOTION || urlParams.get("flash") === "0";
const COARSE_POINTER = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
/** AO-H1: the Showcase chip (scenario and time-of-day buttons) exists only for developers and captures. */
const SHOWCASE_CHIP = ["dev", "capture"].some((k) => urlParams.get(k) === "1");
/**
 * AO-P1: the game's own display LUT (src/art/lut.ts, written by tools/make-apex-lut.ts), served beside the app like the CC0
 * deck textures; E-C fetches it once and binds it in the S10b display grade (identity until it arrives).
 */
const APEX_LUT_URL = new URL("./assets/luts/apex-bluehour.cube", import.meta.url).pathname;

/** Meshy model for a vehicle type when it is shipped and enabled (`?models=0` turns it off), else the original showcase asset. */
const pickVehicleAsset = (key: string, fallback: AuraAssetRef<"model">): AuraAssetRef<"model"> =>
  meshyVehicles.enabled && key in meshyVehicles.refs ? ((meshyVehicles.refs as Record<string, AuraAssetRef<"model">>)[key] as AuraAssetRef<"model">) : fallback;

/** Far-LOD Meshy model for a traffic type (drawn beyond 90 m); the `?models=0` fallbacks have no far LOD. */
const pickFarVehicleAsset = (key: VehicleType, near: AuraAssetRef<"model">): AuraAssetRef<"model"> =>
  meshyVehicles.enabled && key in meshyFarVehicles.refs ? ((meshyFarVehicles.refs as Record<string, AuraAssetRef<"model">>)[key] as AuraAssetRef<"model">) : near;

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

/** AO-L3 practical intensities at full night (phase 2 calibrates against the night bottom-centre cell). */
const SODIUM_INTENSITY = 26;
const HEADLIGHT_INTENSITY = 18;

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

/** AO-E2: steel parapet rail on each Jersey barrier (the old 2.5 m sound walls hid the drop to the haze floor). */
const PARAPET_X = 10.6;
const PARAPET_Y = 1.16;
const PARAPET_RAIL_SIZE: Vec3 = [0.16, 0.14, 380];
/** The LED trims sit on the barrier tops, inside the rails. */
const TRIM_X = 10.32;
const TRIM_Y = 1.07;


/** Overhead gantry geometry, built from the collision band so what crashes the car is what is drawn (audit RR-6). */
const GANTRY_BOXES = gantryBoxes();

/** Power-ups: each kind has its own shape (audit RR-E3) and the colour its HUD timer bar uses. */
const POWERUP_LOOK: Record<PowerupKind, { color: string; shape: "capsule" | "cone" | "sphere" | "torus" | "box"; size: Vec3 }> = {
  air: { color: "#2f7dff", shape: "capsule", size: [0.62, 1.15, 0.62] },
  rocket: { color: "#ff6a3d", shape: "cone", size: [0.8, 1.2, 0.8] },
  shield: { color: "#5fe6ff", shape: "sphere", size: [1.0, 1.0, 1.0] },
  magnet: { color: "#c8d2e0", shape: "torus", size: [1.0, 1.0, 0.34] },
  multiplier: { color: "#ffd24d", shape: "box", size: [0.78, 0.78, 0.78] }
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
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
}

/** Runtime node id of an instanced pool node. */
const poolId = (name: string): string => `pool-${name}`;

/** Runtime ids of the look's key light and the camera-side fill (AO-L2 retunes both per time of day with setLight). */
const KEY_LIGHT_ID = "apex-sun-key";
const FILL_LIGHT_ID = "apex-camera-fill";
const SUN_FLARE_ID = "apex-sun-flare";

/** Where the dome draws the sun (inside the 760 m dome; the camera stays at the origin and the world moves past it). */
function sunWorldPosition(tod: number): Vec3 {
  const d = apexLookAt(tod).sunDir;
  return [d[0] * 340, d[1] * 340, d[2] * 340];
}

/**
 * GU47 AO-L1: one golden-hour look whose sun sits where the dome draws the disc (7 deg, azimuth 175: dead ahead), so key,
 * disc and shadows agree; its HDRI lights the scene without being drawn (the dome is the sky). The key light gets a runtime
 * id so the time of day can retune it (AO-L2); no ambient light, no cyan point (look-lint ambient-flattens).
 */
function apexLookNode(): AuraSceneNode {
  const sunset = APEX_LOOK[0];
  const look = looks
    .preset("golden-hour", {
      sun: APEX_SUN,
      fogDensityScale: APEX_FOG_DENSITY_SCALE,
      hdri: APEX_IBL_HDRI,
      environmentIntensity: sunset.environmentIntensity,
      environmentRotationDeg: APEX_IBL_ROTATION_DEG,
      background: APEX_PALETTE.charcoal,
      // AO-L4: 3 cascades to 140 m with PCSS soft shadows (the tier table drops to 1 cascade / PCF on Low)
      key: { color: sunset.sun.color, intensity: sunset.sun.intensity, shadow: { cascades: 3, maxDistance: 140, filter: "pcss", mapSize: 2048 } },
      // AO-E3: the preset's 30/180 range under the 0.7 density scale = near 43 / far 257; colour follows the time of day
      fog: { color: sunset.fog.color, near: 30, far: 180 },
      // AO-P1: the game's own grade replaces the look's (one grade stage); the white balance follows the time of day
      grade: { contrast: APEX_GRADE.contrast, saturation: APEX_GRADE.saturation, temperature: sunset.grade.temperature, tint: sunset.grade.tint },
      // AO-P2: racer bloom for the corona, brake bars, plumes and lamps (the look's one bloom node, retuned)
      post: { bloom: { intensity: APEX_BLOOM.intensity, threshold: APEX_BLOOM.threshold, scatter: APEX_BLOOM.scatter } }
    })
    .toJSON();
  const children = (look.children ?? []).map((child) =>
    child.kind === "light" && child.name === "look key light" ? ({ ...child, runtime: { id: KEY_LIGHT_ID } } as AuraSceneNode) : child
  );
  return { ...look, children } as AuraSceneNode;
}

function buildRoadsterRushScene(): ReturnType<typeof scene> {
  const s = scene()
    // One look: its IBL, its one shadowed key light, its AO, bloom and colour grade; nothing authored stacks a second bloom,
    // grade or shadowed light on it (audit RR-11, GU47 AO-L1).
    .add(apexLookNode())
    .background(APEX_PALETTE.charcoal)
    .camera(
      camera.perspective({
        fov: 58,
        near: 0.25,
        far: 550,
        position: [0, 3.6, 6.2],
        target: [0, 0.9, -6.0]
      })
    )
    // Camera-side fill: the sun is dead ahead, so the faces the chase camera sees are lit by this unshadowed 0.6 fill from
    // behind the camera (cobalt skylight colour), not by an ambient term.
    .add(
      lights
        .directional({
          name: FILL_LIGHT_ID,
          color: APEX_LOOK[0].fill.color,
          intensity: APEX_LOOK[0].fill.intensity,
          position: [0, 9, 40],
          target: [0, 0, -12],
          shadow: false
        })
        .runtime({ id: FILL_LIGHT_ID })
    )
    .add(effects.vignette({ intensity: 0.2, smoothness: 0.65 }))
    // AO-L4: screen-space contact shadows from the sun replace the black disc under the hero
    .add(effects.contactShadows({ length: 0.3, thickness: 0.05, steps: 12, intensity: 0.9, lights: "sun" }))
    // AO-P3 / AO-P4: motion blur (S7) and god rays through the haze (S4). art/post.ts switches both per tier: High and Ultra
    // only, never on a phone, and motion blur never under reduced motion. The inscatter density stays tiny: the look fog owns
    // the haze, this node only feeds the shafts (godRayDensity is decoupled from fog density, E-C EC-8).
    .add(effects.motionBlur({ shutter: APEX_MOTION_BLUR, maxBlur: 24 }))
    .add(effects.volumetricFog({ density: 0.004, color: APEX_LOOK[0].dome.sun, intensity: 0.45, godRayDensity: APEX_GOD_RAY_DENSITY }));
  // AO-P3: the low sun's lens flare in the identity palette; skipped under reduced motion, hidden at night.
  if (!REDUCED_MOTION) {
    s.add(
      lights.lensFlare({
        name: SUN_FLARE_ID,
        position: sunWorldPosition(0),
        intensity: 0.32,
        edgeFade: 0.2,
        elements: [
          { size: 210, distance: 0, color: APEX_PALETTE.tangerine },
          { size: 42, distance: 0.42, color: "#ffb066" },
          { size: 76, distance: 0.72, color: "#6a4fa8" },
          { size: 30, distance: 1, color: APEX_PALETTE.tangerine }
        ],
        runtime: { id: SUN_FLARE_ID }
      })
    );
  }

  // AO-L3: night practicals (art direction: 6 = the fill above + these 5): three sodium spots that ride the pole rows ahead
  // and the hero's two headlights. All start dark; the time of day scales them and the frame loop moves them.
  for (let i = 0; i < APEX_PRACTICALS.sodiumSpots; i++) {
    s.add(
      lights
        .spot({ name: `apex-sodium-${i}`, color: APEX_PALETTE.sodium, intensity: 0, position: [0, 7.4, -20 - i * 34], target: [0, 0, -20 - i * 34], angle: 0.85, penumbra: 0.55, distance: 34, decay: 2, shadow: false })
        .runtime({ id: `apex-sodium-${i}` })
    );
  }
  for (const side of ["l", "r"] as const) {
    s.add(
      lights
        .spot({ name: `apex-headlight-${side}`, color: "#e8eeff", intensity: 0, position: [side === "l" ? -0.74 : 0.74, 0.56, -3.2], target: [side === "l" ? -1.2 : 1.2, 0, -30], angle: 0.42, penumbra: 0.5, distance: 60, decay: 2, shadow: false })
        .runtime({ id: `apex-headlight-${side}` })
    );
  }

  // 1. Endless Scrolling 5-Lane Sunset Freeway Deck, Shoulders, Jersey Barriers & Neon Sound Walls
  s.addMany([
    // AO-E2: the city 28 m below the deck, seen past the parapets as a haze floor with lit window specks (art/ground.ts)
    primitives
      .box({
        name: "freeway-outer-ground",
        size: [1400, 0.12, 900],
        material: material.custom(groundSpec()), castShadow: false, receiveShadow: false })
      .position(0, HAZE_FLOOR_Y, -300)
      .runtime(game.runtimeNode("freeway-outer-ground")),
    primitives
      .box({
        name: "freeway-asphalt-deck",
        size: [24, 0.12, 380],
        // AO-M2: CC0 asphalt, roughness 0.55, so the low sun lays a glare streak down the centre lanes
        material: asphaltMaterial(), castShadow: false })
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
        material: concreteMaterial()
      })
      .position(-10.6, 0.52, -150)
      .runtime(game.runtimeNode("freeway-barrier-left")),
    primitives
      .box({
        name: "freeway-barrier-right",
        size: [0.65, 1.05, 380],
        material: concreteMaterial()
      })
      .position(10.6, 0.52, -150)
      .runtime(game.runtimeNode("freeway-barrier-right")),
    // AO-E2: the 2.5 m sound walls hid the drop; a steel parapet rail on each barrier lets the camera see down to the haze
    // floor (runtime ids kept, so the sync below is unchanged)
    primitives
      .box({
        name: "freeway-soundwall-left",
        size: PARAPET_RAIL_SIZE,
        material: material.pbr({ color: "#4a4f5c", roughness: 0.42, metalness: 0.7 }),
        castShadow: false
      })
      .position(-PARAPET_X, PARAPET_Y, -150)
      .runtime(game.runtimeNode("freeway-soundwall-left")),
    primitives
      .box({
        name: "freeway-soundwall-right",
        size: PARAPET_RAIL_SIZE,
        material: material.pbr({ color: "#4a4f5c", roughness: 0.42, metalness: 0.7 }),
        castShadow: false
      })
      .position(PARAPET_X, PARAPET_Y, -150)
      .runtime(game.runtimeNode("freeway-soundwall-right")),
    primitives
      .box({
        name: "freeway-neon-trim-left",
        size: [0.12, 0.14, 380],
        // AO-M2: LED trims on the barrier tops: cyan on the sky-lane side, amber on the other; no magenta anywhere
        material: material.emissive({ color: APEX_PALETTE.cyan, emissive: APEX_PALETTE.cyan, emissiveIntensity: 1.1 }), castShadow: false })
      .position(-TRIM_X, TRIM_Y, -150)
      .runtime(game.runtimeNode("freeway-neon-trim-left")),
    primitives
      .box({
        name: "freeway-neon-trim-right",
        size: [0.12, 0.14, 380],
        material: material.emissive({ color: APEX_PALETTE.sodium, emissive: APEX_PALETTE.sodium, emissiveIntensity: 1.1 }), castShadow: false })
      .position(TRIM_X, TRIM_Y, -150)
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
      .box({ name: "lane-dashes", size: [0.14, 0.02, 4.2], material: material.emissive({ color: "#f8fafc", emissive: "#e2e8f0", emissiveIntensity: 0.1 }), castShadow: false, transforms: parked(LANE_DIVIDER_X.length * DASH_COUNT_PER_DIVIDER) })
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
    // AO-E2: hammerhead deck piers every 40 m (render/pylons.ts): columns + cap beams, two instanced nodes
    instances
      .box({ name: "deck-pylon-columns", size: [...PYLON_KIT.column.size], material: material.pbr({ color: APEX_PALETTE.charcoal, roughness: 0.82, metalness: 0.05 }), castShadow: false, receiveShadow: false, transforms: parked(PYLON_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("pylon-columns"))),
    instances
      .box({ name: "deck-pylon-caps", size: [...PYLON_KIT.cap.size], material: material.pbr({ color: "#2c2e36", roughness: 0.8, metalness: 0.05 }), castShadow: false, receiveShadow: false, transforms: parked(PYLON_ROWS) })
      .runtime(game.runtimeNode(poolId("pylon-caps"))),
    // AO-W1: cyan beacon rings over the piers (sky-lane edges), interchange spans every 600 m above the flight ceiling and
    // shadowless billboard frames beside the deck (render/dressing.ts); 5 instanced nodes
    instances
      .torus({ name: "beacon-rings", size: [...RING_SIZE], material: material.emissive({ color: APEX_PALETTE.cyan, emissive: APEX_PALETTE.cyan, emissiveIntensity: 1.4 }), castShadow: false, receiveShadow: false, transforms: parked(RING_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("beacon-rings"))),
    instances
      .box({ name: "interchange-span-decks", size: [...SPAN_DECK_SIZE], material: material.pbr({ color: "#2c2e36", roughness: 0.78, metalness: 0.1 }), castShadow: false, receiveShadow: false, transforms: parked(SPAN_SLOTS) })
      .runtime(game.runtimeNode(poolId("span-decks"))),
    instances
      .box({ name: "interchange-span-piers", size: [...SPAN_PIER_SIZE], material: material.pbr({ color: APEX_PALETTE.charcoal, roughness: 0.82 }), castShadow: false, receiveShadow: false, transforms: parked(SPAN_SLOTS * 2) })
      .runtime(game.runtimeNode(poolId("span-piers"))),
    instances
      .box({ name: "billboard-frames", size: [...BILLBOARD_FRAME_SIZE], material: material.pbr({ color: "#3a3d46", roughness: 0.5, metalness: 0.6 }), castShadow: false, receiveShadow: false, transforms: parked(BILLBOARD_SLOTS) })
      .runtime(game.runtimeNode(poolId("billboard-frames"))),
    instances
      .box({ name: "billboard-faces", size: [...BILLBOARD_FACE_SIZE], material: material.emissive({ color: "#ffb066", emissive: APEX_PALETTE.tangerine, emissiveIntensity: 0.9 }), castShadow: false, receiveShadow: false, transforms: parked(BILLBOARD_SLOTS) })
      .runtime(game.runtimeNode(poolId("billboard-faces"))),
    // AO-A1: glass tower skyline rising from the haze, one instanced curtain-wall node per variant (3 draws; it replaces the
    // borrowed 75-mesh townhouse model). No shadows: the nearest tower stands 40 m off the road.
    ...TOWER_VARIANTS.map((variant) =>
      instances
        .box({ name: `skyline-tower-${variant}`, size: [1, 1, 1], material: material.custom(towerGlassSpec(variant)), castShadow: false, receiveShadow: false, transforms: parked(TOWER_CAPACITY_PER_VARIANT) })
        .runtime(game.runtimeNode(poolId(`tower-${variant}`)))
    )
  ]);

  // AO-W1: SDF gantry labels, one per gantry slot (positioned by the frame loop)
  GANTRY_LABELS.slice(0, GANTRY_COUNT).forEach((label, i) => {
    s.add(
      text3D(label, { backend: "sdf", size: 0.85, name: `gantry-label-${i}`, material: material.emissive({ color: "#f4f6fb", emissive: "#e8eef8", emissiveIntensity: 0.6 }), castShadow: false })
        .position(GANTRY_LABEL_OFFSET[0], GANTRY_LABEL_OFFSET[1], -200 - i * 155)
        .runtime(game.runtimeNode(`gantry-label-${i}`))
    );
  });

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
      targetMaxDimension: 4.35,
      // AO-M1: cobalt metallic clearcoat (material.carPaint values) with a warm tangerine rim (E-D); same model, same bounds
      materialOverrides: apexHeroPaint()
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
        material: material.emissive({ color: "#c8d2e0", emissive: "#dfe7f2", emissiveIntensity: 1.5 }), castShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-power-magnet"))
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

  // 4. Ground traffic: per type, a shadow-casting full-detail pool for the first 90 m and a shadowless far-LOD pool beyond,
  //    sized to the simulation's measured peaks (audit RR-1); plus carrier ramps, brake bars and turn signals.
  for (const vType of VEHICLE_TYPES) {
    const spec = VEHICLE_ASSET[vType];
    for (const part of ["near", "far"] as const) {
      s.add(
        instances
          .model(part === "near" ? spec.asset : pickFarVehicleAsset(vType, spec.asset), {
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
      // AO-A2 interim: graphite paint with the rival-red rim until the WP-36 interceptor (ducted fans, far LOD) replaces the asset
      .model(assets.roadsterRushSkyCar, { name: "sky-cars", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 4.3, materialOverrides: apexRivalPaint(), transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-cars"))),
    // sky cars beyond 90 m: the far LOD, no shadow
    instances
      .model(meshyVehicles.enabled ? (meshyFarVehicles.refs as Record<string, AuraAssetRef<"model">>).skycar! : assets.roadsterRushSkyCar, { name: "sky-cars-far", role: "setDressing", scaleMode: "fit", targetMaxDimension: 4.3, castShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-cars-far"))),
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
    // "auto": the tier follows the device once the quality lane is on; with it off the mount resolves to "high", as before.
    renderer: { quality: "auto" },
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
    magnetRing: req("player-power-magnet")
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
  // Light handles for the time of day (AO-L2): `get`, not `require`, so a renderer without runtime lights still boots.
  const keyLight = auraApp.nodes.get(KEY_LIGHT_ID);
  const fillLight = auraApp.nodes.get(FILL_LIGHT_ID);
  /** The look row the last time-of-day bucket resolved (practicals, emissive gains and the QA hook read it). */
  let lookFrame = apexLookAt(0);
  const sunFlare = auraApp.nodes.get(SUN_FLARE_ID);
  // AO-L3 practicals; an explicit direction keeps each beam fixed while the frame loop carries the light (E-B setLight)
  const sodiumSpots = Array.from({ length: APEX_PRACTICALS.sodiumSpots }, (_, i) => auraApp.nodes.get(`apex-sodium-${i}`));
  const headlights = (["l", "r"] as const).map((side) => auraApp.nodes.get(`apex-headlight-${side}`));
  sodiumSpots.forEach((spot, i) => spot?.setLight?.({ direction: [i % 2 === 0 ? 0.32 : -0.32, -1, 0] }));
  headlights.forEach((light) => light?.setLight?.({ direction: [0, -0.1, -1] }));

  // AO-P3 / AO-P4 / AO-PF1: High-only motion blur and god rays, no DOF; re-applied when the quality tier changes.
  let postStates: Readonly<Record<string, boolean>> = {};
  const applyPost = (): void => {
    postStates = applyApexPostPlan(auraApp.post, apexPostPlan({ tier: auraApp.quality?.tier, reducedMotion: REDUCED_MOTION, coarsePointer: COARSE_POINTER }));
  };
  applyPost();
  auraApp.quality?.onChange?.(() => applyPost());

  // AO-P4: warm crash / cyan rocket output-overlay flash, peak <= 0.3 for <= 180 ms; skipped under reduced flash.
  let flash: { kind: ApexFlashKind; startMs: number } | null = null;
  const startFlash = (kind: ApexFlashKind): void => {
    if (!REDUCED_FLASH) flash = { kind, startMs: performance.now() };
  };
  const updateFlash = (nowMs: number): void => {
    if (!flash) return;
    const alpha = apexFlashAlpha(flash.kind, nowMs - flash.startMs, REDUCED_FLASH);
    if (alpha <= 0) {
      flash = null;
      auraApp.setOutputOverlay?.({});
      return;
    }
    const f = apexFlash(flash.kind);
    auraApp.setOutputOverlay?.({ flash: [f.rgb[0], f.rgb[1], f.rgb[2], alpha] });
  };
  let lastRocketActive = false;

  // AO-C1: slow-mo and letterbox moments, and the title intro (render/cinematics.ts)
  const slowMo = createApexSlowMo(REDUCED_MOTION);
  let lastFlipping = false;
  let cinematicPlayback: { skip(): void } | null = null;
  const staticShot = (pose: { position: Vec3; target: Vec3; fov: number; near: number; far: number }) => camera.rigs.static(pose);
  const playSequence = (sequence: Parameters<NonNullable<typeof auraApp.camera>["play"]>[0]): { skip(): void } | null => {
    try {
      return auraApp.camera?.play(sequence) ?? null;
    } catch {
      return null;
    }
  };
  const startSlowMo = (nowMs: number): void => {
    if (!slowMo.trigger(nowMs)) return;
    playSequence({
      id: "apex-slowmo-bars",
      shots: [{ rig: staticShot({ position: [...APEX_CHASE_POSE.position], target: [...APEX_CHASE_POSE.target], fov: APEX_CHASE_POSE.fov, near: APEX_CHASE_POSE.near, far: APEX_CHASE_POSE.far }), duration: SLOW_MO_SECONDS, blendIn: 0, bars: true }],
      onEnd: "return"
    });
  };
  function playTitleIntro(isOver: () => boolean): void {
    cinematicPlayback = playSequence(apexTitleSequence(staticShot) as Parameters<NonNullable<typeof auraApp.camera>["play"]>[0]);
    if (!cinematicPlayback) return;
    const skip = (): void => {
      cinematicPlayback?.skip();
      cinematicPlayback = null;
      for (const name of ["keydown", "pointerdown"] as const) window.removeEventListener(name, skip, true);
      window.clearInterval(watch);
    };
    for (const name of ["keydown", "pointerdown"] as const) window.addEventListener(name, skip, true);
    const watch = window.setInterval(() => {
      if (isOver()) skip();
    }, 120);
    window.setTimeout(() => {
      for (const name of ["keydown", "pointerdown"] as const) window.removeEventListener(name, skip, true);
      window.clearInterval(watch);
      cinematicPlayback = null;
    }, Math.ceil(apexTitleDurationSeconds() * 1000) + 200);
  }

  // AO-V1 / AO-V2: the apex preset pack (halved under reduced motion), fired from read-only state transitions; speed lines
  // through gameFeel (feel bus -> C-20 VFX), never under reduced motion.
  const vfxKinds = registerApexVfx(auraApp.effects, REDUCED_MOTION);
  const feel = gameFeel.create({ app: auraApp });
  let vfxPrev: ApexVfxFrame | null = null;
  let airSeconds = 0;
  let skyDodges = 0;
  const skyGaps = new Map<string, number>();
  let lastSpeedLinesMs = 0;
  let speedLinesAccepted = 0;
  const vfxFired: Record<string, number> = {};
  const fireVfx = (kind: string, at: Vec3): void => {
    try {
      auraApp.effects?.burst(kind, at);
      vfxFired[kind] = (vfxFired[kind] ?? 0) + 1;
    } catch {
      /* effects runtime unavailable */
    }
  };

  const dashPool = pool("dashes", LANE_DIVIDER_X.length * DASH_COUNT_PER_DIVIDER);
  const gantrySteel = pool("gantry-steel", GANTRY_COUNT * 3);
  const gantryBoards = pool("gantry-boards", GANTRY_COUNT * 2);
  const gantryTrims = pool("gantry-trims", GANTRY_COUNT * 4);
  const polePool = pool("poles", POLE_ROWS * 2);
  const armPool = pool("pole-arms", POLE_ROWS * 2);
  const lampPool = pool("pole-lamps", POLE_ROWS * 2);
  const towerPools = {} as Record<TowerVariant, InstancePool>;
  for (const variant of TOWER_VARIANTS) towerPools[variant] = pool(`tower-${variant}`, TOWER_CAPACITY_PER_VARIANT);
  const ringPool = pool("beacon-rings", RING_ROWS * 2);
  const spanDecks = pool("span-decks", SPAN_SLOTS);
  const spanPiers = pool("span-piers", SPAN_SLOTS * 2);
  const billboardFrames = pool("billboard-frames", BILLBOARD_SLOTS);
  const billboardFaces = pool("billboard-faces", BILLBOARD_SLOTS);
  const gantryLabels = GANTRY_LABELS.slice(0, GANTRY_COUNT).map((_, i) => auraApp.nodes.get(`gantry-label-${i}`));
  const towerHandles = {} as Record<TowerVariant, AuraRuntimeNodeHandle>;
  for (const variant of TOWER_VARIANTS) towerHandles[variant] = req(poolId(`tower-${variant}`));
  const pylonColumns = pool("pylon-columns", PYLON_ROWS * 2);
  const pylonCaps = pool("pylon-caps", PYLON_ROWS);

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
  const skyCarFarPool = pool("sky-cars-far", POOL_CAPACITY.skyCar);
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
  let manualTodOverride: number | null = TOD_PARAM;
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
  let camDrop = 0;
  let lastBank = 0;
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

    // GU47 AO-L2: the scene light follows the same row as the dome. The look's key keeps the disc's direction and takes the
    // row's colour and intensity; the camera-side fill and the IBL (1.0 / 0.55 / 0.18) dim with it. AO-E3: fog colour too.
    const frame = apexLookAt(tod);
    const toward = frame.sunDir;
    const blend = { transitionSeconds: 0.35 };
    keyLight?.setLight?.({ color: frame.sun.color, intensity: frame.sun.intensity, direction: [-toward[0], -toward[1], -toward[2]] }, blend);
    fillLight?.setLight?.({ color: frame.fill.color, intensity: frame.fill.intensity }, blend);
    auraApp.lighting?.setEnvironmentIntensity?.(frame.environmentIntensity);
    // overrideSceneFog: the volumetric god-ray node would otherwise make setFog skip the look's fog node (E-B default)
    auraApp.atmosphere?.setFog?.({ color: frame.fog.color, near: frame.fog.near, far: frame.fog.far }, { ...blend, overrideSceneFog: true });
    if (sunFlare) {
      const at = sunWorldPosition(tod);
      sunFlare.setPosition(at[0], at[1], at[2]).setVisible(look.nightAmount < 0.5);
    }
    // AO-P1: time-of-day white balance through E-C's grade writer plus the apex-bluehour display LUT (S10b), both patched
    // onto the one look grade node (still a single color-grade stage)
    try {
      auraApp.post?.setEffect?.("colorGrade", apexGradePatch(frame, APEX_LUT_URL));
    } catch {
      /* post surface without runtime overrides */
    }
    lookFrame = frame;
    syncTodButtons(tod);
    // AO-L3: sodium pool and headlights scale with the row (sodium 0 / 0.35 / 1, headlights on from dusk); dark lights hide
    const sodium = frame.signature.sodium;
    for (const spot of sodiumSpots) {
      spot?.setLight?.({ intensity: round3(SODIUM_INTENSITY * sodium) }, blend);
      spot?.setVisible(sodium > 0.02);
    }
    const beams = frame.signature.headlights;
    for (const light of headlights) {
      light?.setLight?.({ intensity: round3(HEADLIGHT_INTENSITY * beams) }, blend);
      light?.setVisible(beams > 0.02);
    }

    // AO-A1: the tower glass reflects the same dome row and lights its floors toward night
    for (const variant of TOWER_VARIANTS) {
      const tower = towerHandles[variant];
      tower.setUniform?.("glassSky", look.skyTop as never);
      tower.setUniform?.("glassHorizon", look.skyHorizon as never);
      tower.setUniform?.("sunDirection", look.sunDir as never);
      tower.setUniform?.("sunTint", look.sunColor as never);
      tower.setUniform?.("sunGlint", round3(1.2 * (1 - look.nightAmount)) as never);
      tower.setUniform?.("windowsLit", round3(frame.signature.windowSpecks) as never);
      tower.setUniform?.("hazeColor", hexToUnit(frame.signature.hazeColor) as never);
    }

    // AO-E2: the haze floor takes the row's haze colour and window-speck strength (cool lavender haze, no red-pink floor)
    const groundHex = lerpHexColor("#14141c", "#07080d", tod);
    const [gr, gg, gb] = hexToRgb(groundHex);
    outerGroundHandle.setUniform?.("groundColor", [gr / 255, gg / 255, gb / 255] as never);
    outerGroundHandle.setUniform?.("groundFogColor", hexToUnit(frame.signature.hazeColor) as never);
    outerGroundHandle.setUniform?.("windowSpecks", round3(frame.signature.windowSpecks) as never);
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

  let lastPz = 0;
  let lastGantries: readonly { position?: { z?: number } }[] = [];
  const runtimeEvidence = {
    route: "showcase-roadster-rush",
    engine: "@aura3d/engine",
    ready: true,
    autopilot,
    framesRendered: 0,
    mode: "title" as string,
    paused: false,
    assisted: false,
    score: 0,
    distance: 0,
    bolts: 0,
    multiplier: 1,
    timeOfDay: 0,
    trafficYawOffset: TRAFFIC_YAW,
    player: { position: [0, 0, 0] as Vec3, lane: 2, speed: 0, air: 100, grounded: true, rolling: false, boosting: false },
    visiblePools: { groundVehicles: 0, skyCars: 0, bolts: 0, powerups: 0 },
    /** What the renderer draws within 120 m ahead of the player (computed when read). */
    get drawn(): Record<string, number> {
      return drawnWithin(120, lastPz, lastGantries);
    }
  };
  (window as any).__AURA3D_SHOWCASE_ROADSTER_RUSH__ = { app: auraApp, evidence: runtimeEvidence, triggerScenario };

  // GU47 QA hook (E-I capture): named crops the WP-12 acceptance reads, plus the look state a judged shot needs.
  const qaGlobal = window as unknown as { __AURA_QA__?: Record<string, unknown> };
  const qa = (qaGlobal.__AURA_QA__ ??= {}) as { crops?: QaCrop[]; apex?: Record<string, unknown> };
  qa.crops = [];
  const qaApex: Record<string, unknown> = {
    variant: "sunset",
    tod: 0,
    post: postStates,
    grade: { lut: APEX_LUT_URL, lutIntensity: APEX_LUT_INTENSITY },
    reducedMotion: REDUCED_MOTION,
    reducedFlash: REDUCED_FLASH
  };
  qa.apex = qaApex;
  const publishQa = (heroRoot: Vec3): void => {
    const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
    qa.crops = apexQaCrops(sunWorldPosition(lookFrame.tod), [heroRoot[0], heroRoot[1] + 0.66, heroRoot[2]], aspect);
    qaApex.variant = lookFrame.variant;
    qaApex.tod = lookFrame.tod;
    qaApex.post = postStates;
    qaApex.vfx = { presets: vfxKinds, fired: vfxFired, liveCount: auraApp.effects?.liveCount ?? 0, speedLinesAccepted };
    qaApex.cinematics = { slowMoTriggered: slowMo.triggered, introPlaying: cinematicPlayback !== null };
  };

  /** AO-V1 / AO-V2: fire the apex presets and speed lines from this frame's (read-only) simulation state. */
  function driveVfx(real: any, nowMs: number, realDt: number): void {
    const p = real.player;
    const grounded = Boolean(p.grounded);
    airSeconds = grounded ? 0 : airSeconds + realDt;
    const pos = { x: Number(p.position?.x ?? 0), y: Number(p.position?.y ?? 0), z: Number(p.position?.z ?? 0) };
    const skyCars: any[] = Array.isArray(real.traffic?.skyCars) ? real.traffic.skyCars : [];
    if (real.mode === "playing") skyDodges += countSkyDodges(pos, skyCars, skyGaps);
    const frame: ApexVfxFrame = {
      mode: String(real.mode),
      bolts: Number(real.bolts ?? 0),
      grounded,
      airSeconds,
      rocketActive: Number(p.rocketTimer ?? 0) > 0,
      skyDodges
    };
    // effects spawn where the car is drawn: the chase anchor keeps it near x = px * 0.35, y ~ 0, z = -1.15
    const carAt: Vec3 = [pos.x - chaseX, Math.max(0, pos.y * 0.15) + 0.4 + camDrop, -1.15];
    for (const kind of apexVfxEvents(vfxPrev, frame)) {
      if (kind === "apex-land") fireVfx(kind, [carAt[0], 0.05, carAt[2]]);
      else if (kind === "apex-rocket") fireVfx(kind, [carAt[0], carAt[1], carAt[2] + 2.6]);
      else if (kind === "apex-skykill") fireVfx(kind, [carAt[0], carAt[1] + 1.2, carAt[2] - 3]);
      else fireVfx(kind, carAt);
    }
    vfxPrev = frame;
    const lines = real.mode === "playing" ? apexSpeedLines(Number(p.speed ?? 0), Boolean(p.boosting), frame.rocketActive, REDUCED_MOTION) : 0;
    if (lines > 0 && nowMs - lastSpeedLinesMs > 240) {
      lastSpeedLinesMs = nowMs;
      try {
        if (feel.speedLines(lines, [carAt[0], 1.2, -6]).accepted) speedLinesAccepted++;
      } catch {
        /* feel bus not bound */
      }
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
    if (real.mode === "crashed" && lastMode === "playing" && !real.manual) {
      hitStop.trigger(110);
      startFlash("crash");
    }
    lastMode = real.mode;
    const rocketActive = Number(real.player.rocketTimer ?? 0) > 0;
    if (rocketActive && !lastRocketActive && real.mode === "playing") {
      startFlash("rocket");
      startSlowMo(nowMs);
    }
    // a ramp launch starts the flip (read-only): slow-mo with letterbox bars
    const flipping = Boolean(real.player.flipping);
    if (flipping && !lastFlipping && real.mode === "playing") startSlowMo(nowMs);
    lastFlipping = flipping;
    lastRocketActive = rocketActive;
    updateFlash(nowMs);
    driveVfx(real, nowMs, realDt);
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
    // AO-C2: the camera drops from 3.6 to 2.7 m with speed (the world lifts by the drop) and banks into lane changes
    const chase = chaseCameraOffsets(Number(p.speed ?? 0), Number(real.player._laneVel ?? 0), REDUCED_MOTION);
    camDrop += (chase.drop - camDrop) * (1 - Math.exp(-3 * realDt));
    const bank = Math.round(chase.roll * 2000) / 2000;
    if (bank !== lastBank) {
      lastBank = bank;
      try {
        auraApp.camera?.setRoll(bank, { halflife: 0.14 });
      } catch {
        /* camera controller not mounted */
      }
    }
    const camAnchorY = Math.max(0, py * 0.85) + sh.y - camDrop;
    const rx = (wx: number) => wx - camAnchorX;
    const ry = (wy: number) => wy - camAnchorY;
    const rz = (wz: number) => wz - pz;

    // 1. Freeway deck, walls and trims
    const centerZ = -150;
    outerGroundHandle.setPosition(rx(0), ry(HAZE_FLOOR_Y), -300);
    outerGroundHandle.setUniform?.("scroll", [camAnchorX, pz] as never);
    asphaltDeckHandle.setPosition(rx(0), ry(-0.06), centerZ);
    shoulderLeftHandle.setPosition(rx(-9.0), ry(0.012), centerZ);
    shoulderRightHandle.setPosition(rx(9.0), ry(0.012), centerZ);
    barrierLeftHandle.setPosition(rx(-10.6), ry(0.52), centerZ);
    barrierRightHandle.setPosition(rx(10.6), ry(0.52), centerZ);
    soundwallLeftHandle.setPosition(rx(-PARAPET_X), ry(PARAPET_Y), centerZ);
    soundwallRightHandle.setPosition(rx(PARAPET_X), ry(PARAPET_Y), centerZ);
    neonTrimLeftHandle.setPosition(rx(-TRIM_X), ry(TRIM_Y), centerZ);
    neonTrimRightHandle.setPosition(rx(TRIM_X), ry(TRIM_Y), centerZ);

    // AO-E2: deck pylons, world-anchored rows (2 instanced nodes)
    pylonColumns.begin();
    pylonCaps.begin();
    const piers = pylonLayout(pz);
    for (const c of piers.columns) pylonColumns.add(rx(c.x), ry(c.y), rz(c.z));
    for (const c of piers.caps) pylonCaps.add(rx(c.x), ry(c.y), rz(c.z));
    pylonColumns.commit();
    pylonCaps.commit();

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
    // AO-W1: one SDF label per gantry slot on the left board's face; empty slots hide theirs
    for (let i = 0; i < gantryLabels.length; i++) {
      const label = gantryLabels[i];
      if (!label) continue;
      const wz = Number(worldGantries[i]?.position?.z ?? 1e5);
      const gz = rz(wz);
      const shown = wz < 1e4 && gz > -560 && gz < 40;
      if (shown) label.setPosition(rx(GANTRY_LABEL_OFFSET[0]), ry(GANTRY_LABEL_OFFSET[1]), gz + GANTRY_LABEL_OFFSET[2]);
      label.setVisible(shown);
    }

    // AO-W1: beacon rings, interchange spans and billboards (world-anchored rows)
    ringPool.begin();
    for (const r of ringLayout(pz)) ringPool.add(rx(r.x), ry(r.y), rz(r.z));
    ringPool.commit();
    spanDecks.begin();
    spanPiers.begin();
    const spans = spanLayout(pz);
    for (const d of spans.decks) spanDecks.add(rx(d.x), ry(d.y), rz(d.z));
    for (const d of spans.piers) spanPiers.add(rx(d.x), ry(d.y), rz(d.z));
    spanDecks.commit();
    spanPiers.commit();
    billboardFrames.begin();
    billboardFaces.begin();
    for (const b of billboardLayout(pz)) {
      billboardFrames.add(rx(b.x), ry(b.y), rz(b.z));
      billboardFaces.add(rx(b.x), ry(b.y), rz(b.z) + 0.3);
    }
    billboardFrames.commit();
    billboardFaces.commit();

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
    // AO-L3: the sodium spots hang under the lamp heads of the next three pole rows, alternating sides
    for (let k = 0; k < sodiumSpots.length; k++) {
      const spot = sodiumSpots[k];
      if (!spot) continue;
      const side = k % 2 === 0 ? -1 : 1;
      spot.setPosition(rx(side * 10.55), ry(7.3), rz(poleBaseZ - (k + 1) * POLE_STRIDE_Z));
    }

    // AO-A1: glass towers, world-anchored rows from one behind the camera to ~560 m ahead (audit RR-8 recycling rule)
    for (const variant of TOWER_VARIANTS) towerPools[variant].begin();
    const towers = towerLayout(pz);
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i]!;
      towerPools[t.variant].add(rx(t.x), ry(t.y), rz(t.z), 0, t.yaw, 0, t.width, t.height, t.depth);
    }
    for (const variant of TOWER_VARIANTS) towerPools[variant].commit();

    updateAtmosphereForTod(Number(g.world?.timeOfDay ?? 0));

    // 3. Sync Player Roadster Assembly, Thruster Plumes, Active Powerups & Contact Shadow
    const pitch = Number(p.pivot?.rotation?.x ?? p._pitch ?? 0);
    const yaw = Number(p.mesh?.rotation?.y ?? p._yaw ?? 0);
    // AO-AN1: a lane change leans the hero up to 6 degrees (barrel rolls keep their full turn); hop pitch and landing squash
    // are the simulation's own pose
    const roll = displayRoll(Number(p.pivot?.rotation?.z ?? p._bank ?? 0), Boolean(p.rolling)) + sh.roll;
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
    headlights[0]?.setPosition(hlLeftW[0], hlLeftW[1], hlLeftW[2] - 0.2);
    headlights[1]?.setPosition(hlRightW[0], hlRightW[1], hlRightW[2] - 0.2);

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

    // AO-L4: the hero's ground contact comes from the sun's cascades and the contact-shadow pass (the black disc is gone)

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
    skyCarFarPool.begin();
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
      (pz - Number(sc.z ?? 0) <= SHADOW_NEAR ? skyCarPool : skyCarFarPool).add(sx, sy, sz, srx, oncoming ? 0 : Math.PI, srz);
      const tailZ = oncoming ? sz - 2.35 : sz + 2.35;
      skyPlumePool.add(sx, sy + 0.45, tailZ, oncoming ? -Math.PI * 0.5 : Math.PI * 0.5, 0, 0, 0.9, 1.2 * flicker, 0.9);
      if (oncoming) skyHaloPool.add(sx, sy + 0.55, sz + 2.15, 0, 0, REDUCED_MOTION ? 0 : simTime * 4);
    }
    skyCarPool.commit();
    skyCarFarPool.commit();
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

    // 7. Runtime evidence: one object updated in place every frame (legacy readers watch `__AURA3D_GAME_EVIDENCE__`,
    //    which is this object), and the beacon snapshot rebuilt every 10th frame (audit RR-E1)
    const ev = runtimeEvidence;
    ev.autopilot = autopilot;
    ev.framesRendered = framesRendered;
    ev.mode = g.mode;
    ev.paused = Boolean(g.paused);
    ev.assisted = Boolean(real.assisted);
    ev.score = Math.floor(Number(g.score ?? 0));
    ev.distance = Math.floor(Number(g.distance ?? 0));
    ev.bolts = Number(g.bolts ?? 0);
    ev.multiplier = Number(g.mult ?? 1);
    ev.timeOfDay = Number(manualTodOverride ?? g.world?.timeOfDay ?? 0);
    const ep = ev.player;
    ep.position[0] = px; ep.position[1] = py; ep.position[2] = pz;
    ep.lane = Number(p.lane ?? 2);
    ep.speed = Number(p.speed ?? 0);
    ep.air = Number(p.air ?? 100);
    ep.grounded = Boolean(p.grounded);
    ep.rolling = Boolean(p.rolling);
    ep.boosting = Boolean(p.boosting);
    ev.visiblePools.groundVehicles = groundDrawn;
    ev.visiblePools.skyCars = skySlots.length;
    ev.visiblePools.bolts = pickupSlots.bolts.length;
    ev.visiblePools.powerups = powerDrawn;
    lastPz = pz;
    lastGantries = worldGantries;
    if (framesRendered % 10 === 1) publishQa(pRoot);
    publishBeacon(ev);
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

  /** Time-of-day buttons (AO-H1): the active one is always the variant the presented time of day shows (the beacon's
   *  `timeOfDay`), so no button sticks; `aria-pressed` marks a pinned time of day. */
  const todButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-aura-tod]"));
  function syncTodButtons(presentedTod: number): void {
    const variant = apexLookAt(presentedTod).variant;
    for (const b of todButtons) {
      const value = parseFloat(b.dataset.auraTod ?? "0");
      b.classList.toggle("active", apexLookAt(value).variant === variant);
      b.setAttribute("aria-pressed", String(manualTodOverride !== null && Math.abs(manualTodOverride - value) < 1e-6));
    }
  }

  function bindToolbar(): void {
    const bar = document.querySelector<HTMLElement>(".aura3d-top-bar");
    const chip = document.getElementById("aura-showcase-chip");
    const panel = document.getElementById("aura-showcase-panel");
    // AO-H1: one Showcase chip, only for ?dev=1 or ?capture=1; players see the HUD alone
    if (bar) bar.hidden = !SHOWCASE_CHIP;
    chip?.addEventListener("click", () => {
      if (!panel) return;
      panel.hidden = !panel.hidden;
      chip.setAttribute("aria-expanded", String(!panel.hidden));
      (chip as HTMLButtonElement).blur();
    });
    const btnFreeway = document.getElementById("aura-btn-freeway");
    const btnSky = document.getElementById("aura-btn-sky");
    const btnRamp = document.getElementById("aura-btn-ramp");
    const btnRoll = document.getElementById("aura-btn-roll");
    const btnRocket = document.getElementById("aura-btn-rocket");
    const btnAuto = document.getElementById("aura-btn-auto") as HTMLButtonElement | null;

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

    /** Scenario actions flash briefly and drop focus, so none looks held on (audit RR-14, AO-H1). */
    const momentary = (btn: HTMLElement | null, run: () => void) => {
      btn?.addEventListener("click", () => {
        run();
        btn.classList.add("active");
        window.setTimeout(() => btn.classList.remove("active"), 260);
        (btn as HTMLButtonElement).blur();
      });
    };
    momentary(btnFreeway, () => triggerScenario("freeway"));
    momentary(btnSky, () => triggerScenario("sky"));
    momentary(btnRamp, () => triggerScenario("ramp"));
    momentary(btnRoll, () => triggerScenario("roll"));
    momentary(btnRocket, () => triggerScenario("rocket"));

    for (const btn of todButtons) {
      btn.addEventListener("click", () => {
        const todVal = parseFloat(btn.dataset.auraTod ?? "0");
        const value = Number.isFinite(todVal) ? todVal : 0;
        // pressing the pinned time of day again releases it: the sky follows the run again (presentation only)
        manualTodOverride = manualTodOverride !== null && Math.abs(manualTodOverride - value) < 1e-6 ? null : value;
        lastTodBucket = -1;
        syncTodButtons(manualTodOverride ?? Number((window as any).__GAME__?.game?.world?.timeOfDay ?? 0));
        btn.blur();
      });
    }
    syncTodButtons(manualTodOverride ?? 0);
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
  // AO-C1: the simulation is fed a clock that slow-mo slows down (same fixed steps, presented later; replays unchanged)
  let lastClockMs = 0;
  let simClockMs = performance.now();
  auraApp.onFrame(() => {
    const clockNow = performance.now();
    simClockMs += (lastClockMs ? clockNow - lastClockMs : 0) * slowMo.scale(clockNow);
    lastClockMs = clockNow;
    nativeGame.frameTick(simClockMs);
    // draw the poses between the last two simulation steps (smooth on 120 and 144 Hz displays); manual and paused runs draw the exact latest step
    const live = !nativeGame.manual && !nativeGame.paused && !nativeGame.simPaused;
    syncRoadsterWorld(nativeGame, live ? viewOf(nativeGame, presenter.present(nativeGame, true)) : nativeGame);
  });

  // Demos and captures start the run at once; everyone else sees the title card (goal, controls, best) and starts it.
  if (AUTOSTART) ensureLivePlaying(nativeGame);
  syncRoadsterWorld(nativeGame);
  // Compile every program (and wait for the environment) before the boot veil lifts (checklist R2)
  await warmPrograms(auraApp);
  // AO-C1: three-shot letterboxed title intro on the title card (skippable; none for captures or reduced motion)
  if (!AUTOSTART && !REDUCED_MOTION && nativeGame.mode === "title") playTitleIntro(() => nativeGame.mode !== "title");
  document.getElementById("boot")?.classList.add("done");
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  auraApp.resume();
}

bootRoadsterRushAura3D().catch(showBootError);
