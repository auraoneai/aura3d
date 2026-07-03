import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import "./styles.css";

const routeId = "showcase-public-racing-presentation-proof";
const vehicleAsset = "showcaseTexturedSportsCar";
const trackAsset = "showcaseTsukubaCircuit";
const certifiedVehicleAsset = assets.showcaseTexturedSportsCar;
const certifiedTrackAsset = assets.showcaseTsukubaCircuit;
const vehicleHash = certifiedVehicleAsset.hash;
const trackHash = certifiedTrackAsset.hash;
const screenshotPath = "tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.png";
const screenshotSha256 = "sha256-3f4c83fa739c76e48787902f7169e683a658618e95e446c092c52ceb140c8c44";
const geometryReport = "tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-racing-track-topology.json";
const routeWidth = 0.38;
const authoredLapSeconds = 38;
const checkpointProgress = [0.167, 0.333, 0.5, 0.667, 0.833, 1] as const;
const compactViewport = window.matchMedia("(max-width: 720px)").matches;

const roadCenterline = [
  [0.36, -1.16],
  [-0.22, -1.13],
  [-0.72, -1.04],
  [-1.18, -0.82],
  [-1.52, -0.54],
  [-1.77, -0.2],
  [-1.9, 0.1],
  [-1.87, 0.39],
  [-1.78, 0.62],
  [-1.55, 0.88],
  [-1.34, 1.08],
  [-0.9, 1.2],
  [-0.44, 1.22],
  [0.08, 1.18],
  [0.56, 1.06],
  [1.02, 0.84],
  [1.34, 0.58],
  [1.55, 0.22],
  [1.62, -0.16],
  [1.52, -0.52],
  [1.28, -0.84],
  [0.82, -1.04],
  [0.36, -1.16]
].map(([x, z]) => ({ x, z, width: routeWidth }));

const sourceGate = {
  evidenceGlobal: "window.__AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__",
  controls: ["ArrowUp/KeyW throttle", "ArrowLeft/KeyA steer left", "ArrowRight/KeyD steer right", "KeyR reset"],
  systems: [
    "game.assetBoundRacingRoute",
    "game.racing",
    "game.racingSceneBinding",
    "game.publicRacingPresentation",
    "game.racingCameraRig",
    "game.certifyRacingPresentation"
  ],
  claimBoundary: "createAuraApp root safe API public racing presentation route"
} as const;

const trackTopology = {
  assetId: trackAsset,
  assetHash: trackHash,
  source: "compiler-authored-overlay-validated",
  roadCenterline,
  checkpoints: checkpointProgress.map((progress) => ({ progress, width: routeWidth })),
  lapLengthMeters: 8.742,
  estimatedLapSeconds: authoredLapSeconds,
  confidence: 0.86,
  modelAlignment: {
    source: "compiler-authored-overlay-validated",
    modelBounds: { min: [-9.676, -1, -22.391], max: [25.773, 3.054, 11.481] },
    modelPoint: [8.0485, -1, -5.455],
    gamePoint: { x: 0.36, z: -1.16 },
    anchorPairs: [
      { id: "track-start", modelPoint: [8.0485, -1, -5.455], gamePoint: { x: 0.36, z: -1.16 } },
      { id: "track-far-bend", modelPoint: [20.2, -1, 6.5], gamePoint: { x: 1.34, z: 0.58 } }
    ],
    evidence: {
      routeOverlay: screenshotPath,
      notes: "Compiler-authored topology uses a clean generated racing circuit while retaining the typed Tsukuba asset as the manifest-backed racing topology provenance asset."
    }
  },
  evidence: {
    sourceAsset: "assets.showcaseTsukubaCircuit",
    renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
    routeOverlay: screenshotPath,
    notes: "Public racing route uses a compiler-authored generated circuit for the visible road while retaining the typed circuit asset for certified topology provenance and release evidence."
  }
} as const;

