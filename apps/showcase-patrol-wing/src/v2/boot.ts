// apps/showcase-patrol-wing/src/v2/boot.ts — QR-14 rebuild shell (T2.1-T2.6).
// Runs only under `?a3d-qr=route-patrol-wing` / env A3D_QR_ROUTE_PATROL_WING.
// Full createGame port of the evening coastal patrol: authored six-axis
// FlightModel over the real island heightfield, Rapier sensor layer for the
// six ordered ring gates + pad + return-fire orb pool, drone waves off ring
// milestones, cannon combat through the shared combatWorld, ghost replay of
// the best graded sortie, the §6.9.11 flight rig, and dirty-checked HUD.
// Gameplay modules (flight/patrol/drones/weapons/ghost) are imported, not
// modified; audio plays through the legacy cue controller on admitted sfx
// ids until C-25 lands (stand-in R-14-09).
import { game as engineGame, scene, type AuraCameraPose, type GameInputController } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import {
  FlightModel,
  type FlightInput,
  type FlightOutcome
} from "../gameplay/flight";
import {
  PATROL_COUNT,
  WAVES_PER_PATROL,
  WAVE_TRIGGERS,
  droneSpeed,
  gradePatrol,
  gradeRank,
  interceptSpawns,
  ringHalfExtent,
  waveSpawns,
  RingTracker,
  type PatrolGrade
} from "../gameplay/patrol";
import { createDroneSwarm, ORB_DAMAGE } from "../gameplay/drones";
import { Cannon, encodeControlFrame } from "../gameplay/weapons";
import { GhostPlayer, GhostRecorder } from "../gameplay/ghost";
import {
  PAD_CENTER,
  PAD_HEADING_YAW,
  PAD_RADIUS,
  PAD_Y,
  RING_GATES,
  RING_COUNT,
  terrainSurface
} from "../legacy/sky";
import { createWingAudio, type WingAudioCue } from "../legacy/wing-audio";
import direction from "../../art/direction";
import { patrolWorldNodes, DRONE_NODE_COUNT, ORB_POOL_SIZE } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createPatrolRig, fallbackCameraNode, pointInRigFrame, type PatrolRigState } from "./scene/camera";
import { wirePatrolFx } from "./scene/fx";
import { SKY_BG } from "./scene/materials";
import { publishPatrolEvidence, type PatrolRouteState, type PatrolRunSnapshot } from "./evidence";
import { applyPatrolScenario } from "./scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_PATROL_WING" as const;
const PLAYER_SENSOR_RADIUS = 0.6;
const ORB_SENSOR_RADIUS = 0.4;
const ORB_SPEED = 16;
const ORB_LIFETIME = 4.5;
const AUTORUN_RING_TRIGGER = 1;

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const autopilotRequested = routeParams.get("autorun") === "1";
const scenarioName = routeParams.get("scenario") ?? "";

// ------------------------------------------------------------ sim state -----

let flight = new FlightModel({
  position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
  headingYaw: PAD_HEADING_YAW,
  grounded: "preflight"
});
const rings = new RingTracker();
const cannon = new Cannon();
const { swarm } = createDroneSwarm();
const ghostRecorder = new GhostRecorder();
let ghostPlayer: GhostPlayer | null = null;

let stateValue: PatrolRouteState = "preflight";
let patrolValue = 1;
let hullValue = 100;
let timeInPatrol = 0;
let failTimer = 0;
let gradeTimer = 0;
let currentWave = -1;
const spawnedWaves = new Set<number>();
let padSensorLatched = false;
let padSensorEntries = 0;
let outOfCombatFrames = 0;
let hitsThisSortie = 0;
let lastGrade: PatrolGrade | null = null;
let bestRun: { grade: PatrolGrade; script: readonly number[] } | null = null;
let paused = false;
let frame = 0;
let combatEventTotal = 0;
let sensorEventTotal = 0;
let ringsInFrameNow = 0;
let lastCueAt = new Map<string, number>();
let autopilotEnabled = autopilotRequested;
let scenarioTakeoff = false;
let scenarioFireOnce = false;
let touchDrive: { roll: number; pitch: number } | null = null;
let touchThrottle: 0 | 1 | -1 = 0;
let touchFire = false;
let touchEngaged = false;
const sceneSwaps = 0;
const bootedAtMs = performance.now();
let lastPose: AuraCameraPose | null = null;

const world = patrolWorldNodes();

