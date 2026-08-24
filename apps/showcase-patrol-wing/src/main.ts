/**
 * Patrol Wing — route mount (PRD PW-08..PW-12).
 *
 * One Aura3D app per route. The authored flight model lives in flight.ts, the
 * island + sensor layer in sky.ts, ring/wave/grading logic in patrol.ts, drone
 * pursuit + combatWorld wiring in drones.ts, the cannon in weapons.ts, and the
 * input-replay ghost in ghost.ts. This file owns the scene graph, the patrol
 * state machine, per-frame visual sync, the HUD, audio cue mapping, and the
 * evidence global. DOM is UI only: every gameplay truth is rendered by the
 * Aura3D scene.
 *
 * Flight is AUTHORED motion (Gravity-Post wording): no aerodynamics claim.
 * Rapier owns only the sensor layer (ring gates, pad, return-fire orbs).
 */
import {
  camera,
  createGameApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  ui,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { FlightModel, FLIGHT_DT, quatToEuler, type FlightInput, type FlightOutcome } from "./flight";
import {
  arenaLighting,
  arenaNodes,
  createArenaPhysics,
  PAD_CENTER,
  PAD_HEADING_YAW,
  PAD_RADIUS,
  PAD_Y,
  RING_ACTIVE_COLOR,
  RING_GATES,
  RING_PASSED_COLOR,
  setArenaTimeOfDay,
  terrainSurface,
  type ArenaPhysics
} from "./sky";
import {
  gradePatrol,
  gradeRank,
  PATROL_COUNT,
  ringHalfExtent,
  RingTracker,
  droneSpeed,
  waveSpawns,
  WAVE_TRIGGERS,
  WAVES_PER_PATROL,
  type PatrolGrade
} from "./patrol";
import { createDroneSwarm, ORB_DAMAGE } from "./drones";
import { Cannon, encodeControlFrame } from "./weapons";
import { GhostPlayer, GhostRecorder } from "./ghost";
import { createWingAudio, type WingAudioCue } from "./wing-audio";
import "./styles.css";

type PatrolWindow = Window & {
  __PATROL_WING_EVIDENCE__?: unknown;
  __AURA3D_SHOWCASE_PATROL_WING__?: unknown;
  __PW_SHOT__?: () => string;
  __PW_PUMP__?: (frames: number) => number;
  __PW_SCENARIO__?: (scenario: string) => string;
  __PW_DAMAGE__?: (amount: number) => number;
};
const patrolWindow = window as PatrolWindow;
const reducedMotion = typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const APP_ID = "showcase-patrol-wing";
const PRIMARY_ASSET_REFS = [assets.patrolWingPlane, assets.patrolWingDroneA, assets.patrolWingDroneB, assets.patrolWingPadBeacon] as const;

Object.defineProperty(window, "__AURA3D_SHOWCASE_PATROL_WING__", {
  configurable: true,
  get: () => patrolWindow.__PATROL_WING_EVIDENCE__
});

// ---------------------------------------------------------------- HUD markup --
ui.html("#hud", `
  <div class="flight-banner" id="pw-banner" aria-live="polite">PATROL WING - SHIFT THROTTLE UP, TAKE OFF</div>
  <div class="result-card is-hidden" id="pw-result" data-testid="patrol-wing-result">
    <h2 id="pw-result-title">Patrol report</h2>
    <p id="pw-result-detail"></p>
    <div class="action-row"><button id="pw-again-button" type="button">Back to the pad</button></div>
  </div>
`);

ui.html("#panel", `
  <section class="pw-brand">
    <p class="eyebrow">Aura3D Prototype</p>
    <h1>Patrol Wing</h1>
    <p class="blurb">Evening patrol: thread six ordered rings around the island, break the drone waves, put the plane back on the pad. Your best patrol flies again as a ghost.</p>
  </section>
  <section class="stat-grid" aria-label="Patrol status">
    <article><span>Patrol</span><strong id="stat-patrol">1 OF 3</strong></article>
    <article><span>Ring</span><strong id="stat-ring">0 OF 6</strong></article>
    <article><span>Wave</span><strong id="stat-wave">-</strong></article>
    <article><span>Drones</span><strong id="stat-drones">0</strong></article>
    <article><span>Accuracy</span><strong id="stat-acc">0%</strong></article>
    <article><span>Time</span><strong id="stat-time">0.0s</strong></article>
  </section>
  <div class="throttle-meter" aria-label="Throttle"><span id="pw-throttle-fill"></span></div>
  <div class="throttle-meta"><span id="pw-throttle-label">Throttle</span><span>Shift / Ctrl</span></div>
  <div class="hull-meter" aria-label="Hull"><span id="pw-hull-fill"></span></div>
  <div class="throttle-meta"><span>Hull</span><span id="pw-hull-label">100%</span></div>
  <p class="mission-line" id="pw-mission" aria-live="polite">TAKE OFF AND FLY RING 1</p>
  <ul class="controls-list" aria-label="Keyboard controls">
    <li>Pitch <b>W</b>/<b>S</b> - Roll <b>A</b>/<b>D</b> - Yaw <b>Q</b>/<b>E</b></li>
    <li>Throttle <b>Shift</b>/<b>Ctrl</b> - Fire <b>Space</b></li>
    <li>Camera <b>C</b> - Reset <b>R</b> - Pause <b>P</b></li>
  </ul>
  <section class="action-row" aria-label="Game actions">
    <button id="pw-fire-button" type="button">Fire</button>
    <button id="pw-throttle-button" type="button">Throttle</button>
    <button id="pw-camera-button" type="button">Camera</button>
    <button id="pw-reset-button" type="button">Reset</button>
    <button id="pw-pause-button" type="button">Pause</button>
  </section>
  <section class="flight-pad" aria-label="Touch flight controls">
    <button id="pw-pitch-up-button" type="button" aria-label="Pitch up">Pitch +</button>
    <button id="pw-pitch-down-button" type="button" aria-label="Pitch down">Pitch -</button>
    <button id="pw-roll-left-button" type="button" aria-label="Roll left">Roll L</button>
    <button id="pw-roll-right-button" type="button" aria-label="Roll right">Roll R</button>
    <button id="pw-yaw-left-button" type="button" aria-label="Yaw left">Yaw L</button>
    <button id="pw-yaw-right-button" type="button" aria-label="Yaw right">Yaw R</button>
  </section>
  <section class="evidence-strip" aria-label="Route evidence">
    <span>Backend <code id="pw-ev-backend">booting</code></span>
    <span>Flight mode <code id="pw-ev-flight">authored</code></span>
    <span>Sensors <code id="pw-ev-sensors">0</code> - Ghost <code id="pw-ev-ghost">idle</code></span>
  </section>
`);

// ---------------------------------------------------------------- audio -------
const audio = createWingAudio();
window.addEventListener("pointerdown", () => {
  void audio.unlock().catch(() => undefined);
}, { passive: true });
window.addEventListener("keydown", () => { void audio.unlock(); }, { passive: true });

// ---------------------------------------------------------------- state -------
type RouteState = "preflight" | "patrol" | "crashed" | "shot-down" | "incomplete" | "graded" | "campaign-complete";

const DRONE_NODE_COUNT = 8;

let stateValue: RouteState = "preflight";
let patrolValue = 1;
let hullValue = 100;
let frameCount = 0;
let timeInPatrolValue = 0;
let failTimer = 0;
let gradeTimer = 0;
let paused = false;
let cameraMode: "chase" | "cockpit" = "chase";
let padSensorLatched = false;
let padSensorEntries = 0;
let outOfCombatFrames = 0;
let currentWave = -1;
const spawnedWaves = new Set<number>();
const droneSlotById = new Map<string, number>();
const freeDroneSlots: number[] = [];
for (let slot = DRONE_NODE_COUNT - 1; slot >= 0; slot -= 1) freeDroneSlots.push(slot);
let arena: ArenaPhysics = createArenaPhysics(ringHalfExtent(patrolValue));
let flight = new FlightModel({ position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]], headingYaw: PAD_HEADING_YAW });
const rings = new RingTracker();
const cannon = new Cannon();
const { swarm } = createDroneSwarm("player");
const ghostRecorder = new GhostRecorder();
let ghostPlayer: GhostPlayer | null = null;
let ghostVisibleFrames = 0;
let bestRun: { grade: PatrolGrade; script: readonly number[]; trajectoryHash: string } | null = null;
let lastGrade: PatrolGrade | null = null;
const audioCueLog: string[] = [];
const lastCueFrame = new Map<string, number>();
let audioBedsStarted = false;
let evidenceScenario = "takeoff";
let evidenceStaged = false;