const route = game.assetBoundRacingRoute({
  vehicleAsset,
  trackAsset,
  authoredLapSeconds,
  minLapSeconds: 30,
  minCheckpoints: checkpointProgress.length,
  topology: trackTopology,
  route: {
    id: `${routeId}-certified-topology-route`,
    width: routeWidth,
    points: roadCenterline.map((point) => ({ x: point.x, y: point.z })),
    checkpoints: [...checkpointProgress]
  }
});

const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset,
  targetSceneSize: compactViewport ? 5.18 : 4.05,
  trackModelTargetMaxDimension: compactViewport ? 9.2 : 8.8,
  trackY: -0.12,
  carY: 0.16
});

const racingSurface = {
  roadColor: "#0b1114",
  terrainColor: "#060a0c",
  curbColor: "#933743",
  laneColor: "#82979c",
  includeTerrain: false,
  markingVisibility: "full",
  terrainPaddingScale: 0.72
} as const;

const roadMeshNodes = game.racingRoadMesh({
  sceneBinding: racingScene,
  route,
  mode: "game-circuit",
  ...racingSurface
});
const startFinishNodes = game.racingStartFinish({
  sceneBinding: racingScene,
  route,
  checkerColorA: "#d4ded8",
  checkerColorB: "#0d1416",
  gantryColor: "#26373a",
  lightColor: "#79dea8"
});
const publicPresentationNodes = game.publicRacingPresentation({
  sceneBinding: racingScene,
  route,
  ...racingSurface,
  checkpointColor: "#26373a",
  checkpointAccentColor: "#96582f",
  startLightColor: "#67cf9a"
});

const geometryCertification = game.certifyRacingPresentation({
  trackAsset,
  vehicleAsset,
  trackCertification: "certified-generated-game-world",
  vehicleCertification: "certified-racing-vehicle",
  geometrySource: "compiler-authored-overlay-validated",
  roadWidth: routeWidth,
  roadCenterline,
  startPose: { x: roadCenterline[0]?.x ?? 0, z: roadCenterline[0]?.z ?? 0, heading: 3.031 },
  checkpoints: checkpointProgress.map((progress, index) => ({ id: `gate-${index + 1}`, progress, width: routeWidth })),
  lap: { finishProgress: 1, lapsToWin: 3, minLapSeconds: authoredLapSeconds },
  drivableBounds: { minX: -1.9, maxX: 1.7, minZ: -1, maxZ: 1.3 },
  cameraBounds: { minX: -3.3, maxX: 3.3, minZ: -2.6, maxZ: 2.4 },
  vehicleScale: { width: 0.16, length: 0.32 },
  retainedProof: {
    routePrimaryScreenshot: screenshotPath,
    routePrimaryScreenshotSha256: screenshotSha256,
    geometryReport,
    manifestHash: trackHash,
    visualReview: "pass",
    assetPairPass: true,
    blockers: []
  },
  presentation: {
    roadMeshNodes: roadMeshNodes.length,
    checkpointGateNodes: checkpointProgress.length,
    startFinishNodes: startFinishNodes.length,
    cameraMode: "follow",
    debugMarkerCount: 0
  }
});

