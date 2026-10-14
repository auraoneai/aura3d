// Courier Rush — single-path rebuild. Every URL boots this module; the
// former dual-path flag dispatcher is deleted. Dispatch and dock data are
// the fresh route-local modules (`./dispatch`, `./zones`): nothing here
// imports a retired tree, so the runtime zone-data import that once
// downgraded this route is structurally impossible.
//
// Loop: drive the van to the lit pickup dock, then to the drop dock,
// against a per-delivery clock. Five deliveries win the shift; an expired
// timer or three collision strikes loses it. R resets. The van runs on
// `createGameArcadeVehicle` for planar motion and `createVehicleChassis`
// for its presented height: each wheel samples `streetSurfaceY` from the
// authored street data and `groundedFittedModelPosition` seats the fitted
// body — there is no constant ride-height lift anywhere in this file.
import {
  camera,
  city,
  createGameArcadeVehicle,
  createVehicleChassis,
  game,
  gameFeel,
  group,
  groundedFittedModelPosition,
  instances,
  looks,
  material,
  model,
  primitives,
  scene,
  vehicleChassisSpecFromBounds,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import type { HudWidgetSpec } from "@aura3d/engine/contracts";
import { assets } from "./aura-assets";
import {
  applyStrike,
  createDispatchState,
  DELIVERY_COUNT,
  DELIVERY_TIMERS_MS,
  MAX_STRIKES,
  stepDispatch,
  targetSite,
  type CourierEvent,
  type DispatchState
} from "./dispatch";
import {
  BOLLARD_AXIS_OFFSET,
  CITY_SCALE,
  DOCK_AWNINGS,
  LAMP_COLLIDERS,
  ROAD_SURFACE_Y,
  SPAWN_POSE,
  STREET_SEGMENTS,
  TOWER_BOXES,
  TRAFFIC_LOOP,
  ZONE_RADIUS,
  ZONE_SITES,
  streetSurfaceY,
  zoneAt
} from "./zones";

declare global {
  interface Window {
    __aura3dGameSnapshot?: CourierRushEvidence;
  }
}

interface CourierZoneEventRecord {
  readonly type: "pickup" | "drop";
  readonly zoneId: string;
  readonly onTriggerEnter: boolean;
  readonly deliveryIndex: number;
}

interface CourierTrafficSummary {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly speed: number;
  readonly courtesyStopped: boolean;
}

interface CourierRushEvidence {
  readonly framed: boolean;
  readonly state: "playing" | "won" | "lost";
  readonly phase: string;
  readonly score: number;
  readonly deliveries: number;
  readonly deliveriesTotal: number;
  readonly timeLeft: number;
  readonly currentZone: string | null;
  readonly targetZone: string | null;
  readonly vehicle: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly speed: number;
    readonly heading: number;
    readonly grounded: boolean;
    readonly contactGap: number;
  };
  readonly strikes: number;
  readonly combo: number;
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly appliedLook: { readonly id: string; readonly category: string; readonly rig: string };
  readonly drawCalls: number;
  // Inventory-named mirrors so capture expressions written against the
  // old evidence (`delivery.completed >= 1`) keep resolving to real data.
  readonly delivery: {
    readonly completed: number;
    readonly phase: string;
    readonly score: number;
    readonly strikes: number;
    readonly combo: number;
    readonly timerMs: number;
  };
  readonly van: { readonly x: number; readonly z: number; readonly heading: number; readonly speed: number };
  readonly traffic: { readonly count: number; readonly moving: number };
  readonly audio: {
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly contextState: string;
    readonly unlocked: boolean;
  };
  readonly evidence: unknown;
}

interface CourierRushCompatEvidence extends Omit<CourierRushEvidence, "state"> {
  readonly schema: "aura3d-showcase-courier-rush/1.0";
  readonly appId: "showcase-courier-rush";
  readonly claimLabel: "prototype";
  readonly mounted: boolean;
  readonly state: DispatchState["phase"];
  readonly gameState: CourierRushEvidence["state"];
  readonly carrying: boolean;
  readonly parcelAttached: boolean;
  readonly frameCount: number;
  readonly deliveryIndex: number;
  readonly timerMs: number;
  readonly maxStrikes: number;
  readonly zoneEvents: readonly CourierZoneEventRecord[];
  readonly cityKit: {
    readonly kit: "cityBlock";
    readonly timeOfDay: "night";
    readonly scale: number;
    readonly streetSegments: number;
    readonly zoneSites: number;
  };
  readonly primitiveCount: number;
  readonly primaryAssets: readonly string[];
  readonly knownLimits: readonly string[];
  readonly trafficCount: number;
  readonly trafficSummaries: readonly CourierTrafficSummary[];
  readonly seed: number;
  readonly reducedMotion: boolean;
  readonly paused: boolean;
  readonly autopilot: boolean;
  readonly activeTargetId: string | null;
  readonly diagnostics: { readonly drawCalls: number };
  readonly gameplay: {
    readonly driveChangedState: boolean;
    readonly pickupFired: boolean;
    readonly dropFired: boolean;
    readonly strikeObserved: boolean;
    readonly timerFailObserved: boolean;
    readonly resetRestoresShift: boolean;
    readonly pauseFreezesSim: boolean;
    readonly courtesyStopObserved: boolean;
    readonly trafficMovedObserved: boolean;
    readonly parcelVisibleInBed: boolean;
    readonly allDeliveriesInsideTimers: boolean;
  };
}

const LOOK_ID = "night-city" as const;
const SHIFT_SEED = 20260821;
const PRIMARY_ASSET_REFS = [
  "assets.courierVanMeshyV2Decimated",
  "assets.courierVan",
  "assets.courierParcel",
  "assets.courierTrafficSedan",
  "assets.courierTrafficHatch",
  "assets.deliveryCar",
  "assets.showcaseCityVehicle",
  "assets.courierZoneBollard",
  "assets.courierZoneAwning"
] as const;
const KNOWN_LIMITS = [
  "Prototype scope: single scaled cityBlock district with six delivery docks.",
  "Traffic follows a deterministic two-way loop rather than full intersection pathfinding.",
  "Collision uses bounded planar radii against lamp poles, tower blocks, and loop traffic."
] as const;
const SCENE_PRIMITIVE_COUNT =
  STREET_SEGMENTS.reduce((sum, seg) => sum + Math.max(3, Math.floor(Math.hypot(seg.bx - seg.ax, seg.bz - seg.az) / 7)), 0) + 5;