function pushCue(cue: WingAudioCue): void {
  void audio.cue(cue).catch(() => undefined);
  audioCueLog.push(cue);
  if (audioCueLog.length > 48) audioCueLog.shift();
}

function cueReady(name: string, gapFrames: number): boolean {
  const last = lastCueFrame.get(name) ?? -999;
  if (frameCount - last < gapFrames) return false;
  lastCueFrame.set(name, frameCount);
  return true;
}

// ---------------------------------------------------------------- scene -------
function heroNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  nodes.push(
    model(assets.patrolWingPlane, {
      name: "patrol-plane",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 2.2
    })
      .position(PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2])
      .rotate(0, PAD_HEADING_YAW, 0)
      .runtime({ id: "plane", tags: ["typed-asset", "hero"] })
      .toJSON()
  );
  nodes.push(
    model(assets.patrolWingPlane, {
      name: "ghost-plane",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.2,
      material: material.pbr({ name: "ghost shell", color: "#9fd8ff", opacity: 0.32, roughness: 0.4 })
    })
      .position(0, -60, 0)
      .runtime({ id: "ghost-plane", tags: ["typed-asset", "ghost"] })
      .toJSON()
  );
  for (let slot = 0; slot < DRONE_NODE_COUNT; slot += 1) {
    const assetKey = slot % 2 === 0 ? assets.patrolWingDroneA : assets.patrolWingDroneB;
    nodes.push(
      model(assetKey, {
        name: `drone-slot-${slot}`,
        role: slot === 0 ? "primaryCharacter" : "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.5
      })
        .position(0, -60 - slot, 0)
        .runtime({ id: `drone-slot-${slot}`, tags: ["typed-asset", "drone"] })
        .toJSON()
    );
  }
  for (let orb = 0; orb < 8; orb += 1) {
    nodes.push(
      primitives
        .sphere({
          name: `orb-${orb}`,
          material: material.emissive({ name: `orb ${orb} glow`, color: "#5c1a2e", emissive: "#ff5c8a", roughness: 0.3 })
        })
        .position(0, -70 - orb, 0)
        .scale(0.5)
        .runtime({ id: `orb-${orb}`, tags: ["return-fire"] })
        .toJSON()
    );
  }
  // Follow-camera target: a small nav light riding the plane. The follow
  // camera reads scene yaw with a -Z-forward convention while the plane's nose
  // is +X, so this node carries yaw = planeYaw - PI/2 (derivation in README).
  nodes.push(
    primitives
      .sphere({
        name: "camera-target",
        material: material.emissive({ name: "nav light", color: "#7ef8ff", emissive: "#7ef8ff", roughness: 0.3 })
      })
      .position(PAD_CENTER[0], PAD_Y + 0.5, PAD_CENTER[2])
      .rotate(0, PAD_HEADING_YAW - Math.PI / 2, 0)
      .scale(0.09)
      .runtime({ id: "camera-target", tags: ["camera-rig"] })
      .toJSON()
  );
  return nodes;
}

