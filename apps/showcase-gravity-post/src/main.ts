/**
 * Gravity Post — single-path rebuild on the salvaged gameplay core.
 * Every URL boots this module; the former legacy/v2 dispatcher is deleted.
 *
 * Salvaged gameplay core (zero engine imports):
 *   - contracts.ts (4 authored contracts GP-CON-1..4, 6 stations, 6 gravity wells)
 *   - wells.ts (fixed-step 1/120 s trajectory integrator + integratePath oracle)
 *   - pod.ts (launch, single bounded course correction, coast step, evaluateCapture)
 *   - prediction.ts (prediction beads + divergence tolerance check)
 *   - scoring.ts (scoreContract breakdown + 3-hull shift limit)
 *   - stations.ts (dock sensor specs + play-plane geometry)
 */
import {
  camera,
  effects,
  environments,
  game as engineGame,
  labels,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraApp,
  type AuraCameraPose,
  type AuraCameraRig,
  type AuraCameraRigContext,
  type AuraSceneBuilder
} from "@aura3d/engine";
import type { GameScenario } from "@aura3d/engine/contracts";
import {
  createGame,
  lookManifest,
  type EvidenceChannelContract,
  type GameHudMountOptions,
  type LookSource
} from "@aura3d/engine/game";
import direction from "../art/direction";
import { assets } from "./aura-assets";
import {
  CONTRACTS,
  STATIONS,
  WELL_BODIES,
  stationById,
  stationPosition,
  type ContractSpec
} from "./gameplay/contracts";
import {
  DOCK_SENSOR_RADIUS,
  TIME_WARP_MULTIPLIER,
  applyCorrection,
  createPodRuntime,
  evaluateCapture,
  launch,
  resetPodForContract,
  updateCoast,
  type PodRuntimeState
} from "./gameplay/pod";
import {
  PREDICTION_DIVERGENCE_TOLERANCE,
  PREDICTION_MAX_STEPS,
  buildPredictionBeads,
  measurePredictionDivergence
} from "./gameplay/prediction";
import { SHIFT_FAIL_LIMIT, scoreContract, type ScoreBreakdown } from "./gameplay/scoring";
import {
  PLAY_PLANE_Y,
  buildStations,
  type StationWorld
} from "./gameplay/stations";
import { FIXED_DT, dockPointHash, integratePath, type TrajectorySample, type Vec2 } from "./gameplay/wells";

declare global {
  interface Window {
    __aura3dGameSnapshot?: GravityPostSnapshot;
  }
}

export interface GravityPostSnapshot {
  readonly mounted: boolean;
  readonly rendererMounted: boolean;
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly drawCalls: number;
  readonly contractIndex: number;
  readonly contractId: string;
  readonly contractTitle: string;
  readonly podState: string;
  readonly podPosition: readonly [number, number];
  readonly podVelocity: readonly [number, number];
  readonly pod: {
    readonly state: "ready" | "in-flight" | "docked" | "lost";
    readonly launchedBy: "drag" | "keyboard";
    readonly position: readonly [number, number];
    readonly velocity: readonly [number, number];
  };
  readonly delivery: {
    readonly completed: number;
    readonly failed: number;
    readonly contractId: string;
    readonly contractIndex: number;
  };
  readonly propellant: number;
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
  readonly completedContracts: number;
  readonly hullsRemaining: number;
  readonly score: number;
  readonly lastBreakdown: ScoreBreakdown | null;
  readonly shiftOver: boolean;
  readonly campaignComplete: boolean;
  readonly paused: boolean;
  readonly warping: boolean;
  readonly flybyActive: boolean;
  readonly flybyBeatsRun: number;
  readonly audioCues: readonly string[];
  readonly claimLabel: string;
  readonly dockHash: string;
  readonly cameraTarget: readonly [number, number, number];
  readonly look: { readonly id: string; readonly category: string };
  readonly appliedLook: Record<string, unknown>;
  readonly audio: {
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly contextState: string;
    readonly unlocked: boolean;
  };
}

export const MAX_LAUNCH_SPEED = 2.85;
export const MIN_LAUNCH_POWER = 0.18;
export const AIM_DRAG_PIXEL_RANGE = 190;
export const PREDICTION_BEADS = 3;
export const ACTUAL_PATH_BEADS = 3;

// Verified canonical integer drag vectors for the 4 contracts (GP-CON-1..4).
const CANONICAL_DRAGS: readonly { readonly dx: number; readonly dy: number }[] = [
  { dx: -4, dy: -79 },
  { dx: -4, dy: 60 },
  { dx: -4, dy: -40 },
  { dx: 38, dy: -24 }
];

const DIRECTION_AUDIO_EVENTS = new Set(["launch", "thrust", "dock", "delivered", "bed"]);
const requestedAudioEvents = new Set<string>();
const playedAudioEvents = new Set<string>();

type GravityAudioCue =
  | "launch"
  | "thrust"
  | "dock"
  | "delivered"
  | "bed"
  | "assist"
  | "bounce"
  | "lost"
  | "warp"
  | "ui";

const LEGACY_CUE_NAMES: Readonly<Record<GravityAudioCue, string>> = {
  launch: "launch-whoosh",
  thrust: "burn-loop",
  dock: "dock-lock",
  delivered: "contract-clear",
  bed: "ambient-space",
  assist: "assist-chime",
  bounce: "bounce-off",
  lost: "pod-lost",
  warp: "warp-hum",
  ui: "ui-confirm"
};

interface GravityPostState {
  contractIndex: number;
  pod: PodRuntimeState;
  readonly stations: readonly StationWorld[];
  aimDragging: boolean;
  aimStart: { x: number; y: number };
  aimCurrent: { x: number; y: number };
  aimDirection: Vec2;
  aimPower: number;
  aimYaw: number;
  launchedBy: "drag" | "keyboard";
  warping: boolean;
  paused: boolean;
  shiftOver: boolean;
  campaignComplete: boolean;
  completedContracts: number;
  failedContracts: number;
  score: number;
  lastScoreBreakdown: ScoreBreakdown | null;
  predictionSamples: readonly TrajectorySample[];
  predictionAtLaunch: readonly TrajectorySample[];
  actualPath: Vec2[];
  predictionComparedSamples: number;
  predictionMaxDivergence: number;
  predictionWithinTolerance: boolean;
  dockEvents: string[];
  audioCues: string[];
  autoRetryTimer: number;
  dockFlashTimer: number;
  frame: number;
  rendererMounted: boolean;
  drawCalls: number;
}

