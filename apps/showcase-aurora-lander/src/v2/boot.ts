// apps/showcase-aurora-lander/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.12 "night landing on an icy moon under a moving aurora": the authored
// deterministic lander sim (stepLander) drives a real Rapier contact proxy
// over the static heightfield + pad sensors; the BVH surface query grades
// attitude/slope at touchdown. One scene holds all three sites — loadSite
// re-shows node groups instead of swapping scenes (loading.sceneSwaps = 0, a
// §7.2.1 contract). Gameplay modules (lander/terrain/sites/touchdown/
// prediction/ghost) are unchanged; audio plays through the legacy cue
// controller until C-25 lands (standIn R-14-15).
import { game as engineGame, createMeshSurfaceQuery, scene, type AuraCameraPose, type GameInputController, type MeshSurfaceQuery, type SurfaceSample } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { SITES, campaignScore, type LanderSite } from "../gameplay/sites";
import { sampleGridHeight, type TerrainField } from "../gameplay/terrain";
import {
  createLanderState,
  gustForceAt,
  gustTelegraphActive,
  hspeedOf,
  stepLander,
  type Controls,
  type LanderState
} from "../gameplay/lander";
import {
  LANDER_MAX_HULL,
  gradeTouchdown,
  hullAfterTouchdown,
  scoreTouchdown,
  type LandingGrade
} from "../gameplay/touchdown";
import { predictLanding, type LandingPrediction } from "../gameplay/prediction";
import {
  createGhostPlayback,
  exportBestRun,
  importBestRun,
  loadBestRunRaw,
  saveBestRun,
  trajectoryHash,
  type GhostSample
} from "../gameplay/ghost";
import { createLanderAudio, type LanderAudioCue } from "../legacy/lander-audio";
import direction from "../../art/direction";
import { auroraWorldNodes, siteGroupNames, EXTRACTION_INFRASTRUCTURE } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createAuroraRig, fallbackCameraNode } from "./scene/camera";
import { wireAuroraFx } from "./scene/fx";
import { NIGHT_BG } from "./scene/materials";
import { publishAuroraEvidence, type AuroraRunSnapshot } from "../evidence";
import { applyAuroraScenario } from "../scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_AURORA_LANDER" as const;
const FIXED_DT = 1 / 60;
const PLAYER_MAX_CATCHUP_SECONDS = 0.5;
const MAX_SUBSTEPS = 40;
const FOOT_DROP = 0.72;
const CONTACT_PROXY_RADIUS = 0.42;
const APPROACH_SCAFFOLD_MIN_AGL = 28;
const RECORDED_BINDINGS = new Set(["KeyW", "ArrowUp", "KeyA", "ArrowLeft", "KeyD", "ArrowRight", "thrust"]);

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const autopilotRequested = routeParams.get("autorun") === "1";
const approachSpawnRequested = routeParams.get("approach") === "1";

type Phase = "flying" | "landed" | "crashed" | "campaign-clear";

// ------------------------------------------------------------ sim state -----

let siteIndex = 0;
let phase: Phase = "flying";
let paused = false;
let state: LanderState = createLanderState(SITES[0]!.spawn, SITES[0]!.fuelBudget);
let previousControls: Controls = { thrust: 0, rotate: 0 };
let siteScores: number[] = [];
let campaignHull = LANDER_MAX_HULL;
let lastGrade: LandingGrade | null = null;
let crashReason = "";
let ghostVisible = true;
let ghostActive = false;
let ghostReplayHash: string | null = null;
let attemptSamples: GhostSample[] = [];
let accumulator = 0;
let frame = 0;
let simSeconds = 0;
let contactEventsSeen = 0;
let contactQueryAgreement: boolean | null = null;
let padSensorArmed = false;
let fuelLowCueFired = false;
let gustWarnCueFiredForCycle = false;
let thrustLoopActive = false;
let rcsPuffArmed = true;
let advanceTimer = -1;
let bestScoreThisSite = 0;
let crashDebris: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
let shockwaveAge = -1;
let latestPrediction: LandingPrediction | null = null;
let autopilotEnabled = autopilotRequested;
let approachSpawnEnabled = approachSpawnRequested;
const sceneSwaps = 0;
const bootedAtMs = performance.now();

const world = auroraWorldNodes();

