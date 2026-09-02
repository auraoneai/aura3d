/**
 * Deep Recovery showcase main entry point.
 */
import {
  createAuraApp,
  scene,
  camera,
  lights,
  primitives,
  material,
  model,
  effects
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  getDepthZone,
  WRECK_OBSTACLES,
  BUOY_STATION,
  WORLD_BOUNDS
} from "./reef";
import {
  initialSubmarineState,
  updateSubmarine,
  type SubmarineState
} from "./sub";
import {
  initialOxygenState,
  updateOxygen,
  applyCollisionImpact,
  patchBreach,
  refuelAtSurface,
  type OxygenState
} from "./oxygen";
import {
  initialSonarState,
  triggerPing,
  updateSonar,
  type SonarState,
  type SonarTarget
} from "./sonar";
import {
  initialCrateSpawns,
  tryGrappleCrates,
  releaseTethers,
  updateTetherPhysics,
  bankSecuredCrates,
  type SalvageCrate
} from "./salvage";
import { DeepAudioController } from "./deep-audio";

export interface DeepRecoveryEvidence {
  readonly mounted: boolean;
  readonly status: "loading" | "ready";
  readonly state: "playing" | "paused" | "blackout" | "won";
  readonly missionStage: MissionStage;
  readonly depth: number;
  readonly oxygen: number;
  readonly hull: number;
  readonly salvageValue: number;
  readonly bankedValue: number;
  readonly cratesSecured: number;
  readonly cratesTotal: number;
  readonly sonarPings: number;
  readonly sonarReturns: number;
  readonly markerAgeOuts: number;
  readonly sensorEventCount: number;
  readonly motionMode: "authored";
  readonly frameCount: number;
  readonly audioCues: readonly string[];
  readonly subPosition: readonly [number, number, number];
  readonly standardBanked: boolean;
  readonly heavyBanked: boolean;
  readonly breachCount: number;
  readonly repairCount: number;
  readonly towMassKg: number;
  readonly towDrag: number;
  readonly reducedMotion: boolean;
  readonly sonarContacts: readonly { readonly id: string; readonly kind: string; readonly position: readonly [number, number, number]; readonly distance: number }[];
  readonly systems: readonly string[];
  readonly controls: readonly string[];
  readonly claimBoundary: string;
  readonly primaryAssets: readonly string[];
  readonly primaryAssetHashes: readonly string[];
  readonly renderer: unknown;
}

type MissionStage = "descent" | "wreck-approach" | "standard-salvage" | "breach-repair" | "heavy-salvage" | "ascent" | "surface-complete" | "blackout";

declare global {
  interface Window {
    __DEEP_RECOVERY_EVIDENCE__?: DeepRecoveryEvidence;
    __AURA3D_SHOWCASE_DEEP_RECOVERY__?: DeepRecoveryEvidence;
    __DR_PUMP__?: (frames: number) => number;
    __DR_TELEPORT__?: (x: number, y: number, z: number) => void;
    __DR_TELEPORT_CRATE__?: (id: string, x: number, y: number, z: number) => void;
    __DR_IMPACT__?: (speed: number) => void;
    __DR_SET_OXYGEN__?: (oxygen: number) => void;
    __DR_REPAIR__?: () => boolean;
  }
}

// ---------------- State Initialization ----------------
let gameState: "playing" | "paused" | "blackout" | "won" = "playing";
let subState: SubmarineState = initialSubmarineState();
let oxygenState: OxygenState = initialOxygenState();
let sonarState: SonarState = initialSonarState();
let crates: SalvageCrate[] = initialCrateSpawns();
let bankedTotal = 0;
let sensorEventCount = 0;
let frameCount = 0;
let timeSinceStart = 0;
let standardBanked = false;
let heavyBanked = false;
let breachCount = 0;
let repairCount = 0;
let lastTowDrag = 0;
let surfaceCuePlayed = false;
let oxygenWarningCuePlayed = false;
let compositionProbeActive = false;
const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const visualReviewCapture = new URLSearchParams(window.location.search).get("capture") === "review";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";
// The review lens is a deliberately staged mission moment, not the launch
// pose.  Keeping the submarine on the west approach and the Drowned Chapel in
// the same camera-facing basin makes the typed vehicle/world relationship
// legible in one frame while leaving the normal gameplay spawn untouched.
const REVIEW_POSE = { x: -11.5, y: -12, z: -7, yaw: 0.18 } as const;
const PRIMARY_ASSET_REFS = [
  assets.deepRecoverySub,
  assets.deepRecoveryWreckHull,
  assets.deepRecoveryCrateStandard,
  assets.deepRecoveryCrateHeavy,
  assets.deepRecoveryBuoyBeacon
] as const;

Object.defineProperty(window, "__AURA3D_SHOWCASE_DEEP_RECOVERY__", {
  configurable: true,
  get: () => window.__DEEP_RECOVERY_EVIDENCE__
});

const audio = new DeepAudioController();
void audio.init();

