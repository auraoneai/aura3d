// apps/showcase-turbo-drift-circuit/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.2 "sunset alpine circuit": sole sun key + K1 sunset HDRI sky/IBL,
// chase rig (R-14-10), K3 road/terrain stand-in keeps the certified V2
// circuit (R-14-13). Racing sim is the unchanged `game.racing` kit; vehicle
// contact chassis + driver AI + race-session feel helpers are unchanged
// gameplay modules (S-world keeps world layout + hero GLBs).
import { game, scene, type VehicleVec3 } from "@aura3d/engine";
import { createGame, lookManifest } from "@aura3d/game";
import {
  advanceStartLights, canSimulateRace, createRaceSessionState,
  formatGapToRival, resolveRacePosition, resolveRaceHudStatus,
  startLightsLabel, updateRaceSessionTiming, updateNitro,
  type RaceSessionState
} from "../gameplay/feel";
import { turboDriftWorldNodes } from "./scene/world";
import { turboDriftLights, turboDriftEnvironment } from "./scene/lighting";
import { createTurboChaseRig, fallbackTurboCameraNode } from "./scene/camera";
import { turboDriftFxFrame } from "./scene/fx";
import { publishTurboDriftEvidence } from "./evidence";
import { applyTurboDriftScenario } from "./scenarios";
import direction from "../../art/direction";
import {
  CAR_SCENE_HEIGHT, CIRCUIT_ENVIRONMENT_TARGET_MAX_DIMENSION,
  carChassisSpec, gameplayMaxSpeed, heroFraming, opponentAi,
  opponentChassis, opponentChassisSpec, opponentRenderedSize,
  playerChassis, racingLine, racingScene, racingState, route,
  seatCarOnVisibleAsphalt
} from "./race-setup";
const ROUTE_FLAG = "A3D_QR_ROUTE_TURBO_DRIFT_CIRCUIT" as const;
const target = document.getElementById("app") ?? document.body;
// ------------------------------------------------------------------ game ----

let raceSession: RaceSessionState = createRaceSessionState();
let raceSnapshot = racingState.snapshot();
let opponentSnapshot = opponentAi.snapshot();
const initialPlayerPose = racingScene.toScenePose(raceSnapshot);
const initialOpponentPose = racingScene.toScenePose(opponentSnapshot, 0);
let playerChassisPose = playerChassis.reset({
  x: initialPlayerPose.position[0], z: initialPlayerPose.position[2],
  heading: raceSnapshot.heading, speed: 0, steer: 0
});
let opponentChassisPose = opponentChassis.reset({
  x: initialOpponentPose.position[0], z: initialOpponentPose.position[2],
  heading: opponentSnapshot.heading, speed: 0, steer: 0
});
const rigState = { speed: 0, heading: raceSnapshot.heading, finishing: false };
const audioCueLog: string[] = [];
const pushCue = (cue: string) => {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
};

const worldBuilders = turboDriftWorldNodes({
  circuitEnvironmentTargetMaxDimension: CIRCUIT_ENVIRONMENT_TARGET_MAX_DIMENSION,
  playerPosition: seatCarOnVisibleAsphalt(playerChassisPose, heroFraming.subject.size as VehicleVec3, carChassisSpec.wheelRadius),
  playerRotation: [playerChassisPose.rotation[0], initialPlayerPose.rotation[1], playerChassisPose.rotation[2]],
  opponentPosition: seatCarOnVisibleAsphalt(opponentChassisPose, opponentRenderedSize, opponentChassisSpec.wheelRadius),
  opponentRotation: [opponentChassisPose.rotation[0], initialOpponentPose.rotation[1], opponentChassisPose.rotation[2]]
});

function buildScene() {
  return scene()
    .background("#2a2030")
    .camera(fallbackTurboCameraNode())
    .add(turboDriftEnvironment())
    .addMany(worldBuilders as never[])
    .addMany(turboDriftLights());
}

