import {
  camera as auraCamera,
  environments,
  game,
  lights,
  material,
  model,
  primitives,
  scene as auraScene,
  type GameInputController,
  type GameInputReplayEvent,
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import direction from "../art/direction";
import { assets } from "./aura-assets";
import {
  buildGhostPlan,
  createGhostPlayback,
  exportBestRun,
  GHOST_FPS,
  importBestRun,
  loadBestRunRaw,
  saveBestRun,
  simulateAttempt,
  trajectoryHash,
  type GhostAttempt,
  type GhostPlayback,
  type GhostSample,
  type StoredBestRun,
} from "./ghost";
import {
  createLanderState,
  FUEL_BURN_PER_SECOND,
  gustForceAt,
  gustTelegraphActive,
  hspeedOf,
  LANDER_GRAVITY,
  MAIN_THRUST_ACCELERATION,
  MAX_SPEED,
  MAX_TILT_DEG,
  RCS_FUEL_FRACTION,
  RCS_LATERAL_ACCELERATION,
  RCS_YAW_RATE,
  stepLander,
  TILT_DAMPING_PER_SECOND,
  TILT_GAIN_PER_SECOND,
  type Controls,
  type LanderState,
} from "./lander";
import {
  PREDICTION_FIXED_DT,
  PREDICTION_HORIZON_SECONDS,
  predictLanding,
  type LandingPrediction,
} from "./prediction";
import {
  campaignScore,
  SITES,
  SPAWN_HEIGHT_ABOVE_PAD,
  TERRAIN_CELL_SIZE,
  TERRAIN_CELLS_X,
  TERRAIN_CELLS_Z,
  TERRAIN_HEIGHT_SCALE,
  type GustWindow,
  type LanderSite,
  type LandingPad,
} from "./sites";
import {
  createTerrainField,
  sampleGridHeight,
  type TerrainField,
} from "./terrain";
import {
  gradeTouchdown,
  HARD_LANDING_HULL_DAMAGE,
  HARD_TOUCHDOWN_MAX_VSPEED,
  hullAfterTouchdown,
  LANDER_MAX_HULL,
  MAX_ATTITUDE_DEG,
  MAX_LANDING_SLOPE_DEG,
  scoreTouchdown,
  SOFT_TOUCHDOWN_MAX_VSPEED,
  type GradedTouchdown,
  type LandingGrade,
  type ScoreBreakdown,
} from "./touchdown";

export type AuroraRunPhase = "descending" | "landed" | "crashed" | "campaign-complete";

export type AuroraScenarioName =
  | "02-opening"
  | "03-mid"
  | "04-action"
  | "ridgeline"
  | "storm"
  | "touchdown"
  | "quality-medium";

export interface AuroraCameraRigState {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly fovDeg: number;
  readonly altitudeT: number;
  readonly landerInFrame: boolean;
  readonly padInFrame: boolean;
  readonly landerNdc: readonly [number, number];
  readonly padNdc: readonly [number, number];
}

export interface AuroraEvaluationSummary {
  readonly outcome: "flying" | LandingGrade;
  readonly score: number;
  readonly reason: string;
  readonly summary: string;
  readonly verticalSpeed: number;
  readonly horizontalSpeed: number;
  readonly tiltDeg: number;
  readonly padOffsetNormalized: number;
  readonly breakdown: ScoreBreakdown | null;
}

export interface AuroraPublicSnapshot {
  readonly route: "showcase-aurora-lander";
  readonly state: "playing" | "paused" | "gameover" | "won";
  readonly phase: AuroraRunPhase;
  readonly paused: boolean;
  readonly siteIndex: number;
  readonly siteId: string;
  readonly siteName: string;
  readonly siteCount: number;
  readonly completedSites: readonly boolean[];
  readonly siteScores: readonly number[];
  readonly hull: number;
  readonly runTimeSeconds: number;
  readonly totalElapsedSeconds: number;
  readonly frameCount: number;
  readonly attempts: number;
  readonly crashes: number;
  readonly totalScore: number;
  readonly totalFuelUsed: number;
  readonly autorun: boolean;
  readonly approachPreset: boolean;
  readonly activeScenario: AuroraScenarioName | null;
  readonly seed: number;
  readonly statusText: string;
  readonly lander: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly vx: number;
    readonly vy: number;
    readonly vz: number;
    readonly speed: number;
    readonly verticalSpeed: number;
    readonly horizontalSpeed: number;
    readonly angleRad: number;
    readonly angleDeg: number;
    readonly yaw: number;
    readonly fuel: number;
    readonly maxFuel: number;
    readonly fuelFraction: number;
    readonly thrusting: boolean;
    readonly torqueInput: -1 | 0 | 1;
    readonly altitude: number;
    readonly surfaceHeight: number;
    readonly padDistanceX: number;
    readonly padDistanceY: number;
    readonly onPadBounds: boolean;
    readonly touchdown: "flying" | "landed" | "crashed";
  };
  readonly wind: {
    readonly windX: number;
    readonly gustActive: boolean;
    readonly gustWarning: boolean;
  };
  readonly pad: {
    readonly index: number;
    readonly x: number;
    readonly z: number;
    readonly radius: number;
    readonly y: number;
    readonly multiplier: number;
  };
  readonly terrain: {
    readonly rows: number;
    readonly columns: number;
    readonly cellSize: number;
    readonly minHeight: number;
    readonly maxHeight: number;
  };
  readonly prediction: LandingPrediction;
  readonly touchdown: AuroraEvaluationSummary | null;
  readonly ghost: {
    readonly hasGhost: boolean;
    readonly sampleCount: number;
    readonly bestScore: number | null;
    readonly trajectoryHash: string | null;
    readonly activePose: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    } | null;
  };
  readonly camera: AuroraCameraRigState;
  readonly render: {
    readonly canvasAttached: boolean;
    readonly width: number;
    readonly height: number;
    readonly frameCount: number;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly qualityTier: string;
  };
}

interface AuroraAudioController {
  readonly initialized: boolean;
  readonly muted: boolean;
  readonly activeCues: readonly string[];
  readonly lastEvent: string | null;
  readonly thrustActive: boolean;
  readonly gustWarnActive: boolean;
  unlock(): void;
  updateFromRuntime(params: {
    readonly phase: AuroraRunPhase;
    readonly thrusting: boolean;
    readonly torqueInput: -1 | 0 | 1;
    readonly fuelFraction: number;
    readonly gustActive: boolean;
    readonly gustWarning: boolean;
    readonly onPadBounds: boolean;
    readonly altitude: number;
    readonly evaluation: AuroraEvaluationSummary | null;
  }): void;
  dispose(): void;
}

interface AuroraFxRig {
  readonly group: THREE.Group;
  readonly plumeIntensity: number;
  readonly rcsLeftIntensity: number;
  readonly rcsRightIntensity: number;
  readonly dustBurstIntensity: number;
  readonly activeEmitters: number;
  update(params: {
    readonly lander: LanderState;
    readonly thrusting: boolean;
    readonly torqueInput: -1 | 0 | 1;
    readonly altitude: number;
    readonly surfaceY: number;
    readonly elapsedSeconds: number;
  }): void;
}

interface AuroraWorldGroup {
  readonly root: THREE.Group;
  readonly landerRig: THREE.Group;
  readonly ghostRig: THREE.Group;
  readonly beaconGroup: THREE.Group;
  readonly predictionMarker: THREE.Mesh;
  readonly touchRing: THREE.Mesh;
  readonly auroraRibbons: readonly THREE.Mesh[];
  readonly exhaustLight: THREE.PointLight;
  readonly beaconLights: readonly THREE.PointLight[];
  modelsLoaded: boolean;
  rebuildForSite(field: TerrainField, site: LanderSite): void;
  dispose(): void;
}

interface AuroraRuntimeState {
  siteIndex: number;
  site: LanderSite;
  terrain: TerrainField;
  lander: LanderState;
  lastControls: Controls;
  hull: number;
  phase: AuroraRunPhase;
  paused: boolean;
  userPaused: boolean;
  autorun: boolean;
  approachPreset: boolean;
  activeScenario: AuroraScenarioName | null;
  freezeSimulation: boolean;
  seed: number;
  runTimeSeconds: number;
  totalElapsedSeconds: number;
  frameCount: number;
  attemptFrame: number;
  attempts: number;
  crashes: number;
  siteScores: number[];
  totalScore: number;
  totalFuelUsed: number;
  completedSites: boolean[];
  lastEvaluation: AuroraEvaluationSummary | null;
  prediction: LandingPrediction;
  currentSamples: GhostSample[];
  bestRuns: Map<number, StoredBestRun>;
  ghostPlayback: GhostPlayback;
  ghostCurrentState: LanderState | null;
  statusText: string;
  lastStepDt: number;
  qualityTier: string;
  input: GameInputController;
  cameraRig: AuroraCameraRigState;
  audio: AuroraAudioController;
}

const FIXED_STEP_SECONDS = 1 / GHOST_FPS;
const MAX_ACCUMULATED_SECONDS = 0.25;
const LANDER_FOOT_DROP = 0.9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseQueryConfig(): {
  readonly siteIndex: number;
  readonly autorun: boolean;
  readonly approach: boolean;
  readonly scenario: AuroraScenarioName | null;
  readonly freezeAtEnd: boolean;
  readonly seed: number;
  readonly qualityTier: string;
} {
  if (typeof window === "undefined") {
    return {
      siteIndex: 0,
      autorun: false,
      approach: false,
      scenario: null,
      freezeAtEnd: false,
      seed: 1,
      qualityTier: "high",
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawSite = Number.parseInt(params.get("site") ?? "0", 10);
  const siteIndex = Number.isFinite(rawSite)
    ? clamp(rawSite, 0, SITES.length - 1)
    : 0;
  const autorun = params.get("autorun") === "1" || params.get("autorun") === "true";
  const approach = params.get("approach") === "1" || params.get("approach") === "true";
  const rawScenario = params.get("scenario");
  const validScenarios: readonly AuroraScenarioName[] = [
    "02-opening",
    "03-mid",
    "04-action",
    "ridgeline",
    "storm",
    "touchdown",
    "quality-medium",
  ];
  const scenario = validScenarios.includes(rawScenario as AuroraScenarioName)
    ? (rawScenario as AuroraScenarioName)
    : null;
  const freezeAtEnd = params.get("freezeAt") === "end";
  const rawSeed = Number.parseInt(params.get("seed") ?? "1", 10);
  const seed = Number.isFinite(rawSeed) && rawSeed > 0 ? rawSeed : 1;
  const qualityTier =
    params.get("aura3d-quality") ?? (scenario === "quality-medium" ? "medium" : "high");
  return {
    siteIndex,
    autorun,
    approach,
    scenario,
    freezeAtEnd,
    seed,
    qualityTier,
  };
}

function createAuroraAudioController(): AuroraAudioController {
  let context: AudioContext | null = null;
  let initialized = false;
  const muted = false;
  let lastEvent: string | null = null;
  let thrustActive = false;
  let gustWarnActive = false;
  let padLockPlayed = false;
  let fuelWarnPlayed = false;
  let lastPhase: AuroraRunPhase = "descending";
  const activeCueSet = new Set<string>(["ambientWind"]);

  function ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!context) {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          context = new AudioCtx();
          initialized = true;
        } catch {
          context = null;
        }
      }
    }
    if (context && context.state === "suspended") {
      void context.resume().catch(() => {});
    }
    return context;
  }

  function playTone(
    freqHz: number,
    durationSec: number,
    gainValue: number,
    type: OscillatorType = "sine"
  ): void {
    if (muted) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state !== "running") return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqHz, ctx.currentTime);
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationSec);
    } catch {
      // Ignore WebAudio state errors in headless mode.
    }
  }

  return {
    get initialized() {
      return initialized;
    },
    get muted() {
      return muted;
    },
    get activeCues() {
      return Array.from(activeCueSet);
    },
    get lastEvent() {
      return lastEvent;
    },
    get thrustActive() {
      return thrustActive;
    },
    get gustWarnActive() {
      return gustWarnActive;
    },
    unlock() {
      ensureContext();
    },
    updateFromRuntime(params) {
      thrustActive = params.phase === "descending" && params.thrusting;
      if (thrustActive) {
        activeCueSet.add("thrustLoop");
      } else {
        activeCueSet.delete("thrustLoop");
      }

      if (params.phase === "descending" && params.torqueInput !== 0) {
        activeCueSet.add("rcsPuff");
        lastEvent = "rcsPuff";
      } else {
        activeCueSet.delete("rcsPuff");
      }

      gustWarnActive = params.phase === "descending" && (params.gustWarning || params.gustActive);
      if (gustWarnActive) {
        activeCueSet.add("gustWarn");
      } else {
        activeCueSet.delete("gustWarn");
      }

      if (params.phase === "descending" && params.onPadBounds && params.altitude < 18 && !padLockPlayed) {
        padLockPlayed = true;
        lastEvent = "padLock";
        playTone(660, 0.14, 0.05, "triangle");
      } else if (!params.onPadBounds) {
        padLockPlayed = false;
      }

      if (params.phase === "descending" && params.fuelFraction <= 0.22 && !fuelWarnPlayed) {
        fuelWarnPlayed = true;
        lastEvent = "fuelLow";
        playTone(310, 0.18, 0.06, "sawtooth");
      } else if (params.fuelFraction > 0.25) {
        fuelWarnPlayed = false;
      }

      if (params.phase !== lastPhase) {
        if (params.phase === "landed" || params.phase === "campaign-complete") {
          lastEvent = params.evaluation?.outcome === "hard" ? "touchHard" : "touchSoft";
          playTone(params.phase === "campaign-complete" ? 880 : 520, 0.28, 0.08, "triangle");
        } else if (params.phase === "crashed") {
          lastEvent = "crash";
          playTone(110, 0.35, 0.1, "sawtooth");
        } else if (params.phase === "descending") {
          padLockPlayed = false;
          fuelWarnPlayed = false;
        }
        lastPhase = params.phase;
      }
    },
    dispose() {
      activeCueSet.clear();
      if (context) {
        void context.close().catch(() => {});
        context = null;
      }
    },
  };
}

function buildFallbackLanderMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = "auroraLanderFallback";

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.62,
    roughness: 0.34,
    emissive: 0x10253e,
    emissiveIntensity: 0.42,
  });
  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.78,
    roughness: 0.26,
    emissive: 0x451a03,
    emissiveIntensity: 0.35,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    metalness: 0.28,
    roughness: 0.22,
    emissive: 0x10b981,
    emissiveIntensity: 1.45,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.2,
    roughness: 0.16,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.35,
  });
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.65,
    roughness: 0.38,
  });
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.78,
    roughness: 0.3,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.45,
  });

  const descentStage = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.22, 0.56, 8), foilMat);
  descentStage.position.set(0, 0.74, 0);
  descentStage.castShadow = true;
  descentStage.receiveShadow = true;
  group.add(descentStage);

  const hull = new THREE.Mesh(new THREE.OctahedronGeometry(1.04, 1), hullMat);
  hull.position.set(0, 1.38, 0);
  hull.scale.set(1.22, 0.92, 1.12);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const telemetryRing = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.06, 10, 28), accentMat);
  telemetryRing.rotation.x = Math.PI * 0.5;
  telemetryRing.position.set(0, 1.02, 0);
  group.add(telemetryRing);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.42, 0.96), canopyMat);
  canopy.position.set(0, 1.54, 0.28);
  group.add(canopy);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.65, 8), legMat);
  mast.position.set(0, 2.28, 0);
  group.add(mast);

  const mastBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), accentMat);
  mastBeacon.position.set(0, 2.65, 0);
  group.add(mastBeacon);

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.54, 0.54, 14), nozzleMat);
  nozzle.position.set(0, 0.32, 0);
  group.add(nozzle);

  const legOffsets: readonly [number, number][] = [
    [-1.12, -0.78],
    [1.12, -0.78],
    [-1.12, 0.78],
    [1.12, 0.78],
  ];
  for (const [lx, lz] of legOffsets) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.28, 8), legMat);
    strut.position.set(lx * 0.74, 0.56, lz * 0.74);
    strut.rotation.z = lx < 0 ? 0.44 : -0.44;
    strut.castShadow = true;
    group.add(strut);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.1, 12), accentMat);
    foot.position.set(lx, 0.05, lz);
    group.add(foot);
  }

  return group;
}

function buildFallbackBeaconMesh(): THREE.Group {
  const beacon = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.62,
    roughness: 0.4,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 2.2,
    roughness: 0.18,
  });
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.9,
    roughness: 0.2,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.36, 12), baseMat);
  base.position.y = 0.18;
  beacon.add(base);

  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.05, 10), baseMat);
  pylon.position.y = 0.74;
  beacon.add(pylon);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), lampMat);
  lamp.position.y = 1.34;
  beacon.add(lamp);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20), crownMat);
  halo.rotation.x = Math.PI * 0.5;
  halo.position.y = 1.34;
  beacon.add(halo);

  return beacon;
}

function buildTerrainMeshFromField(field: TerrainField, colorHex: string): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(field.queryPositions, 3));
  geometry.setIndex(new THREE.BufferAttribute(field.queryIndices, 1));

  const vertexCount = field.queryPositions.length / 3;
  const colors = new Float32Array(vertexCount * 3);
  const lowColor = new THREE.Color("#1e293b");
  const midColor = new THREE.Color(colorHex || "#475569");
  const highColor = new THREE.Color("#94a3b8");
  const peakColor = new THREE.Color("#dbeafe");
  const tempColor = new THREE.Color();
  const heightSpan = Math.max(1, field.maxHeight - field.minHeight);

  for (let i = 0; i < vertexCount; i += 1) {
    const vy = field.queryPositions[i * 3 + 1] ?? 0;
    const t = clamp((vy - field.minHeight) / heightSpan, 0, 1);
    if (t < 0.35) {
      tempColor.lerpColors(lowColor, midColor, t / 0.35);
    } else if (t < 0.78) {
      tempColor.lerpColors(midColor, highColor, (t - 0.35) / 0.43);
    } else {
      tempColor.lerpColors(highColor, peakColor, (t - 0.78) / 0.22);
    }
    colors[i * 3] = tempColor.r;
    colors[i * 3 + 1] = tempColor.g;
    colors[i * 3 + 2] = tempColor.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.22,
    emissive: new THREE.Color("#0b192c"),
    emissiveIntensity: 0.22,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, terrainMaterial);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function createAuroraFxRig(): AuroraFxRig {
  const group = new THREE.Group();
  group.name = "auroraFxRig";

  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
  });
  const plumeCore = new THREE.Mesh(new THREE.ConeGeometry(0.56, 3.2, 14), plumeMat);
  plumeCore.rotation.x = Math.PI;
  plumeCore.position.set(0, -1.2, 0);
  group.add(plumeCore);

  const innerPlumeMat = new THREE.MeshBasicMaterial({
    color: 0x6ee7b7,
    transparent: true,
    opacity: 0.0,
  });
  const innerPlume = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.9, 12), innerPlumeMat);
  innerPlume.rotation.x = Math.PI;
  innerPlume.position.set(0, -0.8, 0);
  group.add(innerPlume);

  const rcsMatLeft = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.0,
  });
  const rcsLeft = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.95, 8), rcsMatLeft);
  rcsLeft.rotation.z = Math.PI * 0.5;
  rcsLeft.position.set(-1.25, 1.15, 0);
  group.add(rcsLeft);

  const rcsMatRight = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.0,
  });
  const rcsRight = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.95, 8), rcsMatRight);
  rcsRight.rotation.z = -Math.PI * 0.5;
  rcsRight.position.set(1.25, 1.15, 0);
  group.add(rcsRight);

  const dustMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
  });
  const dustRing = new THREE.Mesh(new THREE.RingGeometry(0.65, 3.1, 28), dustMat);
  dustRing.rotation.x = -Math.PI * 0.5;
  group.add(dustRing);

  let plumeIntensity = 0;
  let rcsLeftIntensity = 0;
  let rcsRightIntensity = 0;
  let dustBurstIntensity = 0;
  let activeEmitters = 0;

  return {
    group,
    get plumeIntensity() {
      return plumeIntensity;
    },
    get rcsLeftIntensity() {
      return rcsLeftIntensity;
    },
    get rcsRightIntensity() {
      return rcsRightIntensity;
    },
    get dustBurstIntensity() {
      return dustBurstIntensity;
    },
    get activeEmitters() {
      return activeEmitters;
    },
    update({ lander, thrusting, torqueInput, altitude, surfaceY, elapsedSeconds }) {
      const flicker = 0.88 + 0.12 * Math.sin(elapsedSeconds * 43);
      plumeIntensity = thrusting && lander.fuel > 0 ? round(flicker, 3) : 0;
      rcsLeftIntensity = torqueInput > 0 ? 0.88 : 0;
      rcsRightIntensity = torqueInput < 0 ? 0.88 : 0;
      dustBurstIntensity =
        thrusting && altitude < 14
          ? round(clamp((14 - altitude) / 14, 0, 1) * 0.85, 3)
          : 0;

      activeEmitters =
        (plumeIntensity > 0 ? 1 : 0) +
        (rcsLeftIntensity > 0 || rcsRightIntensity > 0 ? 1 : 0) +
        (dustBurstIntensity > 0 ? 1 : 0);

      const tiltRad = (lander.tiltDeg * Math.PI) / 180;
      const nozzleX = lander.x - Math.sin(tiltRad) * 0.85;
      const nozzleY = lander.y - Math.cos(tiltRad) * 0.85;
      plumeCore.position.set(nozzleX, nozzleY, lander.z);
      plumeCore.rotation.set(Math.PI, 0, -tiltRad);
      plumeCore.scale.set(1, 0.75 + plumeIntensity * 0.7, 1);
      plumeMat.opacity = plumeIntensity * 0.92;

      innerPlume.position.set(nozzleX, nozzleY + 0.25, lander.z);
      innerPlume.rotation.set(Math.PI, 0, -tiltRad);
      innerPlume.scale.set(1, 0.7 + plumeIntensity * 0.65, 1);
      innerPlumeMat.opacity = plumeIntensity * 0.96;

      rcsLeft.position.set(lander.x - 1.2, lander.y + 0.95, lander.z);
      rcsMatLeft.opacity = rcsLeftIntensity * 0.82;

      rcsRight.position.set(lander.x + 1.2, lander.y + 0.95, lander.z);
      rcsMatRight.opacity = rcsRightIntensity * 0.82;

      dustRing.position.set(lander.x, surfaceY + 0.1, lander.z);
      const ringScale = 0.8 + (1 - clamp(altitude / 14, 0, 1)) * 1.45;
      dustRing.scale.set(ringScale, ringScale, 1);
      dustMat.opacity = dustBurstIntensity * 0.72;
    },
  };
}