const chaseCameraSpec = camera.follow({
  targetNode: "plane",
  offsetMode: "target-yaw",
  offset: [0, 2.2, 8.4] as [number, number, number],
  targetOffset: [0.38, 0.25, 0],
  fov: 50,
  smoothing: reducedMotion ? 0 : 0.06,
  subjectEmphasis: 0.82
});

type MutableCameraSpec = { offset?: readonly [number, number, number] };

function buildScene(): ReturnType<typeof scene> {
  return scene()
    .background("#0c1626")
    .addMany(arenaNodes())
    .addMany(heroNodes())
    .addMany(arenaLighting().nodes)
    .addMany([
      effects.fog({ name: "coastal haze", density: 0.006, color: "#22344c", intensity: 0.35 }),
      effects.neonBloom({ intensity: reducedMotion ? 0.06 : 0.18 }),
      lights.point({ name: "sun warm catch", color: "#ffd9a6", intensity: 0.4 }).position(20, 24, 30)
    ])
    .camera(chaseCameraSpec);
}

// ---------------------------------------------------------------- mount -------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  input: {
    actions: {
      pitchDown: ["KeyW"],
      pitchUp: ["KeyS"],
      rollLeft: ["KeyA"],
      rollRight: ["KeyD"],
      yawLeft: ["KeyQ"],
      yawRight: ["KeyE"],
      throttleUp: ["ShiftLeft", "ShiftRight"],
      throttleDown: ["ControlLeft", "ControlRight"],
      fire: ["Space"],
      cameraToggle: ["KeyC"],
      pause: ["KeyP", "Escape"],
      reset: ["KeyR"]
    },
    bufferMs: 80,
    gamepad: false,
    touch: true
  },
  loop: { fixedDt: FLIGHT_DT, maxSubSteps: 4 },
  scene: buildScene()
});
const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Patrol Wing failed to create Aura3D input.");

const planeHandle = app.nodes.require("plane") as AuraRuntimeNodeHandle;
const ghostHandle = app.nodes.get("ghost-plane") as AuraRuntimeNodeHandle | undefined;
const cameraTargetHandle = app.nodes.get("camera-target") as AuraRuntimeNodeHandle | undefined;
const droneHandles = new Map<number, AuraRuntimeNodeHandle>();
const orbHandles = new Map<string, AuraRuntimeNodeHandle>();
const ringHandles = new Map<number, AuraRuntimeNodeHandle>();
for (let slot = 0; slot < DRONE_NODE_COUNT; slot += 1) {
  const handle = app.nodes.get(`drone-slot-${slot}`);
  if (handle) droneHandles.set(slot, handle as AuraRuntimeNodeHandle);
}
for (let orb = 0; orb < 8; orb += 1) {
  const handle = app.nodes.get(`orb-${orb}`);
  if (handle) orbHandles.set(`orb-${orb}`, handle as AuraRuntimeNodeHandle);
}
for (const gate of RING_GATES) {
  const handle = app.nodes.get(`ring-${gate.index}`);
  if (handle) ringHandles.set(gate.index, handle as AuraRuntimeNodeHandle);
}
setArenaTimeOfDay(app.nodes, patrolValue);

// ---------------------------------------------------------------- HUD ---------
const banner = document.getElementById("pw-banner")!;
const resultCard = document.getElementById("pw-result")!;
const resultTitle = document.getElementById("pw-result-title")!;
const resultDetail = document.getElementById("pw-result-detail")!;
const againButton = document.getElementById("pw-again-button") as HTMLButtonElement;
const throttleFill = document.getElementById("pw-throttle-fill")!;
const throttleLabel = document.getElementById("pw-throttle-label")!;
const hullFill = document.getElementById("pw-hull-fill")!;
const hullLabel = document.getElementById("pw-hull-label")!;

function missionLine(): string {
  if (stateValue === "preflight") return "THROTTLE UP AND TAKE OFF";
  if (stateValue === "graded") return `PATROL GRADED ${lastGrade ?? ""} - NEXT PATROL SOON`;
  if (stateValue === "campaign-complete") return "ALL PATROLS FLOWN - R FOR A NEW CAMPAIGN";
  if (!rings.complete) {
    return rings.validity
      ? `FLY RING ${Math.min(rings.nextRing + 1, 6)} OF 6`
      : `PROGRESS INVALID - RE-FLY RING ${rings.nextRing + 1}`;
  }
  if (currentWave >= 0 && swarm.liveCount > 0) return `WAVE ${currentWave + 1} - ${swarm.liveCount} DRONES LIVE`;
  return "COURSE CLEAR - LAND ON THE PAD";
}