const gameShell = createGame({
  id: "showcase-turbo-drift-circuit",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "motorsport",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "speed", kind: "meter", anchor: "bottom-right", label: "KPH" },
      { id: "tach", kind: "meter", anchor: "bottom-right", label: "RPM" },
      { id: "gear", kind: "label", anchor: "bottom-right", label: "GEAR" },
      { id: "lap", kind: "label", anchor: "top-left", label: "LAP" },
      { id: "position", kind: "score", anchor: "top-right", label: "POS" },
      { id: "minimap", kind: "label", anchor: "top", label: "MAP" },
      { id: "lights", kind: "label", anchor: "center", label: "LIGHTS" },
      { id: "status", kind: "label", anchor: "bottom-left", label: "STATUS" }
    ]
  },
  touch: {
    preset: "steer-pedals",
    bindings: { steer: "steer", throttle: "throttle-pedal", brake: "brake-pedal", drift: "drift-button", pause: "menu" }
  },
  sound: {
    // §14.4 engine loop: C-25 mixer binds `engine(spec)` with rpm→pitch drive
    // once the audio lane lands; declared in the same options bag today.
    engine: { cue: "car-sport", rpmRange: [900, 8000], pitchRange: [0.6, 1.8] },
    cues: {
      "engine": { asset: "car-sport-rpm", variants: 1 },
      "skid": { asset: "skid-loop", variants: 1 },
      "wind": { asset: "speed-wind", variants: 1 },
      "bed": { asset: "crowd-bed", variants: 1 },
      "music": { asset: "turbo-music", variants: 1 }
    }
  },
  juice: {
    "kerb-hit": { trauma: 0.1 },
    "finish": { slowMo: { scale: 0.5, ms: 900 }, trauma: 0.5 },
    "speed-streaks": { speedThresholdRatio: 0.85 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_turbo_drift_circuit` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-turbo-drift-circuit`).
    flags: ["route_turbo_drift_circuit", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

// ------------------------------------------------------------------ input ----

const held = new Set<string>();
const prev = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  held.add(e.code);
  if (e.code === "KeyP" || e.code === "Escape") {
    gameShell.session.paused ? gameShell.session.resume() : gameShell.session.pause("user");
  }
  if (e.code === "KeyR") resetRace();
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", () => held.clear());

// steer-pedals (§7.2.1): left-half horizontal drag steers; right-half hold
// throttles; two-finger tap on the right half = brake/drift.
const touchState = { steer: 0, throttle: false, steerPointer: -1, throttlePointer: -1, steerStartX: 0 };
target.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const half = target.clientWidth / 2;
  if (e.clientX < half && touchState.steerPointer < 0) {
    touchState.steerPointer = e.pointerId;
    touchState.steerStartX = e.clientX;
  } else if (e.clientX >= half && touchState.throttlePointer < 0) {
    touchState.throttlePointer = e.pointerId;
    touchState.throttle = true;
  }
});
target.addEventListener("pointermove", (e) => {
  if (e.pointerId === touchState.steerPointer) {
    touchState.steer = Math.max(-1, Math.min(1, (e.clientX - touchState.steerStartX) / (target.clientWidth * 0.18)));
  }
});
const releasePointer = (e: PointerEvent) => {
  if (e.pointerId === touchState.steerPointer) { touchState.steerPointer = -1; touchState.steer = 0; }
  if (e.pointerId === touchState.throttlePointer) { touchState.throttlePointer = -1; touchState.throttle = false; }
};
target.addEventListener("pointerup", releasePointer);
target.addEventListener("pointercancel", releasePointer);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) gameShell.session.pause("visibility");
  else gameShell.session.resume();
});

function resetRace(): void {
  raceSession = createRaceSessionState();
  raceSnapshot = racingState.reset(0);
  opponentSnapshot = opponentAi.reset();
  const p = racingScene.toScenePose(raceSnapshot);
  const o = racingScene.toScenePose(opponentSnapshot, 0);
  playerChassisPose = playerChassis.reset({ x: p.position[0], z: p.position[2], heading: raceSnapshot.heading, speed: 0, steer: 0 });
  opponentChassisPose = opponentChassis.reset({ x: o.position[0], z: o.position[2], heading: opponentSnapshot.heading, speed: 0, steer: 0 });
}

// ------------------------------------------------------------------- loop ----

const driftWasActive = { value: false };
let finishedJuiceFired = false;

