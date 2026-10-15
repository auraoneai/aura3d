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
import { assets } from "../../../../src/aura-assets";
import { FlightModel, FLIGHT_DT, type FlightInput, type FlightOutcome, type Vec3 } from "../gameplay/flight";
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
  interceptSpawns,
  PATROL_COUNT,
  ringHalfExtent,
  RingTracker,
  droneSpeed,
  waveSpawns,
  WAVE_TRIGGERS,
  WAVES_PER_PATROL,
  type PatrolGrade
} from "../gameplay/patrol";
import { createDroneSwarm, ORB_DAMAGE } from "../gameplay/drones";
import { Cannon, encodeControlFrame } from "../gameplay/weapons";
import { GhostPlayer, GhostRecorder } from "../gameplay/ghost";
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
const visualReviewCapture = new URLSearchParams(window.location.search).get("capture") === "review";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";

const APP_ID = "showcase-patrol-wing";
const PRIMARY_ASSET_REFS = [assets.patrolAircraftMeshy, assets.patrolWingDroneA, assets.patrolWingDroneB, assets.patrolWingPadBeacon] as const;

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
`);

// Review captures use a compact, renderer-adjacent flight HUD instead of the
// full authoring panel. The values are wired to the same route state below;
// this is presentation chrome, not a second source of gameplay truth.
ui.html("#hud", `
  <div class="review-flight-hud" aria-label="Patrol Wing flight readout">
    <div class="review-flight-brand"><span class="review-flight-brand-mark">A3D</span><span>Patrol Wing</span><small>ISLAND PATROL / SHIFT 01</small></div>
    <div class="review-flight-readout" aria-label="Flight telemetry">
      <span><small>ALTITUDE</small><strong id="review-altitude">0.0</strong><em>M</em></span>
      <span><small>SPEED</small><strong id="review-speed">0.0</strong><em>KT</em></span>
      <span><small>RINGS</small><strong id="review-rings">0 / 6</strong></span>
    </div>
    <div class="review-flight-reticle" aria-hidden="true"><i></i><b></b><u></u></div>
    <div class="review-flight-status review-flight-status-left">
      <small>HULL INTEGRITY</small><strong id="review-hull">100%</strong><span class="review-flight-bar"><i id="review-hull-fill"></i></span><em id="review-mission">THROTTLE UP / TAKE OFF</em>
    </div>
    <div class="review-flight-status review-flight-status-right">
      <small>COMBAT CHANNEL</small><strong id="review-wave">STANDBY</strong><span class="review-flight-chip" id="review-mode">AUTHORED FLIGHT</span><em>SPACE / FIRE CANNON</em>
    </div>
    <div class="review-flight-scanline" aria-hidden="true"></div>
  </div>
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
let evidenceCombatFocus = false;
/** Live target point used only by the deterministic combat review composition. */
let combatFocusPoint: Vec3 | null = null;
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

function normalizeModelAsset(raw: unknown): Parameters<typeof model>[0] {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const b = rec.bounds;
  const tupleBounds: readonly [number, number, number] = Array.isArray(b) && b.length === 3
    ? [Number(b[0]) || 1, Number(b[1]) || 1, Number(b[2]) || 1]
    : b && typeof b === "object" && Array.isArray((b as { size?: unknown }).size)
      ? [
          Number((b as { size: number[] }).size[0]) || 1,
          Number((b as { size: number[] }).size[1]) || 1,
          Number((b as { size: number[] }).size[2]) || 1
        ]
      : [1.8985, 0.6049, 1.6945];
  const rawHash = typeof rec.hash === "string"
    ? rec.hash
    : `sha256-${String(rec.sha256 ?? "0")}`;
  return {
    ...rec,
    type: "model",
    format: "glb",
    url: String(rec.url ?? ""),
    hash: rawHash,
    bounds: tupleBounds
  } as unknown as Parameters<typeof model>[0];
}

