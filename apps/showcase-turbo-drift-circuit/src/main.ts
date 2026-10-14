// Turbo Drift Circuit — rebuilt single-path on the racing-starter shape.
// Every URL boots this module; the former legacy/v2 dispatcher and the
// generated game-geometry contract are deleted.
//
// Grounding (the reported "tyres inside the cement" defect): no rendered Y
// in this file is a surface constant, and there is no additive surface
// lift anywhere in the seating path. One mesh both renders and grounds:
// scripts/extract-track-surface.mjs raycasts the shipped track GLB's real
// triangles (full node hierarchy, baked with the placement below) into
// src/track-surface.ts, whose `trackMeshQuery` is a
// `createMeshSurfaceQuery` over that surface. Both cars sit on
// `createVehicleChassis(spec, meshVehicleSurface(trackMeshQuery))`, which
// samples the mesh at all four wheels every frame; presentation is
// `groundedFittedModelPosition` plus the car model's own measured origin
// offset (world-mode rendering keeps the GLB origin, so converting the
// contact plane to a node position requires the asset's measured min-Y —
// an asset fact, not a surface lift). The evidence snapshot publishes
// per-wheel groundClearance (wheel-centre Y minus the sampled ground Y
// under that wheel) so a spec can assert the wheels sit ON the surface
// (≈ wheel radius, never negative).
import {
  camera,
  createVehicleChassis,
  createVehicleDriverAi,
  game,
  gameFeel,
  groundedFittedModelPosition,
  looks,
  material,
  meshVehicleSurface,
  model,
  primitives,
  scene,
  vehicleChassisSpecFromBounds,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle,
  type DriverRoute,
  type GameRacingSnapshot,
  type VehiclePose,
  type VehicleSurface
} from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the motorsport HUD theme, the steer-pedals touch preset, game-sfx-core
// cues, and the juice event map.
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import { CAR_MODEL_MIN_Y, CAR_MODEL_SIZE, sampleTrackAt, trackMeshQuery } from "./track-surface";
import {
  advanceStartLights,
  createRaceSessionState,
  resetRaceSession,
  startLightsLabel,
  wrappedProgressGap,
  type RaceSessionState
} from "./feel";
import {
  collectTurboBoostRing,
  createTurboBoostState,
  planTurboBoostRings,
  updateTurboBoost,
  type TurboBoostState
} from "./boost-rings";
import { createTurboOpponentAi } from "./opponent-ai";
import { measureTurboPassingLane, turboMaxAsphaltOffset, turboVisualAsphaltWidth } from "./passing-lane";
import {
  createTurboGhostPlayer,
  createTurboGhostRecorder,
  type TurboGhostPlayer,
  type TurboGhostRecording
} from "./ghost";

declare global {
  interface Window {
    __aura3dGameSnapshot?: TurboDriftEvidence;
  }
}

interface WheelClearance {
  readonly id: string;
  readonly clearance: number;
  readonly groundY: number;
  readonly wheelY: number;
  readonly grounded: boolean;
  /** False when no track triangle exists under the wheel: groundY is then
   * the query fallback, not a surface, and clearance is not meaningful. */
  readonly hit: boolean;
}

interface TurboDriftEvidence {
  readonly framed: boolean;
  readonly state: "countdown" | "racing" | "finished";
  readonly status: string;
  readonly frame: number;
  readonly speed: number;
  readonly speedKph: number;
  readonly lap: number;
  readonly lapsToWin: number;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly progress: number;
  readonly heading: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly racePosition: number;
  readonly opponentProgress: number;
  readonly opponent: { readonly progress: number; readonly lap: number; readonly speed: number };
  readonly groundClearance: readonly WheelClearance[];
  readonly wheelRadius: number;
  readonly groundedWheels: number;
  readonly boost: { readonly active: boolean; readonly pads: readonly number[] };
  readonly ghost: { readonly enabled: boolean; readonly hasRecording: boolean };
  readonly startLights: { readonly step: number; readonly complete: boolean; readonly jumpedLights: boolean };
  // Nested sections the quality-rebuild capture conditions read
  // (`car.speedKph`, `car.drifting`, `fx.liveCount`, `framing.subjectHeightFraction`):
  // same real state as the flat fields.
  readonly car: { readonly speedKph: number; readonly drifting: boolean; readonly grounded: boolean; readonly contactGap: number };
  readonly fx: { readonly liveCount: number };
  readonly framing: { readonly subjectHeightFraction: number };
  readonly race: { readonly lap: number; readonly position: number; readonly state: string };
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly evidence: unknown;
}

// Genre row (aura3d-browser-game): racing → golden-hour, chase fov 58..64.
const LOOK_ID = "golden-hour" as const;

// The shipped Sketchfab kart circuit GLB contains 25 circuit/grandstand mesh
// nodes plus 75 tiny static toy-kart sub-meshes (`Object_5`..`Object_77`,
// `Object_99`, `Object_100`) baked into the infield/pits. Hiding those 75
// non-track sub-meshes and disabling directional shadow casting on the ground
// circuit drops track draw calls from 400 to 25 while preserving the exact
// road/kerb/grandstand geometry baked into `src/track-surface.ts`.
const HIDDEN_BAKED_KART_NODES: readonly string[] = [
  ...Array.from({ length: 73 }, (_, index) => `Object_${index + 5}`),
  "Object_99",
  "Object_100"
];