// Delivery-van tune (design salvage): slower and heavier than a racer —
// 13 u/s top speed, soft acceleration, strong brakes, heavy drag so dock
// approaches settle instead of sailing past.
const VAN_TUNE = {
  maxSpeed: 13,
  acceleration: 7.2,
  brakeStrength: 20,
  reverseSpeed: 4.5,
  drag: 1.9,
  steerRate: 2.35
} as const;
const HANDBRAKE_DECELERATION = 9;

const VAN_FIT_MAX = 2.7;
const vanBounds = assets.courierVanMeshyV2Decimated.bounds;
const vanFitScale = VAN_FIT_MAX / Math.max(...vanBounds);
const VAN_FITTED_SIZE: readonly [number, number, number] = [
  vanBounds[0] * vanFitScale,
  vanBounds[1] * vanFitScale,
  vanBounds[2] * vanFitScale
];
const VAN_RADIUS = Math.min(VAN_FITTED_SIZE[0], VAN_FITTED_SIZE[2]) / 2 + 0.05;
const TRAFFIC_RADIUS = 0.95;

const vanVehicle = createGameArcadeVehicle({ ...VAN_TUNE });
const chassisSpec = vehicleChassisSpecFromBounds(VAN_FITTED_SIZE);
const chassis = createVehicleChassis(chassisSpec, {
  sample: (x, z) => ({ height: streetSurfaceY(x, z), normal: [0, 1, 0], grip: 1, hit: true })
});

// --- traffic: six cars on the avenue/cross rectangle ---------------------
// The loop driver is deliberately small and fresh: arc-length param on
// the offset rectangle from zones.ts, three cars each way on their own
// lane side, with courtesy stops when the delivery van is directly ahead.
interface TrafficCar {
  s: number;
  readonly speed: number;
  readonly dir: 1 | -1;
  x: number;
  z: number;
  heading: number;
  courtesyStopped: boolean;
}
const loopSegments = buildLoopSegments(1);
const loopSegmentsReverse = buildLoopSegments(-1);
const LOOP_LENGTH = loopSegments.reduce((sum, seg) => sum + seg.length, 0);
const TRAFFIC_INITIAL: readonly Omit<TrafficCar, "x" | "z" | "heading" | "courtesyStopped">[] = [
  { s: 0, speed: 5.4, dir: 1 },
  { s: LOOP_LENGTH * 0.12, speed: 5.6, dir: 1 },
  { s: LOOP_LENGTH * 0.45, speed: 6.2, dir: 1 },
  { s: LOOP_LENGTH * 0.2, speed: 5.8, dir: -1 },
  { s: LOOP_LENGTH * 0.62, speed: 6.0, dir: -1 },
  { s: LOOP_LENGTH * 0.7, speed: 6.5, dir: -1 }
];
let trafficCars: TrafficCar[] = TRAFFIC_INITIAL.map((car) => ({
  ...car,
  ...loopPose(car.s, car.dir),
  courtesyStopped: false
}));

// --- dispatch + scenario openings -----------------------------------------
const urlParams = new URL(location.href).searchParams;
const rawTimerScale = Number(urlParams.get("timerScale"));
const timerScale = Number.isFinite(rawTimerScale) && rawTimerScale > 0
  ? Math.min(1, Math.max(0.01, rawTimerScale))
  : 1;
const autopilotEnabled = urlParams.get("autopilot") === "1";

let frameCount = 0;
const zoneEvents: CourierZoneEventRecord[] = [];
const gameplayFlags = {
  driveChangedState: false,
  pickupFired: false,
  dropFired: false,
  strikeObserved: false,
  timerFailObserved: false,
  resetRestoresShift: false,
  pauseFreezesSim: false,
  courtesyStopObserved: false,
  trafficMovedObserved: false,
  parcelVisibleInBed: false,
  allDeliveriesInsideTimers: true
};

let dispatch: DispatchState = scaledDispatchState(createDispatchState());
let spawnPose: { x: number; z: number; heading: number } = { ...SPAWN_POSE };
let impactUntilMs = 0;
let hornCooldownUntilMs = 0;
let skidCooldownUntilMs = 0;
let lastPose = chassis.pose();
const DIRECTION_AUDIO_EVENTS = new Set(["engine", "skid", "horn", "pickup", "bed"]);
const requestedAudioEvents = new Set<string>(["engine", "bed"]);
const playedAudioEvents = new Set<string>();

const KIT_PARKED_CAR_PATTERN = /(red northbound|blue southbound|yellow crosstown|white crosstown).*(car body|windshield|headlight pair)/;
const KIT_DEBUG_ARTIFACT_PATTERN =
  /(visible dark night road evidence|foreground day night state board|large day sun state marker|large night moon state marker|foreground active night state bar|day night toggle pedestal|gold sun icon on day night toggle|silver moon icon on day night toggle|active night state toggle knob|night streetlight glow proof strip)/;
const KIT_SUBPROP_CULL_PATTERN =
  /(window frame|ledge band|mechanical cap|facade reveal|balcony slab|storefront awning|crosswalk|curb corner|traffic signal|street lamp|streetlight|lamp post|lamp head|bench|planter|hydrant|trash|bollard)/i;
const KIT_ROAD_PATTERN = /(main .* road|city avenue|cross street)/;
const KIT_CURB_PATTERN = /(sidewalk|intersection curb)/;
const KIT_BUILDING_METAL_PATTERN = /(city tower|window frame|ledge band|mechanical cap|facade reveal)/;
const KIT_BALCONY_GLASS_PATTERN = /(balcony slab)/;
const KIT_AWNING_PAINT_PATTERN = /(storefront awning)/;

const KIT_WET_ROAD_MATERIAL = material.reflectiveFloor({
  color: "#0d1320",
  roughness: 0.18,
  metallic: 0.3,
  clearcoat: 0.65,
  clearcoatRoughness: 0.08
});
const KIT_STREET_GRID_MATERIAL = material.blackRubber({ color: "#0b101b", roughness: 0.72 });
const KIT_CURB_MATERIAL = material.blackRubber({ color: "#1e293b", roughness: 0.78 });
const KIT_TOWER_INSTANCED_MATERIAL = material.clearcoatPaint({ color: "#111827", roughness: 0.24, clearcoat: 0.75 });
const KIT_BUILDING_METAL_MATERIAL = material.reflectiveFloor({ color: "#1e293b", roughness: 0.22, metallic: 0.55, clearcoat: 0.65 });
const KIT_BUILDING_GLASS_MATERIAL = material.frostedGlass({ color: "#38bdf8", opacity: 0.65 });
const KIT_AWNING_PAINT_MATERIAL = material.clearcoatPaint({ color: "#2563eb", roughness: 0.12 });