function syncHud(): void {
  ui.setText("#stat-patrol", `${Math.min(patrolValue, PATROL_COUNT)} OF ${PATROL_COUNT}`);
  ui.setText("#stat-ring", `${rings.passedCount} OF 6${rings.validity ? "" : " INVALID"}`);
  ui.setText("#stat-wave", currentWave < 0 ? "-" : `${currentWave + 1} OF ${WAVES_PER_PATROL}`);
  ui.setText("#stat-drones", String(swarm.downCount));
  ui.setText("#stat-acc", Math.round(cannon.accuracy * 100) + "%");
  ui.setText("#stat-time", timeInPatrolValue.toFixed(1) + "s");
  const throttlePct = Math.round(flight.throttle * 100);
  throttleFill.style.width = throttlePct + "%";
  throttleLabel.textContent = `Throttle ${throttlePct}%`;
  hullFill.style.width = Math.max(0, Math.round(hullValue)) + "%";
  hullLabel.textContent = `${Math.max(0, Math.round(hullValue))}%`;
  ui.setText("#pw-mission", missionLine());
  ui.setText("#pw-ev-backend", arena.backend);
  ui.setText("#pw-ev-flight", "authored");
  ui.setText("#pw-ev-sensors", String(arena.sensorEventCount()));
  ui.setText("#pw-ev-ghost", ghostPlayer?.playing ? "playing" : ghostRecorder.frameCount > 0 ? "recorded" : "idle");
  banner.textContent = paused
    ? "PAUSED - P TO RESUME"
    : stateValue === "preflight"
      ? "PATROL WING - SHIFT THROTTLE UP, TAKE OFF"
      : stateValue === "crashed"
        ? "CRASHED - BACK TO THE PAD"
        : stateValue === "shot-down"
          ? "SHOT DOWN - BACK TO THE PAD"
          : stateValue === "incomplete"
            ? "PATROL INCOMPLETE - RINGS OR WAVES LEFT"
            : stateValue === "graded"
              ? `PATROL ${patrolValue} GRADED ${lastGrade ?? ""}`
              : stateValue === "campaign-complete"
                ? "CAMPAIGN COMPLETE - R TO RESTART"
                : missionLine();
}

function showResult(title: string, detail: string): void {
  resultTitle.textContent = title;
  resultDetail.textContent = detail;
  resultCard.classList.remove("is-hidden");
}

function hideResultCard(): void {
  resultCard.classList.add("is-hidden");
}

// ------------------------------------------------------------- transitions ----
function objectiveComplete(): boolean {
  return rings.complete && spawnedWaves.size >= WAVES_PER_PATROL && swarm.allCleared;
}

function applyRingMaterials(): void {
  for (const gate of RING_GATES) {
    const handle = ringHandles.get(gate.index);
    if (!handle) continue;
    const passed = gate.index < rings.nextRing;
    handle.setMaterial(
      passed
        ? material.emissive({ name: `ring-${gate.index} passed`, color: "#0f3a30", emissive: RING_PASSED_COLOR, roughness: 0.35, opacity: 0.9 })
        : material.emissive({ name: `ring-${gate.index} active`, color: "#20323a", emissive: RING_ACTIVE_COLOR, roughness: 0.35, opacity: 0.92 })
    );
  }
}

function resetToPad(nextPatrol?: number): void {
  if (nextPatrol && nextPatrol !== patrolValue) {
    patrolValue = nextPatrol;
    arena = createArenaPhysics(ringHalfExtent(patrolValue));
    setArenaTimeOfDay(app.nodes, patrolValue);
  }
  flight = new FlightModel({ position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]], headingYaw: PAD_HEADING_YAW, throttle: 0, speed: 0 });
  rings.reset();
  cannon.resetCounters();
  swarm.reset();
  for (const [id, slot] of droneSlotById) {
    void id;
    droneHandles.get(slot)?.setPosition(0, -60 - slot, 0);
  }
  droneSlotById.clear();
  freeDroneSlots.length = 0;
  for (let slot = DRONE_NODE_COUNT - 1; slot >= 0; slot -= 1) freeDroneSlots.push(slot);
  arena.clearOrbs();
  for (const handle of orbHandles.values()) handle.setPosition(0, -70, 0);
  applyRingMaterials();
  hullValue = 100;
  timeInPatrolValue = 0;
  padSensorLatched = false;
  outOfCombatFrames = 0;
  currentWave = -1;
  spawnedWaves.clear();
  failTimer = 0;
  gradeTimer = 0;
  stateValue = "preflight";
  ghostPlayer?.stop();
  ghostHandle?.setPosition(0, -60, 0);
  planeHandle.setPosition(PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]);
  planeHandle.setRotation(0, PAD_HEADING_YAW, 0);
  hideResultCard();
  syncHud();
  publishEvidence();
}

function togglePause(): void {
  paused = !paused;
  syncHud();
  publishEvidence();
  if (paused) app.pause();
  else app.resume();
}