function createInitialState(): GravityPostState {
  const firstContract = CONTRACTS[0]!;
  const pod = createPodRuntime(firstContract.originStationId, firstContract.tuning.strengthScale);
  resetPodForContract(pod, firstContract);
  return {
    contractIndex: 0,
    pod,
    stations: buildStations(),
    aimDragging: false,
    aimStart: { x: 0, y: 0 },
    aimCurrent: { x: 0, y: 0 },
    aimDirection: [-0.051, -0.999],
    aimPower: 0.42,
    aimYaw: Math.atan2(-0.999, -0.051),
    launchedBy: "drag",
    warping: false,
    paused: false,
    shiftOver: false,
    campaignComplete: false,
    completedContracts: 0,
    failedContracts: 0,
    score: 0,
    lastScoreBreakdown: null,
    predictionSamples: [],
    predictionAtLaunch: [],
    actualPath: [[pod.kinematic.position[0], pod.kinematic.position[1]]],
    predictionComparedSamples: 0,
    predictionMaxDivergence: 0,
    predictionWithinTolerance: true,
    dockEvents: [],
    audioCues: ["ambient-space"],
    autoRetryTimer: 0,
    dockFlashTimer: 0,
    frame: 0,
    rendererMounted: false,
    drawCalls: 0
  };
}

function currentContract(state: GravityPostState): ContractSpec {
  return CONTRACTS[Math.min(state.contractIndex, CONTRACTS.length - 1)]!;
}

// ------------------------------------------------------------ materials/rig --

function createGravityMaterials() {
  return {
    sunSurface: material.solarSun({
      color: "#ffd166",
      coreColor: "#fff7ad",
      rimColor: "#f97316",
      emissive: "#ffb703",
      emissiveIntensity: 2.6,
      roughness: 0.16,
      practical: true
    }),
    sunCorona: material.solarCorona({
      color: "#ff9f1c",
      coreColor: "#ffd166",
      rimColor: "#f97316",
      emissive: "#ffd166",
      emissiveIntensity: 1.55,
      opacity: 0.36,
      falloff: 2.5,
      practical: true
    }),
    wellRing: material.emissive({
      color: "#274472",
      emissive: "#59d7ff",
      emissiveIntensity: 0.65,
      opacity: 0.38
    }),
    hazardRing: material.emissive({
      color: "#ff4e6a",
      emissive: "#ff4e6a",
      emissiveIntensity: 0.85,
      opacity: 0.44
    }),
    predictionBead: material.emissive({
      color: "#ffd166",
      emissive: "#ffd166",
      emissiveIntensity: 1.5
    }),
    actualBead: material.emissive({
      color: "#fff3d6",
      emissive: "#ffe5a3",
      emissiveIntensity: 1.15
    }),
    originStationRing: material.emissive({
      color: "#5eead4",
      emissive: "#5eead4",
      emissiveIntensity: 1.25
    }),
    destStationRing: material.emissive({
      color: "#59d7ff",
      emissive: "#59d7ff",
      emissiveIntensity: 1.65
    }),
    idleStationRing: material.chrome({
      color: "#4b6b94",
      roughness: 0.12,
      metallic: 0.95,
      clearcoat: 0.6,
      envMapIntensity: 1.75
    }),
    stationGate: material.brushedMetal({
      roughness: 0.24,
      metallic: 0.94,
      clearcoat: 0.38,
      envMapIntensity: 1.65
    }),
    stationBeacon: material.chrome({
      roughness: 0.08,
      metallic: 1,
      clearcoat: 0.48,
      envMapIntensity: 1.9
    }),
    courierPod: material.brushedMetal({
      roughness: 0.2,
      metallic: 0.92,
      clearcoat: 0.58,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.85
    }),
    dockFlash: material.emissive({
      color: "#59d7ff",
      emissive: "#ffffff",
      emissiveIntensity: 2.2,
      opacity: 0.85
    }),
    thrusterCone: material.emissive({
      color: "#ffd166",
      emissive: "#ff8c42",
      emissiveIntensity: 1.9
    }),
    planetSurfaces: {
      cinder: material.planet("lava-venus", { roughness: 0.36, emissive: "#ff6b35", emissiveIntensity: 0.45, practical: true }),
      verdance: material.planet("ice", { roughness: 0.26, clearcoat: 0.72, clearcoatRoughness: 0.1, envMapIntensity: 1.35 }),
      aquaria: material.planet("ice", { roughness: 0.16, clearcoat: 0.94, clearcoatRoughness: 0.05, envMapIntensity: 1.6 }),
      rust: material.planet("rocky", { roughness: 0.58, clearcoat: 0.22, envMapIntensity: 1.15 }),
      gale: material.planet("gas-giant", { roughness: 0.2, clearcoat: 0.86, clearcoatRoughness: 0.08, envMapIntensity: 1.45 })
    } as Readonly<Record<string, ReturnType<typeof material.pbr>>>,
    planetAtmospheres: {
      cinder: material.atmosphere({ color: "#e07a5f", emissive: "#ff6b35", emissiveIntensity: 0.48, opacity: 0.22 }),
      verdance: material.atmosphere({ color: "#52b788", emissive: "#74c69d", emissiveIntensity: 0.55, opacity: 0.25 }),
      aquaria: material.atmosphere({ color: "#38bdf8", emissive: "#59d7ff", emissiveIntensity: 0.65, opacity: 0.26 }),
      rust: material.atmosphere({ color: "#d96b43", emissive: "#e76f51", emissiveIntensity: 0.44, opacity: 0.22 }),
      gale: material.atmosphere({ color: "#e8b04a", emissive: "#ffd166", emissiveIntensity: 0.52, opacity: 0.25 })
    } as Readonly<Record<string, ReturnType<typeof material.atmosphere>>>
  };
}

const BODY_LABEL_COLORS: Readonly<Record<string, string>> = {
  sol: "#ffd166",
  cinder: "#e07a5f",
  verdance: "#74c69d",
  aquaria: "#59d7ff",
  rust: "#e76f51",
  gale: "#e8b04a"
};

const CAMERA_EYE_OFFSET: readonly [number, number, number] = [-0.74, 3.55, 4.18];
const CAMERA_FOV = 46;
const currentRigTarget: [number, number, number] = [0, PLAY_PLANE_Y, 0];

function computeGravityCameraPose(state: GravityPostState): {
  readonly position: [number, number, number];
  readonly target: [number, number, number];
  readonly fov: number;
} {
  const contract = currentContract(state);
  const dest = stationPosition(stationById(contract.destinationStationId));
  const podPos = state.pod.kinematic.position;
  const focusX = state.pod.state === "coasting" ? podPos[0] * 0.48 + dest[0] * 0.24 : podPos[0] * 0.28 + dest[0] * 0.22;
  const focusZ = state.pod.state === "coasting" ? podPos[1] * 0.48 + dest[1] * 0.24 : podPos[1] * 0.28 + dest[1] * 0.22;
  currentRigTarget[0] = focusX;
  currentRigTarget[1] = PLAY_PLANE_Y;
  currentRigTarget[2] = focusZ;
  return {
    position: [
      focusX + CAMERA_EYE_OFFSET[0],
      PLAY_PLANE_Y + CAMERA_EYE_OFFSET[1],
      focusZ + CAMERA_EYE_OFFSET[2]
    ],
    target: [focusX, PLAY_PLANE_Y, focusZ],
    fov: CAMERA_FOV
  };
}