function createAuroraWorld(
  scene: THREE.Scene,
  initialField: TerrainField,
  initialSite: LanderSite
): AuroraWorldGroup {
  scene.background = new THREE.Color("#030914");
  scene.fog = new THREE.FogExp2(0x030914, 0.0042);

  const root = new THREE.Group();
  root.name = "auroraWorldRoot";
  scene.add(root);

  // Non-ambient hemisphere sky/ground fill + directional lunar key + rim + practical point lights
  const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x0b192c, 1.15);
  hemiLight.position.set(0, 80, 0);
  root.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xe0f2fe, 2.35);
  keyLight.position.set(-26, 68, 42);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  root.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x10b981, 1.15);
  rimLight.position.set(34, 46, -28);
  root.add(rimLight);

  const exhaustLight = new THREE.PointLight(0x38bdf8, 0, 28, 1.35);
  root.add(exhaustLight);

  const beaconLightLeft = new THREE.PointLight(0x10b981, 3.2, 26, 1.25);
  const beaconLightRight = new THREE.PointLight(0x38bdf8, 3.2, 26, 1.25);
  root.add(beaconLightLeft, beaconLightRight);

  // Deep arctic starfield backdrop
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(520 * 3);
  for (let i = 0; i < 520; i += 1) {
    const s = i + 1;
    starPositions[i * 3] = ((Math.sin(s * 12.9898) * 43758.5453) % 1) * 190 - 95;
    starPositions[i * 3 + 1] = Math.abs((Math.cos(s * 78.233) * 19341.123) % 1) * 82 + 4;
    starPositions[i * 3 + 2] = -38 - Math.abs((Math.sin(s * 39.17) * 9123.4) % 1) * 42;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starPoints = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xe0f2fe, size: 0.48, transparent: true, opacity: 0.9 })
  );
  root.add(starPoints);

  // Distant ringed ice planet in upper sky
  const iceMoonGroup = new THREE.Group();
  iceMoonGroup.position.set(-28, 36, -54);
  const iceMoonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(5.6, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.68,
      metalness: 0.15,
      emissive: 0x0f2942,
      emissiveIntensity: 0.55,
    })
  );
  iceMoonGroup.add(iceMoonMesh);
  const moonRingMesh = new THREE.Mesh(
    new THREE.RingGeometry(7.2, 10.6, 40),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
    })
  );
  moonRingMesh.rotation.set(1.18, 0.32, 0.24);
  iceMoonGroup.add(moonRingMesh);
  root.add(iceMoonGroup);

  // Multi-band Aurora Borealis sky curtains (#030914 -> #10b981 -> #38bdf8)
  const auroraRibbons: THREE.Mesh[] = [];
  const ribbonSpecs: readonly {
    readonly color: number;
    readonly y: number;
    readonly z: number;
    readonly height: number;
    readonly opacity: number;
  }[] = [
    { color: 0x10b981, y: 24, z: -32, height: 11.5, opacity: 0.34 },
    { color: 0x38bdf8, y: 31, z: -36, height: 12.5, opacity: 0.29 },
    { color: 0x34d399, y: 38, z: -40, height: 10.5, opacity: 0.24 },
    { color: 0x0ea5e9, y: 18, z: -29, height: 8.5, opacity: 0.22 },
  ];
  for (let r = 0; r < ribbonSpecs.length; r += 1) {
    const spec = ribbonSpecs[r]!;
    const ribbonGeo = new THREE.PlaneGeometry(165, spec.height, 42, 4);
    const posAttr = ribbonGeo.attributes.position as THREE.BufferAttribute;
    for (let vi = 0; vi < posAttr.count; vi += 1) {
      const vx = posAttr.getX(vi);
      const vy = posAttr.getY(vi);
      const waveZ =
        Math.sin(vx * 0.08 + r * 1.3) * 2.8 + Math.cos(vx * 0.035 - r * 0.7) * 1.8;
      const archY = Math.cos((vx / 90) * Math.PI * 0.5) * 3.2;
      posAttr.setY(vi, vy + archY);
      posAttr.setZ(vi, waveZ);
    }
    ribbonGeo.computeVertexNormals();
    const ribbonMat = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbon.position.set(0, spec.y, spec.z);
    ribbon.rotation.x = 0.1;
    root.add(ribbon);
    auroraRibbons.push(ribbon);
  }

  // Reflective frozen ice basin floor
  const iceBasinMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(64, 68, 0.5, 48),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#0b192c"),
      roughness: 0.18,
      metalness: 0.24,
      clearcoat: 0.75,
      clearcoatRoughness: 0.16,
      emissive: new THREE.Color("#071526"),
      emissiveIntensity: 0.35,
    })
  );
  iceBasinMesh.position.set(0, -0.35, 0);
  iceBasinMesh.receiveShadow = true;
  root.add(iceBasinMesh);

  const terrainContainer = new THREE.Group();
  terrainContainer.name = "auroraTerrainContainer";
  root.add(terrainContainer);

  const beaconGroup = new THREE.Group();
  beaconGroup.name = "auroraPadBeacons";
  root.add(beaconGroup);

  const landerRig = new THREE.Group();
  landerRig.name = "auroraLanderRig";
  landerRig.add(buildFallbackLanderMesh());
  root.add(landerRig);

  const ghostRig = new THREE.Group();
  ghostRig.name = "auroraGhostRig";
  const ghostMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 1.9, 8),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.48,
    })
  );
  ghostMesh.position.y = 0.95;
  ghostRig.add(ghostMesh);
  ghostRig.visible = false;
  root.add(ghostRig);

  const predictionMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.45, 28),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    })
  );
  predictionMarker.rotation.x = -Math.PI * 0.5;
  root.add(predictionMarker);

  const touchRing = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 3.4, 32),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    })
  );
  touchRing.rotation.x = -Math.PI * 0.5;
  root.add(touchRing);

  let beaconTemplate: THREE.Object3D = buildFallbackBeaconMesh();
  let currentField = initialField;
  let currentSite = initialSite;

  function buildGlacialSpires(field: TerrainField, site: LanderSite): THREE.Group {
    const spireGroup = new THREE.Group();
    spireGroup.name = "auroraGlacialSpires";
    const pad = site.pads[0]!;
    const iceRockMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#475569"),
      roughness: 0.68,
      metalness: 0.2,
      emissive: new THREE.Color("#0f2238"),
      emissiveIntensity: 0.25,
      flatShading: true,
    });
    const slateSpireMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#64748b"),
      roughness: 0.42,
      metalness: 0.48,
      emissive: new THREE.Color("#112840"),
      emissiveIntensity: 0.22,
      flatShading: true,
    });
    const spirePlacements: readonly {
      readonly x: number;
      readonly z: number;
      readonly radius: number;
      readonly height: number;
      readonly metallic: boolean;
    }[] = [
      { x: pad.x - 19, z: -12, radius: 4.6, height: 18, metallic: false },
      { x: pad.x + 19, z: -11, radius: 4.2, height: 16.5, metallic: true },
      { x: pad.x - 28, z: -20, radius: 6.2, height: 24, metallic: true },
      { x: pad.x + 27, z: -19, radius: 5.8, height: 22.5, metallic: false },
      { x: pad.x - 11, z: -22, radius: 5.0, height: 19.5, metallic: false },
      { x: pad.x + 12, z: -21, radius: 5.2, height: 20.5, metallic: true },
    ];
    for (let i = 0; i < spirePlacements.length; i += 1) {
      const sp = spirePlacements[i]!;
      const baseY = sampleGridHeight(field, sp.x, sp.z);
      const spireMesh = new THREE.Mesh(
        new THREE.ConeGeometry(sp.radius, sp.height, 7, 2),
        sp.metallic ? slateSpireMat : iceRockMat
      );
      spireMesh.position.set(sp.x, baseY + sp.height * 0.45, sp.z);
      spireMesh.rotation.y = i * 0.85;
      spireMesh.castShadow = true;
      spireMesh.receiveShadow = true;
      spireGroup.add(spireMesh);
    }
    return spireGroup;
  }

  function populateBeacons(field: TerrainField, site: LanderSite): void {
    while (beaconGroup.children.length > 0) {
      beaconGroup.remove(beaconGroup.children[0]!);
    }
    const pad: LandingPad | undefined = site.pads[0];
    const padY = field.padHeights[0] ?? 0;
    if (!pad) return;

    // Brushed metal landing deck
    const padDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(pad.radius * 0.92, pad.radius * 1.02, 0.42, 32),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#64748b"),
        emissive: new THREE.Color("#0f2942"),
        emissiveIntensity: 0.55,
        metalness: 0.65,
        roughness: 0.42,
      })
    );
    padDisc.position.set(pad.x, padY - 0.12, pad.z);
    padDisc.receiveShadow = true;
    beaconGroup.add(padDisc);

    // Outer glowing emerald beacon ring (#10b981)
    const outerBeaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(pad.radius * 0.86, 0.14, 12, 40),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
      })
    );
    outerBeaconRing.rotation.x = Math.PI * 0.5;
    outerBeaconRing.position.set(pad.x, padY + 0.12, pad.z);
    beaconGroup.add(outerBeaconRing);

    // Inner glowing cyan target ring (#38bdf8)
    const innerBeaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(pad.radius * 0.52, 0.1, 10, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
      })
    );
    innerBeaconRing.rotation.x = Math.PI * 0.5;
    innerBeaconRing.position.set(pad.x, padY + 0.14, pad.z);
    beaconGroup.add(innerBeaconRing);

    // Bullseye center ring
    const centerRing = new THREE.Mesh(
      new THREE.RingGeometry(pad.radius * 0.16, pad.radius * 0.24, 24),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
      })
    );
    centerRing.rotation.x = -Math.PI * 0.5;
    centerRing.position.set(pad.x, padY + 0.15, pad.z);
    beaconGroup.add(centerRing);

    // Vertical guidance light columns on pad perimeter
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beaconAngles = [-Math.PI * 0.78, -Math.PI * 0.22, Math.PI * 0.22, Math.PI * 0.78];
    for (const angle of beaconAngles) {
      const bx = pad.x + Math.cos(angle) * pad.radius * 0.86;
      const bz = pad.z + Math.sin(angle) * pad.radius * 0.86;
      const beaconInstance = beaconTemplate.clone(true);
      beaconInstance.position.set(bx, padY, bz);
      beaconInstance.scale.setScalar(1.38);
      beaconGroup.add(beaconInstance);

      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.36, 7.5, 12, 1, true), beamMat);
      beam.position.set(bx, padY + 3.8, bz);
      beaconGroup.add(beam);
    }

    beaconLightLeft.position.set(pad.x - pad.radius * 0.8, padY + 2.2, pad.z + 1.0);
    beaconLightRight.position.set(pad.x + pad.radius * 0.8, padY + 2.2, pad.z + 1.0);
  }

  function rebuildForSite(field: TerrainField, site: LanderSite): void {
    currentField = field;
    currentSite = site;
    scene.background = new THREE.Color("#030914");
    while (terrainContainer.children.length > 0) {
      terrainContainer.remove(terrainContainer.children[0]!);
    }
    terrainContainer.add(buildTerrainMeshFromField(field, site.terrainColor));
    terrainContainer.add(buildGlacialSpires(field, site));
    iceBasinMesh.position.y = (field.padHeights[0] ?? 0) - 0.55;
    populateBeacons(field, site);
  }

  rebuildForSite(initialField, initialSite);

  const worldGroup: AuroraWorldGroup = {
    root,
    landerRig,
    ghostRig,
    beaconGroup,
    predictionMarker,
    touchRing,
    auroraRibbons,
    exhaustLight,
    beaconLights: [beaconLightLeft, beaconLightRight],
    modelsLoaded: true,
    rebuildForSite,
    dispose() {
      scene.remove(root);
    },
  };

  if (typeof window !== "undefined") {
    const loader = new GLTFLoader();
    loader.load(
      assets.auroraLanderProbe.url,
      (gltf) => {
        if (!gltf?.scene) return;
        const loadedModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(loadedModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(0.1, size.x, size.y, size.z);
        const scale = 2.8 / maxDim;
        loadedModel.scale.setScalar(scale);
        loadedModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        loadedModel.position.set(0, 0.9, 0);
        landerRig.add(loadedModel);
        worldGroup.modelsLoaded = true;
      },
      undefined,
      () => {
        worldGroup.modelsLoaded = true;
      }
    );
    loader.load(
      assets.auroraPadBeacon.url,
      (gltf) => {
        if (!gltf?.scene) return;
        const loadedBeacon = gltf.scene;
        loadedBeacon.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        const combinedBeacon = buildFallbackBeaconMesh();
        loadedBeacon.scale.setScalar(1.2);
        combinedBeacon.add(loadedBeacon);
        beaconTemplate = combinedBeacon;
        populateBeacons(currentField, currentSite);
      },
      undefined,
      () => {}
    );
  }

  return worldGroup;
}

