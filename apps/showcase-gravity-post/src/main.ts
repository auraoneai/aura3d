/**
 * Gravity Post — route assembly.
 *
 * One mounted Aura app. The solar system scene kit supplies the presentational
 * backdrop (static sun family, starfield, dust); the playable system is authored
 * route-local arcade gravity around six wells (sun + five planets), explicitly
 * NON-PHYSICAL design values. Delivery triggers are real physics sensor bodies:
 * the pod is a kinematic body driven by the authored integrator, and captures
 * fire through app.physics.onTriggerEnter.
 *
 * Label: prototype. Authored arcade gravity, non-physical.
 */
import {
  createAuraApp,
  createCollisionLayers,
  camera,
  effects,
  game,
  labels,
  lights,
  material,
  model,
  primitives,
  scene,
  prefabs,
  type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { CONTRACTS, WELL_BODIES, stationById, stationPosition } from "./contracts";
import { createFlybyState, flybyBody, requestFlyby, skipFlyby, updateFlyby } from "./flyby";
import {
  ADRIFT_LIMIT_SECONDS,
  DOCK_SENSOR_RADIUS,
  TIME_WARP_MULTIPLIER,
  createPodRuntime,
  applyCorrection,
  evaluateCapture,
  launch,
  resetPodForContract,
  updateCoast,
  type PodEvent,
  type PodRuntimeState
} from "./pod";
import {
  PREDICTION_DIVERGENCE_TOLERANCE,
  PREDICTION_MAX_STEPS,
  buildPredictionBeads
} from "./prediction";
import { SHIFT_FAIL_LIMIT, scoreContract, type ScoreBreakdown } from "./scoring";
import { POD_BODY_SPEC, PLAY_PLANE_Y, buildStations, dockSensorBodySpec } from "./stations";
import { createGravityPostAudio, type GravityPostAudio } from "./post-audio";
import { FIXED_DT, dockPointHash, integratePath, type TrajectorySample } from "./wells";
import "./styles.css";

// ---------------------------------------------------------------------------
// Route-local design constants (documented, tuned for readability)
// ---------------------------------------------------------------------------
const MAX_LAUNCH_SPEED = 2.85;
const MIN_LAUNCH_POWER = 0.18;
const AIM_DRAG_PIXEL_RANGE = 190;
const PREDICTION_BEADS = 30;
const ACTUAL_PATH_BEADS = 36;
const SPARK_COUNT = 8;
const FLYBY_DRONES = 6;
const POD_VISUAL_SCALE = 0.2;

const BODY_COLORS: Readonly<Record<string, string>> = {
  sol: "#ffd166",
  cinder: "#cbd5e1",
  verdance: "#fbbf24",
  aquaria: "#38bdf8",
  rust: "#f97316",
  gale: "#f5d0a9"
};

const CONTROLS = [
  "drag: aim + power (live prediction line)",
  "W/S: spend one bounded prograde/retrograde correction token",
  "Space hold: time-warp x8 (coasting only)",
  "N: next contract (after dock)",
  "R: retry contract",
  "P: pause"
] as const;

const CLAIM_BOUNDARY =
  "Prototype. Authored arcade gravity, non-physical: inverse-distance route-local design values, " +
  "no orbital mechanics, n-body, or physics-parity claims. Solar kit nodes are presentational dressing.";

// ---------------------------------------------------------------------------
// Evidence contract
// ---------------------------------------------------------------------------
interface GravityPostEvidence {
  readonly schema: "aura3d-showcase-gravity-post/1.0";
  readonly mounted: boolean;
  /** True once the WebGL production renderer has settled its mount; step() renders nothing before this. */
  readonly rendererMounted: boolean;
  readonly appId: "showcase-gravity-post";
  readonly status: "ready";
  readonly claimLabel: "prototype";
  readonly frame: number;
  readonly drawCalls: number;
  readonly contractIndex: number;
  readonly contractId: string;
  readonly propellant: number;
  readonly podPosition: readonly [number, number];
  readonly podSpeed: number;
  readonly podState: string;
  readonly assists: readonly string[];
  readonly predictionSteps: number;
  readonly predictionComparedSamples: number;
  readonly predictionMaxDivergence: number;
  readonly predictionTolerance: number;
  readonly predictionWithinTolerance: boolean;
  readonly actualPathPoints: number;
  readonly correctionTokensRemaining: number;
  readonly correctionsUsed: number;
  readonly flightSeconds: number;
  readonly dockEventCount: number;
  readonly dockEvents: readonly string[];
  readonly failedContracts: number;
  readonly lastFailReason: string | null;
  readonly completedContracts: number;
  readonly score: number;
  readonly shiftOver: boolean;
  readonly campaignComplete: boolean;
  readonly paused: boolean;
  readonly warping: boolean;
  readonly aiming: boolean;
  readonly adriftSeconds: number;
  readonly flybyBeatsRun: number;
  readonly flybyActive: boolean;
  readonly visitedFlybys: readonly string[];
  readonly reducedMotion: boolean;
  readonly audioCues: readonly string[];
  readonly audioProof: {
    readonly cueCount: number;
    readonly busCount: number;
    readonly unlocked: boolean;
    readonly playedCueCount: number;
  };
  readonly primaryAssets: readonly string[];
  readonly typedAssets: readonly {
    readonly id: string;
    readonly typedRef: string;
    readonly role: string;
  }[];
  readonly controls: readonly string[];
  readonly claimBoundary: string;
  readonly lastDockHash: number | null;
}

declare global {
  interface Window {
    __GRAVITY_POST_EVIDENCE__?: GravityPostEvidence;
    __AURA3D_SHOWCASE_GRAVITY_POST__?: GravityPostEvidence;
    __AURA3D_COMPOSITION_PROBE__?: {
      readonly category: "application";
      readonly subject: {
        readonly position: readonly [number, number, number];
        readonly rotation: readonly [number, number, number];
        readonly targetSize: number;
      };
      setSubjectSuppressed(suppressed: boolean): void;
      settleSubjectPose(): void;
    };
    /** Deterministic test hook: manually advance the mounted app by dt seconds. */
    __GRAVITY_POST_STEP__?: (dtSeconds: number) => void;
    /** Deterministic test hook: advance gameplay without rendering. */
    __GRAVITY_POST_SIM_STEP__?: (dtSeconds: number) => void;
    /** Deterministic test hook: render one frame and read back the canvas atomically. */
    __GRAVITY_POST_CAPTURE__?: () => string;
    /** Deterministic test hook: current evidence snapshot. */
    __GRAVITY_POST_EVIDENCE_SNAPSHOT__?: () => GravityPostEvidence | undefined;
  }
}

function solarKitBackdrop(): readonly AuraSceneNode[] {
  // The kit's animated planets jump at their 18-second loop wrap, so gameplay
  // cannot anchor to them: keep the static sun family, starfield, dust, light,
  // and postprocess from the solar system kit composition (prefabs.solarSystem,
  // the same node set sceneKits.solarSystem() mounts), and author the five
  // planets statically below with the same material language.
  return prefabs.solarSystem({ labels: "none", starCount: 84, dustCount: 24 }).filter((node) => {
    if (node.kind === "effect" || node.kind === "light") return true;
    const name = "name" in node ? String(node.name ?? "") : "";
    return /(star|dust|sun|corona|glow)/i.test(name);
  });
}

const stations = buildStations();

let sceneBuilder = scene()
  .background("#050814")
  .addMany(solarKitBackdrop());

// Orbital faint ellipse guide rings around Sol
for (const body of WELL_BODIES) {
  if (body.id === "sol") continue;
  const dist = Math.hypot(body.position[0], body.position[1]);
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: body.name + " orbit path ring guide",
      material: material.emissive({ color: "#0f172a", emissive: "#38bdf8", opacity: 0.08 })
    }).position(0, PLAY_PLANE_Y - 0.01, 0).rotate(1.5708, 0, 0).scale([dist * 2, dist * 2, 0.003])
  );
}