function createGravityCameraRig(state: GravityPostState): AuraCameraRig {
  return {
    id: "gravity-post.orbit",
    reset: () => {
      currentRigTarget[0] = 0;
      currentRigTarget[1] = PLAY_PLANE_Y;
      currentRigTarget[2] = 0;
    },
    update: (_ctx: AuraCameraRigContext): AuraCameraPose => {
      const pose = computeGravityCameraPose(state);
      return {
        position: pose.position,
        target: pose.target,
        up: [0, 1, 0],
        roll: 0,
        fov: pose.fov,
        near: 0.1,
        far: 120
      };
    }
  };
}

// ------------------------------------------------------------------ world ----

const PLANET_ASSET_BY_BODY_ID = {
  cinder: assets.gravityPlanetMercury,
  verdance: assets.gravityPlanetEarth,
  aquaria: assets.gravityPlanetNeptune,
  rust: assets.gravityPlanetMars,
  gale: assets.gravityPlanetJupiter
} as const;

function buildGravityWorld(state: GravityPostState): AuraSceneBuilder {
  const mats = createGravityMaterials();
  const camPose = computeGravityCameraPose(state);
  const contract = currentContract(state);
  const builder = scene()
    .background("#040612")
    .camera(
      camera.perspective({
        position: camPose.position,
        target: camPose.target,
        fov: camPose.fov,
        near: 0.1,
        far: 120
      })
    )
    .add(
      lights.directional({
        name: "gravity-key-sun",
        color: "#ffe4b5",
        intensity: 2.65,
        position: [0, 4.2, 0],
        shadow: true
      })
    )
    .add(
      lights.directional({
        name: "gravity-rim-fill",
        color: "#59d7ff",
        intensity: 0.55,
        position: [-3.2, 2.8, -2.6],
        shadow: false
      })
    )
    .add(
      lights.point({
        name: "gravity-sol-practical",
        color: "#ffd166",
        intensity: 3.4,
        distance: 9.5,
        decay: 1.4,
        position: [0, 0.25, 0]
      })
    )
    .add(
      environments.hdri({
        name: "gravity-deep-space-hdri",
        texture: assets.deepSpaceDomeHdr,
        intensity: 0.88
      })
    )
    .add(
      effects.fog({
        name: "gravity-space-fog",
        color: "#040612",
        density: 0.004,
        intensity: 0.32
      })
    )
    .add(
      effects.bloom({
        name: "gravity-solar-bloom",
        intensity: 0.42,
        color: "#ffd166",
        threshold: 0.76,
        radius: 0.32,
        antiBlowout: true,
        maxIntensity: 0.68
      })
    )
    .add(
      effects.trail({
        name: "courier-flight-ribbon",
        target: "courier-pod",
        color: "#59d7ff",
        intensity: 1.35,
        width: 0.12,
        maxPoints: 48,
        minVertexDistance: 0.03
      })
    );

  for (const body of WELL_BODIES) {
    const [bx, bz] = body.position;
    if (body.id === "sol") {
      builder.add(
        primitives
          .sphere({
            name: "body-sol",
            material: mats.sunSurface,
            castShadow: true,
            receiveShadow: true
          })
          .position(bx, PLAY_PLANE_Y, bz)
          .scale(body.visualRadius)
      );
      builder.add(
        primitives
          .torus({
            name: "body-sol-corona",
            material: mats.sunCorona,
            castShadow: false,
            receiveShadow: false
          })
          .position(bx, PLAY_PLANE_Y, bz)
          .rotate(Math.PI / 2, 0, 0)
          .scale(body.visualRadius * 1.28)
      );
    } else {
      const planetAsset = PLANET_ASSET_BY_BODY_ID[body.id as keyof typeof PLANET_ASSET_BY_BODY_ID];
      const planetSurface = mats.planetSurfaces[body.id];
      if (planetAsset) {
        builder.add(
          model(planetAsset, {
            name: `body-${body.id}`,
            targetMaxDimension: body.visualRadius * 2.05,
            castShadow: true,
            receiveShadow: true,
            ...(planetSurface ? { material: planetSurface } : {})
          }).position(bx, PLAY_PLANE_Y, bz)
        );
      }
      const atmo = mats.planetAtmospheres[body.id];
      if (atmo) {
        builder.add(
          primitives
            .sphere({
              name: `body-${body.id}-atmo`,
              material: atmo,
              castShadow: false,
              receiveShadow: false
            })
            .position(bx, PLAY_PLANE_Y, bz)
            .scale(body.visualRadius * 1.12)
        );
      }
    }

    builder.add(
      primitives
        .torus({
          name: `well-ring-${body.id}`,
          material: body.id === "sol" ? mats.hazardRing : mats.wellRing,
          castShadow: false,
          receiveShadow: false
        })
        .position(bx, PLAY_PLANE_Y - 0.04, bz)
        .rotate(Math.PI / 2, 0, 0)
        .scale(body.wellRadius * 0.45)
    );

    builder.add(
      labels
        .billboard(body.name, {
          name: `label-body-${body.id}`,
          color: BODY_LABEL_COLORS[body.id] ?? "#ffd166"
        })
        .position(bx, PLAY_PLANE_Y + body.visualRadius + 0.18, bz)
    );
  }

  for (const station of STATIONS) {
    const [sx, sz] = stationPosition(station);
    const isOrigin = station.id === contract.originStationId;
    const isDest = station.id === contract.destinationStationId;
    const ringMat = isDest ? mats.destStationRing : isOrigin ? mats.originStationRing : mats.idleStationRing;
    const stationAngle = Math.atan2(station.offset[1], station.offset[0]);

    if (isOrigin) {
      builder.add(
        model(assets.gravityPostDockGate, {
          name: `station-gate-${station.id}`,
          targetMaxDimension: 0.42,
          material: mats.stationGate,
          castShadow: false,
          receiveShadow: false
        })
          .position(sx, PLAY_PLANE_Y, sz)
          .rotate(0, stationAngle, 0)
      );
    }
    if (isDest) {
      builder.add(
        model(assets.gravityPostDockBeacon, {
          name: `station-beacon-${station.id}`,
          targetMaxDimension: 0.34,
          material: mats.stationBeacon,
          castShadow: false,
          receiveShadow: false
        }).position(sx + 0.14, PLAY_PLANE_Y + 0.12, sz - 0.12)
      );
    }
    builder.add(
      primitives
        .torus({
          name: `station-ring-${station.id}`,
          material: ringMat,
          castShadow: false,
          receiveShadow: false
        })
        .position(sx, PLAY_PLANE_Y - 0.02, sz)
        .rotate(Math.PI / 2, 0, 0)
        .scale(DOCK_SENSOR_RADIUS * 0.62)
    );
    builder.add(
      labels
        .billboard(station.name, {
          name: `label-station-${station.id}`,
          color: isDest ? "#59d7ff" : isOrigin ? "#5eead4" : "#cbd5e1"
        })
        .position(sx, PLAY_PLANE_Y + 0.32, sz)
    );
  }

  const [px, pz] = state.pod.kinematic.position;
  builder.add(
    model(assets.gravityPostCourierSkiff, {
      name: "courier-pod",
      targetMaxDimension: 0.56,
      material: mats.courierPod,
      castShadow: true,
      receiveShadow: true
    })
      .position(px, PLAY_PLANE_Y + 0.04, pz)
      .rotate(0, state.aimYaw, 0)
      .runtime(engineGame.runtimeNode("courier-pod", { tags: ["player", "courier"] }))
  );
  builder.add(
    primitives
      .cylinder({
        name: "pod-thruster-cone",
        material: mats.thrusterCone,
        castShadow: false,
        receiveShadow: false
      })
      .position(px, PLAY_PLANE_Y + 0.04, pz)
      .scale(0.001)
      .runtime(engineGame.runtimeNode("pod-thruster-cone", { tags: ["vfx", "thruster"] }))
  );
  builder.add(
    primitives
      .torus({
        name: "dock-flash-ring",
        material: mats.dockFlash,
        castShadow: false,
        receiveShadow: false
      })
      .position(px, PLAY_PLANE_Y + 0.02, pz)
      .rotate(Math.PI / 2, 0, 0)
      .scale(0.001)
      .runtime(engineGame.runtimeNode("dock-flash-ring", { tags: ["vfx", "dock"] }))
  );

  for (let i = 0; i < PREDICTION_BEADS; i += 1) {
    builder.add(
      primitives
        .sphere({
          name: `gp-pred-${i}`,
          material: mats.predictionBead,
          castShadow: false,
          receiveShadow: false
        })
        .position(px, PLAY_PLANE_Y - 2, pz)
        .scale(0.001)
        .runtime(engineGame.runtimeNode(`gp-pred-${i}`, { tags: ["prediction-bead"] }))
    );
  }

  for (let i = 0; i < ACTUAL_PATH_BEADS; i += 1) {
    builder.add(
      primitives
        .sphere({
          name: `gp-path-${i}`,
          material: mats.actualBead,
          castShadow: false,
          receiveShadow: false
        })
        .position(px, PLAY_PLANE_Y - 2, pz)
        .scale(0.001)
        .runtime(engineGame.runtimeNode(`gp-path-${i}`, { tags: ["path-bead"] }))
    );
  }

  return builder;
}