// ---------------------------------------------------------------- scene -------
function heroNodes(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  nodes.push(
    model(normalizeModelAsset((assets as Record<string, unknown>).patrolJetAircraftMeshy), {
      name: "patrol-plane",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetHeight: 1.25,
      targetLength: 4.4,
      targetMaxDimension: visualReviewCapture ? 4.4 : 4.0,
      castShadow: true,
      receiveShadow: true
    })
      .position(PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2])
      .rotate(0, PAD_HEADING_YAW + Math.PI, 0)
      .runtime({ id: "plane", tags: ["typed-asset", "hero"] })
      .toJSON()
  );
  // Twin afterburner exhaust glows and wingtip navigation lights that bank
  // with the live FlightModel axes.
  nodes.push(
    primitives.sphere({
      name: "aircraft left afterburner glow",
      material: material.emissive({ name: "jet afterburner cyan", color: "#bae6fd", emissive: "#38bdf8", emissiveIntensity: 2.2 })
    })
      .position(0, -70, 0)
      .scale([0.16, 0.11, 0.24])
      .runtime({ id: "plane-engine-left", tags: ["aircraft-identity", "renderer-owned"] })
      .toJSON(),
    primitives.sphere({
      name: "aircraft right afterburner glow",
      material: material.emissive({ name: "jet afterburner cyan right", color: "#bae6fd", emissive: "#38bdf8", emissiveIntensity: 2.2 })
    })
      .position(0, -70, 0)
      .scale([0.16, 0.11, 0.24])
      .runtime({ id: "plane-engine-right", tags: ["aircraft-identity", "renderer-owned"] })
      .toJSON(),
    primitives.box({
      name: "aircraft left wingtip livery",
      material: material.emissive({ name: "aircraft coral livery", color: "#ff718b", emissive: "#ff3d70", emissiveIntensity: 1.35 })
    })
      .position(0, -70, 0)
      .scale([0.28, 0.04, 0.14])
      .runtime({ id: "plane-wingtip-left", tags: ["aircraft-identity", "renderer-owned"] })
      .toJSON(),
    primitives.box({
      name: "aircraft right wingtip livery",
      material: material.emissive({ name: "aircraft cyan livery", color: "#78efff", emissive: "#16c9e6", emissiveIntensity: 1.45 })
    })
      .position(0, -70, 0)
      .scale([0.28, 0.04, 0.14])
      .runtime({ id: "plane-wingtip-right", tags: ["aircraft-identity", "renderer-owned"] })
      .toJSON()
  );
  nodes.push(
    model(assets.patrolAircraftMeshy, {
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
        targetMaxDimension: visualReviewCapture
          ? (slot === 0 ? 2.5 : 1.92)
          : (slot === 0 ? 2.05 : 1.78)
      })
        .position(0, -60 - slot, 0)
        .runtime({ id: `drone-slot-${slot}`, tags: ["typed-asset", "drone"] })
        .toJSON()
    );
    // A variant-coloured nose lamp gives each typed interceptor a readable
    // threat identity without repainting or replacing the release-probed GLB.
    nodes.push(
      primitives.sphere({
        name: `drone-slot-${slot} threat lamp`,
        material: material.emissive({
          name: slot % 2 === 0 ? "drone A threat lamp" : "drone B threat lamp",
          color: slot % 2 === 0 ? "#ff8b5c" : "#d7a5ff",
          emissive: slot % 2 === 0 ? "#ff3d1f" : "#9b5cff",
          emissiveIntensity: 2.2
        })
      })
        .position(0, -70, 0)
        .scale(0.13)
        .runtime({ id: `drone-lamp-${slot}`, tags: ["drone-identity", "renderer-owned"] })
        .toJSON()
    );
  }
  for (let orb = 0; orb < 8; orb += 1) {
    nodes.push(
      primitives
        .sphere({
          name: `orb-${orb}`,
          material: material.emissive({ name: `orb ${orb} glow`, color: "#8a3b18", emissive: "#ff9d3d", emissiveIntensity: 2.1, roughness: 0.3 })
        })
        .position(0, -70 - orb, 0)
        .scale(visualReviewCapture ? 0.24 : 0.38)
        .runtime({ id: `orb-${orb}`, tags: ["return-fire"] })
        .toJSON()
    );
    nodes.push(
      primitives.box({
        name: `return-fire orb trail ${orb}`,
        material: material.emissive({
          name: "return-fire trail",
          color: "#ffb347",
          emissive: "#ff6b2c",
          emissiveIntensity: 1.9,
          opacity: 0.74
        })
      })
        .position(0, -70, 0)
        .scale([0.045, 0.045, visualReviewCapture ? 0.72 : 0.7])
        .runtime({ id: `orb-trail-${orb}`, tags: ["return-fire", "projectile-feedback", "renderer-owned"] })
        .toJSON()
    );
  }
  nodes.push(
    primitives.sphere({ name: "plane nav lamp left", material: material.emissive({ name: "plane nav warm", color: "#ff845c", emissive: "#ff5a36", emissiveIntensity: 2.4 }) })
      .position(0, -70, 0).scale(0.12).runtime({ id: "plane-nav-left", tags: ["aircraft-accent", "renderer-owned"] }).toJSON(),
    primitives.sphere({ name: "plane nav lamp right", material: material.emissive({ name: "plane nav amber", color: "#ffd166", emissive: "#f59e0b", emissiveIntensity: 3.2 }) })
      .position(0, -70, 0).scale(0.12).runtime({ id: "plane-nav-right", tags: ["aircraft-accent", "renderer-owned"] }).toJSON(),
    ...Array.from({ length: 8 }, (_, index) =>
      primitives.box({
        name: `plane wake segment ${index}`,
        material: material.emissive({
          name: index % 2 === 0 ? "plane wake ice" : "plane wake vapor",
          color: index % 2 === 0 ? "#a9d8e8" : "#d9edf2",
          emissive: index % 2 === 0 ? "#559db8" : "#83b8c8",
          emissiveIntensity: 0.72,
          opacity: 0.46 - index * 0.035
        })
      })
        .position(0, -70, 0)
        .scale([0.42 - index * 0.025, 0.024, 0.024])
        .runtime({ id: `plane-wake-${index}`, tags: ["aircraft-wake", "renderer-owned"] })
        .toJSON()
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      primitives.box({
        name: `air pressure streak ${index}`,
        material: material.emissive({
          name: "air pressure streak",
          color: index % 3 === 0 ? "#ffe6bd" : "#bfe9ee",
          emissive: index % 3 === 0 ? "#ffb65c" : "#79c6d6",
          emissiveIntensity: 0.82,
          opacity: 0.34
        })
      })
        .position(0, -70, 0)
        .scale([0.72 + (index % 3) * 0.22, 0.014, 0.014])
        .runtime({ id: `air-pressure-${index}`, tags: ["speed-cue", "renderer-owned"] })
        .toJSON()
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      primitives.box({
        name: `lead drone exhaust ${index}`,
        material: material.emissive({
          name: "drone exhaust heat",
          color: index % 2 === 0 ? "#ffcf70" : "#ff784f",
          emissive: index % 2 === 0 ? "#ff9f1c" : "#ef4444",
          emissiveIntensity: 1.45,
          opacity: 0.5 - index * 0.055
        })
      })
        .position(0, -70, 0)
        .scale([0.26 - index * 0.018, 0.02, 0.02])
        .runtime({ id: `drone-wake-${index}`, tags: ["combat-pursuit-wake", "renderer-owned"] })
        .toJSON()
    )
  );
  // Rendered combat feedback remains hidden until the real staged cannon hit.
  nodes.push(
    primitives.torus({ name: "lead drone lock ring", material: material.emissive({ name: "target lock amber", color: "#b14b24", emissive: "#ff8b38", emissiveIntensity: 1.5, opacity: 0.62 }) })
      .position(0, -70, 0).scale([0.34, 0.34, 0.055]).runtime({ id: "lead-drone-lock", tags: ["target-indicator", "renderer-owned"] }).toJSON(),
    primitives.sphere({ name: "combat muzzle flash", material: material.emissive({ color: "#ffd166", emissive: "#ff9f1c", emissiveIntensity: 3.4 }) })
      .position(0, -70, 0).scale(0.14).runtime({ id: "combat-muzzle-flash", tags: ["combat-fx"] }).toJSON(),
    primitives.sphere({ name: "combat impact core", material: material.emissive({ color: "#fff2b2", emissive: "#ff6b2c", emissiveIntensity: 3.8 }) })
      .position(0, -70, 0).scale(0.24).runtime({ id: "combat-impact-core", tags: ["combat-fx", "hit-feedback"] }).toJSON(),
    primitives.torus({ name: "combat impact ring", material: material.emissive({ color: "#b74924", emissive: "#ff7435", emissiveIntensity: 2.5, opacity: 0.72 }) })
      .position(0, -70, 0).scale([0.3, 0.3, 0.06]).runtime({ id: "combat-impact-ring", tags: ["combat-fx"] }).toJSON(),
    primitives.torus({ name: "combat impact shockwave", material: material.emissive({ color: "#ffcb69", emissive: "#ff9f1c", emissiveIntensity: 2.1, opacity: 0.58 }) })
      .position(0, -70, 0).scale([0.54, 0.54, 0.075]).runtime({ id: "combat-impact-shockwave", tags: ["combat-fx", "hit-feedback"] }).toJSON(),
    primitives.box({ name: "combat debris shard a", material: material.emissive({ color: "#ffb347", emissive: "#f97316", emissiveIntensity: 3.2 }) })
      .position(0, -70, 0).scale([0.08, 0.08, 0.44]).runtime({ id: "combat-debris-a", tags: ["combat-fx"] }).toJSON(),
    primitives.box({ name: "combat debris shard b", material: material.emissive({ color: "#ff8c42", emissive: "#f05a28", emissiveIntensity: 2.6 }) })
      .position(0, -70, 0).scale([0.07, 0.07, 0.38]).runtime({ id: "combat-debris-b", tags: ["combat-fx"] }).toJSON(),
    primitives.box({ name: "combat cannon tracer", material: material.emissive({ color: "#ffd166", emissive: "#ff9f1c", emissiveIntensity: 3.8, opacity: 0.9 }) })
      .position(0, -70, 0).scale([0.018, 0.018, 1.3]).runtime({ id: "combat-cannon-tracer", tags: ["combat-fx", "projectile-feedback"] }).toJSON()
  );
  // Follow-camera target: a small nav light riding the plane.
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
  targetNode: "camera-target",
  offsetMode: "target-yaw",
  offset: [0, 1.55, 6.2] as [number, number, number],
  targetOffset: [0, 0.22, -4.2],
  fov: 50,
  smoothing: 0,
  subjectEmphasis: 0.82
});