// Authored well bodies at static positions — the game board.
for (const body of WELL_BODIES) {
  if (body.id === "sol") continue; // sun family comes from the kit backdrop
  const color = BODY_COLORS[body.id] ?? "#94a3b8";
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: body.name + " authored gravity-well planet",
      material: material.pbr({ color, roughness: 0.55, metallic: 0.15 })
    }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * 2)
  );

  // Atmospheric and celestial planet accessories
  if (body.id === "gale") {
    // Planetary ring system for Gale (gas giant)
    sceneBuilder = sceneBuilder.add(
      primitives.torus({
        name: "Gale planetary ring system",
        material: material.emissive({ color: "#78716c", emissive: "#e7e5e4", opacity: 0.42 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).rotate(1.2, 0.35, 0).scale([body.visualRadius * 3.4, body.visualRadius * 3.4, 0.008])
    );
  } else if (body.id === "aquaria") {
    // Ocean world luminous ionosphere
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({
        name: "Aquaria ionosphere glow",
        material: material.emissive({ color: "#0369a1", emissive: "#38bdf8", opacity: 0.18 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * 2.22)
    );
  } else if (body.id === "verdance") {
    // Bio-world luminous atmosphere
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({
        name: "Verdance atmosphere haze",
        material: material.emissive({ color: "#065f46", emissive: "#34d399", opacity: 0.16 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * 2.20)
    );
  } else if (body.id === "rust") {
    // Terracotta dust atmospheric rim
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({
        name: "Rust dust atmospheric rim",
        material: material.emissive({ color: "#7c2d12", emissive: "#f97316", opacity: 0.16 })
      }).position(body.position[0], PLAY_PLANE_Y, body.position[1]).scale(body.visualRadius * 2.20)
    );
  }
}

for (const body of WELL_BODIES) {
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: body.name + " well boundary ring readability guide",
      material: material.emissive({ color: "#0f172a", emissive: "#38bdf8", opacity: body.id === "sol" ? 0.04 : 0.08 })
    }).position(body.position[0], PLAY_PLANE_Y + 0.005, body.position[1]).rotate(1.5708, 0, 0).scale([body.wellRadius * 2, body.wellRadius * 2, 0.005])
  );
  sceneBuilder = sceneBuilder.add(
    primitives.torus({
      name: body.name + " red collision exclusion ring",
      material: material.emissive({ color: "#3f0a16", emissive: "#fb7185", opacity: 0.72 })
    }).position(body.position[0], PLAY_PLANE_Y + 0.012, body.position[1]).rotate(1.5708, 0, 0).scale([body.visualRadius * 2.7, body.visualRadius * 2.7, 0.008])
  );
}

// Stations: typed GLB beacon props + pulsing capture-window rings.
for (const station of stations) {
  sceneBuilder = sceneBuilder
    .add(
      model(assets.gravityPostDockBeacon, { name: station.nodeId })
        .position(station.x, PLAY_PLANE_Y + 0.06, station.z)
        .rotate(0, 0.6, 0)
        .scale(0.055)
        .runtime(game.runtimeNode(station.nodeId))
    )
    .add(
      primitives.torus({
        name: station.pulseNodeId + " capture window pulse ring",
        material: material.emissive({ color: "#0b2230", emissive: "#67e8f9", opacity: 0.5 })
      }).position(station.x, PLAY_PLANE_Y + 0.01, station.z).rotate(1.5708, 0, 0).scale([DOCK_SENSOR_RADIUS * 2.2, DOCK_SENSOR_RADIUS * 2.2, 0.02]).runtime(game.runtimeNode(station.pulseNodeId))
    );
}

// Mail pod: typed GLB capsule with an emissive mail-stripe bead.
sceneBuilder = sceneBuilder
  .add(
    model(assets.gravityPostMailPod, { name: "mail-pod" })
      .position(stations[0]!.x, PLAY_PLANE_Y, stations[0]!.z)
      .scale(POD_VISUAL_SCALE)
      .runtime(game.runtimeNode("mail-pod"))
  )
  .add(
    primitives.sphere({
      name: "mail-pod emissive mail stripe bead",
      material: material.emissive({ color: "#31120a", emissive: "#fb923c" })
    }).position(stations[0]!.x, PLAY_PLANE_Y + 0.05, stations[0]!.z).scale(0.03).runtime(game.runtimeNode("mail-stripe"))
  );

// Prediction line: primitive beads (scene geometry, never DOM/SVG).
for (let index = 0; index < PREDICTION_BEADS; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "prediction bead " + (index + 1),
      material: material.emissive({ color: "#221a04", emissive: "#facc15", opacity: 0.85 })
    }).position(0, PLAY_PLANE_Y + 0.03, 0).scale(0.024).runtime(game.runtimeNode("pred-bead-" + index))
  );
}