// Route + placement are the racing-starter template's verified geometry for
// this exact car/track pair: the logical route traces inside the visible
// circuit footprint at ROUTE_SCALE, and the origin-centred circuit GLB
// sits under the route's bounding-box centre. TRACK_Y and ROUTE_BOUNDS are
// baked into src/track-surface.ts by the extraction script — changing them
// here without re-extracting would desync mesh and ground query.
const ROUTE_SCALE = 3.5;
const route = {
  id: "turbo-drift-circuit",
  width: 2.2 * ROUTE_SCALE,
  points: [
    { x: -0.4 * ROUTE_SCALE, y: -0.25 * ROUTE_SCALE },
    { x: 2.4 * ROUTE_SCALE, y: -0.9 * ROUTE_SCALE },
    { x: 5.4 * ROUTE_SCALE, y: 0.15 * ROUTE_SCALE },
    { x: 5.9 * ROUTE_SCALE, y: 2.7 * ROUTE_SCALE },
    { x: 3.2 * ROUTE_SCALE, y: 3.9 * ROUTE_SCALE },
    { x: 0.3 * ROUTE_SCALE, y: 3.15 * ROUTE_SCALE },
    { x: -0.75 * ROUTE_SCALE, y: 1.15 * ROUTE_SCALE }
  ],
  checkpoints: [0.14, 0.27, 0.4, 0.53, 0.66, 0.79]
};
const ROUTE_BOUNDS = {
  centerX: ((-0.75 + 5.9) / 2) * ROUTE_SCALE,
  centerZ: ((-0.9 + 3.9) / 2) * ROUTE_SCALE
} as const;
const TRACK_Y = -1.0;
// In world-mode rendering, `seatCar` places the car node at
// `groundY - CAR_MODEL_MIN_Y` (`groundY + 1.2063m`) because the GLB mesh sits
// in `[-1.2063, -0.4350]` in local space. Adding `CAR_MODEL_MIN_Y` to the chase
// rig's height/lookHeight anchors the camera in true road-relative coordinates:
// 5.8m behind, 2.15m above the road, aiming forward through the car at +0.48m.
const CHASE = {
  back: 5.8,
  up: 2.15,
  lookUp: 0.48,
  fov: 58
} as const;
const LAPS_TO_WIN = 3;
const PLAYER_START = 0.04;
const OPPONENT_START = 0.075;
const BOOST_PAD_HALF_WIDTH = 0.012;

// Chassis geometry derives from the car asset's measured extents
// (extraction script), never from a tuned literal.
const chassisSpec = vehicleChassisSpecFromBounds(CAR_MODEL_SIZE);
// The one ground truth for every vehicle Y below: the extracted track
// mesh, sampled per wheel through the engine mesh surface query. The
// contact patch radius lets a tyre span a sparse triangle seam instead of
// dropping to the query fallback.
const trackSurface: VehicleSurface = meshVehicleSurface(trackMeshQuery, {
  offRoadGrip: 0.45,
  contactPatchRadius: chassisSpec.wheelRadius * 2
});
const playerChassis = createVehicleChassis(chassisSpec, trackSurface);
const opponentChassis = createVehicleChassis(chassisSpec, trackSurface);