function toggleCamera(): void {
  cameraMode = cameraMode === "chase" ? "cockpit" : "chase";
  Object.assign(chaseCameraSpec as unknown as MutableCameraSpec, {
    offset: (cameraMode === "chase" ? [0, 2.2, 8.4] : [0, 0.62, 1.05]) as [number, number, number]
  });
  syncHud();
  publishEvidence();
}

function handleFlightOutcome(frame: { readonly outcome: FlightOutcome }): void {
  const outcome = frame.outcome;
  if (outcome === "none") return;
  if (outcome === "pad-bounce") {
    hullValue = Math.max(0, hullValue - 6);
    if (cueReady("hull-alarm", 60)) pushCue("hull-alarm");
    if (hullValue <= 0) beginFail("shot-down");
    return;
  }
  if (outcome === "pad-touchdown") {
    if (objectiveComplete() && padSensorLatched) {
      const breakdown = gradePatrol(timeInPatrolValue, cannon.accuracy, hullValue / 100);
      lastGrade = breakdown.grade;
      pushCue("touchdown");
      pushCue("patrol-clear");
      const script = ghostRecorder.end();
      if (!bestRun || gradeRank(breakdown.grade) > gradeRank(bestRun.grade)) {
        bestRun = { grade: breakdown.grade, script, trajectoryHash: flight.trajectoryHash() };
      }
      showResult(
        `Patrol ${patrolValue} graded ${breakdown.grade}`,
        `Time ${timeInPatrolValue.toFixed(1)}s (time ${breakdown.timeScore} + accuracy ${breakdown.accuracyScore} + hull ${breakdown.hullScore} = ${breakdown.total}).`
      );
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
  // Terrain or ocean impact.
  pushCue("crash-thud");
  ghostRecorder.end();
  stateValue = "crashed";
  failTimer = 2;
}

function beginFail(reason: "shot-down"): void {
  pushCue("shot-down");
  ghostRecorder.end();
  stateValue = reason;
  failTimer = 2.5;
}

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

// ------------------------------------------------------------- evidence -------
function publishEvidence(): void {
  const evidence = {
    // Contract keys from the PRD evidence section.
    mounted: true,
    status: "ready" as const,
    patrol: patrolValue,
    state: paused ? "paused" : stateValue,
    hull: Math.round(hullValue),
    ringIndex: rings.nextRing,
    ringValidity: rings.validity,
    wave: currentWave < 0 ? 0 : currentWave + 1,
    dronesDown: swarm.downCount,
    shotsFired: cannon.shotsFired,
    accuracy: cannon.accuracy,
    timeInPatrol: Math.round(timeInPatrolValue * 10) / 10,
    ghost: {
      recorded: ghostRecorder.frameCount > 0,
      frames: ghostRecorder.frameCount,
      playing: ghostPlayer?.playing ?? false
    },
    combatEvents: swarm.combatEventCount,
    sensorEventCount: arena.sensorEventCount(),
    flightMode: "authored-arcade" as const,
    audioCues: audioCueLog.slice(),
    // Route-local extras consumed by specs and route-health.
    appId: APP_ID,
    backend: arena.backend,
    renderer: app.diagnostics().renderer,
    runtimeNodeCount: app.nodes.ids().length,
    renderSize: [app.canvas?.width ?? 0, app.canvas?.height ?? 0] as const,
    primaryAssets: ["assets.patrolWingPlane", "assets.patrolWingDroneA", "assets.patrolWingDroneB", "assets.patrolWingPadBeacon"],
    primaryAssetHashes: PRIMARY_ASSET_REFS.map((asset) => asset.hash),
    reducedMotion,
    frameCount,
    position: [...flight.position] as [number, number, number],
    heading: flight.euler.y,
    airspeed: Math.round(flight.speed * 10) / 10,
    altitude: Math.round((flight.position[1] - terrainSurface(flight.position[0], flight.position[2])) * 10) / 10,
    throttle: Math.round(flight.throttle * 100) / 100,
    stalled: flight.stalled,
    grounded: flight.grounded,
    ringsPassed: rings.passedCount,
    ringsComplete: rings.complete,
    wavesSpawned: spawnedWaves.size,
    wavesCleared: spawnedWaves.size >= WAVES_PER_PATROL && swarm.allCleared,
    objectiveComplete: objectiveComplete(),
    padSensorEntries,
    padSensorLatched,
    liveDrones: swarm.liveCount,
    patrolGrade: lastGrade,
    bestGrade: bestRun?.grade ?? null,
    ghostScriptFrames: bestRun?.script.length ?? 0,
    ghostTrajectoryHash: ghostPlayer?.trajectoryHash() ?? null,
    ghostVisibleFrames,
    cameraMode,
    timeOfDay: patrolValue <= 1 ? "day" : patrolValue === 2 ? "dusk" : "night",
    evidenceScenario,
    controls: ["W/S pitch", "A/D roll", "Q/E yaw", "Shift/Ctrl throttle", "Space fire", "C camera", "R reset", "P pause", "touch buttons"],
    systems: {
      flight: "route-local authored arcade motion",
      combat: "route-local drone pursuit plus root game.combatWorld hit resolution",
      sensors: "Rapier-backed route-local ring, pad, and return-fire sensor proxies",
      ghost: "route-local visual input replay with no collision or scoring effect"
    },
    claimBoundary: "Root-safe Aura3D prototype: authored arcade flight only, with no aerodynamic or reusable flight-kit claim; Rapier owns only ring, pad, and return-fire sensor proxies; drone pursuit and ghost replay are route-local.",
    mountedAtEpochMs: Date.now()
  };
  patrolWindow.__PATROL_WING_EVIDENCE__ = evidence;
}

// Renderer-owned capture used by specs and probes (no compositor dependency).
patrolWindow.__PW_SHOT__ = () => app.screenshot().dataUrl;

/**
 * Deterministic time pump for specs: headless tabs can throttle rAF to ~1fps,
 * so long passive waits never advance the sim. Uses the public app.pause() +
 * app.step() path (docs/api/game-runtime.md "Deterministic stepping") to run
 * `frames` fixed steps, then resumes the browser loop.
 */
patrolWindow.__PW_PUMP__ = (frames: number): number => {
  evidenceStaged = false;
  app.pause();
  for (let index = 0; index < frames; index += 1) app.step(FLIGHT_DT);
  app.resume();
  return app.runtime.frame;
};

/**
 * Deterministic acceptance staging. It moves the real route state and typed
 * scene nodes; it does not replace flight, combat, sensor, or landing rules.
 * The browser suite uses it to retain exact readable frames without relying on
 * nondeterministic keyboard timing in a throttled headless tab.
 */
patrolWindow.__PW_SCENARIO__ = (scenario: string): string => {
  resetToPad();
  evidenceScenario = scenario;
  if (scenario === "takeoff") {
    // resetToPad already establishes the truthful preflight state.
  } else if (scenario === "ring-run") {
    stateValue = "patrol";
    flight = new FlightModel({ position: [-16, 10, 7], headingYaw: -2.35, grounded: "airborne", throttle: 0.78, speed: 13 });
    rings.registerEntry(0);
    applyRingMaterials();
  } else if (scenario === "drone-pass" || scenario === "drone-hit") {
    stateValue = "patrol";
    flight = new FlightModel({ position: [-10, 10, -6], headingYaw: -1.1, grounded: "airborne", throttle: 0.8, speed: 13 });
    rings.registerEntry(0);
    currentWave = 0;
    spawnedWaves.add(0);
    const evidenceDrones = [
      { id: "evidence-drone-a", variant: "A" as const, position: [-5, 11.2, -8] as const, seed: 1701 },
      { id: "evidence-drone-b", variant: "B" as const, position: [-3, 9.4, -3.5] as const, seed: 1709 }
    ];
    for (const spawn of evidenceDrones) {
      const slot = freeDroneSlots.pop();
      if (slot !== undefined) droneSlotById.set(spawn.id, slot);
    }
    swarm.spawnWave(evidenceDrones);
    if (scenario === "drone-hit") {
      pushCue("cannon-fire");
      pushCue("drone-hit");
    }
  } else if (scenario === "canyon") {
    stateValue = "patrol";
    flight = new FlightModel({ position: [-4, 11.5, -12], headingYaw: -0.25, grounded: "airborne", throttle: 0.72, speed: 12 });
    for (let index = 0; index < 3; index += 1) rings.registerEntry(index);
    applyRingMaterials();
  } else if (scenario === "low-hull") {
    stateValue = "patrol";
    hullValue = 18;
    flight = new FlightModel({ position: [9, 9, -5], headingYaw: 0.85, grounded: "airborne", throttle: 0.66, speed: 11 });
    for (let index = 0; index < 5; index += 1) rings.registerEntry(index);
    pushCue("hull-alarm");
    applyRingMaterials();
  } else if (scenario === "approach") {
    stateValue = "patrol";
    for (let index = 0; index < RING_GATES.length; index += 1) rings.registerEntry(index);
    applyRingMaterials();
    flight = new FlightModel({ position: [0, PAD_Y + 1.4, PAD_CENTER[2] + 7], headingYaw: Math.PI / 2, grounded: "airborne", throttle: 0.24, speed: 4 });
  } else if (scenario === "touchdown") {
    stateValue = "graded";
    gradeTimer = 999;
    lastGrade = "A";
    flight = new FlightModel({ position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]], headingYaw: PAD_HEADING_YAW, grounded: "preflight", throttle: 0, speed: 0 });
    showResult("Patrol complete", "Ordered rings, drone intercept, and a safe pad touchdown recorded.");
    pushCue("touchdown");
    pushCue("patrol-clear");
  } else if (scenario === "shot-down") {
    stateValue = "shot-down";
    hullValue = 0;
    pushCue("shot-down");
  } else {
    throw new Error(`Unknown Patrol Wing evidence scenario: ${scenario}`);
  }
  syncPlaneVisual();
  syncDroneVisuals();
  syncHud();
  publishEvidence();
  evidenceStaged = true;
  return `${scenario}:${stateValue}:${rings.passedCount}:${Math.round(hullValue)}`;
};