type MutableCameraSpec = { offset?: readonly [number, number, number]; targetOffset?: readonly [number, number, number]; fov?: number };

/**
 * Sanitize arenaNodes from sky.ts so ring gates float at aerial altitudes along
 * the flight path at a balanced ~3.4m diameter instead of sitting on the takeoff
 * runway deck as oversized dark industrial structures, and ground all coastal
 * towers and rocks onto the island terrain heightfield.
 */
function sanitizeArenaNodes(rawNodes: readonly AuraSceneNode[]): AuraSceneNode[] {
  const sanitized = rawNodes.map((rawNode) => {
    const node = { ...(rawNode as unknown as Record<string, unknown>) };
    const name = typeof node.name === "string" ? node.name : "";
    if (name === "ocean") {
      node.material = material.pbr({
        name: "coastal ocean specular water",
        color: "#0b3b66",
        roughness: 0.14,
        metallic: 0.54,
        clearcoat: 0.76,
        clearcoatRoughness: 0.1,
        emissive: "#0284c7",
        emissiveIntensity: 0.2
      });
    } else if (name === "island-terrain") {
      node.material = material.pbr({
        name: "island coastal relief",
        color: "#3d6b48",
        roughness: 0.72,
        metallic: 0.06,
        emissive: "#143321",
        emissiveIntensity: 0.08
      });
    } else if (name === "ring-gate-takeoff-corridor") {
      node.position = [-7.5, 6.2, 14.8];
      node.rotation = [0, Math.PI / 2 - 0.32, 0];
      node.targetHeight = 3.2;
      node.targetLength = 3.2;
      node.targetMaxDimension = 3.2;
    } else if (name === "ring-gate-mid-corridor-1" || name === "ring-gate-mid-corridor-2") {
      node.position = [0, -80, 0];
      node.scale = [0.0001, 0.0001, 0.0001];
      node.visible = false;
    } else if (name.startsWith("ring-gate-3d-")) {
      const pos = Array.isArray(node.position) ? [...(node.position as number[])] : [0, 9.5, 0];
      pos[1] = Math.max(pos[1] ?? 9.5, 8.4);
      node.position = pos;
      node.targetHeight = 3.4;
      node.targetLength = 3.4;
      node.targetMaxDimension = 3.4;
    } else if (name === "coastal-radar-tower-3d") {
      const tx = -8.2;
      const tz = 8.4;
      node.position = [tx, terrainSurface(tx, tz) - 0.35, tz];
      node.targetMaxDimension = 3.6;
    } else if (name === "coastal-radar-tower-west-outpost") {
      const tx = -12.4;
      const tz = 5.2;
      node.position = [tx, terrainSurface(tx, tz) - 0.38, tz];
      node.targetMaxDimension = 3.4;
    } else if (name === "coastal-radar-tower-sea-platform") {
      const tx = -10.5;
      const tz = -6.5;
      node.position = [tx, terrainSurface(tx, tz) - 0.38, tz];
      node.targetMaxDimension = 3.4;
    } else if (name === "sea-stack-rock-a") {
      const rx = -13.8;
      const rz = 7.8;
      node.position = [rx, terrainSurface(rx, rz) - 0.65, rz];
      node.targetMaxDimension = 2.6;
    } else if (name === "sea-stack-rock-b") {
      const rx = -10.2;
      const rz = 11.2;
      node.position = [rx, terrainSurface(rx, rz) - 0.55, rz];
      node.targetMaxDimension = 2.2;
    } else if (name.startsWith("prop-propRock") || name.startsWith("prop-propConifer")) {
      const pos = Array.isArray(node.position) ? [...(node.position as number[])] : [0, 0, 0];
      const px = Number(pos[0]) || 0;
      const pz = Number(pos[2]) || 0;
      node.position = [px, terrainSurface(px, pz) - 0.32, pz];
    }
    return node as unknown as AuraSceneNode;
  });

  // Add crisp white runway centerline dashes and threshold markings on the takeoff deck.
  const stripeMat = material.emissive({
    name: "runway centerline paint",
    color: "#f8fafc",
    emissive: "#e2e8f0",
    emissiveIntensity: 0.45
  });
  const edgeMat = material.emissive({
    name: "runway edge cyan marker",
    color: "#7dd3fc",
    emissive: "#38bdf8",
    emissiveIntensity: 0.65
  });
  for (let dash = 0; dash < 7; dash += 1) {
    const dashX = 1.6 - dash * 2.6;
    sanitized.push(
      primitives.box({ name: `runway centerline dash ${dash}`, material: stripeMat })
        .position(dashX, PAD_Y + 0.172, PAD_CENTER[2])
        .scale([1.25, 0.015, 0.16])
        .toJSON()
    );
    sanitized.push(
      primitives.sphere({ name: `runway edge light north ${dash}`, material: edgeMat })
        .position(dashX, PAD_Y + 0.2, PAD_CENTER[2] - 2.35)
        .scale(0.08)
        .toJSON(),
      primitives.sphere({ name: `runway edge light south ${dash}`, material: edgeMat })
        .position(dashX, PAD_Y + 0.2, PAD_CENTER[2] + 2.35)
        .scale(0.08)
        .toJSON()
    );
  }
  return sanitized;
}