function driveStep(rawDt: number): void {
  const dt = gameShell.session.scaledDt(rawDt);
  if (dt <= 0 || gameShell.session.paused) return;

  raceSession = { ...raceSession, startLights: advanceStartLights(raceSession.startLights, dt, held.has("KeyW") || held.has("ArrowUp") || touchState.throttle) };
  const simulating = canSimulateRace(raceSession, raceSnapshot.status === "finished");

  if (simulating) {
    const throttle = held.has("KeyW") || held.has("ArrowUp") || touchState.throttle;
    const brake = held.has("KeyS") || held.has("ArrowDown");
    const steer = (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0) + touchState.steer;
    const drift = held.has("Space") || held.has("ShiftLeft");
    const boost = held.has("ShiftRight") && raceSession.nitroSeconds > 0;
    raceSnapshot = racingState.step(dt, {
      throttle: throttle ? 1 : 0,
      brake: brake ? 1 : 0,
      steer: Math.max(-1, Math.min(1, steer)),
      drift,
      boost
    });
    opponentSnapshot = opponentAi.step(dt, raceSnapshot.progress, raceSnapshot.signedTrackOffset);
    raceSession = updateNitro(raceSession, dt);
    raceSession = updateRaceSessionTiming(raceSession, dt, raceSnapshot.status === "finished", raceSnapshot.lapTime);
  }

  // Poses: scene binding → mesh chassis → seat on visible asphalt.
  const pPose = racingScene.toScenePose(raceSnapshot);
  playerChassisPose = playerChassis.step(dt, {
    x: pPose.position[0], z: pPose.position[2],
    heading: raceSnapshot.heading, speed: raceSnapshot.speed,
    steer: Math.max(-1, Math.min(1, (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0) + touchState.steer)),
    throttle: simulating ? 1 : 0,
    brake: held.has("KeyS") || held.has("ArrowDown") ? 1 : 0,
    slip: Math.min(1, Math.abs(raceSnapshot.drift))
  });
  const playerNode = gameShell.app.nodes.get("racing-player-car");
  if (!playerNode) return;
  playerNode.setPosition(...seatCarOnVisibleAsphalt(playerChassisPose, heroFraming.subject.size as VehicleVec3, carChassisSpec.wheelRadius));
  playerNode.setRotation(playerChassisPose.rotation[0], pPose.rotation[1], playerChassisPose.rotation[2]);

  const oPose = racingScene.toScenePose(opponentSnapshot, 0);
  opponentChassisPose = opponentChassis.step(dt, {
    x: oPose.position[0], z: oPose.position[2],
    heading: opponentSnapshot.heading, speed: opponentSnapshot.speed,
    steer: 0, throttle: 1, brake: 0,
    slip: Math.min(1, Math.abs(opponentSnapshot.drift))
  });
  const opponentNode = gameShell.app.nodes.get("racing-opponent-car");
  if (opponentNode) {
    opponentNode.setPosition(...seatCarOnVisibleAsphalt(opponentChassisPose, opponentRenderedSize, opponentChassisSpec.wheelRadius));
    opponentNode.setRotation(opponentChassisPose.rotation[0], oPose.rotation[1], opponentChassisPose.rotation[2]);
  }

  // Events → fx + juice + audio intents.
  let finishedNow = false;
  let scrapedNow = false;
  for (const ev of racingState.consumeEvents()) {
    if (ev.type === "off-track") scrapedNow = true;
    if (ev.type === "lap") pushCue("engine");
    if (ev.type === "finish") { finishedNow = true; pushCue("music"); }
  }
  const drifting = Math.abs(raceSnapshot.drift) > 0.2;
  if (drifting && !driftWasActive.value) pushCue("skid");
  if (!drifting && driftWasActive.value) pushCue("wind");
  driftWasActive.value = drifting;
  if (finishedNow && !finishedJuiceFired) { finishedJuiceFired = true; rigState.finishing = true; }
  if (!finishedNow && finishedJuiceFired) finishedJuiceFired = false;

  turboDriftFxFrame({ game: { fx: gameShell.fx, session: gameShell.session }, app: gameShell.app }, {
    speedRatio: gameplayMaxSpeed > 0 ? Math.abs(raceSnapshot.speed) / gameplayMaxSpeed : 0,
    driftAmount: Math.min(1, Math.abs(raceSnapshot.drift)),
    offTrack: raceSnapshot.offTrack,
    scraped: scrapedNow,
    carPosition: pPose.position,
    finishedEvent: finishedNow
  });

  rigState.speed = raceSnapshot.speed;
  rigState.heading = raceSnapshot.heading;

  // HUD (≤1 write/300 constant frames pattern from T1.12 lives in hud.set).
  const speedRatio = gameplayMaxSpeed > 0 ? Math.abs(raceSnapshot.speed) / gameplayMaxSpeed : 0;
  const rpm = 900 + (8000 - 900) * Math.min(1, speedRatio * 1.15);
  const gear = Math.max(1, Math.min(6, 1 + Math.floor(speedRatio * 6)));
  gameShell.hud.set("speed", `${Math.round(Math.abs(raceSnapshot.speed) * 36)}`);
  gameShell.hud.set("tach", `${Math.round(rpm / 100) / 10}k`);
  gameShell.hud.set("gear", raceSnapshot.speed < 0 ? "R" : `${gear}`);
  gameShell.hud.set("minimap", `S${Math.floor(raceSnapshot.progress * 6) + 1}`);
  gameShell.hud.set("lap", `${Math.min(raceSnapshot.lap, raceSnapshot.lapsToWin)}/${raceSnapshot.lapsToWin}`);
  const gap = opponentAi.evidence(raceSnapshot.progress).signedPlayerGap;
  gameShell.hud.set("position", resolveRacePosition(gap));
  gameShell.hud.set("lights", startLightsLabel(raceSession.startLights));
  gameShell.hud.set("status", resolveRaceHudStatus(raceSession, raceSnapshot.status === "finished"));
}