// Cream actual-path beads persist after launch so prediction and flown truth
// remain visually separable through assists, hazards, and docking.
for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "actual path bead " + (index + 1),
      material: material.emissive({ color: "#3a3022", emissive: "#fef3c7", opacity: 0.9 })
    }).position(0, -4, 0).scale(0.027).runtime(game.runtimeNode("actual-path-bead-" + index))
  );
}

// Dock spark burst pool (in-scene FX).
for (let index = 0; index < SPARK_COUNT; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.sphere({
      name: "dock spark " + (index + 1),
      material: material.emissive({ color: "#0e2733", emissive: "#7dd3fc" })
    }).position(0, -4, 0).scale(0.03).runtime(game.runtimeNode("dock-spark-" + index))
  );
}

// Flyby drone ring (cinematic beat presentation).
for (let index = 0; index < FLYBY_DRONES; index += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives.box({
      name: "flyby drone " + (index + 1),
      material: material.emissive({ color: "#1a1030", emissive: "#c084fc" })
    }).position(0, -4, 0).scale([0.05, 0.02, 0.12]).runtime(game.runtimeNode("flyby-drone-" + index))
  );
}

sceneBuilder = sceneBuilder
  .add(lights.ambient({ intensity: 0.22 }))
  .add(lights.directional({ position: [2.4, 6.2, 3.2], intensity: 0.9, color: "#dbeafe" }))
  .add(effects.fog({ density: 0.014, color: "#070c18" }));

for (const body of WELL_BODIES) {
  sceneBuilder = sceneBuilder.add(
    labels.anchor(body.name, body.name + " gravity-well body tag", {
      name: body.name + " body label",
      position: [body.position[0], PLAY_PLANE_Y + 0.34 + body.visualRadius, body.position[1]],
      size: 0.14,
      collisionAvoidance: true,
      occlusionAware: true
    })
  );
}
for (const station of stations) {
  sceneBuilder = sceneBuilder.add(
    labels.anchor(station.name, station.name + " dock label", {
      name: station.id + " station label",
      position: [station.x, PLAY_PLANE_Y + 0.3, station.z],
      size: 0.11,
      collisionAvoidance: true,
      occlusionAware: true
    })
  );
}


const app = createAuraApp("#app", {
  diagnostics: { overlay: false },
  physics: {
    layers: createCollisionLayers({ pod: ["dock"], dock: ["pod"] }),
    gravity: [0, 0, 0]
  },
  scene: sceneBuilder.camera(camera.perspective({
    position: [0.3, 10.6, 3.9],
    target: [0.28, 0.08, -0.55],
    fov: 46
  }))
});

// ---------------------------------------------------------------------------
// Physics bodies + systems
// ---------------------------------------------------------------------------
const physics = app.physics;
const podBody = physics.createBody({ ...POD_BODY_SPEC, layer: "pod" });
for (const station of stations) {
  physics.createBody({ ...dockSensorBodySpec(station), layer: "dock" });
}

interface DockEventRecord {
  readonly stationId: string;
  readonly kind: "capture" | "bounce";
}

const pendingDocks: string[] = [];
const dockEventLog: DockEventRecord[] = [];
let dockEventCount = 0;

physics.onTriggerEnter((event) => {
  const names = [event.nodeA, event.nodeB];
  const sensorName = names.find((name) => typeof name === "string" && name.startsWith("dock-sensor-"));
  if (!sensorName) return;
  if (!names.includes(POD_BODY_SPEC.name)) return;
  pendingDocks.push(sensorName.slice("dock-sensor-".length));
});

const audio: GravityPostAudio = createGravityPostAudio();
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
let rendererMounted = false;
void app.ready().then(() => {
  rendererMounted = true;
});
const input = app.input({
  actions: {
    burnPrograde: ["KeyW", "ArrowUp"],
    burnRetro: ["KeyS", "ArrowDown"],
    warp: ["Space"],
    next: ["KeyN"],
    retry: ["KeyR"],
    pause: ["KeyP"]
  }
});