// ------------------------------------------------------------------- game ----

const state = createInitialState();
const target = document.getElementById("app") ?? document.body;

const hudOptions: GameHudMountOptions = {
  theme: "sci-fi-telemetry",
  maxScreenFraction: 0.14,
  widgets: [
    { id: "score", kind: "score", anchor: "top-left", label: "DISPATCH" },
    { id: "contract", kind: "objective", anchor: "top", label: "CONTRACT" },
    { id: "propellant", kind: "meter", max: 100, anchor: "bottom-left", label: "PROPELLANT" },
    { id: "hulls", kind: "lives", anchor: "top-right", label: "HULLS" },
    { id: "prompt", kind: "prompt", anchor: "bottom", label: "CONTROLS" }
  ]
};

let latestSnapshot: GravityPostSnapshot | undefined;

const evidenceChannel: EvidenceChannelContract = {
  schema: 1,
  sections: {
    gravityPost: () => latestSnapshot ?? { status: "unbound" },
    pod: () =>
      latestSnapshot?.pod ?? {
        state: "ready",
        launchedBy: "drag",
        position: [0, 0],
        velocity: [0, 0]
      },
    delivery: () =>
      latestSnapshot?.delivery ?? {
        completed: 0,
        failed: 0,
        contractId: "GP-CON-1",
        contractIndex: 0
      }
  }
};

const gravityGame = createGame({
  id: "showcase-gravity-post",
  target,
  layout: "full-bleed",
  diagnostics: { overlay: false, performancePanel: false },
  qualityRebuild: { flags: ["game"] },
  scene: () => buildGravityWorld(state),
  hud: hudOptions,
  sound: {
    cues: {
      launch: { id: "launch", asset: { url: "/aura-assets/gravityPostLaunchWhooshSfx.8c15c174.wav" }, volume: 0.85 },
      thrust: { id: "thrust", asset: { url: "/aura-assets/gravityPostBurnLoopSfx.18c2fb61.wav" }, volume: 0.55 },
      dock: { id: "dock", asset: { url: "/aura-assets/gravityPostDockLockSfx.4671b140.wav" }, volume: 0.9 },
      delivered: { id: "delivered", asset: { url: "/aura-assets/gravityPostContractClearSfx.8bf23421.wav" }, volume: 0.95 },
      bed: { id: "bed", asset: { url: "/aura-assets/gravityPostAmbientSpaceSfx.a55f2f7c.wav" }, volume: 0.35, loop: true },
      assist: { id: "assist", asset: { url: "/aura-assets/gravityPostAssistChimeSfx.2e56c4e5.wav" }, volume: 0.7 },
      bounce: { id: "bounce", asset: { url: "/aura-assets/gravityPostBounceOffSfx.35c12a5b.wav" }, volume: 0.75 },
      lost: { id: "lost", asset: { url: "/aura-assets/gravityPostPodLostSfx.6853703e.wav" }, volume: 0.8 },
      warp: { id: "warp", asset: { url: "/aura-assets/gravityPostWarpHumSfx.51a2dcb0.wav" }, volume: 0.45 },
      ui: { id: "ui", asset: { url: "/aura-assets/gravityPostUiConfirmSfx.24f9ac47.wav" }, volume: 0.4 }
    }
  },
  juice: {
    launch: { shake: 0.14, hitStop: 0.015 },
    assist: { shake: 0.18, flash: { color: "#ffd166", peak: 0.18, ms: 160 } },
    dock: { shake: 0.28, hitStop: 0.04, flash: { color: "#59d7ff", peak: 0.25, ms: 220 } },
    bounce: { shake: 0.32, hitStop: 0.025, flash: { color: "#ff8c42", peak: 0.2, ms: 180 } },
    lost: { shake: 0.45, hitStop: 0.06, flash: { color: "#ff4e6a", peak: 0.35, ms: 320 } }
  },
  scenarios: buildGravityScenarios(),
  evidence: evidenceChannel
});

