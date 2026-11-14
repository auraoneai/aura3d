import {
  camera,
  createAuraApp,
  effects,
  game,
  gameFeel,
  geometry,
  instances,
  lights,
  looks,
  material,
  primitives,
  scene,
  text3D,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  APEX_BLOOM,
  APEX_GOD_RAY_DENSITY,
  APEX_GRADE,
  APEX_IBL_HDRI,
  APEX_IBL_ROTATION_DEG,
  APEX_LOOK,
  APEX_MOTION_BLUR,
  APEX_PALETTE,
  APEX_PRACTICALS,
  APEX_KEY,
  APEX_SCENE_FOG_DENSITY_SCALE,
  APEX_SCENE_FOG_PRESET,
  APEX_SCENE_FOG_RANGE,
  apexLookAt,
  hexToUnit,
  parseTodParam
} from "./art/look";
import { apexFlash, apexFlashAlpha, apexPostPlan, applyApexPostPlan, type ApexFlashKind } from "./art/post";
import { APEX_LUT_INTENSITY, apexGradePatch } from "./art/lut";
import { APEX_PLUMES, plumeSpec } from "./art/plume";
import { CONTACT_SIZE, DECAL_CAPACITY, DECAL_KIND_CODE, DECAL_SIZE, DECAL_Y, contactScaleY, decalLayout, decalSpec } from "./render/decals";
import { createNativeRoadster, findDrawCalls } from "./native";
import { FIXED_DT, POWERUP_SECONDS } from "./native/constants";
import { GANTRY_COUNT } from "./native/world";
import { gantryBoxes, gantryGeometrySpecs } from "./render/gantry";
import { installBlackFrameGuard } from "@aura3d/debug";
// A2: `?diag=1` shows the shared GPU diagnostics panel (draw calls, backend, tier); inert without the query parameter.
import "../../showcase-port-shared/diag";
import { createLoadingProgress } from "../../showcase-port-shared/loading-progress";
import { labAppOptions, labCameraOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";
import { SHIELD_SIZE, shieldSpec } from "./art/shield";
import { HAZE_FLOOR_Y, groundSpec } from "./art/ground";
import { asphaltMaterial, asphaltRutSpec, concreteMaterial } from "./art/surfaces";
import { apexRampDeckMaterial } from "./art/paint";
import {
  APEX_PROCEDURAL_MATERIALS,
  buildBayRidgeMountainSpec,
  buildBayRidgeStrataMaterial,
  buildBoltCrystalSpec,
  buildCarrierRampChevronSpec,
  buildCarrierRampDeckSpec,
  buildCarrierRampRailSpec,
  buildHeroAeroSplitterNode,
  buildHeroCanopyVisorNode,
  buildHeroHeadlightNode,
  buildHeroSupercarNode,
  buildHeroTaillightBarNode,
  buildPowerupEmblemSpec,
  buildRoadsideBarrierPairSpec,
  buildRoadsideCorridorNode,
  buildSkycarGeometries,
  buildTrafficClassGeometries
} from "./art/proceduralModels";
import { createImpactRig } from "../../showcase-port-shared/feel";
import { createGradingLut } from "../../showcase-port-shared/vfx-pack";
import { PYLON_ROWS, pylonGeometrySpecs, pylonLayout } from "./render/pylons";
import {
  BILLBOARD_FACE_SIZE,
  BILLBOARD_SLOTS,
  GANTRY_LABELS,
  GANTRY_LABEL_OFFSET,
  RING_ROWS,
  SPAN_SLOTS,
  billboardLayout,
  ringLayout,
  skywayDressingSpecs,
  spanLayout
} from "./render/dressing";
import { TOWER_CAPACITY_PER_VARIANT, TOWER_CROWN_CAPACITY, TOWER_VARIANTS, bayRidgeTransforms, towerCrownLayout, towerGlassSpec, towerLayout, type TowerVariant } from "./render/towers";
import { SKY_DOME_SIZE, skyLook, skySpec } from "./art/sky";
import { createCameraShake, createHitStop, installGameBeacon, warmPrograms } from "@aura3d/engine/game";
import {
  HERO_PLUME_LOCAL_MATS,
  bodyMatrixFromYXZ,
  createRoadsterPresenter,
  displayRoll,
  eulerZYXFromMat3,
  mulMat3,
  rotateOffsetByMat3,
  viewOf
} from "./native/presentation";
import { apexSpeedLines, apexVfxEvents, countSkyDodges, type ApexVfxFrame } from "./render/vfxDirector";
import { APEX_CHASE_POSE, SLOW_MO_SECONDS, apexTitleDurationSeconds, apexTitleSequence, chaseCameraOffsets, createApexSlowMo } from "./render/cinematics";
import { createApexSmokeAtlas, createApexSparkAtlas, flipbookBurstSpec, registerApexVfx } from "./art/vfx";
import { InstancePool, parked } from "./render/instancePool";
import { apexQaCrops, type QaCrop } from "./render/qa";
import {
  APEX_PLAYER_WAKE,
  APEX_RIVAL_WAKE,
  APEX_WAKE_CAPACITY,
  PLAYER_WAKE_COLOR,
  RIVAL_WAKE_COLOR,
  WakeTrail,
  playerWakeStrength,
  rivalWake,
  stripRotation,
  wakeIntensity,
  wakeLife,
  wakeSpec,
  type WakeSegment
} from "./render/wakes";
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
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

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

/** Procedural vehicles are authored facing `-Z` (`VEHICLE_SPECS` exact dimensions), so yaw offset is 0. */
const TRAFFIC_YAW = trafficYawOffset(true);

/** AO-L3 practical intensities at full night (phase 2 calibrates against the night bottom-centre cell). */
const SODIUM_INTENSITY = 26;
const HEADLIGHT_INTENSITY = 18;

const BRAKE_BAR_CAPACITY = 48;
const BLINKER_CAPACITY = 24;
/** Brake bars and blinkers are small; draw them for traffic up to this far ahead. */
const LIGHT_DETAIL_AHEAD = 140;
/** GU47 phase 3: contact-occlusion ellipses under the near (shadow-casting) traffic; the near pools hold 96 at most. */
const TRAFFIC_CONTACT_CAPACITY = 96;

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
/** The LED trims sit on the barrier tops, inside the rails. */
const TRIM_X = 10.32;
const TRIM_Y = 1.07;


/** Overhead gantry geometry, built from the collision band so what crashes the car is what is drawn (audit RR-6). */
const GANTRY_BOXES = gantryBoxes();

/** Power-ups: each kind has its own sculpted multi-tone emblem (art/proceduralModels.ts) and HUD timer bar colour. */
const POWERUP_LOOK: Record<PowerupKind, { color: string }> = {
  air: { color: "#2f7dff" },
  rocket: { color: "#ff6a3d" },
  shield: { color: "#5fe6ff" },
  magnet: { color: "#c8d2e0" },
  multiplier: { color: "#ffd24d" }
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
  return rotateOffsetByMat3(root, bodyMatrixFromYXZ(pitch, yaw, roll), local);
}

interface PlayerHandles {
  car: AuraRuntimeNodeHandle;
  canopyVisor: AuraRuntimeNodeHandle;
  aeroSplitter: AuraRuntimeNodeHandle;
  lightbar: AuraRuntimeNodeHandle;
  headlightL: AuraRuntimeNodeHandle;
  headlightR: AuraRuntimeNodeHandle;
  headlampConeL: AuraRuntimeNodeHandle;
  headlampConeR: AuraRuntimeNodeHandle;
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
      // GU47 phase 4: the shadowed key stands at APEX_KEY (21 deg), above the 7 deg disc the dome draws (art/look.ts)
      sun: APEX_KEY,
      fogDensityScale: APEX_SCENE_FOG_DENSITY_SCALE,
      hdri: APEX_IBL_HDRI,
      environmentIntensity: sunset.environmentIntensity,
      environmentRotationDeg: APEX_IBL_ROTATION_DEG,
      background: APEX_PALETTE.charcoal,
      // AO-L4: 3 cascades with PCSS soft shadows (the tier table drops to 1 cascade / PCF on Low). GU47 phase 4: 140 -> 90 m,
      // the reach of the shadow-casting near traffic pools (beyond 90 m the far LODs cast nothing), so the same 2048 map
      // spends its texels where shadows exist; at 140 m the carrier's long shadow showed stair-steps in the glare.
      key: { color: sunset.sun.color, intensity: sunset.sun.intensity, shadow: { cascades: 3, maxDistance: 90, filter: "pcss", mapSize: 2048 } },
      // Crisp skyway fog range: 38/196 under 0.4 density scale = near 95 / far 490; colour follows time of day
      fog: { color: sunset.fog.color, near: APEX_SCENE_FOG_PRESET.near, far: APEX_SCENE_FOG_PRESET.far },
      // AO-P1: the game's own grade replaces the look's (one grade stage); the white balance follows the time of day
      grade: { contrast: APEX_GRADE.contrast, saturation: APEX_GRADE.saturation, temperature: sunset.grade.temperature, tint: sunset.grade.tint },
      // AO-P2: racer bloom for the corona, brake bars, plumes and lamps (the look's one bloom node, retuned)
      post: { bloom: { intensity: APEX_BLOOM.intensity, threshold: APEX_BLOOM.threshold, scatter: APEX_BLOOM.scatter } }
    })
    .toJSON();
  const children = (look.children ?? []).map((child) => {
    if (child.kind === "light" && child.name === "look key light") {
      return { ...child, runtime: { id: KEY_LIGHT_ID } } as AuraSceneNode;
    }
    if (child.kind === "effect" && child.name === "look ambient occlusion") {
      return { ...child, intensity: 0.58, radius: 0.55 } as AuraSceneNode;
    }
    if (child.kind === "effect" && child.name === "look bloom") {
      return { ...child, intensity: 0.36, threshold: 0.96, scatter: 0.38, radius: 0.32, antiBlowout: true, maxIntensity: 0.68 } as AuraSceneNode;
    }
    if (child.kind === "effect" && child.name === "look fog") {
      return { ...child, mode: "linear", near: Math.max(150, APEX_SCENE_FOG_PRESET.near * 1.6), far: Math.max(520, APEX_SCENE_FOG_PRESET.far), maxOpacity: 0.26, affectsBackground: false } as AuraSceneNode;
    }
    return child;
  });
  return { ...look, children } as AuraSceneNode;
}