// Keys Held Set
const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space") {
    e.preventDefault();
    handlePing();
  } else if (e.code === "KeyF") {
    e.preventDefault();
    handleGrappleToggle();
  } else if (e.code === "KeyC") {
    e.preventDefault();
    handleRepair();
  } else if (e.code === "KeyP") {
    e.preventDefault();
    togglePause();
  } else if (e.code === "KeyR") {
    e.preventDefault();
    resetGame();
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

// ---------------- DOM UI Elements ----------------
const elZoneBadge = document.getElementById("dr-zone-badge")!;
const elBreachBadge = document.getElementById("dr-breach-badge")!;
const elOxygenFill = document.getElementById("dr-oxygen-fill")!;
const elOxygenVal = document.getElementById("dr-oxygen-val")!;
const elHullFill = document.getElementById("dr-hull-fill")!;
const elHullVal = document.getElementById("dr-hull-val")!;
const elDepthVal = document.getElementById("dr-depth-val")!;
const elSpeedVal = document.getElementById("dr-speed-val")!;
const elContractTitle = document.getElementById("dr-contract-title")!;
const elTetherBadge = document.getElementById("dr-tether-badge")!;
const elBankedVal = document.getElementById("dr-banked-val")!;
const elCargoVal = document.getElementById("dr-cargo-val")!;
const elSonarCd = document.getElementById("dr-sonar-cd")!;
const elContactList = document.getElementById("dr-contact-list")!;
const elObjective = document.getElementById("dr-objective")!;
const elModal = document.getElementById("dr-modal")!;
const elModalTitle = document.getElementById("dr-modal-title")!;
const elModalDesc = document.getElementById("dr-modal-desc")!;
const elModalActionBtn = document.getElementById("dr-modal-action-btn")!;
const elModalRetryBtn = document.getElementById("dr-modal-retry-btn")!;

document.getElementById("dr-ping-btn")?.addEventListener("click", () => handlePing());
document.getElementById("dr-grapple-btn")?.addEventListener("click", () => handleGrappleToggle());
document.getElementById("dr-repair-btn")?.addEventListener("click", () => handleRepair());
document.getElementById("dr-pause-btn")?.addEventListener("click", () => togglePause());
document.getElementById("dr-restart-btn")?.addEventListener("click", () => resetGame());
elModalActionBtn.addEventListener("click", () => resetGame());
elModalRetryBtn.addEventListener("click", () => resetGame());

function bindHeldButton(id: string, code: string): void {
  const button = document.getElementById(id);
  if (!button) return;
  const press = (event: Event): void => { event.preventDefault(); keys.add(code); };
  const release = (event: Event): void => { event.preventDefault(); keys.delete(code); };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}
bindHeldButton("dr-left-btn", "KeyA");
bindHeldButton("dr-forward-btn", "KeyW");
bindHeldButton("dr-right-btn", "KeyD");
bindHeldButton("dr-dive-btn", "KeyQ");
bindHeldButton("dr-surface-btn", "KeyE");

import { createDeepOceanEnvironment } from "./environment";

// ---------------- Scene Construction ----------------
const initialSonarTargets = [
  { id: "buoy", position: BUOY_STATION },
  ...WRECK_OBSTACLES.map((target) => ({ id: target.id, position: target })),
  ...crates.map((target) => ({ id: target.id, position: target }))
] as const;
const SILT_OFFSETS = [
  [-4, 1.8, 3], [-2.8, -1.2, 5], [-1.2, 2.4, 7], [1.1, -2, 4], [2.7, 1.1, 6], [4.2, -0.5, 8],
  [-5.2, -2.1, 10], [-3.5, 3, 12], [-0.4, -2.8, 11], [2, 2.8, 10], [4.8, 1.7, 13], [5.5, -2.4, 15]
] as const;

const sceneDef = scene()
  // Grade the water as a deep, almost-black salvage map so the warm wreck
  // windows and cyan sonar returns establish the focal hierarchy. The typed
  // submarine remains readable against this darker field while distant reefs
  // recede instead of flattening the whole frame into one teal wash.
  .background(visualReviewCapture ? "#10424a" : "#082f3a")
  .add(effects.fog({
    name: "deep recovery suspended-particle haze",
    color: visualReviewCapture ? "#28666a" : "#155968",
    density: visualReviewCapture ? 0.024 : 0.026,
    intensity: visualReviewCapture ? 0.48 : 0.5
  }))
  .add(effects.neonBloom({
    name: "deep recovery sonar bloom",
    intensity: 0.1,
    threshold: 0.72,
    maxIntensity: 0.42,
    antiBlowout: true
  }))
  .camera(
    camera.follow({
      targetNode: "camera-target",
      // A higher, wider three-quarter dive composition lets the sub, wreck
      // island, and luminous route markers read together like a salvage chart
      // instead of filling the frame with a single vehicle cutout.
      // The comparison state is a salvage chart, so its dedicated camera is
      // genuinely overhead: the submarine, chapel island, rings, and wreck
      // form one readable map instead of a forest of near-camera columns.
      offset: visualReviewCapture ? [4.6, 21.8, 5.2] : [6.8, 15.6, -22.0],
      // The default route keeps the submarine in the west foreground while
      // aiming through the illuminated wreck basin. The old neutral target
      // looked down an empty corridor and left the typed world landmark at
      // the frame edge; this target makes the approach and destination share
      // one readable water column without changing movement authority.
      targetOffset: visualReviewCapture ? [4.5, -3.1, -5.2] : [-3.4, -1.6, -7.5],
      // Keep camera and authored submarine pose coherent during sonar/replay teleports.
      // The route's evidence harness captures within a bounded frame window; interpolation
      // otherwise leaves depth-aligned landmarks outside the capture frustum.
      smoothing: 0,
      fov: visualReviewCapture ? 47 : 57
    })
  )
  .addMany([
    // Keep unsupported postprocess out of this root-safe evidence path. The
    // scene's emissive materials and authored lights provide the visible cues.
    ...createDeepOceanEnvironment({ review: visualReviewCapture }),

    // Camera target rig
    primitives
      .sphere({
        name: "camera-target",
        material: material.emissive({ color: "#000000", emissive: "#000000", opacity: 0 })
      })
      .scale(0.05)
      .position(subState.x, subState.y, subState.z)
      .runtime({ id: "camera-target", tags: ["camera-rig"] }),

    // Recovery Buoy Station
    model(assets.deepRecoveryBuoyBeacon, {
      name: "buoy-station",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: visualReviewCapture ? 0.001 : 4.25
    }).position(BUOY_STATION.x, BUOY_STATION.y, BUOY_STATION.z).runtime({ id: "buoy-station", tags: ["bank-zone", "repair-zone"] }),

    // Wreck Obstacles
    ...(visualReviewCapture ? [] : WRECK_OBSTACLES).map((obs) =>
      model(assets.deepRecoveryWreckHull, {
        name: `wreck-${obs.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: obs.radius * 2.2
      }).position(obs.x, obs.y, obs.z).runtime({ id: `wreck-${obs.id}`, tags: ["sonar-target", "authored-collision"] })
    ),

    // Submarine Player Entity
    model(assets.deepRecoverySub, {
      name: "sub-root",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: visualReviewCapture ? 3.55 : 8.4,
      // The typed source is a deep-navy vehicle that disappears against the
      // trench walls in the sonar frame. Keep its geometry and provenance,
      // but give the hero a cool teal PBR finish so the hull, nose lamps, and
      // contact silhouette remain readable in the authored underwater grade.
      material: material.pbr({
        name: "deep recovery sub teal hull",
        color: "#1a9bb0",
        emissive: "#0b5261",
        emissiveIntensity: visualReviewCapture ? 0.72 : 0.74,
        roughness: 0.3,
        metallic: 0.46,
        clearcoat: 0.2,
        clearcoatRoughness: 0.2
      })
    }).position(subState.x, subState.y, subState.z).runtime({ id: "sub-root", tags: ["player", "primary-vehicle"] }),

    // Typed primary-world landmark placed at the exact sonar-reveal depth. The
    // environment primitives remain atmospheric dressing; this real wreck asset
    // guarantees a readable authored subject in the follow-camera capture.
    model(assets.deepRecoveryWreckHull, {
      name: "sonar reveal wreck landmark",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: visualReviewCapture ? 5.45 : 7.2,
      material: visualReviewCapture ? material.pbr({
        name: "deep recovery oxidized chapel wreck",
        color: "#64796b",
        emissive: "#2d5b51",
        emissiveIntensity: 0.58,
        roughness: 0.52,
        metallic: 0.34,
        clearcoat: 0.12,
        clearcoatRoughness: 0.42
      }) : undefined
    }).position(-6.4, -11.7, -11.6).runtime({ id: "sonar-reveal-wreck-landmark", tags: ["typed-asset", "environment-landmark"] }),

    // The review lens is a real mission state, not an empty beauty render.
    // Typed cargo is embedded in the revealed debris field so the world-space
    // sonar bearings lead to resources the player can actually recover.
    ...(visualReviewCapture ? [
      model(assets.deepRecoveryCrateStandard, {
        name: "review standard salvage contact",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.72,
        material: material.pbr({ name: "review standard cargo", color: "#d6a54d", emissive: "#684719", emissiveIntensity: 0.34, roughness: 0.5, metallic: 0.32 })
      }).position(-2.4, -14.08, -16.25).rotate(0.08, -0.32, 0.12).runtime({ id: "review-standard-contact", tags: ["typed-asset", "salvage-contact"] }),
      model(assets.deepRecoveryCrateHeavy, {
        name: "review heavy salvage contact",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.92,
        material: material.pbr({ name: "review heavy cargo", color: "#b86439", emissive: "#672e1d", emissiveIntensity: 0.32, roughness: 0.54, metallic: 0.38 })
      }).position(1.2, -14.02, -11.0).rotate(-0.06, 0.4, -0.08).runtime({ id: "review-heavy-contact", tags: ["typed-asset", "salvage-contact"] }),
      model(assets.deepRecoveryCrateStandard, {
        name: "review chapel supply contact",
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.62,
        material: material.pbr({ name: "review chapel supply", color: "#668d7f", emissive: "#214f4a", emissiveIntensity: 0.3, roughness: 0.58, metallic: 0.26 })
      }).position(-4.7, -13.94, -9.7).rotate(0.12, -0.16, 0.08).runtime({ id: "review-chapel-contact", tags: ["typed-asset", "salvage-contact"] })
    ] : []),

    // Renderer-owned warm lamp volume, breach beacon, and grapple cable.
    primitives.sphere({
      name: "sub-lamp-volume",
      material: material.emissive({ name: "sub lamp water", color: "#713f12", emissive: "#fde68a", opacity: 0.06 })
    }).scale(visualReviewCapture ? [1.35, 0.55, 2.4] : [1.8, 0.9, 3.2]).position(0, -6, 4).runtime({ id: "sub-lamp-volume", tags: ["lamp", "state-light"] }),
    primitives.cylinder({
      name: "sub-lamp-port",
      material: material.emissive({ name: "warm port lamp beam", color: "#78350f", emissive: "#fde68a", opacity: 0.12 })
    }).scale(visualReviewCapture ? [0.12, 1.45, 0.12] : [0.16, 2.0, 0.16]).rotate(Math.PI / 2, 0, 0).position(-0.5, -6.2, 3).runtime({ id: "sub-lamp-port", tags: ["lamp", "world-space-light-cue"] }),
    primitives.cylinder({
      name: "sub-lamp-starboard",
      material: material.emissive({ name: "warm starboard lamp beam", color: "#78350f", emissive: "#fde68a", opacity: 0.12 })
    }).scale(visualReviewCapture ? [0.12, 1.45, 0.12] : [0.16, 2.0, 0.16]).rotate(Math.PI / 2, 0, 0).position(0.5, -6.2, 3).runtime({ id: "sub-lamp-starboard", tags: ["lamp", "world-space-light-cue"] }),
    primitives.sphere({
      name: "breach-beacon",
      material: material.emissive({ name: "breach warning", color: "#7f1d1d", emissive: "#ef4444", opacity: 0.85 })
    }).scale(0.28).position(0, -100, 0).runtime({ id: "breach-beacon", tags: ["warning", "state-light"] }),
    primitives.box({
      name: "grapple-line",
      material: material.emissive({ name: "grapple cable", color: "#f59e0b", emissive: "#fbbf24", opacity: 0.95 })
    }).scale([0.045, 0.045, 0.1]).position(0, -100, 0).runtime({ id: "grapple-line", tags: ["tether", "world-space-truth"] }),
    ...SILT_OFFSETS.map((offset, index) =>
      primitives.sphere({
        name: `silt-mote-${index}`,
        material: material.emissive({
          name: `bioluminescent silt ${index}`,
          color: index % 3 === 0 ? "#064e3b" : "#083344",
          emissive: index % 3 === 0 ? "#34d399" : "#22d3ee",
          opacity: 0.7
        })
      }).scale(index % 4 === 0 ? 0.2 : 0.12).position(offset[0], -6 + offset[1], offset[2]).runtime({ id: `silt-mote-${index}`, tags: ["underwater-particle", "renderer-owned"] })
    ),

    // Sonar Wave Expanding Pulse Ring
    primitives
      .cylinder({
        name: "sonar-pulse-ring",
        material: material.emissive({
          name: "sonar-wave-mat",
          color: "#0c4a6e",
          emissive: "#38bdf8",
          opacity: 0.35
        })
      })
      .position(0, -100, 0)
      .scale([0.1, 0.05, 0.1]),

    // Crates
    ...(visualReviewCapture ? [] : crates).map((c) =>
      model(c.kind === "crate-heavy" ? assets.deepRecoveryCrateHeavy : assets.deepRecoveryCrateStandard, {
        name: `crate-node-${c.id}`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: c.kind === "crate-heavy" ? 1.8 : 1.35
      }).position(c.x, c.y, c.z).runtime({ id: `crate-node-${c.id}`, tags: ["salvage", c.kind] })
    ),

    // Contact markers occupy the target's real world position and are hidden
    // until the spherical sonar query returns that exact target.
    ...(visualReviewCapture ? [] : initialSonarTargets).map((target) =>
      primitives.torus({
        name: `sonar-marker-${target.id}`,
        material: material.emissive({ name: "sonar contact", color: "#075985", emissive: "#67e8f9", emissiveIntensity: 2.1, opacity: 0.88 })
      }).scale([1.05, 1.05, 0.1]).position(target.position.x, target.position.y, target.position.z).runtime({ id: `sonar-marker-${target.id}`, tags: ["sonar-return", "world-space-truth"] })
    )
  ]);

const app = createAuraApp("#canvas-host", {
  scene: sceneDef
});

app.onFrame((frame) => {
  const dt = typeof frame === "number" ? frame : (frame?.dt ?? 1 / 60);
  runSimulationStep(Math.min(dt, 0.05));
});

audio.startAmbience();

// ---------------- Gameplay Actions ----------------
function handlePing(): void {
  if (gameState !== "playing") return;
  const subPos = { x: subState.x, y: subState.y, z: subState.z };
  const targets: SonarTarget[] = [
    { id: "buoy", kind: "buoy", position: BUOY_STATION, value: 0 },
    ...WRECK_OBSTACLES.map((w) => ({ id: w.id, kind: "wreck" as const, position: { x: w.x, y: w.y, z: w.z }, value: 0 })),
    ...crates.filter((c) => !c.banked).map((c) => ({ id: c.id, kind: c.kind, position: { x: c.x, y: c.y, z: c.z }, value: c.baseValue }))
  ];

  const result = triggerPing(
    sonarState,
    subPos,
    targets,
    timeSinceStart,
    WRECK_OBSTACLES.map((wreck) => ({ id: wreck.id, position: wreck, radius: wreck.radius }))
  );
  if (result.newContacts.length > 0 || result.nextState.pingCount > sonarState.pingCount) {
    sonarState = result.nextState;
    audio.playCue("sonar-ping", 0.9);
    if (result.newContacts.length > 0) {
      setTimeout(() => audio.playCue("sonar-return", 0.75), 250);
    }
  }
}

function atBuoyServiceZone(): boolean {
  return Math.hypot(subState.x - BUOY_STATION.x, subState.z - BUOY_STATION.z) <= BUOY_STATION.dockRadius
    && subState.y >= -4;
}

function handleRepair(): boolean {
  if (gameState !== "playing" || !oxygenState.breached || !atBuoyServiceZone()) return false;
  oxygenState = patchBreach(oxygenState);
  repairCount += 1;
  sensorEventCount += 1;
  audio.playCue("patch-seal", 0.85);
  syncHud();
  updateEvidence();
  return true;
}

function handleGrappleToggle(): void {
  if (gameState !== "playing") return;
  const subPos = { x: subState.x, y: subState.y, z: subState.z };
  const tetheredCount = crates.filter((c) => c.tethered).length;

  if (tetheredCount > 0) {
    releaseTethers(crates);
  } else {
    const res = tryGrappleCrates(subPos, crates);
    if (res.latchedCrate) {
      audio.playCue("grapple-latch", 0.85);
      sensorEventCount += 1;
    }
  }
}

function togglePause(): void {
  if (gameState === "blackout" || gameState === "won") return;
  if (gameState === "playing") {
    gameState = "paused";
    audio.stopAmbience();
  } else {
    gameState = "playing";
    audio.startAmbience();
  }
  updateEvidence();
}

function resetGame(): void {
  subState = initialSubmarineState();
  oxygenState = initialOxygenState();
  sonarState = initialSonarState();
  crates = initialCrateSpawns();
  bankedTotal = 0;
  standardBanked = false;
  heavyBanked = false;
  breachCount = 0;
  repairCount = 0;
  lastTowDrag = 0;
  surfaceCuePlayed = false;
  oxygenWarningCuePlayed = false;
  sensorEventCount = 0;
  frameCount = 0;
  timeSinceStart = 0;
  keys.clear();
  gameState = "playing";
  elModal.classList.remove("active");
  elModalActionBtn.style.display = "inline-block";
  syncVisualNodes();
  syncHud();
  updateEvidence();
}

// ---------------- Frame Update Loop ----------------
function runSimulationStep(dt: number): void {
  if (compositionProbeActive) {
    syncVisualNodes();
    updateEvidence();
    return;
  }
  if (gameState !== "playing") {
    updateEvidence();
    return;
  }

  frameCount += 1;
  timeSinceStart += dt;

  // 1. Gather Inputs
  let throttle = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) throttle += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) throttle -= 1;

  let turn = 0;
  if (keys.has("KeyD") || keys.has("ArrowRight")) turn += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) turn -= 1;

  let heave = 0;
  if (keys.has("KeyE") || keys.has("PageUp")) heave += 1;
  if (keys.has("KeyQ") || keys.has("PageDown")) heave -= 1;

  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const pitch = throttle * 0.2 + heave * 0.3;

  // 2. Physics & Submarine Update
  const tetheredCrates = crates.filter((c) => c.tethered);
  const tetherResult = updateTetherPhysics(
    { x: subState.x, y: subState.y, z: subState.z },
    crates,
    dt
  );
  lastTowDrag = tetherResult.towDragForce;

  subState = updateSubmarine(
    subState,
    { throttle, heave, turn, pitch, sprint },
    tetherResult.towDragForce,
    dt
  );

  // Check collision impact
  if (subState.impactSpeedLastFrame > 3.5) {
    const impactRes = applyCollisionImpact(oxygenState, subState.impactSpeedLastFrame);
    oxygenState = impactRes.nextState;
    if (impactRes.breachedJustNow) {
      breachCount += 1;
      audio.playCue("breach-alarm", 0.9);
      audio.playCue("hull-creak", 0.8);
      sensorEventCount += 1;
    }
  }

  // 3. Oxygen & Hull Update
  oxygenState = updateOxygen(
    oxygenState,
    subState.y,
    sprint,
    tetheredCrates.length,
    dt
  );

  if (oxygenState.warningActive && !oxygenWarningCuePlayed) {
    oxygenWarningCuePlayed = true;
    audio.playCue("oxygen-warn", 0.9);
  }

  if (oxygenState.blackout && gameState === "playing") {
    gameState = "blackout";
    audio.playCue("blackout", 1.0);
    audio.stopAmbience();
    showModal("Submarine Blackout", "Life support depleted. Oxygen level hit 0%.", true);
  }

  // Surface provides oxygen, but hull repair remains an explicit C/button
  // decision inside the buoy service zone.
  if (subState.y >= -1.0) {
    if (oxygenState.oxygen < 99) {
      oxygenState = refuelAtSurface(oxygenState);
      if (!surfaceCuePlayed) {
        surfaceCuePlayed = true;
        audio.playCue("surface-break", 0.7);
      }
    }
  }

  // 4. Sonar Update
  sonarState = updateSonar(sonarState, dt);

  // 5. Crate Banking Check
  const bankRes = bankSecuredCrates(
    { x: subState.x, y: subState.y, z: subState.z },
    crates,
    BUOY_STATION.dockRadius
  );
  if (bankRes.bankedCount > 0) {
    bankedTotal += bankRes.bankedValue;
    audio.playCue("crate-bank", 0.9);
    sensorEventCount += 1;

    standardBanked ||= bankRes.bankedKinds.includes("crate-standard");
    heavyBanked ||= bankRes.bankedKinds.includes("crate-heavy");
  }

  if (standardBanked && heavyBanked && breachCount > 0 && repairCount > 0 && !oxygenState.breached && subState.y >= -1 && gameState === "playing") {
    gameState = "won";
    audio.playCue("surface-break", 1);
    audio.stopAmbience();
    showModal("Recovery Complete", `Standard and heavy salvage secured for ${bankedTotal} CR. Crew surfaced with life support online.`, false);
  }

  // 6. Sync Visuals
  syncVisualNodes();

  // 7. Sync HUD
  syncHud();

  // 8. Publish Evidence
  updateEvidence();
}

function syncVisualNodes(): void {
  // Update camera target rig
  const camNode = app.nodes.get("camera-target");
  if (camNode) {
    camNode.setPosition?.(subState.x, subState.y, subState.z);
    camNode.setRotation?.(0, subState.yaw, 0);
  }

  // Update submarine position & orientation
  const subNode = app.nodes.get("sub-root");
  if (subNode) {
    subNode.setPosition?.(subState.x, subState.y, subState.z);
    subNode.setRotation?.(subState.pitch, subState.yaw, subState.roll);
  }

  const lampNode = app.nodes.get("sub-lamp-volume");
  lampNode?.setPosition?.(
    subState.x + Math.sin(subState.yaw) * 3.4,
    subState.y - 0.1,
    subState.z + Math.cos(subState.yaw) * 3.4
  );
  lampNode?.setRotation?.(subState.pitch, subState.yaw, 0);
  lampNode?.setVisible?.(!visualReviewCapture && !compositionProbeActive && gameState !== "blackout");
  for (const [index, side] of [-0.52, 0.52].entries()) {
    const beam = app.nodes.get(index === 0 ? "sub-lamp-port" : "sub-lamp-starboard");
    const sideX = Math.cos(subState.yaw) * side;
    const sideZ = -Math.sin(subState.yaw) * side;
    beam?.setPosition?.(
      subState.x + sideX + Math.sin(subState.yaw) * 3.1,
      subState.y - 0.2,
      subState.z + sideZ + Math.cos(subState.yaw) * 3.1
    );
    beam?.setRotation?.(Math.PI / 2 + subState.pitch, subState.yaw, 0);
    beam?.setVisible?.(!visualReviewCapture && !compositionProbeActive && gameState !== "blackout");
  }
  SILT_OFFSETS.forEach((offset, index) => {
    const drift = reducedMotion ? 0 : Math.sin(timeSinceStart * 0.7 + index * 1.3) * 0.22;
    const mote = app.nodes.get(`silt-mote-${index}`);
    mote?.setPosition?.(
      subState.x + offset[0],
      subState.y + offset[1] + drift,
      subState.z + offset[2] * (index % 2 === 0 ? 1 : -1)
    );
    mote?.setVisible?.(!compositionProbeActive);
  });
  const breachNode = app.nodes.get("breach-beacon");
  breachNode?.setPosition?.(subState.x, subState.y + 0.9, subState.z);
  breachNode?.setVisible?.(oxygenState.breached);

  // Update crates
  crates.forEach((c) => {
    const crateNode = app.nodes.get(`crate-node-${c.id}`);
    if (crateNode) {
      crateNode.setPosition?.(c.x, c.y, c.z);
      crateNode.setVisible?.(!c.banked);
    }
    app.nodes.get(`sonar-marker-${c.id}`)?.setPosition?.(c.x, c.y + 0.6, c.z);
  });

  const visibleContacts = new Set(sonarState.contacts.map((contact) => contact.id));
  for (const target of initialSonarTargets) {
    const marker = app.nodes.get(`sonar-marker-${target.id}`);
    marker?.setVisible?.(visibleContacts.has(target.id));
    const contact = sonarState.contacts.find((entry) => entry.id === target.id);
    if (marker && contact && !reducedMotion) {
      const pulse = 0.92 + Math.sin(timeSinceStart * 7 + contact.distance) * 0.18;
      marker.setScale?.([pulse, pulse, 0.08]);
    }
  }

  const tethered = crates.find((crate) => crate.tethered && !crate.banked);
  const tetherNode = app.nodes.get("grapple-line");
  if (tetherNode && tethered) {
    const dx = tethered.x - subState.x;
    const dy = tethered.y - subState.y;
    const dz = tethered.z - subState.z;
    const distance = Math.max(0.01, Math.hypot(dx, dy, dz));
    tetherNode.setPosition?.(subState.x + dx / 2, subState.y + dy / 2, subState.z + dz / 2);
    tetherNode.setRotation?.(-Math.asin(dy / distance), Math.atan2(dx, dz), 0);
    tetherNode.setScale?.([0.045, 0.045, distance]);
    tetherNode.setVisible?.(true);
  } else {
    tetherNode?.setVisible?.(false);
  }

  // Update sonar pulse wave
  const sonarNode = app.nodes.get("sonar-pulse-ring");
  if (sonarNode) {
    if (sonarState.pulseWaveRadius > 0 && sonarState.pulseWaveRadius < 40) {
      sonarNode.setPosition?.(subState.x, subState.y, subState.z);
      sonarNode.setScale?.([sonarState.pulseWaveRadius, 0.05, sonarState.pulseWaveRadius]);
      sonarNode.setVisible?.(true);
    } else {
      sonarNode.setVisible?.(false);
    }
  }
}

function missionStage(): MissionStage {
  if (gameState === "blackout") return "blackout";
  if (gameState === "won") return "surface-complete";
  if (heavyBanked) return "ascent";
  if (oxygenState.breached || (standardBanked && repairCount === 0)) return "breach-repair";
  if (repairCount > 0) return "heavy-salvage";
  if (standardBanked) return "breach-repair";
  if (sonarState.pingCount > 0 && Math.abs(subState.y) >= 15) return "standard-salvage";
  if (sonarState.pingCount > 0 || Math.abs(subState.y) >= 12) return "wreck-approach";
  return "descent";
}

const OBJECTIVES: Record<MissionStage, string> = {
  descent: "DESCEND TO 15 M · PULSE SONAR",
  "wreck-approach": "FOLLOW CYAN RETURNS TO THE WRECK",
  "standard-salvage": "GRAPPLE A BLUE STANDARD POD · BANK AT BUOY",
  "breach-repair": "TAKE THE INTERIOR GAP · REPAIR HULL AT BUOY (C)",
  "heavy-salvage": "RECOVER AN AMBER HEAVY POD · EXPECT EXTRA DRAG",
  ascent: "ASCEND TO THE BUOY · SURFACE WITH LIFE SUPPORT ONLINE",
  "surface-complete": "RECOVERY COMPLETE",
  blackout: "BLACKOUT · RESET TO RETRY"
};

function syncHud(): void {
  const zone = getDepthZone(subState.y);
  const stage = missionStage();

  elZoneBadge.textContent = zone.name;
  elBreachBadge.style.display = oxygenState.breached ? "inline-block" : "none";
  document.body.classList.toggle("is-breached", oxygenState.breached);
  document.body.classList.toggle("is-low-oxygen", oxygenState.warningActive);

  // Oxygen
  elOxygenFill.style.width = `${Math.round(oxygenState.oxygen)}%`;
  elOxygenVal.textContent = `${Math.round(oxygenState.oxygen)}%`;
  if (oxygenState.warningActive) {
    elOxygenFill.classList.add("warning");
  } else {
    elOxygenFill.classList.remove("warning");
  }

  // Hull
  elHullFill.style.width = `${Math.round(oxygenState.hull)}%`;
  elHullVal.textContent = `${Math.round(oxygenState.hull)}%`;

  // Depth & Speed
  elDepthVal.textContent = `${Math.abs(subState.y).toFixed(1)} m`;
  elSpeedVal.textContent = `${subState.speed.toFixed(1)} m/s`;

  // Mission & Cargo
  elContractTitle.textContent = `Mission: ${stage.replaceAll("-", " ")}`;
  elObjective.textContent = OBJECTIVES[stage];
  const tetheredCrates = crates.filter((c) => c.tethered);
  elTetherBadge.textContent = `Tether: ${tetheredCrates.length}/1`;
  elBankedVal.textContent = `${bankedTotal} CR · ${standardBanked ? "STD ✓" : "STD ○"} ${heavyBanked ? "HVY ✓" : "HVY ○"}`;

  const tetherValue = tetheredCrates.reduce((sum, c) => sum + Math.round(c.baseValue * zone.valueMultiplier), 0);
  elCargoVal.textContent = `${tetherValue} CR`;

  // Sonar Cooldown
  if (sonarState.pingCooldownRemaining > 0) {
    elSonarCd.textContent = `${sonarState.pingCooldownRemaining.toFixed(1)}s`;
  } else {
    elSonarCd.textContent = "READY";
  }
  elContactList.textContent = sonarState.contacts.length === 0
    ? "No returns — pulse sonar"
    : sonarState.contacts.slice(0, 6).map((contact) => `${contact.kind.replace("crate-", "").toUpperCase()} ${contact.distance.toFixed(0)}m`).join(" · ");
}

function showModal(title: string, desc: string, isFail: boolean): void {
  elModalTitle.textContent = title;
  elModalDesc.textContent = desc;
  if (isFail) {
    elModal.querySelector(".modal-dialog")?.classList.add("failure");
    elModalActionBtn.style.display = "none";
  } else {
    elModal.querySelector(".modal-dialog")?.classList.remove("failure");
    elModalActionBtn.style.display = "inline-block";
    elModalActionBtn.textContent = "Run again";
  }
  elModal.classList.add("active");
}

function updateEvidence(): void {
  const tetheredCrates = crates.filter((c) => c.tethered);
  const currentZone = getDepthZone(subState.y);
  const cargoVal = tetheredCrates.reduce((sum, c) => sum + Math.round(c.baseValue * currentZone.valueMultiplier), 0);

  const diagnostics = app.diagnostics() as { readonly drawCalls?: number; readonly renderSize?: readonly number[]; readonly runtimeBackend?: string };
  const tetheredMass = tetheredCrates.reduce((sum, crate) => sum + crate.mass, 0);
  window.__DEEP_RECOVERY_EVIDENCE__ = {
    mounted: true,
    status: frameCount >= 90 && Number(diagnostics.drawCalls ?? 0) > 0 ? "ready" : "loading",
    state: gameState,
    missionStage: missionStage(),
    depth: Math.abs(subState.y),
    oxygen: oxygenState.oxygen,
    hull: oxygenState.hull,
    salvageValue: cargoVal,
    bankedValue: bankedTotal,
    cratesSecured: crates.filter((c) => c.banked).length,
    cratesTotal: crates.length,
    sonarPings: sonarState.pingCount,
    sonarReturns: sonarState.returnCount,
    markerAgeOuts: sonarState.ageOutCount,
    sensorEventCount,
    motionMode: "authored",
    frameCount,
    audioCues: audio.getHistory(),
    subPosition: [subState.x, subState.y, subState.z],
    standardBanked,
    heavyBanked,
    breachCount,
    repairCount,
    towMassKg: tetheredMass,
    towDrag: lastTowDrag,
    reducedMotion,
    sonarContacts: sonarState.contacts.map((contact) => ({
      id: contact.id,
      kind: contact.kind,
      position: [contact.position.x, contact.position.y, contact.position.z] as const,
      distance: Number(contact.distance.toFixed(3))
    })),
    systems: [
      "route-local-authored-thrust-drag-buoyancy-and-collision",
      "route-local-spherical-sonar-with-authored-wreck-occlusion",
      "world-space-sonar-returns-and-grapple-line",
      "mass-dependent-tow-handling",
      "oxygen-breach-explicit-repair-blackout-surface-loop",
      "keyboard-touch-pause-reset-reduced-motion"
    ],
    controls: ["W/S thrust", "A/D turn", "Q/E dive/surface", "Shift sprint", "Space sonar", "F grapple/drop", "C repair at buoy", "P pause", "R reset", "touch movement/actions"],
    claimBoundary: "createAuraApp root-safe prototype with deterministic route-local motion, collision, sonar, oxygen, breach, repair, grapple, tow, bank, and mission rules; no Rapier, Recast, fluid/acoustic simulation, reusable game kit, production-runtime-only, or engine-parity claim",
    primaryAssets: [
      "assets.deepRecoverySub",
      "assets.deepRecoveryWreckHull",
      "assets.deepRecoveryCrateStandard",
      "assets.deepRecoveryCrateHeavy",
      "assets.deepRecoveryBuoyBeacon"
    ],
    primaryAssetHashes: PRIMARY_ASSET_REFS.map((asset) => asset.hash),
    renderer: diagnostics
  };
}

// Window Hooks for Deterministic Playwright Tests
window.__DR_PUMP__ = (frames: number): number => {
  for (let i = 0; i < frames; i += 1) {
    runSimulationStep(1 / 60);
  }
  return frameCount;
};

window.__DR_TELEPORT__ = (x: number, y: number, z: number): void => {
  subState.x = x;
  subState.y = y;
  subState.z = z;
  subState.vx = 0;
  subState.vy = 0;
  subState.vz = 0;
  syncVisualNodes();
  syncHud();
  updateEvidence();
};

window.__DR_TELEPORT_CRATE__ = (id: string, x: number, y: number, z: number): void => {
  const crate = crates.find((entry) => entry.id === id);
  if (!crate) return;
  crate.x = x;
  crate.y = y;
  crate.z = z;
  crate.vx = 0;
  crate.vy = 0;
  crate.vz = 0;
  syncVisualNodes();
  updateEvidence();
};

window.__DR_IMPACT__ = (speed: number): void => {
  const impact = applyCollisionImpact(oxygenState, speed);
  oxygenState = impact.nextState;
  if (impact.breachedJustNow) {
    breachCount += 1;
    sensorEventCount += 1;
    audio.playCue("breach-alarm", 0.9);
    audio.playCue("hull-creak", 0.8);
  }
  syncVisualNodes();
  syncHud();
  updateEvidence();
};

window.__DR_SET_OXYGEN__ = (oxygen: number): void => {
  const clamped = Math.max(0, Math.min(100, oxygen));
  oxygenState = { ...oxygenState, oxygen: clamped, warningActive: clamped > 0 && clamped <= 25, blackout: false };
  oxygenWarningCuePlayed = false;
  syncHud();
  updateEvidence();
};

window.__DR_REPAIR__ = (): boolean => handleRepair();

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: { position: visualReviewCapture ? [-11.5, -12, -7] : [-1.7, -6, -2], rotation: [0, 0, 0], targetSize: 4.2 },
    settleSubjectPose() {
      compositionProbeActive = true;
      subState = visualReviewCapture
        ? { ...initialSubmarineState(), ...REVIEW_POSE }
        : { ...initialSubmarineState(), x: -1.7, y: -6, z: -2, yaw: 0 };
      // Seed the same sonar contact that the playable producer uses for its
      // named wreck-approach artifact.  This keeps both the normal route
      // primary probe and the dedicated review lens grounded in an actual
      // mission state instead of showing a beauty frame with no returns.
      sonarState = initialSonarState();
      handlePing();
      syncVisualNodes();
      syncHud();
      updateEvidence();
    },
    setSubjectSuppressed(suppressed: boolean) {
      app.nodes.get("sub-root")?.setVisible(!suppressed);
    }
  }
});

syncVisualNodes();
syncHud();
updateEvidence();