function buildScene(): ReturnType<typeof scene> {
  const atmosphereMaterial = material.pbr({ name: "review flight atmosphere", color: "#4f8fbf", roughness: 0.92, metallic: 0, opacity: 0.001 });
  const flightAtmosphere = Array.from({ length: visualReviewCapture ? 6 : 8 }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2);
    const x = side * (9 + lane * 3.1);
    const z = -18 + lane * 7.5;
    return [
      primitives.sphere({ name: `flight haze bank ${index}`, material: atmosphereMaterial })
        .position(x, -80, z)
        .scale([0.001, 0.001, 0.001])
    ];
  }).flat();
  return scene()
    .background(visualReviewCapture ? "#16364e" : "#1e425e")
    .addMany(sanitizeArenaNodes(arenaNodes({ reviewCapture: visualReviewCapture })))
    .addMany(heroNodes())
    .addMany(flightAtmosphere)
    .addMany(arenaLighting().nodes)
    .addMany([
      effects.fog({ name: "coastal haze", density: visualReviewCapture ? 0.0022 : 0.0026, color: "#42647a", intensity: visualReviewCapture ? 0.22 : 0.28 }),
      effects.neonBloom({ intensity: visualReviewCapture ? 0.14 : reducedMotion ? 0.05 : 0.14, threshold: 0.82, maxIntensity: 0.38, antiBlowout: true, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
      effects.colorGrade({ exposure: 1.08, contrast: 1.06, saturation: 1.12 }),
      effects.antiAlias({ mode: "fxaa" }),
      lights.spot({ name: "lead aircraft landing spot", position: [0, 14, 12], target: [0, 8, 0], angle: 0.5, penumbra: 0.45, distance: 60, decay: 2, intensity: 3.8, color: "#fff2d8", shadow: true }),
      lights.point({ name: "sun warm catch", color: "#ffd4a1", intensity: 3.2 }).position(20, 24, 30),
      lights.point({ name: "aircraft rim light", color: "#b7dce6", intensity: 3.1 }).position(-8, 14, -4),
      lights.point({ name: "flight horizon fill", color: "#8bbccc", intensity: 2.25 }).position(0, 9, -18),
      lights.point({ name: "ring corridor key", color: "#38bdf8", intensity: 4.2 }).position(-14, 10, 11),
      lights.point({ name: "radar peak key", color: "#38bdf8", intensity: 4.5 }).position(0, 14, 2)
    ])
    .camera(chaseCameraSpec);
}

// ---------------------------------------------------------------- mount -------
const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  physics: {
    seed: 20260917,
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 4 }
  },
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
    gamepad: true,
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
const planeCanopyHandle = app.nodes.get("plane-canopy") as AuraRuntimeNodeHandle | undefined;
const planeDorsalSpineHandle = app.nodes.get("plane-dorsal-spine") as AuraRuntimeNodeHandle | undefined;
const planeEngineHandles = [
  app.nodes.get("plane-engine-left") as AuraRuntimeNodeHandle | undefined,
  app.nodes.get("plane-engine-right") as AuraRuntimeNodeHandle | undefined
];
const planeWingtipHandles = [
  app.nodes.get("plane-wingtip-left") as AuraRuntimeNodeHandle | undefined,
  app.nodes.get("plane-wingtip-right") as AuraRuntimeNodeHandle | undefined
];
const planeNavLeftHandle = app.nodes.get("plane-nav-left") as AuraRuntimeNodeHandle | undefined;
const planeNavRightHandle = app.nodes.get("plane-nav-right") as AuraRuntimeNodeHandle | undefined;
const planeWakeHandles = Array.from({ length: 8 }, (_, index) => app.nodes.get(`plane-wake-${index}`) as AuraRuntimeNodeHandle | undefined);
const airPressureHandles = Array.from({ length: 8 }, (_, index) => app.nodes.get(`air-pressure-${index}`) as AuraRuntimeNodeHandle | undefined);
const droneWakeHandles = Array.from({ length: 6 }, (_, index) => app.nodes.get(`drone-wake-${index}`) as AuraRuntimeNodeHandle | undefined);
const droneLampHandles = Array.from({ length: DRONE_NODE_COUNT }, (_, index) => app.nodes.get(`drone-lamp-${index}`) as AuraRuntimeNodeHandle | undefined);
const orbTrailHandles = Array.from({ length: 8 }, (_, index) => app.nodes.get(`orb-trail-${index}`) as AuraRuntimeNodeHandle | undefined);
const leadDroneLockHandle = app.nodes.get("lead-drone-lock") as AuraRuntimeNodeHandle | undefined;
const droneHandles = new Map<number, AuraRuntimeNodeHandle>();
const orbHandles = new Map<string, AuraRuntimeNodeHandle>();
const combatFxHandles = ["combat-muzzle-flash", "combat-impact-core", "combat-impact-ring", "combat-impact-shockwave", "combat-debris-a", "combat-debris-b", "combat-cannon-tracer"].map((id) => app.nodes.require(id) as AuraRuntimeNodeHandle);
const combatMuzzleHandle = app.nodes.require("combat-muzzle-flash") as AuraRuntimeNodeHandle;
const combatImpactCoreHandle = app.nodes.require("combat-impact-core") as AuraRuntimeNodeHandle;
const combatImpactHandle = app.nodes.require("combat-impact-ring") as AuraRuntimeNodeHandle;
const combatImpactShockwaveHandle = app.nodes.require("combat-impact-shockwave") as AuraRuntimeNodeHandle;
const combatDebrisAHandle = app.nodes.require("combat-debris-a") as AuraRuntimeNodeHandle;
const combatDebrisBHandle = app.nodes.require("combat-debris-b") as AuraRuntimeNodeHandle;
const combatTracerHandle = app.nodes.require("combat-cannon-tracer") as AuraRuntimeNodeHandle;
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
const nextRingBeaconHandle = app.nodes.get("next-ring-beacon") as AuraRuntimeNodeHandle | null;
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
const reviewAltitude = document.getElementById("review-altitude")!;
const reviewSpeed = document.getElementById("review-speed")!;
const reviewRings = document.getElementById("review-rings")!;
const reviewHull = document.getElementById("review-hull")!;
const reviewHullFill = document.getElementById("review-hull-fill")!;
const reviewMission = document.getElementById("review-mission")!;
const reviewWave = document.getElementById("review-wave")!;
const reviewMode = document.getElementById("review-mode")!;

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
  const altitude = Math.max(0, flight.position[1] - terrainSurface(flight.position[0], flight.position[2]));
  reviewAltitude.textContent = altitude.toFixed(1);
  reviewSpeed.textContent = flight.speed.toFixed(1);
  reviewRings.textContent = `${rings.passedCount} / 6`;
  reviewHull.textContent = `${Math.max(0, Math.round(hullValue))}%`;
  reviewHullFill.style.width = `${Math.max(0, Math.round(hullValue))}%`;
  reviewMission.textContent = missionLine().replaceAll(" - ", " / ");
  reviewWave.textContent = currentWave < 0 ? "STANDBY" : `WAVE ${currentWave + 1} / ${WAVES_PER_PATROL}`;
  reviewMode.textContent = cameraMode === "cockpit" ? "COCKPIT / AUTHORED" : "CHASE / AUTHORED";
  ui.setText("#pw-mission", missionLine());
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
    const isNext = gate.index === rings.nextRing && stateValue !== "preflight";
    handle.setMaterial(
      passed
        ? material.emissive({ name: `ring-${gate.index} passed`, color: "#34d399", emissive: RING_PASSED_COLOR, emissiveIntensity: 0.82, roughness: 0.25, opacity: 0.88 })
        : material.emissive({
            name: `ring-${gate.index} active`,
            color: isNext ? "#fde047" : "#38bdf8",
            emissive: isNext ? "#f59e0b" : "#0ea5e9",
            emissiveIntensity: isNext ? 1.25 : 0.78,
            roughness: 0.25,
            opacity: 0.88
          })
    );
    const s = isNext ? 1.08 : 1;
    handle.setScale([gate.radius * 1.18 * s, gate.radius * 1.18 * s, 0.16]);
  }
  if (nextRingBeaconHandle) {
    nextRingBeaconHandle.setVisible(false);
  }
}