const hud: HTMLElement = (() => {
  const element = document.querySelector<HTMLElement>("#hud");
  if (!element) throw new Error("Gravity Post requires #hud.");
  return element;
})();

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const pod: PodRuntimeState = createPodRuntime(CONTRACTS[0]!.originStationId, CONTRACTS[0]!.tuning.strengthScale);
const flyby = createFlybyState();

let contractIndex = 0;
let score = 0;
let failedContracts = 0;
let completedContracts = 0;
let shiftOver = false;
let campaignComplete = false;
let paused = false;
let aiming = false;
let warpActive = false;
let frame = 0;
let predictionSteps = 0;
let launchPrediction: readonly TrajectorySample[] = [];
let predictionComparedSamples = 0;
let predictionMaxDivergence = 0;
let compositionSubjectSuppressed = false;
const actualPath: Array<readonly [number, number]> = [];
let lastDockHash: number | null = null;
let lastScoreCard: ScoreBreakdown | null = null;
let lostCooldownSeconds = 0;
let sparkLife = 0;
let touchWarp = false;
const sparkDirections = Array.from({ length: SPARK_COUNT }, (_, index) => {
  const angle = (index / SPARK_COUNT) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const aimStart = { x: 0, y: 0 };
const aimCurrent = { x: 0, y: 0 };

const contract = () => CONTRACTS[contractIndex]!;
const originStation = () => stations.find((candidate) => candidate.id === contract().originStationId)!;
const destinationStation = () => stations.find((candidate) => candidate.id === contract().destinationStationId)!;

function stationWorld(id: string): { readonly x: number; readonly z: number } {
  const spec = stationById(id);
  const position = stationPosition(spec);
  return { x: position[0], z: position[1] };
}

// ---------------------------------------------------------------------------
// Aim + launch input (drag anywhere; the line grows from the pod)
// ---------------------------------------------------------------------------
function currentAimVector(): { readonly dirX: number; readonly dirZ: number; readonly power: number } | null {
  const dx = aimCurrent.x - aimStart.x;
  const dy = aimCurrent.y - aimStart.y;
  const lengthPx = Math.hypot(dx, dy);
  if (lengthPx < 6) return null;
  const power = Math.min(1, lengthPx / AIM_DRAG_PIXEL_RANGE);
  return { dirX: dx / lengthPx, dirZ: dy / lengthPx, power };
}

const canvas = app.canvas;
if (canvas) {
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    audio.unlock();
    if (pod.state !== "ready" || paused || flyby.active) return;
    aiming = true;
    aimStart.x = event.clientX;
    aimStart.y = event.clientY;
    aimCurrent.x = event.clientX;
    aimCurrent.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!aiming) return;
    aimCurrent.x = event.clientX;
    aimCurrent.y = event.clientY;
  });
  const releaseAim = (): void => {
    if (!aiming) return;
    aiming = false;
    const vector = currentAimVector();
    if (vector && vector.power >= MIN_LAUNCH_POWER) {
      const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
      launchWithPrediction([vector.dirX, vector.dirZ], speed);
      hidePrediction();
    }
  };
  canvas.addEventListener("pointerup", releaseAim);
  canvas.addEventListener("pointercancel", releaseAim);
}

window.addEventListener("keydown", () => {
  audio.unlock();
  if (flyby.active) skipFlyby(flyby);
});

// ---------------------------------------------------------------------------
// Event + scoring plumbing
// ---------------------------------------------------------------------------
function emitPodEvents(events: readonly PodEvent[]): void {
  for (const event of events) {
    if (event.type === "launch") audio.play("launch-whoosh");
    else if (event.type === "assist") audio.play("assist-chime");
    else if (event.type === "correction") audio.play("burn-loop");
    else if (event.type === "planet-strike" || event.type === "solar-escape" || event.type === "stranded" || event.type === "timeout") audio.play("pod-lost");
    else if (event.type === "too-fast") audio.play("bounce-off");
  }
}

let lastFailReason: string | null = null;

function registerFail(reason: string): void {
  lastFailReason = reason;
  failedContracts += 1;
  lostCooldownSeconds = 1.4;
  if (failedContracts >= SHIFT_FAIL_LIMIT) shiftOver = true;
}

function handleDock(stationId: string): void {
  if (pod.state !== "coasting") return;
  if (stationId !== contract().destinationStationId) return;
  const outcome = evaluateCapture(pod, contract(), stationId);
  dockEventCount += 1;
  if (outcome.docked) {
    dockEventLog.push({ stationId, kind: "capture" });
    audio.play("dock-lock");
    audio.play("contract-clear");
    const core = stationWorld(contract().destinationStationId);
    lastDockHash = dockPointHash([core.x, core.z]);
    lastScoreCard = scoreContract({
      propellant: pod.propellant,
      distanceToCore: outcome.distanceToCore,
      dockRadius: DOCK_SENSOR_RADIUS,
      assists: pod.assists,
      bonusBodyHit: contract().bonusBodyId !== null && pod.flybys.has(contract().bonusBodyId!)
    });
    score += lastScoreCard.total;
    completedContracts += 1;
    sparkLife = 0.7;
    hidePrediction();
  } else {
    dockEventLog.push({ stationId, kind: "bounce" });
  }
  if (dockEventLog.length > 12) dockEventLog.shift();
}

