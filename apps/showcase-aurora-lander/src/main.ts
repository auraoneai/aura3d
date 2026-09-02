/**
 * Aurora Lander — thrust-managed landing over a real static heightfield.
 *
 * First-use claims this route carries (all proven here, in-browser):
 *   - STATIC HEIGHTFIELD COLLIDER gameplay contact via `game.collisionWorld`
 *     (Rapier owns the solver; the heightfield is static-only by design).
 *   - BVH `createMeshSurfaceQuery` terrain reads every frame: altitude-above-ground,
 *     slope warnings and the touchdown attitude cross-check ask the triangles.
 *   - `game.inputReplay` export/import as a PLAYER-FACING ghost of your best run.
 *
 * Claim boundary: gravity/thrust/RCS are AUTHORED ARCADE VALUES integrated with a
 * deterministic fixed-step authored integrator. This route does NOT claim physical
 * simulation parity; Rapier witnesses contacts against the static terrain, it does
 * not own the lander's motion. Terrain is static-only procedural heightfield data,
 * not a named real-world location and not deformable.
 */
import {
  bindGameTouchControls,
  camera,
  createAuraApp,
  createMeshSurfaceQuery,
  effects,
  game,
  geometry,
  lights,
  material,
  model,
  primitives,
  scene,
  text3D,
  type AuraRuntimeNodeHandle,
  type GameInputController,
  type MeshSurfaceQuery,
  type SurfaceSample
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  SITES,
  TERRAIN_CELL_SIZE,
  campaignScore,
  type LanderSite
} from "./sites";
import { createTerrainField, sampleGridHeight, type TerrainField } from "./terrain";
import {
  createLanderState,
  gustForceAt,
  gustTelegraphActive,
  hspeedOf,
  stepLander,
  type Controls,
  type LanderState
} from "./lander";
import {
  HARD_TOUCHDOWN_MAX_VSPEED,
  LANDER_MAX_HULL,
  SOFT_TOUCHDOWN_MAX_VSPEED,
  gradeTouchdown,
  hullAfterTouchdown,
  scoreTouchdown,
  type LandingGrade
} from "./touchdown";
import { predictLanding, type LandingPrediction } from "./prediction";
import {
  createGhostPlayback,
  exportBestRun,
  importBestRun,
  loadBestRunRaw,
  saveBestRun,
  trajectoryHash,
  type GhostSample
} from "./ghost";
import { bindHud, showBanner, updateHud, type BannerKind, type HudBindings } from "./hud";
import { createLanderAudio, type LanderAudioCue, type LanderAudioController } from "./lander-audio";

// ---- authored presentation constants ----------------------------------------
/** Lander hero fits to this longest-axis size in scene units (meters). */
const LANDER_TARGET_SIZE = 2.2;
/** Contact-proxy sphere radius mirroring the lander's foot envelope. */
const CONTACT_PROXY_RADIUS = 0.42;
/** Vertical offset from lander origin down to its feet/contact plane. */
const FOOT_DROP = 0.72;
/** Fixed simulation step — the determinism contract for replay hashes. */
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;
/**
 * The opening approach is intentionally framed as a launch/deorbit hand-off:
 * a renderer-owned gantry sits under the typed lander while it is high above
 * the terrain.  It is visual set dressing only; the static heightfield and
 * pad sensors remain the gameplay authorities below.
 */
const APPROACH_SCAFFOLD_MIN_AGL = 28;
/** Replay bindings that constitute the recorded control stream. */
const RECORDED_BINDINGS = new Set(["KeyW", "ArrowUp", "KeyA", "ArrowLeft", "KeyD", "ArrowRight", "thrust"]);

type Phase = "flying" | "landed" | "crashed" | "campaign-clear";

/**
 * ?drop=1 spawns the lander 26 m directly above the primary pad with zero velocity:
 * a deterministic evidence approach that reaches the pad sensor zone and grades a
 * touchdown without human input. Gameplay is unchanged without the flag.
 */
const routeParams = new URLSearchParams(window.location.search);
const dropMode = routeParams.get("drop");
const visualReviewCapture = routeParams.get("capture") === "review";
document.body.dataset.capture = visualReviewCapture ? "review" : "default";
const dropEvidenceMode = dropMode === "1" || dropMode === "hard";
const hardDropEvidenceMode = dropMode === "hard";
// A human-playable close approach for mobile/touch evidence. Unlike `drop=1`,
// this changes only the spawn and never supplies controls to the integrator.
const approachEvidenceMode = routeParams.get("approach") === "1";
const requestedSite = Number(routeParams.get("site") ?? "1");
const initialSiteIndex = Number.isInteger(requestedSite)
  ? Math.max(0, Math.min(SITES.length - 1, requestedSite - 1))
  : 0;