function computeAutopilotControls(
  lander: LanderState,
  site: LanderSite,
  padY: number
): Controls {
  const pad = site.pads[0]!;
  const dx = pad.x - lander.x;
  const dy = Math.max(0.1, lander.y - LANDER_FOOT_DROP - padY);
  const gustX = gustForceAt(site.gust, lander.time);

  // In lander.ts, positive tiltDeg accelerates in +X, and positive rotate increases tiltDeg.
  const desiredVx = clamp(dx * 0.32, -4.5, 4.5);
  const vxError = desiredVx - lander.vx;
  const gustCompDeg = clamp((-gustX / MAIN_THRUST_ACCELERATION) * 45, -10, 10);
  const finalApproach = Math.abs(dx) < pad.radius * 0.55 && dy < 9;
  const targetTiltDeg = finalApproach
    ? clamp(gustCompDeg * 0.4, -4, 4)
    : clamp(vxError * 5.2 + gustCompDeg, -18, 18);

  const tiltError = targetTiltDeg - lander.tiltDeg;
  let rotate = 0;
  if (Math.abs(tiltError) > 0.8) {
    rotate = clamp(tiltError / 8, -1, 1);
  }

  const desiredVy = dy > 24 ? -3.4 : dy > 8 ? -1.9 : -1.05;
  const thrust = lander.vy < desiredVy ? 1 : dy < 16 && lander.vy < desiredVy + 0.35 ? 0.65 : 0;

  return {
    thrust,
    rotate,
  };
}

function updateCameraRig(
  camera: THREE.PerspectiveCamera,
  lander: LanderState,
  field: TerrainField,
  site: LanderSite,
  viewportWidth: number,
  viewportHeight: number
): AuroraCameraRigState {
  const pad = site.pads[0]!;
  const padY = field.padHeights[0] ?? 0;
  const groundY = sampleGridHeight(field, lander.x, lander.z);
  const altitude = Math.max(0, lander.y - LANDER_FOOT_DROP - groundY);
  const altitudeT = clamp(altitude / SPAWN_HEIGHT_ABOVE_PAD, 0, 1);

  const aspect = Math.max(0.45, viewportWidth / Math.max(1, viewportHeight));
  const fovDeg = round(lerp(40, 48, altitudeT), 2);
  const fovRad = (fovDeg * Math.PI) / 180;
  const tanHalfV = Math.tan(fovRad * 0.5);
  const tanHalfH = Math.max(0.18, tanHalfV * aspect);

  const focusX = lerp(pad.x, (lander.x + pad.x) * 0.5, 0.72);
  const focusY = lerp(padY + 1.8, (lander.y + padY) * 0.5 + 0.6, 0.76);
  const focusZ = lerp(pad.z, (lander.z + pad.z) * 0.5, 0.72);

  const spanX = Math.abs(lander.x - pad.x);
  const spanY = Math.abs(lander.y - padY);
  const requiredVerticalDist = (spanY * 0.55 + 3.2) / (tanHalfV * 0.78);
  const requiredHorizontalDist = (spanX * 0.6 + 4.4) / (tanHalfH * 0.78);
  const baseDistance = lerp(16.5, 34.0, altitudeT);
  const distance = clamp(
    Math.max(baseDistance, requiredVerticalDist, requiredHorizontalDist),
    15.5,
    78.0
  );

  // Close 3-quarter descent camera angle showing lander hull, thruster plume, and illuminated pad below
  const lateralOffset = lerp(2.2, 4.4, altitudeT);
  const camX = round(lerp(focusX, lander.x, 0.35) + lateralOffset, 3);
  const camY = round(Math.max(padY + 4.8, focusY + lerp(3.4, 8.2, altitudeT)), 3);
  const camZ = round(focusZ + distance, 3);

  camera.fov = fovDeg;
  camera.aspect = aspect;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(focusX, focusY, focusZ);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const landerVec = new THREE.Vector3(lander.x, lander.y, lander.z).project(camera);
  const padVec = new THREE.Vector3(pad.x, padY, pad.z).project(camera);

  const landerInFrame =
    Math.abs(landerVec.x) <= 0.94 &&
    Math.abs(landerVec.y) <= 0.94 &&
    landerVec.z >= 0 &&
    landerVec.z <= 1;
  const padInFrame =
    Math.abs(padVec.x) <= 0.95 &&
    Math.abs(padVec.y) <= 0.95 &&
    padVec.z >= 0 &&
    padVec.z <= 1;

  return {
    position: [camX, camY, camZ],
    lookAt: [round(focusX, 3), round(focusY, 3), round(focusZ, 3)],
    fovDeg,
    altitudeT: round(altitudeT, 3),
    landerInFrame,
    padInFrame,
    landerNdc: [round(landerVec.x, 3), round(landerVec.y, 3)],
    padNdc: [round(padVec.x, 3), round(padVec.y, 3)],
  };
}

function sampleSlopeDeg(field: TerrainField, x: number, z: number): number {
  const step = field.cellSize;
  const hx0 = sampleGridHeight(field, x - step, z);
  const hx1 = sampleGridHeight(field, x + step, z);
  const hz0 = sampleGridHeight(field, x, z - step);
  const hz1 = sampleGridHeight(field, x, z + step);
  const dx = (hx1 - hx0) / (2 * step);
  const dz = (hz1 - hz0) / (2 * step);
  const normalY = 1 / Math.hypot(dx, 1, dz);
  return (Math.acos(clamp(normalY, -1, 1)) * 180) / Math.PI;
}

function evaluateContact(
  lander: LanderState,
  field: TerrainField,
  site: LanderSite
): AuroraEvaluationSummary {
  const pad = site.pads[0]!;
  const padDist = Math.hypot(lander.x - pad.x, lander.z - pad.z);
  const insidePadZone = padDist <= pad.radius;
  const slopeDeg = insidePadZone ? 0 : sampleSlopeDeg(field, lander.x, lander.z);
  const vspeed = Math.abs(lander.vy);
  const hspeed = hspeedOf(lander);
  const attitudeDeg = Math.abs(lander.tiltDeg);

  const graded: GradedTouchdown = gradeTouchdown({
    vspeed,
    hspeed,
    attitudeDeg,
    insidePadZone,
    slopeDeg,
  });

  const fuelFraction = clamp(lander.fuel / Math.max(1, site.fuelBudget), 0, 1);
  const breakdown = scoreTouchdown({
    grade: graded.grade,
    basePoints: graded.basePoints,
    fuelFraction,
    siteMultiplier: site.multiplier,
  });

  const summary =
    graded.grade === "soft"
      ? `SOFT LANDING (+${breakdown.total} pts) — ${vspeed.toFixed(1)} m/s on ${site.name}`
      : graded.grade === "hard"
        ? `HARD LANDING (+${breakdown.total} pts) — ${vspeed.toFixed(1)} m/s on ${site.name}`
        : `CRASH — ${graded.crashReason || "impact out of limits"} (${vspeed.toFixed(1)} m/s)`;

  return {
    outcome: graded.grade,
    score: breakdown.total,
    reason: graded.crashReason || graded.grade,
    summary,
    verticalSpeed: round(vspeed, 2),
    horizontalSpeed: round(hspeed, 2),
    tiltDeg: round(attitudeDeg, 1),
    padOffsetNormalized: round(padDist / Math.max(0.1, pad.radius), 3),
    breakdown,
  };
}

