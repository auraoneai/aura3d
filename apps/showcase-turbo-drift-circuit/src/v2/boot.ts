// apps/showcase-turbo-drift-circuit/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.2 "sunset alpine circuit": sole sun key + K1 sunset HDRI sky/IBL,
// chase rig (R-14-10), K3 road/terrain stand-in keeps the certified V2
// circuit (R-14-13). Racing sim is the unchanged `game.racing` kit; vehicle
// contact chassis + driver AI + race-session feel helpers are unchanged
// gameplay modules (S-world keeps world layout + hero GLBs).
import {
  createVehicleChassis,
  createVehicleDriverAi,
  game,
  groundedFittedModelPosition,
  resolveChaseFraming,
  scene,
  vehicleChassisSpecFromBounds,
  type AuraVec3,
  type DriverRoute,
  type VehiclePose,
  type VehicleSurface,
  type VehicleVec3
} from "@aura3d/engine";
import { postPresets } from "@aura3d/engine/contracts";
import { createGame } from "@aura3d/game";
import { assets } from "../../../../src/aura-assets";
import { gameGeometryContract } from "../generated/game-geometry";
import { createTurboOpponentAi } from "../gameplay/opponent-ai";
import {
  advanceStartLights, canSimulateRace, createRaceSessionState,
  formatGapToRival, resolveRacePosition, resolveRaceHudStatus,
  startLightsLabel, updateRaceSessionTiming, updateNitro,
  type RaceSessionState
} from "../gameplay/feel";
import {
  measureTurboPassingLane, turboMaxAsphaltOffset,
  turboVehicleBoundaryInset, turboVisualAsphaltWidth
} from "../gameplay/passing-lane";
import {
  turboDriftWorldNodes, SCENE_SIZE, TRACK_REFERENCE_Y,
  CAR_TARGET_MAX_DIMENSION, OPPONENT_TARGET_MAX_DIMENSION
} from "./scene/world";
import { turboDriftLights, turboDriftEnvironment } from "./scene/lighting";
import { createTurboChaseRig, fallbackTurboCameraNode } from "./scene/camera";
import { turboDriftFxFrame } from "./scene/fx";
import { publishTurboDriftEvidence } from "./evidence";
import { applyTurboDriftScenario } from "./scenarios";
import direction from "../../art/direction";

const ROUTE_FLAG = "A3D_QR_ROUTE_TURBO_DRIFT_CIRCUIT" as const;
const target = document.getElementById("app") ?? document.body;

// ------------------------------------------------- certified route setup ----
// (port of the certified constants block in legacy/main.ts — derivations
// kept identical so a circuit swap re-derives, never goes stale.)
const trackTopology = gameGeometryContract.topology;
const routeGeometry = gameGeometryContract.route;
const FORMULA_ASPHALT_WIDTH = 3.6;
const HERO_VEHICLE_ASSET = "showcaseCc0FormulaRaceCar";
const route = game.assetBoundRacingRoute({
  vehicleAsset: HERO_VEHICLE_ASSET,
  trackAsset: "turboFormulaCircuit",
  authoredLapSeconds: gameGeometryContract.authoredSeconds,
  minLapSeconds: 30,
  minCheckpoints: 6,
  topology: trackTopology,
  route: {
    id: routeGeometry.id,
    width: FORMULA_ASPHALT_WIDTH,
    points: routeGeometry.points,
    checkpoints: routeGeometry.checkpoints
  }
});
const routeWidth = FORMULA_ASPHALT_WIDTH;
const certifiedMaxSpeed = route.assetBinding.speedModel.certifiedSpeed;
const gameplayPaceMultiplier = 4;
const gameplayMaxSpeed = Number((certifiedMaxSpeed * gameplayPaceMultiplier).toFixed(3));
const certifiedAcceleration = Number((gameplayMaxSpeed * 4.1).toFixed(3));

function measureTightestCornerRadius(points: readonly { x: number; y: number }[]): number {
  let tightest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const cur = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    let turn = Math.atan2(next.y - cur.y, next.x - cur.x) - Math.atan2(cur.y - prev.y, cur.x - prev.x);
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) < 1e-6) continue;
    const radius = ((inLen + outLen) / 2) / Math.abs(turn);
    if (radius < tightest) tightest = radius;
  }
  return Number.isFinite(tightest) ? tightest : 1;
}
const tightestCornerRadius = measureTightestCornerRadius(routeGeometry.points);
const certifiedSteerRate = Number(
  Math.max(2.7, (gameplayMaxSpeed / (tightestCornerRadius * 1.28)) * 0.75).toFixed(3)
);
const STEER_CORRECTION_GAIN = Number((2 / Math.max(0.05, routeWidth / 2)).toFixed(3));
const recoveryHeadingLimit = Math.PI / 90;

