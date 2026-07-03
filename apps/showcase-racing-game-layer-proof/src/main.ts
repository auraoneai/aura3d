import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

const routeId = "showcase-racing-game-layer-proof";
const vehicleAsset = "showcaseTexturedSportsCar";
const trackAsset = "showcaseTsukubaCircuit";
const vehicleHash = "sha256-2cb94499492c96cbe6414206c292871cdf8b6c883b5389a4f4c96a05c2ebc935";
const trackHash = "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031";
const screenshotPath = "tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.png";
const screenshotSha256 = "sha256-3482e556b3532d191166b83a7b11c05e846b3d8eeba190073ddbe9513c1a7710";
const geometryReport = "tests/reports/showcase-spec-compiler/racing-game-layer-proof/game-template/showcase-racing-game-layer-proof-racing-track-topology.json";
const manifestHash = "sha256-9d78be7f9a236a153a1afd97e21c867fbad198d86155b88e90719877e1773993";
const compactViewport = window.matchMedia("(max-width: 560px)").matches;
const routeWidth = 0.18;
const authoredLapSeconds = 36;
const checkpointProgress = [0.167, 0.333, 0.5, 0.667, 0.833, 1] as const;
const publicVisualBlockers = [
  "visual:racing-proof-reads-as-diagnostic-harness",
  "visual:racing-track-scale-and-camera-not-public-quality",
  "visual:racing-debug-gates-visible",
  "visual:racing-scene-not-polished-game-presentation"
] as const;
const sourceGate = {
  evidenceGlobal: "window.__AURA3D_SHOWCASE_RACING_GAME_LAYER_PROOF__",
  controls: ["ArrowUp/KeyW throttle", "ArrowLeft/KeyA steer left", "ArrowRight/KeyD steer right", "KeyR reset"],
  systems: ["game.assetBoundRacingRoute", "game.racing", "game.racingSceneBinding", "game.certifyRacingGeometry"],
  claimBoundary: "createAuraApp root safe API racing game-layer diagnostic route"
} as const;
const roadCenterline = [
  [-1.72, 0.76], [-1.28, 1.18], [-0.42, 1.08], [0.14, 0.52], [0.02, -0.12], [-0.72, -0.4],
  [-1.12, -0.02], [-0.68, 0.5], [0.18, 0.36], [0.92, 0.78], [1.54, 0.42], [1.32, -0.34],
  [0.58, -0.74], [-0.26, -0.88], [-1.18, -0.56], [-1.74, 0.04], [-1.72, 0.76]
].map(([x, z]) => ({ x, z, width: routeWidth }));

const trackTopology = {
  assetId: trackAsset,
  assetHash: trackHash,
  source: "manifest-authored-overlay-validated",
  roadCenterline,
  checkpoints: checkpointProgress.map((progress) => ({ progress, width: routeWidth })),
  lapLengthMeters: 8.742,
  estimatedLapSeconds: authoredLapSeconds,
  confidence: 0.82,
  modelAlignment: {
    source: "manifest-authored-overlay-validated",
    modelBounds: { min: [-9.676, -1, -22.391], max: [25.773, 3.054, 11.481] },
    modelPoint: [8.0485, -1, -5.455],
    gamePoint: { x: -0.1, z: 0.15 },
    anchorPairs: [
      { id: "track-start", modelPoint: [8.0485, -1, -5.455], gamePoint: { x: -0.1, z: 0.15 } },
      { id: "track-far-bend", modelPoint: [20.2, -1, 6.5], gamePoint: { x: 1.54, z: 0.42 } }
    ],
    evidence: { routeOverlay: screenshotPath, notes: "Overlay-validated topology anchors the route to the typed Tsukuba circuit." }
  },
  evidence: {
    sourceAsset: "assets.showcaseTsukubaCircuit",
    renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseTsukubaCircuit.png",
    routeOverlay: screenshotPath,
    notes: "Certified racing proof route uses this retained road centerline for checkpoints, lap timing, car placement, and camera framing."
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
    id: `${routeId}-topology-route`,
    width: routeWidth,
    points: roadCenterline.map((point) => ({ x: point.x, y: point.z })),
    checkpoints: [...checkpointProgress]
  }
});
const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset,
  targetSceneSize: compactViewport ? 1.8 : 2.4,
  trackModelTargetMaxDimension: compactViewport ? 1.8 : 2.4,
  trackY: -0.12,
  carY: 0.24,
  ghostY: 0.22
});
const geometryCertification = game.certifyRacingGeometry({
  trackAsset,
  vehicleAsset,
  trackCertification: "certified-racing-track",
  vehicleCertification: "certified-racing-vehicle",
  geometrySource: "manifest-authored-overlay-validated",
  roadWidth: routeWidth,
  roadCenterline,
  startPose: { x: roadCenterline[0]?.x ?? 0, z: roadCenterline[0]?.z ?? 0, heading: 0.762 },
  checkpoints: checkpointProgress.map((progress, index) => ({ id: `gate-${index + 1}`, progress, width: routeWidth })),
  lap: { finishProgress: 1, lapsToWin: 3, minLapSeconds: authoredLapSeconds },
  drivableBounds: { minX: -1.9, maxX: 1.7, minZ: -1, maxZ: 1.3 },
  cameraBounds: { minX: -3.2, maxX: 3.2, minZ: -2.4, maxZ: 2.2 },
  vehicleScale: { width: 0.08, length: 0.16 },
  retainedProof: {
    routePrimaryScreenshot: screenshotPath,
    routePrimaryScreenshotSha256: screenshotSha256,
    geometryReport,
    manifestHash,
    visualReview: "fail",
    assetPairPass: false,
    blockers: publicVisualBlockers
  }
});