const app: AuraApp = gravityGame.app;
gravityGame.start();

function fireAudioCue(cue: GravityAudioCue): void {
  const legacyName = LEGACY_CUE_NAMES[cue];
  if (!state.audioCues.includes(legacyName)) {
    state.audioCues.push(legacyName);
  }
  if (DIRECTION_AUDIO_EVENTS.has(cue)) {
    requestedAudioEvents.add(cue);
  }
  try {
    void gravityGame.sound?.cue(cue);
  } catch {
    // Non-fatal in headless browser environments without unlocked WebAudio.
  }
}

// --------------------------------------------------------- simulation/sync ---

function refreshGravityPrediction(): void {
  if (state.pod.state !== "ready" || !state.aimDragging || state.aimPower < 0.05) {
    state.predictionSamples = [];
    return;
  }
  const contract = currentContract(state);
  const speed = MIN_LAUNCH_POWER + state.aimPower * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
  const velocity: Vec2 = [state.aimDirection[0] * speed, state.aimDirection[1] * speed];
  state.predictionSamples = integratePath({
    bodies: WELL_BODIES,
    tuning: contract.tuning,
    start: state.pod.kinematic.position,
    velocity,
    steps: PREDICTION_MAX_STEPS
  }).samples;
}

function updateLiveDivergence(): void {
  if (state.predictionAtLaunch.length === 0 || state.actualPath.length <= 1) return;
  const liveSamples: TrajectorySample[] = state.actualPath.slice(1).map((position) => ({
    position,
    speed: 0
  }));
  const report = measurePredictionDivergence(state.predictionAtLaunch, liveSamples);
  state.predictionComparedSamples = report.comparedSamples;
  state.predictionMaxDivergence = report.maxPositionError;
  state.predictionWithinTolerance = report.withinTolerance;
}

function onStationDockTrigger(stationId: string): void {
  const contract = currentContract(state);
  if (state.pod.state !== "coasting" || stationId !== contract.destinationStationId) return;
  const outcome = evaluateCapture(state.pod, contract, stationId);
  if (outcome.docked) {
    state.warping = false;
    state.dockFlashTimer = 0.85;
    state.dockEvents.push(`${stationId}:capture`);
    const breakdown = scoreContract({
      propellant: state.pod.propellant,
      distanceToCore: outcome.distanceToCore,
      dockRadius: DOCK_SENSOR_RADIUS,
      assists: state.pod.assists,
      bonusBodyHit: contract.bonusBodyId !== null && state.pod.flybys.has(contract.bonusBodyId)
    });
    state.lastScoreBreakdown = breakdown;
    state.score += breakdown.total;
    state.completedContracts += 1;
    fireAudioCue("dock");
    fireAudioCue("delivered");
    gravityGame.juice.fire("dock");
  } else {
    state.dockEvents.push(`${stationId}:bounce`);
    fireAudioCue("bounce");
    gravityGame.juice.fire("bounce");
  }
}

function stepSimulation(dt: number): void {
  state.frame += 1;
  if (state.dockFlashTimer > 0) {
    state.dockFlashTimer = Math.max(0, state.dockFlashTimer - dt);
  }
  if (state.paused || state.shiftOver || state.campaignComplete) {
    state.warping = false;
    return;
  }

  const contract = currentContract(state);
  if (state.pod.state === "lost") {
    state.warping = false;
    if (state.autoRetryTimer > 0) {
      state.autoRetryTimer = Math.max(0, state.autoRetryTimer - dt);
      if (state.autoRetryTimer === 0 && !state.shiftOver) {
        resetPodForContract(state.pod, contract);
        state.actualPath = [[state.pod.kinematic.position[0], state.pod.kinematic.position[1]]];
      }
    }
    return;
  }

  if (state.pod.state !== "coasting") {
    state.warping = false;
    return;
  }

  if (state.warping) {
    fireAudioCue("warp");
  }

  // Step coasting in FIXED_DT increments while checking dock proximity at every
  // fixed step so time-warp or batched sim steps never tunnel through a dock sensor.
  const destPos = stationPosition(stationById(contract.destinationStationId));
  let remainingDt = Math.min(0.25, Math.max(0, dt));
  const stepQuantum = state.warping ? FIXED_DT / TIME_WARP_MULTIPLIER : FIXED_DT;
  while (remainingDt > 1e-9 && state.pod.state === "coasting") {
    const slice = Math.min(remainingDt, stepQuantum);
    remainingDt -= slice;
    const events = updateCoast({
      pod: state.pod,
      contract,
      bodies: WELL_BODIES,
      dt: slice,
      warpActive: state.warping
    });

    if (state.actualPath.length < 4000) {
      state.actualPath.push([state.pod.kinematic.position[0], state.pod.kinematic.position[1]]);
    }

    for (const ev of events) {
      if (ev.type === "assist") {
        fireAudioCue("assist");
        gravityGame.juice.fire("assist");
      } else if (
        ev.type === "planet-strike" ||
        ev.type === "solar-escape" ||
        ev.type === "timeout" ||
        ev.type === "stranded"
      ) {
        state.warping = false;
        state.failedContracts += 1;
        state.autoRetryTimer = 0.6;
        if (state.failedContracts >= SHIFT_FAIL_LIMIT) {
          state.shiftOver = true;
        }
        fireAudioCue("lost");
        gravityGame.juice.fire("lost");
      }
    }

    if (state.pod.state === "coasting") {
      const distToDest = Math.hypot(
        state.pod.kinematic.position[0] - destPos[0],
        state.pod.kinematic.position[1] - destPos[1]
      );
      if (distToDest <= DOCK_SENSOR_RADIUS) {
        onStationDockTrigger(contract.destinationStationId);
      }
    }
  }

  updateLiveDivergence();
}

function advanceToNextContract(): void {
  if (state.pod.state !== "docked") return;
  fireAudioCue("ui");
  if (state.contractIndex + 1 >= CONTRACTS.length) {
    state.campaignComplete = true;
    return;
  }
  state.contractIndex += 1;
  const nextContract = currentContract(state);
  resetPodForContract(state.pod, nextContract);
  state.lastScoreBreakdown = null;
  state.predictionSamples = [];
  state.predictionAtLaunch = [];
  state.actualPath = [[state.pod.kinematic.position[0], state.pod.kinematic.position[1]]];
}

