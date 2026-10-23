import {
  camera,
  game,
  gameFeel,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import "./styles.css";

const TYPED_ASSET_KEYS = [
  "boostPad",
  "floodlightTower",
  "greenCar",
  "heroCar",
  "purpleCar",
  "refereeDrone",
  "rivalCar",
  "soccerBall",
  "stadiumArena",
  "trophyCup"
] as const;

export interface TurboBallEvidence {
  readonly status: string;
  readonly frame: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly speed: number;
  readonly progress: number;
  readonly heading: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly geometry: {
    readonly tool: string;
    readonly report: string;
    readonly carMetres: readonly number[];
    readonly trackMetres: readonly number[];
    readonly ballMetres: readonly number[];
    readonly carScale: number;
    readonly routeScale: number;
  };
  readonly camera: {
    readonly rig: string;
    readonly mode: "ball" | "car";
    readonly presented: boolean;
  };
  readonly orangeScore: number;
  readonly blueScore: number;
  readonly shots: number;
  readonly saves: number;
  readonly boost: number;
  readonly ballPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly ballSpeed: number;
  readonly matchTimeRemaining: number;
  readonly typedAssetsUsed: readonly (typeof TYPED_ASSET_KEYS)[number][];
  readonly evidence: unknown;
}

declare global {
  interface Window {
    __AURA3D_TURBO_BALL__?: TurboBallEvidence;
    __AURA3D_RACING_STARTER__?: TurboBallEvidence;
  }
}

const LOOK_ID = "outdoor-day" as const;

// Pitch & arena real-world dimensions
const HALF_X = 20.0;
const HALF_Z = 27.0;
const GOAL_HALF_WIDTH = 5.8;
const GOAL_HEIGHT = 4.2;
const GOAL_DEPTH = 3.4;

const CAR_TARGET_LENGTH = 3.6;
const BALL_TARGET_DIAMETER = 2.4;
const BALL_RADIUS = BALL_TARGET_DIAMETER * 0.5;
const CAR_RADIUS = 1.68;

// Lower stadiumArena inner floor below y = 0 so its baked-in sideline props stay under the regulation turf
// while its upper grandstands and roof ring surround the pitch perimeter.
const STADIUM_OUTER_SPAN = 172;
const STADIUM_RAW_MAX = Math.max(...assets.stadiumArena.bounds);
const STADIUM_FIT_SCALE = STADIUM_OUTER_SPAN / STADIUM_RAW_MAX;
const STADIUM_WIDTH_RATIO = 1.04;
const STADIUM_FLOOR_Y = -9.8;

const HERO_CAR_FACTOR = CAR_TARGET_LENGTH / assets.heroCar.bounds[0];
const HERO_CAR_METRES = assets.heroCar.bounds.map((v) => Number((v * HERO_CAR_FACTOR).toFixed(3)));
const STADIUM_METRES = [
  Number((assets.stadiumArena.bounds[0] * STADIUM_FIT_SCALE * STADIUM_WIDTH_RATIO).toFixed(3)),
  Number((assets.stadiumArena.bounds[1] * STADIUM_FIT_SCALE * 0.96).toFixed(3)),
  Number((assets.stadiumArena.bounds[2] * STADIUM_FIT_SCALE).toFixed(3))
];
const BALL_FACTOR = Number((BALL_TARGET_DIAMETER / Math.max(...assets.soccerBall.bounds)).toFixed(4));
const BALL_METRES = assets.soccerBall.bounds.map((v) => Number((v * BALL_FACTOR).toFixed(3)));

const MATCH_DURATION_SECONDS = 90;
const GOALS_TO_WIN = 3;
const BOOST_RESPAWN_SECONDS = 8;

interface BoostPadSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

const BOOST_PAD_SPECS: readonly BoostPadSpec[] = [
  { id: "boost-pad-0", x: -15.2, z: 16.0 },
  { id: "boost-pad-1", x: 15.2, z: 16.0 },
  { id: "boost-pad-2", x: -16.2, z: 0.0 },
  { id: "boost-pad-3", x: 16.2, z: 0.0 },
  { id: "boost-pad-4", x: -15.2, z: -16.0 },
  { id: "boost-pad-5", x: 15.2, z: -16.0 }
] as const;

const FLOODLIGHT_CORNERS = [
  { name: "stadium floodlight tower nw", x: -22.5, z: -28.5, ry: Math.PI * 0.25 },
  { name: "stadium floodlight tower ne", x: 22.5, z: -28.5, ry: -Math.PI * 0.25 },
  { name: "stadium floodlight tower sw", x: -22.5, z: 28.5, ry: Math.PI * 0.75 },
  { name: "stadium floodlight tower se", x: 22.5, z: 28.5, ry: -Math.PI * 0.75 }
] as const;

const inputOptions = {
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    hop: ["Space"],
    boost: ["ShiftLeft", "ShiftRight"],
    ballCam: ["KeyC"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 90
} as const;

// Direct window key tracking so keyboard input works immediately even before canvas focus
const directKeysHeld = new Set<string>();
const directKeysPressed = new Set<string>();
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (!directKeysHeld.has(event.code)) {
      directKeysPressed.add(event.code);
    }
    directKeysHeld.add(event.code);
    if (
      event.code === "Space" ||
      event.code === "ArrowUp" ||
      event.code === "ArrowDown" ||
      event.code === "ArrowLeft" ||
      event.code === "ArrowRight"
    ) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    directKeysHeld.delete(event.code);
  });
  window.addEventListener("blur", () => {
    directKeysHeld.clear();
  });
}

const isAutoplayRequested =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("autoplay") === "1";

const matchEvents = game.eventLog({ label: "turbo ball match events", maxEvents: 32 });