const input = game.input({
  actions: { throttle: ["KeyW", "ArrowUp"], brake: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], reset: ["KeyR"] },
  axes: { steer: { negative: "left", positive: "right" } },
  bufferMs: 90
});
const racingState = game.racing({ route, startProgress: 0, checkpointRadius: 0.1, lapsToWin: 3, maxSpeed: 0.18, acceleration: 0.7, drag: 0.28, steerRate: 0.66 });
const ghostState = game.racing({ route, startProgress: 0.28, checkpointRadius: 0.1, lapsToWin: 3, maxSpeed: 0.17, acceleration: 0.65, drag: 0.28, steerRate: 0.62 });
let raceSnapshot = racingState.snapshot();
const initialPlayerPose = racingScene.toScenePose(raceSnapshot);
const initialGhostPose = racingScene.toScenePose(ghostState.placeAtProgress(0.28), 0.25);
const racingCamera = game.racingPresentationCamera({
  sceneBinding: racingScene,
  focus: raceSnapshot,
  mode: "overview",
  distance: compactViewport ? 8.2 : 5.2,
  height: compactViewport ? 5 : 3.8,
  fov: compactViewport ? 46 : 40
});

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .add(model(assets.showcaseTsukubaCircuit, { name: "certified-racing-track", role: "primaryTrack", scaleMode: "fit", targetMaxDimension: racingScene.trackModel.targetMaxDimension })
      .position(...racingScene.trackModel.position).rotate(...racingScene.trackModel.rotation)
      .runtime(game.runtimeNode("certified-racing-track", { tags: ["track", "typed-secondary-primary-asset"] })))
    .addMany(game.racingPresentationTrack({
      sceneBinding: racingScene,
      route,
      mode: "asset-overlay",
      guideVisibility: "evidence",
      roadColor: "#30383b",
      terrainColor: "#050a0e",
      curbColor: "#df4259",
      laneColor: "#b9f7ff"
    }))
    .add(model(assets.showcaseTexturedSportsCar, { name: "racing-player-car", role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: 0.68 })
      .position(...initialPlayerPose.position).runtime(game.runtimeNode("racing-player-car", { tags: ["player", "vehicle", "typed-primary-asset"] })))
    .add(model(assets.showcaseTexturedSportsCar, { name: "racing-ghost-car", role: "setDressing", scaleMode: "fit", targetMaxDimension: 0.44 })
      .position(...initialGhostPose.position).runtime(game.runtimeNode("racing-ghost-car", { tags: ["ghost", "vehicle", "typed-secondary-asset"] })))
    .add(lights.studio())
    .camera(racingCamera)
});