function retryOrResetCampaign(): void {
  fireAudioCue("ui");
  if (state.campaignComplete || state.shiftOver) {
    state.contractIndex = 0;
    state.completedContracts = 0;
    state.failedContracts = 0;
    state.score = 0;
    state.shiftOver = false;
    state.campaignComplete = false;
    state.dockEvents = [];
  }
  const contract = currentContract(state);
  resetPodForContract(state.pod, contract);
  state.lastScoreBreakdown = null;
  state.predictionSamples = [];
  state.predictionAtLaunch = [];
  state.actualPath = [[state.pod.kinematic.position[0], state.pod.kinematic.position[1]]];
  state.warping = false;
  state.paused = false;
}

function launchPodWithDragVector(dx: number, dy: number, source: "drag" | "keyboard"): void {
  if (state.pod.state !== "ready") return;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return;
  const dir: Vec2 = [dx / dist, dy / dist];
  const power = Math.min(1, Math.max(0.05, dist / AIM_DRAG_PIXEL_RANGE));
  const speed = MIN_LAUNCH_POWER + power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
  const contract = currentContract(state);
  state.aimDirection = dir;
  state.aimPower = power;
  state.aimYaw = Math.atan2(dir[1], dir[0]);
  state.predictionAtLaunch = integratePath({
    bodies: WELL_BODIES,
    tuning: contract.tuning,
    start: [state.pod.kinematic.position[0], state.pod.kinematic.position[1]],
    velocity: [dir[0] * speed, dir[1] * speed],
    steps: PREDICTION_MAX_STEPS
  }).samples;
  state.predictionSamples = [];
  state.actualPath = [[state.pod.kinematic.position[0], state.pod.kinematic.position[1]]];
  state.predictionComparedSamples = 0;
  state.predictionMaxDivergence = 0;
  state.predictionWithinTolerance = true;
  state.launchedBy = source;
  const events = launch(state.pod, dir, speed);
  if (events.length > 0) {
    fireAudioCue("launch");
    gravityGame.juice.fire("launch");
  }
}

function launchFromKeyboard(): void {
  if (state.pod.state !== "ready") return;
  const canonical = CANONICAL_DRAGS[Math.min(state.contractIndex, CANONICAL_DRAGS.length - 1)]!;
  launchPodWithDragVector(canonical.dx, canonical.dy, "keyboard");
}

function applyFlightCorrection(directionSign: -1 | 1): void {
  const events = applyCorrection(state.pod, directionSign);
  if (events.length > 0) {
    state.launchedBy = "keyboard";
    fireAudioCue("thrust");
  }
}

function handle(name: string) {
  return app.nodes.get(name);
}

function syncGravityWorld(): void {
  const [px, pz] = state.pod.kinematic.position;
  const [vx, vz] = state.pod.kinematic.velocity;
  const speed = Math.hypot(vx, vz);
  const yaw = speed > 1e-4 ? Math.atan2(vz, vx) : state.aimYaw;

  const podNode = handle("courier-pod");
  if (podNode) {
    podNode.setPosition(px, PLAY_PLANE_Y + 0.04, pz);
    podNode.setRotation(0, -yaw, 0);
  }

  const thrusterNode = handle("pod-thruster-cone");
  if (thrusterNode) {
    const active = state.pod.state === "coasting" && (state.warping || state.pod.correctionsUsed > 0);
    const backX = px - Math.cos(yaw) * 0.22;
    const backZ = pz - Math.sin(yaw) * 0.22;
    thrusterNode.setPosition(backX, PLAY_PLANE_Y + 0.04, backZ);
    thrusterNode.setRotation(0, -yaw, Math.PI / 2);
    thrusterNode.setScale(active ? [0.055, 0.18, 0.055] : 0.001);
  }

  const flashNode = handle("dock-flash-ring");
  if (flashNode) {
    if (state.dockFlashTimer > 0) {
      const t = 1 - state.dockFlashTimer / 0.85;
      flashNode.setPosition(px, PLAY_PLANE_Y + 0.03, pz);
      flashNode.setScale(0.34 * (0.8 + t * 1.4));
    } else {
      flashNode.setScale(0.001);
    }
  }

  const beads = buildPredictionBeads({ samples: state.predictionSamples, maxBeads: PREDICTION_BEADS });
  for (let i = 0; i < PREDICTION_BEADS; i += 1) {
    const node = handle(`gp-pred-${i}`);
    if (!node) continue;
    const sample = beads[i];
    if (sample && state.pod.state === "ready" && state.aimDragging) {
      node.setPosition(sample.x, PLAY_PLANE_Y + 0.03, sample.z);
      node.setScale(0.032);
    } else {
      node.setPosition(px, PLAY_PLANE_Y - 2, pz);
      node.setScale(0.001);
    }
  }

  const pathLen = state.actualPath.length;
  const stride = Math.max(1, Math.floor(pathLen / ACTUAL_PATH_BEADS));
  for (let i = 0; i < ACTUAL_PATH_BEADS; i += 1) {
    const node = handle(`gp-path-${i}`);
    if (!node) continue;
    const sampleIdx = i * stride;
    const pt = sampleIdx < pathLen ? state.actualPath[sampleIdx] : undefined;
    if (pt && pathLen > 1) {
      node.setPosition(pt[0], PLAY_PLANE_Y + 0.015, pt[1]);
      node.setScale(0.025);
    } else {
      node.setPosition(px, PLAY_PLANE_Y - 2, pz);
      node.setScale(0.001);
    }
  }

  const camPose = computeGravityCameraPose(state);
  try {
    app.camera.setPose({
      position: camPose.position,
      target: camPose.target,
      fov: camPose.fov
    });
  } catch {
    // Camera controller not yet settled on initial mount frame.
  }
}

// ----------------------------------------------------------------- input -----