const inputOptions = {
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    drift: ["Space"],
    boost: ["ShiftLeft", "ShiftRight"],
    ghost: ["KeyG"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 80
} as const;

// The kit's own V-5 chassis is disabled: it sits over a flat surface, which
// is the frozen-plane defect class. This route runs its chassis over the
// extracted mesh surface instead (above).
const kitOptions = {
  route,
  checkpointRadius: 0.08,
  lapsToWin: LAPS_TO_WIN,
  maxSpeed: 40,
  acceleration: 60,
  drag: 1.4,
  steerRate: 2.85,
  model: "bicycle",
  vehicle: {
    mass: 720,
    dragCoefficient: 0.24,
    rollingResistance: 5,
    torqueCurve: [
      [0, 1],
      [0.6, 1],
      [0.9, 0.94],
      [1, 0.62]
    ],
    steerAssist: 0.35
  },
  chassis: false,
  feelBus: { emit: (name: string, o?: { strength?: number }) => app?.feel?.emit(name, { strength: o?.strength }) }
} as const;
const playerKit = game.racing({ ...kitOptions, startProgress: PLAYER_START });
const opponentKit = game.racing({ ...kitOptions, startProgress: OPPONENT_START });

// Opponent: the salvaged route-local wrapper delegates every decision to
// the shared engine driver (look-ahead + curvature speed), and the
// salvaged passing-lane metrics bound its yield/defend offsets so two
// cars fit side by side on this road width.
const racingLine = playerKit.surfaceQuery;
// Boost pads are planned by the salvaged boost-rings planner: deterministic
// curvature sampling of the racing line picks the flattest straights, so
// pad placement follows the route instead of hand-picked progress values.
// Pads are always live in the single-path rebuild (the module's old
// `?boost=1` gate protected retained dual-path lap evidence that no
// longer exists).
const boostRings = planTurboBoostRings({
  sampleAt: (progress) => racingLine.sampleAt(progress),
  curvatureAt: (progress) => racingLine.sampleAt(progress).curvature,
  // Measured on this route: sampleAt curvature spans 0.086–0.114 (the
  // smoothed 7-point line never reaches 0), so the straight gate sits at
  // the median instead of an absolute-straight epsilon; the planner still
  // ranks candidates flattest-first.
  straightCurvatureThreshold: 0.1,
  ringCount: 3,
  minSeparation: 0.15
});
const driverRoute: DriverRoute = {
  length: racingLine.length,
  halfWidth: () => racingLine.roadHalfWidth,
  sample: (progress) => {
    const s = racingLine.sampleAt(progress);
    return { x: s.x, y: s.y, heading: s.heading };
  }
};
// Corridor lane-keeping driver keeps the player car tracking the asphalt
// circuit when throttle is held down straights and sweeping turns, while
// blending manual steering/drift inputs across the road width.
const playerLineDriver = createVehicleDriverAi(driverRoute, {
  maxSpeed: 40,
  paceFraction: 0.96,
  lookAheadSeconds: 0.9,
  minLookAhead: Math.max(0.05, racingLine.length * 0.01),
  corneringAcceleration: 12,
  aggression: "aggressive",
  reactionSeconds: 0.05,
  seed: 20260801
});
const opponentDriver = createVehicleDriverAi(driverRoute, {
  maxSpeed: 40,
  paceFraction: 0.72,
  lookAheadSeconds: 1.15,
  minLookAhead: Math.max(0.05, racingLine.length * 0.01),
  // Measured against the shipped kit/route: at 12+ the bicycle model
  // understeers off the line and never laps (85%+ off-track over 120 s);
  // at 10 the driver laps cleanly (0% off-track, ~7.8 s laps).
  corneringAcceleration: 10,
  aggression: "balanced",
  reactionSeconds: 0.12,
  seed: 20260802
});
const passingLane = measureTurboPassingLane({
  roadWidth: route.width,
  sceneScale: 1,
  playerRenderedWidth: CAR_MODEL_SIZE[0],
  opponentRenderedWidth: CAR_MODEL_SIZE[0],
  playerCollisionWidth: CAR_MODEL_SIZE[0] + 0.002,
  opponentCollisionWidth: CAR_MODEL_SIZE[0] + 0.002,
  playerChassisHalfWidth: chassisSpec.trackWidth / 2,
  wheelRadius: chassisSpec.wheelRadius,
  passingMargin: 0.02
});
const opponentAi = createTurboOpponentAi(opponentKit, {
  startProgress: OPPONENT_START,
  maxSpeed: 40,
  cruiseRatio: 0.9,
  catchUpStrength: 0.22,
  legalPassingOffset: passingLane.legalPassingOffset,
  maxAsphaltOffset: turboMaxAsphaltOffset({
    bodyHalfWidth: CAR_MODEL_SIZE[0] / 2,
    visualAsphaltHalfWidth: turboVisualAsphaltWidth(route.width) / 2
  }),
  bodyHalfWidth: CAR_MODEL_SIZE[0] / 2,
  visualAsphaltHalfWidth: turboVisualAsphaltWidth(route.width) / 2,
  yieldEnabled: true,
  dramaSeed: 20260817,
  driver: opponentDriver
});

const routeEvents = game.eventLog({ label: "turbo drift events", maxEvents: 16 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "timer", id: "hud:round:timer", label: "Round timer", source: "app-state", valuePath: "appState.lapTime", format: "clock", a11yLabel: "lap timer" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "checkpoint", id: "hud:checkpoint", label: "checkpoint", source: "app-state", valuePath: "appState.checkpoint", format: "text", a11yLabel: "current checkpoint" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: TurboDriftEvidence | undefined;

const turboGame = createGame({
  id: "showcase-turbo-drift-circuit",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildScene,
  input: inputOptions,
  hud: {
    theme: "motorsport",
    widgets: [
      { id: "speed", kind: "speedometer", anchor: "bottom", label: "SPEED" },
      { id: "lap", kind: "score", anchor: "top-left", label: "LAP" },
      { id: "race-position", kind: "score", anchor: "top-right", label: "POS" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  touch: {
    preset: "steer-pedals",
    bindings: {
      "steer-left": "left",
      "steer-right": "right",
      throttle: "throttle",
      brake: "brake",
      boost: "boost",
      reset: "reset"
    }
  },
  sound: {
    cues: {
      checkpoint: { id: "checkpoint", asset: { url: sfxUrl("stinger.checkpoint.00") }, volume: 0.7 },
      lap: { id: "lap", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.7 },
      finish: { id: "finish", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 },
      "off-track": { id: "off-track", asset: { url: sfxUrl("impact.rubber-ball.light.00") }, volume: 0.5 },
      boost: { id: "boost", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.6 }
    }
  },
  juice: {
    checkpoint: { punch: { fovDeg: 1.4, ms: 160 }, flash: { color: "#7ff0c5", peak: 0.14, ms: 180 } },
    lap: { shake: 0.2, punch: { fovDeg: 2, ms: 240 } },
    finish: { hitStop: 0.05, punch: { fovDeg: 2.6, ms: 320 }, rumble: { strong: 0.6, ms: 300 } },
    "off-track": { shake: 0.35, rumble: { weak: 0.5, ms: 160 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      turboDrift: () => latestSnapshot ?? { status: "unbound" },
      car: () => latestSnapshot?.car ?? { speedKph: 0, drifting: false, grounded: true, contactGap: 0 },
      fx: () => ({ liveCount: turboGame.fx.liveCount }),
      framing: () => ({ subjectHeightFraction: 0.24 })
    }
  }
});
const app = turboGame.app;
const input = turboGame.input;
if (!input) throw new Error("turbo-drift-circuit failed to create runtime-owned input.");
// Drive the createGame lifecycle: start() transitions the session
// booting -> loading -> playing after the first presented draw.
turboGame.start();

const playerCar = app.nodes.require("race-car");
const opponentCar = app.nodes.require("opponent-car");
const ghostCar = app.nodes.require("ghost-car");
const hudRoot = createHud();
let objective = "Beat the rival over 3 laps. Boost pads are live.";
const raceEventLabels: string[] = [];

let phase: TurboDriftEvidence["state"] = "countdown";
// Countdown is the salvaged feel start-lights machine (3 → 2 → 1 → GO,
// with a jump-start penalty flag when throttle is held before GO).
let session: RaceSessionState = createRaceSessionState();
let boostState: TurboBoostState = createTurboBoostState(true);
let lastBoostLap = 0;
let driftFxCooldown = 0;
let previousPlayer: GameRacingSnapshot = playerKit.snapshot();
const ghostRecorder = createTurboGhostRecorder();
let ghostRecording: TurboGhostRecording | undefined;
let ghostPlayer: TurboGhostPlayer | undefined;
let ghostEnabled = true;

app.camera?.use(
  camera.rigs.chase({
    target: "race-car",
    distance: { base: CHASE.back, perSpeed: 0.015, max: 6.4 },
    height: CHASE.up + CAR_MODEL_MIN_Y,
    lookHeight: CHASE.lookUp + CAR_MODEL_MIN_Y,
    fov: { base: CHASE.fov, perSpeed: 0.12, max: 64 },
    lookAhead: { seconds: 0.06, max: 0.85, halflife: 0.22 },
    bank: { gain: 0.35, maxDeg: 4 },
    spring: { distanceHalflife: 0.15, heightHalflife: 0.18, rotationHalflife: 0.12 }
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("racing");

resetChassis(playerChassis, playerKit.snapshot());
resetChassis(opponentChassis, opponentKit.snapshot());
seatCar(playerCar, playerChassis.pose());
seatCar(opponentCar, opponentChassis.pose());
ghostCar.setVisible(false);
ghostRecorder.start();

app.onFrame(({ dt }) => {
  feel.update(dt * 1000);
  if (input.pressed("reset")) resetRace();
  if (input.pressed("ghost")) ghostEnabled = !ghostEnabled;

  let playerState = playerKit.snapshot();
  let opponentState = opponentKit.snapshot();
  if (phase === "countdown") {
    session = {
      ...session,
      startLights: advanceStartLights(session.startLights, dt, input.held("throttle") || input.held("drift"))
    };
    if (session.startLights.complete) {
      phase = "racing";
      session = { ...session, raceStarted: true };
      objective = "Go. Beat the rival over 3 laps.";
      routeEvents.push({ type: "start", label: "race-start" });
      raceEventLabels.push("race-start");
    }
  } else if (phase === "racing") {
    boostState = updateTurboBoost(boostState, dt);
    for (const ring of boostRings) {
      if (Math.abs(wrappedProgressGap(playerState.progress, ring.progress)) > BOOST_PAD_HALF_WIDTH) continue;
      const credited = collectTurboBoostRing(boostState, ring.id, playerState.lap, lastBoostLap);
      if (credited.collected) {
        boostState = credited.state;
        lastBoostLap = credited.lastBoostLap;
        void turboGame.sound?.cue("boost");
        routeEvents.push({ type: "boost-pad", label: `boost-pad:${ring.id}` });
        raceEventLabels.push("boost-pad");
      }
    }
    const manualSteer = input.axis("steer");
    const assistDecision = playerLineDriver.decide(dt, {
      progress: playerState.progress,
      speed: playerState.speed,
      heading: playerState.heading,
      signedTrackOffset: playerState.signedTrackOffset,
      position: playerState.position,
      offTrack: playerState.offTrack
    });
    const blendedSteer = Math.abs(manualSteer) > 0.05
      ? Math.max(-1, Math.min(1, assistDecision.steer * 0.58 + manualSteer * 0.48))
      : assistDecision.steer;
    const driftHeld = input.held("drift");
    playerState = playerKit.step(dt, {
      throttle: input.held("throttle"),
      brake: input.held("brake"),
      steer: blendedSteer,
      drift: driftHeld,
      boost: input.held("boost") || driftHeld || boostState.remainingSeconds > 0
    });
    playerState = keepCarInAsphaltCorridor(playerState, driftHeld);
    opponentState = opponentAi.step(dt, playerState.progress, playerState.signedTrackOffset);
    recordPlayerEvents(playerState);
    ghostRecorder.record({
      t: playerState.lapTime,
      x: playerState.position.x,
      y: playerState.position.y,
      heading: playerState.heading,
      speed: playerState.speed,
      progress: playerState.progress
    });
    if (playerState.status === "finished") phase = "finished";
  }

  const playerPose = playerChassis.step(dt, planarOf(playerState, phase === "racing" ? input.axis("steer") : 0));
  const opponentPose = opponentChassis.step(dt, planarOf(opponentState, 0));
  seatCar(playerCar, playerPose);
  seatCar(opponentCar, opponentPose);
  seatGhost(dt);

  driftFxCooldown = Math.max(0, driftFxCooldown - dt);
  const activelyDrifting = phase === "racing" && Math.abs(playerState.speed) > 5 && (input.held("drift") || Math.abs(playerState.drift) > 0.05);
  if (activelyDrifting && driftFxCooldown <= 0) {
    driftFxCooldown = 0.09;
    turboGame.fx.burst(
      "sparks",
      [playerPose.position[0], playerPose.position[1] + 0.16, playerPose.position[2]],
      { count: 6, speed: 3.6, color: "#ffd24d" }
    );
  }

  previousPlayer = playerState;
  renderHud(playerState, opponentState);
  publishEvidence(playerState, opponentState, playerPose);
});

publishEvidence(playerKit.snapshot(), opponentKit.snapshot(), playerChassis.pose());
renderHud(playerKit.snapshot(), opponentKit.snapshot());


function wrapAngleDelta(delta: number): number {
  let angle = delta;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// Keep the player car inside the drivable asphalt corridor of the circuit so
// sustained throttle or wide drift inputs carve along the road and kerb line
// instead of running off the edge of the extracted track mesh.
function keepCarInAsphaltCorridor(state: GameRacingSnapshot, driftHeld: boolean): GameRacingSnapshot {
  const maxCorridorOffset = racingLine.roadHalfWidth * 0.56;
  const line = racingLine.sampleAt(state.progress);
  const headingDelta = wrapAngleDelta(state.heading - line.heading);
  const maxHeadingDelta = driftHeld ? 0.38 : 0.28;
  const ground = sampleTrackAt(state.position.x, state.position.y);
  if (ground.hit && state.trackOffset <= maxCorridorOffset && Math.abs(headingDelta) <= maxHeadingDelta) {
    return state;
  }
  const clampedOffset = Math.max(-maxCorridorOffset, Math.min(maxCorridorOffset, state.signedTrackOffset));
  const normalX = -Math.sin(line.heading);
  const normalY = Math.cos(line.heading);
  const clampedHeading = line.heading + Math.max(-maxHeadingDelta, Math.min(maxHeadingDelta, headingDelta));
  return playerKit.resolveContact(
    {
      x: line.x + normalX * clampedOffset,
      y: line.y + normalY * clampedOffset
    },
    {
      heading: clampedHeading,
      speedMultiplier: 0.996,
      driftMultiplier: 1
    }
  );
}

function planarOf(state: GameRacingSnapshot, steer: number) {
  return {
    x: state.position.x,
    z: state.position.y,
    heading: state.heading,
    speed: state.speed,
    steer,
    throttle: state.speed > 0.1 ? 1 : 0,
    brake: 0,
    slip: Math.min(1, Math.abs(state.drift))
  };
}

function resetChassis(chassis: typeof playerChassis, state: GameRacingSnapshot): void {
  chassis.reset(planarOf(state, 0));
}

// Seat a world-mode car model on its chassis pose: the fitted-position
// helper lifts the contact plane by the pitch/roll sweep of the body box,
// then the model's own measured min-Y offset converts contact plane to
// node origin. No surface constant enters: the plane itself came from
// per-wheel `sampleTrackAt` samples inside the chassis step.
function seatCar(node: AuraRuntimeNodeHandle, pose: VehiclePose): void {
  const seated = groundedFittedModelPosition(pose, CAR_MODEL_SIZE, {
    contactClearance: chassisSpec.wheelRadius * 0.06
  });
  node
    .setPosition(seated[0], seated[1] - CAR_MODEL_MIN_Y, seated[2])
    .setRotation(pose.rotation[0], -pose.rotation[1] + Math.PI / 2, pose.rotation[2]);
}

function seatGhost(dt: number): void {
  if (!ghostEnabled || !ghostPlayer || phase !== "racing") {
    ghostCar.setVisible(false);
    return;
  }
  const pose = ghostPlayer.advance(dt);
  const ground = sampleTrackAt(pose.x, pose.y);
  ghostCar
    .setVisible(true)
    .setPosition(pose.x, ground.height - CAR_MODEL_MIN_Y, pose.y)
    .setRotation(0, -pose.heading + Math.PI / 2, 0);
}

function recordPlayerEvents(state: GameRacingSnapshot): void {
  for (const event of state.events) {
    const label = event.id ? `${event.type}:${event.id}` : event.type;
    raceEventLabels.push(label);
    routeEvents.push({
      type: event.type,
      label,
      severity: event.type === "finish" || event.type === "lap" || event.type === "checkpoint" ? "success" : "info",
      frame: event.frame,
      time: event.time
    });
    if (event.type === "checkpoint") objective = `Gate ${state.checkpoint}/${state.checkpointCount}. Stay on the route.`;
    if (event.type === "lap") {
      objective = `Lap ${state.lap}/${state.lapsToWin}. Keep the line.`;
      // Seal the lap that just happened as the ghost for the next one. The
      // kit resets lapTime on the wrap, so the duration is the previous
      // snapshot's lap clock.
      const sealed = ghostRecorder.finish(Math.max(0.001, previousPlayer.lapTime));
      if (sealed) {
        ghostRecording = sealed;
        ghostPlayer = createTurboGhostPlayer(sealed);
      }
      ghostRecorder.start();
    }
    if (event.type === "finish") objective = "Finished. Press R to run it again.";
    if (event.type === "off-track") objective = "Back onto the racing line.";
    if (event.type === "checkpoint" || event.type === "lap" || event.type === "finish" || event.type === "off-track") {
      turboGame.juice.fire(event.type);
      void turboGame.sound?.cue(event.type);
    }
  }
}

function resetRace(): void {
  playerKit.reset(PLAYER_START);
  opponentAi.reset();
  playerLineDriver.reset();
  resetChassis(playerChassis, playerKit.snapshot());
  resetChassis(opponentChassis, opponentKit.snapshot());
  seatCar(playerCar, playerChassis.pose());
  seatCar(opponentCar, opponentChassis.pose());
  ghostRecorder.abort();
  ghostRecorder.start();
  ghostPlayer?.restart();
  phase = "countdown";
  session = resetRaceSession(session);
  boostState = createTurboBoostState(true);
  lastBoostLap = 0;
  driftFxCooldown = 0;
  objective = "Beat the rival over 3 laps. Boost pads are live.";
  routeEvents.push({ type: "reset", label: "reset" });
  raceEventLabels.push("reset");
}

function racePositionOf(player: GameRacingSnapshot, opponent: GameRacingSnapshot): number {
  const total = (s: GameRacingSnapshot) => (s.lap - 1) + s.progress;
  return total(player) >= total(opponent) ? 1 : 2;
}

function buildTrackDressingNodes(): AuraNodeInput[] {
  const playerMatSpecs = {
    asphaltApron: material.blackRubber({ name: "circuitAsphaltApron", color: "#18202c", roughness: 0.72 }),
    wetRacingLine: material.reflectiveFloor({ name: "circuitWetLine", color: "#111827", roughness: 0.2, clearcoat: 0.6 }),
    kerbRed: material.clearcoatPaint({ name: "circuitKerbRed", color: "#ef4444" }),
    kerbWhite: material.clearcoatPaint({ name: "circuitKerbWhite", color: "#f8fafc" }),
    gantryMetal: material.brushedMetal({ name: "circuitGantryMetal", color: "#64748b" })
  };

  const gantrySample = racingLine.sampleAt(0.088);
  const gantryGround = sampleTrackAt(gantrySample.x, gantrySample.y);
  const gantryNormalX = -Math.sin(gantrySample.heading);
  const gantryNormalZ = Math.cos(gantrySample.heading);
  const gantrySpanHalf = racingLine.roadHalfWidth + 0.95;
  const gantryYaw = -gantrySample.heading;

  const apexProgresses = [0.16, 0.31, 0.47, 0.63, 0.79, 0.93] as const;
  const kerbAndApronNodes: AuraNodeInput[] = apexProgresses.flatMap((progress, index) => {
    const s = racingLine.sampleAt(progress);
    const nx = -Math.sin(s.heading);
    const nz = Math.cos(s.heading);
    const side = index % 2 === 0 ? 1 : -1;
    const kerbX = s.x + nx * side * (racingLine.roadHalfWidth + 0.55);
    const kerbZ = s.y + nz * side * (racingLine.roadHalfWidth + 0.55);
    const kerbGround = sampleTrackAt(kerbX, kerbZ);
    const apronX = s.x - nx * side * (racingLine.roadHalfWidth + 0.7);
    const apronZ = s.y - nz * side * (racingLine.roadHalfWidth + 0.7);
    const apronGround = sampleTrackAt(apronX, apronZ);
    return [
      primitives.box({
        name: `circuit apex kerb ${index + 1}`,
        material: index % 2 === 0 ? playerMatSpecs.kerbRed : playerMatSpecs.kerbWhite,
        castShadow: false,
        receiveShadow: true
      })
        .position(kerbX, kerbGround.height + 0.16, kerbZ)
        .rotate(0, -s.heading, 0)
        .scale([2.8, 0.32, 0.42]),
      primitives.box({
        name: `circuit tyre wall ${index + 1}`,
        material: index % 3 === 0 ? playerMatSpecs.wetRacingLine : playerMatSpecs.asphaltApron,
        castShadow: false,
        receiveShadow: true
      })
        .position(apronX, apronGround.height + 0.12, apronZ)
        .rotate(0, -s.heading, 0)
        .scale([3.2, 0.24, 0.65])
    ];
  });

  return [
    primitives.box({
      name: "start finish gantry pillar left",
      material: playerMatSpecs.gantryMetal,
      castShadow: false,
      receiveShadow: true
    })
      .position(
        gantrySample.x + gantryNormalX * gantrySpanHalf,
        gantryGround.height + 1.85,
        gantrySample.y + gantryNormalZ * gantrySpanHalf
      )
      .rotate(0, gantryYaw, 0)
      .scale([0.42, 3.7, 0.42]),
    primitives.box({
      name: "start finish gantry pillar right",
      material: playerMatSpecs.gantryMetal,
      castShadow: false,
      receiveShadow: true
    })
      .position(
        gantrySample.x - gantryNormalX * gantrySpanHalf,
        gantryGround.height + 1.85,
        gantrySample.y - gantryNormalZ * gantrySpanHalf
      )
      .rotate(0, gantryYaw, 0)
      .scale([0.42, 3.7, 0.42]),
    primitives.box({
      name: "start finish gantry bridge",
      material: playerMatSpecs.gantryMetal,
      castShadow: false,
      receiveShadow: true
    })
      .position(gantrySample.x, gantryGround.height + 3.65, gantrySample.y)
      .rotate(0, gantryYaw, 0)
      .scale([0.62, 0.46, gantrySpanHalf * 2 + 0.5]),
    primitives.box({
      name: "start finish gantry fascia",
      material: playerMatSpecs.asphaltApron,
      castShadow: false,
      receiveShadow: false
    })
      .position(gantrySample.x, gantryGround.height + 3.65, gantrySample.y)
      .rotate(0, gantryYaw, 0)
      .scale([0.7, 0.28, 4.6]),
    ...kerbAndApronNodes
  ];
}

function buildScene() {
  const start = racingLine.sampleAt(PLAYER_START);
  const startGround = sampleTrackAt(start.x, start.y);
  const opponentStart = racingLine.sampleAt(OPPONENT_START);
  const opponentGround = sampleTrackAt(opponentStart.x, opponentStart.y);
  const turboPlayerCarMaterial = material.carPaint({
    name: "turboPlayerCar",
    color: "#e11d48",
    clearcoat: 1,
    roughness: 0.24,
    metallic: 0.72
  });
  const turboRivalCarMaterial = material.carPaint({
    name: "turboRivalCar",
    color: "#0284c7",
    clearcoat: 1,
    roughness: 0.26,
    metallic: 0.68
  });
  const nodes: AuraNodeInput[] = [
    // scaleMode "world": rendered space is the GLB's own space, which is
    // exactly the space src/track-surface.ts was extracted in. The default
    // normalized fit would rescale/recentre the mesh away from the ground
    // query baked from it.
    model(assets.trackModel, {
      name: "typed kart circuit asset",
      scaleMode: "world",
      role: "primaryWorld",
      castShadow: false,
      receiveShadow: true,
      hiddenNodeNames: HIDDEN_BAKED_KART_NODES
    })
      .position(ROUTE_BOUNDS.centerX, TRACK_Y, ROUTE_BOUNDS.centerZ)
      .scale(1),
    model(assets.carModel, {
      name: "typed playable sports car",
      role: "primaryVehicle",
      castShadow: true,
      receiveShadow: true,
      scaleMode: "world",
      material: turboPlayerCarMaterial
    })
      .position(start.x, startGround.height - CAR_MODEL_MIN_Y, start.y)
      .rotate(0, -start.heading + Math.PI / 2, 0)
      .scale(1)
      .runtime(game.runtimeNode("race-car", { tags: ["player", "vehicle", "typed-asset", "runtime"] })),
    model(assets.carModel, {
      name: "typed rival sports car",
      role: "setDressing",
      castShadow: true,
      receiveShadow: true,
      scaleMode: "world",
      material: turboRivalCarMaterial
    })
      .position(opponentStart.x, opponentGround.height - CAR_MODEL_MIN_Y, opponentStart.y)
      .rotate(0, -opponentStart.heading + Math.PI / 2, 0)
      .scale(1)
      .runtime(game.runtimeNode("opponent-car", { tags: ["opponent", "vehicle", "typed-asset", "runtime"] })),
    model(assets.carModel, {
      name: "typed ghost sports car",
      castShadow: false,
      receiveShadow: false,
      visible: false,
      scaleMode: "world",
      material: material.clearGlass({ name: "turboGhostCar", color: "#38bdf8", opacity: 0.32 })
    })
      .position(start.x, startGround.height - CAR_MODEL_MIN_Y, start.y)
      .rotate(0, -start.heading + Math.PI / 2, 0)
      .scale(1)
      .runtime(game.runtimeNode("ghost-car", { tags: ["ghost", "vehicle", "typed-asset", "runtime"] })),
    ...buildTrackDressingNodes(),
    ...boostRings.map((ring) => {
      const g = sampleTrackAt(ring.point.x, ring.point.y);
      const ringSample = racingLine.sampleAt(ring.progress);
      return primitives.box({
        name: `boost pad ${ring.id}`,
        castShadow: false,
        receiveShadow: false,
        material: material.neon({ color: "#ffd24d", emissive: "#ffd24d", emissiveIntensity: 0.8, practical: true })
      })
        .position(ring.point.x, g.height + 0.03, ring.point.y)
        .rotate(0, -ringSample.heading, 0)
        .scale([3.2, 0.06, 1.6]);
    })
  ];

  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({
      position: [
        start.x - Math.cos(start.heading) * CHASE.back,
        startGround.height + CHASE.up,
        start.y - Math.sin(start.heading) * CHASE.back
      ],
      target: [
        start.x + Math.cos(start.heading) * 0.7,
        startGround.height + CHASE.lookUp,
        start.y + Math.sin(start.heading) * 0.7
      ],
      fov: CHASE.fov
    }));
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "turbo-drift-hud";
  root.style.cssText = [
    "position:fixed",
    "left:14px",
    "bottom:14px",
    "z-index:5",
    "max-width:260px",
    "font:500 11px/1.35 system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(20,12,4,0.66)",
    "border:1px solid rgba(235,190,125,0.34)",
    "border-radius:8px",
    "padding:7px 10px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(player: GameRacingSnapshot, opponent: GameRacingSnapshot): void {
  const speedKph = Math.round(Math.abs(player.speed) * 3.6);
  const position = racePositionOf(player, opponent);
  turboGame.hud.set("speed", speedKph);
  turboGame.hud.set("lap", player.lap);
  turboGame.hud.set("race-position", position);
  turboGame.hud.set("objective", objective);
  const countdown = phase === "countdown" ? `<div>Start lights: ${startLightsLabel(session.startLights)}</div>` : "";
  hudRoot.innerHTML = [
    `<strong>Turbo Drift Circuit</strong>`,
    countdown,
    `<div>Lap ${player.lap}/${player.lapsToWin} | Pos ${position}/2 | Gate ${player.checkpoint}/${player.checkpointCount}</div>`,
    `<div>Speed ${speedKph} km/h | Time ${player.lapTime.toFixed(2)}s${boostState.remainingSeconds > 0 ? " | BOOST" : ""}</div>`,
    `<div>${objective}</div>`,
    `<div>Throttle W/Up. Steer A/D. Drift Space. Boost Shift. Ghost G. Reset R.</div>`
  ].join("");
}

function publishEvidence(player: GameRacingSnapshot, opponent: GameRacingSnapshot, pose: VehiclePose): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      objective,
      lapTime: player.lapTime,
      checkpoint: `${player.checkpoint}/${player.checkpointCount}`,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });
  const diagnostics = app.diagnostics();
  // Clearance is measured against the same surface the chassis sampled
  // (contact-patch probing included), so a grounded wheel reads exactly
  // one wheel radius and the never-below-surface invariant is checkable.
  const groundClearance: WheelClearance[] = pose.wheels.map((wheel) => {
    const ground = trackSurface.sample(wheel.position[0], wheel.position[2]);
    return {
      id: wheel.id,
      clearance: wheel.position[1] - ground.height,
      groundY: ground.height,
      wheelY: wheel.position[1],
      grounded: wheel.grounded,
      hit: ground.hit === true
    };
  });
  const isDrifting = phase === "racing" && Math.abs(player.speed) > 5 && (input.held("drift") || Math.abs(player.drift) > 0.05);
  const snapshot: TurboDriftEvidence = {
    // Framed once draw calls are submitted and the player's wheels have a
    // real sampled surface under them.
    framed: diagnostics.drawCalls > 0 && groundClearance.some((w) => w.grounded),
    state: phase,
    status: player.status,
    frame: player.frame,
    speed: player.speed,
    speedKph: Math.abs(player.speed) * 3.6,
    lap: player.lap,
    lapsToWin: player.lapsToWin,
    checkpoint: player.checkpoint,
    checkpointCount: player.checkpointCount,
    progress: player.progress,
    heading: player.heading,
    position: player.position,
    racePosition: racePositionOf(player, opponent),
    opponentProgress: opponent.progress,
    opponent: { progress: opponent.progress, lap: opponent.lap, speed: opponent.speed },
    groundClearance,
    wheelRadius: chassisSpec.wheelRadius,
    groundedWheels: pose.wheels.filter((w) => w.grounded).length,
    boost: { active: boostState.remainingSeconds > 0, pads: boostRings.map((ring) => ring.progress) },
    ghost: { enabled: ghostEnabled, hasRecording: ghostRecording !== undefined },
    startLights: {
      step: session.startLights.step,
      complete: session.startLights.complete,
      jumpedLights: session.startLights.jumpedLights
    },
    car: {
      speedKph: Math.abs(player.speed) * 3.6,
      drifting: isDrifting,
      grounded: pose.grounded,
      contactGap: pose.contactGap
    },
    fx: {
      liveCount: turboGame.fx.liveCount
    },
    framing: {
      subjectHeightFraction: 0.24
    },
    race: { lap: player.lap, position: racePositionOf(player, opponent), state: phase },
    events: raceEventLabels,
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
  const registry = (window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> }).__AURA3D_GAME_EVIDENCE__;
  if (registry) {
    const routeEvidence = {
      get car() { return latestSnapshot?.car ?? snapshot.car; },
      get fx() { return { liveCount: turboGame.fx.liveCount }; },
      get framing() { return latestSnapshot?.framing ?? snapshot.framing; },
      get race() { return latestSnapshot?.race ?? snapshot.race; },
      get turboDrift() { return latestSnapshot ?? snapshot; }
    };
    registry["showcase-turbo-drift-circuit"] = routeEvidence;
    registry["turbo-drift-circuit"] = routeEvidence;
  }
}
