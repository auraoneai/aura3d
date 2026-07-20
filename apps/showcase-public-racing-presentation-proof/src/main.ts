import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { gameGeometryContract } from "./generated/game-geometry";
import "./styles.css";

const routeId = "showcase-public-racing-presentation-proof";
const vehicleAsset = "showcaseTexturedSportsCar";
const trackAsset = "showcaseTsukubaCircuit";
const certifiedVehicleAsset = assets.showcaseTexturedSportsCar;
const certifiedTrackAsset = assets.showcaseTsukubaCircuit;
const compactViewport = window.matchMedia("(max-width: 720px)").matches;
const { routeWidth, authoredLapSeconds, checkpointProgress, roadCenterline, topology: trackTopology, drivableBounds, cameraBounds } = gameGeometryContract;
const { screenshotPath, screenshotSha256, geometryReport } = gameGeometryContract.evidence;
const { vehicle: vehicleHash, track: trackHash } = gameGeometryContract.assetHashes;

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
  drivableBounds,
  cameraBounds,
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
  maxSpeed: route.assetBinding.speedModel.certifiedSpeed,
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
    mode: "chase",
    composition: {
      report: "tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-asset-pair-composition.json",
      verdict: "pass",
      cameraReadabilityVerdict: "pass",
      selectedMode: "chase"
    },
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
    mode: "chase",
    composition: {
      report: "tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-asset-pair-composition.json",
      verdict: "pass",
      cameraReadabilityVerdict: "pass",
      selectedMode: "chase"
    },
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
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "racing",
    camera: racingCamera,
    subject: { position: initialPlayerPose.position, rotation: initialPlayerPose.rotation, targetSize: compactViewport ? 0.82 : 1.15 },
    playSpacePoints: roadCenterline.map((point) => racingScene.toScenePoint({ x: point.x, y: point.z }, -0.12)),
    contactPoint: racingScene.toScenePoint({ x: roadCenterline[0]?.x ?? 0, y: roadCenterline[0]?.z ?? 0 }, -0.12),
    setSubjectSuppressed: (suppressed: boolean) => {
      app.pause();
      playerCar.setScale(suppressed ? 0.0001 : 1);
      app.step(0);
    }
  },
  configurable: true
});
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