function resetCampaign(): void {
  lastFailReason = null;
  contractIndex = 0;
  score = 0;
  failedContracts = 0;
  completedContracts = 0;
  shiftOver = false;
  campaignComplete = false;
  lastScoreCard = null;
  flyby.visited.clear();
  flyby.beatsRun = 0;
  dockEventLog.length = 0;
  dockEventCount = 0;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
  hidePrediction();
  audio.play("ui-confirm");
}

function nextContract(): void {
  if (pod.state !== "docked") return;
  audio.play("ui-confirm");
  if (contractIndex >= CONTRACTS.length - 1) {
    campaignComplete = true;
    return;
  }
  contractIndex += 1;
  lastScoreCard = null;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
}

function retryContract(): void {
  if (shiftOver || campaignComplete) {
    resetCampaign();
    return;
  }
  audio.play("ui-confirm");
  lastScoreCard = null;
  resetPodForContract(pod, contract());
  resetPredictionTelemetry();
}

function resetPredictionTelemetry(): void {
  launchPrediction = [];
  predictionComparedSamples = 0;
  predictionMaxDivergence = 0;
  actualPath.length = 0;
  syncActualPath();
}

function launchWithPrediction(direction: readonly [number, number], speed: number): void {
  const result = launch(pod, direction, speed);
  if (result.length === 0) return;
  launchPrediction = integratePath({
    bodies: WELL_BODIES,
    tuning: contract().tuning,
    start: pod.kinematic.position,
    velocity: pod.kinematic.velocity,
    steps: PREDICTION_MAX_STEPS
  }).samples;
  predictionComparedSamples = 0;
  predictionMaxDivergence = 0;
  actualPath.length = 0;
  actualPath.push([pod.kinematic.position[0], pod.kinematic.position[1]]);
  syncActualPath();
  emitPodEvents(result);
}

function recordActualPath(): void {
  const last = actualPath[actualPath.length - 1];
  if (last && Math.hypot(last[0] - pod.kinematic.position[0], last[1] - pod.kinematic.position[1]) < 0.12) return;
  actualPath.push([pod.kinematic.position[0], pod.kinematic.position[1]]);
  if (actualPath.length > ACTUAL_PATH_BEADS) actualPath.shift();
  syncActualPath();
}

function syncActualPath(): void {
  for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
    const node = app.nodes.get("actual-path-bead-" + index);
    const point = actualPath[index];
    if (!node || !point) {
      node?.setVisible(false);
      continue;
    }
    node.setPosition(point[0], PLAY_PLANE_Y + 0.025, point[1]).setVisible(true);
  }
}

function samplePredictionDivergence(): void {
  if (pod.correctionsUsed > 0 || launchPrediction.length === 0) return;
  const sampleIndex = Math.max(0, Math.round(pod.simulationSeconds / FIXED_DT) - 1);
  // Once the bounded prediction horizon is exhausted there is no matching
  // reference sample; never compare a later live position to the final bead.
  if (sampleIndex >= launchPrediction.length) return;
  if (sampleIndex < predictionComparedSamples) return;
  const expected = launchPrediction[sampleIndex]!.position;
  const error = Math.hypot(expected[0] - pod.kinematic.position[0], expected[1] - pod.kinematic.position[1]);
  predictionComparedSamples = sampleIndex + 1;
  predictionMaxDivergence = Math.max(predictionMaxDivergence, error);
}

// ---------------------------------------------------------------------------
// Prediction line
// ---------------------------------------------------------------------------
function updatePrediction(): void {
  const vector = aiming ? currentAimVector() : null;
  if (!vector || pod.state !== "ready") {
    if (!aiming) hidePrediction();
    return;
  }
  const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
  const path = integratePath({
    bodies: WELL_BODIES,
    tuning: contract().tuning,
    start: pod.kinematic.position,
    velocity: [vector.dirX * speed, vector.dirZ * speed],
    steps: PREDICTION_MAX_STEPS
  });
  predictionSteps = path.samples.length;
  const beads = buildPredictionBeads({ samples: path.samples, maxBeads: PREDICTION_BEADS });
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    const node = app.nodes.get("pred-bead-" + index);
    if (!node) continue;
    const bead = beads[index];
    if (!bead) {
      node.setVisible(false);
      continue;
    }
    node.setVisible(true);
    node.setPosition(bead.x, PLAY_PLANE_Y + 0.03, bead.z);
  }
}

function hidePrediction(): void {
  predictionSteps = 0;
  for (let index = 0; index < PREDICTION_BEADS; index += 1) {
    app.nodes.get("pred-bead-" + index)?.setVisible(false);
  }
}

// ---------------------------------------------------------------------------
// Visual sync
// ---------------------------------------------------------------------------
function syncPodVisual(): void {
  // The physics body mirrors the authored integration so real sensor overlaps
  // fire; zero-gravity world + matching velocity keep the mirror exact.
  podBody.setVelocity([pod.kinematic.velocity[0], 0, pod.kinematic.velocity[1]]);
  const podNode = app.nodes.get("mail-pod");
  const stripeNode = app.nodes.get("mail-stripe");
  const x = pod.kinematic.position[0];
  const z = pod.kinematic.position[1];
  podNode?.setPosition(x, PLAY_PLANE_Y, z);
  stripeNode?.setPosition(x, PLAY_PLANE_Y + 0.06, z);
  const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  if (speed > 1e-4) {
    podNode?.setRotation(0, Math.atan2(pod.kinematic.velocity[0], pod.kinematic.velocity[1]), 0);
  }
  podBody.setPosition([x, PLAY_PLANE_Y, z]);
}