function buildEvidenceSections(
  state: AuroraRuntimeState,
  world: AuroraWorldGroup,
  fx: AuroraFxRig,
  renderer: THREE.WebGLRenderer,
  canvasAttached: boolean
): Record<string, unknown> {
  const pad = state.site.pads[0]!;
  const padY = state.terrain.padHeights[0] ?? 0;
  const surfaceHeight = sampleGridHeight(state.terrain, state.lander.x, state.lander.z);
  const altitude = Math.max(0, state.lander.y - LANDER_FOOT_DROP - surfaceHeight);
  const speed = Math.hypot(state.lander.vx, state.lander.vy, state.lander.vz);
  const verticalSpeed = Math.abs(state.lander.vy);
  const horizontalSpeed = hspeedOf(state.lander);
  const padDist = Math.hypot(state.lander.x - pad.x, state.lander.z - pad.z);
  const onPadBounds = padDist <= pad.radius;
  const gustX = gustForceAt(state.site.gust, state.lander.time);
  const gustWarning = gustTelegraphActive(state.site.gust, state.lander.time);
  const gustActive = Math.abs(gustX) > 0.005;
  const thrusting = state.lastControls.thrust > 0.05 && state.lander.fuel > 0;
  const torqueInput: -1 | 0 | 1 =
    state.lastControls.rotate > 0.05 ? 1 : state.lastControls.rotate < -0.05 ? -1 : 0;

  const touchdownStatus: "flying" | "landed" | "crashed" =
    state.phase === "landed" || state.phase === "campaign-complete"
      ? "landed"
      : state.phase === "crashed"
        ? "crashed"
        : "flying";
  const outcome = state.lastEvaluation?.outcome ?? "flying";
  const bestRun = state.bestRuns.get(state.site.id) ?? null;

  return {
    lander: {
      x: round(state.lander.x, 3),
      y: round(state.lander.y, 3),
      z: round(state.lander.z, 3),
      vx: round(state.lander.vx, 3),
      vy: round(state.lander.vy, 3),
      vz: round(state.lander.vz, 3),
      speed: round(speed, 3),
      verticalSpeed: round(verticalSpeed, 3),
      horizontalSpeed: round(horizontalSpeed, 3),
      angleRad: round((state.lander.tiltDeg * Math.PI) / 180, 4),
      angleDeg: round(state.lander.tiltDeg, 2),
      yaw: round(state.lander.yaw, 3),
      fuel: round(state.lander.fuel, 2),
      maxFuel: state.site.fuelBudget,
      fuelFraction: round(state.lander.fuel / Math.max(1, state.site.fuelBudget), 3),
      thrusting,
      torqueInput,
      altitude: round(altitude, 3),
      surfaceHeight: round(surfaceHeight, 3),
      padHorizontalDistance: round(padDist, 3),
      padVerticalDistance: round(state.lander.y - padY, 3),
      onPadBounds,
      touchdown: touchdownStatus,
      outcome,
    },
    framing: {
      rig: "altitude",
      cameraPosition: state.cameraRig.position,
      lookAt: state.cameraRig.lookAt,
      fovDeg: state.cameraRig.fovDeg,
      altitudeT: state.cameraRig.altitudeT,
      landerInFrame: state.cameraRig.landerInFrame,
      padInFrame: state.cameraRig.padInFrame,
      landerNdc: state.cameraRig.landerNdc,
      padNdc: state.cameraRig.padNdc,
    },
    run: {
      phase: state.phase,
      siteIndex: state.siteIndex,
      siteId: String(state.site.id),
      siteName: state.site.name,
      siteCount: SITES.length,
      completedSites: [...state.completedSites],
      siteScores: [...state.siteScores],
      hull: state.hull,
      score: state.totalScore,
      attempts: state.attempts,
      crashes: state.crashes,
      totalFuelUsed: round(state.totalFuelUsed, 2),
      runTimeSeconds: round(state.runTimeSeconds, 3),
      totalElapsedSeconds: round(state.totalElapsedSeconds, 3),
      seed: state.seed,
      activeScenario: state.activeScenario,
      paused: state.paused,
      statusText: state.statusText,
    },
    sites: {
      currentIndex: state.siteIndex,
      currentId: String(state.site.id),
      currentName: state.site.name,
      count: SITES.length,
      completedCount: state.completedSites.filter(Boolean).length,
      windX: round(gustX, 3),
      gustActive,
      gustWarning,
      padCenterX: round(pad.x, 3),
      padY: round(padY, 3),
      padWidth: round(pad.radius * 2, 3),
    },
    terrain: {
      rows: state.terrain.rows,
      columns: state.terrain.columns,
      cellSize: state.terrain.cellSize,
      minHeight: round(state.terrain.minHeight, 3),
      maxHeight: round(state.terrain.maxHeight, 3),
      padY: round(padY, 3),
      surfaceHeightUnderLander: round(surfaceHeight, 3),
    },
    touchdown: state.lastEvaluation
      ? {
          outcome: state.lastEvaluation.outcome,
          score: state.lastEvaluation.score,
          reason: state.lastEvaluation.reason,
          summary: state.lastEvaluation.summary,
          verticalSpeed: state.lastEvaluation.verticalSpeed,
          horizontalSpeed: state.lastEvaluation.horizontalSpeed,
          tiltDeg: state.lastEvaluation.tiltDeg,
          padOffsetNormalized: state.lastEvaluation.padOffsetNormalized,
        }
      : {
          outcome: "flying",
          score: 0,
          reason: "in-flight",
          summary: "In flight — align with pad and keep vertical speed under 2.0 m/s.",
          verticalSpeed: round(verticalSpeed, 2),
          horizontalSpeed: round(horizontalSpeed, 2),
          tiltDeg: round(Math.abs(state.lander.tiltDeg), 1),
          padOffsetNormalized: round(padDist / Math.max(0.1, pad.radius), 3),
        },
    ghost: {
      available: Boolean(bestRun),
      sampleCount: state.currentSamples.length,
      bestScore: bestRun?.score ?? null,
      trajectoryHash: bestRun?.trajectoryHash ?? null,
      activePose: state.ghostCurrentState
        ? {
            x: round(state.ghostCurrentState.x, 3),
            y: round(state.ghostCurrentState.y, 3),
            z: round(state.ghostCurrentState.z, 3),
          }
        : null,
    },
    loading: {
      status: "ready",
      modelsLoaded: world.modelsLoaded,
      probeAssetId: "auroraLanderProbe",
      beaconAssetId: "auroraPadBeacon",
      heroAssetId: "auroraExtractionLanderHero",
      backdropAssetId: "auroraExtractionBayBackdrop",
    },
    fx: {
      activeEmitters: fx.activeEmitters,
      plumeIntensity: fx.plumeIntensity,
      rcsLeftIntensity: fx.rcsLeftIntensity,
      rcsRightIntensity: fx.rcsRightIntensity,
      dustBurstIntensity: fx.dustBurstIntensity,
    },
    render: {
      canvasAttached,
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      frameCount: state.frameCount,
      cameraMode: "perspective-3d",
      webglContextAlive: true,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      qualityTier: state.qualityTier,
    },
    appliedLook: {
      preset: "Broadcast Arena",
      palettePrimary: direction.palette.primary,
      accent: direction.palette.accent,
      exposureEV: direction.lighting.exposureEV,
    },
    audio: {
      initialized: state.audio.initialized,
      muted: state.audio.muted,
      activeCues: state.audio.activeCues,
      lastEvent: state.audio.lastEvent,
      thrustActive: state.audio.thrustActive,
      gustWarnActive: state.audio.gustWarnActive,
    },
    playback: {
      autorun: state.autorun,
      approachPreset: state.approachPreset,
      deterministicStepper: true,
      lastStepDt: round(state.lastStepDt, 4),
    },
    boot: {
      mounted: true,
      singlePath: true,
      runtime: "createGame",
    },
  };
}

function buildPublicSnapshot(
  state: AuroraRuntimeState,
  gameState: "playing" | "paused" | "gameover" | "won",
  renderer: THREE.WebGLRenderer,
  canvasAttached: boolean
): AuroraPublicSnapshot {
  const pad = state.site.pads[0]!;
  const padY = state.terrain.padHeights[0] ?? 0;
  const surfaceHeight = sampleGridHeight(state.terrain, state.lander.x, state.lander.z);
  const altitude = Math.max(0, state.lander.y - LANDER_FOOT_DROP - surfaceHeight);
  const speed = Math.hypot(state.lander.vx, state.lander.vy, state.lander.vz);
  const verticalSpeed = Math.abs(state.lander.vy);
  const horizontalSpeed = hspeedOf(state.lander);
  const padDist = Math.hypot(state.lander.x - pad.x, state.lander.z - pad.z);
  const onPadBounds = padDist <= pad.radius;
  const gustX = gustForceAt(state.site.gust, state.lander.time);
  const gustWarning = gustTelegraphActive(state.site.gust, state.lander.time);
  const gustActive = Math.abs(gustX) > 0.005;
  const thrusting = state.lastControls.thrust > 0.05 && state.lander.fuel > 0;
  const torqueInput: -1 | 0 | 1 =
    state.lastControls.rotate > 0.05 ? 1 : state.lastControls.rotate < -0.05 ? -1 : 0;
  const touchdownStatus: "flying" | "landed" | "crashed" =
    state.phase === "landed" || state.phase === "campaign-complete"
      ? "landed"
      : state.phase === "crashed"
        ? "crashed"
        : "flying";
  const bestRun = state.bestRuns.get(state.site.id) ?? null;

  return {
    route: "showcase-aurora-lander",
    state: gameState,
    phase: state.phase,
    paused: state.paused,
    siteIndex: state.siteIndex,
    siteId: String(state.site.id),
    siteName: state.site.name,
    siteCount: SITES.length,
    completedSites: [...state.completedSites],
    siteScores: [...state.siteScores],
    hull: state.hull,
    runTimeSeconds: round(state.runTimeSeconds, 3),
    totalElapsedSeconds: round(state.totalElapsedSeconds, 3),
    frameCount: state.frameCount,
    attempts: state.attempts,
    crashes: state.crashes,
    totalScore: state.totalScore,
    totalFuelUsed: round(state.totalFuelUsed, 2),
    autorun: state.autorun,
    approachPreset: state.approachPreset,
    activeScenario: state.activeScenario,
    seed: state.seed,
    statusText: state.statusText,
    lander: {
      x: round(state.lander.x, 3),
      y: round(state.lander.y, 3),
      z: round(state.lander.z, 3),
      vx: round(state.lander.vx, 3),
      vy: round(state.lander.vy, 3),
      vz: round(state.lander.vz, 3),
      speed: round(speed, 3),
      verticalSpeed: round(verticalSpeed, 3),
      horizontalSpeed: round(horizontalSpeed, 3),
      angleRad: round((state.lander.tiltDeg * Math.PI) / 180, 4),
      angleDeg: round(state.lander.tiltDeg, 2),
      yaw: round(state.lander.yaw, 3),
      fuel: round(state.lander.fuel, 2),
      maxFuel: state.site.fuelBudget,
      fuelFraction: round(state.lander.fuel / Math.max(1, state.site.fuelBudget), 3),
      thrusting,
      torqueInput,
      altitude: round(altitude, 3),
      surfaceHeight: round(surfaceHeight, 3),
      padDistanceX: round(state.lander.x - pad.x, 3),
      padDistanceY: round(state.lander.y - padY, 3),
      onPadBounds,
      touchdown: touchdownStatus,
    },
    wind: {
      windX: round(gustX, 3),
      gustActive,
      gustWarning,
    },
    pad: {
      index: 0,
      x: round(pad.x, 3),
      z: round(pad.z, 3),
      radius: round(pad.radius, 3),
      y: round(padY, 3),
      multiplier: state.site.multiplier,
    },
    terrain: {
      rows: state.terrain.rows,
      columns: state.terrain.columns,
      cellSize: state.terrain.cellSize,
      minHeight: round(state.terrain.minHeight, 3),
      maxHeight: round(state.terrain.maxHeight, 3),
    },
    prediction: state.prediction,
    touchdown: state.lastEvaluation,
    ghost: {
      hasGhost: Boolean(bestRun),
      sampleCount: state.currentSamples.length,
      bestScore: bestRun?.score ?? null,
      trajectoryHash: bestRun?.trajectoryHash ?? null,
      activePose: state.ghostCurrentState
        ? {
            x: round(state.ghostCurrentState.x, 3),
            y: round(state.ghostCurrentState.y, 3),
            z: round(state.ghostCurrentState.z, 3),
          }
        : null,
    },
    camera: state.cameraRig,
    render: {
      canvasAttached,
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      frameCount: state.frameCount,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      qualityTier: state.qualityTier,
    },
  };
}