function attachInputHandlers(): void {
  const stage = document.querySelector<HTMLElement>("[data-testid='gravity-post-stage']") ?? document.body;

  const updateAimFromPointer = (clientX: number, clientY: number): void => {
    state.aimCurrent = { x: clientX, y: clientY };
    const dx = state.aimCurrent.x - state.aimStart.x;
    const dy = state.aimCurrent.y - state.aimStart.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
      state.aimPower = 0;
      state.predictionSamples = [];
      return;
    }
    state.aimDirection = [dx / dist, dy / dist];
    state.aimPower = Math.min(1, Math.max(0.05, dist / AIM_DRAG_PIXEL_RANGE));
    state.aimYaw = Math.atan2(state.aimDirection[1], state.aimDirection[0]);
    refreshGravityPrediction();
  };

  stage.addEventListener("pointerdown", (event: PointerEvent) => {
    if (state.pod.state !== "ready" || state.paused || state.shiftOver || state.campaignComplete) return;
    state.aimDragging = true;
    state.aimStart = { x: event.clientX, y: event.clientY };
    state.aimCurrent = { x: event.clientX, y: event.clientY };
    state.aimPower = 0;
    state.predictionSamples = [];
  });

  window.addEventListener("pointermove", (event: PointerEvent) => {
    if (!state.aimDragging) return;
    updateAimFromPointer(event.clientX, event.clientY);
  });

  const finishPointerAim = (event: PointerEvent): void => {
    if (!state.aimDragging) return;
    updateAimFromPointer(event.clientX, event.clientY);
    const dx = state.aimCurrent.x - state.aimStart.x;
    const dy = state.aimCurrent.y - state.aimStart.y;
    state.aimDragging = false;
    if (Math.hypot(dx, dy) >= 4 && state.pod.state === "ready") {
      launchPodWithDragVector(dx, dy, "drag");
    } else {
      state.predictionSamples = [];
    }
  };

  window.addEventListener("pointerup", finishPointerAim);
  window.addEventListener("pointercancel", () => {
    state.aimDragging = false;
    state.predictionSamples = [];
  });

  window.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.code === "KeyP") {
      state.paused = !state.paused;
      if (state.paused) {
        state.warping = false;
        gravityGame.session.pause();
      } else {
        gravityGame.session.resume();
      }
      fireAudioCue("ui");
      return;
    }
    if (event.code === "KeyR") {
      retryOrResetCampaign();
      return;
    }
    if (event.code === "KeyN" || (event.code === "Enter" && state.pod.state === "docked")) {
      advanceToNextContract();
      return;
    }
    if (event.code === "Space") {
      if (state.pod.state === "ready" && !state.paused) {
        launchFromKeyboard();
      } else if (state.pod.state === "coasting" && !state.paused) {
        state.warping = true;
      }
      return;
    }
    if (event.code === "Enter" && state.pod.state === "ready" && !state.paused) {
      launchFromKeyboard();
      return;
    }
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      if (state.pod.state === "ready") {
        state.aimYaw -= 0.08;
        state.aimDirection = [Math.cos(state.aimYaw), Math.sin(state.aimYaw)];
        state.aimDragging = true;
        refreshGravityPrediction();
      }
      return;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      if (state.pod.state === "ready") {
        state.aimYaw += 0.08;
        state.aimDirection = [Math.cos(state.aimYaw), Math.sin(state.aimYaw)];
        state.aimDragging = true;
        refreshGravityPrediction();
      }
      return;
    }
    if (event.code === "KeyW" || event.code === "ArrowUp") {
      if (state.pod.state === "coasting") {
        state.launchedBy = "keyboard";
        applyFlightCorrection(1);
      } else if (state.pod.state === "docked") {
        advanceToNextContract();
        if (state.pod.state === "ready") {
          launchFromKeyboard();
        }
      } else if (state.pod.state === "ready") {
        launchFromKeyboard();
      }
      return;
    }
    if (event.code === "KeyS" || event.code === "ArrowDown") {
      if (state.pod.state === "coasting") {
        state.launchedBy = "keyboard";
        applyFlightCorrection(-1);
      } else if (state.pod.state === "ready") {
        state.aimPower = Math.max(0.08, state.aimPower - 0.06);
        state.aimDragging = true;
        refreshGravityPrediction();
      }
    }
  });

  window.addEventListener("keyup", (event: KeyboardEvent) => {
    if (event.code === "Space") {
      state.warping = false;
    }
  });
}

// ------------------------------------------------------------------ HUD ------

function createHudOverlay(): HTMLElement {
  const existing = document.getElementById("hud");
  if (existing) return existing;
  const root = document.createElement("aside");
  root.id = "hud";
  root.setAttribute("data-hud", "gravity-post");
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:56px",
    "z-index:5",
    "max-width:340px",
    "font:500 13px/1.4 system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(4,6,18,0.78)",
    "border:1px solid rgba(89,215,255,0.38)",
    "border-radius:8px",
    "padding:10px 12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

const hudRoot = createHudOverlay();

function renderHud(): void {
  const contract = currentContract(state);
  const hullsRemaining = Math.max(0, SHIFT_FAIL_LIMIT - state.failedContracts);
  gravityGame.hud.set("score", state.score);
  gravityGame.hud.set("contract", `${state.contractIndex + 1}/${CONTRACTS.length} · ${contract.title}`);
  gravityGame.hud.set("propellant", Math.round(state.pod.propellant));
  gravityGame.hud.set("hulls", hullsRemaining);

  const promptText = state.campaignComplete
    ? "SHIFT COMPLETE — PRESS R TO REPLAY"
    : state.shiftOver
      ? "SHIFT OVER — PRESS R TO RESET"
      : state.pod.state === "docked"
        ? `DOCKED (+${state.lastScoreBreakdown?.total ?? 0}) — PRESS N FOR NEXT`
        : state.pod.state === "coasting"
          ? `COASTING · TOKENS ${state.pod.correctionTokensRemaining} (W/S) · HOLD SPACE WARP`
          : "DRAG OR SPACE TO LAUNCH MAIL POD";
  gravityGame.hud.set("prompt", promptText);

  const scoreCardHtml =
    state.pod.state === "docked" && state.lastScoreBreakdown
      ? `<div id="gp-score-card" class="gp-scorecard" data-testid="gp-score-card">Docked +${state.lastScoreBreakdown.total} (Fuel +${state.lastScoreBreakdown.fuelPoints}, Assist +${state.lastScoreBreakdown.assistPoints})</div>`
      : "";

  hudRoot.innerHTML = [
    `<strong>Gravity Post</strong>`,
    `<div class="gp-status">Contract ${state.contractIndex + 1}/${CONTRACTS.length}: ${contract.title} | Score ${state.score}</div>`,
    `<div class="gp-fuel">Propellant ${Math.round(state.pod.propellant)}% | Hulls ${hullsRemaining}/${SHIFT_FAIL_LIMIT} | Tokens ${state.pod.correctionTokensRemaining}</div>`,
    `<div>${promptText}</div>`,
    scoreCardHtml,
    `<div class="controls-strip" data-hud="keyboard-hints">Drag/Space launch · W/S burn token · Hold Space warp · N next · P pause · R reset</div>`
  ].join("");
}

// --------------------------------------------------------------- scenarios ---

function buildGravityScenarios(): Readonly<Record<string, GameScenario>> {
  const applyOpening = (): void => {
    retryOrResetCampaign();
    launchPodWithDragVector(-4, -79, "drag");
    for (let i = 0; i < 18; i += 1) stepSimulation(1 / 30);
    syncGravityWorld();
  };

  const applyMidFlight = (): void => {
    retryOrResetCampaign();
    launchPodWithDragVector(-4, -79, "drag");
    for (let i = 0; i < 48; i += 1) stepSimulation(1 / 30);
    syncGravityWorld();
  };

  const applyAction = (): void => {
    retryOrResetCampaign();
    launchPodWithDragVector(-4, -79, "keyboard");
    for (let i = 0; i < 42; i += 1) stepSimulation(1 / 30);
    applyFlightCorrection(1);
    state.launchedBy = "keyboard";
    syncGravityWorld();
  };

  const applyLateCoast = (): void => {
    retryOrResetCampaign();
    launchPodWithDragVector(-4, -79, "keyboard");
    for (let i = 0; i < 75; i += 1) stepSimulation(1 / 30);
    syncGravityWorld();
  };

  return {
    "02-opening": { id: "02-opening", apply: applyOpening },
    "03-mid": { id: "03-mid", apply: applyMidFlight },
    "04-action": { id: "04-action", apply: applyAction },
    "05-late-coast": { id: "05-late-coast", apply: applyLateCoast },
    "quality-medium": { id: "quality-medium", apply: applyMidFlight },
    "delivery-1": { id: "delivery-1", apply: applyMidFlight },
    "hazard-mail": {
      id: "hazard-mail",
      apply: () => {
        retryOrResetCampaign();
        state.contractIndex = 3;
        resetPodForContract(state.pod, currentContract(state));
        launchPodWithDragVector(38, -24, "drag");
        for (let i = 0; i < 36; i += 1) stepSimulation(1 / 30);
        syncGravityWorld();
      }
    },
    "dock-approach": { id: "dock-approach", apply: applyLateCoast }
  };
}

// --------------------------------------------------------------- evidence ----

function audioEvidence(): GravityPostSnapshot["audio"] {
  const sound = gravityGame.sound?.evidence;
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

const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(gravityGame.lookSource() as LookSource),
  postPreset: "space-orbit",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "gravity-post.orbit"
});