function buildRoadsterRushScene(): ReturnType<typeof scene> {
  const sparkAtlas = createApexSparkAtlas();
  const smokeAtlas = createApexSmokeAtlas();
  const s = scene()
    // One look: its IBL, its one shadowed key light, its AO, bloom and colour grade; nothing authored stacks a second bloom,
    // grade or shadowed light on it (audit RR-11, GU47 AO-L1).
    .add(apexLookNode())
    .background(APEX_PALETTE.charcoal)
    .camera(
      camera.perspective({
        // GU47 phase 3 (rubric composition): 1 m closer and 3 deg narrower than 4.7.0, so the hero fills ~1.5x the area
        fov: 55,
        near: 0.25,
        far: 550,
        position: [0, 3.6, 5.2],
        target: [0, 0.6, -6.0],
        // A9: reversed depth by default (real-GPU checked); `?depth=standard` opts out, `?depth=logarithmic` overrides.
        ...labCameraOptions(readLabFlags(), "reversed")
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
    // AO-L4: screen-space contact shadows from the sun replace the black disc under the hero (GU47 phase 4: 0.3 -> 0.7 m rays,
    // so the tyres and sills sit in the shadow instead of on it)
    .add(effects.contactShadows({ length: 0.7, thickness: 0.08, steps: 16, intensity: 1, lights: "sun" }))
    // WP-06 / WP-02 subtle wet-asphalt screen-space reflections (intensity <= 0.35, maxDistance <= 18, roughness <= 0.35)
    .add(effects.screenSpaceReflections({ intensity: 0.24, maxDistance: 15, roughness: 0.32, thickness: 0.25 }))
    // AO-P3 / AO-P4: motion blur (S7) and god rays through the haze (S4). art/post.ts switches both per tier: High and Ultra
    // only, never on a phone, and motion blur never under reduced motion. The inscatter density stays tiny: the look fog owns
    // the haze, this node only feeds the shafts (godRayDensity is decoupled from fog density, E-C EC-8).
    .add(effects.motionBlur({ shutter: APEX_MOTION_BLUR, maxBlur: 8 }))
    .add(effects.volumetricFog({ density: 0.0004, color: APEX_LOOK[0].dome.sun, intensity: 0.05, godRayDensity: APEX_GOD_RAY_DENSITY }));
  // AO-P3: the low sun's lens flare in the identity palette; skipped under reduced motion, hidden at night.
  if (!REDUCED_MOTION) {
    s.add(
      lights.lensFlare({
        name: SUN_FLARE_ID,
        position: sunWorldPosition(0),
        intensity: 0.04,
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
    s.add(
      effects
        .lightCone({
          name: `apex-headlamp-cone-${side}`,
          color: "#dbeafe",
          intensity: 0.22,
          position: [side === "l" ? -0.74 : 0.74, 0.52, -2.2],
          direction: [0, -0.09, -1],
          length: 22,
          coneAngle: 0.26,
          softness: 0.48
        })
        .runtime(game.runtimeNode(`apex-headlamp-cone-${side}`))
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
        material: asphaltMaterial(), castShadow: false })
      .position(0, -0.06, -150)
      .runtime(game.runtimeNode("freeway-asphalt-deck")),
    primitives
      .plane({
        name: "freeway-wet-ruts",
        size: [22, 360],
        material: material.custom(asphaltRutSpec()),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0.005, -150)
      .runtime(game.runtimeNode("freeway-wet-ruts")),
    // Batched bilateral sloped-toe New Jersey concrete barriers + stanchioned steel parapet rails, shoulders & LED trims
    geometry
      .custom(buildRoadsideBarrierPairSpec(380, PARAPET_X), {
        name: "freeway-barriers",
        material: concreteMaterial(),
        castShadow: false
      })
      .position(0, 0, -150)
      .runtime(game.runtimeNode("freeway-barriers")),
    buildRoadsideCorridorNode({
      lengthZ: 380,
      parapetX: PARAPET_X,
      parapetY: PARAPET_Y,
      trimX: TRIM_X,
      trimY: TRIM_Y
    }),
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

  // 2. Lane dashes, cantilevered light poles, lattice gantries, Y-pier pylons, skyline and stratified coastal bay ridge
  const gantrySpecs = gantryGeometrySpecs();
  const pylonSpecs = pylonGeometrySpecs();
  const dressingSpecs = skywayDressingSpecs();
  s.addMany([
    // AO-W2: recycled skid marks, oil stains and lane arrows, procedural, one instanced plane (1 draw, <= 32 live)
    instances
      .plane({ name: "apex-road-decals", material: material.custom(decalSpec()), castShadow: false, receiveShadow: false, transforms: parked(DECAL_CAPACITY) })
      .runtime(game.runtimeNode(poolId("road-decals"))),
    instances
      // GU47 phase 3 (distinctness): tangerine light-line dashes, the identity colour on the deck
      .box({ name: "lane-dashes", size: [0.14, 0.02, 4.2], material: material.emissive({ color: "#ffb27a", emissive: APEX_PALETTE.tangerine, emissiveIntensity: 0.1 }), castShadow: false, transforms: parked(LANE_DIVIDER_X.length * DASH_COUNT_PER_DIVIDER) })
      .runtime(game.runtimeNode(poolId("dashes"))),
    instances
      .custom(gantrySpecs.steel, { name: "gantry-steel", material: APEX_PROCEDURAL_MATERIALS.gantryTrussSteel(), castShadow: false, transforms: parked(GANTRY_COUNT * 3) })
      .runtime(game.runtimeNode(poolId("gantry-steel"))),
    instances
      .custom(gantrySpecs.board, { name: "gantry-boards", material: APEX_PROCEDURAL_MATERIALS.gantrySignBoard(), castShadow: false, transforms: parked(GANTRY_COUNT * 2) })
      .runtime(game.runtimeNode(poolId("gantry-boards"))),
    instances
      .custom(gantrySpecs.trim, { name: "gantry-trims", material: APEX_PROCEDURAL_MATERIALS.gantryLuminaireTrim(), castShadow: false, transforms: parked(GANTRY_COUNT * 4) })
      .runtime(game.runtimeNode(poolId("gantry-trims"))),
    instances
      .custom(dressingSpecs.lightPole, { name: "light-poles", material: APEX_PROCEDURAL_MATERIALS.lightPoleSteel(), castShadow: false, transforms: parked(POLE_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("poles"))),
    instances
      .custom(dressingSpecs.lightLamp, { name: "light-lamps", material: APEX_PROCEDURAL_MATERIALS.lightLampEmitter(), castShadow: false, transforms: parked(POLE_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("pole-lamps"))),
    // AO-E2 / WP-02: sculpted fluted Y-pier columns + haunched hammerhead cap beams every 40 m (render/pylons.ts)
    instances
      .custom(pylonSpecs.column, { name: "deck-pylon-columns", material: APEX_PROCEDURAL_MATERIALS.pylonColumnConcrete(), castShadow: false, receiveShadow: false, transforms: parked(PYLON_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("pylon-columns"))),
    instances
      .custom(pylonSpecs.cap, { name: "deck-pylon-caps", material: APEX_PROCEDURAL_MATERIALS.pylonCapConcrete(), castShadow: false, receiveShadow: false, transforms: parked(PYLON_ROWS) })
      .runtime(game.runtimeNode(poolId("pylon-caps"))),
    // AO-W1 / WP-02: segmented sodium aero beacon rings, truss-braced interchange spans & space-frame billboards
    instances
      .custom(dressingSpecs.beaconRing, { name: "beacon-rings", material: APEX_PROCEDURAL_MATERIALS.beaconAeroRing(), castShadow: false, receiveShadow: false, transforms: parked(RING_ROWS * 2) })
      .runtime(game.runtimeNode(poolId("beacon-rings"))),
    instances
      .custom(dressingSpecs.spanDeck, { name: "interchange-span-decks", material: APEX_PROCEDURAL_MATERIALS.spanViaductGirder(), castShadow: false, receiveShadow: false, transforms: parked(SPAN_SLOTS) })
      .runtime(game.runtimeNode(poolId("span-decks"))),
    instances
      .custom(dressingSpecs.spanPier, { name: "interchange-span-piers", material: APEX_PROCEDURAL_MATERIALS.pylonColumnConcrete(), castShadow: false, receiveShadow: false, transforms: parked(SPAN_SLOTS * 2) })
      .runtime(game.runtimeNode(poolId("span-piers"))),
    instances
      .custom(dressingSpecs.billboardFrame, { name: "billboard-frames", material: APEX_PROCEDURAL_MATERIALS.billboardSpaceFrame(), castShadow: false, receiveShadow: false, transforms: parked(BILLBOARD_SLOTS) })
      .runtime(game.runtimeNode(poolId("billboard-frames"))),
    instances
      .box({ name: "billboard-faces", size: [...BILLBOARD_FACE_SIZE], material: material.emissive({ color: "#ffb066", emissive: APEX_PALETTE.tangerine, emissiveIntensity: 0.68, practical: true }), castShadow: false, receiveShadow: false, transforms: parked(BILLBOARD_SLOTS) })
      .runtime(game.runtimeNode(poolId("billboard-faces"))),
    // AO-A1: glass tower skyline rising from the haze, one instanced curtain-wall node per variant (3 draws). No shadows.
    ...TOWER_VARIANTS.map((variant) =>
      instances
        .box({ name: `skyline-tower-${variant}`, size: [1, 1, 1], material: material.custom(towerGlassSpec(variant)), castShadow: false, receiveShadow: false, transforms: parked(TOWER_CAPACITY_PER_VARIANT) })
        .runtime(game.runtimeNode(poolId(`tower-${variant}`)))
    ),
    instances
      .box({ name: "skyline-tower-crowns", size: [1, 1, 1], material: material.custom(towerGlassSpec("stepped")), castShadow: false, receiveShadow: false, transforms: parked(TOWER_CROWN_CAPACITY) })
      .runtime(game.runtimeNode(poolId("tower-crowns"))),
    instances
      .cylinder({ name: "skyline-tower-spires", size: [1, 1, 1], material: APEX_PROCEDURAL_MATERIALS.towerSpireSteel(), castShadow: false, receiveShadow: false, transforms: parked(TOWER_CROWN_CAPACITY) })
      .runtime(game.runtimeNode(poolId("tower-spires"))),
    instances
      .sphere({ name: "skyline-aviation-beacons", size: [0.55, 0.55, 0.55], material: material.emissive({ color: APEX_PALETTE.tangerine, emissive: APEX_PALETTE.tangerine, emissiveIntensity: 0.92, practical: true }), castShadow: false, receiveShadow: false, transforms: parked(TOWER_CROWN_CAPACITY) })
      .runtime(game.runtimeNode(poolId("tower-beacons"))),
    instances
      .custom(buildBayRidgeMountainSpec(), { name: "coastal-bay-ridge", material: buildBayRidgeStrataMaterial(), castShadow: false, receiveShadow: false, transforms: bayRidgeTransforms() })
  ]);

  // AO-W1: SDF gantry labels, one per gantry slot (positioned by the frame loop)
  GANTRY_LABELS.slice(0, GANTRY_COUNT).forEach((label, i) => {
    s.add(
      text3D(label, { backend: "sdf", size: 0.85, name: `gantry-label-${i}`, material: material.emissive({ color: "#f4f6fb", emissive: "#e8eef8", emissiveIntensity: 0.6, practical: true }), castShadow: false })
        .position(GANTRY_LABEL_OFFSET[0], GANTRY_LABEL_OFFSET[1], -200 - i * 155)
        .runtime(game.runtimeNode(`gantry-label-${i}`))
    );
  });

  // 3. Player Roadster Assembly (Primary Car + Lightbar + Headlights + Cold-Gas Plumes + Powerups + Shadow)
  // AO-M4: additive fresnel energy cones with scrolling noise and a hot core (src/art/plume.ts); same nodes, same draws
  const rearPlumeMat = material.custom(plumeSpec(APEX_PLUMES.rear, REDUCED_MOTION));
  const downPlumeMat = material.custom(plumeSpec(APEX_PLUMES.down, REDUCED_MOTION));
  const sidePlumeMat = material.custom(plumeSpec(APEX_PLUMES.side, REDUCED_MOTION));

  s.addMany([
    buildHeroSupercarNode(),
    buildHeroCanopyVisorNode(),
    buildHeroAeroSplitterNode(),
    buildHeroTaillightBarNode(),
    buildHeroHeadlightNode("l"),
    buildHeroHeadlightNode("r"),

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
        material: material.custom(plumeSpec(APEX_PLUMES.rocket, REDUCED_MOTION)), castShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("player-power-rocket")),
    primitives
      .torus({
        name: "player-power-magnet",
        size: [1.65, 1.65, 0.08],
        material: material.emissive({ color: "#c8d2e0", emissive: "#dfe7f2", emissiveIntensity: 1.5, practical: true }), castShadow: false })
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

  // 4. Ground traffic: per type, sculpted multi-material near pools (<= 19 slots: carPaint body + studioGlass cabin + forged 5-spoke wheels)
  //    for the first 90 m and a single-draw hardware-instanced far-LOD pool (clearcoat: 0) beyond, plus sculpted carrier ramps, brake bars and blinkers.
  for (const vType of VEHICLE_TYPES) {
    const vGeom = buildTrafficClassGeometries(vType);
    s.addMany([
      instances
        .custom(vGeom.nearBody, {
          name: `traffic-${vType}-near`,
          material: APEX_PROCEDURAL_MATERIALS.trafficNearBodyPaint(vType),
          castShadow: true,
          receiveShadow: true,
          transforms: parked(NEAR_CAPACITY[vType])
        })
        .runtime(game.runtimeNode(poolId(`traffic-${vType}-near`))),
      instances
        .custom(vGeom.nearGlass, {
          name: `traffic-${vType}-glass`,
          material: APEX_PROCEDURAL_MATERIALS.trafficNearGlass(),
          castShadow: false,
          receiveShadow: false,
          transforms: parked(NEAR_CAPACITY[vType])
        })
        .runtime(game.runtimeNode(poolId(`traffic-${vType}-glass`))),
      instances
        .custom(vGeom.nearTrim, {
          name: `traffic-${vType}-trim`,
          material: APEX_PROCEDURAL_MATERIALS.trafficNearWheelTrim(),
          castShadow: false,
          receiveShadow: true,
          transforms: parked(NEAR_CAPACITY[vType])
        })
        .runtime(game.runtimeNode(poolId(`traffic-${vType}-trim`))),
      instances
        .custom(vGeom.farLod, {
          name: `traffic-${vType}-far`,
          material: APEX_PROCEDURAL_MATERIALS.trafficFarHardwarePbr(),
          castShadow: false,
          receiveShadow: false,
          transforms: parked(POOL_CAPACITY[vType])
        })
        .runtime(game.runtimeNode(poolId(`traffic-${vType}-far`)))
    ]);
  }
  const skycarSpecs = buildSkycarGeometries();
  s.addMany([
    instances
      .custom(buildCarrierRampDeckSpec(), { name: "carrier-ramps", material: apexRampDeckMaterial(), castShadow: false, transforms: parked(POOL_CAPACITY.carrier) })
      .runtime(game.runtimeNode(poolId("carrier-ramps"))),
    instances
      .custom(buildCarrierRampRailSpec(), { name: "carrier-ramp-rails", material: APEX_PROCEDURAL_MATERIALS.forgedAlloyMetal(), castShadow: false, transforms: parked(POOL_CAPACITY.carrier * 2) })
      .runtime(game.runtimeNode(poolId("carrier-ramp-rails"))),
    instances
      .custom(buildCarrierRampChevronSpec(), { name: "carrier-ramp-chevrons", material: material.emissive({ color: "#ffd28a", emissive: APEX_PALETTE.tangerine, emissiveIntensity: 1.5, practical: true }), castShadow: false, transforms: parked(POOL_CAPACITY.carrier * 3) })
      .runtime(game.runtimeNode(poolId("carrier-ramp-chevrons"))),
    // GU47 phase 3 (rubric shadows: traffic read as floating): soft contact occlusion under the near traffic, the decal
    // shader's contact ellipse on its own instanced plane (+1 draw, <= TRAFFIC_CONTACT_CAPACITY live, fades by 160 m)
    instances
      .plane({ name: "traffic-contact", material: material.custom(decalSpec()), castShadow: false, receiveShadow: false, transforms: parked(TRAFFIC_CONTACT_CAPACITY) })
      .runtime(game.runtimeNode(poolId("traffic-contact"))),
    instances
      .box({ name: "traffic-brake-lights", size: [1.58, 0.16, 0.09], material: material.emissive({ color: "#ff1e27", emissive: "#ff1e27", emissiveIntensity: 2.1, practical: true }), castShadow: false, transforms: parked(BRAKE_BAR_CAPACITY) })
      .runtime(game.runtimeNode(poolId("brake-lights"))),
    instances
      .sphere({ name: "traffic-blinkers", size: [0.28, 0.2, 0.34], material: material.emissive({ color: "#ffaa1d", emissive: "#ff9900", emissiveIntensity: 2.2, practical: true }), castShadow: false, transforms: parked(BLINKER_CAPACITY) })
      .runtime(game.runtimeNode(poolId("blinkers")))
  ]);

  // 5. Sky-lane traffic: sculpted aero-interceptors with ducted fans, swept winglets & canted rival-red V-tailfins
  s.addMany([
    instances
      .custom(skycarSpecs.nearSpec, { name: "sky-cars", material: APEX_PROCEDURAL_MATERIALS.skycarNearHardwareMetal(), castShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-cars"))),
    // sky cars beyond 90 m: hardware-instanced far LOD, no shadow
    instances
      .custom(skycarSpecs.farSpec, { name: "sky-cars-far", material: APEX_PROCEDURAL_MATERIALS.skycarFarHardwarePbr(), castShadow: false, receiveShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-cars-far"))),
    instances
      .cylinder({ name: "sky-plumes", size: [0.42, 1.65, 0.42], material: material.custom(plumeSpec(APEX_PLUMES.sky, REDUCED_MOTION, true)), castShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-plumes"))),
    instances
      .torus({ name: "sky-halos", size: [1.55, 1.55, 0.075], material: material.emissive({ color: "#ff2a3c", emissive: "#ff2a3c", emissiveIntensity: 1.65, practical: true }), castShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("sky-halos"))),
    // AO-V1: wakes drawn game-side (render/wakes.ts): the cyan twin-thruster wake of the player (world-anchored points, so it
    // streams back past the camera and bends with lane changes) and one red streak behind each drawn rival. 2 draws.
    instances
      .plane({ name: "apex-player-wake", material: material.custom(wakeSpec(PLAYER_WAKE_COLOR, 0.2, [40, 90])), castShadow: false, receiveShadow: false, transforms: parked(APEX_WAKE_CAPACITY) })
      .runtime(game.runtimeNode(poolId("player-wake"))),
    instances
      .plane({ name: "apex-rival-wakes", material: material.custom(wakeSpec(RIVAL_WAKE_COLOR, 1, [140, 320])), castShadow: false, receiveShadow: false, transforms: parked(POOL_CAPACITY.skyCar) })
      .runtime(game.runtimeNode(poolId("rival-wakes"))),
    instances
      .plane({ name: "tail-light-ribbons", material: material.custom(wakeSpec(APEX_PALETTE.tail, 0.16, [28, 72])), castShadow: false, receiveShadow: false, transforms: parked(APEX_WAKE_CAPACITY) })
      .runtime(game.runtimeNode(poolId("tail-ribbons"))),
    instances
      .plane({ name: "wingtip-vortex-ribbons", material: material.custom(wakeSpec("#bae6fd", 0.12, [34, 84])), castShadow: false, receiveShadow: false, transforms: parked(APEX_WAKE_CAPACITY) })
      .runtime(game.runtimeNode(poolId("wingtip-vortices"))),
    primitives
      .plane({ name: "vfx-spark-burst", size: [2.1, 2.1], material: material.custom(flipbookBurstSpec(sparkAtlas, APEX_PALETTE.tangerine, true)), castShadow: false, receiveShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("vfx-spark-burst")),
    primitives
      .plane({ name: "vfx-smoke-burst", size: [2.5, 1.8], material: material.custom(flipbookBurstSpec(smokeAtlas, "#dce6f5", false)), castShadow: false, receiveShadow: false })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("vfx-smoke-burst"))
  ]);

  // 6. Pickups: hardware-instanced faceted crystal bolts (clearcoat: 0) and sculpted multi-tone power-up emblems
  s.add(
    instances
      .custom(buildBoltCrystalSpec(), { name: "pickup-bolts", material: APEX_PROCEDURAL_MATERIALS.boltCrystalHardwarePbr(), castShadow: false, transforms: parked(POOL_CAPACITY.bolt) })
      .runtime(game.runtimeNode(poolId("bolts")))
  );
  for (const kind of POWERUP_KINDS) {
    const look = POWERUP_LOOK[kind];
    s.add(
      instances
        .custom(buildPowerupEmblemSpec(kind), {
          name: `pickup-${kind}`,
          material: APEX_PROCEDURAL_MATERIALS.powerupEmblemMaterial(look.color),
          castShadow: false,
          transforms: parked(POOL_CAPACITY.powerup[kind])
        })
        .runtime(game.runtimeNode(poolId(`power-${kind}`)))
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

/** Drives the `#boot` meter (width and percent label) from the shared loading-progress fraction. */
function paintBootProgress(fraction: number): void {
  const boot = document.getElementById("boot");
  const fill = boot?.querySelector<HTMLElement>(".boot-line i");
  const pct = boot?.querySelector<HTMLElement>(".boot-pct");
  if (fill) {
    fill.style.animation = "none";
    fill.style.transform = `scaleX(${fraction})`;
  }
  if (pct) pct.textContent = `${Math.round(fraction * 100)}%`;
}

/**
 * The lab fragments this game takes: `?backend=` (renderer backend + allowFallback, merged into the game's renderer options)
 * and `?gamut=p3` (output), and `?worker=1` (worker rendering; the game loop stays on the main thread, fallback kept).
 */
function labRendererAndOutput(): Pick<ReturnType<typeof labAppOptions>, "renderer" | "output"> & { worker?: { fallback: "main-thread"; createWorker: () => Worker } } {
  // WebGPU by default (backend "auto", WebGL2 fallback kept; real-GPU check 2026-11-09 after WebGPU perf round 3: same frame, >= 0.92x WebGL2 fps); ?backend=webgl2 opts out.
  const { renderer, output, worker } = labAppOptions(readLabFlags(), { backend: "auto", createWorker: createWorkerRendererWorker });
  return { ...(renderer ? { renderer } : {}), ...(output ? { output } : {}), ...(worker ? { worker } : {}) };
}

async function bootRoadsterRushAura3D(): Promise<void> {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("Missing #game canvas element for Roadster Rush.");
  }

  // A1: the boot meter follows real boot work (it was a fixed 1.4 s animation over a static "100%" label).
  const loading = createLoadingProgress({ onProgress: paintBootProgress });
  loading.set(0.08);
  const builtScene = buildRoadsterRushScene();
  loading.set(0.2);
  const lab = labRendererAndOutput();
  const cinemaWarmLut = createGradingLut("cinema-warm");
  const auraApp = createAuraApp(canvas, {
    scene: builtScene,
    ...(COARSE_POINTER ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.35) } : {}),
    // "auto": the tier follows the device once the quality lane is on; with it off the mount resolves to "high", as before.
    // A3 (lab only): `?backend=webgpu|auto` is forwarded now that every custom shader carries a WGSL twin (W6); absent,
    // the renderer options are exactly `{ quality: "auto" }` (WebGL2 default).
    renderer: { quality: "auto", ...lab.renderer },
    // WP-06 Eevee AgX filmic output + subtle cinema-warm 3D strip LUT + dither; lab `?gamut=p3` merges cleanly.
    output: { toneMapping: "agx", exposure: 1.06, dither: true, lut: { ...cinemaWarmLut, intensity: 0.22 }, ...lab.output } as never,
    // `?worker=1` (lab, default off): render in a worker; the game loop stays on the main thread. Fallback kept.
    ...(lab.worker ? { worker: lab.worker } : {}),
    qualityRebuild: { flags: ["game"] }
  });

  const req = (id: string) => auraApp.nodes.require(id);
  const pool = (name: string, capacity: number) => new InstancePool(req(poolId(name)), capacity);

  // Resolve Player Handles
  const playerHandles: PlayerHandles = {
    car: req("player-roadster-car"),
    canopyVisor: req("player-canopy-visor"),
    aeroSplitter: req("player-aero-splitter"),
    lightbar: req("player-lightbar"),
    headlightL: req("player-headlight-l"),
    headlightR: req("player-headlight-r"),
    headlampConeL: req("apex-headlamp-cone-l"),
    headlampConeR: req("apex-headlamp-cone-r"),
    rearPlumeL: req("player-plume-rear-l"),
    rearPlumeR: req("player-plume-rear-r"),
    downPlumes: Array.from({ length: 4 }, (_, i) => req(`player-plume-down-${i}`)),
    sidePlumesL: Array.from({ length: 2 }, (_, i) => req(`player-plume-side-l-${i}`)),
    sidePlumesR: Array.from({ length: 2 }, (_, i) => req(`player-plume-side-r-${i}`)),
    shieldSphere: req("player-power-shield"),
    rocketCone: req("player-power-rocket"),
    magnetRing: req("player-power-magnet")
  };
  const lightbarMatCold = APEX_PROCEDURAL_MATERIALS.heroTailLightbarMaterial(false);
  const lightbarMatHot = APEX_PROCEDURAL_MATERIALS.heroTailLightbarMaterial(true);

  // Resolve Freeway & Environment Handles
  const outerGroundHandle = req("freeway-outer-ground");
  const asphaltDeckHandle = req("freeway-asphalt-deck");
  const wetRutsHandle = req("freeway-wet-ruts");
  const freewayBarriersHandle = req("freeway-barriers");
  const freewayCorridorHandle = req("freeway-roadside-corridor");
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
  const decalPool = pool("road-decals", DECAL_CAPACITY);
  const gantrySteel = pool("gantry-steel", GANTRY_COUNT * 3);
  const gantryBoards = pool("gantry-boards", GANTRY_COUNT * 2);
  const gantryTrims = pool("gantry-trims", GANTRY_COUNT * 4);
  const polePool = pool("poles", POLE_ROWS * 2);
  const lampPool = pool("pole-lamps", POLE_ROWS * 2);
  const towerPools = {} as Record<TowerVariant, InstancePool>;
  for (const variant of TOWER_VARIANTS) towerPools[variant] = pool(`tower-${variant}`, TOWER_CAPACITY_PER_VARIANT);
  const towerCrownPool = pool("tower-crowns", TOWER_CROWN_CAPACITY);
  const towerSpirePool = pool("tower-spires", TOWER_CROWN_CAPACITY);
  const towerBeaconPool = pool("tower-beacons", TOWER_CROWN_CAPACITY);
  const towerCrownHandle = req(poolId("tower-crowns"));
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
  const trafficNearGlass = {} as Record<VehicleType, InstancePool>;
  const trafficNearTrim = {} as Record<VehicleType, InstancePool>;
  const trafficFar = {} as Record<VehicleType, InstancePool>;
  for (const vType of VEHICLE_TYPES) {
    trafficNear[vType] = pool(`traffic-${vType}-near`, NEAR_CAPACITY[vType]);
    trafficNearGlass[vType] = pool(`traffic-${vType}-glass`, NEAR_CAPACITY[vType]);
    trafficNearTrim[vType] = pool(`traffic-${vType}-trim`, NEAR_CAPACITY[vType]);
    trafficFar[vType] = pool(`traffic-${vType}-far`, POOL_CAPACITY[vType]);
  }
  const rampPool = pool("carrier-ramps", POOL_CAPACITY.carrier);
  const rampRailPool = pool("carrier-ramp-rails", POOL_CAPACITY.carrier * 2);
  const rampChevronPool = pool("carrier-ramp-chevrons", POOL_CAPACITY.carrier * 3);
  const brakePool = pool("brake-lights", BRAKE_BAR_CAPACITY);
  const trafficContactPool = pool("traffic-contact", TRAFFIC_CONTACT_CAPACITY);
  const blinkerPool = pool("blinkers", BLINKER_CAPACITY);
  const skyCarPool = pool("sky-cars", POOL_CAPACITY.skyCar);
  const skyCarFarPool = pool("sky-cars-far", POOL_CAPACITY.skyCar);
  const skyPlumePool = pool("sky-plumes", POOL_CAPACITY.skyCar);
  const skyHaloPool = pool("sky-halos", POOL_CAPACITY.skyCar);
  // AO-V1 / WP-06 wakes: world-anchored twin-thruster wake, tail-light ribbons, wingtip vortices, and rival streak pool
  const playerWakePool = pool("player-wake", APEX_WAKE_CAPACITY);
  const rivalWakePool = pool("rival-wakes", POOL_CAPACITY.skyCar);
  const tailRibbonPool = pool("tail-ribbons", APEX_WAKE_CAPACITY);
  const wingtipVortexPool = pool("wingtip-vortices", APEX_WAKE_CAPACITY);
  const sparkBurstHandle = req("vfx-spark-burst");
  const smokeBurstHandle = req("vfx-smoke-burst");
  const wakeHandles = [req(poolId("player-wake")), req(poolId("rival-wakes")), req(poolId("tail-ribbons")), req(poolId("wingtip-vortices"))];
  const playerWakeOptions = { life: wakeLife(APEX_PLAYER_WAKE.life, REDUCED_MOTION), headWidth: APEX_PLAYER_WAKE.headWidth, tailWidth: APEX_PLAYER_WAKE.tailWidth };
  const tailRibbonOptions = { life: wakeLife(0.24, REDUCED_MOTION), headWidth: 0.14, tailWidth: 0.03 };
  const wingtipVortexOptions = { life: wakeLife(0.3, REDUCED_MOTION), headWidth: 0.1, tailWidth: 0.02 };
  const rivalWakeLife = wakeLife(APEX_RIVAL_WAKE.life, REDUCED_MOTION);
  const wakeTrails = APEX_PLAYER_WAKE.nozzles.map(() => new WakeTrail(playerWakeOptions.life, APEX_PLAYER_WAKE.segments));
  const tailTrails = [[-0.68, 0.72, 2.12] as Vec3, [0.68, 0.72, 2.12] as Vec3].map(() => new WakeTrail(tailRibbonOptions.life, 10));
  const wingtipTrails = [[-1.08, 0.56, 1.45] as Vec3, [1.08, 0.56, 1.45] as Vec3].map(() => new WakeTrail(wingtipVortexOptions.life, 10));
  const wakeScratch: WakeSegment[] = [];
  const wakeDrawn = { player: 0, rivals: 0 };
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

  // Camera feel (audit RR-E2 / WP-06): real-dt `createImpactRig` + `createCameraShake` + `createHitStop` + 2-DOF visual chassis suspension.
  const shake = createCameraShake({ maxOffset: 0.22, maxRoll: 0.02, decayPerSecond: 1.8 });
  const hitStop = createHitStop();
  const impactRig = createImpactRig({ reducedMotion: REDUCED_MOTION });
  let hitStopHeld = false;
  let lastMode = "";
  let chaseX = 0;
  let camDrop = 0;
  let lastBank = 0;
  let lastFrameMs = 0;
  let lastFovKick = -1;
  let suspPitch = 0;
  let suspPitchVel = 0;
  let lastBoosting = false;
  let sparkBurstAge = -1;
  let sparkBurstPos: Vec3 = [0, 0, -1.15];
  let smokeBurstAge = -1;
  let smokeBurstPos: Vec3 = [0, 0, -1.15];

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
    const toward = frame.keyDir;
    const blend = { transitionSeconds: 0.35 };
    keyLight?.setLight?.({ color: frame.sun.color, intensity: frame.sun.intensity, direction: [-toward[0], -toward[1], -toward[2]] }, blend);
    fillLight?.setLight?.({ color: frame.fill.color, intensity: frame.fill.intensity }, blend);
    auraApp.lighting?.setEnvironmentIntensity?.(frame.environmentIntensity);
    // overrideSceneFog: the volumetric god-ray node would otherwise make setFog skip the look's fog node (E-B default)
    auraApp.atmosphere?.setFog?.(
      { color: frame.fog.color, near: APEX_SCENE_FOG_RANGE.near, far: APEX_SCENE_FOG_RANGE.far, maxOpacity: 0.26, affectsBackground: false },
      { ...blend, overrideSceneFog: true }
    );
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
    // AO-V1: the wakes brighten toward night with the tail-light gain (the red rivers)
    for (const handle of wakeHandles) handle.setUniform?.("wakeIntensity", wakeIntensity(frame.signature.tailGain) as never);
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
    const showCones = beams > 0.02 || look.nightAmount > 0.15;
    playerHandles.headlampConeL.setVisible(showCones);
    playerHandles.headlampConeR.setVisible(showCones);

    // AO-A1: the tower glass and rooftop crowns reflect the same dome row and light their floors toward night
    for (const tower of [...TOWER_VARIANTS.map((v) => towerHandles[v]), towerCrownHandle]) {
      tower.setUniform?.("glassSky", look.skyTop as never);
      tower.setUniform?.("glassHorizon", look.skyHorizon as never);
      tower.setUniform?.("sunDirection", look.sunDir as never);
      tower.setUniform?.("sunTint", look.sunColor as never);
      tower.setUniform?.("sunGlint", round3(1.2 * (1 - look.nightAmount)) as never);
      tower.setUniform?.("windowsLit", round3(frame.signature.windowSpecks) as never);
      tower.setUniform?.("hazeColor", hexToUnit(frame.signature.hazeColor) as never);
      tower.setUniform?.("crownGain", round3(0.3 + 0.9 * look.nightAmount) as never);
    }

    // WP-06: sync wet wheel-rut specular glaze with dome sky, sun direction and dusk attenuation
    wetRutsHandle.setUniform?.("rutSkyColor", look.skyMid as never);
    wetRutsHandle.setUniform?.("rutSunColor", look.sunColor as never);
    wetRutsHandle.setUniform?.("rutSunDir", look.sunDir as never);
    wetRutsHandle.setUniform?.("rutSunGain", round3(0.68 * (1 - look.nightAmount * 0.72)) as never);

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
    qaApex.vfx = { presets: vfxKinds, fired: vfxFired, liveCount: auraApp.effects?.liveCount ?? 0, speedLinesAccepted, wakes: { ...wakeDrawn } };
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
      if (kind === "apex-land") {
        fireVfx(kind, [carAt[0], 0.05, carAt[2]]);
        sparkBurstAge = 0;
        sparkBurstPos = [carAt[0], 0.42, carAt[2] + 0.9];
        smokeBurstAge = 0;
        smokeBurstPos = [carAt[0], 0.36, carAt[2] + 1.35];
        suspPitchVel += 0.36;
      } else if (kind === "apex-rocket") {
        fireVfx(kind, [carAt[0], carAt[1], carAt[2] + 2.6]);
      } else if (kind === "apex-skykill") {
        fireVfx(kind, [carAt[0], carAt[1] + 1.2, carAt[2] - 3]);
        if (!real.manual) impactRig.trigger({ freezeSeconds: 0.032, trauma: 0.35, fovKickDeg: 3.5 });
      } else {
        fireVfx(kind, carAt);
        if (kind === "apex-crash") {
          sparkBurstAge = 0;
          sparkBurstPos = [carAt[0], carAt[1] + 0.35, carAt[2]];
          smokeBurstAge = 0;
          smokeBurstPos = [carAt[0], carAt[1] + 0.5, carAt[2]];
        }
      }
    }
    vfxPrev = frame;
    const lines = real.mode === "playing" ? apexSpeedLines(Number(p.speed ?? 0), Boolean(p.boostVisual ?? p.boosting), frame.rocketActive, REDUCED_MOTION) : 0;
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
      if (!REDUCED_MOTION) {
        shake.add(pulse * 0.6);
        if (pulse > 0.35 && py < 1.2) {
          sparkBurstAge = 0;
          sparkBurstPos = [px - chaseX + (px < 0 ? -0.85 : 0.85), 0.45 + camDrop, -1.15];
        }
      }
      real.player.shakePulse = 0;
    }
    const sh = shake.update(realDt);
    if (real.mode === "crashed" && lastMode === "playing" && !real.manual) {
      hitStop.trigger(110);
      impactRig.trigger({ freezeSeconds: 0.11, trauma: 0.72, fovKickDeg: -2.5 });
      startFlash("crash");
    }
    lastMode = real.mode;
    const rocketActive = Number(real.player.rocketTimer ?? 0) > 0;
    const boostingNow = Boolean(p.boostVisual ?? p.boosting);
    if (boostingNow && !lastBoosting && real.mode === "playing" && !real.manual) {
      impactRig.trigger({ freezeSeconds: 0, trauma: 0.18, fovKickDeg: 5.5 });
      smokeBurstAge = 0;
      smokeBurstPos = [px - chaseX, Math.max(0.32, py * 0.15 + 0.32 + camDrop), 0.65];
    }
    lastBoosting = boostingNow;
    if (rocketActive && !lastRocketActive && real.mode === "playing") {
      startFlash("rocket");
      startSlowMo(nowMs);
      if (!real.manual) impactRig.trigger({ freezeSeconds: 0.035, trauma: 0.42, fovKickDeg: 6.5 });
    }
    // a ramp launch starts the flip (read-only): slow-mo with letterbox bars + crisp 35 ms launch hit-stop
    const flipping = Boolean(real.player.flipping);
    if (flipping && !lastFlipping && real.mode === "playing") {
      startSlowMo(nowMs);
      if (!real.manual) impactRig.trigger({ freezeSeconds: 0.035, trauma: 0.34, fovKickDeg: 5.5 });
      sparkBurstAge = 0;
      sparkBurstPos = [px - chaseX, Math.max(0.45, py * 0.15 + 0.45 + camDrop), 0.4];
    }
    lastFlipping = flipping;
    lastRocketActive = rocketActive;
    updateFlash(nowMs);
    driveVfx(real, nowMs, realDt);
    hitStop.update(realDt);
    const impactStep = impactRig.step(realDt);
    const anyFrozen = hitStop.active || impactStep.frozen;
    if (anyFrozen !== hitStopHeld) {
      hitStopHeld = anyFrozen;
      real.simPaused = hitStopHeld;
    }
    const boostFlyKick = (boostingNow || rocketActive || !p.grounded) && real.mode === "playing" ? 5.5 : 0;
    const baseFovKick = clamp(Number(p.speedLinesAmount ?? 0), 0, 1) * 7;
    const fovKick = REDUCED_MOTION ? 0 : Math.round(clamp(Math.max(baseFovKick, boostFlyKick * 0.78) + impactStep.fovDeltaDeg * 0.6, -4, 9.5) * 10) / 10;
    if (fovKick !== lastFovKick) {
      lastFovKick = fovKick;
      try {
        auraApp.camera?.fovKick.set("speed", fovKick, 0.18);
      } catch {
        /* camera controller not mounted */
      }
    }

    // 2-DOF presentation-only chassis pitch suspension: squat on boost, dive on brake, damped rebound on landing
    const targetSuspPitch = REDUCED_MOTION
      ? 0
      : ((boostingNow || rocketActive ? -0.034 : 0) + (Number(p._brake ?? 0) > 0.15 ? 0.038 : 0)) * (p.grounded ? 1 : 0.35);
    suspPitchVel += ((targetSuspPitch - suspPitch) * 68 - suspPitchVel * 11.5) * realDt;
    suspPitch = clamp(suspPitch + suspPitchVel * realDt, -0.085, 0.085);

    // Camera-anchored relative transform: the @aura3d/engine camera sits at [0, 3.6, 5.2] looking at [0, 0.6, -6.0].
    // World coordinates are shifted by the chase anchor, so the player car stays in front of the camera while the freeway,
    // traffic, sky cars and bolts move past. The anchor lags lane changes a little, rises with altitude and carries the shake.
    const targetX = px * 0.65;
    chaseX = real.manual ? targetX : chaseX + (targetX - chaseX) * (1 - Math.exp(-9 * realDt));
    const camAnchorX = chaseX + sh.x + impactStep.shakeOffset[0] * 0.45;
    // AO-C2: the camera drops from 3.6 to 2.7 m with speed (the world lifts by the drop) and banks into lane changes
    const chase = chaseCameraOffsets(Number(p.speed ?? 0), Number(real.player._laneVel ?? 0), REDUCED_MOTION);
    camDrop += (chase.drop - camDrop) * (1 - Math.exp(-3 * realDt));
    const bank = Math.round((chase.roll + impactStep.shakeRoll * 0.35) * 2000) / 2000;
    if (bank !== lastBank) {
      lastBank = bank;
      try {
        auraApp.camera?.setRoll(bank, { halflife: 0.14 });
      } catch {
        /* camera controller not mounted */
      }
    }
    const camAnchorY = Math.max(0, py * 0.85) + sh.y + impactStep.shakeOffset[1] * 0.45 - camDrop;
    const rx = (wx: number) => wx - camAnchorX;
    const ry = (wy: number) => wy - camAnchorY;
    const rz = (wz: number) => wz - pz;

    // 1. Freeway deck, wet wheel ruts, and batched bilateral Jersey barriers + roadside corridor
    const centerZ = -150;
    outerGroundHandle.setPosition(rx(0), ry(HAZE_FLOOR_Y), -300);
    outerGroundHandle.setUniform?.("scroll", [camAnchorX, pz] as never);
    asphaltDeckHandle.setPosition(rx(0), ry(-0.06), centerZ);
    wetRutsHandle.setPosition(rx(0), ry(0.005), centerZ);
    wetRutsHandle.setUniform?.("roadScrollZ", pz as never);
    freewayBarriersHandle.setPosition(rx(0), ry(0), centerZ);
    freewayCorridorHandle.setPosition(rx(0), ry(0), centerZ);

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
    decalPool.begin();
    for (const d of decalLayout(pz)) {
      const size = DECAL_SIZE[d.kind];
      decalPool.add(rx(d.x), ry(DECAL_Y), rz(d.z), 0, d.yaw, 0, size[0], DECAL_KIND_CODE[d.kind], size[1]);
    }
    // GU47 phase 3: soft contact occlusion under the hero in the decal pool's reserved slot (same draw), gone by 4 m up
    if (py < 4) decalPool.add(rx(px), ry(DECAL_Y + 0.002), -1.15, 0, 0, 0, CONTACT_SIZE[0], contactScaleY(py), CONTACT_SIZE[1]);
    decalPool.commit();

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

    // Highway light poles (integrated shaft + davit arm + cobra-head shield hood), world-anchored rows
    polePool.begin();
    lampPool.begin();
    const poleBaseZ = Math.floor(pz / POLE_STRIDE_Z) * POLE_STRIDE_Z + POLE_STRIDE_Z - 14;
    for (let row = 0; row < POLE_ROWS; row++) {
      const poleZ = rz(poleBaseZ - row * POLE_STRIDE_Z);
      for (const side of [-1, 1] as const) {
        const poleX = rx(side * 12.1);
        polePool.add(poleX, ry(3.8), poleZ, 0, side > 0 ? Math.PI : 0, 0);
        lampPool.add(poleX - side * 1.55, ry(7.44), poleZ);
      }
    }
    polePool.commit();
    lampPool.commit();
    // AO-L3: the sodium spots hang under the lamp heads of the next three pole rows, alternating sides
    for (let k = 0; k < sodiumSpots.length; k++) {
      const spot = sodiumSpots[k];
      if (!spot) continue;
      const side = k % 2 === 0 ? -1 : 1;
      spot.setPosition(rx(side * 10.55), ry(7.3), rz(poleBaseZ - (k + 1) * POLE_STRIDE_Z));
    }

    // AO-A1 / WP-06: glass towers + architectural penthouse crowns, spires and aviation beacons
    for (const variant of TOWER_VARIANTS) towerPools[variant].begin();
    towerCrownPool.begin();
    towerSpirePool.begin();
    towerBeaconPool.begin();
    const towers = towerLayout(pz);
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i]!;
      towerPools[t.variant].add(rx(t.x), ry(t.y), rz(t.z), 0, t.yaw, 0, t.width, t.height, t.depth);
    }
    const crownParts = towerCrownLayout(towers);
    for (const c of crownParts.crowns) towerCrownPool.add(rx(c.x), ry(c.y), rz(c.z), 0, c.yaw, 0, c.sx, c.sy, c.sz);
    for (const sp of crownParts.spires) towerSpirePool.add(rx(sp.x), ry(sp.y), rz(sp.z), 0, sp.yaw, 0, sp.sx, sp.sy, sp.sz);
    const beaconPulse = REDUCED_MOTION ? 1 : 0.72 + 0.28 * Math.sin(simTime * 3.2);
    for (const b of crownParts.beacons) towerBeaconPool.add(rx(b.x), ry(b.y), rz(b.z), 0, 0, 0, beaconPulse, beaconPulse, beaconPulse);
    for (const variant of TOWER_VARIANTS) towerPools[variant].commit();
    towerCrownPool.commit();
    towerSpirePool.commit();
    towerBeaconPool.commit();

    updateAtmosphereForTod(Number(g.world?.timeOfDay ?? 0));

    // 3. Sync Player Roadster Assembly, Thruster Plumes, Active Powerups & Contact Shadow
    const pitch = Number(p.pivot?.rotation?.x ?? p._pitch ?? 0) + suspPitch;
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
    const bodyMat = bodyMatrixFromYXZ(pitch, yaw, roll);
    const [rotX, rotY, rotZ] = eulerZYXFromMat3(bodyMat, yaw);

    playerHandles.car
      .setPosition(pRoot[0], pRoot[1], pRoot[2])
      .setRotation(rotX, rotY, rotZ)
      .setScale(squash)
      .setVisible(true);

    const canopyWorld = rotateOffsetByMat3(pRoot, bodyMat, [0, 0.96, -0.08]);
    playerHandles.canopyVisor
      .setPosition(canopyWorld[0], canopyWorld[1], canopyWorld[2])
      .setRotation(rotX, rotY, rotZ)
      .setScale(squash)
      .setVisible(true);

    const splitterWorld = rotateOffsetByMat3(pRoot, bodyMat, [0, 0.22, -2.06]);
    playerHandles.aeroSplitter
      .setPosition(splitterWorld[0], splitterWorld[1], splitterWorld[2])
      .setRotation(rotX, rotY, rotZ)
      .setScale(squash)
      .setVisible(true);

    const lbWorld = rotateOffsetByMat3(pRoot, bodyMat, [0, 0.72, 2.12]);
    playerHandles.lightbar
      .setPosition(lbWorld[0], lbWorld[1], lbWorld[2])
      .setRotation(rotX, rotY, rotZ)
      .setVisible(true);

    const isHotTail = Boolean((p._brake ?? 0) > 0.15 || (p.boostVisual ?? p.boosting) || (p.rocketTimer ?? 0) > 0);
    if (isHotTail !== lastLightbarHot) {
      lastLightbarHot = isHotTail;
      playerHandles.lightbar.setMaterial(isHotTail ? lightbarMatHot : lightbarMatCold);
    }

    const hlLeftW = rotateOffsetByMat3(pRoot, bodyMat, [-0.74, 0.56, -2.08]);
    const hlRightW = rotateOffsetByMat3(pRoot, bodyMat, [0.74, 0.56, -2.08]);
    playerHandles.headlightL
      .setPosition(hlLeftW[0], hlLeftW[1], hlLeftW[2])
      .setRotation(rotX, rotY, rotZ)
      .setVisible(true);
    playerHandles.headlightR
      .setPosition(hlRightW[0], hlRightW[1], hlRightW[2])
      .setRotation(rotX, rotY, rotZ)
      .setVisible(true);
    headlights[0]?.setPosition(hlLeftW[0], hlLeftW[1], hlLeftW[2] - 0.2);
    headlights[1]?.setPosition(hlRightW[0], hlRightW[1], hlRightW[2] - 0.2);
    playerHandles.headlampConeL.setPosition(hlLeftW[0], hlLeftW[1] - 0.04, hlLeftW[2] - 0.2);
    playerHandles.headlampConeR.setPosition(hlRightW[0], hlRightW[1] - 0.04, hlRightW[2] - 0.2);

    // Cold-Gas Thruster Plumes (no 8.8 Hz flicker under reduced motion, audit RR-E4)
    const rearPlumeLevel = clamp(
      Math.max(
        Number(p._rearPlume ?? 0),
        (p.boostVisual ?? p.boosting) ? 1.0 : 0,
        (p.rocketTimer ?? 0) > 0 ? 1.35 : 0,
        g.mode === "playing" ? 0.28 : 0
      ),
      0,
      1.45
    );
    const flicker = REDUCED_MOTION ? 1 : 0.92 + Math.sin(simTime * 55) * 0.08;
    const [rearRotX, rearRotY, rearRotZ] = eulerZYXFromMat3(mulMat3(bodyMat, HERO_PLUME_LOCAL_MATS.rear), yaw);
    if (rearPlumeLevel > 0.04) {
      const rpL = rotateOffsetByMat3(pRoot, bodyMat, [-0.42, 0.46, 2.45 + rearPlumeLevel * 0.35]);
      const rpR = rotateOffsetByMat3(pRoot, bodyMat, [0.42, 0.46, 2.45 + rearPlumeLevel * 0.35]);
      const pScale: Vec3 = [
        0.75 * rearPlumeLevel * flicker,
        1.1 * rearPlumeLevel * flicker,
        0.75 * rearPlumeLevel * flicker
      ];
      playerHandles.rearPlumeL
        .setPosition(rpL[0], rpL[1], rpL[2])
        .setRotation(rearRotX, rearRotY, rearRotZ)
        .setScale(pScale)
        .setVisible(true);
      playerHandles.rearPlumeR
        .setPosition(rpR[0], rpR[1], rpR[2])
        .setRotation(rearRotX, rearRotY, rearRotZ)
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
    const [downRotX, downRotY, downRotZ] =
      downPlumeLevel > 0.04 ? eulerZYXFromMat3(mulMat3(bodyMat, HERO_PLUME_LOCAL_MATS.down), yaw) : [0, 0, 0];
    const downOffsets: Vec3[] = [
      [-0.64, -0.18, -0.95],
      [0.64, -0.18, -0.95],
      [-0.64, -0.18, 1.05],
      [0.64, -0.18, 1.05]
    ];
    for (let i = 0; i < 4; i++) {
      const dh = playerHandles.downPlumes[i]!;
      if (downPlumeLevel > 0.04) {
        const dw = rotateOffsetByMat3(pRoot, bodyMat, downOffsets[i]!);
        dh.setPosition(dw[0], dw[1], dw[2])
          .setRotation(downRotX, downRotY, downRotZ)
          .setScale([0.85 * downPlumeLevel, 1.15 * downPlumeLevel * flicker, 0.85 * downPlumeLevel])
          .setVisible(true);
      } else {
        dh.setScale(HIDDEN_SCALE).setVisible(false);
      }
    }

    const sideL = clamp(Number(p._sidePlumeL ?? 0), 0, 1.2);
    const sideR = clamp(Number(p._sidePlumeR ?? 0), 0, 1.2);
    const [sideLRotX, sideLRotY, sideLRotZ] =
      sideL > 0.04 ? eulerZYXFromMat3(mulMat3(bodyMat, HERO_PLUME_LOCAL_MATS.sideLeft), yaw) : [0, 0, 0];
    const [sideRRotX, sideRRotY, sideRRotZ] =
      sideR > 0.04 ? eulerZYXFromMat3(mulMat3(bodyMat, HERO_PLUME_LOCAL_MATS.sideRight), yaw) : [0, 0, 0];
    const sideZOffsets = [-1.45, 1.45];
    for (let i = 0; i < 2; i++) {
      const shL = playerHandles.sidePlumesL[i]!;
      if (sideL > 0.04) {
        const lw = rotateOffsetByMat3(pRoot, bodyMat, [-1.18, 0.48, sideZOffsets[i]!]);
        shL
          .setPosition(lw[0], lw[1], lw[2])
          .setRotation(sideLRotX, sideLRotY, sideLRotZ)
          .setScale([0.8 * sideL, 1.1 * sideL * flicker, 0.8 * sideL])
          .setVisible(true);
      } else {
        shL.setScale(HIDDEN_SCALE).setVisible(false);
      }

      const shR = playerHandles.sidePlumesR[i]!;
      if (sideR > 0.04) {
        const rw = rotateOffsetByMat3(pRoot, bodyMat, [1.18, 0.48, sideZOffsets[i]!]);
        shR
          .setPosition(rw[0], rw[1], rw[2])
          .setRotation(sideRRotX, sideRRotY, sideRRotZ)
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
      const [shRotX, shRotY, shRotZ] = eulerZYXFromMat3(bodyMatrixFromYXZ(pitch * 0.5, yaw, roll * 0.5), yaw);
      playerHandles.shieldSphere
        .setPosition(pRoot[0], pRoot[1] + 0.72, pRoot[2])
        .setRotation(shRotX, shRotY, shRotZ)
        .setScale([1, 1, 1])
        .setVisible(true);
      playerHandles.shieldSphere.setUniform?.("shieldPulse", clamp(shieldFade, 0, 1) * shieldBlink);
    } else {
      playerHandles.shieldSphere.setScale(HIDDEN_SCALE).setVisible(false);
    }

    if ((p.rocketTimer ?? 0) > 0) {
      const rkW = rotateOffsetByMat3(pRoot, bodyMat, [0, 0.52, 3.1]);
      playerHandles.rocketCone
        .setPosition(rkW[0], rkW[1], rkW[2])
        .setRotation(rearRotX, rearRotY, rearRotZ)
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

    // AO-V1: the cyan twin-thruster wake. Points are dropped in world space at the nozzles (the hero is drawn at world
    // [px, py, pz - 1.15]) and drawn through rx/ry/rz like the deck, so they stream back at the run's speed.
    playerWakePool.begin();
    const wakeStrength = playerWakeStrength(Number(p.speed ?? 0), g.mode === "playing");
    const heroWorld: Vec3 = [px, py, pz - 1.15];
    for (let n = 0; n < wakeTrails.length; n++) {
      const trail = wakeTrails[n]!;
      const nozzle = rotateLocalOffset(heroWorld, pitch, yaw, roll, [...APEX_PLAYER_WAKE.nozzles[n]!] as Vec3);
      if (wakeStrength <= 0) {
        trail.clear();
        continue;
      }
      trail.sample(nozzle[0], nozzle[1], nozzle[2], simTime);
      trail.segmentsFrom(nozzle, simTime, playerWakeOptions, wakeStrength, wakeScratch);
      for (const seg of wakeScratch) {
        const rot = stripRotation(seg.axis);
        playerWakePool.add(rx(seg.center[0]), ry(seg.center[1]), rz(seg.center[2]), rot[0], rot[1], rot[2], seg.width, Math.max(0.001, seg.strength), seg.length);
      }
    }
    wakeDrawn.player = playerWakePool.count;
    playerWakePool.commit();

    // WP-06: crimson tail-light ribbons, sky-flight wingtip vortices, and 8x4 sprite-sheet spark & tire-smoke bursts
    tailRibbonPool.begin();
    const tailStrength = g.mode === "playing" ? clamp((Number(p.speed ?? 0) - 8) / 36, 0, 1) * (isHotTail ? 1.15 : 0.72) : 0;
    const tailNozzles: Vec3[] = [
      [-0.68, 0.72, 2.12],
      [0.68, 0.72, 2.12]
    ];
    for (let n = 0; n < tailTrails.length; n++) {
      const trail = tailTrails[n]!;
      const nozzle = rotateLocalOffset(heroWorld, pitch, yaw, roll, tailNozzles[n]!);
      if (tailStrength <= 0) {
        trail.clear();
        continue;
      }
      trail.sample(nozzle[0], nozzle[1], nozzle[2], simTime);
      trail.segmentsFrom(nozzle, simTime, tailRibbonOptions, tailStrength, wakeScratch);
      for (const seg of wakeScratch) {
        const rot = stripRotation(seg.axis);
        tailRibbonPool.add(rx(seg.center[0]), ry(seg.center[1]), rz(seg.center[2]), rot[0], rot[1], rot[2], seg.width, Math.max(0.001, seg.strength), seg.length);
      }
    }
    tailRibbonPool.commit();

    wingtipVortexPool.begin();
    const vortexStrength = g.mode === "playing" && py > 1.2 ? clamp((py - 1.2) / 6, 0.15, 0.95) : 0;
    const wingNozzles: Vec3[] = [
      [-1.08, 0.56, 1.45],
      [1.08, 0.56, 1.45]
    ];
    for (let n = 0; n < wingtipTrails.length; n++) {
      const trail = wingtipTrails[n]!;
      const nozzle = rotateLocalOffset(heroWorld, pitch, yaw, roll, wingNozzles[n]!);
      if (vortexStrength <= 0) {
        trail.clear();
        continue;
      }
      trail.sample(nozzle[0], nozzle[1], nozzle[2], simTime);
      trail.segmentsFrom(nozzle, simTime, wingtipVortexOptions, vortexStrength, wakeScratch);
      for (const seg of wakeScratch) {
        const rot = stripRotation(seg.axis);
        wingtipVortexPool.add(rx(seg.center[0]), ry(seg.center[1]), rz(seg.center[2]), rot[0], rot[1], rot[2], seg.width, Math.max(0.001, seg.strength), seg.length);
      }
    }
    wingtipVortexPool.commit();

    if (sparkBurstAge >= 0) {
      sparkBurstAge += realDt;
      if (sparkBurstAge < 0.38 && !REDUCED_MOTION) {
        const t = sparkBurstAge / 0.38;
        const frame = Math.min(31, Math.floor(t * 32));
        const opacity = Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.35);
        const s = 0.75 + t * 0.65;
        sparkBurstHandle
          .setPosition(sparkBurstPos[0], sparkBurstPos[1], sparkBurstPos[2])
          .setRotation(-0.22, 0, 0)
          .setScale([s, s, 1])
          .setVisible(true);
        sparkBurstHandle.setUniform?.("burstState", [frame, opacity, 2.2, 0] as never);
      } else {
        sparkBurstAge = -1;
        sparkBurstHandle.setScale(HIDDEN_SCALE).setVisible(false);
      }
    }

    if (smokeBurstAge >= 0) {
      smokeBurstAge += realDt;
      if (smokeBurstAge < 0.52 && !REDUCED_MOTION) {
        const t = smokeBurstAge / 0.52;
        const frame = Math.min(31, Math.floor(t * 32));
        const opacity = 0.72 * (1 - t);
        const s = 0.8 + t * 0.85;
        smokeBurstHandle
          .setPosition(smokeBurstPos[0], smokeBurstPos[1], smokeBurstPos[2])
          .setRotation(-0.22, 0, 0)
          .setScale([s, s, 1])
          .setVisible(true);
        smokeBurstHandle.setUniform?.("burstState", [frame, opacity, 1.35, 0] as never);
      } else {
        smokeBurstAge = -1;
        smokeBurstHandle.setScale(HIDDEN_SCALE).setVisible(false);
      }
    }

    // AO-L4: the hero's ground contact comes from the sun's cascades and the contact-shadow pass (the black disc is gone)

    // 4. Ground traffic: every vehicle in the window, in its own type's pool (audit RR-1), facing its travel direction (RR-3)
    const rawVehicles: any[] = Array.isArray(g.traffic?.vehicles) ? g.traffic.vehicles : [];
    assignGroundSlots(rawVehicles, pz, groundSlots);
    rampPool.begin();
    rampRailPool.begin();
    rampChevronPool.begin();
    trafficContactPool.begin();
    brakePool.begin();
    blinkerPool.begin();
    const blinkOn = (simTime * 2.8) % 1 < 0.55;
    let groundDrawn = 0;
    for (const vType of VEHICLE_TYPES) {
      const near = trafficNear[vType];
      const nearGlass = trafficNearGlass[vType];
      const nearTrim = trafficNearTrim[vType];
      const far = trafficFar[vType];
      near.begin();
      nearGlass.begin();
      nearTrim.begin();
      far.begin();
      splitNearFar(groundSlots[vType], pz, NEAR_CAPACITY[vType], nearScratch, farScratch);
      const widthScale = 1;
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
          if (part === 0) {
            nearGlass.add(vx, ry(Math.max(0, hopY)), vz, -vpitch, vyaw + TRAFFIC_YAW, -vroll, widthScale, 1, 1);
            nearTrim.add(vx, ry(Math.max(0, hopY)), vz, -vpitch, vyaw + TRAFFIC_YAW, -vroll, widthScale, 1, 1);
          }
          groundDrawn++;
          if (part === 0) trafficContactPool.add(vx, ry(DECAL_Y + 0.003), vz, 0, vyaw, 0, vw * 1.3, contactScaleY(0), vl * 1.12);

          // Sculpted launch ramp at the carrier's rear (+z end): metallic deck + brushed side rails + glowing chevrons
          if (vType === "carrier") {
            const rampH = Number(v.ramp?.height ?? v.roof ?? 3.0);
            const rampLen = Number(v.ramp?.length ?? 6.0);
            const rampPitch = Math.atan2(rampH, rampLen);
            const rampCy = ry(hopY + rampH * 0.48);
            const rampCz = vz + vl * 0.5 - rampLen * 0.48;
            rampPool.add(vx, rampCy, rampCz, rampPitch, vyaw, vroll);
            const cosYaw = Math.cos(vyaw);
            const sinYaw = Math.sin(vyaw);
            for (const side of [-1, 1] as const) {
              rampRailPool.add(vx + side * 1.18 * cosYaw, rampCy + 0.14, rampCz - side * 1.18 * sinYaw, rampPitch, vyaw, vroll);
            }
            for (let c = -1; c <= 1; c++) {
              const step = c * 1.75;
              const chevY = rampCy + 0.11 - step * Math.sin(rampPitch);
              const chevZ = rampCz + step * Math.cos(rampPitch) * cosYaw;
              const chevX = vx + step * Math.cos(rampPitch) * sinYaw;
              rampChevronPool.add(chevX, chevY, chevZ, rampPitch, vyaw, vroll);
            }
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
      nearGlass.commit();
      nearTrim.commit();
      far.commit();
    }
    rampPool.commit();
    rampRailPool.commit();
    rampChevronPool.commit();
    trafficContactPool.commit();
    brakePool.commit();
    blinkerPool.commit();

    // 5. Sky-lane cars, nearest ahead first; every one in the window gets a slot
    const rawSkyCars: any[] = Array.isArray(g.traffic?.skyCars) ? g.traffic.skyCars : [];
    nearestAhead(rawSkyCars, pz, DRAW_WINDOW.skyCars, POOL_CAPACITY.skyCar, skySlots);
    skyCarPool.begin();
    skyCarFarPool.begin();
    skyPlumePool.begin();
    skyHaloPool.begin();
    rivalWakePool.begin();
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
      // AO-V1: a red streak behind the rival's jet, as long as its own world speed times the wake life (read-only prevZ)
      const wake = rivalWake(
        { x: Number(sc.x ?? 0), y: Number(sc.y ?? 12) + 0.45, z: Number(sc.z ?? 0), prevZ: Number(sc.prevZ ?? sc.z ?? 0), length: 4.7, dir: Number(sc.dir ?? 1) },
        FIXED_DT,
        rivalWakeLife
      );
      if (wake) {
        const axis: Vec3 = [wake.jet[0] - wake.far[0], wake.jet[1] - wake.far[1], wake.jet[2] - wake.far[2]];
        const rot = stripRotation(axis);
        rivalWakePool.add(rx((wake.jet[0] + wake.far[0]) / 2), ry((wake.jet[1] + wake.far[1]) / 2), rz((wake.jet[2] + wake.far[2]) / 2), rot[0], rot[1], rot[2], APEX_RIVAL_WAKE.width, 1, wake.length);
      }
    }
    skyCarPool.commit();
    skyCarFarPool.commit();
    skyPlumePool.commit();
    skyHaloPool.commit();
    wakeDrawn.rivals = rivalWakePool.count;
    rivalWakePool.commit();

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
    ep.boosting = Boolean(p.boostVisual ?? p.boosting);
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
  await loading.track(auraApp.ready(), 1);
  loading.set(0.7);

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
  loading.set(0.85);
  await warmPrograms(auraApp);
  loading.done();
  // AO-C1: three-shot letterboxed title intro on the title card (skippable; none for captures or reduced motion)
  if (!AUTOSTART && !REDUCED_MOTION && nativeGame.mode === "title") playTitleIntro(() => nativeGame.mode !== "title");
  document.getElementById("boot")?.classList.add("done");
  document.body.dataset.aura3dReady = "true";
  canvas.dataset.ready = "true";
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      auraApp.pause();
    } else {
      lastClockMs = 0;
      lastFrameMs = 0;
      auraApp.resume();
    }
  });
  if (document.hidden) {
    auraApp.pause();
  } else {
    auraApp.resume();
  }
}

bootRoadsterRushAura3D().catch(showBootError);