function syncStationPulses(): void {
  const destination = destinationStation();
  for (const station of stations) {
    const pulse = app.nodes.get(station.pulseNodeId);
    if (!pulse) continue;
    const distance = Math.hypot(pod.kinematic.position[0] - station.x, pod.kinematic.position[1] - station.z);
    const isOpen = station.id === destination.id && pod.state === "coasting" &&
      distance < station.dockRadius * 3.2 &&
      Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) < contract().captureLimit * 1.2;
    const breathe = isOpen ? 1.25 + Math.sin(frame * 0.35) * 0.22 : 1;
    pulse.setScale([station.dockRadius * 2.2 * breathe, station.dockRadius * 2.2 * breathe, 0.02]);
  }
}

function syncSparks(dt: number): void {
  if (sparkLife > 0) sparkLife = Math.max(0, sparkLife - dt);
  const core = stationWorld(contract().destinationStationId);
  for (let index = 0; index < SPARK_COUNT; index += 1) {
    const node = app.nodes.get("dock-spark-" + index);
    if (!node) continue;
    if (sparkLife <= 0) {
      node.setPosition(0, -4, 0);
      node.setVisible(false);
      continue;
    }
    const travel = (0.7 - sparkLife) * 1.4;
    const direction = sparkDirections[index]!;
    node.setPosition(core.x + direction[0] * travel, PLAY_PLANE_Y + 0.05 + sparkLife * 0.3, core.z + direction[1] * travel);
    node.setVisible(true);
  }
}

