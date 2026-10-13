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
  // (`car.speedKph`, `car.drifting`): same real state as the flat fields.
  readonly car: { readonly speedKph: number; readonly drifting: boolean; readonly grounded: boolean; readonly contactGap: number };
  readonly race: { readonly lap: number; readonly position: number; readonly state: string };
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly evidence: unknown;
}

// Genre row (aura3d-browser-game): racing → golden-hour, chase fov 60.
const LOOK_ID = "golden-hour" as const;

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
const CHASE = { back: 8, up: 3.4, fov: 60 } as const;
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
  id: "turbo-drift-circuit",
  target: "#app",
  diagnostics: { overlay: true, performancePanel: true },
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
    sections: { turboDrift: () => latestSnapshot ?? { status: "unbound" } }
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
let previousPlayer: GameRacingSnapshot = playerKit.snapshot();
const ghostRecorder = createTurboGhostRecorder();
let ghostRecording: TurboGhostRecording | undefined;
let ghostPlayer: TurboGhostPlayer | undefined;
let ghostEnabled = true;

app.camera?.use(
  camera.rigs.chase({
    target: "race-car",
    fov: { base: 60, perSpeed: 0.4 },
    lookAhead: { seconds: 0.35, max: 4 },
    bank: { gain: 0.5, maxDeg: 6 }
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("racing");

resetChassis(playerChassis, playerKit.snapshot());
resetChassis(opponentChassis, opponentKit.snapshot());
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
    playerState = playerKit.step(dt, {
      throttle: input.held("throttle"),
      brake: input.held("brake"),
      steer: input.axis("steer"),
      drift: input.held("drift"),
      boost: input.held("boost") || boostState.remainingSeconds > 0
    });
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

  previousPlayer = playerState;
  renderHud(playerState, opponentState);
  publishEvidence(playerState, opponentState, playerPose);
});

publishEvidence(playerKit.snapshot(), opponentKit.snapshot(), playerChassis.pose());
renderHud(playerKit.snapshot(), opponentKit.snapshot());


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
  resetChassis(playerChassis, playerKit.snapshot());
  resetChassis(opponentChassis, opponentKit.snapshot());
  ghostRecorder.abort();
  ghostRecorder.start();
  ghostPlayer?.restart();
  phase = "countdown";
  session = resetRaceSession(session);
  boostState = createTurboBoostState(true);
  lastBoostLap = 0;
  objective = "Beat the rival over 3 laps. Boost pads are live.";
  routeEvents.push({ type: "reset", label: "reset" });
  raceEventLabels.push("reset");
}

function racePositionOf(player: GameRacingSnapshot, opponent: GameRacingSnapshot): number {
  const total = (s: GameRacingSnapshot) => (s.lap - 1) + s.progress;
  return total(player) >= total(opponent) ? 1 : 2;
}

function buildScene() {
  const start = racingLine.sampleAt(PLAYER_START);
  const startGround = sampleTrackAt(start.x, start.y);
  const nodes: AuraNodeInput[] = [
    // scaleMode "world": rendered space is the GLB's own space, which is
    // exactly the space src/track-surface.ts was extracted in. The default
    // normalized fit would rescale/recentre the mesh away from the ground
    // query baked from it.
    model(assets.trackModel, { name: "typed kart circuit asset", scaleMode: "world" })
      .position(ROUTE_BOUNDS.centerX, TRACK_Y, ROUTE_BOUNDS.centerZ)
      .scale(1),
    model(assets.carModel, { name: "typed playable sports car", castShadow: true, scaleMode: "world" })
      .position(start.x, startGround.height - CAR_MODEL_MIN_Y, start.y)
      .scale(1)
      .runtime(game.runtimeNode("race-car", { tags: ["player", "vehicle", "typed-asset", "runtime"] })),
    model(assets.carModel, { name: "typed rival sports car", castShadow: true, scaleMode: "world" })
      .position(start.x, startGround.height - CAR_MODEL_MIN_Y, start.y)
      .scale(1)
      .runtime(game.runtimeNode("opponent-car", { tags: ["opponent", "vehicle", "typed-asset", "runtime"] })),
    model(assets.carModel, { name: "typed ghost sports car", scaleMode: "world" })
      .position(start.x, startGround.height - CAR_MODEL_MIN_Y, start.y)
      .scale(1)
      .runtime(game.runtimeNode("ghost-car", { tags: ["ghost", "vehicle", "typed-asset", "runtime"] })),
    ...boostRings.map((ring) => {
      const g = sampleTrackAt(ring.point.x, ring.point.y);
      return primitives.box({ name: `boost pad ${ring.id}`, material: material.neon({ color: "#ffd24d", emissive: "#ffd24d", emissiveIntensity: 0.8 }) })
        .position(ring.point.x, g.height + 0.03, ring.point.y)
        .scale([3.2, 0.06, 1.6]);
    })
  ];

  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({
      position: [start.x, startGround.height - CAR_MODEL_MIN_Y + CHASE.up, start.y - CHASE.back],
      target: [start.x, startGround.height - CAR_MODEL_MIN_Y, start.y],
      fov: CHASE.fov
    }));
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "turbo-drift-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:300px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(20,12,4,0.66)",
    "border:1px solid rgba(235,190,125,0.34)",
    "border-radius:8px",
    "padding:12px",
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
      drifting: Math.abs(player.drift) > 0.05,
      grounded: pose.grounded,
      contactGap: pose.contactGap
    },
    race: { lap: player.lap, position: racePositionOf(player, opponent), state: phase },
    events: raceEventLabels,
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}