gameShell.app.onFrame?.(({ dt }) => driveStep(dt));

// ------------------------------------------------------------------- boot ----

let framePublished = 0;
const bootedAtMs = performance.now();
gameShell.app.onRender?.(() => { framePublished += 1; });
gameShell.start();
void gameShell.ready().then(() => {
  const rig = createTurboChaseRig(rigState, {
    distance: Math.max(heroFraming.distance, CAR_SCENE_HEIGHT * 5.2),
    height: Math.max(heroFraming.height, CAR_SCENE_HEIGHT * 2.1),
    sideOffset: (heroFraming as { sideOffset?: number }).sideOffset ?? 0,
    lookAhead: Math.max(1.05, CAR_SCENE_HEIGHT * 3.6),
    maxSpeed: gameplayMaxSpeed
  });
  gameShell.app.camera?.use?.(rig, { blend: 0.4 });
  // C-05 output: exposureEV 0 → linear 1; postPresets output stubs are {} —
  // post settles when the preset registry ships real output profiles.
  gameShell.app.setOutput?.({ preset: "daylight-outdoor", exposure: 1 });

  publishTurboDriftEvidence({
    game: { session: gameShell.session, fx: gameShell.fx },
    app: () => gameShell.app,
    snapshot: () => raceSnapshot,
    // T2.2-post: appliedLook derives from the C-31 runtime manifest.
    appliedLook: { ...lookManifest(gameShell.lookSource()), preset: "daylight-outdoor" },
    raceStatus: () => resolveRaceHudStatus(raceSession, raceSnapshot.status === "finished"),
    opponentGap: () => opponentAi.evidence(raceSnapshot.progress).signedPlayerGap,
    audioCueLog: () => audioCueLog,
    bootedAtMs,
    frameCount: () => framePublished
  });

  const scenario = new URLSearchParams(location.search).get("scenario");
  if (scenario) {
    const applied = applyTurboDriftScenario(scenario, {
      racing: racingState,
      opponent: { placeAtProgress: (p, off) => opponentAi.placeAtProgress(p, off) }
    });
    if (applied) {
      raceSnapshot = racingState.snapshot();
      (window as unknown as Record<string, unknown>).__TURBO_DRIFT_SCENARIO__ = applied;
    }
  }

  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: gameShell.id,
    get app() { return gameShell.app; },
    get scene() { return gameShell.app.scene; },
    get state() { return gameShell.session.state; },
    get session() { return gameShell.session; },
    get frame() { return framePublished; },
    firstFrameAt: performance.now(),
    sessionStartedAt: bootedAtMs
  };
  void formatGapToRival(0, racingLine.length, gameplayMaxSpeed);
});
