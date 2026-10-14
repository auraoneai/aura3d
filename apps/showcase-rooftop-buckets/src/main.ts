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
const COURT_DECK_MAT = material.reflectiveFloor({
  name: "rooftop acrylic court deck",
  color: "#1e293b",
  roughness: 0.22,
  clearcoat: 0.65
});
const COURT_LINE_MAT = material.clearcoatPaint({
  name: "rooftop court markings",
  color: "#ea580c",
  roughness: 0.18
});
const BACKBOARD_GLASS_MAT = material.frostedGlass({
  name: "tempered glass backboard",
  color: "#e2e8f0",
  opacity: 0.55
});
const STANCHION_METAL_MAT = material.brushedMetal({
  name: "hoop stanchion and rooftop steel",
  color: "#cbd5e1",
  roughness: 0.28
});
const RIM_PAINT_MAT = material.carPaint({
  name: "breakaway orange rim",
  color: "#f97316",
  roughness: 0.24
});
const BASKETBALL_RUBBER_MAT = material.blackRubber({
  name: "pebbled streetball leather",
  color: "#ea580c",
  roughness: 0.78
});
const SKYLINE_LACQUER_MAT = material.lacquer({
  name: "dusk skyline and water tower",
  color: "#2e3b52",
  roughness: 0.36
});
const AIM_DOT_MAT = material.clearcoatPaint({
  name: "shot arc guide dot",
  color: "#ffd24d",
  roughness: 0.2
});

// Authored basketball poses applied over the CC_Base humanoid rig so the
// athletes hold/load/follow-through the ball and guard the paint rather than
// remaining in bind T-pose.
const SHOOTER_POSES: Record<"ready" | "load" | "follow", { bones: Record<string, { rotation: [number, number, number, number] }> }> = {
  ready: {
    bones: {
      CC_Base_L_Upperarm_050: { rotation: [0.4082, -0.1269, -0.5207, 0.739] },
      CC_Base_R_Upperarm_074: { rotation: [0.4081, 0.1269, 0.5207, 0.739] },
      CC_Base_L_Forearm_051: { rotation: [0.5896, 0.1376, -0.1638, 0.7788] },
      CC_Base_R_Forearm_077: { rotation: [0.5896, -0.1376, 0.1638, 0.7788] }
    }
  },
  load: {
    bones: {
      CC_Base_L_Upperarm_050: { rotation: [0.6123, -0.1399, -0.2923, 0.7212] },
      CC_Base_R_Upperarm_074: { rotation: [0.6309, 0.1475, 0.2886, 0.7049] },
      CC_Base_L_Forearm_051: { rotation: [0.7073, 0.1979, -0.1685, 0.6574] },
      CC_Base_R_Forearm_077: { rotation: [0.7242, -0.2026, 0.1637, 0.6386] }
    }
  },
  follow: {
    bones: {
      CC_Base_L_Upperarm_050: { rotation: [0.6967, -0.1023, -0.1693, 0.6896] },
      CC_Base_R_Upperarm_074: { rotation: [0.7377, -0.1543, -0.2303, 0.6156] },
      CC_Base_L_Forearm_051: { rotation: [0.4535, 0.0648, -0.1064, 0.8825] },
      CC_Base_R_Forearm_077: { rotation: [0.1001, -0.0082, 0.0585, 0.9932] }
    }
  }
};