const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "timer", id: "hud:round:timer", label: "Match clock", source: "app-state", valuePath: "appState.matchClock", format: "clock", a11yLabel: "match timer" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "Score", source: "app-state", valuePath: "appState.scoreText", format: "text", a11yLabel: "orange vs blue score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "meter", id: "hud:boost", label: "Boost", source: "app-state", valuePath: "appState.boost", format: "number", a11yLabel: "rocket boost meter" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

const turboGame = createGame({
  id: "turbo-ball",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildScene,
  input: inputOptions,
  hud: { theme: "motorsport", widgets: [] },
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
      goal: { id: "goal", asset: { url: sfxUrl("explosion.large.00") }, volume: 0.85 },
      save: { id: "save", asset: { url: sfxUrl("explosion.shield-hit.00") }, volume: 0.75 },
      boost: { id: "boost", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.65 },
      kickoff: { id: "kickoff", asset: { url: sfxUrl("ui.countdown-go.00") }, volume: 0.7 },
      victory: { id: "victory", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.85 },
      collision: { id: "collision", asset: { url: sfxUrl("sports.ball-bounce-hard.00") }, volume: 0.65 }
    }
  },
  juice: {
    goal: {
      hitStop: 0.06,
      shake: 0.45,
      punch: { fovDeg: 3.2, ms: 340 },
      flash: { color: "#f59e0b", peak: 0.22, ms: 260 },
      rumble: { strong: 0.75, ms: 320 }
    },
    save: {
      punch: { fovDeg: 1.8, ms: 200 },
      flash: { color: "#38bdf8", peak: 0.16, ms: 190 },
      rumble: { weak: 0.45, ms: 160 }
    },
    boost: {
      punch: { fovDeg: 1.5, ms: 150 },
      rumble: { weak: 0.35, ms: 120 }
    },
    kickoff: {
      punch: { fovDeg: 1.2, ms: 180 },
      flash: { color: "#34d399", peak: 0.12, ms: 160 }
    },
    victory: {
      hitStop: 0.05,
      shake: 0.3,
      punch: { fovDeg: 2.8, ms: 360 },
      flash: { color: "#fbbf24", peak: 0.2, ms: 300 },
      rumble: { strong: 0.7, ms: 350 }
    },
    collision: {
      shake: 0.22,
      punch: { fovDeg: 1.1, ms: 120 },
      rumble: { weak: 0.4, ms: 110 }
    }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      turboBall: () => window.__AURA3D_TURBO_BALL__ ?? { status: "unbound" },
      racingStarter: () => window.__AURA3D_RACING_STARTER__ ?? { status: "unbound" }
    }
  }
});

const app = turboGame.app;
turboGame.start();
const rawInput = turboGame.input;
if (!rawInput) {
  throw new Error("Turbo Ball failed to initialize runtime input controller.");
}
const input: NonNullable<typeof turboGame.input> = rawInput;

const heroCarNode = app.nodes.require("race-car");
const greenCarNode = app.nodes.require("green-car");
const rivalCarNode = app.nodes.require("rival-car");
const purpleCarNode = app.nodes.require("purple-car");
const soccerBallNode = app.nodes.require("soccer-ball");
const ballShadowNode = app.nodes.require("ball-shadow-ring");
const refereeDroneNode = app.nodes.require("referee-drone");
const trophyCupNode = app.nodes.require("trophy-cup");
const boostPadNodes = BOOST_PAD_SPECS.map((pad) => app.nodes.require(pad.id));