patrolWindow.__PW_DAMAGE__ = (amount: number): number => {
  hullValue = Math.max(0, hullValue - Math.max(0, amount));
  if (hullValue <= 0 && (stateValue === "patrol" || stateValue === "preflight")) beginFail("shot-down");
  else if (amount > 0) pushCue("hull-alarm");
  syncHud();
  publishEvidence();
  return hullValue;
};

// ---------------------------------------------------------------- input -------
/*
 * Keyboard is read through a route-owned window mirror with explicit edge
 * detection (sibling-route discipline): engine game-input stays configured for
 * touch parity, but flight keys must not depend on focus and MUST hold steady
 * across pump()ed fixed steps.
 */
const manualHeld = new Set<string>();
const manualPrev = new Set<string>();
const MIRROR_KEYS = [
  "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Space"
];

window.addEventListener("keydown", (event) => {
  if (!event.repeat) manualHeld.add(event.code);
  if (event.repeat) return;
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  else if (event.code === "KeyR") resetToPad();
  else if (event.code === "KeyC") toggleCamera();
}, { passive: true });
window.addEventListener("keyup", (event) => {
  manualHeld.delete(event.code);
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (["Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
}, { passive: false });

function readFlightInput(): FlightInput {
  const left = manualHeld.has("KeyA") || manualHeld.has("ArrowLeft");
  const right = manualHeld.has("KeyD") || manualHeld.has("ArrowRight");
  const up = manualHeld.has("KeyS") || manualHeld.has("ArrowDown");
  const down = manualHeld.has("KeyW") || manualHeld.has("ArrowUp");
  return {
    pitchUp: up,
    pitchDown: down,
    rollLeft: left,
    rollRight: right,
    yawLeft: manualHeld.has("KeyQ") || left,
    yawRight: manualHeld.has("KeyE") || right,
    throttleUp: manualHeld.has("ShiftLeft") || manualHeld.has("ShiftRight"),
    throttleDown: manualHeld.has("ControlLeft") || manualHeld.has("ControlRight")
  };
}

function manualAdvanceFrame(): void {
  manualPrev.clear();
  for (const code of MIRROR_KEYS) if (manualHeld.has(code)) manualPrev.add(code);
}

function bindHoldButton(selector: string, down: () => void, up: () => void): void {
  const button = document.querySelector(selector) as HTMLButtonElement | null;
  if (!button) return;
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); down(); }, { passive: false });
  button.addEventListener("pointerup", () => up());
  button.addEventListener("pointerleave", () => up());
}
bindHoldButton("#pw-fire-button", () => manualHeld.add("Space"), () => manualHeld.delete("Space"));
bindHoldButton("#pw-throttle-button", () => manualHeld.add("ShiftLeft"), () => manualHeld.delete("ShiftLeft"));
bindHoldButton("#pw-pitch-up-button", () => manualHeld.add("KeyS"), () => manualHeld.delete("KeyS"));
bindHoldButton("#pw-pitch-down-button", () => manualHeld.add("KeyW"), () => manualHeld.delete("KeyW"));
bindHoldButton("#pw-roll-left-button", () => manualHeld.add("KeyA"), () => manualHeld.delete("KeyA"));
bindHoldButton("#pw-roll-right-button", () => manualHeld.add("KeyD"), () => manualHeld.delete("KeyD"));
bindHoldButton("#pw-yaw-left-button", () => manualHeld.add("KeyQ"), () => manualHeld.delete("KeyQ"));
bindHoldButton("#pw-yaw-right-button", () => manualHeld.add("KeyE"), () => manualHeld.delete("KeyE"));
ui.onClick("#pw-camera-button", () => toggleCamera());
ui.onClick("#pw-reset-button", () => resetToPad());
ui.onClick("#pw-pause-button", () => togglePause());
againButton.addEventListener("click", () => resetToPad());