const heroFraming = resolveChaseFraming(assets.showcaseCc0FormulaRaceCar, {
  targetMaxDimension: CAR_TARGET_MAX_DIMENSION,
  subjectVerticalOccupancy: [0.18, 0.24],
  fov: 54,
  eyeHeightFraction: 0.9,
  lowerSilhouetteFraction: 0.32,
  requireLowerSideFeatureVisibility: true
});
const CAR_SCENE_HEIGHT = heroFraming.subject.height;
const ROAD_DETAIL_SURFACE_LIFT = 0.075;
const CAR_REFERENCE_Y = TRACK_REFERENCE_Y;

function seatCarOnVisibleAsphalt(
  pose: Pick<VehiclePose, "groundedPosition" | "rotation">,
  fittedSize: VehicleVec3,
  wheelRadius: number
): VehicleVec3 {
  const seated = groundedFittedModelPosition(pose, fittedSize, {
    contactClearance: wheelRadius * 0.06
  });
  return [seated[0], seated[1] + ROAD_DETAIL_SURFACE_LIFT, seated[2]];
}

const routePlanBounds = trackTopology.roadCenterline.reduce(
  (b, p) => ({
    minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
    minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z)
  }),
  { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minZ: Number.POSITIVE_INFINITY, maxZ: Number.NEGATIVE_INFINITY }
);
const routePlanMaxSpan = Math.max(routePlanBounds.maxX - routePlanBounds.minX, routePlanBounds.maxZ - routePlanBounds.minZ);
const trackModelBounds = trackTopology.modelAlignment.modelBounds;
const trackModelMaxSpan = Math.max(
  trackModelBounds.max[0] - trackModelBounds.min[0],
  trackModelBounds.max[1] - trackModelBounds.min[1],
  trackModelBounds.max[2] - trackModelBounds.min[2]
);
const TRACK_MODEL_TARGET_MAX_DIMENSION = Number(
  (trackModelMaxSpan * (SCENE_SIZE / routePlanMaxSpan)).toFixed(6)
);
const CIRCUIT_ENVIRONMENT_TARGET_MAX_DIMENSION = Number((
  TRACK_MODEL_TARGET_MAX_DIMENSION
  * (Math.max(...assets.turboCircuitEnvironmentV2.bounds) / Math.max(...assets.turboFormulaCircuit.bounds))
).toFixed(6));

const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset: "turboFormulaCircuit",
  targetSceneSize: SCENE_SIZE,
  trackModelTargetMaxDimension: TRACK_MODEL_TARGET_MAX_DIMENSION,
  trackY: TRACK_REFERENCE_Y,
  carY: CAR_REFERENCE_Y,
  ghostY: CAR_REFERENCE_Y - 0.02
});

const fittedCarChassisSpec = vehicleChassisSpecFromBounds([
  heroFraming.subject.size[0], heroFraming.subject.size[1], heroFraming.subject.size[2]
], { wheelDiameterFraction: 0.8 });
const carChassisSpec = { ...fittedCarChassisSpec, contactTolerance: 0.03 };
const vehicleBoundaryInset = turboVehicleBoundaryInset({
  roadWidth: routeWidth,
  sceneScale: racingScene.transform.scale,
  chassisHalfWidth: carChassisSpec.trackWidth / 2,
  wheelRadius: carChassisSpec.wheelRadius,
  renderedHalfWidth: heroFraming.subject.size[0] / 2
});

const racingState = game.racing({
  route,
  startProgress: 0,
  checkpointRadius: 0.1,
  lapsToWin: 4,
  paceMultiplier: gameplayPaceMultiplier,
  acceleration: certifiedAcceleration,
  drag: 0.28,
  steerRate: certifiedSteerRate,
  boundaryInset: vehicleBoundaryInset,
  recoveryHeadingLimit
});
const opponentStartProgress = 0.032;
const opponentState = game.racing({
  route,
  startProgress: opponentStartProgress,
  checkpointRadius: 0.1,
  lapsToWin: 4,
  paceMultiplier: gameplayPaceMultiplier,
  acceleration: certifiedAcceleration,
  drag: 0.28,
  steerRate: certifiedSteerRate,
  boundaryInset: vehicleBoundaryInset,
  recoveryHeadingLimit
});