function syncFlybyDrones(progress: number | null): void {
  const body = flybyBody(flyby.bodyId);
  for (let index = 0; index < FLYBY_DRONES; index += 1) {
    const node = app.nodes.get("flyby-drone-" + index);
    if (!node) continue;
    if (progress === null || !body) {
      node.setPosition(0, -4, 0);
      node.setVisible(false);
      continue;
    }
    node.setVisible(true);
    const angle = (index / FLYBY_DRONES) * Math.PI * 2 + progress * 2.4;
    const radius = body.visualRadius + 0.32 - progress * 0.12;
    const yLift = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 0.22;
    node.setPosition(body.position[0] + Math.cos(angle) * radius, PLAY_PLANE_Y + yLift, body.position[1] + Math.sin(angle) * radius);
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}

function renderHud(): void {
  const active = contract();
  const origin = originStation();
  const destination = destinationStation();
  const bonus = active.bonusBodyId ? WELL_BODIES.find((body) => body.id === active.bonusBodyId) : undefined;
  const fuelPct = Math.round(pod.propellant);
  const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
  const adriftLeft = Math.max(0, Math.ceil(ADRIFT_LIMIT_SECONDS - pod.adriftSeconds));

  let statusLine: string;
  if (shiftOver) statusLine = "Shift over — three contracts failed. Press R to reset the campaign.";
  else if (campaignComplete) statusLine = "Shift complete! All four deliveries flown. Press R to fly it again.";
  else if (pod.state === "docked") statusLine = "Delivered. Press N for the next contract.";
  else if (pod.state === "lost") statusLine = "Hull lost — " + (lastFailReason ?? "route failure") + ". Relaunching this dispatch.";
  else if (pod.state === "ready") statusLine = aiming ? "Drag to shape the launch — release to fly." : "Drag anywhere to aim the launch.";
  else if (pod.propellant <= 0) statusLine = "Tank dry — adrift " + adriftLeft + "s.";
  else statusLine = pod.correctionTokensRemaining > 0
    ? "Coasting. One W/S correction available · hold Space to warp."
    : "Coasting. Correction spent · hold Space to warp.";

  const scoreCardHtml = lastScoreCard ? [
    '<section class="gp-panel gp-scorecard" data-testid="gp-score-card">',
    '<span class="gp-eyebrow">Delivery scored</span>',
    '<div class="gp-row">' +
      metric("Base", String(lastScoreCard.base)) +
      metric("Fuel", "+" + lastScoreCard.fuelPoints) +
      metric("Precision", "+" + lastScoreCard.precisionPoints) +
    "</div>",
    '<div class="gp-row">' +
      metric("Assists x" + pod.assists.size, "+" + lastScoreCard.assistPoints) +
      metric("Flyby", "+" + lastScoreCard.flybyPoints) +
      metric("Total", String(lastScoreCard.total)) +
    "</div>",
    "</section>"
  ].join("") : "";

  const flybyName = flyby.active && flyby.bodyId ? (flybyBody(flyby.bodyId)?.name ?? "") : "";
  const flybyHtml = flyby.active ? [
    '<section class="gp-panel gp-flyby" data-testid="gp-flyby">',
    '<span class="gp-eyebrow">Flyby beat</span>',
    "<p>Sweeping " + escapeHtml(flybyName) + " — press any key to skip.</p>",
    "</section>"
  ].join("") : "";

  hud.innerHTML = [
    '<section class="gp-panel gp-briefing">',
    '<span class="gp-eyebrow">Gravity Post · courier shift</span>',
    "<h1>" + escapeHtml(active.title) + "</h1>",
    '<p class="gp-brief">' + escapeHtml(active.briefing) + "</p>",
    '<div class="gp-route"><span>' + escapeHtml(origin.name) + '</span><i>→</i><span>' + escapeHtml(destination.name) + "</span></div>",
    '<p class="gp-meta">Capture under ' + active.captureLimit.toFixed(1) + " u/s · par fuel " + active.parFuel + "%" +
      (bonus ? " · bonus flyby " + escapeHtml(bonus.name) : "") + "</p>",
    "</section>",
    '<section class="gp-panel gp-readouts">',
    metric("Fuel", fuelPct + "%"),
    '<div class="gp-fuel"><i style="width:' + fuelPct + '%"></i></div>',
    '<div class="gp-row">' +
      metric("Speed", speed.toFixed(2)) +
      metric("Assists", String(pod.assists.size)) +
      metric("Hulls", String(SHIFT_FAIL_LIMIT - failedContracts)) +
    "</div>",
    '<div class="gp-row">' +
      metric("Score", String(score)) +
      metric("Correction", pod.correctionTokensRemaining > 0 ? "READY" : (active.correctionTokens === 0 ? "NONE" : "SPENT")) +
      metric("Time", Math.max(0, active.timeLimitSeconds - pod.flightSeconds).toFixed(0) + "s") +
      metric("Warp", "x" + (warpActive && pod.state === "coasting" ? TIME_WARP_MULTIPLIER : 1)) +
    "</div>",
    '<p class="gp-status">' + escapeHtml(statusLine) + "</p>",
    '<div class="gp-actions">',
    '<button id="gp-correct-pro" type="button"' + (pod.correctionTokensRemaining > 0 ? "" : " disabled") + '>Correct + (W)</button>',
    '<button id="gp-correct-retro" type="button"' + (pod.correctionTokensRemaining > 0 ? "" : " disabled") + '>Correct − (S)</button>',
    '<button id="gp-warp" type="button">Warp hold</button>',
    '<button id="gp-retry" type="button">Retry (R)</button>',
    '<button id="gp-next" type="button"' + (pod.state === "docked" ? "" : " disabled") + '>Next (N)</button>',
    '<button id="gp-pause" type="button" aria-pressed="' + paused + '">' + (paused ? "Resume" : "Pause") + "</button>",
    "</div>",
    "</section>",
    scoreCardHtml,
    flybyHtml
  ].join("");

  hud.querySelector("#gp-retry")?.addEventListener("click", () => { audio.unlock(); retryContract(); });
  hud.querySelector("#gp-next")?.addEventListener("click", () => { audio.unlock(); nextContract(); });
  hud.querySelector("#gp-pause")?.addEventListener("click", () => { paused = !paused; });
  hud.querySelector("#gp-correct-pro")?.addEventListener("click", () => { audio.unlock(); emitPodEvents(applyCorrection(pod, 1)); });
  hud.querySelector("#gp-correct-retro")?.addEventListener("click", () => { audio.unlock(); emitPodEvents(applyCorrection(pod, -1)); });
  bindHold("#gp-warp", () => { touchWarp = true; }, () => { touchWarp = false; });
}

function metric(label: string, value: string): string {
  return '<div class="gp-metric"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
}

function bindHold(selector: string, down: () => void, up: () => void): void {
  const element = hud.querySelector(selector);
  element?.addEventListener("pointerdown", (event) => { event.preventDefault(); audio.unlock(); down(); });
  element?.addEventListener("pointerup", up);
  element?.addEventListener("pointerleave", up);
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
function publishEvidence(): void {
  const proof = audio.proof();
  let drawCalls = 0;
  try {
    drawCalls = Number((app.diagnostics() as { drawCalls?: number }).drawCalls ?? 0);
  } catch {
    drawCalls = 0;
  }
  window.__GRAVITY_POST_EVIDENCE__ = {
    schema: "aura3d-showcase-gravity-post/1.0",
    mounted: true,
    rendererMounted,
    appId: "showcase-gravity-post",
    status: "ready",
    claimLabel: "prototype",
    frame,
    drawCalls,
    contractIndex,
    contractId: contract().id,
    propellant: Math.round(pod.propellant * 10) / 10,
    podPosition: [Math.round(pod.kinematic.position[0] * 1000) / 1000, Math.round(pod.kinematic.position[1] * 1000) / 1000],
    podSpeed: Math.round(Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) * 1000) / 1000,
    podState: pod.state,
    assists: [...pod.assists],
    predictionSteps,
    predictionComparedSamples,
    predictionMaxDivergence: Math.round(predictionMaxDivergence * 1_000_000) / 1_000_000,
    predictionTolerance: PREDICTION_DIVERGENCE_TOLERANCE,
    predictionWithinTolerance: predictionComparedSamples > 0 && predictionMaxDivergence <= PREDICTION_DIVERGENCE_TOLERANCE,
    actualPathPoints: actualPath.length,
    correctionTokensRemaining: pod.correctionTokensRemaining,
    correctionsUsed: pod.correctionsUsed,
    flightSeconds: Math.round(pod.flightSeconds * 100) / 100,
    dockEventCount,
    dockEvents: dockEventLog.map((record) => record.stationId + ":" + record.kind),
    failedContracts,
    lastFailReason,
    completedContracts,
    score,
    shiftOver,
    campaignComplete,
    paused,
    warping: warpActive,
    aiming,
    adriftSeconds: Math.round(pod.adriftSeconds * 10) / 10,
    flybyBeatsRun: flyby.beatsRun,
    flybyActive: flyby.active,
    visitedFlybys: [...flyby.visited],
    reducedMotion,
    audioCues: proof.recentCues.slice(-16),
    audioProof: {
      cueCount: proof.cueCount,
      busCount: proof.busCount,
      unlocked: proof.unlocked,
      playedCueCount: proof.playedCueCount
    },
    primaryAssets: ["gravityPostMailPod", "gravityPostDockBeacon"],
    typedAssets: [
      { id: "gravityPostMailPod", typedRef: "assets.gravityPostMailPod", role: "primaryVehicle" },
      { id: "gravityPostDockBeacon", typedRef: "assets.gravityPostDockBeacon", role: "primaryWorld" }
    ],
    controls: CONTROLS,
    claimBoundary: CLAIM_BOUNDARY,
    lastDockHash
  };
  window.__AURA3D_SHOWCASE_GRAVITY_POST__ = window.__GRAVITY_POST_EVIDENCE__;
  document.body.dataset.gravityPostReady = "true";
  document.body.dataset.aura3dShowcaseReady = "true";
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
let lastTime = 0;

function updateGameplay(dt: number): void {
  frame += 1;
  audio.tick(dt);

  input.update(dt);
  if (input.pressed("pause")) paused = !paused;
  if (input.pressed("retry")) retryContract();
  if (input.pressed("next")) nextContract();
  if (paused) {
    warpActive = false;
    publishEvidence();
    return;
  }

  // Skippable flyby beat: gameplay frozen while the drone sweep runs.
  const beatProgress = updateFlyby(flyby, dt);
  if (flyby.active) {
    syncFlybyDrones(reducedMotion ? null : beatProgress);
    renderHud();
    publishEvidence();
    return;
  }
  syncFlybyDrones(null);

  if (lostCooldownSeconds > 0) {
    lostCooldownSeconds = Math.max(0, lostCooldownSeconds - dt);
    if (lostCooldownSeconds === 0 && pod.state === "lost") {
      resetPodForContract(pod, contract());
      hidePrediction();
    }
  }

  if (pod.state === "coasting" && input.pressed("burnPrograde")) emitPodEvents(applyCorrection(pod, 1));
  if (pod.state === "coasting" && input.pressed("burnRetro")) emitPodEvents(applyCorrection(pod, -1));
  warpActive = (input.held("warp") || touchWarp) && pod.state === "coasting";
  if (warpActive) audio.play("warp-hum");

  if (pod.state === "ready") {
    updatePrediction();
  } else if (pod.state === "coasting") {
    const events = updateCoast({ pod, contract: contract(), bodies: WELL_BODIES, dt, warpActive });
    samplePredictionDivergence();
    recordActualPath();
    for (const flybyId of pod.flybys) {
      if (requestFlyby(flyby, flybyId, { reducedMotion })) {
        audio.play("ui-confirm");
        break;
      }
    }
    emitPodEvents(events);
    for (const event of events) {
      if (event.type === "planet-strike") { registerFail("planet-strike:" + (event.bodyId ?? "")); break; }
      if (event.type === "solar-escape") { registerFail("solar-escape"); break; }
      if (event.type === "stranded") { registerFail("stranded"); break; }
      if (event.type === "timeout") { registerFail("timeout"); break; }
    }
    updatePrediction();
  }

  // Real physics step dispatches sensor triggers; drain them after integrating.
  physics.step(dt);
  while (pendingDocks.length > 0) {
    handleDock(pendingDocks.shift()!);
  }

  syncPodVisual();
  syncStationPulses();
  syncSparks(dt);
  renderHud();
  publishEvidence();
}

app.onFrame(({ time }) => {
  const dt = lastTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0.001, time - lastTime));
  lastTime = time;
  updateGameplay(dt);
});