app.camera?.use(
  camera.rigs.chase({
    target: "race-car",
    fov: { base: 60, perSpeed: 0.38 },
    distance: { base: 8.6, perSpeed: 0.08, max: 11.6 },
    height: 3.3,
    lookHeight: 1.2,
    lookAhead: { seconds: 0.32, max: 3.8 },
    bank: { gain: 0.45, maxDeg: 5 }
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("racing");

interface CarActor {
  readonly id: "hero" | "green" | "rival" | "purple";
  readonly team: "orange" | "blue";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  heading: number;
  pitch: number;
  roll: number;
  boost: number;
  hopTimer: number;
  touchCooldown: number;
}

interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  rx: number;
  ry: number;
  rz: number;
  lastTouchTeam: "orange" | "blue" | null;
  lastTouchActor: CarActor["id"] | null;
}

interface MatchState {
  status: "running" | "finished";
  frame: number;
  elapsed: number;
  matchTimeRemaining: number;
  orangeScore: number;
  blueScore: number;
  shots: number;
  saves: number;
  padsCollected: number;
  progress: number;
  cameraMode: "ball" | "car";
  kickoffActive: boolean;
  bannerText: string;
  bannerTimer: number;
  objective: string;
  boostPadCooldowns: number[];
  readonly eventLabels: string[];
  readonly hero: CarActor;
  readonly green: CarActor;
  readonly rival: CarActor;
  readonly purple: CarActor;
  readonly ball: BallState;
}

const state = createInitialMatchState();
const hudElements = createHudDom();

recordEvent("kickoff", "kickoff", "info");
syncSceneNodes(0);
renderHud();
publishEvidence();

app.onFrame(({ dt }) => {
  const clampedDt = Math.min(Math.max(dt, 1 / 240), 0.05);

  const resetTriggered = input.pressed("reset") || directKeysPressed.has("KeyR");
  const ballCamTriggered = input.pressed("ballCam") || directKeysPressed.has("KeyC");

  if (resetTriggered) {
    resetMatchState();
    recordEvent("reset", "reset", "info");
    void turboGame.sound?.cue("kickoff");
    turboGame.juice.fire("kickoff");
  }

  if (ballCamTriggered) {
    state.cameraMode = state.cameraMode === "ball" ? "car" : "ball";
    recordEvent("camera", `camera:${state.cameraMode}`, "info");
  }

  stepMatch(clampedDt);
  directKeysPressed.clear();
  syncSceneNodes(clampedDt);
  updateCameraPose(clampedDt);
  feel.update(clampedDt * 1000);
  renderHud();
  publishEvidence();
});

function createInitialMatchState(): MatchState {
  return {
    status: "running",
    frame: 0,
    elapsed: 0,
    matchTimeRemaining: MATCH_DURATION_SECONDS,
    orangeScore: 0,
    blueScore: 0,
    shots: 0,
    saves: 0,
    padsCollected: 0,
    progress: 0,
    cameraMode: "ball",
    kickoffActive: false,
    bannerText: "KICKOFF — DRIVE WITH W/A/S/D + SHIFT BOOST",
    bannerTimer: 2.4,
    objective: "Drive the hex ball into the Blue Goal (North end). First to 3 goals wins.",
    boostPadCooldowns: BOOST_PAD_SPECS.map(() => 0),
    eventLabels: [],
    hero: {
      id: "hero",
      team: "orange",
      x: 0,
      y: 0,
      z: 11.2,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
      boost: 100,
      hopTimer: 0,
      touchCooldown: 0
    },
    green: {
      id: "green",
      team: "orange",
      x: -8.5,
      y: 0,
      z: 15.5,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      heading: 0.18,
      pitch: 0,
      roll: 0,
      boost: 85,
      hopTimer: 0,
      touchCooldown: 0
    },
    rival: {
      id: "rival",
      team: "blue",
      x: 5.5,
      y: 0,
      z: -13.8,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      heading: Math.PI - 0.16,
      pitch: 0,
      roll: 0,
      boost: 85,
      hopTimer: 0,
      touchCooldown: 0
    },
    purple: {
      id: "purple",
      team: "blue",
      x: 0.0,
      y: 0,
      z: -23.2,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      heading: Math.PI,
      pitch: 0,
      roll: 0,
      boost: 100,
      hopTimer: 0,
      touchCooldown: 0
    },
    ball: {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      wx: 0,
      wy: 0,
      wz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      lastTouchTeam: null,
      lastTouchActor: null
    }
  };
}

function resetKickoffPositions(): void {
  state.kickoffActive = false;
  Object.assign(state.hero, {
    x: 0,
    y: 0,
    z: 11.2,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    boost: Math.max(state.hero.boost, 80),
    hopTimer: 0,
    touchCooldown: 0
  });
  Object.assign(state.green, {
    x: -8.5,
    y: 0,
    z: 15.5,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: 0.18,
    pitch: 0,
    roll: 0,
    boost: 85,
    hopTimer: 0,
    touchCooldown: 0
  });
  Object.assign(state.rival, {
    x: 5.5,
    y: 0,
    z: -13.8,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: Math.PI - 0.16,
    pitch: 0,
    roll: 0,
    boost: 85,
    hopTimer: 0,
    touchCooldown: 0
  });
  Object.assign(state.purple, {
    x: 0,
    y: 0,
    z: -23.2,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: Math.PI,
    pitch: 0,
    roll: 0,
    boost: 100,
    hopTimer: 0,
    touchCooldown: 0
  });
  Object.assign(state.ball, {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    lastTouchTeam: null,
    lastTouchActor: null
  });
}

function resetMatchState(): void {
  state.status = "running";
  state.frame = 0;
  state.elapsed = 0;
  state.matchTimeRemaining = MATCH_DURATION_SECONDS;
  state.orangeScore = 0;
  state.blueScore = 0;
  state.shots = 0;
  state.saves = 0;
  state.padsCollected = 0;
  state.progress = 0;
  state.boostPadCooldowns = BOOST_PAD_SPECS.map(() => 0);
  state.eventLabels.length = 0;
  resetKickoffPositions();
  state.hero.boost = 100;
  state.objective = "Drive the hex ball into the Blue Goal (North end). First to 3 goals wins.";
  state.bannerText = "MATCH RESET — KICKOFF READY";
  state.bannerTimer = 1.8;
}

function recordEvent(
  type: string,
  label: string,
  severity: "info" | "success" | "warning" = "info"
): void {
  state.eventLabels.push(label);
  matchEvents.push({
    type,
    label,
    severity,
    frame: state.frame,
    time: Number(state.elapsed.toFixed(3))
  });
}

function stepMatch(dt: number): void {
  state.frame += 1;
  state.elapsed += dt;
  if (state.bannerTimer > 0) {
    state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  }

  if (state.status === "finished") {
    return;
  }

  const throttleHeld =
    input.held("throttle") ||
    directKeysHeld.has("KeyW") ||
    directKeysHeld.has("ArrowUp");
  const brakeHeld =
    input.held("brake") ||
    directKeysHeld.has("KeyS") ||
    directKeysHeld.has("ArrowDown");
  const leftHeld =
    input.held("left") ||
    directKeysHeld.has("KeyA") ||
    directKeysHeld.has("ArrowLeft");
  const rightHeld =
    input.held("right") ||
    directKeysHeld.has("KeyD") ||
    directKeysHeld.has("ArrowRight");
  const steerAxis =
    Math.abs(input.axis("steer")) > 0.01
      ? input.axis("steer")
      : (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
  const boostHeld =
    input.held("boost") ||
    directKeysHeld.has("ShiftLeft") ||
    directKeysHeld.has("ShiftRight");
  const hopPressed =
    input.pressed("hop") ||
    input.buffered("hop") ||
    directKeysPressed.has("Space");

  const manualActive =
    throttleHeld ||
    brakeHeld ||
    Math.abs(steerAxis) > 0.01 ||
    boostHeld ||
    hopPressed;

  if (manualActive || state.elapsed > 0.75) {
    if (!state.kickoffActive) {
      state.kickoffActive = true;
    }
  }

  // Advance match clock once kickoff is live
  if (state.kickoffActive) {
    state.matchTimeRemaining = Math.max(0, state.matchTimeRemaining - dt);
    if (state.matchTimeRemaining <= 0 && state.orangeScore !== state.blueScore) {
      finishMatch(state.orangeScore > state.blueScore ? "orange" : "blue");
      return;
    }
  }

  // Player controls heroCar directly; only if ?autoplay=1 is set in URL does AI drive heroCar
  let effectiveThrottle = throttleHeld;
  let effectiveSteer = steerAxis;
  let effectiveBoost = boostHeld;
  if (isAutoplayRequested && !manualActive && state.kickoffActive) {
    const dx = state.ball.x - state.hero.x;
    const dz = state.ball.z + 1.5 - state.hero.z;
    const desiredHeading = Math.atan2(dx, -dz);
    const deltaAngle = wrapAngle(desiredHeading - state.hero.heading);
    effectiveThrottle = true;
    effectiveSteer = clamp(deltaAngle * 1.9, -1, 1);
    effectiveBoost = Math.abs(deltaAngle) < 0.35 && Math.hypot(dx, dz) > 6.5 && state.hero.boost > 35;
  }

  stepHeroCar(dt, {
    throttle: effectiveThrottle,
    brake: brakeHeld,
    steer: effectiveSteer,
    boost: effectiveBoost,
    hop: hopPressed
  });

  // Step AI cars once kickoff is active
  if (state.kickoffActive) {
    stepTeammateAi(dt, state.green);
    stepStrikerAi(dt, state.rival);
    stepKeeperAi(dt, state.purple);
  }

  // Step boost pads
  stepBoostPads(dt);

  // Car-to-car bump resolution with true 2D momentum transfer
  const cars = [state.hero, state.green, state.rival, state.purple];
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      resolveCarToCarBump(cars[i]!, cars[j]!);
    }
  }

  // Step 3D ball physics & car-to-ball collisions
  stepBallPhysics(dt, cars);
}

function stepHeroCar(
  dt: number,
  controls: { throttle: boolean; brake: boolean; steer: number; boost: boolean; hop: boolean }
): void {
  const car = state.hero;
  if (
    (input.pressed("boost") ||
      directKeysPressed.has("ShiftLeft") ||
      directKeysPressed.has("ShiftRight")) &&
    car.boost > 2
  ) {
    void turboGame.sound?.cue("boost");
    turboGame.juice.fire("boost");
    app.feel?.emit("boost", { strength: 0.75 });
    recordEvent("boost", "boost", "info");
  }

  Object.assign(carSoccerKit.hero, car);
  const { hopped } = carSoccerKit.stepHeroCar(dt, controls);
  Object.assign(car, carSoccerKit.hero);

  if (hopped) {
    void turboGame.sound?.cue("collision");
    app.feel?.emit("drift", { strength: 0.6 });
    recordEvent("hop", "hop:dodge", "info");
  }

  state.progress = Number((state.progress + Math.abs(car.speed) * dt * 0.08).toFixed(4));
}

function stepTeammateAi(dt: number, car: CarActor): void {
  Object.assign(carSoccerKit.ball, state.ball);
  Object.assign(carSoccerKit.hero, state.hero);
  carSoccerKit.stepTeammateAi(dt, car);
}

function stepStrikerAi(dt: number, car: CarActor): void {
  Object.assign(carSoccerKit.ball, state.ball);
  carSoccerKit.stepStrikerAi(dt, car);
}

function stepKeeperAi(dt: number, car: CarActor): void {
  Object.assign(carSoccerKit.ball, state.ball);
  carSoccerKit.stepKeeperAi(dt, car);
}

function stepBoostPads(dt: number): void {
  const cars = [state.hero, state.green, state.rival, state.purple];
  for (let i = 0; i < BOOST_PAD_SPECS.length; i += 1) {
    if (state.boostPadCooldowns[i]! > 0) {
      state.boostPadCooldowns[i] = Math.max(0, state.boostPadCooldowns[i]! - dt);
      continue;
    }
    const pad = BOOST_PAD_SPECS[i]!;
    for (const car of cars) {
      const d = Math.hypot(car.x - pad.x, car.z - pad.z);
      if (d <= 2.55) {
        state.boostPadCooldowns[i] = BOOST_RESPAWN_SECONDS;
        car.boost = 100;
        if (car.id === "hero") {
          state.padsCollected += 1;
          recordEvent("boost-pad", `pad:${pad.id}`, "success");
          void turboGame.sound?.cue("boost");
          turboGame.juice.fire("boost");
        }
        break;
      }
    }
  }
}

const carSoccerKit = game.carSoccer({
  pitchHalfX: HALF_X,
  pitchHalfZ: HALF_Z,
  goalHalfWidth: GOAL_HALF_WIDTH,
  goalHeight: GOAL_HEIGHT,
  goalDepth: GOAL_DEPTH,
  ballRadius: BALL_RADIUS,
  carCollisionRadius: CAR_RADIUS
});

function resolveCarToCarBump(a: CarActor, b: CarActor): void {
  carSoccerKit.resolveCarToCarBump(a, b);
}

function stepBallPhysics(dt: number, cars: readonly CarActor[]): void {
  Object.assign(carSoccerKit.ball, state.ball);
  const events = carSoccerKit.stepBallPhysics(dt, cars);
  Object.assign(state.ball, carSoccerKit.ball);

  if (events.wallBounced) {
    void turboGame.sound?.cue("collision");
  }

  for (const touch of events.touchedBy) {
    void turboGame.sound?.cue("collision");
    turboGame.juice.fire("collision");
    app.feel?.emit("collision", { strength: 0.85 });

    if (touch.actorId === "hero") {
      recordEvent("collision", "ball-touch:hero", "info");
      if (touch.isShotOnBlueGoal) {
        state.shots += 1;
        recordEvent("shot", "shot:orange", "success");
        state.objective = "Great strike! Follow the ball into the Blue Goal!";
      }
    } else if (touch.isSaveAtBlueGoal) {
      state.saves += 1;
      recordEvent("save", "save:blue", "info");
      void turboGame.sound?.cue("save");
      turboGame.juice.fire("save");
    }
  }

  if (events.goalScored !== null) {
    onGoalScored(events.goalScored);
  }
}

function onGoalScored(scoringTeam: "orange" | "blue"): void {
  if (scoringTeam === "orange") {
    state.orangeScore += 1;
    recordEvent("goal", "goal:orange", "success");
    state.bannerText = `ORANGE GOAL! (${state.orangeScore} – ${state.blueScore})`;
    state.objective = `Orange scores! Lead ${state.orangeScore}–${state.blueScore}. First to ${GOALS_TO_WIN} wins.`;
  } else {
    state.blueScore += 1;
    recordEvent("goal", "goal:blue", "warning");
    state.bannerText = `BLUE GOAL! (${state.orangeScore} – ${state.blueScore})`;
    state.objective = `Blue scored (${state.orangeScore}–${state.blueScore}). Counter-attack from kickoff!`;
  }
  state.bannerTimer = 2.8;
  void turboGame.sound?.cue("goal");
  turboGame.juice.fire("goal", { position: [state.ball.x, state.ball.y + 1.2, state.ball.z], strength: 1 });
  app.feel?.emit("lap", { strength: 1 });

  if (state.orangeScore >= GOALS_TO_WIN || state.blueScore >= GOALS_TO_WIN) {
    finishMatch(state.orangeScore >= GOALS_TO_WIN ? "orange" : "blue");
    return;
  }

  resetKickoffPositions();
}

function finishMatch(winner: "orange" | "blue"): void {
  state.status = "finished";
  const label = winner === "orange" ? "victory:orange" : "victory:blue";
  recordEvent("victory", label, "success");
  void turboGame.sound?.cue("victory");
  turboGame.juice.fire("victory");
  state.bannerText = winner === "orange"
    ? `ORANGE TEAM WINS ${state.orangeScore}–${state.blueScore}! PRESS R FOR REMATCH`
    : `BLUE TEAM WINS ${state.blueScore}–${state.orangeScore}! PRESS R FOR REMATCH`;
  state.bannerTimer = 10;
  state.objective = winner === "orange"
    ? "Victory! Trophy awarded to Orange Team. Press R to play again."
    : "Match complete. Press R to reset and launch a rematch.";
}

function syncSceneNodes(dt: number): void {
  // Car GLBs have their front nose along -X in local model space.
  // In Aura3D rotationXYZ (M = Rz * Ry * Rx), Rx is applied first in local model space (pure roll around nose axis),
  // followed by Ry (world yaw). Keeping Rz = 0 prevents diagonal world-Z tilting when turning.
  heroCarNode
    .setPosition(state.hero.x, state.hero.y, state.hero.z)
    .setRotation(state.hero.roll, -state.hero.heading - Math.PI / 2, 0);

  greenCarNode
    .setPosition(state.green.x, state.green.y, state.green.z)
    .setRotation(state.green.roll, -state.green.heading - Math.PI / 2, 0);

  rivalCarNode
    .setPosition(state.rival.x, state.rival.y, state.rival.z)
    .setRotation(state.rival.roll, -state.rival.heading - Math.PI / 2, 0);

  purpleCarNode
    .setPosition(state.purple.x, state.purple.y, state.purple.z)
    .setRotation(state.purple.roll, -state.purple.heading - Math.PI / 2, 0);

  // Soccer ball uses scaleMode: "world" so rotation happens around its true geometric center (0, 0, 0)
  // and positioning at y = state.ball.y + BALL_RADIUS keeps the bottom of the ball flush with the pitch!
  soccerBallNode
    .setPosition(state.ball.x, state.ball.y + BALL_RADIUS, state.ball.z)
    .setRotation(state.ball.rx, state.ball.ry, state.ball.rz)
    .setScale(BALL_FACTOR);

  // Ground indicator ring under the ball so height and ground projection are always crystal clear
  const shadowScale = clamp(1.0 - state.ball.y * 0.045, 0.42, 1.0);
  ballShadowNode
    .setPosition(state.ball.x, 0.025, state.ball.z)
    .setScale([shadowScale, 1, shadowScale]);

  // Referee drone hovers above the action and tracks the ball smoothly
  const droneX = state.ball.x * 0.45;
  const droneZ = state.ball.z * 0.45 - 2.2;
  const droneY = 6.4 + Math.sin(state.elapsed * 2.2) * 0.25;
  const droneYaw = Math.atan2(state.ball.x - droneX, state.ball.z - droneZ);
  refereeDroneNode
    .setPosition(droneX, droneY, droneZ)
    .setRotation(0, droneYaw, 0);

  // Championship trophy rotates on its pitch-side pedestal outside the east touchline
  const trophyScale = state.status === "finished" ? 1.25 : 1.0;
  trophyCupNode
    .setPosition(22.4, 0.35 + (state.status === "finished" ? Math.abs(Math.sin(state.elapsed * 3)) * 0.4 : 0), 0)
    .setRotation(0, state.elapsed * 0.85, 0)
    .setScale(trophyScale);

  // Update 6 boost pad nodes (visible & spinning when active, dimmed/hidden on cooldown)
  for (let i = 0; i < BOOST_PAD_SPECS.length; i += 1) {
    const active = state.boostPadCooldowns[i]! <= 0;
    const padNode = boostPadNodes[i]!;
    padNode.setVisible(active);
    if (active && dt > 0) {
      padNode.setRotation(0, state.elapsed * 1.1 + i * 0.9, 0);
    }
  }
}

function updateCameraPose(_dt: number): void {
  const hero = state.hero;
  const ball = state.ball;
  const fov = Math.min(73, 60 + Math.abs(hero.speed) * 0.36);

  if (state.cameraMode === "ball") {
    // Ball-Cam: positions camera behind heroCar along the heroCar -> soccerBall line
    const dx = ball.x - hero.x;
    const dz = ball.z - hero.z;
    const dist = Math.hypot(dx, dz);
    const dirX = dist > 0.25 ? dx / dist : Math.sin(hero.heading);
    const dirZ = dist > 0.25 ? dz / dist : -Math.cos(hero.heading);

    const eyeX = clamp(hero.x - dirX * 8.4, -HALF_X + 1.5, HALF_X - 1.5);
    const eyeY = 4.15 + Math.min(1.6, hero.y * 0.5);
    const eyeZ = clamp(hero.z - dirZ * 8.4, -HALF_Z + 1.5, HALF_Z - 1.5);

    const lookX = hero.x * 0.3 + ball.x * 0.7;
    const lookY = 1.15 + ball.y * 0.45;
    const lookZ = hero.z * 0.3 + ball.z * 0.7;

    app.camera?.setPose({
      position: [eyeX, eyeY, eyeZ],
      target: [lookX, lookY, lookZ],
      fov
    });
  } else {
    // Car-Chase Cam: directly behind heroCar along its heading vector
    const fx = Math.sin(hero.heading);
    const fz = -Math.cos(hero.heading);
    const eyeX = clamp(hero.x - fx * 8.6, -HALF_X + 1.5, HALF_X - 1.5);
    const eyeY = 4.15 + hero.y * 0.5;
    const eyeZ = clamp(hero.z - fz * 8.6, -HALF_Z + 1.5, HALF_Z - 1.5);

    app.camera?.setPose({
      position: [eyeX, eyeY, eyeZ],
      target: [hero.x + fx * 4.8, 1.2 + hero.y * 0.4, hero.z + fz * 4.8],
      fov
    });
  }
}

function buildPitchAndGoalsNodes(): AuraNodeInput[] {
  const blueNeonMat = material.pbr({ color: "#38bdf8", roughness: 0.25, metalness: 0.45 });
  return [
    ...game.carSoccerPitch({
      pitchHalfX: HALF_X,
      pitchHalfZ: HALF_Z,
      goalHalfWidth: GOAL_HALF_WIDTH,
      goalHeight: GOAL_HEIGHT,
      goalDepth: GOAL_DEPTH
    }),
    primitives
      .torus({
        name: "ball-ground-indicator",
        size: (BALL_RADIUS * 0.92) / 0.43,
        material: blueNeonMat
      })
      .position(0, 0.025, 0)
      .rotate(Math.PI / 2, 0, 0)
      .runtime(game.runtimeNode("ball-shadow-ring", { tags: ["ball-shadow", "runtime"] }))
  ];
}

function buildScene() {
  const nodes: AuraNodeInput[] = [
    // 1. Enclosed Futuristic Rocket Soccer Stadium Arena Bowl (assets.stadiumArena)
    model(assets.stadiumArena, {
      name: "futuristic rocket soccer stadium arena",
      targetMaxDimension: STADIUM_OUTER_SPAN,
      castShadow: false,
      receiveShadow: true
    })
      .position(0, STADIUM_FLOOR_Y, 0)
      .rotate(0, Math.PI / 2, 0)
      .scale([STADIUM_WIDTH_RATIO, 0.96, 1]),

    // Regulation 3D Rocket-Soccer Pitch + North Blue Goal & South Orange Goal
    ...buildPitchAndGoalsNodes(),

    // 2. Player Hero Car — Orange Rocket Soccer Car (assets.heroCar)
    model(assets.heroCar, {
      name: "player orange rocket soccer car",
      targetLength: CAR_TARGET_LENGTH,
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0, 11.2)
      .rotate(0, -Math.PI / 2, 0)
      .scale(1)
      .runtime(game.runtimeNode("race-car", { tags: ["player", "hero-car", "vehicle", "typed-asset", "runtime"] })),

    // 3. Teammate AI — Lime Green Rocket Soccer Car (assets.greenCar)
    model(assets.greenCar, {
      name: "teammate lime green rocket soccer car",
      targetLength: CAR_TARGET_LENGTH,
      castShadow: true,
      receiveShadow: true
    })
      .position(-8.5, 0, 15.5)
      .rotate(0, -Math.PI / 2 - 0.18, 0)
      .scale(1)
      .runtime(game.runtimeNode("green-car", { tags: ["teammate", "vehicle", "typed-asset", "runtime"] })),

    // 4. Rival Striker AI — Blue Rocket Soccer Car (assets.rivalCar)
    model(assets.rivalCar, {
      name: "rival blue striker rocket soccer car",
      targetLength: CAR_TARGET_LENGTH,
      castShadow: true,
      receiveShadow: true
    })
      .position(5.5, 0, -13.8)
      .rotate(0, Math.PI / 2 + 0.16, 0)
      .scale(1)
      .runtime(game.runtimeNode("rival-car", { tags: ["rival", "striker", "vehicle", "typed-asset", "runtime"] })),

    // 5. Rival Defender AI — Purple Rocket Soccer Car (assets.purpleCar)
    model(assets.purpleCar, {
      name: "rival purple defender rocket soccer car",
      targetLength: CAR_TARGET_LENGTH,
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0, -23.2)
      .rotate(0, Math.PI / 2, 0)
      .scale(1)
      .runtime(game.runtimeNode("purple-car", { tags: ["rival", "defender", "vehicle", "typed-asset", "runtime"] })),

    // 6. Oversized Glowing Hex-Panel Match Ball (assets.soccerBall)
    // Uses scaleMode: "world" so rotation pivots around the sphere's true geometric center!
    model(assets.soccerBall, {
      name: "oversized hex soccer match ball",
      scaleMode: "world",
      castShadow: true,
      receiveShadow: true
    })
      .position(0, BALL_RADIUS, 0)
      .scale(BALL_FACTOR)
      .runtime(game.runtimeNode("soccer-ball", { tags: ["ball", "prop", "typed-asset", "runtime"] })),

    // 7. Hovering Referee Camera Drone (assets.refereeDrone)
    model(assets.refereeDrone, {
      name: "hovering referee camera drone",
      targetMaxDimension: 2.2,
      castShadow: true,
      receiveShadow: false
    })
      .position(0, 6.4, -2.2)
      .scale(1)
      .runtime(game.runtimeNode("referee-drone", { tags: ["drone", "prop", "typed-asset", "runtime"] })),

    // 8. Championship Trophy Cup at Pitch-Side Pedestal (assets.trophyCup + boostPad plinth)
    model(assets.boostPad, {
      name: "championship trophy hexagonal plinth",
      targetMaxDimension: 2.6,
      castShadow: true,
      receiveShadow: true
    })
      .position(22.4, 0, 0)
      .scale(1),

    model(assets.trophyCup, {
      name: "championship golden trophy cup",
      targetHeight: 3.1,
      castShadow: true,
      receiveShadow: true
    })
      .position(22.4, 0.35, 0)
      .scale(1)
      .runtime(game.runtimeNode("trophy-cup", { tags: ["trophy", "prop", "typed-asset", "runtime"] }))
  ];

  // 9. Six Glowing Hexagonal Boost Pickup Pads (assets.boostPad)
  for (const pad of BOOST_PAD_SPECS) {
    nodes.push(
      model(assets.boostPad, {
        name: `hexagonal boost pickup ${pad.id}`,
        targetMaxDimension: 2.15,
        castShadow: false,
        receiveShadow: true
      })
        .position(pad.x, 0.02, pad.z)
        .scale(1)
        .runtime(game.runtimeNode(pad.id, { tags: ["boost-pad", "pickup", "typed-asset", "runtime"] }))
    );
  }

  // 10. Four Stadium Floodlight Towers at Pitch Corners (assets.floodlightTower)
  for (const tower of FLOODLIGHT_CORNERS) {
    nodes.push(
      model(assets.floodlightTower, {
        name: tower.name,
        targetHeight: 15.5,
        castShadow: false,
        receiveShadow: false
      })
        .position(tower.x, -0.4, tower.z)
        .rotate(0, tower.ry, 0)
        .scale(1)
    );
  }

  return scene()
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0, exposureEv: 0.05 }))
    .addMany(nodes)
    .camera(
      camera.perspective({
        position: [0, 3.45, 19.4],
        target: [0, 1.2, 3.4],
        fov: 60
      })
    );
}