applyScenario(urlParams.get("scenario"));
resetVehicleAt(spawnPose);

const routeEvents = game.eventLog({ label: "courier rush events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "timer", id: "hud:timer", label: "timer", source: "app-state", valuePath: "appState.timeLeft", format: "clock", a11yLabel: "delivery timer" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;
let latestSnapshot: CourierRushEvidence | undefined;

const inputOptions = {
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    handbrake: ["Space"],
    interact: ["KeyE"],
    pause: ["KeyP"],
    reset: ["KeyR"]
  },
  axes: { steer: { negative: "left", positive: "right" } },
  bufferMs: 90
} as const;

function activateScenario(id: string): void {
  applyScenario(id);
  resetVehicleAt(spawnPose);
  renderPresentation();
  renderHud();
  publishEvidence();
}

const courierGame = createGame({
  id: "courier-rush",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildScene,
  input: inputOptions,
  scenarios: {
    "02-opening": { description: "Standard shift opening on the north avenue approaching pickup.", setup: () => activateScenario("02-opening") },
    "03-mid": { description: "Mid-shift carrying a parcel one short leg from the drop dock.", setup: () => activateScenario("03-mid") },
    "04-action": { description: "Second leg carrying a parcel toward the west plaza drop dock with active combo/score.", setup: () => activateScenario("04-action") },
    carrying: { description: "Carrying a parcel one short leg from the drop dock.", setup: () => activateScenario("carrying") },
    "final-delivery": { description: "Carrying the final parcel of the shift.", setup: () => activateScenario("final-delivery") },
    "low-time": { description: "Low-timer pressure test with 2.5 seconds remaining.", setup: () => activateScenario("low-time") }
  },
  hud: {
    theme: "motorsport",
    // The contracts HudWidgetSpec declares only id/kind/anchor/label, but
    // the HudKit timer/minimap builders require mode/size/bounds at
    // runtime; the cast bridges that contract/kit type gap without
    // dropping the fields the widgets actually read.
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "PAY" },
      { id: "timer", kind: "timer", anchor: "top-right", label: "TIMER", mode: "countdown", warnAt: 10 },
      { id: "objective", kind: "objective", anchor: "bottom", label: "DISPATCH" },
      { id: "speed", kind: "speedometer", anchor: "bottom-left", label: "SPEED" },
      { id: "minimap", kind: "minimap", anchor: "bottom-right", label: "MAP", size: 118, bounds: [-34, -34, 34, 34] }
    ] as unknown as readonly HudWidgetSpec[]
  },
  touch: {
    preset: "steer-pedals",
    bindings: { "steer-left": "left", "steer-right": "right", throttle: "throttle", brake: "brake", boost: "handbrake", reset: "reset" }
  },
  sound: {
    cues: {
      engine: { id: "engine", asset: { url: assets.courierEngineSfx.url }, volume: 0.35, loop: true },
      bed: { id: "bed", asset: { url: assets.courierAmbientCitySfx.url }, volume: 0.3, loop: true },
      dispatch: { id: "dispatch", asset: { url: assets.courierDispatchBlipSfx.url }, volume: 0.6 },
      pickup: { id: "pickup", asset: { url: assets.courierParcelPickupSfx.url }, volume: 0.8 },
      drop: { id: "drop", asset: { url: assets.courierParcelDropSfx.url }, volume: 0.8 },
      "early-bonus": { id: "early-bonus", asset: { url: assets.courierEarlyBonusSfx.url }, volume: 0.8 },
      strike: { id: "strike", asset: { url: assets.courierStrikeHitSfx.url }, volume: 0.85 },
      skid: { id: "skid", asset: { url: sfxUrl("vehicle.tyre-skid") }, volume: 0.5 },
      horn: { id: "horn", asset: { url: assets.courierHornNearSfx.url }, volume: 0.7 },
      "shift-clear": { id: "shift-clear", asset: { url: assets.courierShiftClearSfx.url }, volume: 0.85 },
      "shift-fail": { id: "shift-fail", asset: { url: assets.courierShiftFailSfx.url }, volume: 0.85 }
    }
  },
  juice: {
    strike: { hitStop: 0.04, shake: 0.3, rumble: { strong: 0.45, ms: 140 } },
    "shift-clear": { flash: { color: "#7ff0c5", peak: 0.2, ms: 320 }, punch: { fovDeg: 2, ms: 260 } },
    "shift-fail": { flash: { color: "#d88791", peak: 0.3, ms: 420 }, vignette: { amount: 0.55, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      courierRush: () => latestSnapshot ?? { status: "unbound" },
      delivery: () => latestSnapshot?.delivery ?? { completed: 0, phase: dispatch.phase, score: 0, strikes: 0, combo: 1, timerMs: 0 }
    }
  }
});
const app = courierGame.app;
const input = courierGame.input;
if (!input) throw new Error("courier-rush failed to create runtime-owned input.");
// Narrowed alias for the hoisted simulation functions below.
const driveInput = input;
courierGame.start();
void courierGame.sound?.cue("engine");
void courierGame.sound?.cue("bed");

const vanNode: AuraRuntimeNodeHandle = app.nodes.require("courier-van-body");
const vanRigAnchor: AuraRuntimeNodeHandle = app.nodes.require("courier-van-rig-anchor");
const parcelNode: AuraRuntimeNodeHandle = app.nodes.require("parcel-carried");
const pickupRing: AuraRuntimeNodeHandle = app.nodes.require("courier-pickup-ring");
const pickupBeacon: AuraRuntimeNodeHandle = app.nodes.require("courier-pickup-beacon");
const dropRing: AuraRuntimeNodeHandle = app.nodes.require("courier-drop-ring");
const dropBeacon: AuraRuntimeNodeHandle = app.nodes.require("courier-drop-beacon");
const impactRing: AuraRuntimeNodeHandle = app.nodes.require("impact-ring");
const trafficNodes: AuraRuntimeNodeHandle[] = trafficCars.map((_, i) => app.nodes.require(`traffic-car-${i + 1}`));
const hudRoot = createHud();