function buildScene() {
  return scene()
    .background(SKY_BG)
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ------------------------------------------------------------------ audio ---

const audio = createWingAudio();
const audioCueLog: string[] = [];
function pushCue(cue: WingAudioCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue);
}
function cueReady(name: string, gapFrames: number): boolean {
  const last = lastCueAt.get(name) ?? -1e9;
  if (frame - last < gapFrames) return false;
  lastCueAt.set(name, frame);
  return true;
}
const unlockAudio = () => void audio.unlock();
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });
let audioBedsStarted = false;

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-patrol-wing",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.16,
    widgets: [
      { id: "mission", kind: "label", anchor: "top", label: "MISSION" },
      { id: "patrol", kind: "label", anchor: "top-left", label: "PATROL" },
      { id: "hull", kind: "gauge", anchor: "top-right", label: "HULL" },
      { id: "rings", kind: "label", anchor: "bottom-left", label: "RINGS" },
      { id: "speed", kind: "label", anchor: "bottom", label: "AIRSPEED" },
      { id: "wave", kind: "label", anchor: "bottom-right", label: "COMBAT" }
    ]
  },
  touch: {
    preset: "flight",
    bindings: {
      stick: "drive",
      fire: "tap",
      throttle: "hold-top",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      "engine-loop": { asset: "patrolWingEngineLoopSfx" },
      "ring-chime": { asset: "patrolWingRingChimeSfx" },
      "cannon-fire": { asset: "patrolWingCannonFireSfx" },
      "drone-hit": { asset: "patrolWingDroneHitSfx" },
      "drone-down": { asset: "patrolWingDroneDownSfx" },
      "hull-alarm": { asset: "patrolWingHullAlarmSfx" },
      "shot-down": { asset: "patrolWingShotDownSfx" },
      "crash-thud": { asset: "patrolWingCrashThudSfx" },
      touchdown: { asset: "patrolWingTouchdownSfx" },
      "patrol-clear": { asset: "patrolWingPatrolClearSfx" },
      "ambient-wind": { asset: "patrolWingAmbientWindSfx" }
    }
  },
  juice: {
    "drone-down": { hitStopMs: 45, trauma: 0.2 },
    "orb-impact": { hitStopMs: 30, trauma: 0.14 },
    crash: { hitStopMs: 80, trauma: 0.45 },
    touchdown: { hitStopMs: 40, trauma: 0.1 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_patrol_wing` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-patrol-wing`).
    flags: ["route_patrol_wing", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wirePatrolFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- physics ------
// Rapier sensor layer: a kinematic player proxy (r 0.6) driven by the
// authored FlightModel position, six ordered ring sensors, the pad sensor,
// and an 8-orb return-fire pool. Nothing simulates the flight — sensors only
// report overlap events that the sortie rules consume.
const collisionWorld = engineGame.collisionWorld({ backend: "rapier", gravity: [0, 0, 0] });
const PLAYER_PROXY_ID = "player-proxy";
let playerProxyId = "";
let sensorCountValue = 0;

interface OrbRuntime {
  readonly id: string;
  readonly bodyId: string;
  active: boolean;
  direction: [number, number, number];
  age: number;
}
const orbs: OrbRuntime[] = [];

function buildCollisions(): void {
  collisionWorld.clear();
  sensorCountValue = 0;
  orbs.length = 0;
  const half = ringHalfExtent(patrolValue);

  const proxy = collisionWorld.add({
    id: PLAYER_PROXY_ID,
    type: "dynamic",
    position: [...flight.position] as [number, number, number],
    shape: { kind: "sphere", radius: PLAYER_SENSOR_RADIUS }
  });
  playerProxyId = proxy.id;

  for (const gate of RING_GATES) {
    collisionWorld.add({
      id: `ring:${gate.index}`,
      type: "static",
      position: [gate.position[0], gate.position[1], gate.position[2]],
      shape: { kind: "box", halfExtents: [half, half, half * 0.9] },
      sensor: true
    });
    sensorCountValue += 1;
  }
  collisionWorld.add({
    id: "pad:pad",
    type: "static",
    position: [PAD_CENTER[0], PAD_Y + 0.6, PAD_CENTER[2]],
    shape: { kind: "box", halfExtents: [PAD_RADIUS + 0.6, 0.7, PAD_RADIUS + 0.6] },
    sensor: true
  });
  sensorCountValue += 1;

  for (let index = 0; index < ORB_POOL_SIZE; index += 1) {
    const body = collisionWorld.add({
      id: `orb-${index}`,
      type: "dynamic",
      position: [0, -40 - index, 0],
      shape: { kind: "sphere", radius: ORB_SENSOR_RADIUS },
      sensor: true
    });
    orbs.push({ id: `orb-${index}`, bodyId: body.id, active: false, direction: [0, 1, 0], age: 0 });
  }
}
buildCollisions();

// ------------------------------------------------------------- input ---------

const input: GameInputController = engineGame.input({
  actions: {
    pitchUp: ["KeyS", "ArrowDown"],
    pitchDown: ["KeyW", "ArrowUp"],
    rollLeft: ["KeyA", "ArrowLeft"],
    rollRight: ["KeyD", "ArrowRight"],
    yawLeft: ["KeyQ"],
    yawRight: ["KeyE"],
    throttleUp: ["ShiftLeft", "ShiftRight"],
    throttleDown: ["ControlLeft", "ControlRight"],
    fire: ["Space"],
    reset: ["KeyR"],
    pause: ["KeyP"]
  },
  bufferMs: 90
});

function readFlightInput(): FlightInput {
  const rollTouch = touchDrive?.roll ?? 0;
  const pitchTouch = touchDrive?.pitch ?? 0;
  const base: FlightInput = {
    pitchUp: input.held("pitchUp") || pitchTouch < -0.3,
    pitchDown: input.held("pitchDown") || pitchTouch > 0.3,
    rollLeft: input.held("rollLeft") || rollTouch < -0.3,
    rollRight: input.held("rollRight") || rollTouch > 0.3,
    yawLeft: input.held("yawLeft") || input.held("rollLeft") || rollTouch < -0.55,
    yawRight: input.held("yawRight") || input.held("rollRight") || rollTouch > 0.55,
    throttleUp: input.held("throttleUp") || touchThrottle > 0,
    throttleDown: input.held("throttleDown") || touchThrottle < 0
  };
  if (!autopilotEnabled && !scenarioTakeoff) return base;

  // Deterministic sortie autopilot: throttle up, climb out west, steer onto
  // the next gate, fire when a drone sits inside the nose cone.
  if (scenarioTakeoff && flight.grounded !== "airborne") {
    return { ...base, throttleUp: true };
  }
  const pos = flight.position;
  const gate = RING_GATES[Math.min(rings.nextRing, RING_COUNT - 1)]!;
  const dx = gate.position[0] - pos[0];
  const dy = gate.position[1] - pos[1];
  const dz = gate.position[2] - pos[2];
  // Nose is +x: steer the authored yaw toward the next gate bearing.
  const f = flight.forward;
  const fwdYaw = Math.atan2(-f[2], f[0]);
  const gateYaw = Math.atan2(-dz, dx);
  let err = gateYaw - fwdYaw;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const pitchErr = Math.atan2(dy, Math.hypot(dx, dz)) - Math.asin(Math.max(-1, Math.min(1, f[1])));
  return {
    ...base,
    yawLeft: err > 0.12,
    yawRight: err < -0.12,
    rollLeft: err > 0.28,
    rollRight: err < -0.28,
    pitchUp: pitchErr > 0.1,
    pitchDown: pitchErr < -0.12,
    throttleUp: flight.throttle < 0.9,
    throttleDown: false
  };
}

// ------------------------------------------------------------ touch ---------
// createGame stub ships touch:null (declarative only), so real touch input
// rides manual pointer zones on the canvas — same approach as deep-recovery:
// left-half drag = drive stick (x roll / y pitch), right-half top hold =
// throttle up, right-half bottom hold = throttle down, right-middle tap =
// fire. `touchEngaged` proves the zone path fired for the spec.
const canvas = game.app.canvas;
if (canvas) {
  canvas.style.touchAction = "none";
  const zones = new Map<number, { x0: number; y0: number; role: "drive" | "fire" | "throttle" }>();
  canvas.addEventListener("pointerdown", (event) => {
    unlockAudio();
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (event.clientY - rect.top) / Math.max(1, rect.height);
    let role: "drive" | "fire" | "throttle";
    if (nx < 0.5) role = "drive";
    else if (ny < 0.34) role = "throttle";
    else if (ny > 0.72) role = "fire";
    else role = "fire";
    zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role });
    if (role === "throttle") touchThrottle = ny < 0.34 ? 1 : -1;
    if (role === "fire") touchFire = true;
    if (role === "drive") touchDrive = { roll: 0, pitch: 0 };
    touchEngaged = true;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic evidence pointers may have no native capture target.
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const zone = zones.get(event.pointerId);
    if (!zone) return;
    if (zone.role === "drive") {
      const rect = canvas.getBoundingClientRect();
      touchDrive = {
        roll: ((event.clientX - zone.x0) / Math.max(1, rect.width)) * 4,
        pitch: ((event.clientY - zone.y0) / Math.max(1, rect.height)) * 4
      };
    }
  });
  const releaseZone = (event: PointerEvent) => {
    const zone = zones.get(event.pointerId);
    if (!zone) return;
    zones.delete(event.pointerId);
    if (zone.role === "drive") touchDrive = null;
    if (zone.role === "fire") touchFire = false;
    if (zone.role === "throttle") touchThrottle = 0;
  };
  canvas.addEventListener("pointerup", releaseZone);
  canvas.addEventListener("pointercancel", releaseZone);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// --------------------------------------------------------- ring visuals -----

function applyRingState(): void {
  for (const gate of RING_GATES) {
    const gateHandle = handle(`ring-${gate.index}`);
    const passedHandle = handle(`ring-${gate.index}-passed`);
    if (!gateHandle || !passedHandle) continue;
    const passed = gate.index < rings.nextRing;
    const isNext = gate.index === rings.nextRing && stateValue !== "preflight";
    passedHandle.setVisible(passed);
    const s = isNext ? 1.25 : 1;
    gateHandle
      .setScale([gate.radius * 2 * s, gate.radius * 2 * s, gate.radius * 0.9])
      .setVisible(!passed);
  }
  const nextGate = stateValue === "preflight" ? undefined : RING_GATES[rings.nextRing];
  const beacon = handle("next-ring-beacon");
  if (beacon) {
    if (nextGate) {
      beacon.setPosition(nextGate.position[0], nextGate.position[1] + 5, nextGate.position[2]);
      beacon.setVisible(true);
    } else {
      beacon.setVisible(false);
    }
  }
}

// ------------------------------------------------------------- waves --------

const droneSlotById = new Map<string, number>();
const freeDroneSlots: number[] = [];
for (let slot = DRONE_NODE_COUNT - 1; slot >= 0; slot -= 1) freeDroneSlots.push(slot);

function spawnWave(wave: number): void {
  currentWave = wave;
  spawnedWaves.add(wave);
  const spawns = waveSpawns(patrolValue, wave);
  for (const spawn of spawns) {
    const slot = freeDroneSlots.pop();
    if (slot === undefined) break;
    droneSlotById.set(spawn.id, slot);
  }
  swarm.spawnWave(spawns.filter((spawn) => droneSlotById.has(spawn.id)));
}

/** Intercept wedge used by `?autorun`/`?scenario=` only — same spawn path. */
function spawnInterceptLeg(): void {
  if (spawnedWaves.has(0)) return;
  currentWave = 0;
  spawnedWaves.add(0);
  const spawns = interceptSpawns(patrolValue, 0, flight.position, flight.forward);
  for (const spawn of spawns) {
    const slot = freeDroneSlots.pop();
    if (slot === undefined) break;
    droneSlotById.set(spawn.id, slot);
  }
  swarm.spawnWave(spawns.filter((spawn) => droneSlotById.has(spawn.id)));
}

// ------------------------------------------------------------ orb pool ------

function spawnOrb(from: readonly [number, number, number], toward: readonly [number, number, number]): void {
  const orb = orbs.find((candidate) => !candidate.active);
  if (!orb) return;
  const dx = toward[0] - from[0];
  const dy = toward[1] - from[1];
  const dz = toward[2] - from[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  orb.direction = [dx / len, dy / len, dz / len];
  orb.age = 0;
  orb.active = true;
  collisionWorld.require(orb.bodyId).setPosition([from[0], from[1], from[2]]);
}

function stepOrbs(dt: number): void {
  for (const orb of orbs) {
    if (!orb.active) continue;
    orb.age += dt;
    const body = collisionWorld.require(orb.bodyId);
    const p = body.position;
    if (orb.age > ORB_LIFETIME) {
      orb.active = false;
      body.setPosition([0, -40, 0]);
      continue;
    }
    body.setPosition([
      p[0] + orb.direction[0] * ORB_SPEED * dt,
      p[1] + orb.direction[1] * ORB_SPEED * dt,
      p[2] + orb.direction[2] * ORB_SPEED * dt
    ]);
  }
}

// ------------------------------------------------------------ outcomes ------

function objectiveComplete(): boolean {
  return rings.complete && spawnedWaves.size >= WAVES_PER_PATROL && swarm.allCleared;
}

function applyHullDamage(amount: number): number {
  hullValue = Math.max(0, hullValue - Math.max(0, amount));
  if (hullValue <= 0 && (stateValue === "patrol" || stateValue === "preflight")) beginFail("shot-down");
  else if (amount > 0 && cueReady("hull-alarm", 70)) pushCue("hull-alarm");
  return hullValue;
}

function beginFail(reason: "shot-down"): void {
  pushCue("shot-down");
  ghostRecorder.end();
  stateValue = reason;
  failTimer = 2.5;
}

function handleFlightOutcome(outcome: FlightOutcome, position: readonly [number, number, number]): void {
  if (outcome === "none") return;
  if (outcome === "pad-bounce") {
    fx.bounce(position[0], position[1], position[2]);
    applyHullDamage(6);
    return;
  }
  if (outcome === "pad-touchdown") {
    if (objectiveComplete() && padSensorLatched) {
      const breakdown = gradePatrol(timeInPatrol, cannon.accuracy, hullValue / 100);
      lastGrade = breakdown.grade;
      fx.touchdown(position[0], position[1], position[2]);
      pushCue("touchdown");
      pushCue("patrol-clear");
      const script = ghostRecorder.end();
      if (!bestRun || gradeRank(breakdown.grade) > gradeRank(bestRun.grade)) {
        bestRun = { grade: breakdown.grade, script };
      }
      stateValue = "graded";
      gradeTimer = 6;
    } else {
      ghostRecorder.end();
      pushCue("hull-alarm");
      stateValue = "incomplete";
      failTimer = 2.5;
    }
    return;
  }
  fx.crash(position[0], position[1], position[2]);
  pushCue("crash-thud");
  ghostRecorder.end();
  stateValue = "crashed";
  failTimer = 2;
}

function resetToPad(nextPatrol?: number): void {
  if (nextPatrol !== undefined) patrolValue = nextPatrol;
  flight = new FlightModel({
    position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
    headingYaw: PAD_HEADING_YAW,
    grounded: "preflight"
  });
  rings.reset();
  cannon.resetCounters();
  swarm.reset();
  for (const [id, slot] of droneSlotById) {
    void id;
    handle(`drone-${slot}`)?.setPosition(0, -60 - slot, 0);
    handle(`drone-wake-${slot}`)?.setVisible(false);
  }
  droneSlotById.clear();
  freeDroneSlots.length = 0;
  for (let slot = DRONE_NODE_COUNT - 1; slot >= 0; slot -= 1) freeDroneSlots.push(slot);
  for (const orb of orbs) {
    orb.active = false;
    collisionWorld.require(orb.bodyId).setPosition([0, -40, 0]);
  }
  for (const id of ["combat-muzzle-flash", "combat-cannon-tracer", "combat-impact-flash", "combat-impact-ring", "contrail-left", "contrail-right", "engine-glow", "ring-clear-pulse", "lead-drone-lock"]) {
    handle(id)?.setPosition(0, -70, 0).setVisible(false);
  }
  hullValue = 100;
  hitsThisSortie = 0;
  timeInPatrol = 0;
  padSensorLatched = false;
  outOfCombatFrames = 0;
  currentWave = -1;
  spawnedWaves.clear();
  failTimer = 0;
  gradeTimer = 0;
  lastCueAt = new Map();
  stateValue = "preflight";
  autopilotEnabled = autopilotRequested;
  buildCollisions();
  applyRingState();
  ghostPlayer?.stop();
  handle("ghost-plane")?.setPosition(0, -60, 0).setVisible(false);
}

// ------------------------------------------------------------- per-frame ----

function syncPlaneVisual(): void {
  const euler = flight.euler;
  const p = flight.position;
  const plane = handle("plane");
  plane?.setPosition(p[0], p[1], p[2]).setRotation(euler.x, euler.y, euler.z);
  const forward = flight.forward;
  const right = flight.right;
  const up = flight.up;
  const airborne = flight.grounded === "airborne";
  // Wingtip contrails + engine glow follow body axes (local offsets), only
  // while airborne at speed.
  for (const [id, side] of [["contrail-left", -1.9], ["contrail-right", 1.9]] as const) {
    const h = handle(id);
    if (!h) continue;
    const visible = airborne && flight.speed > 9 && !reducedMotion;
    h.setPosition(
      p[0] + right[0] * side - forward[0] * 1.4 + up[0] * 0.1,
      p[1] + right[1] * side - forward[1] * 1.4 + up[1] * 0.1,
      p[2] + right[2] * side - forward[2] * 1.4 + up[2] * 0.1
    )
      .setRotation(euler.x, euler.y, euler.z)
      .setVisible(visible);
  }
  const glow = handle("engine-glow");
  if (glow) {
    glow.setPosition(
      p[0] - forward[0] * 2.1 + up[0] * 0.15,
      p[1] - forward[1] * 2.1 + up[1] * 0.15,
      p[2] - forward[2] * 2.1 + up[2] * 0.15
    ).setVisible(airborne && flight.throttle > 0.55);
  }
}

function syncGhostVisual(): void {
  const h = handle("ghost-plane");
  if (!h) return;
  if (!ghostPlayer?.playing) {
    h.setVisible(false);
    return;
  }
  const g = ghostPlayer.flight;
  const e = g.euler;
  h.setPosition(g.position[0], g.position[1], g.position[2])
    .setRotation(e.x, e.y, e.z)
    .setVisible(true);
}

function syncDroneVisuals(): void {
  const positions = new Map(swarm.liveDrones().map((drone) => [drone.id, drone.position]));
  for (const [id, slot] of droneSlotById) {
    const h = handle(`drone-${slot}`);
    const wake = handle(`drone-wake-${slot}`);
    const pos = positions.get(id);
    if (!pos || !h) {
      h?.setVisible(false);
      wake?.setVisible(false);
      continue;
    }
    // Face the drone toward the player (pursuit read).
    const dx = flight.position[0] - pos[0];
    const dz = flight.position[2] - pos[2];
    const yaw = Math.atan2(dx, dz);
    h.setPosition(pos[0], pos[1], pos[2]).setRotation(0, yaw, 0).setVisible(true);
    if (wake) {
      const horizontal = Math.max(0.01, Math.hypot(dx, dz));
      const dy = flight.position[1] - pos[1];
      wake.setPosition(
        pos[0] + (dx / horizontal) * 0.9,
        pos[1] + dy * 0.1,
        pos[2] + (dz / horizontal) * 0.9
      )
        .setRotation(-Math.atan2(dy, horizontal), yaw, 0)
        .setVisible(stateValue === "patrol");
    }
  }
  // Lead-drone lock ring on the nearest live drone.
  const lock = handle("lead-drone-lock");
  if (lock) {
    const lead = swarm.liveDrones()[0];
    if (lead && stateValue === "patrol") {
      lock.setPosition(lead.position[0], lead.position[1] + 1.0, lead.position[2])
        .setRotation(0, flight.euler.y, 0)
        .setVisible(true);
    } else {
      lock.setVisible(false);
    }
  }
}

function syncOrbVisuals(): void {
  orbs.forEach((orb, index) => {
    const h = handle(`orb-${index}`);
    const trail = handle(`orb-trail-${index}`);
    if (!h) return;
    if (orb.active) {
      const p = collisionWorld.require(orb.bodyId).position;
      h.setPosition(p[0], p[1], p[2]).setVisible(true);
      const [dx, dy, dz] = orb.direction;
      const horizontal = Math.max(0.01, Math.hypot(dx, dz));
      trail?.setPosition(p[0] - dx * 0.42, p[1] - dy * 0.42, p[2] - dz * 0.42)
        .setRotation(-Math.atan2(dy, horizontal), Math.atan2(dx, dz), 0)
        .setVisible(true);
    } else {
      h.setVisible(false);
      trail?.setVisible(false);
    }
  });
}

// ---------------------------------------------------------------- HUD -------

let lastHudKey = "";
function syncHud(): void {
  let mission: string;
  if (stateValue === "preflight") mission = "THROTTLE UP / TAKE OFF";
  else if (stateValue === "graded") mission = `PATROL GRADED ${lastGrade ?? ""} — NEXT SOON`;
  else if (stateValue === "campaign-complete") mission = "ALL PATROLS FLOWN — R TO RESTART";
  else if (!rings.complete) mission = `RING ${rings.nextRing + 1} OF ${RING_COUNT}${rings.validity ? "" : " — SKIPPED, REFLY"}`;
  else if (!objectiveComplete()) mission = "CLEAR THE DRONE WAVES";
  else mission = "RETURN TO PAD — LAND GENTLE";
  const hud = {
    mission,
    patrol: `${Math.min(patrolValue, PATROL_COUNT)} OF ${PATROL_COUNT} · ${lastGrade ?? bestRun?.grade ?? "—"}`,
    hull: `${Math.max(0, Math.round(hullValue))}%`,
    rings: `${rings.passedCount} / ${RING_COUNT} · ${timeInPatrol.toFixed(1)}s`,
    speed: `${flight.speed.toFixed(1)} kt · ALT ${(flight.position[1] - terrainSurface(flight.position[0], flight.position[2])).toFixed(1)}m`,
    wave: currentWave < 0 ? "STANDBY" : `WAVE ${currentWave + 1}/${WAVES_PER_PATROL} · ${swarm.liveCount} LIVE`
  };
  const key = JSON.stringify(hud);
  if (key === lastHudKey) return;
  lastHudKey = key;
  game.hud.set("mission", hud.mission);
  game.hud.set("patrol", hud.patrol);
  game.hud.set("hull", hud.hull);
  game.hud.set("rings", hud.rings);
  game.hud.set("speed", hud.speed);
  game.hud.set("wave", hud.wave);
}

// ------------------------------------------------------------- frame loop ---

function updateGameplay(dt: number): void {
  frame += 1;
  input.update(dt);

  if (input.pressed("pause")) {
    if (game.session.paused) game.session.resume();
    else game.session.pause();
  }
  if (input.pressed("reset")) resetToPad();
  paused = game.session.paused;
  if (paused) {
    syncHud();
    return;
  }

  // Fail / grade timers run even while the plane is parked post-outcome.
  if (failTimer > 0) {
    failTimer -= dt;
    if (failTimer <= 0) resetToPad();
  }
  if (stateValue === "graded") {
    gradeTimer -= dt;
    if (gradeTimer <= 0) {
      if (patrolValue >= PATROL_COUNT) {
        stateValue = "campaign-complete";
      } else {
        resetToPad(patrolValue + 1);
      }
    }
  }

  const flightInput = readFlightInput();
  const fireHeld = input.held("fire") || touchFire || (autopilotEnabled && swarm.liveCount > 0 && (swarm.nearestDistance(flight.position) ?? 99) < 34);

  if (stateValue === "preflight" || stateValue === "patrol") {
    const frameResult = flight.step(flightInput, dt, terrainSurface, {
      padCenter: PAD_CENTER,
      padY: PAD_Y,
      padRadius: PAD_RADIUS
    });
    if (stateValue === "preflight" && flight.grounded === "airborne") {
      stateValue = "patrol";
      timeInPatrol = 0;
      applyRingState();
      ghostRecorder.begin();
      if (bestRun && bestRun.script.length > 0 && patrolValue > 1) {
        ghostPlayer = new GhostPlayer(bestRun.script, {
          position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
          headingYaw: PAD_HEADING_YAW
        });
        ghostPlayer.start();
      }
    }
    if (stateValue === "patrol") {
      timeInPatrol += dt;
      ghostRecorder.record(encodeControlFrame(flightInput, fireHeld));
      handleFlightOutcome(frameResult.outcome, flight.position);
    }
  }

  // Sensor layer: park the player proxy on the authored position then step.
  collisionWorld.require(playerProxyId).setPosition([...flight.position] as [number, number, number]);
  stepOrbs(dt);
  for (const event of collisionWorld.step(dt)) {
    if (event.type !== "begin") continue;
    const a = event.a;
    const b = event.b;
    const sensor = a.id === playerProxyId ? b : b.id === playerProxyId ? a : null;
    if (!sensor) continue;
    sensorEventTotal += 1;
    if (sensor.id.startsWith("ring:") && stateValue === "patrol") {
      const index = Number(sensor.id.slice(5));
      const result = rings.registerEntry(index);
      if (result === "advanced") {
        pushCue("ring-chime");
        const gate = RING_GATES[index]!;
        fx.ringClear(gate.position[0], gate.position[1], gate.position[2]);
      }
      applyRingState();
    } else if (sensor.id === "pad:pad") {
      padSensorEntries += 1;
      if (stateValue === "patrol" && flight.grounded === "airborne" && !padSensorLatched) {
        padSensorLatched = true;
      }
    } else if (sensor.id.startsWith("orb-") && stateValue === "patrol") {
      const orb = orbs.find((candidate) => candidate.id === sensor.id);
      if (orb?.active) {
        orb.active = false;
        collisionWorld.require(orb.bodyId).setPosition([0, -40, 0]);
        applyHullDamage(ORB_DAMAGE);
        fx.orbImpact(flight.position[0], flight.position[1], flight.position[2]);
      }
    }
  }

  // Wave triggers off ordered ring progress (autorun/spawn also allowed via
  // the same spawnWave path for deterministic evidence legs).
  if (stateValue === "patrol") {
    for (let wave = 0; wave < WAVES_PER_PATROL; wave += 1) {
      if (!spawnedWaves.has(wave) && rings.passedCount >= (WAVE_TRIGGERS[wave] ?? 99)) {
        spawnWave(wave);
      }
    }
    if (autopilotEnabled && spawnedWaves.size === 0
      && (rings.passedCount >= AUTORUN_RING_TRIGGER || timeInPatrol > 12)) {
      spawnInterceptLeg();
    }
  }

  // Drone pursuit + combat resolution.
  let dronesMoving = false;
  if (stateValue === "patrol" && swarm.liveCount > 0) {
    dronesMoving = true;
    const positions = new Map(swarm.liveDrones().map((drone) => [drone.id, drone.position]));
    for (const event of swarm.update(dt, flight.position, droneSpeed(patrolValue))) {
      combatEventTotal += 1;
      if (event.type === "orb-fired") {
        spawnOrb(event.from, event.toward);
      } else if (event.type === "drone-down") {
        pushCue("drone-down");
        const slot = droneSlotById.get(event.id);
        const dronePosition = positions.get(event.id);
        if (dronePosition) fx.droneDown(dronePosition[0], dronePosition[1], dronePosition[2]);
        if (slot !== undefined) {
          handle(`drone-${slot}`)?.setPosition(0, -60 - slot, 0).setVisible(false);
          handle(`drone-wake-${slot}`)?.setVisible(false);
          droneSlotById.delete(event.id);
          freeDroneSlots.push(slot);
        }
      } else if (event.type === "cannon-hit") {
        hitsThisSortie += 1;
        if (cueReady("drone-hit", 8)) pushCue("drone-hit");
        cannon.registerHit();
        const target = positions.get(event.targetId);
        if (target) {
          fx.cannonHit(target[0], target[1], target[2]);
          const impact = handle("combat-impact-flash");
          impact?.setPosition(target[0], target[1], target[2]).setVisible(true);
          handle("combat-impact-ring")?.setPosition(target[0], target[1], target[2]).setVisible(true);
        }
      }
    }
  }

  // Cannon: fire edge + cooldown; hitbox sits ahead of the nose.
  if (stateValue === "patrol" && cannon.tryFire(fireHeld || scenarioFireOnce, dt)) {
    scenarioFireOnce = false;
    const forward = flight.forward;
    swarm.beginCannonAttack([forward[0] * 3.2, forward[1] * 3.2, forward[2] * 3.2]);
    if (cueReady("cannon-fire", 12)) pushCue("cannon-fire");
    const nose: [number, number, number] = [
      flight.position[0] + forward[0] * 2.4,
      flight.position[1] + forward[1] * 2.4,
      flight.position[2] + forward[2] * 3.2 - forward[2] * 0.8
    ];
    fx.cannonFire(nose[0], nose[1], nose[2]);
    handle("combat-muzzle-flash")?.setPosition(nose[0], nose[1], nose[2]).setVisible(true);
    handle("combat-cannon-tracer")?.setPosition(
      flight.position[0] + forward[0] * 4.4,
      flight.position[1] + forward[1] * 4.4,
      flight.position[2] + forward[2] * 4.4
    ).setRotation(flight.euler.x, flight.euler.y, 0).setVisible(true);
  } else {
    // Staged fx nodes expire by re-hiding (the stub fx layer tracks bursts).
    handle("combat-muzzle-flash")?.setVisible(false);
    handle("combat-cannon-tracer")?.setVisible(false);
    handle("combat-impact-flash")?.setVisible(false);
    handle("combat-impact-ring")?.setVisible(false);
  }

  // Hull regen out of combat (no live drone within 35 m for ~4 s).
  if (stateValue === "patrol") {
    const nearest = swarm.nearestDistance(flight.position);
    if (dronesMoving && nearest !== null && nearest < 35) outOfCombatFrames = 0;
    else outOfCombatFrames += 1;
    if (outOfCombatFrames > 240 && hullValue < 100) {
      hullValue = Math.min(100, hullValue + 4 * dt);
    }
  }

  // Ghost playback steps alongside live flight.
  if (ghostPlayer?.playing) ghostPlayer.step(terrainSurface);

  // Engine bed intensity follows the authored throttle.
  audio.setEngineIntensity(flight.throttle, stateValue === "patrol" || flight.grounded === "airborne");
  if (!audioBedsStarted && audio.proof().unlocked) {
    audioBedsStarted = true;
    pushCue("ambient-wind");
    pushCue("engine-loop");
  }

  // §7.2.1 rings.inFrame: gates inside the rig's forward cone this frame.
  if (lastPose) {
    const pose = lastPose;
    ringsInFrameNow = RING_GATES.reduce(
      (count, gate) => count + (pointInRigFrame(pose, gate.position) ? 1 : 0),
      0
    );
  }

  if (scenarioTakeoff && flight.grounded === "airborne") scenarioTakeoff = false;

  syncPlaneVisual();
  syncGhostVisual();
  syncDroneVisuals();
  syncOrbVisuals();
  syncHud();
}

// ------------------------------------------------------------ run snapshot --

function runSnapshot(): PatrolRunSnapshot {
  const pos = flight.position;
  const e = flight.euler;
  return {
    state: stateValue,
    paused,
    patrol: patrolValue,
    hull: hullValue,
    timeInPatrol,
    rings: rings.snapshot(),
    cannon: cannon.snapshot(),
    hitsThisSortie,
    dronesDown: swarm.downCount,
    dronesLive: swarm.liveCount,
    currentWave,
    spawnedWaves: spawnedWaves.size,
    sensorEventCount: sensorEventTotal,
    combatEventCount: combatEventTotal,
    padSensorLatched,
    ringsInFrame: ringsInFrameNow,
    orbsActive: orbs.filter((orb) => orb.active).length,
    ghost: {
      recorded: ghostRecorder.frameCount > 0,
      frames: ghostRecorder.frameCount,
      playing: ghostPlayer?.playing ?? false,
      playbackFrame: ghostPlayer?.frameIndexValue ?? 0
    },
    flight: {
      position: pos,
      euler: [e.x, e.y, e.z],
      forward: flight.forward,
      throttle: flight.throttle,
      speed: flight.speed,
      altitude: pos[1] - terrainSurface(pos[0], pos[2]),
      stalled: flight.stalled,
      grounded: flight.grounded,
      trajectoryHash: flight.trajectoryFrameCount() > 0 ? flight.trajectoryHash() : null,
      trajectoryFrames: flight.trajectoryFrameCount()
    },
    lastGrade,
    bestGrade: bestRun?.grade ?? null,
    touchEngaged
  };
}

// ------------------------------------------------------------ rig + boot ----

const rigState: PatrolRigState = {
  get position() {
    return flight.position;
  },
  get forward() {
    return flight.forward;
  },
  get up() {
    return flight.up;
  }
} as PatrolRigState;

game.app.onFrame?.(({ dt: rawDt }) => {
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  updateGameplay(Math.min(0.05, Math.max(0.001, frameDt)));
});

game.start();
void game.ready().then(() => {
  const rig = createPatrolRig(rigState);
  const update = rig.update.bind(rig);
  rig.update = (ctx) => {
    lastPose = update(ctx);
    return lastPose;
  };
  game.app.camera?.use?.(rig, { blend: 0.4 });
  // C-05 output: dusk coastal grade; post presets stub {} until the registry
  // ships real output profiles.
    game.app.setOutput?.({ preset: "cinematic-film",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});

publishPatrolEvidence({
  game,
  run: runSnapshot,
  lastRigPose: () => lastPose,
  sceneSwaps: () => sceneSwaps,
  // T2.2-post: appliedLook derives from the C-31 runtime manifest.
  appliedLook: { ...lookManifest(game.lookSource()), preset: "cinematic-film" },
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog,
  collisionBackend: () => "rapier",
  collisionBodyCount: () => sensorCountValue + ORB_POOL_SIZE + 1
});

if (scenarioName) {
  applyPatrolScenario(scenarioName, {
    launchSortie: () => {
      scenarioTakeoff = true;
    },
    spawnWaveLeg: () => {
      if (stateValue === "preflight") spawnInterceptLeg();
      else spawnWave(0);
    },
    fireOnce: () => {
      scenarioFireOnce = true;
    },
    applyHullDamage: (fraction) => {
      applyHullDamage(Math.max(0, Math.min(0.99, fraction)) * 100);
    }
  });
}