interface HudElements {
  readonly root: HTMLElement;
  readonly orangeScore: HTMLElement;
  readonly blueScore: HTMLElement;
  readonly clock: HTMLElement;
  readonly objective: HTMLElement;
  readonly shots: HTMLElement;
  readonly saves: HTMLElement;
  readonly ballSpeed: HTMLElement;
  readonly cameraMode: HTMLElement;
  readonly speed: HTMLElement;
  readonly boostValue: HTMLElement;
  readonly boostFill: HTMLElement;
  readonly banner: HTMLElement;
}

function createHudDom(): HudElements {
  const existing = document.getElementById("turbo-ball-hud");
  existing?.remove();

  const root = document.createElement("aside");
  root.id = "turbo-ball-hud";
  root.setAttribute("aria-label", "Turbo Ball Match Telemetry HUD");
  root.innerHTML = `
    <header class="tb-topbar">
      <div class="tb-brand-panel">
        <div class="tb-title-row">
          <h1 class="tb-title">Turbo Ball</h1>
          <span class="tb-mode-tag">2v2 ARENA</span>
        </div>
        <div class="tb-objective" data-hud="objective"></div>
      </div>

      <div class="tb-scorebug" role="region" aria-label="Match Scoreboard">
        <div class="tb-team tb-team-orange">
          <div>
            <span class="tb-team-name">Orange</span>
            <span class="tb-team-sub">You + Green AI</span>
          </div>
          <span class="tb-score-num tnum" data-hud="orange-score">0</span>
        </div>
        <div class="tb-clock-cell">
          <span class="tb-clock-label smcp">match clock</span>
          <span class="tb-clock-val tnum" data-hud="clock">01:30</span>
        </div>
        <div class="tb-team tb-team-blue">
          <span class="tb-score-num tnum" data-hud="blue-score">0</span>
          <div style="text-align:right">
            <span class="tb-team-name">Blue</span>
            <span class="tb-team-sub">Rival + Keeper</span>
          </div>
        </div>
      </div>

      <div class="tb-telemetry-panel">
        <div class="tb-stat-cell">
          <span class="tb-stat-label smcp">shots</span>
          <span class="tb-stat-val tnum" data-hud="shots">0</span>
        </div>
        <div class="tb-stat-cell">
          <span class="tb-stat-label smcp">saves</span>
          <span class="tb-stat-val tnum" data-hud="saves">0</span>
        </div>
        <div class="tb-stat-cell">
          <span class="tb-stat-label smcp">ball km/h</span>
          <span class="tb-stat-val tnum" data-hud="ball-speed">0</span>
        </div>
        <div class="tb-stat-cell">
          <span class="tb-stat-label smcp">cam mode</span>
          <span class="tb-stat-val" data-hud="cam-mode">Ball</span>
        </div>
      </div>
    </header>

    <div class="tb-center-stage">
      <div class="tb-banner" data-hud="banner" data-visible="true">KICKOFF — DRIVE WITH W/A/S/D + SHIFT BOOST</div>
    </div>

    <footer class="tb-bottombar">
      <div class="tb-controls-strip">
        <span class="tb-control-item"><kbd class="tb-kbd">W</kbd><kbd class="tb-kbd">S</kbd> Drive / Reverse</span>
        <span class="tb-control-item"><kbd class="tb-kbd">A</kbd><kbd class="tb-kbd">D</kbd> Steer</span>
        <span class="tb-control-item"><kbd class="tb-kbd">Shift</kbd> Rocket Boost</span>
        <span class="tb-control-item"><kbd class="tb-kbd">Space</kbd> Power Hop</span>
        <span class="tb-control-item"><kbd class="tb-kbd">C</kbd> Ball Cam</span>
        <span class="tb-control-item"><kbd class="tb-kbd">R</kbd> Reset Match</span>
      </div>

      <div class="tb-gauges">
        <div class="tb-gauge-box">
          <div class="tb-gauge-head">
            <span class="tb-gauge-title smcp">velocity</span>
            <span class="tb-gauge-num tnum" data-hud="speed">0 km/h</span>
          </div>
        </div>
        <div class="tb-gauge-box">
          <div class="tb-gauge-head">
            <span class="tb-gauge-title smcp">rocket boost</span>
            <span class="tb-gauge-num tnum" data-hud="boost-val">100%</span>
          </div>
          <div class="tb-boost-track">
            <div class="tb-boost-fill" data-hud="boost-fill"></div>
          </div>
        </div>
      </div>
    </footer>
  `;

  document.body.append(root);

  const query = (key: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`[data-hud="${key}"]`);
    if (!el) throw new Error(`Missing HUD element [data-hud="${key}"]`);
    return el;
  };

  return {
    root,
    orangeScore: query("orange-score"),
    blueScore: query("blue-score"),
    clock: query("clock"),
    objective: query("objective"),
    shots: query("shots"),
    saves: query("saves"),
    ballSpeed: query("ball-speed"),
    cameraMode: query("cam-mode"),
    speed: query("speed"),
    boostValue: query("boost-val"),
    boostFill: query("boost-fill"),
    banner: query("banner")
  };
}

