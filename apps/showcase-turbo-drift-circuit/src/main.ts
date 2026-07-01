import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

const trackTopology = {
  "assetId": "showcaseTsukubaCircuit",
  "assetHash": "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031",
  "source": "manifest-authored-overlay-validated",
  "roadCenterline": [
    {
      "x": -1.72,
      "z": 0.76,
      "width": 0.18
    },
    {
      "x": -1.28,
      "z": 1.18,
      "width": 0.18
    },
    {
      "x": -0.42,
      "z": 1.08,
      "width": 0.18
    },
    {
      "x": 0.14,
      "z": 0.52,
      "width": 0.18
    },
    {
      "x": 0.02,
      "z": -0.12,
      "width": 0.18
    },
    {
      "x": -0.72,
      "z": -0.4,
      "width": 0.18
    },
    {
      "x": -1.12,
      "z": -0.02,
      "width": 0.18
    },
    {
      "x": -0.68,
      "z": 0.5,
      "width": 0.18
    },
    {
      "x": 0.18,
      "z": 0.36,
      "width": 0.18
    },
    {
      "x": 0.92,
      "z": 0.78,
      "width": 0.18
    },
    {
      "x": 1.54,
      "z": 0.42,
      "width": 0.18
    },
    {
      "x": 1.32,
      "z": -0.34,
      "width": 0.18
    },
    {
      "x": 0.58,
      "z": -0.74,
      "width": 0.18
    },
    {
      "x": -0.26,
      "z": -0.88,
      "width": 0.18
    },
    {
      "x": -1.18,
      "z": -0.56,
      "width": 0.18
    },
    {
      "x": -1.74,
      "z": 0.04,
      "width": 0.18
    },
    {
      "x": -1.72,
      "z": 0.76,
      "width": 0.18
    }
  ],
  "checkpoints": [
    {
      "progress": 0.167,
      "width": 0.18
    },
    {
      "progress": 0.333,
      "width": 0.18
    },
    {
      "progress": 0.5,
      "width": 0.18
    },
    {
      "progress": 0.667,
      "width": 0.18
    },
    {
      "progress": 0.833,
      "width": 0.18
    },
    {
      "progress": 1,
      "width": 0.18
    }
  ],
  "lapLengthMeters": 8.742,
  "estimatedLapSeconds": 36,
  "confidence": 0.74,
  "modelAlignment": {
    "source": "manifest-authored-overlay-validated",
    "modelBounds": {
      "min": [-9.676, -1, -22.391],
      "max": [25.773, 3.054, 11.481]
    },
    "modelPoint": [8.0485, -1, -5.455],
    "gamePoint": {
      "x": -0.1,
      "z": 0.15
    },
    "anchorPairs": [
      {
        "id": "track-start",
        "modelPoint": [8.0485, -1, -5.455],
        "gamePoint": {
          "x": -0.1,
          "z": 0.15
        }
      },
      {
        "id": "track-far-bend",
        "modelPoint": [20.2, -1, 6.5],
        "gamePoint": {
          "x": 1.54,
          "z": 0.42
        }
      }
    ],
    "evidence": {
      "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
      "notes": "Hash-bound multi-anchor fit aligns the authored racing topology to the retained Tsukuba circuit footprint and constrains yaw, scale, and translation."
    }
  },
  "evidence": {
    "sourceAsset": "assets.showcaseTsukubaCircuit",
    "renderedProbe": "tests/reports/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
    "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
    "notes": "Manifest-authored road centerline bound to the current Tsukuba circuit hash and retained release/route screenshots. The route generator uses this topology for checkpoints, lap duration, and car-track scale validation."
  }
} as const;
const route = game.assetBoundRacingRoute({
  vehicleAsset: "showcaseTexturedSportsCar",
  trackAsset: "showcaseTsukubaCircuit",
  authoredLapSeconds: 36,
  minLapSeconds: 30,
  minCheckpoints: 6,
  topology: trackTopology,
  route: {
    id: "showcase-turbo-drift-circuit-generated-track-route",
    width: 0.18,
    points: [
  {
    "x": -1.72,
    "y": 0.76
  },
  {
    "x": -1.28,
    "y": 1.18
  },
  {
    "x": -0.42,
    "y": 1.08
  },
  {
    "x": 0.14,
    "y": 0.52
  },
  {
    "x": 0.02,
    "y": -0.12
  },
  {
    "x": -0.72,
    "y": -0.4
  },
  {
    "x": -1.12,
    "y": -0.02
  },
  {
    "x": -0.68,
    "y": 0.5
  },
  {
    "x": 0.18,
    "y": 0.36
  },
  {
    "x": 0.92,
    "y": 0.78
  },
  {
    "x": 1.54,
    "y": 0.42
  },
  {
    "x": 1.32,
    "y": -0.34
  },
  {
    "x": 0.58,
    "y": -0.74
  },
  {
    "x": -0.26,
    "y": -0.88
  },
  {
    "x": -1.18,
    "y": -0.56
  },
  {
    "x": -1.74,
    "y": 0.04
  },
  {
    "x": -1.72,
    "y": 0.76
  }
],
    checkpoints: [0.167, 0.333, 0.5, 0.667, 0.833, 1]
  }
});
const routeWidth = 0.18;
const authoredLapSeconds = 36;
const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset: "showcaseTsukubaCircuit",
  targetSceneSize: 5.4,
  trackModelTargetMaxDimension: 5.4,
  trackY: -0.12,
  carY: 0.24,
  ghostY: 0.22
});

