// apps/showcase-courier-rush/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.7 "early-rain delivery run through a wet dawn city": day cityBlock kit
// under a 4300 K dawn key, typed van + lane-loop traffic, zone rings, drop
// look-back chase rig, autopilot scenario. Gameplay modules (van/traffic/
// dispatch/city street graph) are unchanged; audio plays through the legacy
// cue map until C-25 game-sfx is real (standIn R-14-10).
import {
  createGameArcadeVehicle, game as engineGame, scene
} from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { assets } from "../../../../src/aura-assets";
import { buildPropColliders, type PropCollider, type ZoneSite } from "../legacy/city";
import {
  applyStrike, createDispatchState, currentDelivery, MAX_STRIKES,
  stepDispatch, type CourierEvent, type DispatchState
} from "../gameplay/dispatch";
import { createTrafficSimulation } from "../gameplay/traffic";
import {
  handbrakeSpeedMultiplier, toArcadeVehicleInput, VAN_TUNE, type VanDriveInput
} from "../gameplay/van";
import direction from "../../art/direction";
import { createCourierAudio, type CourierAudioCue } from "../legacy/courier-audio";
import { courierWorldNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createCourierRig, fallbackCameraNode } from "./scene/camera";
import { wireCourierFx } from "./scene/fx";
import { createCourierAutopilot } from "./autopilot";
import { publishCourierEvidence } from "./evidence";
import { applyCourierScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_COURIER_RUSH" as const;
const SHIFT_SEED = 0x5eed_3417;

const target = document.getElementById("app") ?? document.body;

// ------------------------------------------------------------------ world ----

const vanVehicle = createGameArcadeVehicle({
  maxSpeed: VAN_TUNE.maxSpeed,
  acceleration: VAN_TUNE.acceleration,
  brakeStrength: VAN_TUNE.brakeStrength,
  reverseSpeed: VAN_TUNE.reverseSpeed,
  drag: VAN_TUNE.drag,
  steerRate: VAN_TUNE.steerRate
});

const vanBounds = assets.courierVanMeshyV2Decimated.bounds;
const vanScale = 2.7 / Math.max(...vanBounds);
const VAN_HALF_WIDTH = (vanScale * Math.min(vanBounds[0]!, vanBounds[2]!)) / 2;
const VAN_COLLIDER_RADIUS = VAN_HALF_WIDTH + 0.05;
const SPAWN_POSE = { x: -0.45, z: 18.6, heading: -Math.PI / 2 };

let dispatch: DispatchState = createDispatchState();
const propColliders: readonly PropCollider[] = buildPropColliders();
const trafficSim = createTrafficSimulation({ seed: SHIFT_SEED });
let autopilotEnabled = false;
let dropLookbackRemaining = 0;
let lastVan = { x: SPAWN_POSE.x, z: SPAWN_POSE.z, heading: SPAWN_POSE.heading, speed: 0 };

const rigState = {
  van: { x: SPAWN_POSE.x, z: SPAWN_POSE.z, heading: SPAWN_POSE.heading },
  lookback: 0
};

const world = courierWorldNodes();

function buildScene() {
  return scene()
    .background("#1c2733")
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ----------------------------------------------------------------- audio -----

const audio = createCourierAudio();
const audioCueLog: string[] = [];
let audioUnlocked = false;
function pushCue(cue: CourierAudioCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue).catch(() => undefined);
}
const unlockAudio = () => {
  if (audioUnlocked) return;
  void audio.unlock().then(() => { audioUnlocked = true; }).catch(() => undefined);
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-courier-rush",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "motorsport",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "job", kind: "label", anchor: "top", label: "DISPATCH" },
      { id: "score", kind: "score", anchor: "top-left", label: "PAY" },
      { id: "timer", kind: "label", anchor: "top-right", label: "TIMER" },
      { id: "strikes", kind: "label", anchor: "bottom-left", label: "STRIKES" },
      { id: "prompt", kind: "label", anchor: "bottom", label: "ACTION" }
    ]
  },
  touch: {
    preset: "steer-pedals",
    bindings: { throttle: "right-hold", brake: "left-hold", steer: "steer-drag", handbrake: "two-finger-tap", interact: "tap", pause: "menu" }
  },
  sound: {
    cues: {
      "engine": { asset: "courierEngineSfx" },
      "ambient-city": { asset: "courierAmbientCitySfx" },
      "dispatch": { asset: "courierDispatchBlipSfx" },
      "pickup": { asset: "courierParcelPickupSfx" },
      "drop": { asset: "courierParcelDropSfx" },
      "early-bonus": { asset: "courierEarlyBonusSfx" },
      "strike": { asset: "courierStrikeHitSfx" },
      "horn": { asset: "courierHornNearSfx" },
      "shift-clear": { asset: "courierShiftClearSfx" },
      "shift-fail": { asset: "courierShiftFailSfx" }
    }
  },
  juice: {
    "strike": { hitStopMs: 40, trauma: 0.2 },
    "shift-clear": { trauma: 0.25 },
    "shift-fail": { trauma: 0.2, hitStopMs: 50 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_courier_rush` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-courier-rush`).
    flags: ["route_courier_rush", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

// ------------------------------------------------------------- sim state -----

const fx = wireCourierFx(game);
let frame = 0;
const bootedAtMs = performance.now();
const autopilot = createCourierAutopilot({
  colliderRadius: VAN_COLLIDER_RADIUS,
  colliders: () => [...propColliders, ...trafficSim.staticColliders()]
});

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- input ---------

const input = engineGame.input({
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    handbrake: ["Space"],
    interact: ["KeyE"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 90
});

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Touch: right-hold throttle, left-hold brake, drag steers, tap interacts.
let interactTap = false;
const touch = { throttle: false, brake: false, steerX: 0, downX: 0, downY: 0, tapAt: 0 };
target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  const x = e.clientX / Math.max(1, target.clientWidth);
  touch.downX = e.clientX;
  touch.downY = e.clientY;
  touch.tapAt = performance.now();
  if (x < 0.5) touch.brake = true; else touch.throttle = true;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
target.addEventListener("pointermove", (e) => {
  const dx = (e.clientX - touch.downX) / Math.max(1, target.clientWidth);
  touch.steerX = Math.max(-1, Math.min(1, dx * 3.2));
});
const endTouch = (e: PointerEvent) => {
  if (touch.tapAt > 0 && performance.now() - touch.tapAt < 220 &&
      Math.hypot(e.clientX - touch.downX, e.clientY - touch.downY) < 14) {
    interactTap = true;
  }
  touch.throttle = false;
  touch.brake = false;
  touch.steerX = 0;
  touch.tapAt = 0;
};
target.addEventListener("pointerup", endTouch);
target.addEventListener("pointercancel", () => { touch.throttle = false; touch.brake = false; touch.steerX = 0; touch.tapAt = 0; });

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// ----------------------------------------------------------- strike/zone -----

function collisionHits(vanX: number, vanZ: number, vanSpeed: number): PropCollider[] {
  const hits: PropCollider[] = [];
  for (const collider of [...propColliders, ...trafficSim.staticColliders()]) {
    const reach = collider.radius + VAN_COLLIDER_RADIUS;
    const dx = vanX - collider.x;
    const dz = vanZ - collider.z;
    if (dx * dx + dz * dz >= reach * reach) continue;
    // Adjacent-lane passes at matched pace are city driving, not crashes.
    if (collider.speed !== undefined && Math.abs(vanSpeed - collider.speed) < 1.35) continue;
    hits.push(collider);
  }
  return hits;
}

function pushOut(vanX: number, vanZ: number, collider: PropCollider): { x: number; z: number } {
  const dx = vanX - collider.x;
  const dz = vanZ - collider.z;
  const distance = Math.max(0.001, Math.hypot(dx, dz));
  const reach = collider.radius + VAN_COLLIDER_RADIUS;
  return { x: collider.x + (dx / distance) * reach, z: collider.z + (dz / distance) * reach };
}

function activeTargetSite(state: DispatchState): ZoneSite | null {
  const plan = currentDelivery(state);
  if (!plan) return null;
  return state.phase === "awaitingPickup" ? plan.pickup : plan.drop;
}

function consumeEvents(events: readonly CourierEvent[], vanX: number, vanZ: number): void {
  for (const event of events) {
    switch (event.type) {
      case "dispatch":
        pushCue("dispatch");
        break;
      case "pickup":
        pushCue("pickup");
        fx.onPickup([vanX, 0.5, vanZ]);
        break;
      case "drop":
        pushCue("drop");
        if (event.early) pushCue("early-bonus");
        fx.onDrop([vanX, 0.5, vanZ]);
        dropLookbackRemaining = 0.9;
        break;
      case "strike":
        pushCue("strike");
        fx.onStrike([vanX, 0, vanZ], lastVan.heading);
        break;
      case "timerFail":
      case "strikesExhausted":
        pushCue("shift-fail");
        fx.onShiftFail();
        break;
      case "shiftClear":
        pushCue("shift-clear");
        fx.onShiftClear();
        break;
      default:
        break;
    }
  }
}

function fullReset(): void {
  dispatch = createDispatchState();
  trafficSim.reset();
  vanVehicle.reset({ x: SPAWN_POSE.x, z: SPAWN_POSE.z, heading: SPAWN_POSE.heading, speed: 0, drift: 0 });
  dropLookbackRemaining = 0;
}

// ------------------------------------------------------------- frame loop ----

let lastHudSignature = "";
let lastHudWrite = 0;
function syncHud(): void {
  const plan = currentDelivery(dispatch);
  const site = activeTargetSite(dispatch);
  const jobText = !plan
    ? dispatch.phase === "shiftClear" ? "SHIFT CLEAR" : "SHIFT OVER"
    : (dispatch.phase === "awaitingPickup" ? `PICKUP ${site?.label ?? ""}` : `DROP ${site?.label ?? ""}`);
  const signature = `${jobText}|${dispatch.score}|${Math.ceil(dispatch.timerMs / 1000)}|${dispatch.strikes}|${dispatch.combo}`;
  if (signature === lastHudSignature && frame - lastHudWrite < 300) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  game.hud.set("job", jobText);
  game.hud.set("score", `${dispatch.score}`);
  game.hud.set("timer", `${Math.max(0, Math.ceil(dispatch.timerMs / 1000))}s x${dispatch.combo.toFixed(1)}`);
  game.hud.set("strikes", `STRIKES ${dispatch.strikes}/${MAX_STRIKES}`);
  game.hud.set("prompt", site && plan ? (dispatch.phase === "awaitingPickup" ? "E TO LOAD" : "E TO DROP") : "");
}

game.app.onFrame?.(({ dt: rawDt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, game.session.scaledDt(rawDt) || 1 / 60));
  frame += 1;
  input.update(stepSeconds);
  if (game.session.paused || stepSeconds <= 0) return;

  if (input.pressed("pause")) {
    game.session.paused ? game.session.resume() : game.session.pause();
    pushCue("dispatch");
  }
  if (input.pressed("reset")) fullReset();

  const snapshotBefore = vanVehicle.snapshot();
  const dispatchResult = stepDispatch(dispatch, stepSeconds * 1000, {
    vanX: snapshotBefore.x,
    vanZ: snapshotBefore.z,
    interactPressed: input.pressed("interact") || interactTap
  });
  interactTap = false;
  dispatch = dispatchResult.state;
  consumeEvents(dispatchResult.events, snapshotBefore.x, snapshotBefore.z);

  const plan = currentDelivery(dispatch);
  const driveInput: VanDriveInput = autopilotEnabled && plan
    ? autopilot.drive(snapshotBefore.x, snapshotBefore.z, snapshotBefore.heading, Math.abs(snapshotBefore.speed), dispatch)
    : {
        throttle: input.held("throttle") || touch.throttle ? 1 : 0,
        brake: input.held("brake") || touch.brake ? 1 : 0,
        steer: Math.max(-1, Math.min(1, input.axis("steer") + touch.steerX)),
        handbrake: input.held("handbrake")
      };
  const { input: arcadeInput, handbrake } = toArcadeVehicleInput(driveInput);
  let vanAfter = vanVehicle.step(stepSeconds, arcadeInput);
  if (handbrake) {
    vanAfter = vanVehicle.constrain({ speedMultiplier: handbrakeSpeedMultiplier(stepSeconds) });
  }

  // Strikes: lamp poles + slow-mover traffic contacts push the van out.
  for (const hit of collisionHits(vanAfter.x, vanAfter.z, Math.abs(vanAfter.speed))) {
    const pushed = pushOut(vanAfter.x, vanAfter.z, hit);
    vanAfter = vanVehicle.constrain({ x: pushed.x, z: pushed.z, speedMultiplier: 0.35 });
    const strikeResult = applyStrike(dispatch, hit.id);
    dispatch = strikeResult.state;
    consumeEvents(strikeResult.events, pushed.x, pushed.z);
    break;
  }

  const trafficEvents = trafficSim.step(stepSeconds, vanAfter.x, vanAfter.z);
  if (trafficEvents.length > 0) pushCue("horn");

  lastVan = { x: vanAfter.x, z: vanAfter.z, heading: vanAfter.heading, speed: vanAfter.speed };
  rigState.van = { x: vanAfter.x, z: vanAfter.z, heading: vanAfter.heading };
  dropLookbackRemaining = Math.max(0, dropLookbackRemaining - stepSeconds);
  rigState.lookback = dropLookbackRemaining > 0 ? dropLookbackRemaining / 0.9 : 0;

  // ---- presentation ----
  const fxF = Math.cos(vanAfter.heading);
  const fzF = Math.sin(vanAfter.heading);
  const vanYaw = -vanAfter.heading + Math.PI;
  handle("courier-van-body")?.setPosition(vanAfter.x, 0, vanAfter.z).setRotation(0, vanYaw, 0);
  const rightX = -fzF;
  const rightZ = fxF;
  const trimLateral = VAN_HALF_WIDTH + 0.04;
  handle("van-trim-left")?.setPosition(vanAfter.x + rightX * -trimLateral, 0.72, vanAfter.z + rightZ * -trimLateral).setRotation(0, vanYaw, 0);
  handle("van-trim-right")?.setPosition(vanAfter.x + rightX * trimLateral, 0.72, vanAfter.z + rightZ * trimLateral).setRotation(0, vanYaw, 0);
  handle("van-rear-bumper")?.setPosition(vanAfter.x - fxF * 1.12, 0.4, vanAfter.z - fzF * 1.12).setRotation(0, vanYaw, 0);

  const carrying = dispatch.phase === "carrying";
  handle("parcel-beacon")?.setPosition(vanAfter.x + fxF * 0.08, 1.56, vanAfter.z + fzF * 0.08).setVisible(carrying);
  handle("parcel-carried")?.setPosition(vanAfter.x - fxF * 0.08, 0.9, vanAfter.z - fzF * 0.3)
    .setRotation(0, -vanAfter.heading, 0)
    .setScale(carrying ? 1 : 0.001)
    .setVisible(carrying);

  // Zone rings track the active site (pickup cyan / drop amber).
  const site = activeTargetSite(dispatch);
  const pickupActive = site !== null && dispatch.phase === "awaitingPickup";
  const dropActive = site !== null && dispatch.phase === "carrying";
  if (site) {
    const px = pickupActive ? site.x : -999;
    const pz = pickupActive ? site.z : -999;
    handle("courier-pickup-ring")?.setPosition(px, 0.06, pz);
    handle("courier-pickup-beacon")?.setPosition(px, 2.35, pz);
    const dx = dropActive ? site.x : -999;
    const dz = dropActive ? site.z : -999;
    handle("courier-drop-ring")?.setPosition(dx, 0.06, dz);
    handle("courier-drop-beacon")?.setPosition(dx, 2.35, dz);
  }

  // Lane-loop traffic onto the runtime car bodies.
  const cars = trafficSim.cars();
  for (let index = 0; index < world.trafficCarNames.length; index += 1) {
    const car = cars[index];
    const h = handle(world.trafficCarNames[index]!);
    if (!h || !car) continue;
    h.setPosition(car.x, 0, car.z).setRotation(0, -car.heading + Math.PI, 0).setVisible(true);
  }

  fx.syncImpact(stepSeconds);
  if (frame % 6 === 0) syncHud();
});

// ------------------------------------------------------------- evidence ------

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(game.lookSource()),
  postPreset: "daylight-outdoor",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "courier-rush.chase"
});

publishCourierEvidence({
  game,
  dispatch: () => dispatch,
  van: () => lastVan,
  traffic: () => trafficSim.cars(),
  autopilot: () => ({ enabled: autopilotEnabled, aim: autopilot.aim }),
  appliedLook,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const scenario = new URL(location.href).searchParams.get("scenario");
if (new URL(location.href).searchParams.get("autopilot") === "1") autopilotEnabled = true;
if (scenario) {
  applyCourierScenario(scenario, {
    enableAutopilot: () => { autopilotEnabled = true; },
    warmTraffic: (frames) => {
      for (let i = 0; i < frames; i += 1) trafficSim.step(1 / 60, SPAWN_POSE.x, SPAWN_POSE.z);
    },
    overlapStrikeCollider: () => {
      const lamp = propColliders[0]!;
      vanVehicle.reset({ x: lamp.x, z: lamp.z, heading: 0, speed: 4, drift: 0 });
    },
    sync: () => { syncHud(); }
  });
}

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createCourierRig(rigState), { blend: 0.4 });
  // C-05 output: daylight-outdoor preset; post presets stub {} until the
  // registry ships real output profiles.
    game.app.setOutput?.({ preset: "daylight-outdoor",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: "showcase-courier-rush",
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