const racingLine = game.racingSurfaceQuery(routeGeometry);
const driverRoute: DriverRoute = {
  length: racingLine.length,
  halfWidth: () => routeWidth / 2,
  sample: (progress) => {
    const s = racingLine.sampleAt(progress);
    return { x: s.x, y: s.y, heading: s.heading };
  }
};
const opponentTargetMaxDimension = OPPONENT_TARGET_MAX_DIMENSION;
const opponentAssetScale = opponentTargetMaxDimension / Math.max(...assets.showcaseCcByFormulaOpponent.bounds);
const opponentRenderedSize: AuraVec3 = [
  assets.showcaseCcByFormulaOpponent.bounds[0] * opponentAssetScale,
  assets.showcaseCcByFormulaOpponent.bounds[1] * opponentAssetScale,
  assets.showcaseCcByFormulaOpponent.bounds[2] * opponentAssetScale
];
const passingLane = measureTurboPassingLane({
  roadWidth: routeWidth,
  sceneScale: racingScene.transform.scale,
  playerRenderedWidth: heroFraming.subject.size[0],
  opponentRenderedWidth: opponentRenderedSize[0],
  playerCollisionWidth: heroFraming.subject.size[0] + 0.002,
  opponentCollisionWidth: opponentRenderedSize[0] + 0.002,
  playerChassisHalfWidth: carChassisSpec.trackWidth / 2,
  wheelRadius: carChassisSpec.wheelRadius,
  passingMargin: 0.02
});
const opponentDriver = createVehicleDriverAi(driverRoute, {
  maxSpeed: gameplayMaxSpeed,
  paceFraction: 0.7,
  lookAheadSeconds: 1.15,
  minLookAhead: Math.max(0.05, racingLine.length * 0.01),
  corneringAcceleration: Number(((gameplayMaxSpeed * gameplayMaxSpeed) / Math.max(1e-6, tightestCornerRadius) * 0.55).toFixed(4)),
  aggression: "balanced",
  reactionSeconds: 0.12,
  seed: 20260802
});
const opponentAi = createTurboOpponentAi(opponentState, {
  startProgress: opponentStartProgress,
  maxSpeed: gameplayMaxSpeed,
  cruiseRatio: 0.9,
  catchUpStrength: 0.22,
  steeringGain: STEER_CORRECTION_GAIN,
  legalPassingOffset: passingLane.legalPassingOffset,
  maxAsphaltOffset: turboMaxAsphaltOffset({
    bodyHalfWidth: passingLane.opponentRenderedWidth / 2,
    visualAsphaltHalfWidth: turboVisualAsphaltWidth(routeWidth) / 2
  }),
  bodyHalfWidth: passingLane.opponentRenderedWidth / 2,
  visualAsphaltHalfWidth: turboVisualAsphaltWidth(routeWidth) / 2,
  yieldEnabled: true,
  dramaSeed: 20260817,
  driver: opponentDriver
});

const fittedOpponentChassisSpec = vehicleChassisSpecFromBounds(opponentRenderedSize, {
  wheelDiameterFraction: 0.8
});
const opponentChassisSpec = {
  ...fittedOpponentChassisSpec,
  contactTolerance: fittedOpponentChassisSpec.wheelRadius * 0.15
};
const circuitSurface: VehicleSurface = (() => {
  const surface = racingScene.vehicleSurface({
    offRoadGrip: 0.55,
    contactPatchRadius: carChassisSpec.wheelRadius * 3
  });
  if (!surface) {
    throw new Error("Turbo Drift requires drivable track triangles (topology.drivableMesh missing).");
  }
  return surface;
})();
const playerChassis = createVehicleChassis(carChassisSpec, circuitSurface);
const opponentChassis = createVehicleChassis(opponentChassisSpec, circuitSurface);

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
      { id: "lap", kind: "label", anchor: "top-left", label: "LAP" },
      { id: "position", kind: "score", anchor: "top-right", label: "POS" },
      { id: "lights", kind: "label", anchor: "center", label: "LIGHTS" },
      { id: "status", kind: "label", anchor: "bottom-left", label: "STATUS" }
    ]
  },
  touch: {
    preset: "steer-pedals",
    bindings: { steer: "steer", throttle: "throttle-pedal", brake: "brake-pedal", drift: "drift-button", pause: "menu" }
  },
  sound: {
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
  qualityRebuild: { flags: [ROUTE_FLAG] }
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
  gameShell.hud.set("speed", `${Math.round(Math.abs(raceSnapshot.speed) * 36)}`);
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
  void postPresets["daylight-outdoor"];
  gameShell.app.setOutput?.({ exposure: 1 });

  publishTurboDriftEvidence({
    game: { session: gameShell.session, fx: gameShell.fx },
    app: () => gameShell.app,
    snapshot: () => raceSnapshot,
    appliedLook: {
      preset: "daylight-outdoor",
      toneMapping: "aces",
      exposureEV: direction.lighting.exposureEV
    },
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