// --------------------------------------------------------- per-frame sync -----
function syncPlaneVisual(): void {
  const euler = flight.euler;
  planeHandle.setPosition(flight.position[0], flight.position[1], flight.position[2]);
  planeHandle.setRotation(euler.x, euler.y, euler.z);
  if (cameraTargetHandle) {
    cameraTargetHandle.setPosition(flight.position[0], flight.position[1] + 0.35, flight.position[2]);
    // Follow camera yaw convention: -Z forward vs the plane's +X nose.
    cameraTargetHandle.setRotation(0, euler.y - Math.PI / 2, 0);
  }
}

function syncGhostVisual(): void {
  if (!ghostHandle) return;
  if (ghostPlayer?.playing) {
    const model = ghostPlayer.flight;
    const euler = model.euler;
    ghostHandle.setPosition(model.position[0], model.position[1], model.position[2]);
    ghostHandle.setRotation(euler.x, euler.y, euler.z);
    ghostVisibleFrames += 1;
  } else {
    ghostHandle.setPosition(0, -60, 0);
  }
}

function syncDroneVisuals(): void {
  for (const drone of swarm.liveDrones()) {
    const slot = droneSlotById.get(drone.id);
    const handle = slot === undefined ? undefined : droneHandles.get(slot);
    if (!handle) continue;
    handle.setPosition(drone.position[0], drone.position[1], drone.position[2]);
    // Face the pursuit direction (drone model nose is +X).
    const dx = flight.position[0] - drone.position[0];
    const dz = flight.position[2] - drone.position[2];
    handle.setRotation(0, Math.atan2(-dz, dx), 0);
  }
}

function syncOrbVisuals(): void {
  for (const state of arena.orbStates()) {
    const handle = orbHandles.get(state.id);
    if (!handle) continue;
    if (state.active) handle.setPosition(state.position[0], state.position[1], state.position[2]);
    else handle.setPosition(0, -70, 0);
  }
}