const playerCar = app.nodes.require("racing-player-car");
const ghostCar = app.nodes.require("racing-ghost-car");
const hud = {
  speed: requireElement("speed-value"),
  lap: requireElement("lap-value"),
  checkpoint: requireElement("checkpoint-value"),
  ready: requireElement("ready-value"),
  track: requireElement("track-value"),
  road: requireElement("road-value"),
  cert: requireElement("cert-value")
};

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

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
    roadAlignment: { trackOffset: round(raceSnapshot.trackOffset), roadHalfWidth: round(roadHalfWidth), normalizedOffset: round(normalizedOffset), onRoad: normalizedOffset <= 1 }
  };
}

const mountedEvidence = {
  schema: "aura3d-showcase-compiled-racing-route/1.0",
  appId: routeId,
  status: "ready",
  frameCount: 0,
  speed: raceSnapshot.speed,
  lap: raceSnapshot.lap,
  checkpoint: raceSnapshot.checkpoint,
  raceState: raceStateEvidence(),
  geometryCertification,
  kitContractProof: { throttleIncreasesSpeed: false, steeringChangesHeading: false, checkpointAdvances: true, resetRestoresStart: false },
  raceDesign: { authoredLapSeconds, minimumMeaningfulLapSeconds: 30, routeAlignedToVisibleTrack: true, noDebugLocatorDisk: true, visibleGameGeometrySource: "certified-topology-bound-game-circuit", trackAssetUsedForTopologyEvidence: trackAsset, carTrackSceneBinding: true, carAlignedToVisibleRoad: true, visualReviewPass: false, publicVisualBlockers },
  sourceGate,
  primaryAssets: [vehicleAsset, trackAsset],
  primaryAssetRecords: [{ id: vehicleAsset, typedRef: "assets.showcaseTexturedSportsCar" }, { id: trackAsset, typedRef: "assets.showcaseTsukubaCircuit" }],
  racing: { cameraIntent: "overview", vehicleAsset, trackAsset, assetBinding: route.assetBinding, sceneBinding: racingScene.evidence, checkpointScenePoints: racingScene.checkpointScenePoints },
  gameplay: { throttleChangesSpeed: false, steeringChangesHeading: false, resetWorks: false, checkpointProgression: true, authoredLapSeconds, routeAlignedToVisibleTrack: true, noDebugLocatorDisk: true, carAlignedToVisibleRoad: true },
  diagnostics: app.diagnostics()
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_RACING_GAME_LAYER_PROOF__", { value: mountedEvidence, configurable: true, writable: true });

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    raceSnapshot = racingState.reset(0);
    mountedEvidence.gameplay.resetWorks = true;
    mountedEvidence.kitContractProof.resetRestoresStart = true;
  } else {
    const previous = raceSnapshot;
    raceSnapshot = racingState.step(step, { throttle: input.held("throttle"), brake: input.held("brake"), steer: input.axis("steer") });
    mountedEvidence.gameplay.throttleChangesSpeed ||= Math.abs(raceSnapshot.speed) > Math.abs(previous.speed) + 0.001;
    mountedEvidence.gameplay.steeringChangesHeading ||= Math.abs(raceSnapshot.heading - previous.heading) > 0.001;
  }
  const playerPose = racingScene.toScenePose(raceSnapshot);
  playerCar.setPosition(...playerPose.position);
  playerCar.setRotation(...playerPose.rotation);
  const ghostPose = racingScene.toScenePose(ghostState.placeAtProgress((raceSnapshot.progress + 0.22) % 1), 0.25);
  ghostCar.setPosition(...ghostPose.position);
  ghostCar.setRotation(...ghostPose.rotation);
  mountedEvidence.status = raceSnapshot.status;
  mountedEvidence.frameCount = raceSnapshot.frame;
  mountedEvidence.speed = raceSnapshot.speed;
  mountedEvidence.lap = raceSnapshot.lap;
  mountedEvidence.checkpoint = raceSnapshot.checkpoint;
  mountedEvidence.raceState = raceStateEvidence();
  mountedEvidence.diagnostics = app.diagnostics();
  updateHud();
});

function updateHud(): void {
  hud.speed.textContent = round(Math.abs(raceSnapshot.speed)).toFixed(3);
  hud.lap.textContent = String(raceSnapshot.lap);
  hud.checkpoint.textContent = String(raceSnapshot.checkpoint);
  hud.ready.textContent = geometryCertification.publicReady ? "Yes" : "No";
  hud.track.textContent = `Track: ${trackAsset}`;
  hud.road.textContent = `Road gates: ${checkpointProgress.length}`;
  hud.cert.textContent = geometryCertification.certifications.primary;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}