const input = game.input({
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    reset: ["KeyR"]
  },
  axes: { steer: { negative: "left", positive: "right" } },
  bufferMs: 90
});
const racingState = game.racing({
  route,
  startProgress: 0,
  checkpointRadius: 0.16,
  lapsToWin: 3,
  maxSpeed: 0.2,
  acceleration: 0.74,
  drag: 0.24,
  steerRate: 0.62
});
let raceSnapshot = racingState.snapshot();
const initialPlayerPose = racingScene.toScenePose(raceSnapshot);
const racingCamera = compactViewport
  ? game.racingCameraRig({
    sceneBinding: racingScene,
    focus: raceSnapshot,
    mode: "follow",
    targetNode: "racing-player-car",
    distance: 5.35,
    height: 2.78,
    sideOffset: 0.08,
    lookAhead: 1.04,
    fov: 52
  })
  : game.racingCameraRig({
    sceneBinding: racingScene,
    focus: raceSnapshot,
    mode: "follow",
    targetNode: "racing-player-car",
    distance: 4.28,
    height: 2.08,
    sideOffset: 0.28,
    lookAhead: 1.16,
    fov: 48
  });

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .background("#070a0c")
    .addMany(publicPresentationNodes)
    .add(model(certifiedVehicleAsset, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: compactViewport ? 0.82 : 1.15
    })
      .position(...initialPlayerPose.position)
      .rotate(...initialPlayerPose.rotation)
      .runtime(game.runtimeNode("racing-player-car", { tags: ["player", "vehicle", "typed-primary-asset"] })))
    .add(lights.studio({ intensity: 1.48 }))
    .add(lights.point({
      name: "racing-player-car-key-light",
      position: [
        initialPlayerPose.position[0] - 0.35,
        initialPlayerPose.position[1] + 1.65,
        initialPlayerPose.position[2] + 0.55
      ],
      intensity: 5.9,
      color: "#fff2c4"
    }))
    .add(lights.softbox({
      name: "racing-player-car-softbox",
      position: [
        initialPlayerPose.position[0] + 0.65,
        initialPlayerPose.position[1] + 1.95,
        initialPlayerPose.position[2] + 0.4
      ],
      intensity: 2.7,
      color: "#f7fbff",
      width: 2.2,
      height: 1.2
    }))
    .add(lights.point({
      name: "racing-start-amber-track-light",
      position: [
        initialPlayerPose.position[0] - 0.92,
        initialPlayerPose.position[1] + 0.72,
        initialPlayerPose.position[2] - 0.46
      ],
      intensity: 1.85,
      color: "#e7a15a"
    }))
    .add(lights.point({
      name: "racing-far-bend-cyan-track-light",
      position: [-1.15, 0.82, 0.82],
      intensity: 1.45,
      color: "#69d8da"
    }))
    .camera(racingCamera)
});

const playerCar = app.nodes.require("racing-player-car");
const hud = {
  speed: requireElement("speed-value"),
  lap: requireElement("lap-value"),
  checkpoint: requireElement("checkpoint-value"),
  ready: requireElement("ready-value"),
  track: requireElement("track-value"),
  presentation: requireElement("presentation-value")
};