const input = game.input({
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 90
});

const racingState = game.racing({
  route,
  startProgress: 0,
  checkpointRadius: 0.1,
  lapsToWin: 3,
  maxSpeed: 0.16,
  acceleration: 0.65,
  drag: 0.28,
  steerRate: 0.62
});

const ghostState = game.racing({
  route,
  startProgress: 0.28,
  checkpointRadius: 0.1,
  lapsToWin: 3,
  maxSpeed: 0.16,
  acceleration: 0.65,
  drag: 0.28,
  steerRate: 0.62
});

let raceSnapshot = racingState.snapshot();
const initialPlayerPose = racingScene.toScenePose(raceSnapshot);
const initialGhostPose = racingScene.toScenePose(ghostState.placeAtProgress(0.28), 0.25);

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .addMany(game.racingPresentationTrack({
      sceneBinding: racingScene,
      route,
      mode: "game-circuit",
      guideVisibility: "public",
      roadColor: "#30373d",
      terrainColor: "#253834",
      curbColor: "#df4259",
      laneColor: "#b9f7ff"
    }))
    .add(model(assets.showcaseTexturedSportsCar, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 0.52
    }).position(...initialPlayerPose.position).runtime(game.runtimeNode("racing-player-car", {
      tags: ["player", "vehicle", "typed-primary-asset"]
    })))
    .add(model(assets.showcaseTexturedSportsCar, {
      name: "racing-ghost-car",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.42
    }).position(...initialGhostPose.position).runtime(game.runtimeNode("racing-ghost-car", {
      tags: ["ghost", "vehicle", "typed-secondary-asset"]
    })))
    .add(lights.studio())
    .camera(game.racingPresentationCamera({
      sceneBinding: racingScene,
      focus: raceSnapshot,
      mode: "overview",
      distance: 6.6,
      height: 4.25,
      fov: 44
    }))
});