function renderHud(): void {
  const mins = Math.floor(state.matchTimeRemaining / 60);
  const secs = Math.floor(state.matchTimeRemaining % 60);
  const clockStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const ballSpeedVec = Math.hypot(state.ball.vx, state.ball.vy, state.ball.vz);

  hudElements.orangeScore.textContent = String(state.orangeScore);
  hudElements.blueScore.textContent = String(state.blueScore);
  hudElements.clock.textContent = clockStr;
  hudElements.objective.textContent = state.objective;
  hudElements.shots.textContent = String(state.shots);
  hudElements.saves.textContent = String(state.saves);
  hudElements.ballSpeed.textContent = String(Math.round(ballSpeedVec * 3.6));
  hudElements.cameraMode.textContent = state.cameraMode === "ball" ? "Ball" : "Car";
  hudElements.speed.textContent = `${Math.round(Math.abs(state.hero.speed) * 3.6)} km/h`;

  const boostPct = Math.round(state.hero.boost);
  hudElements.boostValue.textContent = `${boostPct}%`;
  hudElements.boostFill.style.width = `${boostPct}%`;

  hudElements.banner.textContent = state.bannerText;
  hudElements.banner.setAttribute("data-visible", state.bannerTimer > 0 ? "true" : "false");
}

function publishEvidence(): void {
  const ballSpeedScalar = Number(Math.hypot(state.ball.vx, state.ball.vy, state.ball.vz).toFixed(3));
  const evidence = app.evidence({
    input,
    events: matchEvents,
    hud: hudBindings,
    appState: {
      objective: state.objective,
      matchClock: Number(state.matchTimeRemaining.toFixed(2)),
      scoreText: `${state.orangeScore}-${state.blueScore}`,
      boost: Math.round(state.hero.boost),
      events: matchEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: TYPED_ASSET_KEYS.length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });

  const snapshot: TurboBallEvidence = {
    status: state.status,
    frame: state.frame,
    lap: state.orangeScore + 1,
    checkpoint: state.padsCollected,
    checkpointCount: BOOST_PAD_SPECS.length,
    speed: Number(state.hero.speed.toFixed(4)),
    progress: state.progress,
    heading: Number(state.hero.heading.toFixed(4)),
    position: {
      x: Number(state.hero.x.toFixed(3)),
      y: Number(state.hero.z.toFixed(3)),
      z: Number(state.hero.z.toFixed(3))
    },
    events: [...state.eventLabels],
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    geometry: {
      tool: "aura3d assets validate --no-placeholders --require-license",
      report: "aura.assets.json",
      carMetres: HERO_CAR_METRES,
      trackMetres: STADIUM_METRES,
      ballMetres: BALL_METRES,
      carScale: 1,
      routeScale: Number(STADIUM_FIT_SCALE.toFixed(3))
    },
    camera: {
      rig: app.camera?.rig.id ?? "chase",
      mode: state.cameraMode,
      presented: app.camera !== undefined
    },
    orangeScore: state.orangeScore,
    blueScore: state.blueScore,
    shots: state.shots,
    saves: state.saves,
    boost: Number(state.hero.boost.toFixed(2)),
    ballPosition: {
      x: Number(state.ball.x.toFixed(3)),
      y: Number(state.ball.y.toFixed(3)),
      z: Number(state.ball.z.toFixed(3))
    },
    ballSpeed: ballSpeedScalar,
    matchTimeRemaining: Number(state.matchTimeRemaining.toFixed(2)),
    typedAssetsUsed: TYPED_ASSET_KEYS,
    evidence
  };

  window.__AURA3D_TURBO_BALL__ = snapshot;
  window.__AURA3D_RACING_STARTER__ = snapshot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