// ---- accessibility + audio --------------------------------------------------
const accessibilitySettings = game.accessibility.settings([
  game.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;
const landerAudio: LanderAudioController = createLanderAudio(reducedMotion);

let audioUnlocked = false;
const unlockAudio = (): void => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  void landerAudio.unlock();
  void landerAudio.cue("ambient-wind");
};
window.addEventListener("keydown", unlockAudio, { once: true });
window.addEventListener("pointerdown", unlockAudio, { once: true });

let recentAudioCues: readonly string[] = [];
const playCue = (cue: LanderAudioCue): void => {
  if (!audioUnlocked) return;
  void landerAudio.cue(cue);
  recentAudioCues = [cue, ...recentAudioCues].slice(0, 12);
};

// ---- input -------------------------------------------------------------------
const input: GameInputController = game.input({
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

// ---- mutable route state -----------------------------------------------------
let siteIndex = 0;
let phase: Phase = "flying";
let paused = false;
let state: LanderState = createLanderState(SITES[0]!.spawn, SITES[0]!.fuelBudget);
let previousControls: Controls = { thrust: 0, rotate: 0 };
let siteScores: number[] = [];
let campaignHull = LANDER_MAX_HULL;
let lastGrade: LandingGrade | null = null;
let ghostVisible = true;
let ghostActive = false;
let attemptSamples: GhostSample[] = [];
let punchSecondsRemaining = 0;
let accumulator = 0;
let frameCount = 0;
let simSeconds = 0;
let terrainQueryCountWindow = 0;
let terrainQueryFps = 0;
let terrainQueryClock = 0;
let contactEventsSeen = 0;
let contactQueryAgreement: boolean | null = null;
let padSensorArmed = false;
let fuelLowCueFired = false;
let gustWarnCueFiredForCycle = false;
let thrustLoopActive = false;
let rcsPuffArmed = true;
let bannerTimer = 0;
let advanceTimer = -1;
let bestScoreThisSite = 0;
let crashDebris: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
let shockwaveAge = -1;
let latestPrediction: LandingPrediction | null = null;
let touchThrust = 0;

interface CollisionHandles {
  terrainId: string;
  sensorIds: string[];
  proxyId: string;
}
let collisions: CollisionHandles | undefined;

const collisionWorld = game.collisionWorld({
  backend: "rapier",
  gravity: [0, 0, 0]
});
let surfaceQuery: MeshSurfaceQuery | undefined;
let field: TerrainField | undefined;
let currentSite: LanderSite = SITES[0]!;

const ghostPlayback = createGhostPlayback();

// ---- node handles (re-required after every setScene) -------------------------
let landerNode!: AuraRuntimeNodeHandle;
let extractionLanderNode!: AuraRuntimeNodeHandle;
let ghostNode!: AuraRuntimeNodeHandle;
let ghostPlaybackNode: AuraRuntimeNodeHandle | undefined;
let plumeNode!: AuraRuntimeNodeHandle;
let shockwaveNode!: AuraRuntimeNodeHandle;
let auroraBands: AuraRuntimeNodeHandle[] = [];
let padLights: AuraRuntimeNodeHandle[] = [];
let dustNodes: AuraRuntimeNodeHandle[] = [];
let debrisNodes: AuraRuntimeNodeHandle[] = [];
let whiteoutNodes: AuraRuntimeNodeHandle[] = [];
let predictionNode!: AuraRuntimeNodeHandle;
let extractionNodes: AuraRuntimeNodeHandle[] = [];
let extractionInfrastructureNodes: AuraRuntimeNodeHandle[] = [];
let extractionBackdropNode!: AuraRuntimeNodeHandle;

interface ExtractionInfrastructurePart {
  readonly id: string;
  readonly offset: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: string;
  readonly emissive?: string;
  readonly metallic?: number;
}

/**
 * Renderer-owned extraction architecture around the typed final-site pad.
 * These are set dressing and navigation silhouettes, never the named hero.
 */
const EXTRACTION_INFRASTRUCTURE: readonly ExtractionInfrastructurePart[] = [
  { id: "bay-deck", offset: [0, 0.02, 0.25], scale: [12.6, 0.16, 10.8], color: "#34343a", metallic: 0.62 },
  { id: "bay-rear-wall", offset: [0, 2.8, -5.05], scale: [12.6, 5.6, 0.26], color: "#4b403c", emissive: "#241c1a" },
  { id: "bay-left-wall", offset: [-6.15, 1.9, -0.7], scale: [0.24, 3.8, 8.1], color: "#454248", emissive: "#1c2028" },
  { id: "bay-right-wall", offset: [6.15, 1.9, -0.7], scale: [0.24, 3.8, 8.1], color: "#454248", emissive: "#1c2028" },
  { id: "bay-ceiling-beam-left", offset: [-4.75, 5.45, -3.7], scale: [0.22, 0.22, 2.7], color: "#272b33", metallic: 0.78 },
  { id: "bay-ceiling-beam-right", offset: [4.75, 5.45, -3.7], scale: [0.22, 0.22, 2.7], color: "#272b33", metallic: 0.78 },
  { id: "rear-warm-band", offset: [0, 5.15, -4.86], scale: [10.8, 0.14, 0.08], color: "#ffd38a", emissive: "#f59e0b" },
  { id: "rear-cyan-band", offset: [0, 0.92, -4.84], scale: [8.8, 0.08, 0.08], color: "#9ff7ff", emissive: "#22d3ee" },
  { id: "gantry-left", offset: [-4.45, 2.15, -3.9], scale: [0.28, 4.3, 0.28], color: "#30343c", metallic: 0.72 },
  { id: "gantry-right", offset: [4.45, 2.15, -3.9], scale: [0.28, 4.3, 0.28], color: "#30343c", metallic: 0.72 },
  { id: "gantry-header", offset: [0, 4.32, -3.9], scale: [9.2, 0.28, 0.34], color: "#4b4b50", metallic: 0.78 },
  { id: "gantry-amber-left", offset: [-3.15, 4.33, -2.55], scale: [1.2, 0.13, 0.13], color: "#ffd166", emissive: "#f59e0b" },
  { id: "gantry-amber-right", offset: [3.15, 4.33, -2.55], scale: [1.2, 0.13, 0.13], color: "#ffd166", emissive: "#f59e0b" },
  { id: "service-left", offset: [-5.0, 0.62, 0.15], scale: [1.35, 1.22, 1.65], color: "#55545b", metallic: 0.42 },
  { id: "service-right", offset: [5.0, 0.58, -0.1], scale: [1.25, 1.12, 1.5], color: "#6b5548", metallic: 0.38 },
  { id: "service-cyan", offset: [-5.0, 1.25, 0.99], scale: [0.9, 0.08, 0.07], color: "#99f6e4", emissive: "#2dd4bf" },
  { id: "service-amber", offset: [5.0, 1.16, 0.66], scale: [0.82, 0.08, 0.07], color: "#fde68a", emissive: "#f59e0b" },
  { id: "conveyor-left", offset: [-2.05, 0.24, 2.65], scale: [0.32, 0.3, 5.6], color: "#13161c", metallic: 0.78 },
  { id: "conveyor-right", offset: [2.05, 0.24, 2.65], scale: [0.32, 0.3, 5.6], color: "#13161c", metallic: 0.78 },
  { id: "conveyor-center", offset: [0, 0.14, 2.65], scale: [3.45, 0.07, 5.6], color: "#555860", metallic: 0.66 },
  { id: "landing-plinth", offset: [0, 0.18, 0], scale: [3.75, 0.28, 3.75], color: "#292d35", metallic: 0.74 },
  { id: "plinth-warm-left", offset: [-1.91, 0.32, 0], scale: [0.08, 0.08, 3.2], color: "#ffd38a", emissive: "#f59e0b" },
  { id: "plinth-warm-right", offset: [1.91, 0.32, 0], scale: [0.08, 0.08, 3.2], color: "#ffd38a", emissive: "#f59e0b" },
  { id: "deck-seam-near", offset: [0, 0.12, 4.85], scale: [11.3, 0.025, 0.05], color: "#171a20", metallic: 0.82 },
  { id: "deck-seam-mid", offset: [0, 0.12, 3.35], scale: [11.3, 0.025, 0.05], color: "#171a20", metallic: 0.82 },
  { id: "deck-seam-pad", offset: [0, 0.12, 1.85], scale: [11.3, 0.025, 0.05], color: "#171a20", metallic: 0.82 },
  { id: "rear-rib-left", offset: [-3.65, 2.7, -4.78], scale: [0.12, 4.4, 0.1], color: "#22252b", metallic: 0.8 },
  { id: "rear-rib-center", offset: [0, 2.7, -4.78], scale: [0.12, 4.4, 0.1], color: "#22252b", metallic: 0.8 },
  { id: "rear-rib-right", offset: [3.65, 2.7, -4.78], scale: [0.12, 4.4, 0.1], color: "#22252b", metallic: 0.8 },
  { id: "machine-left-upper", offset: [-5.65, 2.75, -3.9], scale: [2.0, 2.8, 1.1], color: "#59616d", metallic: 0.56 },
  { id: "machine-right-upper", offset: [5.65, 2.75, -3.9], scale: [2.0, 2.8, 1.1], color: "#59616d", metallic: 0.56 },
  { id: "machine-left-screen", offset: [-5.65, 3.05, -3.3], scale: [1.3, 0.72, 0.08], color: "#a5f3fc", emissive: "#0891b2" },
  { id: "machine-right-screen", offset: [5.65, 3.05, -3.3], scale: [1.3, 0.72, 0.08], color: "#fde68a", emissive: "#f59e0b" },
  { id: "runway-left", offset: [-3.15, 0.16, 3.0], scale: [0.12, 0.08, 5.6], color: "#67e8f9", emissive: "#0891b2" },
  { id: "runway-right", offset: [3.15, 0.16, 3.0], scale: [0.12, 0.08, 5.6], color: "#67e8f9", emissive: "#0891b2" },
  { id: "threshold-left", offset: [-1.55, 0.17, 5.7], scale: [1.15, 0.1, 0.14], color: "#fef3c7", emissive: "#f59e0b" },
  { id: "threshold-right", offset: [1.55, 0.17, 5.7], scale: [1.15, 0.1, 0.14], color: "#fef3c7", emissive: "#f59e0b" }
];

// ---- evidence ---------------------------------------------------------------
const mountedEvidence = {
  schema: "aura3d-showcase-aurora-lander-evidence/1.0",
  appId: "showcase-aurora-lander",
  label: "prototype" as const,
  status: "loading",
  mounted: false,
  claimBoundary:
    "Authored arcade landing dynamics over a seeded static heightfield: Rapier provides real static-collider contact detection, createMeshSurfaceQuery provides terrain reads, and game.inputReplay powers the player-facing ghost. No physical-simulation parity, no deformable terrain, no orbital mechanics.",
  site: 1,
  siteName: SITES[0]!.name,
  fuel: 1,
  hull: 1,
  altitude: SITES[0]!.spawn.y,
  vspeed: 0,
  hspeed: 0,
  attitudeDeg: 0,
  state: "flying" as Phase | "paused",
  lastGrade: null as LandingGrade | null,
  ghostActive: false,
  ghostImportError: null as string | null,
  terrainQueryFps: 0,
  audioCues: [] as readonly string[],
  audio: landerAudio.proof(),
  reducedMotion,
  whiteoutDensity: SITES[0]!.whiteout,
  prediction: null as LandingPrediction | null,
  extractionTableau: false,
  gustForce: 0,
  gustTelegraph: false,
  whiteoutVisibleNodes: 0,
  completedSites: 0,
  renderer: { backend: "loading", drawCalls: 0, renderSize: [0, 0] as readonly number[] },
  systems: {
    input: "game.input",
    physics: "game.collisionWorld:Rapier(static-heightfield+sensors+contact-proxy)",
    terrainReads: "createMeshSurfaceQuery(BVH)",
    ghost: "game.inputReplay+export/import",
    dynamics: "authored-deterministic-integrator(non-physical)",
    audio: "engine.createGameAudio"
  },
  terrain: {
    colliderKind: "heightfield-static",
    rows: 0,
    columns: 0,
    cellSize: TERRAIN_CELL_SIZE,
    minHeight: 0,
    maxHeight: 0,
    surfaceQueryStats: { samples: 0, cacheHits: 0 }
  },
  touchdown: {
    softVSpeedLimit: SOFT_TOUCHDOWN_MAX_VSPEED,
    hardVSpeedLimit: HARD_TOUCHDOWN_MAX_VSPEED,
    contactEventSeen: false,
    contactQueryAgreement: null as boolean | null,
    lastCrashReason: ""
  },
  sites: SITES.map((entry) => ({ id: entry.id, name: entry.name, multiplier: entry.multiplier })),
  campaignScore: 0,
  primaryAssets: ["auroraLanderProbe", "auroraPadBeacon"],
  typedAssets: [
    { id: "auroraLanderProbe", typedRef: "assets.auroraLanderProbe", role: "primaryVehicle" },
    { id: "auroraPadBeacon", typedRef: "assets.auroraPadBeacon", role: "landingZoneProp" }
  ]
};

// Canonical gate global (route-gates convention) plus the PRD §8 alias —
// both names expose the SAME live object.
Object.defineProperty(window, "__AURA3D_SHOWCASE_AURORA_LANDER__", {
  get: () => mountedEvidence,
  configurable: true
});
Object.defineProperty(window, "__AURORA_LANDER_EVIDENCE__", {
  get: () => mountedEvidence,
  configurable: true
});

// ---- scene construction ------------------------------------------------------
function auroraBandNodes(entry: LanderSite) {
  const bands = [];
  const colors = [entry.auroraColor, "#818cf8", "#38bdf8", "#ec4899", "#34d399"];
  // Celestial gas giant with planetary ring in celestial backdrop
  bands.push(
    primitives.sphere({
      name: "celestial planet",
      material: material.pbr({
        name: "planet-surface",
        color: "#0f172a",
        emissive: "#0284c7",
        roughness: 0.5,
        metallic: 0.3
      })
    })
      .position(-36, 145, -65)
      .scale([14, 14, 14])
      .runtime(game.runtimeNode("celestial-planet", { tags: ["environment", "space"] })),
    primitives.torus({
      name: "planet ring",
      material: material.emissive({
        name: "ring-glow",
        color: "#ca8a04",
        emissive: "#f59e0b",
        opacity: 0.85
      })
    })
      .position(-36, 145, -65)
      .rotate(0.55, 0.35, 0.2)
      .scale([30, 30, 0.9])
      .runtime(game.runtimeNode("planet-ring", { tags: ["environment", "space"] }))
  );

  // Field of glowing stars
  const starPositions = [
    [-45, 155, -50], [35, 148, -48], [-18, 158, -54], [42, 132, -52],
    [-38, 122, -45], [20, 126, -42], [-48, 136, -55], [32, 156, -58],
    [-12, 142, -46], [26, 140, -50], [-28, 152, -52], [36, 120, -44],
    [-8, 118, -40], [12, 150, -48], [-52, 146, -56], [48, 138, -52]
  ];
  starPositions.forEach((pos, idx) => {
    bands.push(
      primitives.sphere({
        name: `star-${idx}`,
        material: material.emissive({
          name: `star-glow-${idx}`,
          color: idx % 2 === 0 ? "#bae6fd" : "#fef08a",
          emissive: idx % 2 === 0 ? "#38bdf8" : "#fbbf24"
        })
      })
        .position(pos[0]!, pos[1]!, pos[2]!)
        .scale([0.35, 0.35, 0.35])
        .runtime(game.runtimeNode(`star-${idx}`, { tags: ["environment", "stars"] }))
    );
  });

  // Aurora curtains
  for (let i = 0; i < 4; i += 1) {
    bands.push(
      primitives.box({
        name: `aurora band ${i + 1}`,
        material: material.emissive({
          name: `aurora glow ${i + 1}`,
          color: colors[i % colors.length]!,
          emissive: colors[i % colors.length]!,
          opacity: 0.35
        })
      })
        .position(-30 + i * 20, 130 + i * 6, -55 - i * 8)
        .rotate(0.22, i * 0.12, 0.05 * (i - 1))
        .scale([120, 8 + i * 2, 8])
        .runtime(game.runtimeNode(`aurora-band-${i + 1}`, { tags: ["environment", "aurora-band", "renderer-owned"] }))
    );
  }
  return bands;
}

interface SiteFieldEntry {
  readonly site: LanderSite;
  readonly field: TerrainField;
  readonly query: MeshSurfaceQuery;
}
const siteFields: SiteFieldEntry[] = [];

function buildWorldScene() {
  const builder = scene()
    .background("#0b1120")
    .addMany(auroraBandNodes(SITES[0]!));

  // Every site's world group is built up-front and toggled by visibility on site
  // change — no live scene swaps, so the renderer never rebuilds mid-session.
  SITES.forEach((nextSite, index) => {
    const nextField = createTerrainField({ site: nextSite });
    siteFields.push({
      site: nextSite,
      field: nextField,
      query: createMeshSurfaceQuery({ positions: nextField.queryPositions, indices: nextField.queryIndices })
    });
    const visible = index === 0;
    const prefix = `s${nextSite.id}`;
    const pad = nextSite.pads[0]!;
    const padHeight = nextField.padHeights[0] ?? 0;

    builder.add(
      geometry.custom(
        {
          kind: "aura-custom-geometry",
          positions: nextField.geometryPositions,
          normals: nextField.geometryNormals,
          indices: nextField.geometryIndices
        },
        {
          name: `${prefix} heightfield terrain`,
          material: material.pbr({
            name: `${prefix} regolith`,
            color: nextSite.terrainColor,
            roughness: 0.94,
            metallic: 0.02
          }),
          receiveShadow: true
        }
      )
        .position(0, 0, 0)
        .runtime(game.runtimeNode(`${prefix}-terrain`, { tags: ["world", "static-heightfield-terrain", "authored-procedural", visible ? "active-site" : "parked-site"] }))
    );

    builder.add(
      primitives.torus({
        name: `${prefix} pad zone ring`,
        material: material.emissive({ name: `${prefix} ring glow`, color: "#5eead4", emissive: "#2dd4bf", opacity: 0.9 })
      })
        .position(pad.x, padHeight + 0.09, pad.z)
        .rotate(Math.PI / 2, 0, 0)
        .scale([
          pad.radius * (visualReviewCapture ? 1.28 : 2.05),
          pad.radius * (visualReviewCapture ? 1.28 : 2.05),
          visualReviewCapture ? 0.16 : 0.3
        ])
        .runtime(game.runtimeNode(`${prefix}-pad-ring`, { tags: ["pad", "zone-marker", "renderer-owned"] }))
    );

    builder.add(
      model(assets.auroraPadBeacon, {
        name: `${prefix} beacon left`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.9,
        castShadow: true,
        visible
      })
        .position(pad.x - pad.radius - 1.4, padHeight, pad.z + pad.radius + 1.2)
        .runtime(game.runtimeNode(`${prefix}-beacon-left`, { tags: ["pad", "typed-prop"] }))
    );
    builder.add(
      model(assets.auroraPadBeacon, {
        name: `${prefix} beacon right`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 1.9,
        castShadow: true,
        visible
      })
        .position(pad.x + pad.radius + 1.4, padHeight, pad.z - pad.radius - 1.2)
        .runtime(game.runtimeNode(`${prefix}-beacon-right`, { tags: ["pad", "typed-prop"] }))
    );

    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      builder.add(
        primitives.sphere({
          name: `${prefix} pad approach light ${i + 1}`,
          material: material.emissive({ name: `${prefix} approach glow ${i + 1}`, color: "#a7f3d0", emissive: "#34d399", opacity: 0.9 })
        })
          .position(pad.x + Math.cos(angle) * (pad.radius + 1.7), padHeight + 0.5, pad.z + Math.sin(angle) * (pad.radius + 1.7))
          .scale(visible ? 0.22 : 0.001)
          .runtime(game.runtimeNode(`${prefix}-pad-light-${i + 1}`, { tags: ["pad", "approach-lights", "renderer-owned"] }))
      );
    }

    // text3D site marker above the pad — real depth-bearing geometry, not a DOM label.
    builder.add(
      text3D(`SITE ${nextSite.id}`, { size: 0.7, depth: 0.18 })
        .position(pad.x - 2.2, padHeight + 2.4, pad.z - 3.3)
        .rotate(0.42, 0.78, 0)
        .runtime(game.runtimeNode(`${prefix}-marker`, { tags: ["site-marker", "text3d"] }))
    );
  });

  // Hero lander + translucent replay ghost are GLOBAL across sites.
  const firstSpawn = SITES[0]!.spawn;
  builder.add(
    model(assets.auroraLanderProbe, {
      name: "aurora lander probe",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: LANDER_TARGET_SIZE,
      castShadow: true,
      receiveShadow: true
    })
      .position(firstSpawn.x, firstSpawn.y, firstSpawn.z)
      .runtime(game.runtimeNode("lander", { tags: ["player", "lander", "typed-primary-asset"] }))
  );
  builder.add(
    model(assets.auroraExtractionLanderHero, {
      name: "aurora extraction lander presentation",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 2.8,
      visible: visualReviewCapture,
      castShadow: false,
      receiveShadow: false
    })
      .position(0, -50, 0)
      .runtime(game.runtimeNode("extraction-lander", {
        tags: ["player-presentation", "typed-primary-asset", "campaign-clear", "non-colliding"]
      }))
  );
  builder.add(
    model(assets.auroraLanderProbe, {
      name: "replay ghost",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: LANDER_TARGET_SIZE,
      visible: false,
      material: material.pbr({ name: "ghost translucency", color: "#7dd3fc", roughness: 0.4, opacity: 0.32 })
    })
      .position(firstSpawn.x, firstSpawn.y, firstSpawn.z)
      .runtime(game.runtimeNode("lander-ghost", { tags: ["ghost", "visual-only", "input-replay"] }))
  );

  // Thrust plume: stretched emissive sphere under the skirt, scaled by throttle.
  builder.add(
    primitives.sphere({
      name: "thrust plume",
      material: material.emissive({ name: "plume glow", color: "#fde68a", emissive: "#f59e0b", opacity: 0.75 })
    })
      .position(0, -50, 0)
      .scale(0.001)
      .runtime(game.runtimeNode("thrust-plume", { tags: ["vehicle-feedback", "plume", "renderer-owned"] }))
  );
  for (let i = 0; i < 12; i += 1) {
    builder.add(
      primitives.sphere({
        name: `surface dust ${i + 1}`,
        material: material.pbr({ name: `dust puff ${i + 1}`, color: "#b8c4c2", roughness: 1, opacity: 0.4 })
      })
        .position(0, -50, 0)
        .scale(0.001)
        .runtime(game.runtimeNode(`dust-${i + 1}`, { tags: ["vehicle-feedback", "dust", "renderer-owned"] }))
    );
  }
  for (let i = 0; i < 10; i += 1) {
    builder.add(
      primitives.box({
        name: `crash debris ${i + 1}`,
        material: material.pbr({ name: `debris shard ${i + 1}`, color: "#57606a", roughness: 0.8 })
      })
        .position(0, -50, 0)
        .scale(0.18)
        .runtime(game.runtimeNode(`debris-${i + 1}`, { tags: ["crash-feedback", "debris", "renderer-owned"] }))
    );
  }
  builder.add(
    primitives.torus({
      name: "impact shockwave",
      material: material.emissive({ name: "shockwave glow", color: "#fca5a5", emissive: "#ef4444", opacity: 0.7 })
    })
      .position(0, -50, 0)
      .scale(0.001)
      .runtime(game.runtimeNode("impact-shockwave", { tags: ["crash-feedback", "renderer-owned"] }))
  );

  builder.add(
    primitives.torus({
      name: "bounded landing estimate",
      material: material.emissive({ name: "prediction marker glow", color: "#fde68a", emissive: "#fbbf24", opacity: 0.82 })
    })
      .position(0, -50, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([1.15, 1.15, 0.08])
      .runtime(game.runtimeNode("landing-prediction", { tags: ["prediction", "bounded-estimate", "renderer-owned"] }))
  );

  // Renderer-owned weather points. Their deterministic wrapping is driven by
  // the current site's whiteout density and gust state in renderUpdate().
  for (let i = 0; i < 72; i += 1) {
    builder.add(
      primitives.sphere({
        name: `whiteout snow ${i + 1}`,
        material: material.emissive({ name: `snow flake ${i + 1}`, color: "#e0f2fe", emissive: "#bae6fd", opacity: 0.44 })
      })
        .position(0, -50, 0)
        .scale(0.035)
        .runtime(game.runtimeNode(`whiteout-${i + 1}`, { tags: ["weather", "whiteout", "renderer-owned"] }))
    );
  }

  builder.add(
    text3D(visualReviewCapture ? "EXTRACTION BAY" : "EXTRACTION READY", {
      size: visualReviewCapture ? 0.58 : 2.1,
      depth: visualReviewCapture ? 0.16 : 0.35
    })
      .position(0, -50, 0)
      .runtime(game.runtimeNode("extraction-title", { tags: ["campaign-clear", "extraction-tableau", "renderer-owned"] }))
  );
  builder.add(
    primitives.torus({
      name: "extraction halo",
      material: material.emissive({ name: "extraction halo glow", color: "#fef3c7", emissive: "#fbbf24", opacity: 0.9 })
    })
      .position(0, -50, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale(visualReviewCapture ? [2.6, 2.6, 0.1] : [5.5, 5.5, 0.18])
      .runtime(game.runtimeNode("extraction-halo", { tags: ["campaign-clear", "extraction-tableau", "renderer-owned"] }))
  );

  // The exact review lens uses a project-original typed environment plate for
  // material depth. It is non-colliding background set dressing only: the live
  // typed lander, Rapier contacts, terrain queries, pad state, and campaign
  // progression remain the gameplay authorities.
  builder.add(
    model(assets.auroraExtractionBayBackdrop, {
      name: "aurora extraction bay backdrop",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 50
    })
      .position(0, -50, 0)
      .runtime(game.runtimeNode("extraction-bay-backdrop", {
        tags: ["campaign-clear", "typed-environment", "background", "non-colliding"]
      }))
  );

  EXTRACTION_INFRASTRUCTURE.forEach((part) => {
    const partMaterial = part.emissive
      ? material.emissive({
        name: `${part.id} extraction practical`,
        color: part.color,
        emissive: part.emissive,
        opacity: 0.94
      })
      : material.pbr({
        name: `${part.id} extraction structure`,
        color: part.color,
        roughness: 0.48,
        metallic: part.metallic ?? 0.35
      });
    builder.add(
      primitives.box({
        name: `extraction ${part.id}`,
        material: partMaterial,
        castShadow: true,
        receiveShadow: true
      })
        .position(0, -50, 0)
        .scale(part.scale)
        .runtime(game.runtimeNode(`extraction-${part.id}`, {
          tags: ["campaign-clear", "extraction-infrastructure", "renderer-owned", "set-dressing"]
        }))
    );
  });

  // Shared night lighting: one neutral aurora grade that reads across all three
  // sites so no live scene swaps are ever needed.
  builder
    .add(effects.fog({ name: "valley haze", color: "#0b1120", density: 0.0021, intensity: 0.42 }))
    .add(lights.ambient({ name: "aurora sky fill", color: "#67e8f9", intensity: 0.95 }))
    .add(lights.directional({ name: "moonlight key", color: "#d9e4fb", intensity: 2.1 }).position(-38, 62, -22))
    .add(lights.directional({ name: "rim light", color: "#5eead4", intensity: 1.05 }).position(30, 40, 36))
    .add(lights.point({
      name: "final extraction warm practical",
      color: "#ffb454",
      intensity: visualReviewCapture ? 9.2 : 2.2
    }).position(SITES[2]!.pads[0]!.x - 3.8, 5.6, SITES[2]!.pads[0]!.z + 2.2))
    .add(lights.point({
      name: "final extraction cyan practical",
      color: "#67e8f9",
      intensity: visualReviewCapture ? 5.6 : 1.8
    }).position(SITES[2]!.pads[0]!.x + 4.2, 3.4, SITES[2]!.pads[0]!.z - 1.8))
    .camera(camera.follow({
      targetNode: "lander",
      distance: visualReviewCapture ? 10.6 : 17,
      offset: visualReviewCapture ? [6.8, 5.9, 8.25] : [0, 7.5, 14.5],
      targetOffset: visualReviewCapture ? [0, -0.55, -0.65] : [0, 0, 0],
      fov: visualReviewCapture ? 46 : 58,
      smoothing: visualReviewCapture ? 0 : 0.14
    }));

  return builder;
}

// ---- app mount ---------------------------------------------------------------
const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildWorldScene()
});
void app;

function requireNode(name: string): AuraRuntimeNodeHandle {
  return app.nodes.require(name) as AuraRuntimeNodeHandle;
}

interface SiteGroupHandles {
  nodes: AuraRuntimeNodeHandle[];
  padLights: AuraRuntimeNodeHandle[];
}
const siteGroups: SiteGroupHandles[] = [];

function captureNodeHandles(): void {
  landerNode = requireNode("lander");
  extractionLanderNode = requireNode("extraction-lander");
  ghostNode = requireNode("lander-ghost");
  plumeNode = requireNode("thrust-plume");
  shockwaveNode = requireNode("impact-shockwave");
  predictionNode = requireNode("landing-prediction");
  auroraBands = [1, 2, 3].map((i) => requireNode(`aurora-band-${i}`));
  dustNodes = Array.from({ length: 12 }, (_, i) => requireNode(`dust-${i + 1}`));
  debrisNodes = Array.from({ length: 10 }, (_, i) => requireNode(`debris-${i + 1}`));
  whiteoutNodes = Array.from({ length: 72 }, (_, i) => requireNode(`whiteout-${i + 1}`));
  extractionNodes = [requireNode("extraction-title"), requireNode("extraction-halo")];
  extractionBackdropNode = requireNode("extraction-bay-backdrop");
  extractionInfrastructureNodes = EXTRACTION_INFRASTRUCTURE.map((part) => requireNode(`extraction-${part.id}`));
  extractionInfrastructureNodes.forEach((node) => node.setVisible(false));
  ghostPlaybackNode = ghostNode;

  SITES.forEach((site, index) => {
    const prefix = `s${site.id}`;
    const nodes = [
      requireNode(`${prefix}-terrain`),
      requireNode(`${prefix}-pad-ring`),
      requireNode(`${prefix}-beacon-left`),
      requireNode(`${prefix}-beacon-right`),
      requireNode(`${prefix}-marker`)
 ];
    const lights = [1, 2, 3, 4].map((i) => requireNode(`${prefix}-pad-light-${i}`));
    siteGroups[index] = { nodes: [...nodes, ...lights], padLights: lights };
    // Only the active site renders; every other group parks hidden.
    const isActive = index === siteIndex;
    [...nodes, ...lights].forEach((handle) => handle.setVisible(isActive));
 });
  padLights = siteGroups[siteIndex]!.padLights;
}

// ---- collision world per site -------------------------------------------------
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
  // Dynamic contact proxy: driven from the authored pose each step so the solver
  // witnesses REAL contacts against the static heightfield while motion stays authored.
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

// ---- attempt lifecycle ---------------------------------------------------------
function resetAttempt(recordGhostStart = true): void {
  phase = "flying";
  paused = false;
  lastGrade = null;
  state = spawnStateFor(currentSite);
  previousControls = { thrust: 0, rotate: 0 };
  accumulator = 0;
  simSeconds = 0;
  latestPrediction = null;
  attemptSamples = [];
  punchSecondsRemaining = 0;
  advanceTimer = -1;
  fuelLowCueFired = false;
  crashDebris = [];
  shockwaveAge = -1;
  input.clearReplay();
  touchThrust = 0;
  const touchThrustControl = document.getElementById("touch-thrust") as HTMLInputElement | null;
  if (touchThrustControl) touchThrustControl.value = "0";
  if (recordGhostStart) beginGhostFromBest();
  rebuildCollisions();
  showBanner(hud, null, "");
  debrisNodes.forEach((node) => {
    node.setPosition(0, -50, 0);
    node.setScale(0.001);
  });
  shockwaveNode.setPosition(0, -50, 0);
  shockwaveNode.setScale(0.001);
  predictionNode.setPosition(0, -50, 0);
  extractionNodes.forEach((node) => {
    node.setPosition(0, -50, 0);
    node.setVisible(false);
  });
  extractionBackdropNode.setPosition(0, -50, 0);
  extractionBackdropNode.setVisible(false);
  extractionLanderNode.setPosition(0, -50, 0);
  extractionLanderNode.setVisible(false);
}

function loadSite(index: number): void {
  // Visibility swap only — the world scene is built once, so the renderer never
  // rebuilds mid-session.
  const previous = siteGroups[siteIndex];
  if (previous) previous.nodes.forEach((handle) => handle.setVisible(false));
  siteIndex = index;
  bestScoreThisSite = 0;
  const entry = siteFields[index]!;
  currentSite = entry.site;
  field = entry.field;
  surfaceQuery = entry.query;
  const nextGroup = siteGroups[index]!;
  nextGroup.nodes.forEach((handle) => handle.setVisible(true));
  padLights = nextGroup.padLights;
  updatePanelBrief();
  resetAttempt();
}

/** Spawn state for this site, honoring the ?drop=1 evidence approach. */
function spawnStateFor(site: LanderSite): LanderState {
  if (!dropEvidenceMode && !approachEvidenceMode) return createLanderState(site.spawn, site.fuelBudget);
  const pad = site.pads[0]!;
  const activeField = siteFields.find((entry) => entry.site.id === site.id)?.field;
  const padHeight = activeField?.padHeights[0] ?? 0;
  return createLanderState({ x: pad.x, y: padHeight + 26, z: pad.z }, site.fuelBudget);
}

/** Begin ghost playback from the stored best run for this site, if one exists. */
function beginGhostFromBest(): void {
  ghostActive = false;
  const raw = loadBestRunRaw(currentSite.id);
  if (!raw) {
    ghostPlayback.stop();
    if (ghostPlaybackNode) ghostPlaybackNode.setVisible(false);
    return;
  }
  try {
    const imported = importBestRun(raw);
    ghostPlayback.begin(imported.replay, spawnStateFor(currentSite), currentSite.gust);
    ghostActive = true;
    if (ghostPlaybackNode && ghostVisible) ghostPlaybackNode.setVisible(true);
  } catch (error) {
    mountedEvidence.ghostImportError = error instanceof Error ? error.message : String(error);
    ghostActive = false;
  }
}

/** Persist a graded landing as the site's best run when it beats the previous score. */
function maybeRecordBestRun(samples: GhostSample[], grade: LandingGrade, score: number): void {
  if (grade === "crash" || score <= bestScoreThisSite) return;
  bestScoreThisSite = score;
  const events = input
    .recorded()
    .filter((eventItem) => RECORDED_BINDINGS.has(eventItem.binding))
    .map((eventItem) => ({ ...eventItem }));
  const replay = game.inputReplay(events, { fps: 60, seed: 0x5e_ed, label: `aurora-lander-site-${currentSite.id}-best` });
  const attempt = { siteId: currentSite.id, events, samples };
  saveBestRun(currentSite.id, exportBestRun(attempt, replay, grade, score));
}

// ---- HUD + panel ---------------------------------------------------------------
const hud: HudBindings = bindHud(document.getElementById("hud"));

function updatePanelBrief(): void {
  const brief = document.getElementById("panel-site-brief");
  if (!brief) return;
  brief.textContent = `Site ${currentSite.id} — ${currentSite.name}: land inside the ringed pad zone. Fuel budget ${currentSite.fuelBudget}s at full burn.${currentSite.gust ? " STORM FRONTS: telegraphed lateral gusts." : ""}`;
}

function setupPanel(): void {
  const panel = document.getElementById("panel");
  if (!panel) throw new Error("Aurora Lander panel #panel is missing.");
  panel.innerHTML = `
    <h1>AURORA LANDER</h1>
    <div class="prototype-tag">prototype · authored arcade dynamics</div>
    <h2>Site briefing</h2>
    <p id="panel-site-brief"></p>
    <h2>Controls</h2>
    <ul>
      <li><kbd>W</kbd>/<kbd>↑</kbd> main thrust</li>
      <li><kbd>A</kbd>/<kbd>D</kbd> rotate (RCS puffs)</li>
      <li><kbd>Space</kbd>/<kbd>R</kbd> quick-restart site</li>
      <li><kbd>G</kbd> ghost overlay · <kbd>P</kbd> pause</li>
    </ul>
    <h2>Touch</h2>
    <div class="touch-controls">
      <input id="touch-thrust" class="touch-slider" type="range" min="0" max="1" step="0.05" value="0" aria-label="Thrust slider" />
      <span></span>
      <span></span>
      <button id="touch-left" class="touch-button">◀ RCS</button>
      <button id="touch-right" class="touch-button">RCS ▶</button>
    </div>
    <div class="touch-controls">
      <button id="touch-ghost" class="touch-button">Ghost (G)</button>
      <button id="touch-pause" class="touch-button">Pause (P)</button>
      <button id="touch-restart" class="touch-button">Restart (R)</button>
      <span></span>
      <span></span>
    </div>
    <h2>Grading</h2>
    <table class="score-table">
      <tr><td>Soft touchdown (&lt;${SOFT_TOUCHDOWN_MAX_VSPEED} m/s)</td><td>1000 × fuel × site</td></tr>
      <tr><td>Hard touchdown (&lt;${HARD_TOUCHDOWN_MAX_VSPEED} m/s)</td><td>400 × fuel × site</td></tr>
      <tr><td>Attitude &gt;12° · off-zone · slope</td><td>crash</td></tr>
    </table>
    <h2>Campaign</h2>
    <p id="panel-campaign">${SITES.map((entry) => `Site ${entry.id} ${entry.name} ×${entry.multiplier}`).join(" · ")}</p>
    <p class="prototype-tag">Static heightfield terrain (non-deformable). Gravity/thrust are authored arcade values — not a physical simulation.</p>
  `;

  updatePanelBrief();

  // Touch controls: hold-to-fire bindings through the same input plan.
  bindGameTouchControls({
    hold: [
      { elementId: "touch-left", code: "KeyA" },
      { elementId: "touch-right", code: "KeyD" }
    ],
    pulse: [{ elementId: "touch-restart", code: "KeyR" }]
  });
  const thrustSlider = document.getElementById("touch-thrust") as HTMLInputElement | null;
  const readTouchThrust = (): void => {
    touchThrust = Math.max(0, Math.min(1, Number(thrustSlider?.value ?? 0)));
  };
  thrustSlider?.addEventListener("input", readTouchThrust);
  thrustSlider?.addEventListener("change", readTouchThrust);
  const ghostButton = document.getElementById("touch-ghost");
  ghostButton?.addEventListener("click", () => toggleGhost());
  const pauseButton = document.getElementById("touch-pause");
  pauseButton?.addEventListener("click", () => togglePause());
}

// ---- grading --------------------------------------------------------------------
interface GradingContext {
  readonly vspeed: number;
  readonly hspeed: number;
  readonly attitudeDeg: number;
  readonly slopeDeg: number;
  readonly insidePadZone: boolean;
  readonly sample: SurfaceSample;
}

/**
 * Grade a touchdown from the contact event plus surface-query cross-check:
 * the solver says WHERE the feet met terrain; the BVH query confirms the pad
 * normal and zone independently.
 */
function gradeFromContact(context: GradingContext): void {
  const graded = gradeTouchdown({
    vspeed: context.vspeed,
    hspeed: context.hspeed,
    attitudeDeg: context.attitudeDeg,
    insidePadZone: context.insidePadZone,
    slopeDeg: context.slopeDeg
  });
  lastGrade = graded.grade;
  campaignHull = hullAfterTouchdown(campaignHull, graded.grade);
  mountedEvidence.touchdown.lastCrashReason = graded.crashReason;

  if (graded.grade === "crash") {
    phase = "crashed";
    playCue("crash");
    showBanner(hud, "grade-crash", `CRASH — ${graded.crashReason}. Press R to restart expedition.`);
    bannerTimer = 4;
    spawnCrashDebris();
    punchSecondsRemaining = reducedMotion ? 0 : 0.42;
    return;
  }

  const breakdown = scoreTouchdown({
    grade: graded.grade,
    basePoints: graded.basePoints,
    fuelFraction: state.fuel / currentSite.fuelBudget,
    siteMultiplier: currentSite.multiplier
  });
  siteScores[siteIndex] = Math.max(siteScores[siteIndex] ?? 0, breakdown.total);
  mountedEvidence.campaignScore = campaignScore(SITES.map((_, index) => siteScores[index] ?? 0));
  playCue(graded.grade === "soft" ? "touch-soft" : "touch-hard");
  void landerAudio.cue("site-clear");
  recentAudioCues = ["site-clear", ...recentAudioCues].slice(0, 12);
  maybeRecordBestRun(attemptSamples, graded.grade, breakdown.total);

  const isLastSite = siteIndex >= SITES.length - 1;
  phase = isLastSite ? "campaign-clear" : "landed";
  advanceTimer = isLastSite ? -1 : 1.8;
  showBanner(
    hud,
    graded.grade === "soft" ? "grade-soft" : "grade-hard",
    isLastSite
      ? `CAMPAIGN CLEAR — final score ${mountedEvidence.campaignScore}`
      : `${graded.grade.toUpperCase()} LANDING +${breakdown.total} — next site in a moment…`
  );
  bannerTimer = isLastSite ? 8 : 3;
}

function spawnCrashDebris(): void {
  if (!field) return;
  const ground = sampleGridHeight(field, state.x, state.z);
  crashDebris = debrisNodes.map((_, index) => ({
    x: state.x,
    y: ground + 0.3,
    z: state.z,
    vx: Math.cos((index / debrisNodes.length) * Math.PI * 2) * (2 + (index % 3)),
    vy: 3 + (index % 4),
    vz: Math.sin((index / debrisNodes.length) * Math.PI * 2) * (2 + (index % 3)),
    life: 1
  }));
  shockwaveAge = reducedMotion ? -1 : 0;
  if (!reducedMotion) shockwaveNode.setPosition(state.x, ground + 0.25, state.z);
}

// ---- fixed-step simulation tick --------------------------------------------------
function readControls(): Controls {
  const thrust = Math.max(input.held("thrust") ? 1 : 0, touchThrust);
  const rotate = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
  return { thrust, rotate };
}

let dustCursor = 0;

function tick(dtFixed: number): void {
  frameCount += 1;
  if (paused || phase !== "flying") return;
  simSeconds += dtFixed;

  // Edge-driven audio before integration.
  const controls = readControls();
  // Evidence-only approach autopilot (?drop=1): tracks a sinking rate schedule
  // (-0.6 m/s near the deck) so grading, sensor and audio paths run without human
  // input and the scripted approach touches down softly on the pad.
  let effectiveControls = controls;
  if (dropEvidenceMode && field) {
    const ground = sampleGridHeight(field, state.x, state.z);
    const agl = state.y - FOOT_DROP - ground;
    const pad = currentSite.pads[0]!;
    const lateralCorrection = Math.max(-1, Math.min(1, (pad.x - state.x) * 0.34 - state.vx * 0.5));
    effectiveControls = {
      thrust: 0,
      rotate: agl < 6 ? 0 : lateralCorrection
    };
    if (agl < 22) {
      const desiredVy = hardDropEvidenceMode
        ? -3.05
        : -Math.max(0.6, Math.min(2.2, agl * 0.16));
      const vyError = desiredVy - state.vy;
      effectiveControls = {
        thrust: Math.min(1, Math.max(0, 0.52 + vyError * 0.32)),
        // Stop commanding lateral RCS near the deck so the same authored
        // self-righting path available to the player can meet the 12° limit.
        rotate: agl < 6 ? 0 : lateralCorrection
      };
    }
  }
  previousControls = effectiveControls;
  state = stepLander(state, effectiveControls, dtFixed, currentSite.gust);
  if (controls.thrust > 0 && !thrustLoopActive) {
    thrustLoopActive = true;
    playCue("thrust-loop");
  } else if (controls.thrust === 0 && thrustLoopActive) {
    thrustLoopActive = false;
  }
  const rotating = Math.abs(controls.rotate) > 0.05;
  if (rotating && rcsPuffArmed) {
    rcsPuffArmed = false;
    playCue("rcs-puff");
  } else if (!rotating) {
    rcsPuffArmed = true;
  }
  const fuelFraction = state.fuel / currentSite.fuelBudget;
    if (!fuelLowCueFired && fuelFraction <= 0.2 && fuelFraction > 0) {
    fuelLowCueFired = true;
    playCue("fuel-low");
  }

  // Storm-front telegraph: the warn cue fires when the telegraph window opens,
  // which the gust math guarantees precedes any applied lateral force.
  if (gustTelegraphActive(currentSite.gust, simSeconds)) {
    if (!gustWarnCueFiredForCycle) {
      gustWarnCueFiredForCycle = true;
      playCue("gust-warn");
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

  // Terrain reads via BVH surface query — every frame, counted for evidence.
  let sample: SurfaceSample | undefined;
  if (surfaceQuery) {
    sample = surfaceQuery.sample(state.x, state.z);
    terrainQueryCountWindow += 1;
  }

  for (const eventItem of events) {
    const involvesProxy = eventItem.a.id === collisions?.proxyId || eventItem.b.id === collisions?.proxyId;
    if (!involvesProxy || eventItem.type !== "begin") continue;
    contactEventsSeen += 1;
    const other = eventItem.a.id === collisions?.proxyId ? eventItem.b : eventItem.a;
    const partnerIsSensor = other.sensor || (collisions?.sensorIds.includes(other.id) ?? false);
    if (partnerIsSensor && !padSensorArmed) {
      padSensorArmed = true;
      playCue("pad-lock");
    }
    if (phase !== "flying" || !field || !surfaceQuery || !sample) continue;

    // Cross-check: solver contact normal vs BVH surface normal at the same point.
    const queryNormal = surfaceQuery.sampleNormal(state.x, state.z);
    contactQueryAgreement = Math.abs(queryNormal[1] - eventItem.normal[1]) < 0.25;
    mountedEvidence.touchdown.contactQueryAgreement = contactQueryAgreement;
    mountedEvidence.touchdown.contactEventSeen = true;

    // Attitude: lander up tilted toward heading vs pad/terrain normal.
    const tiltRad = (state.tiltDeg * Math.PI) / 180;
    const yawRad = state.yaw;
    const upX = Math.sin(tiltRad) * -Math.sin(yawRad);
    const upY = Math.cos(tiltRad);
    const upZ = Math.sin(tiltRad) * -Math.cos(yawRad);
    const dot = upX * queryNormal[0] + upY * queryNormal[1] + upZ * queryNormal[2];
    const attitudeDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    const slopeDeg = (Math.acos(Math.max(-1, Math.min(1, queryNormal[1]))) * 180) / Math.PI;

    // Zone check: inside a pad circle horizontally AND near its plateau height.
    const feetY = state.y - FOOT_DROP;
    const insidePadZone = currentSite.pads.some((pad, index) => {
      const padHeight = field!.padHeights[index] ?? 0;
      const within = Math.hypot(state.x - pad.x, state.z - pad.z) <= pad.radius;
      return within && Math.abs(feetY - padHeight) < 1.5;
    }) || partnerIsSensor && Math.abs(state.vy) < HARD_TOUCHDOWN_MAX_VSPEED + 6;

    gradeFromContact({
      vspeed: Math.abs(state.vy),
      hspeed: hspeedOf(state),
      attitudeDeg,
      slopeDeg,
      insidePadZone,
      sample
    });
  }

  // Ghost playback follows the SAME deterministic integrator.
  if (ghostActive && ghostPlaybackNode) {
    const playback = ghostPlayback.step(dtFixed);
    ghostPlaybackNode.setPosition(playback.state.x, playback.state.y, playback.state.z);
    ghostPlaybackNode.setRotation(0, playback.state.yaw, (playback.state.tiltDeg * Math.PI) / 180);
    if (playback.complete) {
      ghostPlayback.stop();
      ghostActive = false;
      ghostPlaybackNode.setVisible(false);
    }
  }
}

// ---- control keys ---------------------------------------------------------------
function toggleGhost(): void {
  ghostVisible = !ghostVisible;
  if (ghostPlaybackNode) {
    ghostPlaybackNode.setVisible(ghostVisible && ghostActive);
  }
}

function togglePause(): void {
  paused = !paused;
  mountedEvidence.state = paused ? "paused" : phase;
}

function handleControlEdges(): void {
  const restartRequested = input.pressed("restart") || input.pressed("quickRestart");
  if (restartRequested) {
    if (phase === "campaign-clear" || phase === "crashed") {
      siteScores = [];
      mountedEvidence.campaignScore = 0;
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

// ---- per-frame render update ------------------------------------------------------
function renderUpdate(dtFrame: number): void {
  if (!field) return;

  // Crash camera punch: a decaying vertical jolt through the FOLLOWED node, so the
  // declarative follow camera itself jolts. Reduced-motion gates it entirely.
  let punchOffsetY = 0;
  if (punchSecondsRemaining > 0) {
    punchSecondsRemaining = Math.max(0, punchSecondsRemaining - dtFrame);
    punchOffsetY = Math.sin(punchSecondsRemaining * 46) * 0.22 * punchSecondsRemaining;
  }
  landerNode.setPosition(state.x, state.y + punchOffsetY, state.z);
  landerNode.setRotation(0, state.yaw, (state.tiltDeg * Math.PI) / 180);

  // Plume: visible thrust flame scaled by throttle while the engine burns.
  const groundHere = sampleGridHeight(field, state.x, state.z);
  const altitudeAboveGround = state.y - FOOT_DROP - groundHere;
  const burning = phase === "flying" && !paused && previousControls.thrust > 0 && state.fuel > 0;
  const plumeScale = burning ? 0.5 + previousControls.thrust * 0.7 : 0.001;
  plumeNode.setPosition(state.x - Math.sin(state.yaw) * 0.1, state.y - FOOT_DROP * 1.35, state.z - Math.cos(state.yaw) * 0.1);
  plumeNode.setScale([plumeScale * 0.45, plumeScale * 2.4, plumeScale * 0.45]);

  // Bounded estimate: recomputed from the current pose/control state, using the
  // same authored integrator and terrain sampler as gameplay. It never grades a
  // landing and disappears outside active flight.
  if (phase === "flying" && (latestPrediction === null || frameCount % 6 === 0)) {
    latestPrediction = predictLanding(
      state,
      previousControls,
      (x, z) => sampleGridHeight(field!, x, z),
      FOOT_DROP,
      currentSite.gust
    );
  }
  if (phase === "flying" && latestPrediction) {
    predictionNode.setVisible(true);
    predictionNode.setPosition(latestPrediction.x, latestPrediction.y, latestPrediction.z);
    predictionNode.setScale(latestPrediction.reachedSurface ? [1.15, 1.15, 0.08] : [0.72, 0.72, 0.06]);
  } else {
    predictionNode.setVisible(false);
  }

  // Site-owned whiteout. Reduced motion freezes the flakes into a readable
  // depth field; it does not remove the weather or gust/contact information.
  const whiteoutCount = Math.round(whiteoutNodes.length * currentSite.whiteout);
  const weatherTime = reducedMotion ? 0 : simSeconds;
  const gustOffset = currentSite.gust ? Math.sin(weatherTime * 0.7) * currentSite.gust.amplitude * 2 : 0;
  whiteoutNodes.forEach((node, index) => {
    const visible = index < whiteoutCount && phase !== "campaign-clear";
    node.setVisible(visible);
    if (!visible) return;
    const lane = (index * 37) % 72;
    const x = state.x + (((lane * 17) % 41) - 20) * 0.55 + gustOffset;
    const y = state.y + (((lane * 11 + Math.floor(weatherTime * 7)) % 31) - 15) * 0.42;
    const z = state.z + (((lane * 23 + Math.floor(weatherTime * 4)) % 47) - 23) * 0.5;
    node.setPosition(x, y, z);
    node.setScale(currentSite.whiteout >= 0.6 ? [0.04, 0.11, 0.04] : [0.035, 0.075, 0.035]);
  });

  const extractionVisible = phase === "campaign-clear";
  const extractionPad = currentSite.pads[0]!;
  const extractionGround = field.padHeights[0] ?? groundHere;
  const approachScaffoldVisible = !visualReviewCapture
    && phase === "flying"
    && altitudeAboveGround > APPROACH_SCAFFOLD_MIN_AGL;
  // The campaign-clear bay is a complete renderer-owned deck laid over the
  // final heightfield. In the review tableau, hide only that underlying visual
  // mesh so nearby ridges cannot protrude through the deck and occlude the
  // already-landed typed vehicle. The Rapier contact and mesh-query evidence
  // has already run and remains published; runtime flight keeps terrain shown.
  if (visualReviewCapture) {
    requireNode(`s${currentSite.id}-terrain`).setVisible(!extractionVisible);
    landerNode.setScale(1);
    landerNode.setVisible(!extractionVisible);
    extractionLanderNode.setVisible(extractionVisible);
    if (extractionVisible) {
      extractionLanderNode
        .setPosition(state.x, state.y + punchOffsetY, state.z)
        .setRotation(0, 0.69, 0);
    }
  }
  extractionNodes.forEach((node, index) => {
    node.setVisible(extractionVisible && !visualReviewCapture);
    if (!extractionVisible) return;
    if (index === 0) node.setPosition(
      extractionPad.x + (visualReviewCapture ? -2.4 : -5.8),
      extractionGround + (visualReviewCapture ? 5.0 : 5.2),
      extractionPad.z + (visualReviewCapture ? -1.45 : -1.5)
    );
    else {
      node.setPosition(extractionPad.x, extractionGround + 0.18, extractionPad.z);
      if (visualReviewCapture) node.setScale([0.45, 0.45, 0.04]);
    }
  });
  extractionInfrastructureNodes.forEach((node, index) => {
    const part = EXTRACTION_INFRASTRUCTURE[index]!;
    node.setVisible((extractionVisible && !visualReviewCapture) || approachScaffoldVisible);
    if (extractionVisible && !visualReviewCapture) {
      node.setPosition(
        extractionPad.x + part.offset[0],
        extractionGround + part.offset[1],
        extractionPad.z + part.offset[2]
      );
    } else if (approachScaffoldVisible) {
      // Keep the scaffold fixed at the launch hand-off altitude.  It recedes
      // naturally as the authored lander descends; it never moves the physics
      // proxy or changes the destination pad below.
      const scaffoldY = currentSite.spawn.y - FOOT_DROP - 0.25;
      node.setPosition(
        currentSite.spawn.x + part.offset[0],
        scaffoldY + part.offset[1],
        currentSite.spawn.z + part.offset[2]
      );
    }
  });
  extractionBackdropNode.setVisible(extractionVisible && visualReviewCapture);
  if (extractionVisible && visualReviewCapture) {
    extractionBackdropNode
      .setPosition(
        extractionPad.x - 3.5,
        extractionGround - 10.25,
        extractionPad.z - 4.25
      )
      .setRotation(0, 0.69, 0);
  }

  // Dust kicks under the plume near the ground.
  const dustActive = burning && altitudeAboveGround < 11;
  dustNodes.forEach((node, index) => {
    if (!dustActive) {
      node.setScale(0.001);
      return;
    }
    const cycle = (simSeconds * 2.2 + index / dustNodes.length) % 1;
    const angle = (index / dustNodes.length) * Math.PI * 2;
    const radius = 0.7 + cycle * 2.6;
    node.setPosition(
      state.x + Math.cos(angle) * radius,
      groundHere + 0.25 + cycle * 0.9,
      state.z + Math.sin(angle) * radius
    );
    const puffScale = 0.16 + cycle * 0.55 * (1 - cycle * 0.4);
    node.setScale(puffScale * (dustActive ? 1 : 0.001));
  });

  // Pad approach lights pulse in sequence.
  const pulsePhase = Math.floor((simSeconds * 2.4) % padLights.length);
  padLights.forEach((node, index) => {
    const emphasized = index === pulsePhase ? 1.9 : 1;
    node.setScale(0.22 * emphasized);
  });
  if (extractionVisible && visualReviewCapture) {
    siteGroups[siteIndex]?.nodes.forEach((node) => node.setVisible(false));
  }

  // Aurora sway — subtle, driven by sim time so pause freezes it too.
  auroraBands.forEach((node, index) => {
    node.setRotation(0.3 + Math.sin(simSeconds * 0.35 + index) * 0.02, index * 0.4, 0.06 * (index - 1));
  });

  // Crash debris burst + impact shockwave.
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
      const node = debrisNodes[index]!;
      node.setPosition(piece.x, piece.y, piece.z);
      node.setRotation(piece.x * 3 % Math.PI, piece.z * 2 % Math.PI, piece.y % Math.PI);
      node.setScale(piece.life > 0 ? 0.18 : 0.001);
    });
    if (!alive) crashDebris = [];
  } else {
    debrisNodes.forEach((node) => node.setPosition(0, -50, 0));
  }
  if (shockwaveAge >= 0) {
    shockwaveAge += dtFrame;
    if (shockwaveAge > 0.7) {
      shockwaveAge = -1;
      shockwaveNode.setPosition(0, -50, 0);
      shockwaveNode.setScale(0.001);
    } else {
      const t = shockwaveAge / 0.7;
      shockwaveNode.setScale([2 + t * 14, 2 + t * 14, 0.24 * (1 - t)]);
    }
  }

  // Banner + advance timers run in wall time so they survive paused frames.
  if (bannerTimer > 0) {
    bannerTimer -= dtFrame;
    if (bannerTimer <= 0 && phase === "flying") showBanner(hud, null, "");
  }
  if (advanceTimer > 0) {
    advanceTimer -= dtFrame;
    if (advanceTimer <= 0 && phase === "landed") {
      showBanner(hud, null, "");
      loadSite(Math.min(SITES.length - 1, siteIndex + 1));
    }
  }

  // Terrain query throughput for evidence (per second).
  terrainQueryClock += dtFrame;
  if (terrainQueryClock >= 1) {
    terrainQueryFps = Math.round(terrainQueryCountWindow / terrainQueryClock);
    terrainQueryCountWindow = 0;
    terrainQueryClock = 0;
  }

  updateHud(hud, {
    siteLabel: `${currentSite.id} · ${currentSite.name}`,
    altitudeMeters: altitudeAboveGround,
    vspeed: state.vy,
    hspeed: hspeedOf(state),
    attitudeDeg: Math.abs(state.tiltDeg),
    fuelFraction: state.fuel / currentSite.fuelBudget,
    hullFraction: campaignHull / LANDER_MAX_HULL,
    score: campaignScore(SITES.map((_, index) => siteScores[index] ?? 0)),
    gustTelegraph: gustTelegraphActive(currentSite.gust, simSeconds) && phase === "flying",
    ghostActive
  });

  publishEvidence();
}

function publishEvidence(): void {
  const diagnostics = app.diagnostics();
  const groundHeight = field ? sampleGridHeight(field, state.x, state.z) : 0;
  mountedEvidence.site = currentSite.id;
  mountedEvidence.siteName = currentSite.name;
  mountedEvidence.fuel = Number((state.fuel / currentSite.fuelBudget).toFixed(4));
  mountedEvidence.hull = Number((campaignHull / LANDER_MAX_HULL).toFixed(3));
  mountedEvidence.altitude = Number(Math.max(0, state.y - FOOT_DROP - groundHeight).toFixed(2));
  mountedEvidence.vspeed = Number(state.vy.toFixed(3));
  mountedEvidence.hspeed = Number(hspeedOf(state).toFixed(3));
  mountedEvidence.attitudeDeg = Number(Math.abs(state.tiltDeg).toFixed(2));
  mountedEvidence.state = paused ? "paused" : phase;
  mountedEvidence.lastGrade = lastGrade;
  mountedEvidence.ghostActive = ghostActive;
  mountedEvidence.terrainQueryFps = terrainQueryFps;
  mountedEvidence.audioCues = recentAudioCues;
  mountedEvidence.audio = landerAudio.proof();
  mountedEvidence.whiteoutDensity = currentSite.whiteout;
  mountedEvidence.prediction = latestPrediction;
  mountedEvidence.extractionTableau = phase === "campaign-clear";
  mountedEvidence.gustForce = Number(gustForceAt(currentSite.gust, simSeconds).toFixed(4));
  mountedEvidence.gustTelegraph = gustTelegraphActive(currentSite.gust, simSeconds);
  mountedEvidence.whiteoutVisibleNodes = Math.round(whiteoutNodes.length * currentSite.whiteout);
  mountedEvidence.completedSites = siteScores.filter((score) => score > 0).length;
  mountedEvidence.renderer = {
    backend: diagnostics.backend,
    drawCalls: diagnostics.drawCalls,
    renderSize: diagnostics.renderSize
  };
  mountedEvidence.touchdown.contactEventSeen = contactEventsSeen > 0;
  if (field) {
    mountedEvidence.terrain.rows = field.rows;
    mountedEvidence.terrain.columns = field.columns;
    mountedEvidence.terrain.minHeight = Number(field.minHeight.toFixed(2));
    mountedEvidence.terrain.maxHeight = Number(field.maxHeight.toFixed(2));
    if (surfaceQuery) {
      mountedEvidence.terrain.surfaceQueryStats = surfaceQuery.stats();
    }
  }
}

// ---- main loop -----------------------------------------------------------------
app.onFrame((frame) => {
  accumulator += frame.dt;
  let substeps = 0;
  while (accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS) {
    input.update(FIXED_DT);
    handleControlEdges();
    tick(FIXED_DT);
    accumulator -= FIXED_DT;
    substeps += 1;
  }
  renderUpdate(frame.dt);
});

// ---- boot ----------------------------------------------------------------------
setupPanel();
captureNodeHandles();
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application",
    get subject() {
      return {
        position: [state.x, state.y, state.z] as const,
        rotation: [0, state.yaw, (state.tiltDeg * Math.PI) / 180] as const,
        targetSize: LANDER_TARGET_SIZE
      };
    },
    setSubjectSuppressed(suppressed: boolean) {
      landerNode.setVisible(!suppressed);
    },
    settleSubjectPose() {
      paused = true;
      landerNode.setRotation(0, state.yaw, (state.tiltDeg * Math.PI) / 180);
    }
  },
  configurable: true
});
// Point the active field/query/site at the requested site (site 1 by default).
if (initialSiteIndex > 0) {
  loadSite(initialSiteIndex);
} else {
  const entry = siteFields[0]!;
  currentSite = entry.site;
  field = entry.field;
  surfaceQuery = entry.query;
  resetAttempt();
}
mountedEvidence.mounted = true;
mountedEvidence.status = "ready";
