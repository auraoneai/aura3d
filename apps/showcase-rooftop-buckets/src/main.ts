// Rooftop Buckets — ported onto the salvaged deterministic core.
// Single code path: every URL (including ?scene=default) boots this module;
// the former legacy/v2 dispatcher is deleted. Gameplay truth lives in the
// salvaged modules under src/gameplay/ (court spots, Rapier hoop-sim, rim
// hoop modes, the pure five-heat scoring loop, and solver-driven shot
// flight); this file is only the fresh scene, input, HUD and evidence shell
// around them. No basketball kit is used or claimed.
import {
  camera,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the sports-broadcast HUD theme, the dpad-2btn touch preset, game-sfx-core
// cues, and the juice event map (no route-local hit-stop).
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import { BACKBOARD_POSITION, COURT_SPOTS, HOOP_BASE_POSITION } from "./gameplay/court";
import { initialHoopState, updateHoop, type HoopState } from "./gameplay/rim";
import {
  calculateLaunchVelocity,
  createBallAtSpot,
  predictFirstFlight,
  stepBall,
  type BallState
} from "./gameplay/shot";
import {
  advanceHeat,
  heatConfig,
  initialScoreState,
  recordShotOutcome,
  updateClocks,
  type GameScoreState
} from "./gameplay/scoring";

declare global {
  interface Window {
    __aura3dGameSnapshot?: RooftopBucketsEvidence;
  }
}

interface RooftopBucketsEvidence {
  readonly framed: boolean;
  readonly state: GameScoreState["state"] | "paused-local";
  readonly heat: number;
  readonly heatName: string;
  readonly score: number;
  readonly target: number;
  readonly streak: number;
  readonly onFire: boolean;
  readonly shots: number;
  readonly makes: number;
  readonly misses: number;
  readonly madeSpotIds: readonly number[];
  readonly shotClock: number;
  readonly heatTimer: number;
  readonly spot: { readonly id: number; readonly name: string; readonly points: number };
  readonly charge: { readonly power: number; readonly pitch: number; readonly charging: boolean };
  readonly ball: {
    readonly inFlight: boolean;
    readonly settled: boolean;
    readonly hasScored: boolean;
    readonly result: string | null;
    readonly position: readonly [number, number, number];
  };
  readonly lastResult: string | null;
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly drawCalls: number;
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

const LOOK_ID = "golden-hour" as const;
// At scaleMode: "world" and scale 1.0, the athlete GLBs stand 1.863 m tall
// with raw minimum Y = -1.016, so ATHLETE_FLOOR_OFFSET plants their shoes on
// the court deck (y = 0).
const ATHLETE_SCALE = 1.0;
const ATHLETE_FLOOR_OFFSET = 1.016 * ATHLETE_SCALE;
// Hide internal mouth/cornea/nail submeshes that add skinned draw calls
// without contributing visible pixels at broadcast distance.
const ATHLETE_HIDDEN_SUBMESHES = [
  "Object_7",
  "Object_13",
  "Object_14",
  "Object_17",
  "Object_19",
  "Object_21",
  "Object_22"
] as const;
// rooftopBall has unit bounds [-0.5..0.5]; 0.24 renders the regulation 0.24 m
// diameter the solver's BALL_RADIUS (0.12 m) describes.
const BALL_SCALE = 0.24;
const AIM_DOTS = 6;
const CHARGE_RATE = 1.6; // power units per second, ping-pong while held
const CAMERA_POSITION: readonly [number, number, number] = [2.6, 2.9, 9.2];
const CAMERA_TARGET: readonly [number, number, number] = [0, 2.0, -0.4];
const CAMERA_FOV = 48;

// Three.js-grade PBR materials for the streetball rooftop venue.
const COURT_DECK_MAT = material.lacquer({
  name: "rooftop dark hardwood court deck",
  color: "#5c3418",
  roughness: 0.24,
  clearcoat: 0.85
});
const COURT_PAINT_LANE_MAT = material.lacquer({
  name: "rooftop dark hardwood key lane",
  color: "#3b1f0e",
  roughness: 0.2,
  clearcoat: 0.9
});
const COURT_LINE_MAT = material.clearcoatPaint({
  name: "rooftop crisp white court lines",
  color: "#f8fafc",
  roughness: 0.14
});
const COURT_ACCENT_LINE_MAT = material.neon({
  name: "rooftop cyan three-point arc",
  color: "#38bdf8",
  emissive: "#38bdf8",
  emissiveIntensity: 1.55,
  practical: true
});
const BACKBOARD_GLASS_MAT = material.frostedGlass({
  name: "tempered glass backboard",
  color: "#e2e8f0",
  opacity: 0.68,
  roughness: 0.18
});
const STANCHION_METAL_MAT = material.brushedMetal({
  name: "hoop stanchion and rooftop steel",
  color: "#cbd5e1",
  roughness: 0.24
});
const BLEACHER_CHARCOAL_MAT = material.ceramic({
  name: "dark charcoal bleachers",
  color: "#1e293b",
  roughness: 0.46
});
const RIM_PAINT_MAT = material.carPaint({
  name: "breakaway orange rim",
  color: "#f97316",
  roughness: 0.22
});
const BASKETBALL_RUBBER_MAT = material.blackRubber({
  name: "pebbled streetball leather",
  color: "#ea580c",
  roughness: 0.72
});
const SKYLINE_SLATE_MAT = material.lacquer({
  name: "dark slate navy skyline towers",
  color: "#0f172a",
  roughness: 0.32,
  clearcoat: 0.45
});
const SKYLINE_WINDOW_WARM_MAT = material.neon({
  name: "skyline warm lit windows",
  color: "#fbbf24",
  emissive: "#fbbf24",
  emissiveIntensity: 1.85,
  practical: true
});
const SKYLINE_WINDOW_CYAN_MAT = material.neon({
  name: "skyline cyan lit windows",
  color: "#38bdf8",
  emissive: "#38bdf8",
  emissiveIntensity: 1.95,
  practical: true
});
const AIM_DOT_MAT = material.neon({
  name: "shot arc guide dot",
  color: "#ffd24d",
  emissive: "#ffd24d",
  emissiveIntensity: 1.8,
  practical: true
});

const quat = (x: number, y: number, z: number, w: number) => ({ x, y, z, w }) as const;

// Authored basketball poses applied over the CC_Base humanoid rig via
// setAnimationPose() so the athletes hold/load/follow-through the ball and
// guard the paint rather than remaining in the GLB clips' static bind T-pose.
const SHOOTER_POSES = {
  ready: {
    bones: {
      CC_Base_Spine01_034: { rotation: quat(-0.145, 0, 0, 0.9894) },
      CC_Base_Spine02_035: { rotation: quat(-0.025, 0, 0, 0.9997) },
      CC_Base_L_Upperarm_050: { rotation: quat(0.487, 0.0536, -0.4923, 0.7195) },
      CC_Base_R_Upperarm_074: { rotation: quat(0.487, -0.0536, 0.4923, 0.7195) },
      CC_Base_L_Forearm_051: { rotation: quat(0.637, 0.0074, 0.0875, 0.766) },
      CC_Base_R_Forearm_077: { rotation: quat(0.637, -0.0074, -0.0876, 0.766) },
      CC_Base_L_Hand_055: { rotation: quat(0.08, 0.18, 0.04, 0.9796) },
      CC_Base_R_Hand_081: { rotation: quat(0.08, -0.18, -0.04, 0.9796) }
    }
  },
  load: {
    bones: {
      CC_Base_Spine01_034: { rotation: quat(-0.13, 0, 0, 0.9915) },
      CC_Base_Spine02_035: { rotation: quat(-0.015, 0, 0, 0.9999) },
      CC_Base_L_Upperarm_050: { rotation: quat(0.7296, -0.0108, -0.0638, 0.6808) },
      CC_Base_R_Upperarm_074: { rotation: quat(0.7427, 0.0243, -0.0336, 0.6684) },
      CC_Base_L_Forearm_051: { rotation: quat(0.3721, 0.0063, 0.5358, 0.7579) },
      CC_Base_R_Forearm_077: { rotation: quat(0.2617, -0.0051, -0.5283, 0.8078) },
      CC_Base_L_Hand_055: { rotation: quat(-0.12, 0.14, 0.02, 0.9827) },
      CC_Base_R_Hand_081: { rotation: quat(-0.18, -0.1, -0.02, 0.9783) }
    }
  },
  follow: {
    bones: {
      CC_Base_Spine01_034: { rotation: quat(-0.175, 0, 0, 0.9846) },
      CC_Base_Spine02_035: { rotation: quat(-0.04, 0, 0, 0.9992) },
      CC_Base_L_Upperarm_050: { rotation: quat(0.6864, -0.0427, 0.1786, 0.7036) },
      CC_Base_R_Upperarm_074: { rotation: quat(0.4784, 0.0869, -0.5433, 0.6844) },
      CC_Base_L_Forearm_051: { rotation: quat(0.0952, 0.0028, 0.4141, 0.9052) },
      CC_Base_R_Forearm_077: { rotation: quat(0.0042, -0.0004, -0.0916, 0.9958) },
      CC_Base_R_Hand_081: { rotation: quat(0.42, 0, 0, 0.9075) }
    }
  }
} as const;

const DEFENDER_POSES = {
  stance: {
    bones: {
      CC_Base_Spine01_034: { rotation: quat(-0.14, 0, 0, 0.9902) },
      CC_Base_L_Upperarm_050: { rotation: quat(0.3446, 0.0362, -0.3398, 0.8743) },
      CC_Base_R_Upperarm_074: { rotation: quat(0.3446, -0.0362, 0.3398, 0.8743) },
      CC_Base_L_Forearm_051: { rotation: quat(0.4244, 0.0061, 0.3506, 0.8347) },
      CC_Base_R_Forearm_077: { rotation: quat(0.4243, -0.0061, -0.3506, 0.8347) }
    }
  },
  contest: {
    bones: {
      CC_Base_Spine01_034: { rotation: quat(-0.18, 0, 0, 0.9837) },
      CC_Base_L_Upperarm_050: { rotation: quat(0.3869, -0.0789, 0.5, 0.7708) },
      CC_Base_R_Upperarm_074: { rotation: quat(0.3411, 0.0854, -0.5568, 0.7525) },
      CC_Base_L_Forearm_051: { rotation: quat(-0.0223, 0.0004, 0.1419, 0.9897) },
      CC_Base_R_Forearm_077: { rotation: quat(-0.0439, 0.0001, -0.0989, 0.9941) }
    }
  }
} as const;

const inputOptions = {
  actions: {
    spotLeft: ["KeyA", "ArrowLeft"],
    spotRight: ["KeyD", "ArrowRight"],
    aimUp: ["KeyW", "ArrowUp"],
    aimDown: ["KeyS", "ArrowDown"],
    shoot: ["Space"],
    pause: ["KeyP"],
    reset: ["KeyR"]
  },
  bufferMs: 100
} as const;

const routeEvents = game.eventLog({ label: "rooftop buckets events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: RooftopBucketsEvidence | undefined;

// ------------------------------------------------------------ game state ----
let scoreState: GameScoreState = initialScoreState(1);
let hoopState: HoopState = initialHoopState(1);
let spotIndex = 1;
let ballState: BallState = createBallAtSpot(COURT_SPOTS[spotIndex]!, false);
let charge = { power: 0, pitch: 0, charging: false, direction: 1 };
let paused = false;
let elapsed = 0;
let frameCounter = 0;
let objective = heatObjective();
let aimCacheKey = "";
let aimPoints: readonly { readonly x: number; readonly y: number; readonly z: number }[] = [];
let lastShooterPoseKey = "";
let lastDefenderPoseKey = "";
let lastHudSignature = "";
let cachedDrawCalls = 0;
let cachedEvidenceKey = "";
let cachedRuntimeEvidence: unknown = null;

function heatObjective(): string {
  const config = heatConfig(scoreState.heat);
  return `Heat ${config.heat} — ${config.name}: ${config.objective}. Hold Space to charge, release to shoot.`;
}

const bucketsGame = createGame({
  id: "rooftop-buckets",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "sports-broadcast",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "clock", kind: "timer", anchor: "top-right", label: "SHOT CLOCK" },
      { id: "heat", kind: "prompt", anchor: "top", label: "HEAT" },
      { id: "charge", kind: "meter", max: 100, anchor: "bottom", label: "CHARGE" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ] as unknown as readonly { readonly id: string; readonly kind: string; readonly anchor: "top-left" | "top-right" | "top" | "bottom"; readonly label?: string }[]
  },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "spotLeft", right: "spotRight", dash: "aimDown", jump: "aimUp", attack: "shoot" }
  },
  sound: {
    cues: {
      bounce: { id: "bounce", asset: { url: sfxUrl("impact.wood.light.00") }, volume: 0.5 },
      rim: { id: "rim", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.6 },
      swish: { id: "swish", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.8 },
      crowd: { id: "crowd", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.7 },
      bed: { id: "bed", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.25, loop: true }
    }
  },
  juice: {
    swish: { flash: { color: "#ffd24d", peak: 0.18, ms: 220 }, punch: { fovDeg: 1.5, ms: 200 }, rumble: { weak: 0.4, ms: 160 } },
    rim: { shake: 0.12, rumble: { weak: 0.3, ms: 100 } },
    "game-over": { flash: { color: "#d88791", peak: 0.3, ms: 400 }, vignette: { amount: 0.6, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { rooftopBuckets: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = bucketsGame.app;
if (!bucketsGame.input) throw new Error("rooftop-buckets failed to create runtime-owned input.");
const input = bucketsGame.input;
bucketsGame.start();
void bucketsGame.sound?.cue("bed");

const ballNode: AuraRuntimeNodeHandle = app.nodes.require("ball");
const shooterNode: AuraRuntimeNodeHandle = app.nodes.require("shooter");
const defenderNode: AuraRuntimeNodeHandle = app.nodes.require("defender");
const aimNodes: AuraRuntimeNodeHandle[] = Array.from({ length: AIM_DOTS }, (_, i) => app.nodes.require(`aim-dot-${i}`));
const hudRoot = createHud();

const DIRECTION_AUDIO_EVENTS = new Set(["bounce", "rim", "swish", "crowd", "bed"]);
const requestedAudioEvents = new Set<string>(["bed"]);
const playedAudioEvents = new Set<string>();

function cueDirectionEvent(event: "bounce" | "rim" | "swish" | "crowd"): void {
  requestedAudioEvents.add(event);
  void bucketsGame.sound?.cue(event);
}

app.camera?.use(
  camera.rigs.static({
    position: [...CAMERA_POSITION],
    target: [...CAMERA_TARGET],
    fov: CAMERA_FOV
  })
);

app.onFrame(({ dt: rawDt }) => {
  frameCounter += 1;
  const dt = Math.min(Math.max(rawDt, 0), 0.1);
  if (input.pressed("reset")) fullReset();
  if (input.pressed("pause")) {
    paused = !paused;
    routeEvents.push({ type: paused ? "pause" : "resume", label: paused ? "pause" : "resume" });
  }
  if (!paused && dt > 0) stepGame(dt);
  syncNodes();
  renderHud();
  publishEvidence();
});

syncNodes();
renderHud();
publishEvidence();

// ------------------------------------------------------------- game flow ----

function stepGame(dt: number): void {
  elapsed += dt;
  const spot = COURT_SPOTS[spotIndex]!;

  if (!ballState.inFlight && scoreState.state === "playing") {
    if (input.pressed("spotLeft")) changeSpot(-1);
    if (input.pressed("spotRight")) changeSpot(1);
    if (input.held("aimUp")) charge.pitch = Math.min(1, charge.pitch + dt * 1.4);
    if (input.held("aimDown")) charge.pitch = Math.max(-1, charge.pitch - dt * 1.4);

    if (input.pressed("shoot")) {
      charge = { power: 0, pitch: charge.pitch, charging: true, direction: 1 };
    }
    if (charge.charging && input.held("shoot")) {
      charge.power += charge.direction * dt * CHARGE_RATE;
      if (charge.power >= 1) { charge.power = 1; charge.direction = -1; }
      else if (charge.power <= 0) { charge.power = 0; charge.direction = 1; }
    }
    if (charge.charging && input.released("shoot")) {
      releaseShot(charge.power, charge.pitch);
      charge.charging = false;
    }
  }

  if (scoreState.state === "heat-cleared") {
    scoreState = advanceHeat(scoreState);
    if (scoreState.heat === 2) spotIndex = 0;
    hoopState = initialHoopState(scoreState.heat);
    routeEvents.push({ type: "heat-advance", label: `heat:${scoreState.heat}`, severity: "success" });
    cueDirectionEvent("crowd");
    objective = heatObjective();
    resetBallToSpot();
  }

  hoopState = updateHoop(hoopState, scoreState.heat, elapsed, COURT_SPOTS[spotIndex]!.x);

  if (ballState.inFlight) {
    const hadScored = ballState.hasScored;
    const { ball: next, events } = stepBall(ballState, hoopState, dt);
    ballState = next;
    if (events.clankedRim) {
      cueDirectionEvent("rim");
      bucketsGame.juice.fire("rim");
      routeEvents.push({ type: "rim", label: "rim" });
    }
    if (events.thuddedBoard) routeEvents.push({ type: "board", label: "board" });
    if (events.swishedNet && !hadScored && ballState.hasScored) {
      cueDirectionEvent("swish");
      bucketsGame.juice.fire("swish");
    }
    if (events.settled) settleShot();
  }

  const { state: clockNext, event: clockEvent } = updateClocks(scoreState, dt, ballState.inFlight);
  scoreState = clockNext;
  if (clockEvent.isClockViolation) {
    routeEvents.push({ type: "violation", label: "shot-clock violation", severity: "warning" });
    objective = "Shot-clock violation. Ball re-spotted — shoot sooner.";
    if (scoreState.state === "playing") resetBallToSpot();
  }
  if (clockEvent.isGameOver) onTerminal(false);
  if (clockEvent.isGoldWin) onTerminal(true);
  if (clockEvent.isHeatCleared) objective = heatObjective();
  void spot;
}

function changeSpot(delta: number): void {
  spotIndex = Math.max(0, Math.min(COURT_SPOTS.length - 1, spotIndex + delta));
  resetBallToSpot();
  routeEvents.push({ type: "spot", label: `spot:${COURT_SPOTS[spotIndex]!.id}` });
}

function releaseShot(power: number, pitch: number): void {
  if (ballState.inFlight || scoreState.state !== "playing") return;
  const spot = COURT_SPOTS[spotIndex]!;
  const vel = calculateLaunchVelocity(spot, power, pitch, hoopState);
  ballState = { ...ballState, vx: vel.vx, vy: vel.vy, vz: vel.vz, inFlight: true, settled: false, flightTimer: 0 };
  routeEvents.push({ type: "release", label: `release:${spot.id}` });
}

function settleShot(): void {
  const spot = COURT_SPOTS[spotIndex]!;
  const { state: next, event } = recordShotOutcome(
    scoreState,
    ballState.result ?? "brick",
    spot.points,
    scoreState.heat === 5,
    spot.id
  );
  scoreState = next;
  routeEvents.push({
    type: ballState.result ?? "brick",
    label: `${ballState.result ?? "brick"}:+${event.pointsEarned}`,
    severity: event.pointsEarned > 0 ? "success" : "info"
  });
  if (event.pointsEarned > 0) {
    objective = `${ballState.result} — +${event.pointsEarned}. ${heatObjective()}`;
    if (event.isFireIgnited) objective = `On fire! Makes pay double. ${heatObjective()}`;
  } else {
    cueDirectionEvent("bounce");
    objective = `Miss (${ballState.result ?? "brick"}). ${heatObjective()}`;
  }
  if (event.isGoldWin) onTerminal(true);
  else if (event.isGameOver) onTerminal(false);
  else if (scoreState.state === "playing") resetBallToSpot();
}

function onTerminal(won: boolean): void {
  objective = won
    ? "Victory — all five heats cleared. Press R to run it back."
    : "Game over. Press R to reset the session.";
  routeEvents.push({ type: won ? "victory" : "game-over", label: won ? "victory" : "game-over", severity: won ? "success" : "warning" });
  if (won) cueDirectionEvent("crowd");
  else bucketsGame.juice.fire("game-over");
}

function resetBallToSpot(): void {
  ballState = createBallAtSpot(COURT_SPOTS[spotIndex]!, scoreState.heat === 5);
  charge = { power: 0, pitch: charge.pitch, charging: false, direction: 1 };
  aimCacheKey = "";
}

function fullReset(): void {
  scoreState = initialScoreState(1);
  hoopState = initialHoopState(1);
  spotIndex = 1;
  elapsed = 0;
  paused = false;
  charge = { power: 0, pitch: 0, charging: false, direction: 1 };
  objective = heatObjective();
  resetBallToSpot();
  routeEvents.push({ type: "reset", label: "reset" });
}

// ------------------------------------------------------------------ scene ----

function buildCourtMarkingsTransforms() {
  // Crisp white boundary lines, key lane, free-throw line, and backboard shooter's square
  const lines: { position: [number, number, number]; rotation?: [number, number, number]; scale: [number, number, number] }[] = [
    // Baseline & sidelines
    { position: [0, 0.032, -0.9], scale: [14.4, 0.012, 0.09] },
    { position: [-7.2, 0.032, 4.4], scale: [0.09, 0.012, 10.6] },
    { position: [7.2, 0.032, 4.4], scale: [0.09, 0.012, 10.6] },
    // Paint / key lane (width 3.6m, baseline z=-0.9 to free-throw line z=4.6)
    { position: [-1.8, 0.032, 1.85], scale: [0.08, 0.012, 5.5] },
    { position: [1.8, 0.032, 1.85], scale: [0.08, 0.012, 5.5] },
    { position: [0, 0.032, 4.6], scale: [3.68, 0.012, 0.08] },
    // Backboard shooter's square + outer border (crisp white target box on frosted glass)
    { position: [0, 3.24, -0.295], scale: [0.62, 0.04, 0.02] },
    { position: [0, 2.86, -0.295], scale: [0.62, 0.04, 0.02] },
    { position: [-0.3, 3.05, -0.295], scale: [0.04, 0.42, 0.02] },
    { position: [0.3, 3.05, -0.295], scale: [0.04, 0.42, 0.02] },
    { position: [0, 3.84, -0.295], scale: [1.82, 0.04, 0.02] },
    { position: [0, 2.78, -0.295], scale: [1.82, 0.04, 0.02] },
    { position: [-0.9, 3.31, -0.295], scale: [0.04, 1.08, 0.02] },
    { position: [0.9, 3.31, -0.295], scale: [0.04, 1.08, 0.02] }
  ];
  return lines;
}

function buildCourtCyanArcTransforms() {
  // Glowing cyan 3-point arc segments & free-throw semicircle accents
  const lines: { position: [number, number, number]; rotation?: [number, number, number]; scale: [number, number, number] }[] = [];
  const arcSegments = 11;
  const radius = 6.55;
  for (let i = 0; i < arcSegments; i += 1) {
    const a0 = -Math.PI * 0.42 + (i / arcSegments) * (Math.PI * 0.84);
    const a1 = -Math.PI * 0.42 + ((i + 1) / arcSegments) * (Math.PI * 0.84);
    const mid = (a0 + a1) * 0.5;
    const segLen = radius * (a1 - a0);
    lines.push({
      position: [Math.sin(mid) * radius, 0.033, Math.cos(mid) * radius],
      rotation: [0, mid + Math.PI * 0.5, 0],
      scale: [segLen, 0.012, 0.085]
    });
  }
  const ftSegments = 7;
  const ftRadius = 1.8;
  for (let i = 0; i < ftSegments; i += 1) {
    const a0 = -Math.PI * 0.5 + (i / ftSegments) * Math.PI;
    const a1 = -Math.PI * 0.5 + ((i + 1) / ftSegments) * Math.PI;
    const mid = (a0 + a1) * 0.5;
    const segLen = ftRadius * (a1 - a0);
    lines.push({
      position: [Math.sin(mid) * ftRadius, 0.033, 4.6 + Math.cos(mid) * ftRadius],
      rotation: [0, mid + Math.PI * 0.5, 0],
      scale: [segLen, 0.012, 0.065]
    });
  }
  return lines;
}

function buildCharcoalBleacherTransforms() {
  return [
    // Dark charcoal tiered bleachers behind baseline and along both sidelines
    { position: [0, 0.32, -2.35] as [number, number, number], scale: [14.2, 0.52, 0.72] as [number, number, number] },
    { position: [0, 0.78, -2.85] as [number, number, number], scale: [14.2, 0.52, 0.72] as [number, number, number] },
    { position: [0, 1.24, -3.35] as [number, number, number], scale: [14.2, 0.52, 0.72] as [number, number, number] },
    { position: [-8.55, 0.36, 3.2] as [number, number, number], scale: [0.95, 0.65, 11.2] as [number, number, number] },
    { position: [8.55, 0.36, 3.2] as [number, number, number], scale: [0.95, 0.65, 11.2] as [number, number, number] }
  ];
}

function buildStanchionAndParapetTransforms() {
  return [
    // Hoop stanchion post, angled neck, and base counterweight
    { position: [0, 1.65, -1.18] as [number, number, number], scale: [0.22, 3.3, 0.22] as [number, number, number] },
    { position: [0, 3.2, -0.76] as [number, number, number], scale: [0.18, 0.18, 0.86] as [number, number, number] },
    { position: [0, 0.35, -1.55] as [number, number, number], scale: [0.85, 0.7, 1.1] as [number, number, number] },
    // Rooftop perimeter parapet coping & water-tower steel legs
    { position: [0, 0.45, -4.2] as [number, number, number], scale: [17.2, 0.9, 0.45] as [number, number, number] },
    { position: [-8.4, 0.45, 4.0] as [number, number, number], scale: [0.45, 0.9, 16.4] as [number, number, number] },
    { position: [8.4, 0.45, 4.0] as [number, number, number], scale: [0.45, 0.9, 16.4] as [number, number, number] },
    { position: [-10.5, 2.2, -9.5] as [number, number, number], scale: [0.22, 4.4, 0.22] as [number, number, number] },
    { position: [-8.5, 2.2, -9.5] as [number, number, number], scale: [0.22, 4.4, 0.22] as [number, number, number] },
    { position: [-9.5, 2.2, -10.8] as [number, number, number], scale: [0.22, 4.4, 0.22] as [number, number, number] }
  ];
}

function buildSkylineAndWaterTowerTransforms() {
  return [
    // Rooftop water tower barrel + cap at (-9.5, 5.4, -10.0)
    { position: [-9.5, 5.4, -10.0] as [number, number, number], scale: [2.6, 2.8, 2.6] as [number, number, number] },
    { position: [-9.5, 7.1, -10.0] as [number, number, number], scale: [1.8, 0.7, 1.8] as [number, number, number] },
    // Dark slate/navy urban skyline high-rise towers across the horizon
    ...Array.from({ length: 10 }, (_, i) => ({
      position: [-34 + i * 7.6, 6.5 + ((i * 5) % 4) * 3.2, -28 - (i % 3) * 4.5] as [number, number, number],
      scale: [4.8, 15 + ((i * 3) % 5) * 4.2, 4.8] as [number, number, number]
    }))
  ];
}

function buildSkylineWindowTransforms(parity: 0 | 1) {
  const windows: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < 10; i += 1) {
    if (i % 2 !== parity) continue;
    const tx = -34 + i * 7.6;
    const tz = -28 - (i % 3) * 4.5 + 2.45;
    for (let row = 0; row < 4; row += 1) {
      windows.push({
        position: [tx - 0.9, 4.2 + row * 2.4, tz],
        scale: [1.1, 0.42, 0.08]
      });
      windows.push({
        position: [tx + 0.9, 5.1 + row * 2.4, tz],
        scale: [1.1, 0.42, 0.08]
      });
    }
  }
  return windows;
}

function buildScene() {
  const spot = COURT_SPOTS[spotIndex]!;
  const nodes: AuraNodeInput[] = [
    // Consolidated rooftop venue & bleachers (role: primaryWorld merges 203 static meshes -> 10 draw calls;
    // scaleMode: world preserves true 19.26m x 17.21m dimensions with internal court slab at z=[ -3..11 ], y=0).
    model(assets.rooftopCourt, {
      name: "rooftop court",
      role: "primaryWorld",
      scaleMode: "world",
      castShadow: false,
      receiveShadow: true
    }).position(0, 0, 0),
    // Rich dark hardwood playing surface + espresso painted key lane
    primitives.box({
      name: "rooftop court surface deck",
      material: COURT_DECK_MAT,
      castShadow: false,
      receiveShadow: true
    })
      .position(0, 0.012, 4.2)
      .scale([15.6, 0.024, 11.6]),
    primitives.box({
      name: "rooftop court key paint lane",
      material: COURT_PAINT_LANE_MAT,
      castShadow: false,
      receiveShadow: true
    })
      .position(0, 0.025, 1.85)
      .scale([3.6, 0.008, 5.5]),
    instances.box({
      name: "court key and boundary markings",
      material: COURT_LINE_MAT,
      castShadow: false,
      receiveShadow: true,
      transforms: buildCourtMarkingsTransforms()
    }),
    instances.box({
      name: "court cyan three-point arc",
      material: COURT_ACCENT_LINE_MAT,
      castShadow: false,
      receiveShadow: false,
      transforms: buildCourtCyanArcTransforms()
    }),
    instances.box({
      name: "dark charcoal bleachers",
      material: BLEACHER_CHARCOAL_MAT,
      castShadow: false,
      receiveShadow: true,
      transforms: buildCharcoalBleacherTransforms()
    }),
    // Tempered frosted-glass backboard + brushed-metal stanchion + car-paint orange rim
    model(assets.rooftopBackboard, {
      name: "backboard",
      role: "primaryWorld",
      scaleMode: "world",
      material: BACKBOARD_GLASS_MAT,
      castShadow: true,
      receiveShadow: true
    }).position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z),
    primitives.box({
      name: "tempered glass backboard panel",
      material: BACKBOARD_GLASS_MAT,
      castShadow: false,
      receiveShadow: true
    })
      .position(BACKBOARD_POSITION.x, BACKBOARD_POSITION.y, BACKBOARD_POSITION.z + 0.02)
      .scale([BACKBOARD_POSITION.width, BACKBOARD_POSITION.height, 0.03]),
    instances.box({
      name: "hoop stanchion and rooftop parapet",
      material: STANCHION_METAL_MAT,
      castShadow: false,
      receiveShadow: true,
      transforms: buildStanchionAndParapetTransforms()
    }),
    instances.box({
      name: "rooftop water tower and slate skyline",
      material: SKYLINE_SLATE_MAT,
      castShadow: false,
      receiveShadow: false,
      transforms: buildSkylineAndWaterTowerTransforms()
    }),
    instances.box({
      name: "skyline warm window bands",
      material: SKYLINE_WINDOW_WARM_MAT,
      castShadow: false,
      receiveShadow: false,
      transforms: buildSkylineWindowTransforms(0)
    }),
    instances.box({
      name: "skyline cyan window bands",
      material: SKYLINE_WINDOW_CYAN_MAT,
      castShadow: false,
      receiveShadow: false,
      transforms: buildSkylineWindowTransforms(1)
    }),
    model(assets.rooftopRim, {
      name: "rim",
      role: "primaryWorld",
      scaleMode: "world",
      material: RIM_PAINT_MAT,
      castShadow: true,
      receiveShadow: false
    }).position(HOOP_BASE_POSITION.x, HOOP_BASE_POSITION.y, HOOP_BASE_POSITION.z),
    // Pebbled rubber streetball (0.24 m regulation diameter)
    model(assets.rooftopBall, {
      name: "basketball",
      role: "primaryCharacter",
      scaleMode: "world",
      material: BASKETBALL_RUBBER_MAT,
      castShadow: true,
      receiveShadow: true
    })
      .position(spot.x, 1.42, spot.z - 0.34)
      .scale(BALL_SCALE)
      .runtime(game.runtimeNode("ball", { tags: ["basketball", "runtime"] })),
    // Grounded 1.86 m shooter & defender in world scale, posed via setAnimationPose
    model(assets.rooftopLayupScorer, {
      name: "shooter",
      role: "primaryCharacter",
      scaleMode: "world",
      hiddenNodeNames: ATHLETE_HIDDEN_SUBMESHES,
      castShadow: false,
      receiveShadow: true
    })
      .position(spot.x, ATHLETE_FLOOR_OFFSET, spot.z)
      .scale(ATHLETE_SCALE)
      .rotate(0, Math.PI, 0)
      .runtime(game.runtimeNode("shooter", { tags: ["shooter", "runtime"] })),
    model(assets.rooftopDefender, {
      name: "defender",
      role: "primaryCharacter",
      scaleMode: "world",
      hiddenNodeNames: ATHLETE_HIDDEN_SUBMESHES,
      castShadow: false,
      receiveShadow: true
    })
      .position(-1.55, ATHLETE_FLOOR_OFFSET, 2.1)
      .scale(ATHLETE_SCALE)
      .runtime(game.runtimeNode("defender", { tags: ["defender", "runtime"] })),
    ...Array.from({ length: AIM_DOTS }, (_, i) =>
      model(assets.rooftopBall, {
        name: `aim guide dot ${i}`,
        scaleMode: "world",
        material: AIM_DOT_MAT,
        castShadow: false,
        receiveShadow: false
      })
        .position(0, -50, 0)
        .scale(0.055)
        .runtime(game.runtimeNode(`aim-dot-${i}`, { tags: ["aim-guide", "runtime"] }))
    ),
    // Two non-shadowed practical lights (permitted by art/direction.ts practicals: 2)
    // to balance the golden-hour key with cool stadium sky fill and overhead court light.
    lights
      .directional({
        name: "dusk stadium cool fill",
        color: "#bae6fd",
        intensity: 1.35,
        position: [-14, 18, 14],
        target: [0, 1.5, 2],
        shadow: false
      })
      .toJSON(),
    lights
      .point({
        name: "court overhead floodlight",
        color: "#f8fafc",
        intensity: 2.2,
        position: [0, 7.5, 2.5],
        distance: 24,
        shadow: false
      })
      .toJSON()
  ];

  return scene()
    .background("#0f172a")
    .add(
      looks.preset(LOOK_ID, {
        fogDensityScale: 0.04,
        background: "#0f172a",
        accent: "#38bdf8",
        exposureEv: -0.05,
        sun: { elevationDeg: 32, azimuthDeg: 35 }
      })
    )
    .addMany(nodes)
    .camera(camera.perspective({ position: [...CAMERA_POSITION], target: [...CAMERA_TARGET], fov: CAMERA_FOV }));
}

function syncNodes(): void {
  const spot = COURT_SPOTS[spotIndex]!;
  const dx = HOOP_BASE_POSITION.x - spot.x;
  const dz = HOOP_BASE_POSITION.z - spot.z;
  const dist = Math.hypot(dx, dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  // Local +Z is the character's forward axis; Math.atan2(dx, dz) rotates +Z
  // to face the hoop (Math.PI at the free-throw line).
  const yaw = Math.atan2(dx, dz);
  shooterNode.setPosition(spot.x, ATHLETE_FLOOR_OFFSET, spot.z).setRotation(0, yaw, 0);

  const shooterPoseKey: "ready" | "load" | "follow" = ballState.inFlight
    ? "follow"
    : charge.charging
      ? "load"
      : "ready";
  if (shooterPoseKey !== lastShooterPoseKey) {
    lastShooterPoseKey = shooterPoseKey;
    shooterNode.setAnimationPose(SHOOTER_POSES[shooterPoseKey]);
  }

  // While parked, place the visual basketball directly in the shooter's hands;
  // once launched, follow the Rapier solver trajectory.
  if (ballState.inFlight) {
    ballNode.setPosition(ballState.x, ballState.y, ballState.z);
  } else {
    const handLift = charge.charging ? 0.2 + charge.power * 0.16 : 0;
    const handForward = charge.charging ? 0.28 : 0.32;
    ballNode.setPosition(spot.x + nx * handForward, 1.38 + handLift, spot.z + nz * handForward);
  }

  // Keep the defender visible on court at all times: actively contesting in the
  // lane during Heat 3, and guarding the weak-side paint block in open heats.
  const defX = hoopState.defenderActive ? hoopState.defenderX : -1.65;
  const defY = hoopState.defenderActive
    ? ATHLETE_FLOOR_OFFSET + Math.max(0, hoopState.defenderY - 0.9)
    : ATHLETE_FLOOR_OFFSET;
  const defZ = hoopState.defenderActive ? hoopState.defenderZ : 2.1;
  const defYaw = Math.atan2(spot.x - defX, spot.z - defZ);
  defenderNode.setVisible(true).setPosition(defX, defY, defZ).setRotation(0, defYaw, 0);
  const defenderPoseKey: "stance" | "contest" =
    hoopState.defenderActive && hoopState.defenderTelegraph === "contest" ? "contest" : "stance";
  if (defenderPoseKey !== lastDefenderPoseKey) {
    lastDefenderPoseKey = defenderPoseKey;
    defenderNode.setAnimationPose(DEFENDER_POSES[defenderPoseKey]);
  }

  syncAimGuide();
}

function syncAimGuide(): void {
  if (ballState.inFlight || scoreState.state !== "playing") {
    aimNodes.forEach((node) => node.setVisible(false));
    return;
  }
  const spot = COURT_SPOTS[spotIndex]!;
  const power = charge.charging ? charge.power : spot.sweetPower;
  const key = `${spotIndex}|${Math.round(power * 50)}|${Math.round(charge.pitch * 20)}|${scoreState.heat}`;
  if (key !== aimCacheKey) {
    aimCacheKey = key;
    aimPoints = predictFirstFlight(spot, power, charge.pitch, hoopState, 48, 8);
  }
  aimNodes.forEach((node, i) => {
    const point = aimPoints[i + 1];
    if (!point) {
      node.setVisible(false);
      return;
    }
    node.setVisible(true).setPosition(point.x, point.y, point.z);
  });
}

// -------------------------------------------------------------------- HUD ----

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "rooftop-buckets-hud";
  root.style.cssText = [
    "position:fixed",
    "left:14px",
    "bottom:14px",
    "z-index:5",
    "max-width:280px",
    "font:500 11px/1.35 system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(10,14,26,0.78)",
    "border:1px solid rgba(56,189,248,0.34)",
    "border-radius:8px",
    "padding:8px 10px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  const spot = COURT_SPOTS[spotIndex]!;
  const clockCeil = Math.max(0, Math.ceil(scoreState.shotClock));
  const clockTenth = Math.max(0, Math.round(scoreState.shotClock * 5) / 5).toFixed(1);
  const heatCeil = Math.max(0, Math.ceil(scoreState.heatTimer));
  const chargePct = Math.round(charge.power * 100);
  const sig = `${scoreState.heat}|${scoreState.score}|${scoreState.target}|${scoreState.streak}|${scoreState.onFire}|${spot.id}|${scoreState.makes}|${scoreState.misses}|${clockTenth}|${heatCeil}|${chargePct}|${paused}|${objective}`;
  if (sig === lastHudSignature) return;
  lastHudSignature = sig;

  bucketsGame.hud.set("score", scoreState.score);
  bucketsGame.hud.set("clock", clockCeil);
  bucketsGame.hud.set("heat", `HEAT ${scoreState.heat}`);
  bucketsGame.hud.set("charge", chargePct);
  bucketsGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Rooftop Buckets</strong>`,
    `<div>Heat ${scoreState.heat} ${heatConfig(scoreState.heat).name} | Score ${scoreState.score}/${scoreState.target} | Streak ${scoreState.streak}${scoreState.onFire ? " ON FIRE" : ""}</div>`,
    `<div>${spot.name} | Makes ${scoreState.makes} Misses ${scoreState.misses} | Clock ${clockTenth}s | Heat ${heatCeil}s</div>`,
    `<div>${paused ? "Paused. " : ""}${objective}</div>`,
    `<div>A/D spot. W/S arc. Hold+release Space shoot. P pause. R reset.</div>`
  ].join("");
}

// --------------------------------------------------------------- evidence ----

function publishEvidence(): void {
  const spot = COURT_SPOTS[spotIndex]!;
  const eventLabels = routeEvents.events().map((event: { readonly label: string }) => event.label);
  const evKey = `${scoreState.score}|${objective}|${eventLabels.length}|${eventLabels[eventLabels.length - 1] ?? ""}`;
  if (evKey !== cachedEvidenceKey || cachedRuntimeEvidence === null) {
    cachedEvidenceKey = evKey;
    cachedRuntimeEvidence = app.evidence({
      input,
      events: routeEvents,
      hud: hudBindings,
      appState: {
        score: scoreState.score,
        objective,
        events: eventLabels
      },
      assets: {
        typedAssets: Object.keys(assets).length,
        missingAssets: []
      },
      source: { expectsGame: true }
    });
  }
  if (cachedDrawCalls === 0 || frameCounter % 15 === 0) {
    cachedDrawCalls = app.diagnostics().drawCalls;
  }
  const snapshot: RooftopBucketsEvidence = {
    framed: cachedDrawCalls > 0,
    state: paused ? "paused-local" : scoreState.state,
    heat: scoreState.heat,
    heatName: heatConfig(scoreState.heat).name,
    score: scoreState.score,
    target: scoreState.target,
    streak: scoreState.streak,
    onFire: scoreState.onFire,
    shots: scoreState.makes + scoreState.misses,
    makes: scoreState.makes,
    misses: scoreState.misses,
    madeSpotIds: scoreState.madeSpotIds,
    shotClock: scoreState.shotClock,
    heatTimer: scoreState.heatTimer,
    spot: { id: spot.id, name: spot.name, points: spot.points },
    charge: { power: charge.power, pitch: charge.pitch, charging: charge.charging },
    ball: {
      inFlight: ballState.inFlight,
      settled: ballState.settled,
      hasScored: ballState.hasScored,
      result: ballState.result,
      position: [ballState.x, ballState.y, ballState.z]
    },
    lastResult: scoreState.lastShotResult,
    events: eventLabels,
    look: { id: LOOK_ID, category: "outdoor" },
    drawCalls: cachedDrawCalls,
    audio: audioEvidence(),
    evidence: cachedRuntimeEvidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

function audioEvidence(): RooftopBucketsEvidence["audio"] {
  const sound = bucketsGame.sound?.evidence;
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