function publishEvidence(): void {
  const diagnostics = app.diagnostics();
  state.drawCalls = diagnostics.drawCalls;
  if (diagnostics.drawCalls > 0) {
    state.rendererMounted = true;
  }
  const contract = currentContract(state);
  const destPos = stationPosition(stationById(contract.destinationStationId));
  const pose = computeGravityCameraPose(state);
  const hullsRemaining = Math.max(0, SHIFT_FAIL_LIMIT - state.failedContracts);

  const snapshot: GravityPostSnapshot = {
    mounted: true,
    rendererMounted: state.rendererMounted,
    framed: state.rendererMounted && state.drawCalls > 0,
    state: gravityGame.session.state,
    frame: state.frame,
    drawCalls: state.drawCalls,
    contractIndex: state.contractIndex,
    contractId: contract.id,
    contractTitle: contract.title,
    podState: state.pod.state,
    podPosition: [
      Number(state.pod.kinematic.position[0].toFixed(4)),
      Number(state.pod.kinematic.position[1].toFixed(4))
    ],
    podVelocity: [
      Number(state.pod.kinematic.velocity[0].toFixed(4)),
      Number(state.pod.kinematic.velocity[1].toFixed(4))
    ],
    pod: {
      state: state.pod.state === "coasting" ? "in-flight" : state.pod.state,
      launchedBy: state.launchedBy,
      position: [
        Number(state.pod.kinematic.position[0].toFixed(3)),
        Number(state.pod.kinematic.position[1].toFixed(3))
      ],
      velocity: [
        Number(state.pod.kinematic.velocity[0].toFixed(3)),
        Number(state.pod.kinematic.velocity[1].toFixed(3))
      ]
    },
    delivery: {
      completed: state.completedContracts,
      failed: state.failedContracts,
      contractId: contract.id,
      contractIndex: state.contractIndex
    },
    propellant: state.pod.propellant,
    assists: [...state.pod.assists],
    predictionSteps: state.predictionSamples.length,
    predictionComparedSamples: state.predictionComparedSamples,
    predictionMaxDivergence: Number(state.predictionMaxDivergence.toFixed(5)),
    predictionTolerance: PREDICTION_DIVERGENCE_TOLERANCE,
    predictionWithinTolerance: state.predictionWithinTolerance,
    actualPathPoints: state.actualPath.length,
    correctionTokensRemaining: state.pod.correctionTokensRemaining,
    correctionsUsed: state.pod.correctionsUsed,
    flightSeconds: Number(state.pod.flightSeconds.toFixed(3)),
    dockEventCount: state.dockEvents.length,
    dockEvents: [...state.dockEvents],
    failedContracts: state.failedContracts,
    completedContracts: state.completedContracts,
    hullsRemaining,
    score: state.score,
    lastBreakdown: state.lastScoreBreakdown,
    shiftOver: state.shiftOver,
    campaignComplete: state.campaignComplete,
    paused: state.paused,
    warping: state.warping,
    flybyActive: false,
    flybyBeatsRun: 0,
    audioCues: [...state.audioCues],
    claimLabel: "prototype",
    dockHash: String(dockPointHash(destPos)),
    cameraTarget: [
      Number(pose.target[0].toFixed(3)),
      Number(pose.target[1].toFixed(3)),
      Number(pose.target[2].toFixed(3))
    ],
    look: { id: "space-orbit", category: "space" },
    appliedLook,
    audio: audioEvidence()
  };

  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

// -------------------------------------------------------------- frame loop ---

const params = new URL(location.href).searchParams;
const autorunEnabled = params.get("autorun") === "1";
let autorunCooldown = 0.25;

const scenarioParam = params.get("scenario");
if (scenarioParam) {
  const scenarios = buildGravityScenarios();
  scenarios[scenarioParam]?.apply({ seed: Number(params.get("seed") ?? 1) });
}

attachInputHandlers();
fireAudioCue("bed");

app.onFrame(({ dt: rawDt }) => {
  const baseDt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(0.05, rawDt) : 1 / 60;
  const scaled = gravityGame.session.scaledDt(baseDt);
  const effectiveDt = state.paused ? 0 : scaled > 0 ? Math.min(0.05, scaled) : baseDt;

  if (autorunEnabled && !state.paused && !state.shiftOver && !state.campaignComplete) {
    if (state.pod.state === "ready") {
      autorunCooldown -= effectiveDt;
      if (autorunCooldown <= 0) {
        autorunCooldown = 0.35;
        const canonical = CANONICAL_DRAGS[Math.min(state.contractIndex, CANONICAL_DRAGS.length - 1)]!;
        launchPodWithDragVector(canonical.dx, canonical.dy, "keyboard");
        state.warping = true;
      }
    } else if (state.pod.state === "coasting") {
      state.warping = true;
    }
  }

  stepSimulation(effectiveDt);
  syncGravityWorld();
  renderHud();
  publishEvidence();
});

syncGravityWorld();
renderHud();
publishEvidence();

void gravityGame.ready().then(() => {
  state.rendererMounted = true;
  app.camera?.use?.(createGravityCameraRig(state), { blend: 0.4 });
  app.setOutput?.({ preset: "space", exposure: Math.pow(2, direction.lighting.exposureEV) });
  publishEvidence();
});