const DEFENDER_POSES: Record<"stance" | "contest", { bones: Record<string, { rotation: [number, number, number, number] }> }> = {
  stance: {
    bones: {
      CC_Base_L_Upperarm_050: { rotation: [0.3582, -0.0336, -0.2636, 0.895] },
      CC_Base_R_Upperarm_074: { rotation: [0.3582, 0.0336, 0.2636, 0.895] },
      CC_Base_L_Forearm_051: { rotation: [0.4029, 0.0045, 0.01, 0.9152] },
      CC_Base_R_Forearm_077: { rotation: [0.4029, -0.0045, -0.01, 0.9152] }
    }
  },
  contest: {
    bones: {
      CC_Base_L_Upperarm_050: { rotation: [0.6967, -0.1023, -0.1693, 0.6896] },
      CC_Base_R_Upperarm_074: { rotation: [0.7377, -0.1543, -0.2303, 0.6156] },
      CC_Base_L_Forearm_051: { rotation: [0.18, 0.02, -0.05, 0.982] },
      CC_Base_R_Forearm_077: { rotation: [0.1001, -0.0082, 0.0585, 0.9932] }
    }
  }
};

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
    ]
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
  // Key / paint lane, free-throw line, baseline, sidelines, and 8-segment 3pt arc
  const lines: { position: [number, number, number]; rotation?: [number, number, number]; scale: [number, number, number] }[] = [
    // Baseline & sidelines
    { position: [0, 0.008, -0.9], scale: [14.4, 0.012, 0.09] },
    { position: [-7.2, 0.008, 4.4], scale: [0.09, 0.012, 10.6] },
    { position: [7.2, 0.008, 4.4], scale: [0.09, 0.012, 10.6] },
    // Paint / key lane (width 3.6m,baseline z=-0.9 to free-throw line z=4.6)
    { position: [-1.8, 0.008, 1.85], scale: [0.08, 0.012, 5.5] },
    { position: [1.8, 0.008, 1.85], scale: [0.08, 0.012, 5.5] },
    { position: [0, 0.008, 4.6], scale: [3.68, 0.012, 0.08] },
    // Backboard shooter's square (white/orange target box on glass)
    { position: [0, 3.24, -0.31], scale: [0.62, 0.04, 0.02] },
    { position: [0, 2.86, -0.31], scale: [0.62, 0.04, 0.02] },
    { position: [-0.3, 3.05, -0.31], scale: [0.04, 0.42, 0.02] },
    { position: [0.3, 3.05, -0.31], scale: [0.04, 0.42, 0.02] }
  ];
  // 3-point arc segments (radius 6.6m around hoop [0, 0])
  const arcSegments = 9;
  const radius = 6.55;
  for (let i = 0; i < arcSegments; i += 1) {
    const a0 = -Math.PI * 0.4 + (i / arcSegments) * (Math.PI * 0.8);
    const a1 = -Math.PI * 0.4 + ((i + 1) / arcSegments) * (Math.PI * 0.8);
    const mid = (a0 + a1) * 0.5;
    const segLen = radius * (a1 - a0);
    lines.push({
      position: [Math.sin(mid) * radius, 0.008, Math.cos(mid) * radius],
      rotation: [0, mid + Math.PI * 0.5, 0],
      scale: [segLen, 0.012, 0.08]
    });
  }
  return lines;
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
    // Sunset skyline high-rise silhouettes across the horizon
    ...Array.from({ length: 8 }, (_, i) => ({
      position: [-30 + i * 8.6, 5.5 + ((i * 5) % 4) * 2.8, -32 - (i % 3) * 5] as [number, number, number],
      scale: [4.6, 12 + ((i * 3) % 5) * 3.6, 4.6] as [number, number, number]
    }))
  ];
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
    // Reflective hardwood/acrylic rooftop playing surface + clearcoat painted key & 3pt arc
    primitives.box({
      name: "rooftop court surface deck",
      material: COURT_DECK_MAT,
      castShadow: false,
      receiveShadow: true
    })
      .position(0, -0.008, 4.2)
      .scale([15.6, 0.016, 11.6]),
    instances.box({
      name: "court key and three-point markings",
      material: COURT_LINE_MAT,
      castShadow: false,
      receiveShadow: true,
      transforms: buildCourtMarkingsTransforms()
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
      name: "rooftop water tower and sunset skyline",
      material: SKYLINE_LACQUER_MAT,
      castShadow: false,
      receiveShadow: false,
      transforms: buildSkylineAndWaterTowerTransforms()
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
    // Grounded 1.86 m shooter & defender in world scale
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
      .animate({ clip: "Ready", loop: true, speed: 1 })
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
      .animate({ clip: "Plant", loop: true, speed: 1 })
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
    )
  ];

  return scene()
    .add(looks.preset(LOOK_ID))
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

  const shooterClip = ballState.inFlight
    ? "FollowThrough"
    : charge.charging
      ? "Load"
      : "Ready";
  if (shooterClip !== lastShooterPoseKey) {
    lastShooterPoseKey = shooterClip;
    shooterNode.play?.(shooterClip, { loop: true, speed: 1 });
  }

  // While parked, place the visual basketball directly in the shooter's hands;
  // once launched, follow the Rapier solver trajectory.
  if (ballState.inFlight) {
    ballNode.setPosition(ballState.x, ballState.y, ballState.z);
  } else {
    const handLift = charge.charging ? 0.14 + charge.power * 0.22 : 0;
    const handForward = charge.charging ? 0.26 : 0.33;
    ballNode.setPosition(spot.x + nx * handForward, 1.38 + handLift, spot.z + nz * handForward);
  }

  // Show the perimeter defender actively contesting in Heat 3 (hide in open shooting heats).
  if (hoopState.defenderActive) {
    const defX = hoopState.defenderX;
    const defY = ATHLETE_FLOOR_OFFSET + Math.max(0, hoopState.defenderY - 0.9);
    const defZ = hoopState.defenderZ;
    const defYaw = Math.atan2(spot.x - defX, spot.z - defZ);
    defenderNode.setVisible(true).setPosition(defX, defY, defZ).setRotation(0, defYaw, 0);
    const defenderClip = hoopState.defenderTelegraph === "contest" ? "Contest" : "Plant";
    if (defenderClip !== lastDefenderPoseKey) {
      lastDefenderPoseKey = defenderClip;
      defenderNode.play?.(defenderClip, { loop: true, speed: 1 });
    }
  } else {
    defenderNode.setVisible(false);
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
    "position:absolute",
    "left:16px",
    "top:56px",
    "z-index:5",
    "min-width:330px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(10,14,26,0.72)",
    "border:1px solid rgba(255,210,77,0.34)",
    "border-radius:8px",
    "padding:12px",
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