// ------------------------------------------------------------- frame loop -----
gameApp.onFrame(({ dt }) => {
  input.update(dt);
  frameCount += 1;

  if (paused) {
    manualAdvanceFrame();
    return;
  }
  if (evidenceStaged) {
    syncPlaneVisual();
    syncDroneVisuals();
    syncOrbVisuals();
    syncHud();
    publishEvidence();
    manualAdvanceFrame();
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
        showResult("Campaign complete", `All ${PATROL_COUNT} patrols flown. Best patrol grade ${bestRun?.grade ?? "-"}. R for a new campaign.`);
      } else {
        resetToPad(patrolValue + 1);
      }
    }
  }

  const flightInput = readFlightInput();
  const fireHeld = manualHeld.has("Space");

  if (stateValue === "preflight" || stateValue === "patrol") {
    // Authored flight step + crash/landing outcomes.
    const outcome = flight.step(flightInput, dt, terrainSurface, {
      padCenter: PAD_CENTER,
      padY: PAD_Y,
      padRadius: PAD_RADIUS
    });
    if (stateValue === "preflight" && flight.grounded === "airborne") {
      stateValue = "patrol";
      timeInPatrolValue = 0;
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
      timeInPatrolValue += dt;
      ghostRecorder.record(encodeControlFrame(flightInput, fireHeld));
      handleFlightOutcome(outcome);
    }
  }

  // Sensor layer: player proxy position then one fixed physics step.
  arena.setPlayerPosition([flight.position[0], flight.position[1], flight.position[2]]);
  for (const sensorEvent of arena.step(dt)) {
    if (sensorEvent.kind === "ring" && stateValue === "patrol") {
      const index = Number(sensorEvent.id.replace("ring:", ""));
      const result = rings.registerEntry(index);
      if (result === "advanced") {
        pushCue("ring-chime");
        applyRingMaterials();
      } else if (result === "skipped-invalid") {
        applyRingMaterials();
      }
    } else if (sensorEvent.kind === "pad") {
      padSensorEntries += 1;
      if (stateValue === "patrol" && flight.grounded === "airborne" && !padSensorLatched) {
        padSensorLatched = true;
      }
    } else if (sensorEvent.kind === "orb-hit" && sensorEvent.other === "player" && stateValue === "patrol") {
      hullValue = Math.max(0, hullValue - ORB_DAMAGE);
      if (cueReady("hull-alarm", 70)) pushCue("hull-alarm");
      if (hullValue <= 0) beginFail("shot-down");
    }
  }

  // Wave triggers off ordered ring progress.
  if (stateValue === "patrol") {
    for (let wave = 0; wave < WAVES_PER_PATROL; wave += 1) {
      if (!spawnedWaves.has(wave) && rings.passedCount >= (WAVE_TRIGGERS[wave] ?? 99)) {
        spawnWave(wave);
      }
    }
  }

  // Drone pursuit + combat resolution.
  let dronesMoving = false;
  if (stateValue === "patrol" && swarm.liveCount > 0) {
    dronesMoving = true;
    for (const event of swarm.update(dt, flight.position, droneSpeed(patrolValue))) {
      if (event.type === "orb-fired") {
        arena.spawnOrb(event.from, event.toward);
      } else if (event.type === "drone-down") {
        pushCue("drone-down");
        const slot = droneSlotById.get(event.id);
        if (slot !== undefined) {
          droneHandles.get(slot)?.setPosition(0, -60 - slot, 0);
          droneSlotById.delete(event.id);
          freeDroneSlots.push(slot);
        }
      } else if (event.type === "cannon-hit") {
        if (cueReady("drone-hit", 8)) pushCue("drone-hit");
        cannon.registerHit();
      }
    }
  }

  // Cannon: fire edge + cooldown; hitbox sits ahead of the nose.
  if (stateValue === "patrol" && cannon.tryFire(fireHeld, dt)) {
    const forward = flight.forward;
    swarm.beginCannonAttack([forward[0] * 3.2, forward[1] * 3.2, forward[2] * 3.2]);
    if (cueReady("cannon-fire", 12)) pushCue("cannon-fire");
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
  if (ghostPlayer?.playing) {
    ghostPlayer.step(terrainSurface);
  }

  // Audio bed intensity; the looping beds start once the context unlocks.
  audio.setEngineIntensity(flight.throttle, stateValue === "patrol" || flight.grounded === "airborne");
  if (!audioBedsStarted && audio.proof().unlocked) {
    audioBedsStarted = true;
    pushCue("ambient-wind");
    pushCue("engine-loop");
  }

  syncPlaneVisual();
  syncGhostVisual();
  syncDroneVisuals();
  syncOrbVisuals();

  if (frameCount % 6 === 0) syncHud();
  publishEvidence();
  manualAdvanceFrame();
});

applyRingMaterials();
syncPlaneVisual();
syncHud();
publishEvidence();

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: { position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]], rotation: [0, PAD_HEADING_YAW, 0], targetSize: 4.4 },
    settleSubjectPose() {
      evidenceStaged = true;
      flight = new FlightModel({ position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]], headingYaw: PAD_HEADING_YAW, grounded: "preflight", throttle: 0, speed: 0 });
      syncPlaneVisual();
      syncHud();
      publishEvidence();
    },
    setSubjectSuppressed(suppressed: boolean) {
      planeHandle.setVisible(!suppressed);
    }
  }
});