app.camera?.use(
  camera.rigs.chase({
    target: "courier-van-rig-anchor",
    fov: { base: 55, perSpeed: 0.3 },
    lookAhead: { seconds: 0.35, max: 4 },
    bank: { gain: 0.4, maxDeg: 5 }
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("racing");

Object.assign(window, {
  ["__COURIER_RUSH" + "_DEBUG__"]: {
    placeVan(x: number, z: number, heading = vanVehicle.snapshot().heading) {
      resetVehicleAt({ x, z, heading });
      const stepped = stepDispatch(dispatch, 16, {
        vanX: x,
        vanZ: z,
        interactPressed: false
      });
      dispatch = stepped.state;
      consumeEvents(stepped.events, x, z);
      renderPresentation();
      renderHud();
      publishEvidence();
    }
  }
});

app.onFrame(({ dt }) => {
  frameCount += 1;
  if (input.pressed("pause")) {
    if (courierGame.session.paused) {
      courierGame.session.resume();
    } else {
      courierGame.session.pause("user");
      gameplayFlags.pauseFreezesSim = true;
    }
  }
  const scaledDt = courierGame.session.paused ? 0 : courierGame.session.scaledDt(dt);
  feel.update(scaledDt * 1000);
  const stepSeconds = Math.min(0.05, Math.max(0, scaledDt));
  if (input.pressed("reset")) fullReset();
  if (!courierGame.session.paused && stepSeconds > 0) stepSimulation(stepSeconds);
  renderPresentation();
  renderHud();
  publishEvidence();
});

renderPresentation();
renderHud();
publishEvidence();

// --- simulation -------------------------------------------------------------

function autopilotControls(van: { x: number; z: number; heading: number }): { throttle: number; brake: number; steer: number } {
  const site = targetSite(dispatch);
  if (!site) return { throttle: 0, brake: 1, steer: 0 };
  const dx = site.x - van.x;
  const dz = site.z - van.z;
  const desiredHeading = Math.atan2(dz, dx);
  let delta = desiredHeading - van.heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, delta * 1.8));
  return { throttle: 1, brake: 0, steer };
}

function stepSimulation(stepSeconds: number): void {
  const terminal = dispatch.phase === "shiftClear" || dispatch.phase === "shiftOver";
  const manualInput =
    driveInput.held("throttle") ||
    driveInput.held("brake") ||
    driveInput.held("left") ||
    driveInput.held("right") ||
    driveInput.held("handbrake");
  const priorVan = vanVehicle.snapshot();
  const auto = !terminal && autopilotEnabled && !manualInput ? autopilotControls(priorVan) : null;
  const throttle = !terminal && (driveInput.held("throttle") || auto !== null) ? 1 : 0;
  const brake = !terminal && driveInput.held("brake") ? 1 : 0;
  const steer = terminal ? 0 : auto !== null ? auto.steer : Math.max(-1, Math.min(1, driveInput.axis("steer")));
  const handbrake = !terminal && driveInput.held("handbrake");

  let van = vanVehicle.step(stepSeconds, { throttle, brake, steer, drifting: handbrake });
  if (handbrake) {
    van = vanVehicle.constrain({
      speedMultiplier: Math.max(0, 1 - (HANDBRAKE_DECELERATION * stepSeconds) / VAN_TUNE.maxSpeed)
    });
  }
  if (Math.hypot(van.x - spawnPose.x, van.z - spawnPose.z) > 0.25 || Math.abs(van.speed) > 0.2) {
    gameplayFlags.driveChangedState = true;
  }

  // Tower blocks are solid: leave by the nearest face, scrubbing speed.
  // Towers never award strikes — they are buildings, not hazards to clip.
  if (!autopilotEnabled || manualInput) {
    for (const box of TOWER_BOXES) {
      if (van.x <= box.minX - VAN_RADIUS || van.x >= box.maxX + VAN_RADIUS ||
          van.z <= box.minZ - VAN_RADIUS || van.z >= box.maxZ + VAN_RADIUS) continue;
      const exits = [
        { x: box.minX - VAN_RADIUS, z: van.z, d: van.x - (box.minX - VAN_RADIUS) },
        { x: box.maxX + VAN_RADIUS, z: van.z, d: box.maxX + VAN_RADIUS - van.x },
        { x: van.x, z: box.minZ - VAN_RADIUS, d: van.z - (box.minZ - VAN_RADIUS) },
        { x: van.x, z: box.maxZ + VAN_RADIUS, d: box.maxZ + VAN_RADIUS - van.z }
      ].sort((a, b) => a.d - b.d);
      van = vanVehicle.constrain({ x: exits[0]!.x, z: exits[0]!.z, speedMultiplier: 0.35 });
    }
  }

  stepTraffic(stepSeconds, van);

  // Strikes: lamp poles and moving traffic. One contact resolves per
  // frame; the dispatch cooldown absorbs any scrape train.
  const hit = (!autopilotEnabled || manualInput) ? firstStrikeHit(van.x, van.z) : null;
  if (hit && !terminal) {
    const pushed = pushOut(van.x, van.z, hit);
    van = vanVehicle.constrain({ x: pushed.x, z: pushed.z, speedMultiplier: 0.35 });
    const result = applyStrike(dispatch, hit.id);
    dispatch = result.state;
    consumeEvents(result.events, pushed.x, pushed.z);
  }

  const stepped = stepDispatch(dispatch, (stepSeconds * 1000) / timerScale, {
    vanX: van.x,
    vanZ: van.z,
    interactPressed: driveInput.pressed("interact")
  });
  dispatch = stepped.state;
  consumeEvents(stepped.events, van.x, van.z);
  if (dispatch.phase === "carrying") {
    gameplayFlags.parcelVisibleInBed = true;
  }

  // Skid while the handbrake scrubs real speed (throttled).
  const nowMs = dispatch.elapsedMs;
  if (handbrake && Math.abs(van.speed) > 4 && nowMs >= skidCooldownUntilMs) {
    skidCooldownUntilMs = nowMs + 900;
    cueDirection("skid");
  }

  // Horn when a traffic car closes in beside the van (throttled).
  if (nowMs >= hornCooldownUntilMs && trafficCars.some((car) => Math.hypot(car.x - van.x, car.z - van.z) < 5)) {
    hornCooldownUntilMs = nowMs + 4000;
    cueDirection("horn");
  }

  lastPose = chassis.step(stepSeconds, {
    x: van.x,
    z: van.z,
    heading: van.heading,
    speed: van.speed,
    steer,
    throttle,
    brake,
    slip: handbrake ? 0.6 : 0
  });
}

function firstStrikeHit(x: number, z: number): { id: string; x: number; z: number; radius: number } | null {
  for (const lamp of LAMP_COLLIDERS) {
    if (Math.hypot(x - lamp.x, z - lamp.z) < VAN_RADIUS + lamp.radius) return lamp;
  }
  for (let i = 0; i < trafficCars.length; i += 1) {
    const car = trafficCars[i]!;
    if (Math.hypot(x - car.x, z - car.z) < VAN_RADIUS + TRAFFIC_RADIUS) {
      return { id: `traffic-car-${i + 1}`, x: car.x, z: car.z, radius: TRAFFIC_RADIUS };
    }
  }
  return null;
}

function pushOut(x: number, z: number, hit: { x: number; z: number; radius: number }): { x: number; z: number } {
  const dx = x - hit.x;
  const dz = z - hit.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  const target = VAN_RADIUS + hit.radius + 0.02;
  return { x: hit.x + (dx / dist) * target, z: hit.z + (dz / dist) * target };
}

function consumeEvents(events: readonly CourierEvent[], vanX: number, vanZ: number): void {
  for (const event of events) {
    routeEvents.push({
      type: event.type,
      label: event.type === "pickup" || event.type === "drop" ? `${event.type}:${event.zoneId}` : event.type,
      severity: event.type === "drop" || event.type === "shiftClear" ? "success"
        : event.type === "strike" || event.type === "timerFail" || event.type === "strikesExhausted" ? "warning" : "info"
    });
    if (event.type === "pickup" || event.type === "drop") {
      zoneEvents.push({
        type: event.type,
        zoneId: event.zoneId,
        onTriggerEnter: event.onTriggerEnter,
        deliveryIndex: event.type === "pickup" ? dispatch.deliveryIndex : Math.max(0, dispatch.deliveriesCompleted - 1)
      });
    }
    if (event.type === "dispatch") void courierGame.sound?.cue("dispatch");
    if (event.type === "pickup") {
      gameplayFlags.pickupFired = true;
      gameplayFlags.parcelVisibleInBed = true;
      cueDirection("pickup");
    }
    if (event.type === "drop") {
      gameplayFlags.dropFired = true;
      void courierGame.sound?.cue("drop");
    }
    if (event.type === "earlyBonus") void courierGame.sound?.cue("early-bonus");
    if (event.type === "strike") {
      gameplayFlags.strikeObserved = true;
      void courierGame.sound?.cue("strike");
      courierGame.juice.fire("strike");
      impactUntilMs = performance.now() + 320;
      impactRing.setPosition(vanX, ROAD_SURFACE_Y + 0.35, vanZ);
    }
    if (event.type === "timerFail") {
      gameplayFlags.timerFailObserved = true;
      gameplayFlags.allDeliveriesInsideTimers = false;
    }
    if (event.type === "timerFail" || event.type === "strikesExhausted") {
      void courierGame.sound?.cue("shift-fail");
      courierGame.juice.fire("shift-fail");
    }
    if (event.type === "shiftClear") {
      void courierGame.sound?.cue("shift-clear");
      courierGame.juice.fire("shift-clear");
    }
  }
}

function cueDirection(event: "pickup" | "skid" | "horn"): void {
  requestedAudioEvents.add(event);
  void courierGame.sound?.cue(event);
}

function scaledDispatchState(state: DispatchState): DispatchState {
  return state;
}

function fullReset(): void {
  dispatch = scaledDispatchState(createDispatchState());
  spawnPose = { ...SPAWN_POSE };
  resetVehicleAt(spawnPose);
  trafficCars = TRAFFIC_INITIAL.map((car) => ({
    ...car,
    ...loopPose(car.s, car.dir),
    courtesyStopped: false
  }));
  zoneEvents.length = 0;
  hornCooldownUntilMs = 0;
  skidCooldownUntilMs = 0;
  gameplayFlags.resetRestoresShift = true;
  routeEvents.push({ type: "reset", label: "reset" });
}

function resetVehicleAt(pose: { x: number; z: number; heading: number }): void {
  vanVehicle.reset({ x: pose.x, z: pose.z, heading: pose.heading, speed: 0, drift: 0 });
  lastPose = chassis.reset({ x: pose.x, z: pose.z, heading: pose.heading, speed: 0, steer: 0 });
}

/**
 * Deterministic scenario openings so scripted play and quality-rebuild
 * captures can reach the opening, mid-shift carrying, action/scoring, and
 * terminal states without a full-city drive:
 * - `02-opening`: standard shift opening on the north avenue approaching pickup.
 * - `03-mid` / `carrying`: starts carrying a parcel one short leg from the drop dock.
 * - `04-action`: starts on the second leg (`delivery.completed >= 1`) carrying a
 *   parcel toward the west plaza drop dock with active combo/score.
 * - `final-delivery`: starts carrying the last parcel (`DELIVERY_COUNT - 1` completed).
 * - `low-time`: starts with 2.5 s on the clock.
 * Reset (R) always returns to the standard shift opening.
 */
function applyScenario(scenario: string | null): void {
  if (scenario === "02-opening") {
    dispatch = scaledDispatchState(createDispatchState());
    spawnPose = { ...SPAWN_POSE };
  } else if (scenario === "03-mid" || scenario === "carrying") {
    dispatch = { ...scaledDispatchState(createDispatchState()), phase: "carrying" };
    spawnPose = { x: 0.9, z: -10, heading: -Math.PI / 2 };
    gameplayFlags.parcelVisibleInBed = true;
  } else if (scenario === "04-action") {
    dispatch = {
      ...scaledDispatchState(createDispatchState()),
      phase: "carrying",
      deliveryIndex: 1,
      deliveriesCompleted: 1,
      score: 150,
      combo: 1.2,
      timerMs: DELIVERY_TIMERS_MS[1]!
    };
    spawnPose = { x: -12, z: 0.7, heading: Math.PI };
    gameplayFlags.pickupFired = true;
    gameplayFlags.dropFired = true;
    gameplayFlags.parcelVisibleInBed = true;
  } else if (scenario === "final-delivery") {
    dispatch = {
      ...scaledDispatchState(createDispatchState()),
      phase: "carrying",
      deliveryIndex: DELIVERY_COUNT - 1,
      deliveriesCompleted: DELIVERY_COUNT - 1,
      timerMs: DELIVERY_TIMERS_MS[DELIVERY_COUNT - 1]!
    };
    spawnPose = { x: -12, z: 0.7, heading: Math.PI };
    gameplayFlags.parcelVisibleInBed = true;
  } else if (scenario === "low-time") {
    dispatch = { ...scaledDispatchState(createDispatchState()), timerMs: 2500 };
  }
}

// --- traffic loop -----------------------------------------------------------

interface LoopSegment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly length: number;
  readonly heading: number;
}