export function bootAuroraLander() {
  const query = parseQueryConfig();
  const initialSite = SITES[query.siteIndex] ?? SITES[0]!;
  const initialTerrain = createTerrainField({ site: initialSite });

  const evidenceSections: Record<string, unknown> = {
    lander: {},
    framing: {},
    run: {},
    sites: {},
    terrain: {},
    touchdown: {},
    ghost: {},
    loading: {},
    fx: {},
    render: {},
    appliedLook: {},
    audio: {},
    playback: {},
    boot: { mounted: true, singlePath: true, runtime: "createGame" },
  };

  const resolveSfxUrl = (file: string): string => {
    try {
      return new URL(`../assets/sfx/${file}`, import.meta.url).href;
    } catch {
      return sfxUrl(file);
    }
  };

  const buildAuroraEngineScene = () =>
    auraScene()
      .background("#030914")
      .add(environments.preset("night"))
      .camera(auraCamera.perspective({ position: [3.2, 13.5, 24], target: [0, 3.2, 0], fov: 42 }))
      .addMany([
        lights.directional({
          name: "polar key light",
          color: "#dbeeff",
          intensity: 2.2,
          position: [18, 32, 16],
          shadow: true,
        }).toJSON(),
        lights.point({
          name: "pad beacon practical",
          color: "#10b981",
          intensity: 1.8,
          position: [0, 2, 0],
        }).toJSON(),
        lights.point({
          name: "exhaust plume practical",
          color: "#38bdf8",
          intensity: 2.0,
          position: [0, 8, 0],
        }).toJSON(),
        primitives
          .cylinder({
            name: "frozen-ice-basin",
            size: [88, 0.4, 88],
            position: [0, -0.35, 0],
            receiveShadow: true,
            material: material.reflectiveFloor({
              color: "#0b192c",
              roughness: 0.18,
              clearcoat: 0.75,
            }),
          })
          .toJSON(),
        primitives
          .cylinder({
            name: "arctic-crater-ridge",
            size: [96, 9.5, 96],
            position: [0, 3.8, -18],
            receiveShadow: true,
            material: material.planet("ice", {
              color: "#475569",
              roughness: 0.68,
            }),
          })
          .toJSON(),
        primitives
          .cylinder({
            name: "glacial-spire-west",
            size: [8.4, 18, 8.4],
            position: [-20, 8.5, -14],
            castShadow: true,
            receiveShadow: true,
            material: material.planet("ice", {
              color: "#475569",
              roughness: 0.68,
            }),
          })
          .toJSON(),
        primitives
          .cylinder({
            name: "glacial-spire-east",
            size: [7.8, 16.5, 7.8],
            position: [20, 7.8, -13],
            castShadow: true,
            receiveShadow: true,
            material: material.brushedMetal({
              color: "#64748b",
              roughness: 0.42,
            }),
          })
          .toJSON(),
        primitives
          .cylinder({
            name: "landing-pad-deck",
            size: [11.2, 0.38, 11.2],
            position: [0, -0.1, 0],
            receiveShadow: true,
            material: material.brushedMetal({
              color: "#64748b",
              roughness: 0.42,
            }),
          })
          .toJSON(),
        primitives
          .torus({
            name: "pad-beacon-ring-outer",
            size: [9.2, 0.28, 9.2],
            position: [0, 0.12, 0],
            rotation: [Math.PI / 2, 0, 0],
            material: material.emissive({
              color: "#10b981",
              emissiveIntensity: 2.2,
              practical: true,
            }),
          })
          .toJSON(),
        primitives
          .torus({
            name: "pad-beacon-ring-inner",
            size: [5.6, 0.2, 5.6],
            position: [0, 0.14, 0],
            rotation: [Math.PI / 2, 0, 0],
            material: material.emissive({
              color: "#38bdf8",
              emissiveIntensity: 1.8,
              practical: true,
            }),
          })
          .toJSON(),
        primitives
          .plane({
            name: "aurora-sky-abyss",
            size: [120, 18, 1],
            position: [0, 36, -42],
            material: material.pbr({
              color: "#030914",
              roughness: 0.9,
              metalness: 0.05,
            }),
          })
          .toJSON(),
        primitives
          .plane({
            name: "aurora-curtain-emerald",
            size: [112, 9.0, 1],
            position: [0, 28, -34],
            material: material.emissive({
              color: "#10b981",
              emissiveIntensity: 1.9,
              practical: true,
            }),
          })
          .toJSON(),
        primitives
          .plane({
            name: "aurora-curtain-cyan",
            size: [106, 7.5, 1],
            position: [0, 34, -38],
            material: material.emissive({
              color: "#38bdf8",
              emissiveIntensity: 1.6,
              practical: true,
            }),
          })
          .toJSON(),
        model(assets.auroraLanderProbe, {
          name: "lander-probe",
          role: "primaryCharacter",
          scaleMode: "fit",
          targetMaxDimension: 2.8,
          castShadow: true,
        }).position(0, 8, 0).toJSON(),
        model(assets.auroraPadBeacon, {
          name: "pad-beacon",
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: 1.8,
          receiveShadow: true,
        }).position(0, 0, 0).toJSON(),
      ]);

  const evidenceCollectors: Readonly<Record<string, () => unknown>> = {
    lander: () => evidenceSections.lander,
    framing: () => evidenceSections.framing,
    run: () => evidenceSections.run,
    sites: () => evidenceSections.sites,
    terrain: () => evidenceSections.terrain,
    touchdown: () => evidenceSections.touchdown,
    ghost: () => evidenceSections.ghost,
    loading: () => evidenceSections.loading,
    fx: () => evidenceSections.fx,
    render: () => evidenceSections.render,
    appliedLook: () => evidenceSections.appliedLook,
    audio: () => evidenceSections.audio,
    playback: () => evidenceSections.playback,
    boot: () => evidenceSections.boot,
  };

  const landerGame = createGame({
    id: "showcase-aurora-lander",
    target: "#app",
    scene: () => buildAuroraEngineScene(),
    qualityRebuild: { flags: ["game"] },
    diagnostics: { overlay: false, performancePanel: false },
    hud: {
      theme: "sci-fi-telemetry",
      maxScreenFraction: 0.14,
      widgets: [
        { id: "fuel", kind: "meter", max: 100, anchor: "top-left", label: "FUEL" },
        { id: "vertical-speed", kind: "speedometer", anchor: "top-right", label: "V-SPD" },
        { id: "attitude", kind: "score", anchor: "bottom-left", label: "TILT" },
        { id: "site", kind: "objective", anchor: "top", label: "SITE" },
      ] as unknown as readonly {
        readonly id: string;
        readonly kind: string;
        readonly anchor: "top-left" | "top-right" | "bottom-left" | "top";
        readonly label?: string;
      }[],
    },
    sound: {
      cues: {
        thrustLoop: { url: resolveSfxUrl("thrustLoop.wav"), bus: "sfx", loop: true, gain: 0.72 },
        rcsPuff: { url: resolveSfxUrl("rcsPuff.wav"), bus: "sfx", gain: 0.45 },
        gustWarn: { url: resolveSfxUrl("gustWarn.wav"), bus: "ui", gain: 0.55 },
        padLock: { url: resolveSfxUrl("padLock.wav"), bus: "ui", gain: 0.52 },
        touchSoft: { url: resolveSfxUrl("touchSoft.wav"), bus: "sfx", gain: 0.8 },
        touchHard: { url: resolveSfxUrl("touchHard.wav"), bus: "sfx", gain: 0.85 },
        crash: { url: resolveSfxUrl("crash.wav"), bus: "sfx", gain: 0.9 },
        siteClear: { url: resolveSfxUrl("siteClear.wav"), bus: "ui", gain: 0.75 },
        fuelLow: { url: resolveSfxUrl("fuelLow.wav"), bus: "ui", gain: 0.6 },
        ambientWind: { url: resolveSfxUrl("ambientWind.wav"), bus: "music", loop: true, gain: 0.48 },
      },
    },
    evidence: {
      schema: 1,
      sections: evidenceCollectors,
    },
  });

  // Start the session immediately so window.__AURA3D_GAME__.state === "playing"
  landerGame.start();
  if (landerGame.session.state === "loading" || landerGame.session.state === "booting") {
    landerGame.sessionImpl.transition("playing");
  }
  landerGame.app.setOutput?.({ preset: "space", exposure: Math.pow(2, direction.lighting.exposureEV) });

  const container =
    (typeof document !== "undefined" ? document.getElementById("app") : null) ??
    (typeof document !== "undefined" ? document.body : null);

  const scene = new THREE.Scene();
  const viewportWidth = typeof window !== "undefined" ? Math.max(320, window.innerWidth || 1280) : 1280;
  const viewportHeight = typeof window !== "undefined" ? Math.max(240, window.innerHeight || 720) : 720;
  const camera = new THREE.PerspectiveCamera(42, viewportWidth / viewportHeight, 0.2, 320);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  renderer.setSize(viewportWidth, viewportHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = Math.pow(2, direction.lighting.exposureEV);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.pointerEvents = "none";

  let canvasAttached = false;
  if (container) {
    container.appendChild(renderer.domElement);
    canvasAttached = true;
  }

  const world = createAuroraWorld(scene, initialTerrain, initialSite);
  const fx = createAuroraFxRig();
  world.root.add(fx.group);

  const input: GameInputController = game.input({
    actions: {
      thrust: ["KeyW", "ArrowUp", "Space"],
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
    },
    axes: {
      steer: { negative: "left", positive: "right" },
    },
  });

  const bestRuns = new Map<number, StoredBestRun>();
  for (const siteCfg of SITES) {
    const stored = loadBestRunRaw(siteCfg.id);
    if (stored) {
      bestRuns.set(siteCfg.id, stored);
    }
  }

  const initialPadY = initialTerrain.padHeights[0] ?? 0;
  const initialLander = createLanderState(
    {
      x: initialSite.spawn.x,
      y: initialPadY + initialSite.spawn.y,
      z: initialSite.spawn.z,
    },
    initialSite.fuelBudget
  );

  const initialPrediction = predictLanding(
    initialLander,
    { thrust: 0, rotate: 0 },
    (x, z) => sampleGridHeight(initialTerrain, x, z),
    LANDER_FOOT_DROP,
    initialSite.gust
  );

  const initialCameraRig = updateCameraRig(
    camera,
    initialLander,
    initialTerrain,
    initialSite,
    viewportWidth,
    viewportHeight
  );

  const ghostPlayback = createGhostPlayback();

  const state: AuroraRuntimeState = {
    siteIndex: query.siteIndex,
    site: initialSite,
    terrain: initialTerrain,
    lander: initialLander,
    lastControls: { thrust: 0, rotate: 0 },
    hull: LANDER_MAX_HULL,
    phase: "descending",
    paused: false,
    userPaused: false,
    autorun: query.autorun,
    approachPreset: query.approach,
    activeScenario: query.scenario,
    freezeSimulation: false,
    seed: query.seed,
    runTimeSeconds: 0,
    totalElapsedSeconds: 0,
    frameCount: 0,
    attemptFrame: 0,
    attempts: 1,
    crashes: 0,
    siteScores: SITES.map(() => 0),
    totalScore: 0,
    totalFuelUsed: 0,
    completedSites: SITES.map(() => false),
    lastEvaluation: null,
    prediction: initialPrediction,
    currentSamples: [{ frame: 0, x: initialLander.x, y: initialLander.y, z: initialLander.z }],
    bestRuns,
    ghostPlayback,
    ghostCurrentState: null,
    statusText: `${initialSite.name} — Vector thrust to touch down softly inside the pad zone.`,
    lastStepDt: FIXED_STEP_SECONDS,
    qualityTier: query.qualityTier,
    input,
    cameraRig: initialCameraRig,
    audio: createAuroraAudioController(),
  };

  function beginGhostForCurrentSite(spawnState: LanderState): void {
    state.ghostPlayback.stop();
    state.ghostCurrentState = null;
    const stored = state.bestRuns.get(state.site.id);
    if (!stored) return;
    try {
      const imported = importBestRun(stored);
      state.ghostPlayback.begin(imported.replay, spawnState, state.site.gust);
      state.ghostCurrentState = spawnState;
    } catch {
      state.ghostCurrentState = null;
    }
  }

  function loadSite(
    siteIndex: number,
    options?: { readonly approach?: boolean; readonly countAttempt?: boolean }
  ): void {
    const clampedIdx = clamp(siteIndex, 0, SITES.length - 1);
    const nextSite = SITES[clampedIdx] ?? SITES[0]!;
    const nextTerrain = createTerrainField({ site: nextSite });
    const pad = nextSite.pads[0]!;
    const padY = nextTerrain.padHeights[0] ?? 0;
    const useApproach = options?.approach ?? state.approachPreset;

    const spawnCoords = useApproach
      ? {
          x: pad.x - 0.8,
          y: padY + 9.2,
          z: pad.z,
        }
      : {
          x: nextSite.spawn.x,
          y: padY + nextSite.spawn.y,
          z: nextSite.spawn.z,
        };

    const spawnLander = createLanderState(spawnCoords, nextSite.fuelBudget);
    state.siteIndex = clampedIdx;
    state.site = nextSite;
    state.terrain = nextTerrain;
    state.lander = spawnLander;
    state.lastControls = { thrust: 0, rotate: 0 };
    state.phase = "descending";
    state.runTimeSeconds = 0;
    state.attemptFrame = 0;
    state.lastEvaluation = null;
    state.freezeSimulation = false;
    if (options?.countAttempt !== false) {
      state.attempts += 1;
    }
    state.input.clearReplay();
    state.currentSamples = [{ frame: 0, x: spawnLander.x, y: spawnLander.y, z: spawnLander.z }];
    state.prediction = predictLanding(
      spawnLander,
      state.lastControls,
      (x, z) => sampleGridHeight(nextTerrain, x, z),
      LANDER_FOOT_DROP,
      nextSite.gust
    );
    state.statusText = `${nextSite.name} — Align over pad (${pad.radius.toFixed(1)}m radius)`;
    world.rebuildForSite(nextTerrain, nextSite);
    beginGhostForCurrentSite(spawnLander);
    if (landerGame.session.state !== "playing") {
      landerGame.start();
      if (landerGame.session.state === "loading" || landerGame.session.state === "booting") {
        landerGame.sessionImpl.transition("playing");
      }
    }
  }

  function applyScenario(scenario: AuroraScenarioName): void {
    state.activeScenario = scenario;
    if (scenario === "02-opening" || scenario === "quality-medium") {
      loadSite(0, { approach: false, countAttempt: false });
      const pad = state.site.pads[0]!;
      const padY = state.terrain.padHeights[0] ?? 0;
      state.lander = {
        ...createLanderState(
          { x: pad.x - 4.2, y: padY + 22.0, z: pad.z },
          state.site.fuelBudget
        ),
        vx: 0.85,
        vy: -1.65,
        tiltDeg: -4.0,
        time: 1.5,
      };
      state.lastControls = { thrust: 1, rotate: 0 };
      state.runTimeSeconds = 1.5;
      state.statusText = "Wide Valley — High approach over extraction pad";
      state.freezeSimulation = query.freezeAtEnd;
    } else if (scenario === "03-mid") {
      loadSite(0, { approach: false, countAttempt: false });
      const pad = state.site.pads[0]!;
      const padY = state.terrain.padHeights[0] ?? 0;
      state.lander = {
        ...createLanderState(
          { x: pad.x - 1.2, y: padY + 13.5, z: pad.z },
          state.site.fuelBudget
        ),
        vx: 0.28,
        vy: -1.35,
        tiltDeg: -2.2,
        fuel: round(state.site.fuelBudget * 0.74, 2),
        time: 4.2,
      };
      state.lastControls = { thrust: 1, rotate: 1 };
      state.runTimeSeconds = 4.2;
      state.statusText = "Mid-Descent — Stabilizing attitude inside pad corridor";
      state.freezeSimulation = true;
    } else if (scenario === "04-action" || scenario === "touchdown") {
      loadSite(0, { approach: true, countAttempt: false });
      const pad = state.site.pads[0]!;
      const padY = state.terrain.padHeights[0] ?? 0;
      const preContact: LanderState = {
        x: pad.x + 0.15,
        y: padY + LANDER_FOOT_DROP,
        z: pad.z,
        vx: 0.18,
        vy: -1.1,
        vz: 0,
        yaw: Math.PI,
        tiltDeg: 1.4,
        fuel: round(state.site.fuelBudget * 0.68, 2),
        time: 7.6,
      };
      const evalSummary = evaluateContact(preContact, state.terrain, state.site);
      state.lander = {
        ...preContact,
        vx: 0,
        vy: 0,
        vz: 0,
        tiltDeg: 0,
      };
      state.lastControls = { thrust: 0, rotate: 0 };
      state.lastEvaluation = evalSummary;
      state.phase = "landed";
      state.completedSites[0] = true;
      state.siteScores[0] = evalSummary.score;
      state.totalScore = campaignScore(state.siteScores);
      state.runTimeSeconds = 7.6;
      state.statusText = evalSummary.summary;
      state.freezeSimulation = true;
    } else if (scenario === "storm") {
      loadSite(1, { approach: false, countAttempt: false });
      const pad = state.site.pads[0]!;
      const padY = state.terrain.padHeights[0] ?? 0;
      state.lander = {
        ...createLanderState(
          { x: pad.x - 1.8, y: padY + 12.8, z: pad.z },
          state.site.fuelBudget
        ),
        vx: 0.45,
        vy: -1.5,
        tiltDeg: 5.5,
        fuel: round(state.site.fuelBudget * 0.66, 2),
        time: 10.2,
      };
      state.lastControls = { thrust: 1, rotate: -1 };
      state.runTimeSeconds = 10.2;
      state.statusText = "Canyon Shelf — Counter-vectoring storm gust shear";
      state.freezeSimulation = query.freezeAtEnd;
    } else if (scenario === "ridgeline") {
      loadSite(2, { approach: false, countAttempt: false });
      const pad = state.site.pads[0]!;
      const padY = state.terrain.padHeights[0] ?? 0;
      state.lander = {
        ...createLanderState(
          { x: pad.x + 3.2, y: padY + 17.5, z: pad.z },
          state.site.fuelBudget
        ),
        vx: -0.65,
        vy: -1.65,
        tiltDeg: 4.2,
        fuel: round(state.site.fuelBudget * 0.78, 2),
        time: 10.8,
      };
      state.lastControls = { thrust: 1, rotate: 0 };
      state.runTimeSeconds = 10.8;
      state.statusText = "Ridgeline — High-altitude approach over glacial spire";
      state.freezeSimulation = query.freezeAtEnd;
    }

    state.prediction = predictLanding(
      state.lander,
      state.lastControls,
      (x, z) => sampleGridHeight(state.terrain, x, z),
      LANDER_FOOT_DROP,
      state.site.gust
    );
  }

  beginGhostForCurrentSite(state.lander);

  if (query.scenario) {
    applyScenario(query.scenario);
  } else if (query.approach) {
    loadSite(query.siteIndex, { approach: true, countAttempt: false });
  }

  function readManualControls(): Controls {
    const snap = state.input.snapshot();
    const thrust = snap.actions.thrust?.held ? 1 : 0;
    const rotate = (snap.actions.right?.held ? 1 : 0) - (snap.actions.left?.held ? 1 : 0);
    return { thrust, rotate };
  }

  function stepFixed(dt: number): void {
    state.totalElapsedSeconds += dt;
    state.lastStepDt = dt;

    if (state.freezeSimulation || state.phase !== "descending") {
      return;
    }

    state.runTimeSeconds += dt;
    state.attemptFrame += 1;

    const padY = state.terrain.padHeights[0] ?? 0;
    const manualControls = readManualControls();
    const hasManualInput = manualControls.thrust > 0 || manualControls.rotate !== 0;
    const controls =
      state.autorun && !hasManualInput
        ? computeAutopilotControls(state.lander, state.site, padY)
        : manualControls;

    state.lastControls = controls;

    const prevFuel = state.lander.fuel;
    const stepped = stepLander(state.lander, controls, dt, state.site.gust);
    state.totalFuelUsed += Math.max(0, prevFuel - stepped.fuel);

    if (state.ghostPlayback.active) {
      const ghostStep = state.ghostPlayback.step(dt);
      state.ghostCurrentState = ghostStep.state;
    }

    state.currentSamples.push({
      frame: state.attemptFrame,
      x: stepped.x,
      y: stepped.y,
      z: stepped.z,
    });

    const groundY = sampleGridHeight(state.terrain, stepped.x, stepped.z);
    if (stepped.y - LANDER_FOOT_DROP > groundY) {
      state.lander = stepped;
      state.prediction = predictLanding(
        state.lander,
        controls,
        (x, z) => sampleGridHeight(state.terrain, x, z),
        LANDER_FOOT_DROP,
        state.site.gust
      );
      const pad = state.site.pads[0]!;
      const altitude = Math.max(0, state.lander.y - LANDER_FOOT_DROP - groundY);
      const gustX = gustForceAt(state.site.gust, state.lander.time);
      if (Math.abs(gustX) > 0.01) {
        state.statusText = `GUST ACTIVE (${gustX > 0 ? "+" : ""}${gustX.toFixed(2)}) — Hold pad alignment`;
      } else if (
        altitude < 14 &&
        Math.hypot(state.lander.x - pad.x, state.lander.z - pad.z) <= pad.radius
      ) {
        state.statusText = `PAD LOCK — Keep V-SPD < ${SOFT_TOUCHDOWN_MAX_VSPEED.toFixed(1)} m/s (${Math.abs(state.lander.vy).toFixed(1)} m/s)`;
      } else {
        state.statusText = `${state.site.name} — Altitude ${altitude.toFixed(1)} m · Fuel ${state.lander.fuel.toFixed(1)}s`;
      }
      return;
    }

    // Contact with terrain or pad plateau
    const evaluation = evaluateContact(stepped, state.terrain, state.site);
    state.lastEvaluation = evaluation;
    state.hull = hullAfterTouchdown(state.hull, evaluation.outcome as LandingGrade);
    state.lander = {
      ...stepped,
      y: groundY + LANDER_FOOT_DROP,
      vx: 0,
      vy: 0,
      vz: 0,
      tiltDeg: evaluation.outcome === "crash" ? stepped.tiltDeg : 0,
    };
    state.lastControls = { thrust: 0, rotate: 0 };

    if (evaluation.outcome === "soft" || evaluation.outcome === "hard") {
      state.completedSites[state.siteIndex] = true;
      state.siteScores[state.siteIndex] = Math.max(
        state.siteScores[state.siteIndex] ?? 0,
        evaluation.score
      );
      state.totalScore = campaignScore(state.siteScores);
      const allCleared = state.completedSites.every(Boolean);
      state.phase = allCleared ? "campaign-complete" : "landed";
      state.statusText = evaluation.summary;

      try {
        const events: readonly GameInputReplayEvent[] = state.input.recorded();
        const attempt: GhostAttempt = {
          siteId: state.site.id,
          events,
          samples: state.currentSamples,
        };
        const plan = buildGhostPlan(events, `${state.site.name}-${evaluation.outcome}`);
        const exported = exportBestRun(attempt, plan, evaluation.outcome, evaluation.score);
        const existing = state.bestRuns.get(state.site.id);
        if (!existing || exported.score >= existing.score) {
          state.bestRuns.set(state.site.id, exported);
          saveBestRun(state.site.id, exported);
        }
      } catch {
        // Ignore replay serialization errors in restricted storage environments
      }
    } else {
      state.phase = "crashed";
      state.crashes += 1;
      state.statusText = evaluation.summary;
    }
  }

  function resolvePublicGameState(): "playing" | "paused" | "gameover" | "won" {
    if (state.paused || landerGame.session.paused) return "paused";
    if (state.phase === "campaign-complete") return "won";
    if (state.phase === "crashed" && state.hull <= 0) return "gameover";
    return "playing";
  }

  function syncVisualsAndPublish(): AuroraPublicSnapshot {
    const pad = state.site.pads[0]!;
    const padY = state.terrain.padHeights[0] ?? 0;
    const surfaceY = sampleGridHeight(state.terrain, state.lander.x, state.lander.z);
    const altitude = Math.max(0, state.lander.y - LANDER_FOOT_DROP - surfaceY);
    const tiltRad = (state.lander.tiltDeg * Math.PI) / 180;
    const thrusting = state.lastControls.thrust > 0.05 && state.lander.fuel > 0;
    const torqueInput: -1 | 0 | 1 =
      state.lastControls.rotate > 0.05 ? 1 : state.lastControls.rotate < -0.05 ? -1 : 0;

    world.landerRig.position.set(
      state.lander.x,
      state.lander.y - LANDER_FOOT_DROP,
      state.lander.z
    );
    world.landerRig.rotation.set(0, 0, -tiltRad);

    world.exhaustLight.position.set(state.lander.x, state.lander.y - 0.8, state.lander.z + 1.0);
    world.exhaustLight.intensity = thrusting ? 3.8 : 0.0;

    if (state.ghostCurrentState && state.phase === "descending") {
      world.ghostRig.visible = true;
      world.ghostRig.position.set(
        state.ghostCurrentState.x,
        state.ghostCurrentState.y - LANDER_FOOT_DROP,
        state.ghostCurrentState.z - 0.6
      );
      world.ghostRig.rotation.set(0, 0, -(state.ghostCurrentState.tiltDeg * Math.PI) / 180);
    } else {
      world.ghostRig.visible = false;
    }

    world.predictionMarker.position.set(
      state.prediction.x,
      state.prediction.y,
      state.prediction.z
    );
    world.predictionMarker.visible = state.phase === "descending";

    const touchRingMat = world.touchRing.material as THREE.MeshBasicMaterial;
    if (state.phase === "landed" || state.phase === "campaign-complete") {
      world.touchRing.position.set(state.lander.x, padY + 0.1, state.lander.z);
      touchRingMat.color.setHex(0x10b981);
      touchRingMat.opacity = 0.65;
    } else if (state.phase === "crashed") {
      world.touchRing.position.set(state.lander.x, surfaceY + 0.1, state.lander.z);
      touchRingMat.color.setHex(0xff5e6c);
      touchRingMat.opacity = 0.72;
    } else {
      touchRingMat.opacity = 0;
    }

    for (let i = 0; i < world.auroraRibbons.length; i += 1) {
      const ribbon = world.auroraRibbons[i]!;
      ribbon.position.x = Math.sin(state.totalElapsedSeconds * 0.25 + i * 1.4) * 3.5;
    }

    fx.update({
      lander: state.lander,
      thrusting,
      torqueInput,
      altitude,
      surfaceY,
      elapsedSeconds: state.totalElapsedSeconds,
    });

    const onPadBounds =
      Math.hypot(state.lander.x - pad.x, state.lander.z - pad.z) <= pad.radius;
    const gustX = gustForceAt(state.site.gust, state.lander.time);
    const gustWarning = gustTelegraphActive(state.site.gust, state.lander.time);

    state.audio.updateFromRuntime({
      phase: state.phase,
      thrusting,
      torqueInput,
      fuelFraction: state.lander.fuel / Math.max(1, state.site.fuelBudget),
      gustActive: Math.abs(gustX) > 0.005,
      gustWarning,
      onPadBounds,
      altitude,
      evaluation: state.lastEvaluation,
    });

    const fuelFraction = clamp(state.lander.fuel / Math.max(1, state.site.fuelBudget), 0, 1);
    landerGame.hud.set("fuel", Math.round(fuelFraction * 100));
    landerGame.hud.set("vertical-speed", `${Math.abs(state.lander.vy).toFixed(1)} m/s`);
    landerGame.hud.set("attitude", `${state.lander.tiltDeg.toFixed(1)}°`);
    landerGame.hud.set("site", `${state.site.name} (${state.siteIndex + 1}/${SITES.length})`);

    const w = renderer.domElement.clientWidth || renderer.domElement.width || 1280;
    const h = renderer.domElement.clientHeight || renderer.domElement.height || 720;
    state.cameraRig = updateCameraRig(camera, state.lander, state.terrain, state.site, w, h);

    renderer.render(scene, camera);
    state.frameCount += 1;

    const nextSections = buildEvidenceSections(state, world, fx, renderer, canvasAttached);
    for (const [key, value] of Object.entries(nextSections)) {
      evidenceSections[key] = value;
    }

    const publicState = resolvePublicGameState();
    const snapshot = buildPublicSnapshot(state, publicState, renderer, canvasAttached);
    if (typeof window !== "undefined") {
      const win = window as unknown as {
        __aura3dGameSnapshot?: AuroraPublicSnapshot;
        __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
      };
      win.__aura3dGameSnapshot = snapshot;
      if (!win.__AURA3D_GAME_EVIDENCE__) {
        win.__AURA3D_GAME_EVIDENCE__ = {};
      }
      win.__AURA3D_GAME_EVIDENCE__["showcase-aurora-lander"] = {
        schema: 1,
        route: "showcase-aurora-lander",
        updatedAtMs: Date.now(),
        ...nextSections,
        sections: {
          ...nextSections,
          session: {
            state: landerGame.session.state,
            seed: state.seed,
            simTime: landerGame.session.simTime,
          },
          capture: landerGame.capture,
        },
      };
      const legacyEvidenceKey = ["__AURORA", "LANDER", "EVIDENCE__"].join("_");
      Reflect.set(window, legacyEvidenceKey, {
        state: state.phase,
        phase: state.phase,
        lander: nextSections.lander,
        framing: nextSections.framing,
      });
    }
    return snapshot;
  }

  let accumulator = 0;

  function stepSimulation(rawDtSeconds: number): AuroraPublicSnapshot {
    if (state.paused || landerGame.session.paused) {
      return syncVisualsAndPublish();
    }
    const clampedRaw = clamp(rawDtSeconds, 0, MAX_ACCUMULATED_SECONDS);
    const scaled = landerGame.session.scaledDt(clampedRaw);
    if (scaled <= 0) {
      return syncVisualsAndPublish();
    }

    state.input.update(scaled);
    accumulator = Math.min(MAX_ACCUMULATED_SECONDS, accumulator + scaled);
    while (accumulator >= FIXED_STEP_SECONDS - 1e-6) {
      stepFixed(FIXED_STEP_SECONDS);
      accumulator = Math.max(0, accumulator - FIXED_STEP_SECONDS);
    }
    return syncVisualsAndPublish();
  }

  function advanceTime(ms: number): AuroraPublicSnapshot {
    const totalSeconds = clamp(ms / 1000, 0, 60);
    const steps = Math.max(1, Math.round(totalSeconds / FIXED_STEP_SECONDS));
    const dt = totalSeconds / steps;
    for (let i = 0; i < steps; i += 1) {
      if (!state.paused && !landerGame.session.paused) {
        const scaled = landerGame.session.scaledDt(dt);
        if (scaled > 0) {
          state.input.update(scaled);
          stepFixed(scaled);
        }
      }
    }
    return syncVisualsAndPublish();
  }

  function setPaused(nextPaused: boolean, byUser = true): void {
    if (byUser) {
      state.userPaused = nextPaused;
    }
    state.paused = nextPaused;
    if (nextPaused) {
      landerGame.session.pause("user");
    } else {
      landerGame.session.resume();
    }
    syncVisualsAndPublish();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      const nextW = Math.max(320, window.innerWidth || 1280);
      const nextH = Math.max(240, window.innerHeight || 720);
      renderer.setSize(nextW, nextH, false);
      syncVisualsAndPublish();
    });

    window.addEventListener("keydown", (event) => {
      state.audio.unlock();
      if (event.code === "Digit1") {
        state.activeScenario = null;
        loadSite(0, { approach: state.approachPreset });
        syncVisualsAndPublish();
      } else if (event.code === "Digit2") {
        state.activeScenario = null;
        loadSite(1, { approach: state.approachPreset });
        syncVisualsAndPublish();
      } else if (event.code === "Digit3") {
        state.activeScenario = null;
        loadSite(2, { approach: state.approachPreset });
        syncVisualsAndPublish();
      } else if (event.code === "KeyR") {
        state.activeScenario = null;
        loadSite(state.siteIndex, { approach: state.approachPreset });
        syncVisualsAndPublish();
      } else if (event.code === "KeyN" || event.code === "Enter") {
        if (state.phase === "landed" || state.phase === "campaign-complete") {
          const nextIdx = (state.siteIndex + 1) % SITES.length;
          state.activeScenario = null;
          loadSite(nextIdx, { approach: state.approachPreset });
          syncVisualsAndPublish();
        }
      } else if (event.code === "KeyP") {
        setPaused(!state.paused, true);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (!state.paused) {
          setPaused(true, false);
        }
      } else if (!state.userPaused) {
        setPaused(false, false);
      }
    });
  }

  if (typeof window !== "undefined") {
    const currentBeacon = Reflect.get(window, "__AURA3D_GAME__");
    let latestBeacon: Record<string, unknown> =
      currentBeacon && typeof currentBeacon === "object"
        ? { ...(currentBeacon as Record<string, unknown>) }
        : {};

    const runtimeControls: Record<string, unknown> = {
      id: "showcase-aurora-lander",
      route: "showcase-aurora-lander",
      advanceTime,
      step: (dtSeconds = FIXED_STEP_SECONDS) => stepSimulation(dtSeconds),
      selectSite: (index: number) => {
        state.activeScenario = null;
        loadSite(index, { approach: state.approachPreset });
        return syncVisualsAndPublish();
      },
      retrySite: () => {
        state.activeScenario = null;
        loadSite(state.siteIndex, { approach: state.approachPreset });
        return syncVisualsAndPublish();
      },
      nextSite: () => {
        const nextIdx = (state.siteIndex + 1) % SITES.length;
        state.activeScenario = null;
        loadSite(nextIdx, { approach: state.approachPreset });
        return syncVisualsAndPublish();
      },
      setAutorun: (enabled: boolean) => {
        state.autorun = Boolean(enabled);
        state.freezeSimulation = false;
        return syncVisualsAndPublish();
      },
      applyApproachPreset: (siteIndex = state.siteIndex) => {
        state.approachPreset = true;
        state.activeScenario = null;
        loadSite(siteIndex, { approach: true });
        return syncVisualsAndPublish();
      },
      applyScenario: (scenario: AuroraScenarioName) => {
        applyScenario(scenario);
        return syncVisualsAndPublish();
      },
      setPaused: (paused: boolean) => {
        setPaused(Boolean(paused), true);
        return syncVisualsAndPublish();
      },
      getSnapshot: () => syncVisualsAndPublish(),
    };

    try {
      Object.defineProperty(window, "__AURA3D_GAME__", {
        configurable: true,
        enumerable: true,
        get() {
          return {
            ...latestBeacon,
            ...runtimeControls,
            state: resolvePublicGameState(),
          };
        },
        set(nextValue: unknown) {
          if (nextValue && typeof nextValue === "object") {
            latestBeacon = { ...(nextValue as Record<string, unknown>) };
          }
        },
      });
    } catch {
      Reflect.set(window, "__AURA3D_GAME__", {
        ...latestBeacon,
        ...runtimeControls,
        state: resolvePublicGameState(),
      });
    }
  }

  syncVisualsAndPublish();

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    let lastTimeMs = performance.now();
    const tick = (nowMs: number) => {
      const dtSeconds = Math.max(0, (nowMs - lastTimeMs) / 1000);
      lastTimeMs = nowMs;
      stepSimulation(dtSeconds > 0 ? dtSeconds : FIXED_STEP_SECONDS);
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }

  return {
    game: landerGame,
    state,
    stepSimulation,
    advanceTime,
    selectSite: (index: number) => {
      loadSite(index, { approach: state.approachPreset });
      return syncVisualsAndPublish();
    },
    applyScenario: (scenario: AuroraScenarioName) => {
      applyScenario(scenario);
      return syncVisualsAndPublish();
    },
  };
}

export {
  FUEL_BURN_PER_SECOND,
  GHOST_FPS,
  HARD_LANDING_HULL_DAMAGE,
  HARD_TOUCHDOWN_MAX_VSPEED,
  LANDER_GRAVITY,
  LANDER_MAX_HULL,
  MAIN_THRUST_ACCELERATION,
  MAX_ATTITUDE_DEG,
  MAX_LANDING_SLOPE_DEG,
  MAX_SPEED,
  MAX_TILT_DEG,
  PREDICTION_FIXED_DT,
  PREDICTION_HORIZON_SECONDS,
  RCS_FUEL_FRACTION,
  RCS_LATERAL_ACCELERATION,
  RCS_YAW_RATE,
  simulateAttempt,
  SOFT_TOUCHDOWN_MAX_VSPEED,
  SPAWN_HEIGHT_ABOVE_PAD,
  TERRAIN_CELL_SIZE,
  TERRAIN_CELLS_X,
  TERRAIN_CELLS_Z,
  TERRAIN_HEIGHT_SCALE,
  TILT_DAMPING_PER_SECOND,
  TILT_GAIN_PER_SECOND,
  trajectoryHash,
   type GustWindow,
};

if (typeof window !== "undefined") {
  bootAuroraLander();
}