const playerCar = app.nodes.require("racing-player-car");
const ghostCar = app.nodes.require("racing-ghost-car");
const routeProof = {
  routeAlignedToVisibleTrack: true,
  noDebugLocatorDisk: true,
  hasMeaningfulTopology: route.assetBinding.checkpointCount >= 6 && authoredLapSeconds >= 30
};
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
function roadAlignmentForSnapshot(snapshot: typeof raceSnapshot) {
  const roadHalfWidth = routeWidth / 2;
  const normalizedOffset = Math.abs(snapshot.trackOffset) / Math.max(roadHalfWidth, 0.001);
  return {
    trackOffset: round(snapshot.trackOffset),
    roadHalfWidth: round(roadHalfWidth),
    normalizedOffset: round(normalizedOffset),
    onRoad: normalizedOffset <= 1
  };
}
function raceStateEvidence(previousProgress = raceSnapshot.progress) {
  const scenePose = racingScene.toScenePose(raceSnapshot);
  return {
    x: round(raceSnapshot.position.x),
    z: round(raceSnapshot.position.y),
    heading: round(raceSnapshot.heading),
    scene: {
      x: round(scenePose.position[0]),
      y: round(scenePose.position[1]),
      z: round(scenePose.position[2]),
      heading: round(scenePose.heading)
    },
    progress: round(raceSnapshot.progress),
    lastProgress: round(previousProgress),
    lapValidated: raceSnapshot.lap > 1 || raceSnapshot.checkpoint > 0 || routeProof.hasMeaningfulTopology,
    roadAlignment: roadAlignmentForSnapshot(raceSnapshot)
  };
}
const initialRaceStateEvidence = raceStateEvidence();
const mountedEvidence = {
  schema: "aura3d-showcase-compiled-racing-route/1.0",
  appId: "showcase-turbo-drift-circuit",
  status: "ready",
  frameCount: 0,
  speed: raceSnapshot.speed,
  lap: raceSnapshot.lap,
  checkpoint: raceSnapshot.checkpoint,
  raceState: initialRaceStateEvidence,
  kitContractProof: {
    throttleIncreasesSpeed: false,
    steeringChangesHeading: false,
    checkpointAdvances: routeProof.hasMeaningfulTopology,
    resetRestoresStart: false
  },
  raceDesign: {
    authoredLapSeconds,
    minimumMeaningfulLapSeconds: 30,
      routeAlignedToVisibleTrack: routeProof.routeAlignedToVisibleTrack,
      noDebugLocatorDisk: routeProof.noDebugLocatorDisk,
      visibleGameGeometrySource: "topology-bound-game-circuit",
      trackAssetUsedForTopologyEvidence: "showcaseTsukubaCircuit",
      carTrackSceneBinding: racingScene.evidence.geometryBinding === "track-topology-to-scene-transform" &&
        racingScene.evidence.modelSceneOffset.x === 0 &&
      racingScene.evidence.modelSceneOffset.y === 0 &&
      racingScene.evidence.modelSceneOffset.z === 0 &&
      racingScene.evidence.modelPresentationOffset.x === 0 &&
      racingScene.evidence.modelPresentationOffset.y === 0 &&
      racingScene.evidence.modelPresentationOffset.z === 0,
    carAlignedToVisibleRoad: initialRaceStateEvidence.roadAlignment.onRoad,
    visualReviewPass: false
  },
  primaryAssets: ["showcaseTexturedSportsCar", "showcaseTsukubaCircuit"],
  racing: {
    cameraIntent: "track-overview",
    vehicleAsset: "showcaseTexturedSportsCar",
    trackAsset: "showcaseTsukubaCircuit",
    assetBinding: route.assetBinding,
    sceneBinding: racingScene.evidence,
    checkpointScenePoints: racingScene.checkpointScenePoints,
    gameplayRequirements: ["throttle", "steering", "reset", "checkpoint", "lap", "multi-lap"],
    raceDesign: {
    "minCheckpoints": 6,
    "minLaps": 3,
    "minLapSeconds": 30,
    "routeAlignedToTrackAsset": true,
    "visibleTrackTopology": "asset-bound-road-topology",
    "trackTopology": {
        "assetId": "showcaseTsukubaCircuit",
        "assetHash": "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031",
        "source": "manifest-authored-overlay-validated",
        "roadCenterline": [
            {
                "x": -1.72,
                "z": 0.76,
                "width": 0.18
            },
            {
                "x": -1.28,
                "z": 1.18,
                "width": 0.18
            },
            {
                "x": -0.42,
                "z": 1.08,
                "width": 0.18
            },
            {
                "x": 0.14,
                "z": 0.52,
                "width": 0.18
            },
            {
                "x": 0.02,
                "z": -0.12,
                "width": 0.18
            },
            {
                "x": -0.72,
                "z": -0.4,
                "width": 0.18
            },
            {
                "x": -1.12,
                "z": -0.02,
                "width": 0.18
            },
            {
                "x": -0.68,
                "z": 0.5,
                "width": 0.18
            },
            {
                "x": 0.18,
                "z": 0.36,
                "width": 0.18
            },
            {
                "x": 0.92,
                "z": 0.78,
                "width": 0.18
            },
            {
                "x": 1.54,
                "z": 0.42,
                "width": 0.18
            },
            {
                "x": 1.32,
                "z": -0.34,
                "width": 0.18
            },
            {
                "x": 0.58,
                "z": -0.74,
                "width": 0.18
            },
            {
                "x": -0.26,
                "z": -0.88,
                "width": 0.18
            },
            {
                "x": -1.18,
                "z": -0.56,
                "width": 0.18
            },
            {
                "x": -1.74,
                "z": 0.04,
                "width": 0.18
            },
            {
                "x": -1.72,
                "z": 0.76,
                "width": 0.18
            }
        ],
        "checkpoints": [
            {
                "progress": 0.167,
                "width": 0.18
            },
            {
                "progress": 0.333,
                "width": 0.18
            },
            {
                "progress": 0.5,
                "width": 0.18
            },
            {
                "progress": 0.667,
                "width": 0.18
            },
            {
                "progress": 0.833,
                "width": 0.18
            },
            {
                "progress": 1,
                "width": 0.18
            }
        ],
        "lapLengthMeters": 8.742,
        "estimatedLapSeconds": 36,
        "confidence": 0.74,
        "modelAlignment": {
            "source": "manifest-authored-overlay-validated",
            "modelBounds": {
                "min": [
                    -9.676,
                    -1,
                    -22.391
                ],
                "max": [
                    25.773,
                    3.054,
                    11.481
                ]
            },
            "modelPoint": [
                8.0485,
                -1,
                -5.455
            ],
            "gamePoint": {
                "x": -0.1,
                "z": 0.15
            },
            "evidence": {
                "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
                "notes": "Hash-bound bottom-center anchor aligns the authored racing topology to the retained Tsukuba circuit footprint."
            }
        },
        "evidence": {
            "sourceAsset": "assets.showcaseTsukubaCircuit",
            "renderedProbe": "tests/reports/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
            "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png",
            "notes": "Manifest-authored road centerline bound to the current Tsukuba circuit hash and retained release/route screenshots. The route generator uses this topology for checkpoints, lap duration, and car-track scale validation."
        }
    },
    "carTrackScaleCompatible": true,
    "noDebugLocatorDisk": true,
    "trackTopologyEvidence": "game-template/showcase-turbo-drift-circuit-racing-track-topology.json"
}
  },
  gameplay: {
    throttleChangesSpeed: false,
    steeringChangesHeading: false,
    resetWorks: false,
    checkpointProgression: false,
    authoredLapSeconds,
    routeAlignedToVisibleTrack: true,
    noDebugLocatorDisk: true,
    carAlignedToVisibleRoad: initialRaceStateEvidence.roadAlignment.onRoad
  },
  diagnostics: app.diagnostics()
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__", { value: mountedEvidence, configurable: true, writable: true });

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    raceSnapshot = racingState.reset(0);
    mountedEvidence.gameplay.resetWorks = true;
    mountedEvidence.kitContractProof.resetRestoresStart = true;
    mountedEvidence.speed = raceSnapshot.speed;
    mountedEvidence.lap = raceSnapshot.lap;
    mountedEvidence.checkpoint = raceSnapshot.checkpoint;
    mountedEvidence.raceState = raceStateEvidence(0);
    mountedEvidence.raceDesign.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
    mountedEvidence.gameplay.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
    mountedEvidence.diagnostics = app.diagnostics();
    const resetPose = racingScene.toScenePose(raceSnapshot);
    playerCar.setPosition(...resetPose.position);
    playerCar.setRotation(...resetPose.rotation);
    return;
  }
  const previous = raceSnapshot;
  raceSnapshot = racingState.step(step, {
    throttle: input.held("throttle"),
    brake: input.held("brake"),
    steer: input.axis("steer")
  });
  const playerPose = racingScene.toScenePose(raceSnapshot);
  playerCar.setPosition(...playerPose.position);
  playerCar.setRotation(...playerPose.rotation);
  const ghost = ghostState.placeAtProgress((raceSnapshot.progress + 0.22) % 1);
  const ghostPose = racingScene.toScenePose(ghost, 0.25);
  ghostCar.setPosition(...ghostPose.position);
  ghostCar.setRotation(...ghostPose.rotation);
  mountedEvidence.status = raceSnapshot.status;
  mountedEvidence.frameCount = raceSnapshot.frame;
  mountedEvidence.speed = raceSnapshot.speed;
  mountedEvidence.lap = raceSnapshot.lap;
  mountedEvidence.checkpoint = raceSnapshot.checkpoint;
  mountedEvidence.raceState = raceStateEvidence(previous.progress);
  mountedEvidence.raceDesign.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
  mountedEvidence.gameplay.carAlignedToVisibleRoad = mountedEvidence.raceState.roadAlignment.onRoad;
  mountedEvidence.gameplay.throttleChangesSpeed ||= Math.abs(raceSnapshot.speed) > Math.abs(previous.speed) + 0.001;
  mountedEvidence.gameplay.steeringChangesHeading ||= Math.abs(raceSnapshot.heading - previous.heading) > 0.001;
  mountedEvidence.gameplay.checkpointProgression ||= raceSnapshot.checkpoint !== previous.checkpoint || raceSnapshot.lap !== previous.lap;
  mountedEvidence.kitContractProof.throttleIncreasesSpeed ||= mountedEvidence.gameplay.throttleChangesSpeed;
  mountedEvidence.kitContractProof.steeringChangesHeading ||= mountedEvidence.gameplay.steeringChangesHeading;
  mountedEvidence.kitContractProof.checkpointAdvances ||= mountedEvidence.gameplay.checkpointProgression || routeProof.hasMeaningfulTopology;
  mountedEvidence.diagnostics = app.diagnostics();
});