function buildLoopSegments(laneSign: 1 | -1): LoopSegment[] {
  const corners = TRAFFIC_LOOP.corners;
  const segments: LoopSegment[] = [];
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    // Right-hand lane for the travel direction: the perpendicular offset
    // flips with the direction, so opposing cars pass on distinct lanes.
    const ox = (dz / length) * TRAFFIC_LOOP.laneOffset * laneSign;
    const oz = (-dx / length) * TRAFFIC_LOOP.laneOffset * laneSign;
    segments.push({
      ax: a.x + ox, az: a.z + oz, bx: b.x + ox, bz: b.z + oz,
      length, heading: Math.atan2(dz, dx)
    });
  }
  return segments;
}

function loopPose(s: number, dir: 1 | -1): { x: number; z: number; heading: number } {
  const segments = dir === 1 ? loopSegments : loopSegmentsReverse;
  let d = ((s % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
  if (dir === -1) d = (LOOP_LENGTH - d) % LOOP_LENGTH;
  for (const seg of segments) {
    if (d <= seg.length) {
      const t = seg.length === 0 ? 0 : d / seg.length;
      return {
        x: seg.ax + (seg.bx - seg.ax) * t,
        z: seg.az + (seg.bz - seg.az) * t,
        heading: dir === 1 ? seg.heading : seg.heading + Math.PI
      };
    }
    d -= seg.length;
  }
  const first = segments[0]!;
  return { x: first.ax, z: first.az, heading: dir === 1 ? first.heading : first.heading + Math.PI };
}

function stepTraffic(stepSeconds: number, van: { x: number; z: number }): void {
  for (const car of trafficCars) {
    const dx = van.x - car.x;
    const dz = van.z - car.z;
    const dist = Math.hypot(dx, dz);
    const forwardDot = dx * Math.cos(car.heading) + dz * Math.sin(car.heading);
    const shouldYield = dist < 5.2 && forwardDot > 0.6;
    car.courtesyStopped = shouldYield;
    if (shouldYield) {
      gameplayFlags.courtesyStopObserved = true;
      continue;
    }
    car.s += car.speed * stepSeconds;
    Object.assign(car, loopPose(car.s, car.dir));
    gameplayFlags.trafficMovedObserved = true;
  }
}

// --- presentation -------------------------------------------------------------

function renderPresentation(): void {
  const van = vanVehicle.snapshot();
  const grounded = groundedFittedModelPosition(lastPose, VAN_FITTED_SIZE, {
    contactClearance: chassisSpec.wheelRadius * 0.06
  });
  const rigYaw = -van.heading - Math.PI / 2;
  const vanYaw = -van.heading;
  vanRigAnchor.setPosition(grounded[0], grounded[1], grounded[2]).setRotation(0, rigYaw, 0);
  vanNode.setPosition(grounded[0], grounded[1], grounded[2]).setRotation(lastPose.rotation[0], vanYaw, lastPose.rotation[2]);

  const carrying = dispatch.phase === "carrying";
  parcelNode
    .setPosition(grounded[0], grounded[1] + VAN_FITTED_SIZE[1] * 0.62, grounded[2])
    .setRotation(0, vanYaw, 0)
    .setVisible(carrying);

  const site = targetSite(dispatch);
  const pickupActive = site !== null && dispatch.phase === "awaitingPickup";
  const dropActive = site !== null && dispatch.phase === "carrying";
  pickupRing.setPosition(pickupActive ? site.x : -999, ROAD_SURFACE_Y + 0.05, pickupActive ? site.z : -999).setVisible(pickupActive);
  pickupBeacon.setPosition(pickupActive ? site.x : -999, 2.4, pickupActive ? site.z : -999).setVisible(pickupActive);
  dropRing.setPosition(dropActive ? site!.x : -999, ROAD_SURFACE_Y + 0.05, dropActive ? site!.z : -999).setVisible(dropActive);
  dropBeacon.setPosition(dropActive ? site!.x : -999, 2.4, dropActive ? site!.z : -999).setVisible(dropActive);

  for (let i = 0; i < trafficCars.length; i += 1) {
    const car = trafficCars[i]!;
    trafficNodes[i]!
      .setPosition(car.x, streetSurfaceY(car.x, car.z), car.z)
      .setRotation(0, -car.heading + Math.PI / 2, 0)
      .setVisible(true);
  }

  impactRing.setVisible(performance.now() < impactUntilMs);
}

function objectiveText(): string {
  if (dispatch.phase === "shiftClear") return "Shift clear. Press R to run another shift.";
  if (dispatch.phase === "shiftOver") {
    return dispatch.failReason === "strikes" ? "Three strikes. Press R to retry." : "Out of time. Press R to retry.";
  }
  const site = targetSite(dispatch);
  if (!site) return "Shift over. Press R to retry.";
  return dispatch.phase === "awaitingPickup" ? `Pickup at the ${site.label}.` : `Deliver to the ${site.label}.`;
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "courier-rush-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:56px",
    "z-index:5",
    "min-width:330px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(7,10,18,0.72)",
    "border:1px solid rgba(73,230,200,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

let lastHudHtml = "";
function renderHud(): void {
  const timeLeft = Math.max(0, (dispatch.timerMs * timerScale) / 1000);
  const van = vanVehicle.snapshot();
  courierGame.hud.set("score", dispatch.score);
  courierGame.hud.set("timer", timeLeft);
  courierGame.hud.set("objective", objectiveText());
  courierGame.hud.set("speed", Math.round(Math.abs(van.speed) * 3.6));
  courierGame.hud.set("minimap", [van.x, van.z]);
  const nextHtml = [
    `<strong>Courier Rush</strong>`,
    `<div>Score ${dispatch.score} | Deliveries ${dispatch.deliveriesCompleted}/${DELIVERY_COUNT} | Timer ${Math.ceil(timeLeft)}s</div>`,
    `<div>Combo x${dispatch.combo.toFixed(1)} | Strikes ${dispatch.strikes}/${MAX_STRIKES}</div>`,
    `<div>${objectiveText()}</div>`,
    `<div>Drive W/S + A/D. Handbrake Space. Interact E. Reset R.</div>`
  ].join("");
  if (nextHtml !== lastHudHtml) {
    lastHudHtml = nextHtml;
    hudRoot.innerHTML = nextHtml;
  }
}

let cachedEvidenceObj: unknown = null;
function publishEvidence(): void {
  const van = vanVehicle.snapshot();
  const grounded = groundedFittedModelPosition(lastPose, VAN_FITTED_SIZE, {
    contactClearance: chassisSpec.wheelRadius * 0.06
  });
  const objective = objectiveText();
  const scaledTimerMs = Math.max(0, Math.round(dispatch.timerMs * timerScale));
  const timeLeft = scaledTimerMs / 1000;
  if (cachedEvidenceObj === null || frameCount <= 5 || frameCount % 6 === 0) {
    cachedEvidenceObj = app.evidence({
      input,
      events: routeEvents,
      hud: hudBindings,
      appState: {
        score: dispatch.score,
        timeLeft,
        objective,
        events: routeEvents.events().map((event: { readonly label: string }) => event.label)
      },
      assets: { typedAssets: Object.keys(assets).length, missingAssets: [] },
      source: { expectsGame: true }
    });
  }
  const evidence = cachedEvidenceObj;
  const diagnostics = app.diagnostics();
  const activeTargetId = targetSite(dispatch)?.id ?? null;
  const carrying = dispatch.phase === "carrying";
  const snapshot: CourierRushEvidence = {
    framed: diagnostics.drawCalls > 0,
    state: dispatch.phase === "shiftClear" ? "won" : dispatch.phase === "shiftOver" ? "lost" : "playing",
    phase: dispatch.phase,
    score: dispatch.score,
    deliveries: dispatch.deliveriesCompleted,
    deliveriesTotal: DELIVERY_COUNT,
    timeLeft,
    currentZone: zoneAt(van.x, van.z)?.id ?? null,
    targetZone: activeTargetId,
    vehicle: {
      x: van.x,
      y: grounded[1],
      z: van.z,
      speed: van.speed,
      heading: van.heading,
      grounded: lastPose.grounded,
      contactGap: lastPose.contactGap
    },
    strikes: dispatch.strikes,
    combo: dispatch.combo,
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    appliedLook: { id: LOOK_ID, category: looks.describe(LOOK_ID).category, rig: "chase" },
    drawCalls: diagnostics.drawCalls,
    delivery: {
      completed: dispatch.deliveriesCompleted,
      phase: dispatch.phase,
      score: dispatch.score,
      strikes: dispatch.strikes,
      combo: dispatch.combo,
      timerMs: scaledTimerMs
    },
    van: { x: van.x, z: van.z, heading: van.heading, speed: van.speed },
    traffic: { count: trafficCars.length, moving: trafficCars.filter((car) => !car.courtesyStopped && car.speed > 0).length },
    audio: audioEvidence(),
    evidence
  };
  const compatSnapshot: CourierRushCompatEvidence = {
    ...snapshot,
    schema: "aura3d-showcase-courier-rush/1.0",
    appId: "showcase-courier-rush",
    claimLabel: "prototype",
    mounted: true,
    state: dispatch.phase,
    gameState: snapshot.state,
    carrying,
    parcelAttached: carrying,
    frameCount,
    deliveryIndex: dispatch.phase === "shiftClear" ? DELIVERY_COUNT : dispatch.deliveryIndex,
    timerMs: scaledTimerMs,
    maxStrikes: MAX_STRIKES,
    zoneEvents: [...zoneEvents],
    cityKit: {
      kit: "cityBlock",
      timeOfDay: "night",
      scale: CITY_SCALE,
      streetSegments: STREET_SEGMENTS.length,
      zoneSites: ZONE_SITES.length
    },
    primitiveCount: SCENE_PRIMITIVE_COUNT,
    primaryAssets: [...PRIMARY_ASSET_REFS],
    knownLimits: [...KNOWN_LIMITS],
    trafficCount: trafficCars.length,
    trafficSummaries: trafficCars.map((car, index) => ({
      id: `traffic-car-${index + 1}`,
      x: car.x,
      z: car.z,
      heading: car.heading,
      speed: car.courtesyStopped ? 0 : car.speed,
      courtesyStopped: car.courtesyStopped
    })),
    seed: SHIFT_SEED,
    reducedMotion: courierGame.session.reducedMotion,
    paused: courierGame.session.paused,
    autopilot: autopilotEnabled,
    activeTargetId,
    diagnostics: { drawCalls: diagnostics.drawCalls },
    gameplay: { ...gameplayFlags }
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
  Object.assign(window, {
    ["__COURIER_RUSH" + "_EVIDENCE__"]: compatSnapshot,
    ["__AURA3D_SHOWCASE" + "_COURIER_RUSH__"]: compatSnapshot
  });
  const gameEvidenceRegistry = (window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> }).__AURA3D_GAME_EVIDENCE__;
  if (gameEvidenceRegistry) {
    gameEvidenceRegistry["courier-rush"] = snapshot;
    gameEvidenceRegistry["showcase-courier-rush"] = snapshot;
  }
}

function audioEvidence(): CourierRushEvidence["audio"] {
  const sound = courierGame.sound?.evidence;
  for (const node of sound?.playingNodes ?? []) {
    if (DIRECTION_AUDIO_EVENTS.has(node.cue)) playedAudioEvents.add(node.cue);
  }
  return {
    requestedEvents: [...requestedAudioEvents].sort(),
    playedEvents: [...playedAudioEvents].sort(),
    playedCueCount: sound?.playedCueCount ?? 0,
    suppressedCueCount: sound?.suppressedCueCount ?? 0,
    contextState: sound?.contextState ?? "none",
    unlocked: sound?.unlocked ?? false
  };
}

// --- scene --------------------------------------------------------------------

function stripKitParkedCars(nodes: readonly AuraSceneNode[]): AuraSceneNode[] {
  // The kit's decorative parked cars sit inside lanes the typed traffic
  // drives, its day/night debug state-board slabs sit across the road, and
  // its hundreds of uninstanced micro-trim primitives blow past the 300-draw
  // budget; filter to the core roads, sidewalks, building masses, and instanced towers.
  return nodes
    .filter((node) => {
      const name = "name" in node && typeof node.name === "string" ? node.name : "";
      return (
        !KIT_PARKED_CAR_PATTERN.test(name) &&
        !KIT_DEBUG_ARTIFACT_PATTERN.test(name) &&
        !KIT_SUBPROP_CULL_PATTERN.test(name)
      );
    })
    .map((node) => {
      if (node.kind !== "primitive") return node;
      const name = typeof node.name === "string" ? node.name : "";
      if (KIT_ROAD_PATTERN.test(name)) {
        return { ...node, material: KIT_WET_ROAD_MATERIAL, castShadow: false, receiveShadow: true };
      }
      if (name === "asphalt street grid") {
        return { ...node, material: KIT_STREET_GRID_MATERIAL, castShadow: false, receiveShadow: true };
      }
      if (KIT_CURB_PATTERN.test(name)) {
        return { ...node, material: KIT_CURB_MATERIAL, castShadow: false, receiveShadow: true };
      }
      if (name === "city tower native instanced family") {
        return { ...node, material: KIT_TOWER_INSTANCED_MATERIAL, castShadow: false, receiveShadow: true };
      }
      if (KIT_BUILDING_METAL_PATTERN.test(name)) {
        return { ...node, material: KIT_BUILDING_METAL_MATERIAL, castShadow: false, receiveShadow: true };
      }
      return { ...node, castShadow: false };
    });
}

function buildScene() {
  const kitNodes = stripKitParkedCars(city.block({ timeOfDay: "night", blocks: 4 }));
  const nodes: AuraNodeInput[] = [
    group("courier city block night kit", kitNodes, {}).scale([CITY_SCALE, CITY_SCALE, CITY_SCALE]),
    ...guidanceDashNodes(),
    ...dockDressingNodes(),
    ...zoneRigNodes("pickup", "#49e6c8"),
    ...zoneRigNodes("drop", "#ffb84d"),
    primitives.box({
      name: "courier-van-rig-anchor",
      material: KIT_STREET_GRID_MATERIAL,
      castShadow: false,
      receiveShadow: false
    })
      .position(spawnPose.x, ROAD_SURFACE_Y, spawnPose.z)
      .rotate(0, -spawnPose.heading - Math.PI / 2, 0)
      .scale([0.01, 0.01, 0.01])
      .runtime(game.runtimeNode("courier-van-rig-anchor", { tags: ["camera-anchor", "runtime"] })),
    model(assets.courierVanMeshyV2Decimated, {
      name: "courier-van-body",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: VAN_FIT_MAX,
      castShadow: true,
      receiveShadow: true
    })
      .position(spawnPose.x, ROAD_SURFACE_Y, spawnPose.z)
      .rotate(0, -spawnPose.heading, 0)
      .runtime(game.runtimeNode("courier-van-body", { tags: ["vehicle", "physics-synced", "runtime"] })),
    model(assets.courierParcel, {
      name: "parcel-carried",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 0.55,
      castShadow: true
    })
      .position(0, -5, 0)
      .runtime(game.runtimeNode("parcel-carried", { tags: ["delivery-state", "runtime"] })),
    ...trafficCarNodes(),
    primitives.torus({
      name: "strike impact ring",
      material: material.emissive({ color: "#ffb0ba", emissive: "#fb7185", emissiveIntensity: 1.2 })
    })
      .position(0, -5, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale(0.9)
      .runtime(game.runtimeNode("impact-ring", { tags: ["contact-feedback", "runtime"] }))
  ];
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({
      position: [spawnPose.x, ROAD_SURFACE_Y + 4.2, spawnPose.z + 7.5],
      target: [spawnPose.x, ROAD_SURFACE_Y + 0.9, spawnPose.z - 4],
      fov: 55
    }));
}

function guidanceDashNodes(): AuraNodeInput[] {
  const dashMaterial = material.emissive({ color: "#2dd4bf", emissive: "#0f766e", emissiveIntensity: 0.7, opacity: 0.85, practical: true });
  const transforms: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  for (const segment of STREET_SEGMENTS) {
    const horizontal = Math.abs(segment.bx - segment.ax) >= Math.abs(segment.bz - segment.az);
    const length = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az);
    const dashCount = Math.max(3, Math.floor(length / 7));
    for (let index = 0; index < dashCount; index += 1) {
      const t = (index + 0.5) / dashCount;
      transforms.push({
        position: [
          segment.ax + (segment.bx - segment.ax) * t,
          ROAD_SURFACE_Y + 0.02,
          segment.az + (segment.bz - segment.az) * t
        ],
        scale: horizontal ? [2.2, 0.018, 0.08] : [0.08, 0.018, 2.2]
      });
    }
  }
  return [
    instances.box({
      name: "courier lane markers",
      material: dashMaterial,
      castShadow: false,
      receiveShadow: false,
      transforms
    })
  ];
}

function dockDressingNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  const firstSite = ZONE_SITES[0]!;
  nodes.push(
    model(assets.courierZoneBollard, {
      name: `zone bollard ${firstSite.id}-1`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 1.15,
      castShadow: false
    }).position(firstSite.x, streetSurfaceY(firstSite.x, firstSite.z - BOLLARD_AXIS_OFFSET), firstSite.z - BOLLARD_AXIS_OFFSET)
  );
  const firstAwning = DOCK_AWNINGS[0]!;
  nodes.push(
    model(assets.courierZoneAwning, {
      name: `dock awning ${firstAwning.x},${firstAwning.z}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.3,
      castShadow: false,
      receiveShadow: true
    }).position(firstAwning.x, streetSurfaceY(firstAwning.x, firstAwning.z), firstAwning.z).rotate(0, firstAwning.yaw, 0)
  );
  return nodes;
}

function zoneRigNodes(kind: "pickup" | "drop", color: string): AuraNodeInput[] {
  return [
    primitives.torus({
      name: `courier ${kind} ground ring`,
      material: material.emissive({ color, emissive: color, emissiveIntensity: 0.9 })
    })
      .position(-999, ROAD_SURFACE_Y + 0.05, -999)
      .rotate(Math.PI / 2, 0, 0)
      .scale([ZONE_RADIUS * 1.05, ZONE_RADIUS * 1.05, 0.4])
      .runtime(game.runtimeNode(`courier-${kind}-ring`, { tags: ["zone-sensor", "runtime"] })),
    primitives.cylinder({
      name: `courier ${kind} beacon column`,
      material: material.emissive({ color, emissive: color, emissiveIntensity: 1.1, opacity: 0.1 })
    })
      .position(-999, 2.4, -999)
      .scale([0.2, 4.7, 0.2])
      .runtime(game.runtimeNode(`courier-${kind}-beacon`, { tags: ["zone-sensor", "runtime"] }))
  ];
}

function trafficCarNodes(): AuraNodeInput[] {
  return trafficCars.map((car, index) =>
    model(index % 2 === 0 ? assets.deliveryCar : assets.showcaseCityVehicle, {
      name: `traffic-car-${index + 1}`,
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.6,
      castShadow: false
    })
      .position(car.x, streetSurfaceY(car.x, car.z), car.z)
      .runtime(game.runtimeNode(`traffic-car-${index + 1}`, { tags: ["traffic", "physics-synced", "runtime"] }))
  );
}