function buildScene() {
  return scene()
    .background(NIGHT_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ------------------------------------------------------------------ audio ---

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;

const audio = createLanderAudio(reducedMotion);
const audioCueLog: string[] = [];
function pushCue(cue: LanderAudioCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue).catch(() => undefined);
}
let audioUnlocked = false;
const unlockAudio = () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  void audio.unlock().then(() => pushCue("ambient-wind")).catch(() => undefined);
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-aurora-lander",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "site", kind: "label", anchor: "top", label: "SITE" },
      { id: "telemetry", kind: "label", anchor: "top-right", label: "TELEMETRY" },
      { id: "fuel", kind: "label", anchor: "top-left", label: "FUEL" },
      { id: "hull", kind: "label", anchor: "bottom-left", label: "HULL" },
      { id: "score", kind: "score", anchor: "bottom-right", label: "SCORE" },
      { id: "message", kind: "label", anchor: "bottom", label: "STATUS" }
    ]
  },
  touch: {
    preset: "dpad-4btn",
    bindings: { rotate: "dpad", thrust: "btn-a", ghost: "btn-x", restart: "btn-y", pause: "menu" }
  },
  sound: {
    cues: {
      "thrust-loop": { asset: "auroraThrustLoopSfx" },
      "rcs-puff": { asset: "auroraRcsPuffSfx" },
      "pad-lock": { asset: "auroraPadLockSfx" },
      "fuel-low": { asset: "auroraFuelLowSfx" },
      "gust-warn": { asset: "auroraGustWarnSfx" },
      "touch-soft": { asset: "auroraTouchSoftSfx" },
      "touch-hard": { asset: "auroraTouchHardSfx" },
      "crash": { asset: "auroraCrashSfx" },
      "site-clear": { asset: "auroraSiteClearSfx" },
      "ambient-wind": { asset: "auroraAmbientWindSfx" }
    }
  },
  juice: {
    "touch-soft": { hitStopMs: 30, trauma: 0.12 },
    "touch-hard": { hitStopMs: 40, trauma: 0.22 },
    "crash": { hitStopMs: 60, trauma: 0.34 },
    "site-clear": { trauma: 0.18 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_aurora_lander` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-aurora-lander`).
    flags: ["route_aurora_lander", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireAuroraFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

const rigState = {
  x: state.x,
  y: state.y,
  z: state.z,
  agl: state.y,
  padX: SITES[0]!.pads[0]!.x,
  padY: 0,
  padZ: SITES[0]!.pads[0]!.z
};


// ------------------------------------------------------------ collision -----

interface CollisionHandles {
  terrainId: string;
  sensorIds: string[];
  proxyId: string;
}
let collisions: CollisionHandles | undefined;
const collisionWorld = engineGame.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });
let surfaceQuery: MeshSurfaceQuery | undefined;
let field: TerrainField | undefined = world.fields[0];
let currentSite: LanderSite = SITES[0]!;
const siteQueries = world.fields.map((entry) =>
  createMeshSurfaceQuery({ positions: entry.queryPositions, indices: entry.queryIndices })
);

function rebuildCollisions(): void {
  if (!field) throw new Error("Terrain field missing before collision rebuild.");
  collisionWorld.clear();
  const terrainBody = collisionWorld.add({
    id: "site-terrain-heightfield",
    type: "static",
    shape: field.colliderShape
  });
  const sensorIds: string[] = [];
  currentSite.pads.forEach((pad, index) => {
    const padHeight = field!.padHeights[index] ?? 0;
    const sensor = collisionWorld.add({
      id: `pad-sensor-${index + 1}`,
      type: "static",
      position: [pad.x, padHeight + 1.4, pad.z],
      shape: { kind: "box", halfExtents: [pad.radius, 1.4, pad.radius] },
      sensor: true
    });
    sensorIds.push(sensor.id);
  });
  const proxy = collisionWorld.add({
    id: "lander-contact-proxy",
    type: "dynamic",
    position: [state.x, state.y - FOOT_DROP, state.z],
    shape: { kind: "sphere", radius: CONTACT_PROXY_RADIUS },
    material: { friction: 0.6, restitution: 0.05 }
  });
  collisions = { terrainId: terrainBody.id, sensorIds, proxyId: proxy.id };
  contactEventsSeen = 0;
  contactQueryAgreement = null;
  padSensorArmed = false;
}

// ------------------------------------------------------------------ input ---