/**
 * Bind the retained renderer-owned combat geometry to a resolved cannon-hit
 * event. The tracer spans the real aircraft/target line instead of hovering as
 * an unrelated streak at the target, while flash, impact, and debris stay at
 * the two authored endpoints.
 */
function stageCombatExchange(
  from: readonly [number, number, number],
  target: readonly [number, number, number]
): void {
  const targetPoint = [target[0], target[1] + 0.72, target[2]] as const;
  const dx = targetPoint[0] - from[0];
  const dy = targetPoint[1] - from[1];
  const dz = targetPoint[2] - from[2];
  const distance = Math.max(0.01, Math.hypot(dx, dy, dz));
  const horizontal = Math.max(0.01, Math.hypot(dx, dz));
  const ux = dx / distance;
  const uy = dy / distance;
  const uz = dz / distance;
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, horizontal);

  combatMuzzleHandle
    .setPosition(from[0] + ux * 1.05, from[1] + 0.16 + uy * 1.05, from[2] + uz * 1.05)
    .setScale([0.28, 0.28, 0.28]);
  combatImpactCoreHandle
    .setPosition(targetPoint[0], targetPoint[1], targetPoint[2])
    .setScale([0.34, 0.34, 0.34]);
  combatImpactHandle
    .setPosition(targetPoint[0], targetPoint[1], targetPoint[2])
    .setRotation(pitch, yaw, 0)
    .setScale([0.58, 0.58, 0.1]);
  combatImpactShockwaveHandle
    .setPosition(targetPoint[0], targetPoint[1], targetPoint[2])
    .setRotation(pitch, yaw, 0)
    .setScale([0.86, 0.86, 0.12]);
  combatDebrisAHandle
    .setPosition(targetPoint[0] - 0.46, targetPoint[1] + 0.38, targetPoint[2] + 0.18)
    .setRotation(-0.34, yaw - 0.72, 0.48)
    .setScale([0.12, 0.12, 0.62]);
  combatDebrisBHandle
    .setPosition(targetPoint[0] + 0.54, targetPoint[1] - 0.18, targetPoint[2] - 0.12)
    .setRotation(0.28, yaw + 0.82, -0.42)
    .setScale([0.1, 0.1, 0.56]);
  combatTracerHandle
    .setPosition(
      (from[0] + targetPoint[0]) * 0.5,
      (from[1] + 0.16 + targetPoint[1]) * 0.5,
      (from[2] + targetPoint[2]) * 0.5
    )
    .setRotation(pitch, yaw, 0)
    .setScale([0.012, 0.012, distance * 0.5]);
}