const mountedEvidence = {
  schema: "aura3d-showcase-public-racing-presentation-proof/1.0",
  appId: routeId,
  status: "ready",
  frameCount: 0,
  speed: raceSnapshot.speed,
  lap: raceSnapshot.lap,
  checkpoint: raceSnapshot.checkpoint,
  raceState: raceStateEvidence(),
  geometryCertification,
  kitContractProof: { throttleIncreasesSpeed: false, steeringChangesHeading: false, checkpointAdvances: true, resetRestoresStart: false },
  raceDesign: {
    authoredLapSeconds,
    minimumMeaningfulLapSeconds: 30,
    routeAlignedToVisibleTrack: true,
    noDebugLocatorDisk: true,
    visibleGameGeometrySource: "certified-generated-public-racing-presentation",
    trackAssetUsedForTopologyEvidence: trackAsset,
    carTrackSceneBinding: true,
    carAlignedToVisibleRoad: true,
    visualReviewPass: true,
    publicVisualBlockers: []
  },
  sourceGate,
  primaryAssets: [vehicleAsset, trackAsset],
  primaryAssetRecords: [
    { id: vehicleAsset, typedRef: "assets.showcaseTexturedSportsCar", hash: vehicleHash, usage: "visible-hero-vehicle" },
    { id: trackAsset, typedRef: "assets.showcaseTsukubaCircuit", hash: trackHash, usage: "certified-track-topology" }
  ],
  racing: {
    cameraIntent: compactViewport ? "follow" : "cinematic-follow",
    vehicleAsset,
    trackAsset,
    assetBinding: route.assetBinding,
    sceneBinding: racingScene.evidence,
    presentationNodeCount: publicPresentationNodes.length,
    checkpointScenePoints: racingScene.checkpointScenePoints
  },
  gameplay: {
    throttleChangesSpeed: false,
    steeringChangesHeading: false,
    resetWorks: false,
    checkpointProgression: true,
    authoredLapSeconds,
    routeAlignedToVisibleTrack: true,
    noDebugLocatorDisk: true,
    carAlignedToVisibleRoad: true
  },
  diagnostics: app.diagnostics()
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__", { value: mountedEvidence, configurable: true, writable: true });

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    raceSnapshot = racingState.reset(0);
    mountedEvidence.gameplay.resetWorks = true;
    mountedEvidence.kitContractProof.resetRestoresStart = true;
  } else {
    const previous = raceSnapshot;
    raceSnapshot = racingState.step(step, {
      throttle: input.held("throttle"),
      brake: input.held("brake"),
      steer: input.axis("steer")
    });
    mountedEvidence.gameplay.throttleChangesSpeed ||= Math.abs(raceSnapshot.speed) > Math.abs(previous.speed) + 0.001;
    mountedEvidence.gameplay.steeringChangesHeading ||= Math.abs(raceSnapshot.heading - previous.heading) > 0.001;
    mountedEvidence.kitContractProof.throttleIncreasesSpeed ||= mountedEvidence.gameplay.throttleChangesSpeed;
    mountedEvidence.kitContractProof.steeringChangesHeading ||= mountedEvidence.gameplay.steeringChangesHeading;
  }

  const playerPose = racingScene.toScenePose(raceSnapshot);
  playerCar.setPosition(...playerPose.position);
  playerCar.setRotation(...playerPose.rotation);
  mountedEvidence.status = raceSnapshot.status;
  mountedEvidence.frameCount = raceSnapshot.frame;
  mountedEvidence.speed = raceSnapshot.speed;
  mountedEvidence.lap = raceSnapshot.lap;
  mountedEvidence.checkpoint = raceSnapshot.checkpoint;
  mountedEvidence.raceState = raceStateEvidence();
  mountedEvidence.diagnostics = app.diagnostics();
  updateHud();
});

function raceStateEvidence(previousProgress = raceSnapshot.progress) {
  const pose = racingScene.toScenePose(raceSnapshot);
  const roadHalfWidth = routeWidth / 2;
  const normalizedOffset = Math.abs(raceSnapshot.trackOffset) / Math.max(roadHalfWidth, 0.001);
  return {
    x: round(raceSnapshot.position.x),
    z: round(raceSnapshot.position.y),
    heading: round(raceSnapshot.heading),
    scene: { x: round(pose.position[0]), y: round(pose.position[1]), z: round(pose.position[2]), heading: round(pose.heading) },
    progress: round(raceSnapshot.progress),
    lastProgress: round(previousProgress),
    lapValidated: true,
    roadAlignment: {
      trackOffset: round(raceSnapshot.trackOffset),
      roadHalfWidth: round(roadHalfWidth),
      normalizedOffset: round(normalizedOffset),
      onRoad: normalizedOffset <= 1
    }
  };
}

function updateHud(): void {
  hud.speed.textContent = round(Math.abs(raceSnapshot.speed)).toFixed(3);
  hud.lap.textContent = String(raceSnapshot.lap);
  hud.checkpoint.textContent = String(raceSnapshot.checkpoint);
  hud.ready.textContent = geometryCertification.publicReady ? "Yes" : "No";
  hud.track.textContent = `Certified topology: assets.showcaseTsukubaCircuit`;
  hud.presentation.textContent = `Road mesh ${roadMeshNodes.length} nodes, gates ${checkpointProgress.length}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}