const input: GameInputController = engineGame.input({
  actions: {
    thrust: ["KeyW", "ArrowUp"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    restart: ["KeyR"],
    quickRestart: ["Space"],
    ghostToggle: ["KeyG"],
    pause: ["KeyP"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 80
});

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Preserve the real elapsed duration of held flight controls until the
// fixed-step sim consumes them — a complete key hold can begin and end between
// presented frames on a software renderer.
type TimedFlightControl = "thrust" | "left" | "right";
const timedControlForCode: Readonly<Record<string, TimedFlightControl | undefined>> = {
  KeyW: "thrust", ArrowUp: "thrust",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right"
};
const timedControlStartedAt = new Map<TimedFlightControl, number>();
const timedControlSeconds = new Map<TimedFlightControl, number>();
const addTimedControlSeconds = (control: TimedFlightControl, seconds: number): void => {
  timedControlSeconds.set(control, Math.min(2, (timedControlSeconds.get(control) ?? 0) + Math.max(0, seconds)));
};
const syncTimedFlightControls = (nowMs: number): void => {
  for (const [control, startedAt] of timedControlStartedAt) {
    addTimedControlSeconds(control, (nowMs - startedAt) / 1000);
    timedControlStartedAt.set(control, nowMs);
  }
};
const consumeTimedFlightControl = (control: TimedFlightControl): number => {
  const available = timedControlSeconds.get(control) ?? 0;
  if (available <= 0) return 0;
  const consumed = Math.min(FIXED_DT, available);
  timedControlSeconds.set(control, Math.max(0, available - FIXED_DT));
  return consumed / FIXED_DT;
};
window.addEventListener("keydown", (event) => {
  const control = timedControlForCode[event.code];
  if (!control || event.repeat || timedControlStartedAt.has(control)) return;
  timedControlStartedAt.set(control, performance.now());
});
window.addEventListener("keyup", (event) => {
  const control = timedControlForCode[event.code];
  if (!control) return;
  const startedAt = timedControlStartedAt.get(control);
  if (startedAt !== undefined) addTimedControlSeconds(control, (performance.now() - startedAt) / 1000);
  timedControlStartedAt.delete(control);
});

// Touch: dpad-4btn preset + pointer zones — left/right thirds steer RCS, the
// centre third burns the main engine at a fixed rate. Held states are tracked
// per pointer id so a second finger can join mid-flight.
const touchThrustZone = { left: 0.34, right: 0.66 };
const touchHeld = new Map<number, "thrust" | "left" | "right">();
const touchHoldFor = (clientX: number): "thrust" | "left" | "right" => {
  const w = Math.max(1, target.clientWidth || window.innerWidth);
  const f = clientX / w;
  if (f < touchThrustZone.left) return "left";
  if (f > touchThrustZone.right) return "right";
  return "thrust";
};
target.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
  touchHeld.set(e.pointerId, touchHoldFor(e.clientX));
});
target.addEventListener("pointerup", (e) => { touchHeld.delete(e.pointerId); });
target.addEventListener("pointercancel", (e) => { touchHeld.delete(e.pointerId); });

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// ------------------------------------------------------------- site flow ----

const ghostPlayback = createGhostPlayback();

function spawnStateFor(site: LanderSite): LanderState {
  if (!autopilotEnabled && !approachSpawnEnabled) return createLanderState(site.spawn, site.fuelBudget);
  const pad = site.pads[0]!;
  const padHeight = field?.padHeights[0] ?? 0;
  return createLanderState({ x: pad.x, y: padHeight + 26, z: pad.z }, site.fuelBudget);
}

function setSiteGroupVisible(index: number, visible: boolean): void {
  for (const name of siteGroupNames(SITES[index]!.id)) {
    handle(name)?.setVisible(visible);
  }
}

function resetAttempt(recordGhostStart = true): void {
  phase = "flying";
  paused = false;
  lastGrade = null;
  crashReason = "";
  state = spawnStateFor(currentSite);
  previousControls = { thrust: 0, rotate: 0 };
  accumulator = 0;
  simSeconds = 0;
  latestPrediction = null;
  attemptSamples = [];
  advanceTimer = -1;
  fuelLowCueFired = false;
  crashDebris = [];
  shockwaveAge = -1;
  input.clearReplay();
  timedControlSeconds.clear();
  touchHeld.clear();
  if (recordGhostStart) beginGhostFromBest();
  rebuildCollisions();
  for (const node of ["impact-shockwave", "landing-prediction", "extraction-lander", "extraction-title", "extraction-halo", "extraction-bay-backdrop"]) {
    handle(node)?.setPosition(0, -50, 0).setVisible(false);
  }
  for (let i = 0; i < 10; i += 1) handle(`debris-${i + 1}`)?.setPosition(0, -50, 0).setScale(0.001);
  EXTRACTION_INFRASTRUCTURE.forEach((part) => handle(`extraction-${part.id}`)?.setVisible(false));
}

function loadSite(index: number): void {
  setSiteGroupVisible(siteIndex, false);
  siteIndex = index;
  bestScoreThisSite = 0;
  currentSite = SITES[index]!;
  field = world.fields[index]!;
  surfaceQuery = siteQueries[index];
  setSiteGroupVisible(index, true);
  rigState.padX = currentSite.pads[0]!.x;
  rigState.padY = field.padHeights[0] ?? 0;
  rigState.padZ = currentSite.pads[0]!.z;
  resetAttempt();
}

/** Begin ghost playback from the stored best run for this site, if one exists. */
function beginGhostFromBest(): void {
  ghostActive = false;
  ghostReplayHash = null;
  const ghostNode = handle("lander-ghost");
  const raw = loadBestRunRaw(currentSite.id);
  if (!raw) {
    ghostPlayback.stop();
    ghostNode?.setVisible(false);
    return;
  }
  try {
    const imported = importBestRun(raw);
    ghostPlayback.begin(imported.replay, spawnStateFor(currentSite), currentSite.gust);
    ghostReplayHash = raw.trajectoryHash ?? null;
    ghostActive = true;
    if (ghostVisible) ghostNode?.setVisible(true);
  } catch {
    ghostActive = false;
  }
}

/** Persist a graded landing as the site's best run when it beats the score. */
function maybeRecordBestRun(samples: GhostSample[], grade: LandingGrade, score: number): void {
  if (grade === "crash" || score <= bestScoreThisSite) return;
  bestScoreThisSite = score;
  const events = input
    .recorded()
    .filter((eventItem) => RECORDED_BINDINGS.has(eventItem.binding))
    .map((eventItem) => ({ ...eventItem }));
  const replay = engineGame.inputReplay(events, { fps: 60, seed: 0x5e_ed, label: `aurora-lander-site-${currentSite.id}-best` });
  const attempt = { siteId: currentSite.id, events, samples };
  saveBestRun(currentSite.id, exportBestRun(attempt, replay, grade, score));
}

// ---------------------------------------------------------------- grading ---

interface GradingContext {
  readonly vspeed: number;
  readonly hspeed: number;
  readonly attitudeDeg: number;
  readonly slopeDeg: number;
  readonly insidePadZone: boolean;
  readonly contactX: number;
  readonly contactY: number;
  readonly contactZ: number;
}

function gradeFromContact(context: GradingContext): void {
  const graded = gradeTouchdown({
    vspeed: context.vspeed,
    hspeed: context.hspeed,
    attitudeDeg: context.attitudeDeg,
    insidePadZone: context.insidePadZone,
    slopeDeg: context.slopeDeg
  });
  lastGrade = graded.grade;
  crashReason = graded.crashReason;
  campaignHull = hullAfterTouchdown(campaignHull, graded.grade);

  if (graded.grade === "crash") {
    phase = "crashed";
    pushCue("crash");
    fx.crash(context.contactX, context.contactY, context.contactZ);
    spawnCrashDebris();
    return;
  }

  const breakdown = scoreTouchdown({
    grade: graded.grade,
    basePoints: graded.basePoints,
    fuelFraction: state.fuel / currentSite.fuelBudget,
    siteMultiplier: currentSite.multiplier
  });
  siteScores[siteIndex] = Math.max(siteScores[siteIndex] ?? 0, breakdown.total);
  pushCue(graded.grade === "soft" ? "touch-soft" : "touch-hard");
  pushCue("site-clear");
  fx.touchdown(context.contactX, context.contactY, context.contactZ, graded.grade === "soft");
  fx.siteClear(context.contactX, context.contactY, context.contactZ);
  maybeRecordBestRun(attemptSamples, graded.grade, breakdown.total);

  const isLastSite = siteIndex >= SITES.length - 1;
  phase = isLastSite ? "campaign-clear" : "landed";
  advanceTimer = isLastSite ? -1 : 1.8;
}

function spawnCrashDebris(): void {
  if (!field) return;
  const ground = sampleGridHeight(field, state.x, state.z);
  crashDebris = Array.from({ length: 10 }, (_, index) => ({
    x: state.x,
    y: ground + 0.3,
    z: state.z,
    vx: Math.cos((index / 10) * Math.PI * 2) * (2 + (index % 3)),
    vy: 3 + (index % 4),
    vz: Math.sin((index / 10) * Math.PI * 2) * (2 + (index % 3)),
    life: 1
  }));
  shockwaveAge = reducedMotion ? -1 : 0;
  if (!reducedMotion) handle("impact-shockwave")?.setPosition(state.x, ground + 0.25, state.z);
}

// ------------------------------------------------------------- sim tick -----

function readControls(): Controls {
  const touch = [...touchHeld.values()];
  const thrust = Math.max(
    consumeTimedFlightControl("thrust"),
    touch.includes("thrust") ? 0.8 : 0
  );
  const rotate = consumeTimedFlightControl("right") - consumeTimedFlightControl("left")
    + (touch.includes("right") ? 1 : 0) - (touch.includes("left") ? 1 : 0);
  return { thrust: Math.min(1, thrust), rotate: Math.max(-1, Math.min(1, rotate)) };
}

/** Deterministic descent autopilot (autorun/touchdown scenario): tracks a
 * sinking-rate schedule so the scripted approach grades a real touchdown. */
function autopilotControls(): Controls {
  if (!field) return { thrust: 0, rotate: 0 };
  const ground = sampleGridHeight(field, state.x, state.z);
  const agl = state.y - FOOT_DROP - ground;
  const pad = currentSite.pads[0]!;
  const lateralCorrection = Math.max(-1, Math.min(1, (pad.x - state.x) * 0.12 - state.vx * 0.5));
  if (agl >= 22) return { thrust: 0, rotate: lateralCorrection };
  const desiredVy = -Math.max(0.6, Math.min(2.2, agl * 0.16));
  const vyError = desiredVy - state.vy;
  return {
    thrust: Math.min(1, Math.max(0, 0.52 + vyError * 0.32)),
    rotate: agl < 1.5 ? 0 : lateralCorrection
  };
}

function tick(dtFixed: number): void {
  if (paused || phase !== "flying") return;
  simSeconds += dtFixed;

  const controls = readControls();
  const effectiveControls = autopilotEnabled ? autopilotControls() : controls;
  previousControls = effectiveControls;
  state = stepLander(state, effectiveControls, dtFixed, currentSite.gust);

  if (controls.thrust > 0 && !thrustLoopActive) {
    thrustLoopActive = true;
    pushCue("thrust-loop");
  } else if (controls.thrust === 0 && thrustLoopActive) {
    thrustLoopActive = false;
  }
  const rotating = Math.abs(controls.rotate) > 0.05;
  if (rotating && rcsPuffArmed) {
    rcsPuffArmed = false;
    pushCue("rcs-puff");
  } else if (!rotating) {
    rcsPuffArmed = true;
  }
  const fuelFraction = state.fuel / currentSite.fuelBudget;
  if (!fuelLowCueFired && fuelFraction <= 0.2 && fuelFraction > 0) {
    fuelLowCueFired = true;
    pushCue("fuel-low");
  }
  if (gustTelegraphActive(currentSite.gust, simSeconds)) {
    if (!gustWarnCueFiredForCycle) {
      gustWarnCueFiredForCycle = true;
      pushCue("gust-warn");
      fx.gustWarn(state.x, state.y - 2, state.z);
    }
  } else {
    gustWarnCueFiredForCycle = false;
  }

  attemptSamples.push({ frame: attemptSamples.length, x: state.x, y: state.y, z: state.z });

  // Drive the contact proxy from the authored pose so Rapier witnesses real
  // contacts against the static heightfield while motion stays authored.
  if (collisions) {
    const proxy = collisionWorld.require(collisions.proxyId);
    proxy.setPosition([state.x, state.y - FOOT_DROP, state.z]);
    proxy.setVelocity([state.vx, state.vy, state.vz]);
  }
  const events = collisionWorld.step(dtFixed);

  let sample: SurfaceSample | undefined;
  if (surfaceQuery) {
    sample = surfaceQuery.sample(state.x, state.z);
  }

  for (const eventItem of events) {
    const involvesProxy = eventItem.a.id === collisions?.proxyId || eventItem.b.id === collisions?.proxyId;
    if (!involvesProxy || eventItem.type !== "begin") continue;
    contactEventsSeen += 1;
    const other = eventItem.a.id === collisions?.proxyId ? eventItem.b : eventItem.a;
    const partnerIsSensor = other.sensor || (collisions?.sensorIds.includes(other.id) ?? false);
    if (partnerIsSensor) {
      if (!padSensorArmed) {
        padSensorArmed = true;
        pushCue("pad-lock");
        fx.padLock(state.x, state.y - FOOT_DROP, state.z);
      }
      continue;
    }
    if (phase !== "flying" || !field || !surfaceQuery || !sample) continue;

    const queryNormal = surfaceQuery.sampleNormal(state.x, state.z);
    const normalAlignment = Math.abs(
      queryNormal[0] * eventItem.normal[0]
      + queryNormal[1] * eventItem.normal[1]
      + queryNormal[2] * eventItem.normal[2]
    );
    contactQueryAgreement = normalAlignment >= 0.9;

    const tiltRad = (state.tiltDeg * Math.PI) / 180;
    const yawRad = state.yaw;
    const upX = Math.sin(tiltRad) * -Math.sin(yawRad);
    const upY = Math.cos(tiltRad);
    const upZ = Math.sin(tiltRad) * -Math.cos(yawRad);
    const dot = upX * queryNormal[0] + upY * queryNormal[1] + upZ * queryNormal[2];
    const attitudeDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    const slopeDeg = (Math.acos(Math.max(-1, Math.min(1, queryNormal[1]))) * 180) / Math.PI;

    const feetY = state.y - FOOT_DROP;
    const insidePadZone = currentSite.pads.some((pad, index) => {
      const padHeight = field!.padHeights[index] ?? 0;
      const within = Math.hypot(state.x - pad.x, state.z - pad.z) <= pad.radius;
      return within && Math.abs(feetY - padHeight) < 1.5;
    }) || partnerIsSensor && Math.abs(state.vy) < 10;

    gradeFromContact({
      vspeed: Math.abs(state.vy),
      hspeed: hspeedOf(state),
      attitudeDeg,
      slopeDeg,
      insidePadZone,
      contactX: state.x,
      contactY: feetY,
      contactZ: state.z
    });
  }

  // Ghost playback follows the SAME deterministic integrator.
  if (ghostActive) {
    const playback = ghostPlayback.step(dtFixed);
    handle("lander-ghost")
      ?.setPosition(playback.state.x, playback.state.y, playback.state.z)
      .setRotation(0, playback.state.yaw, (playback.state.tiltDeg * Math.PI) / 180);
    if (playback.complete) {
      ghostPlayback.stop();
      ghostActive = false;
      handle("lander-ghost")?.setVisible(false);
    }
  }
}

// --------------------------------------------------------- control edges ----

function toggleGhost(): void {
  ghostVisible = !ghostVisible;
  handle("lander-ghost")?.setVisible(ghostVisible && ghostActive);
}

function togglePause(): void {
  paused = !paused;
  if (paused) game.session.pause("user");
  else game.session.resume();
}

function handleControlEdges(): void {
  if (input.pressed("restart") || input.pressed("quickRestart")) {
    if (phase === "campaign-clear" || phase === "crashed") {
      siteScores = [];
      campaignHull = LANDER_MAX_HULL;
      loadSite(0);
    } else {
      resetAttempt();
    }
    return;
  }
  if (input.pressed("ghostToggle")) toggleGhost();
  if (input.pressed("pause")) togglePause();
}

// ------------------------------------------------------------- render -------

const auroraBandNodes = world.sheets.map((_, i) => `aurora-band-${i + 1}`);
const padLightNames = (index: number) => [1, 2, 3, 4].map((i) => `s${SITES[index]!.id}-pad-light-${i}`);

let lastHudSignature = "";
let lastHudWrite = 0;
function syncHud(): void {
  const signature = [
    siteIndex, phase, paused, lastGrade,
    Math.round(state.vy * 10), Math.round(state.fuel), campaignHull,
    siteScores.join(","), Math.round(simSeconds)
  ].join("|");
  if (signature === lastHudSignature && frame - lastHudWrite < 120) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  const alt = Math.max(0, rigState.agl);
  game.hud.set("site", `SITE ${currentSite.id} · ${currentSite.name.toUpperCase()}`);
  game.hud.set("telemetry", `ALT ${alt.toFixed(1)}m  V/S ${state.vy.toFixed(1)}  TILT ${Math.abs(state.tiltDeg).toFixed(0)}°`);
  game.hud.set("fuel", `FUEL ${Math.max(0, (state.fuel / currentSite.fuelBudget) * 100).toFixed(0)}%`);
  game.hud.set("hull", `HULL ${Math.round((campaignHull / LANDER_MAX_HULL) * 100)}%`);
  game.hud.set("score", `${campaignScore(SITES.map((_, i) => siteScores[i] ?? 0))}`);
  game.hud.set("message",
    paused ? "PAUSED — P TO RESUME"
      : phase === "crashed" ? `CRASH — ${crashReason}. R TO RESTART`
        : phase === "campaign-clear" ? `CAMPAIGN CLEAR — R FOR NEW EXPEDITION`
          : phase === "landed" ? `${(lastGrade ?? "").toUpperCase()} LANDING — NEXT SITE…`
            : "W THRUST · A/D ROTATE · G GHOST · P PAUSE");
}

function renderUpdate(dtFrame: number): void {
  if (!field) return;
  const landerNode = handle("lander");
  landerNode?.setPosition(state.x, state.y, state.z)
    .setRotation(0, state.yaw, (state.tiltDeg * Math.PI) / 180);

  const groundHere = sampleGridHeight(field, state.x, state.z);
  const altitudeAboveGround = state.y - FOOT_DROP - groundHere;
  rigState.x = state.x;
  rigState.y = state.y;
  rigState.z = state.z;
  rigState.agl = Math.max(0, altitudeAboveGround);

  // Plume: visible thrust flame scaled by throttle while the engine burns.
  const burning = phase === "flying" && !paused && previousControls.thrust > 0 && state.fuel > 0;
  const plumeScale = burning ? 0.5 + previousControls.thrust * 0.7 : 0.001;
  handle("thrust-plume")
    ?.setPosition(state.x - Math.sin(state.yaw) * 0.1, state.y - FOOT_DROP * 1.35, state.z - Math.cos(state.yaw) * 0.1)
    .setScale([plumeScale * 0.45, plumeScale * 2.4, plumeScale * 0.45]);

  // Bounded estimate: same integrator + sampler as gameplay, every 6 frames.
  if (phase === "flying" && (latestPrediction === null || frame % 6 === 0)) {
    latestPrediction = predictLanding(
      state,
      previousControls,
      (x, z) => sampleGridHeight(field!, x, z),
      FOOT_DROP,
      currentSite.gust
    );
  }
  if (phase === "flying" && latestPrediction) {
    handle("landing-prediction")
      ?.setVisible(true)
      .setPosition(latestPrediction.x, latestPrediction.y, latestPrediction.z)
      .setScale(latestPrediction.reachedSurface ? [1.15, 1.15, 0.08] : [0.72, 0.72, 0.06]);
  } else {
    handle("landing-prediction")?.setVisible(false);
  }

  // Whiteout: site-owned density; reduced motion freezes the drift.
  const whiteoutCount = Math.round(72 * currentSite.whiteout);
  const weatherTime = reducedMotion ? 0 : simSeconds;
  const gustOffset = currentSite.gust ? Math.sin(weatherTime * 0.7) * currentSite.gust.amplitude * 2 : 0;
  for (let index = 0; index < 72; index += 1) {
    const node = handle(`whiteout-${index + 1}`);
    const visible = index < whiteoutCount && phase !== "campaign-clear";
    node?.setVisible(visible);
    if (!visible) continue;
    const lane = (index * 37) % 72;
    node
      ?.setPosition(
        state.x + (((lane * 17) % 41) - 20) * 0.55 + gustOffset,
        state.y + (((lane * 11 + Math.floor(weatherTime * 7)) % 31) - 15) * 0.42,
        state.z + (((lane * 23 + Math.floor(weatherTime * 4)) % 47) - 23) * 0.5
      )
      .setScale(currentSite.whiteout >= 0.6 ? [0.04, 0.11, 0.04] : [0.035, 0.075, 0.035]);
  }

  // Extraction tableau on campaign-clear, launch gantry under the approach.
  const extractionVisible = phase === "campaign-clear";
  const extractionPad = currentSite.pads[0]!;
  const extractionGround = field.padHeights[0] ?? groundHere;
  const approachScaffoldVisible = phase === "flying" && altitudeAboveGround > APPROACH_SCAFFOLD_MIN_AGL;
  handle("extraction-title")
    ?.setVisible(extractionVisible)
    .setPosition(extractionPad.x - 5.8, extractionGround + 5.2, extractionPad.z - 1.5);
  handle("extraction-halo")
    ?.setVisible(extractionVisible)
    .setPosition(extractionPad.x, extractionGround + 0.18, extractionPad.z);
  handle("extraction-bay-backdrop")
    ?.setVisible(extractionVisible)
    .setPosition(extractionPad.x - 3.5, extractionGround - 10.25, extractionPad.z - 4.25)
    .setRotation(0, 0.69, 0);
  handle("extraction-lander")
    ?.setVisible(extractionVisible)
    .setPosition(state.x, state.y, state.z)
    .setRotation(0, 0.69, 0);
  EXTRACTION_INFRASTRUCTURE.forEach((part, index) => {
    const node = handle(`extraction-${part.id}`);
    node?.setVisible(extractionVisible || approachScaffoldVisible);
    if (extractionVisible) {
      node?.setPosition(extractionPad.x + part.offset[0], extractionGround + part.offset[1], extractionPad.z + part.offset[2]);
    } else if (approachScaffoldVisible) {
      const scaffoldY = currentSite.spawn.y - FOOT_DROP - 0.25;
      node?.setPosition(currentSite.spawn.x + part.offset[0], scaffoldY + part.offset[1], currentSite.spawn.z + part.offset[2]);
    }
  });
  landerNode?.setVisible(!extractionVisible);

  // Dust kicks under the plume near the ground.
  const dustActive = burning && altitudeAboveGround < 11;
  for (let index = 0; index < 12; index += 1) {
    const node = handle(`dust-${index + 1}`);
    if (!dustActive) {
      node?.setScale(0.001);
      continue;
    }
    const cycle = (simSeconds * 2.2 + index / 12) % 1;
    const angle = (index / 12) * Math.PI * 2;
    const radius = 0.7 + cycle * 2.6;
    node
      ?.setPosition(
        state.x + Math.cos(angle) * radius,
        groundHere + 0.25 + cycle * 0.9,
        state.z + Math.sin(angle) * radius
      )
      .setScale(0.16 + cycle * 0.55 * (1 - cycle * 0.4));
  }

  // Pad approach lights pulse in sequence.
  const pulsePhase = Math.floor((simSeconds * 2.4) % 4);
  padLightNames(siteIndex).forEach((name, index) => {
    handle(name)?.setScale(index === pulsePhase ? 0.42 : 0.22);
  });

  // Aurora sway — delta on each sheet's authored rotation, never absolute.
  auroraBandNodes.forEach((name, index) => {
    const sheet = world.sheets[index];
    if (!sheet) return;
    handle(name)?.setRotation(
      sheet.tiltX + Math.sin(simSeconds * 0.35 + index) * 0.012,
      sheet.tiltY + Math.sin(simSeconds * 0.21 + index * 0.7) * 0.02,
      sheet.tiltZ + Math.cos(simSeconds * 0.17 + index * 0.5) * 0.015
    );
  });

  // Crash debris ballistics + shockwave ring.
  if (crashDebris.length > 0) {
    let alive = false;
    crashDebris.forEach((piece, index) => {
      if (piece.life <= 0) return;
      alive = true;
      piece.life -= dtFrame;
      piece.vy -= 12 * dtFrame;
      piece.x += piece.vx * dtFrame;
      piece.y += piece.vy * dtFrame;
      piece.z += piece.vz * dtFrame;
      const floor = sampleGridHeight(field!, piece.x, piece.z);
      if (piece.y < floor + 0.08) {
        piece.y = floor + 0.08;
        piece.vy *= -0.32;
        piece.vx *= 0.72;
        piece.vz *= 0.72;
      }
      handle(`debris-${index + 1}`)
        ?.setPosition(piece.x, piece.y, piece.z)
        .setRotation(piece.x * 3 % Math.PI, piece.z * 2 % Math.PI, piece.y % Math.PI)
        .setScale(piece.life > 0 ? 0.18 : 0.001);
    });
    if (!alive) crashDebris = [];
  }
  if (shockwaveAge >= 0) {
    shockwaveAge += dtFrame;
    if (shockwaveAge > 0.7) {
      shockwaveAge = -1;
      handle("impact-shockwave")?.setPosition(0, -50, 0).setScale(0.001);
    } else {
      const t = shockwaveAge / 0.7;
      handle("impact-shockwave")?.setScale([2 + t * 14, 0.24 * (1 - t), 2 + t * 14]);
    }
  }

  if (advanceTimer > 0) {
    advanceTimer -= dtFrame;
    if (advanceTimer <= 0 && phase === "landed") {
      loadSite(Math.min(SITES.length - 1, siteIndex + 1));
    }
  }

  syncHud();
}

// -------------------------------------------------------------- evidence ----

function runSnapshot(): AuroraRunSnapshot {
  return {
    siteIndex,
    phase,
    paused,
    lastGrade,
    crashReason,
    state: {
      x: state.x,
      y: state.y,
      z: state.z,
      vy: state.vy,
      hspeed: hspeedOf(state),
      tiltDeg: state.tiltDeg,
      fuel: state.fuel / currentSite.fuelBudget
    },
    altitude: Math.max(0, rigState.agl),
    prediction: latestPrediction,
    hull: campaignHull / LANDER_MAX_HULL,
    campaignScore: campaignScore(SITES.map((_, i) => siteScores[i] ?? 0)),
    completedSites: siteScores.filter((s) => s > 0).length,
    siteScores
  };
}

function b_pose(): AuraCameraPose | null {
  return game.app.camera?.evidence?.().pose ?? null;
}

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
const appliedLook: Record<string, unknown> = {
  ...lookManifest(game.lookSource()),
  direction: direction.id,
  rig: "aurora-lander.altitude",
  key: "moonlight 6500K directional (shadowed)",
  fill: "ibl data_galaxy_deep_space_1k @0.35",
  practicals: 2,
  background: NIGHT_BG,
  hdri: "k1-starfield stand-in (data_galaxy_deep_space_1k)",
  exposureEV: -0.2
};

publishAuroraEvidence({
  game,
  run: runSnapshot,
  site: () => currentSite,
  field: () => field,
  padWorldY: () => field?.padHeights[0] ?? 0,
  lastRigPose: () => b_pose(),
  contact: () => ({ seen: contactEventsSeen, queryAgreement: contactQueryAgreement, padSensorArmed }),
  ghost: () => ({ active: ghostActive, replayHash: ghostReplayHash ?? (ghostActive ? null : trajectoryHash(attemptSamples) || null) }),
  sceneSwaps: () => sceneSwaps,
  appliedLook,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

// --------------------------------------------------------------- boot -------

const scenario = applyAuroraScenario(routeParams.get("scenario"), {
  loadSite: (index) => {
    siteIndex = index;
    currentSite = SITES[index]!;
    field = world.fields[index]!;
    surfaceQuery = siteQueries[index];
    rigState.padX = currentSite.pads[0]!.x;
    rigState.padY = field.padHeights[0] ?? 0;
    rigState.padZ = currentSite.pads[0]!.z;
  },
  enableApproachSpawn: () => { approachSpawnEnabled = true; },
  enableAutopilot: () => { autopilotEnabled = true; }
});
void scenario;

// Show only the active site's group before the first frame.
SITES.forEach((_, index) => {
  if (index !== siteIndex) setSiteGroupVisible(index, false);
});
resetAttempt();

game.app.onFrame?.(({ dt: rawDt }) => {
  syncTimedFlightControls(performance.now());
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  accumulator = Math.min(accumulator + frameDt, PLAYER_MAX_CATCHUP_SECONDS);
  let substeps = 0;
  while (accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS) {
    input.update(FIXED_DT);
    handleControlEdges();
    tick(FIXED_DT);
    accumulator -= FIXED_DT;
    substeps += 1;
  }
  renderUpdate(rawDt);
});

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createAuroraRig(rigState), { blend: 0.4 });
  // C-05 output: night-ops grade; post presets stub {} until the registry
  // ships real output profiles.
    game.app.setOutput?.({ preset: "space",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