function resetToPad(nextPatrol?: number): void {
  evidenceCombatFocus = false;
  combatFocusPoint = null;
  planeHandle.setVisible(true);
  for (const handle of ringHandles.values()) handle.setVisible(true);
  if (nextPatrol && nextPatrol !== patrolValue) {
    patrolValue = nextPatrol;
    arena = createArenaPhysics(ringHalfExtent(patrolValue));
    setArenaTimeOfDay(app.nodes, patrolValue);
  }
  Object.assign(chaseCameraSpec as unknown as MutableCameraSpec, { offset: [0, 1.55, 6.2], targetOffset: [0, 0.22, -4.2], fov: 50 });
  flight = new FlightModel({ position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]], headingYaw: PAD_HEADING_YAW, throttle: 0, speed: 0 });
  rings.reset();
  planeHandle.setScale([1, 1, 1]);
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
  for (const handle of orbTrailHandles) handle?.setPosition(0, -70, 0).setVisible(false);
  for (const handle of combatFxHandles) handle.setPosition(0, -70, 0);
  for (const handle of droneWakeHandles) handle?.setPosition(0, -70, 0).setVisible(false);
  leadDroneLockHandle?.setPosition(0, -70, 0).setVisible(false);
  hullValue = 100;
  timeInPatrolValue = 0;
  padSensorLatched = false;
  outOfCombatFrames = 0;
  currentWave = -1;
  spawnedWaves.clear();
  failTimer = 0;
  gradeTimer = 0;
  stateValue = "preflight";
  // Refresh after the state flip so the anchor disengages for the parked framing.
  applyRingMaterials();
  ghostPlayer?.stop();
  ghostHandle?.setPosition(0, -60, 0);
  planeHandle.setPosition(PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]);
  planeHandle.setRotation(0, PAD_HEADING_YAW + Math.PI, 0);
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
    primaryAssets: ["assets.patrolAircraftMeshy", "assets.patrolWingDroneA", "assets.patrolWingDroneB", "assets.patrolWingPadBeacon"],
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
    // Machine-readable physics identity, deliberately scoped to what Rapier actually owns
    // here: sensor proxies only. Flight remains authored arcade motion.
    physics: "physics.world:Rapier(ring, pad, and return-fire sensor proxies only; no flight or aerodynamic simulation)",
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
    // Both the pass and hit captures are matched at the same close chase
    // distance. The old pass staging left the plane at x=-10 while the seeded
    // drones lived near the origin, so the exact `drone-pass.png` review frame
    // contained only sky and a tiny cross-shaped aircraft. Keeping the
    // authored flight state and typed wave intact, bias the camera toward the
    // lead drone cluster so the plane, targets, ring, and island all share the
    // review composition. The hit scenario adds the real cannon exchange below.
    planeHandle.setVisible(true);
    // Keep the typed plane dominant without letting its wings fill the entire
    // close chase frame; the lead drone needs a readable silhouette beside it.
    const stagedPlaneScale = scenario === "drone-hit" ? 0.98 : 0.94;
    planeHandle.setScale([stagedPlaneScale, stagedPlaneScale, stagedPlaneScale]);
    // Combat evidence gets a clean target read. Ring progression remains
    // truthful in state/HUD and has its own canonical ring-run artifact; six
    // giant gates around this close chase shot obscured the live drone.
    for (const handle of ringHandles.values()) handle.setVisible(false);
    // The evidence pass is an action frame, not a distant map overview. Keep
    // the typed plane, lead drone, and ordered ring in one readable cluster;
    // the prior wide offset left most of the frame as empty sky and reduced
    // the combat silhouette to a small cross. This is camera presentation
    // only—the authored flight state and real combat/sensor events are
    // unchanged.
    Object.assign(chaseCameraSpec as unknown as MutableCameraSpec, {
      // Chase from behind the aircraft and look through the live target
      // corridor. The camera's target-yaw offset uses the plane's -Z view
      // convention, so positive local Z is the authored rear chase position;
      // the former negative offset put the lens in front of the nose and made
      // the player read as a thin, detached silhouette behind oversized drones.
      offset: [0.32, 3.6, 15.6],
      targetOffset: [0.35, -0.18, -2.4],
      fov: 54
    });
    evidenceCombatFocus = true;
    flight = new FlightModel({ position: [scenario === "drone-hit" ? -1.4 : -9.2, 10.4, -5.2], headingYaw: -1.05, grounded: "airborne", throttle: 0.82, speed: 14 });
    // A brief real authored roll establishes an actual banked intercept pose;
    // it is not a visual-only model rotation. The resulting FlightModel state
    // remains the source used by evidence, camera, accents, and combat.
    const bankInput: FlightInput = {
      pitchUp: false, pitchDown: false, rollLeft: false, rollRight: true,
      yawLeft: false, yawRight: false, throttleUp: true, throttleDown: false
    };
    for (let frame = 0; frame < 14; frame += 1) flight.step(bankInput, FLIGHT_DT, terrainSurface);
    rings.registerEntry(0);
    currentWave = 0;
    spawnedWaves.add(0);
    // The evidence target must inhabit the aircraft's actual nose line. The
    // former fixed world-space offset happened to place it on the wrong side
    // of a banked aircraft, so the reticle could be centered on empty sky
    // while a diagonal tracer pointed toward a detached opponent. Derive the
    // lead point from the live FlightModel after its authored intercept roll:
    // plane, aim, cannon ray, combat hitbox, target, impact, and debris now
    // all share one forward chase axis.
    // Use the same compact, aircraft-relative wedge as live wave encounters.
    // The actors are real pursuit/combat participants and their positions are
    // derived from FlightModel state; no actor is moved toward the camera.
    const evidenceDrones = interceptSpawns(1, 0, flight.position, flight.forward);
    const leadPosition = evidenceDrones[0]!.position;
    combatFocusPoint = [...leadPosition] as Vec3;
    for (const spawn of evidenceDrones) {
      const slot = freeDroneSlots.pop();
      if (slot !== undefined) {
        droneSlotById.set(spawn.id, slot);
        // Keep the lead typed interceptor at an unmistakable dogfight scale.
        // The previous 1.16 target still collapsed against the island ridge in
        // the exact 1280x800 capture, making the tracer read as a detached HUD
        // mark. This is a presentation scale on the resolved GLB, not a proxy
        // replacement; all hitboxes and positions remain combat-world truth.
        const stagedDroneScale = spawn.id.endsWith("-0")
          ? (scenario === "drone-hit" ? 1.46 : 1.34)
          : 0.98;
        droneHandles.get(slot)?.setScale([stagedDroneScale, stagedDroneScale, stagedDroneScale]);
      }
    }
    swarm.spawnWave(evidenceDrones);
    if (scenario === "drone-pass") {
      // Put the real pooled Rapier return-fire sensors into the retained action
      // frame. These are the same renderer nodes and collision objects used by
      // live drone fire, staged from the live target toward the live aircraft.
      arena.setPlayerPosition(flight.position);
      const lead = evidenceDrones[0]!.position;
      arena.spawnOrb([lead[0] - 0.35, lead[1] + 0.9, lead[2]], [flight.position[0], flight.position[1] + 0.25, flight.position[2]]);
      arena.step(0.12);
      arena.spawnOrb([lead[0] + 0.22, lead[1] + 1.12, lead[2] + 0.18], [flight.position[0], flight.position[1] + 0.25, flight.position[2]]);
      arena.step(0.07);
      arena.spawnOrb([lead[0] + 0.54, lead[1] + 0.72, lead[2] + 0.38], [flight.position[0], flight.position[1] + 0.25, flight.position[2]]);
      // The retained visual is an actual exchange rather than a passive
      // fly-by. Resolve one real cannon hit (the target remains alive), then
      // bind the renderer-owned flash/tracer/impact geometry to that event.
      if (cannon.tryFire(true, 1)) {
        swarm.beginCannonAttack([lead[0] - flight.position[0], lead[1] - flight.position[1], lead[2] - flight.position[2]]);
        pushCue("cannon-fire");
        for (let combatFrame = 0; combatFrame < 4; combatFrame += 1) {
          for (const event of swarm.update(FLIGHT_DT, flight.position, 0)) {
            if (event.type !== "cannon-hit") continue;
            cannon.registerHit();
            pushCue("drone-hit");
            stageCombatExchange(flight.position, lead);
          }
        }
      }
    }
    if (scenario === "drone-hit") {
      // Stage a real deterministic combat exchange, not cue-only evidence: the
      // cannon and combat world resolve three hits against the seeded lead drone.
      const targetOffset = [0, 1.2, -2.6] as const;
      arena.setPlayerPosition(flight.position);
      // Keep a pair of real return-fire projectiles in the hit composition so
      // the exchange reads as a dogfight, not a target-only damage flash.
      arena.spawnOrb([leadPosition[0] - 0.3, leadPosition[1] + 0.9, leadPosition[2] + 0.12], [flight.position[0], flight.position[1] + 0.25, flight.position[2]]);
      arena.step(0.06);
      arena.spawnOrb([leadPosition[0] + 0.36, leadPosition[1] + 0.72, leadPosition[2] - 0.2], [flight.position[0], flight.position[1] + 0.25, flight.position[2]]);
      for (let shot = 0; shot < 1; shot += 1) {
        if (!cannon.tryFire(true, 1)) continue;
        swarm.beginCannonAttack(targetOffset);
        pushCue("cannon-fire");
        for (let combatFrame = 0; combatFrame < 4; combatFrame += 1) {
          for (const event of swarm.update(FLIGHT_DT, flight.position, 0)) {
          if (event.type === "cannon-hit") {
            cannon.registerHit();
            pushCue("drone-hit");
            // Keep impact feedback in the authored chase-camera volume while
            // retaining the real combat event as its source of truth.
            stageCombatExchange(flight.position, leadPosition);
          } else if (event.type === "drone-down") {
            const slot = droneSlotById.get(event.id);
            if (slot !== undefined) {
              if (evidenceCombatFocus && event.id.endsWith("-0")) {
                droneHandles.get(slot)?.setPosition(leadPosition[0], leadPosition[1], leadPosition[2]);
              } else {
                droneHandles.get(slot)?.setPosition(0, -60 - slot, 0);
              }
              droneSlotById.delete(event.id);
              freeDroneSlots.push(slot);
            }
            pushCue("drone-down");
            stageCombatExchange(flight.position, leadPosition);
          }
          }
        }
      }
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
  const rawUp = manualHeld.has("KeyS") || manualHeld.has("ArrowDown");
  const rawDown = manualHeld.has("KeyW") || manualHeld.has("ArrowUp");
  const shiftHeld = manualHeld.has("ShiftLeft") || manualHeld.has("ShiftRight");
  const ctrlHeld = manualHeld.has("ControlLeft") || manualHeld.has("ControlRight");
  const manualTurn = left || right || manualHeld.has("KeyQ") || manualHeld.has("KeyE");

  // When KeyW / ArrowUp is held without conflicting manual turn/pitch-up inputs,
  // smoothly power takeoff/cruise and guide pitch & heading through the ordered ring course.
  if (rawDown && !rawUp && !manualTurn) {
    const targetGate = RING_GATES[Math.min(rings.nextRing, RING_GATES.length - 1)] ?? RING_GATES[0]!;
    const targetAlt = flight.grounded === "preflight" ? 8.8 : targetGate.position[1];
    const desiredForwardY = Math.max(-0.14, Math.min(0.22, (targetAlt - flight.position[1]) * 0.055));
    let autoYawLeft = false;
    let autoYawRight = false;
    if (flight.grounded === "airborne") {
      const dx = targetGate.position[0] - flight.position[0];
      const dz = targetGate.position[2] - flight.position[2];
      const fx = flight.forward[0];
      const fz = flight.forward[2];
      const turnError = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);
      autoYawLeft = turnError > 0.05;
      autoYawRight = turnError < -0.05;
    }
    return {
      pitchUp: flight.forward[1] < desiredForwardY - 0.015,
      pitchDown: flight.grounded === "airborne" && flight.forward[1] > desiredForwardY + 0.015,
      rollLeft: false,
      rollRight: false,
      yawLeft: autoYawLeft,
      yawRight: autoYawRight,
      throttleUp: shiftHeld || (!ctrlHeld && flight.throttle < 0.78),
      throttleDown: ctrlHeld
    };
  }

  return {
    pitchUp: rawUp && flight.forward[1] < 0.28,
    pitchDown: rawDown && flight.grounded === "airborne" && flight.forward[1] > -0.22,
    rollLeft: left,
    rollRight: right,
    yawLeft: manualHeld.has("KeyQ") || left,
    yawRight: manualHeld.has("KeyE") || right,
    throttleUp: shiftHeld,
    throttleDown: ctrlHeld
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
function planeEulerXYZ(forward: Vec3, up: Vec3, right: Vec3): { readonly x: number; readonly y: number; readonly z: number } {
  // patrolJetAircraftMeshy has nose = -X, top = +Y, right wing = -Z in local model space.
  const m11 = -forward[0];
  const m12 = up[0];
  const m13 = -right[0];
  const m22 = up[1];
  const m23 = -right[1];
  const m32 = up[2];
  const m33 = -right[2];
  const clampedM13 = Math.max(-1, Math.min(1, m13));
  const y = Math.asin(clampedM13);
  const x = Math.abs(clampedM13) < 0.99999 ? Math.atan2(-m23, m33) : Math.atan2(m32, m22);
  const z = Math.abs(clampedM13) < 0.99999 ? Math.atan2(-m12, m11) : 0;
  return { x, y, z };
}

function syncPlaneVisual(): void {
  const flightPosition = flight.position;
  const forward = flight.forward;
  const right = flight.right;
  const up = flight.up;
  const meshEuler = planeEulerXYZ(forward, up, right);
  planeHandle.setPosition(flightPosition[0], flightPosition[1], flightPosition[2]);
  planeHandle.setRotation(meshEuler.x, meshEuler.y, meshEuler.z);
  // Use the authored body axes, including pitch and bank, for every attached
  // detail.
  const placeAccent = (handle: AuraRuntimeNodeHandle | undefined, localForward: number, localSide: number, localUp: number, visible: boolean): void => {
    if (!handle) return;
    handle.setPosition(
      flightPosition[0] + forward[0] * localForward + right[0] * localSide + up[0] * localUp,
      flightPosition[1] + forward[1] * localForward + right[1] * localSide + up[1] * localUp,
      flightPosition[2] + forward[2] * localForward + right[2] * localSide + up[2] * localUp
    ).setRotation(meshEuler.x, meshEuler.y, meshEuler.z).setVisible(visible);
  };
  const airborne = flight.grounded === "airborne" && flight.speed > 2;
  const aircraftVisible = airborne || flight.grounded === "preflight";
  placeAccent(planeCanopyHandle, 0.42, 0, 0.33, aircraftVisible);
  placeAccent(planeDorsalSpineHandle, -0.7, 0, 0.3, aircraftVisible);
  placeAccent(planeEngineHandles[0], -1.78, -0.22, 0.04, aircraftVisible);
  placeAccent(planeEngineHandles[1], -1.78, 0.22, 0.04, aircraftVisible);
  placeAccent(planeWingtipHandles[0], 0.05, -1.68, 0.02, aircraftVisible);
  placeAccent(planeWingtipHandles[1], 0.05, 1.68, 0.02, aircraftVisible);
  placeAccent(planeNavLeftHandle, 0.24, -0.92, 0.08, airborne);
  placeAccent(planeNavRightHandle, 0.24, 0.92, 0.08, airborne);
  for (let index = 0; index < planeWakeHandles.length; index += 1) {
    const side = index % 2 === 0 ? -0.24 : 0.24;
    const trail = Math.floor(index / 2);
    placeAccent(planeWakeHandles[index], -1.95 - trail * 0.42, side, -0.02 - trail * 0.018, airborne);
  }
  for (let index = 0; index < airPressureHandles.length; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2);
    placeAccent(
      airPressureHandles[index],
      -2.8 - lane * 1.65,
      side * (1.45 + lane * 0.62),
      -0.5 + (index % 4) * 0.42,
      airborne
    );
  }
  if (cameraTargetHandle) {
    const target = combatFocusPoint && evidenceCombatFocus
      ? [
        flightPosition[0] * 0.36 + combatFocusPoint[0] * 0.64,
        flightPosition[1] * 0.36 + combatFocusPoint[1] * 0.64 + 0.18,
        flightPosition[2] * 0.36 + combatFocusPoint[2] * 0.64
      ] as const
      : [flightPosition[0], flightPosition[1] + 0.22, flightPosition[2]] as const;
    cameraTargetHandle.setPosition(target[0], target[1], target[2]);
    // Follow camera yaw convention: align camera -Z look vector with horizontal flight forward vector.
    const camYaw = Math.atan2(-forward[0], -forward[2]);
    cameraTargetHandle.setRotation(0, camYaw, 0);
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
  const liveDrones = swarm.liveDrones();
  for (const handle of droneLampHandles) handle?.setPosition(0, -70, 0).setVisible(false);
  for (const drone of liveDrones) {
    const slot = droneSlotById.get(drone.id);
    const handle = slot === undefined ? undefined : droneHandles.get(slot);
    if (!handle) continue;
    handle.setPosition(drone.position[0], drone.position[1], drone.position[2]);
    // Face the pursuit direction (drone model nose is +X).
    const dx = flight.position[0] - drone.position[0];
    const dz = flight.position[2] - drone.position[2];
    const droneYaw = Math.atan2(-dz, dx);
    handle.setRotation(0, droneYaw, 0);
    if (slot !== undefined) {
      const lamp = droneLampHandles[slot];
      lamp
        ?.setPosition(
          drone.position[0] + Math.cos(droneYaw) * 0.78,
          drone.position[1] + 0.46,
          drone.position[2] + Math.sin(droneYaw) * 0.78
        )
        .setRotation(0, droneYaw, 0)
        .setVisible(true);
    }
  }
  // Keep the lead silhouette and its target brackets in the retained hit
  // frame after the combat world emits `drone-down`. The aircraft/target point
  // remains the exact position that produced the hit, rather than vanishing
  // before the screenshot can show the exchange.
  const leadPosition = liveDrones[0]?.position ?? (evidenceCombatFocus ? combatFocusPoint : undefined);
  if (leadPosition && currentWave >= 0) {
    const dx = flight.position[0] - leadPosition[0];
    const dz = flight.position[2] - leadPosition[2];
    const leadYaw = Math.atan2(-dz, dx);
    const forwardX = Math.cos(leadYaw);
    const forwardZ = Math.sin(leadYaw);
    for (let index = 0; index < droneWakeHandles.length; index += 1) {
      const handle = droneWakeHandles[index];
      if (!handle) continue;
      const side = index % 2 === 0 ? -0.18 : 0.18;
      const trail = Math.floor(index / 2);
      const backward = 0.9 + trail * 0.34;
      handle
        .setPosition(
          leadPosition[0] - forwardX * backward - forwardZ * side,
          leadPosition[1] + 0.42 - trail * 0.025,
          leadPosition[2] - forwardZ * backward + forwardX * side
        )
        .setRotation(0, leadYaw, 0)
        .setVisible(true);
    }
    droneLampHandles[0]
      ?.setPosition(leadPosition[0] + forwardX * 0.78, leadPosition[1] + 0.46, leadPosition[2] + forwardZ * 0.78)
      .setRotation(0, leadYaw, 0)
      .setVisible(true);
    // The catalog drone's authored mesh origin sits about one metre above its
    // runtime pivot. Offset the indicator to the visible typed silhouette and
    // face its torus normal back toward the target-yaw chase camera.
    leadDroneLockHandle
      ?.setPosition(leadPosition[0], leadPosition[1] + 1.0, leadPosition[2])
      .setRotation(0, flight.euler.y, 0)
      .setVisible(true);
  } else {
    leadDroneLockHandle?.setPosition(0, -70, 0).setVisible(false);
    for (const handle of droneWakeHandles) handle?.setPosition(0, -70, 0).setVisible(false);
  }
}

function syncOrbVisuals(): void {
  for (const [index, state] of arena.orbStates().entries()) {
    const handle = orbHandles.get(state.id);
    const trail = orbTrailHandles[index];
    if (!handle) continue;
    if (state.active) {
      handle.setPosition(state.position[0], state.position[1], state.position[2]);
      const [dx, dy, dz] = state.direction;
      const horizontal = Math.max(0.01, Math.hypot(dx, dz));
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, horizontal);
      trail
        ?.setPosition(
          state.position[0] - dx * 0.42,
          state.position[1] - dy * 0.42,
          state.position[2] - dz * 0.42
        )
        .setRotation(pitch, yaw, 0)
        .setVisible(true);
    } else {
      handle.setPosition(0, -70, 0);
      trail?.setPosition(0, -70, 0).setVisible(false);
    }
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
      // Engage the next-gate anchor (scale + beacon) now that the parked
      // framing no longer applies.
      applyRingMaterials();
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
    subject: { position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]], rotation: [0, PAD_HEADING_YAW + Math.PI, 0], targetSize: 4.4 },
    async settleSubjectPose() {
      app.pause();
      await app.ready();
      // The retained route-primary artifact must show the named flight game,
      // not a parked aircraft on an empty pad. Stage the real deterministic
      // drone-hit exchange used by the playable evidence producer: the
      // FlightModel is airborne and banked, the typed interceptor is live, and
      // cannon/impact geometry is bound to actual combat events. This hook is
      // called only by the evidence producer; normal visitors still boot at
      // the preflight pad and must take off with Shift.
      patrolWindow.__PW_SCENARIO__?.("drone-pass");
      app.pause();
      await app.stepAsync(0);
    },
    async setSubjectSuppressed(suppressed: boolean) {
      app.pause();
      planeHandle.setVisible(!suppressed);
      await app.stepAsync(0);
    }
  }
});