renderHud();
publishEvidence();

// Manual stepping keeps automated proof deterministic even where headless
// requestAnimationFrame throttles; live play still runs on the RAF loop.
// __GRAVITY_POST_STEP__ runs the full mounted pipeline (renders a frame);
// __GRAVITY_POST_SIM_STEP__ advances gameplay/evidence without rendering.
window.__GRAVITY_POST_STEP__ = (dtSeconds: number) => {
  app.step(Math.min(0.05, Math.max(0.001, dtSeconds)));
};
window.__GRAVITY_POST_SIM_STEP__ = (dtSeconds: number) => {
  updateGameplay(Math.min(0.05, Math.max(0.001, dtSeconds)));
};
// Render + readback inside ONE task: the compositor cannot clear the drawing
// buffer between the render and the read, so pixel evidence is race-free.
window.__GRAVITY_POST_CAPTURE__ = () => {
  app.step(1 / 30);
  const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
  if (!canvas) throw new Error("Gravity Post canvas missing.");
  return canvas.toDataURL("image/png");
};
/** Debug/test surface: the mounted physics runtime. */
(window as unknown as Record<string, unknown>).__GRAVITY_POST_PHYSICS__ = physics;
window.__GRAVITY_POST_EVIDENCE_SNAPSHOT__ = () => window.__GRAVITY_POST_EVIDENCE__;

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application" as const,
    get subject() {
      const speed = Math.hypot(pod.kinematic.velocity[0], pod.kinematic.velocity[1]);
      return {
        position: [pod.kinematic.position[0], PLAY_PLANE_Y, pod.kinematic.position[1]] as const,
        rotation: [0, speed > 1e-4 ? Math.atan2(pod.kinematic.velocity[0], pod.kinematic.velocity[1]) : 0, 0] as const,
        targetSize: 2.5
      };
    },
    setSubjectSuppressed(suppressed: boolean) {
      compositionSubjectSuppressed = suppressed;
      app.nodes.get("mail-pod")?.setVisible(!suppressed);
      app.nodes.get("mail-stripe")?.setVisible(!suppressed);
    },
    settleSubjectPose() {
      paused = true;
      resetPodForContract(pod, contract());
      app.nodes.get("mail-pod")?.setScale([1.1, 1.1, 1.1]).setVisible(!compositionSubjectSuppressed);
      app.nodes.get("mail-stripe")?.setScale([0.15, 0.15, 0.15]).setVisible(!compositionSubjectSuppressed);
      syncPodVisual();
      publishEvidence();
    }
  },
  configurable: true
});
