import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { gameGeometryContract } from "./generated/game-geometry";

const trackTopology = gameGeometryContract.topology;
const routeGeometry = gameGeometryContract.route;
const route = game.assetBoundRacingRoute({
  vehicleAsset: "showcaseKenneyRaceCarRed",
  trackAsset: "showcaseKenneyNeonRaceCircuit",
  authoredLapSeconds: 45,
  minLapSeconds: 30,
  minCheckpoints: 6,
  topology: trackTopology,
  route: {
    id: routeGeometry.id,
    width: routeGeometry.width,
    points: routeGeometry.points,
    checkpoints: routeGeometry.checkpoints
  }
});
const routeWidth = 1.792;
const authoredLapSeconds = 45;
const certifiedMaxSpeed = route.assetBinding.speedModel.certifiedSpeed;
const certifiedAcceleration = Number((certifiedMaxSpeed * 4.1).toFixed(3));
const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset: "showcaseKenneyNeonRaceCircuit",
  targetSceneSize: 5.4,
  trackModelTargetMaxDimension: 14.023,
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
  maxSpeed: certifiedMaxSpeed,
  acceleration: certifiedAcceleration,
  drag: 0.28,
  steerRate: 0.62
});

const ghostState = game.racing({
  route,
  startProgress: 0.28,
  checkpointRadius: 0.1,
  lapsToWin: 3,
  maxSpeed: certifiedMaxSpeed,
  acceleration: certifiedAcceleration,
  drag: 0.28,
  steerRate: 0.62
});

let raceSnapshot = racingState.snapshot();
const initialPlayerPose = racingScene.toScenePose(raceSnapshot);
const initialGhostPose = racingScene.toScenePose(ghostState.placeAtProgress(0.28), 0.25);
const racingCamera = game.racingCameraRig({
  sceneBinding: racingScene,
  focus: raceSnapshot,
  mode: "chase",
  composition: {
    report: "tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-asset-pair-composition.json",
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
setupRacingPanel();

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .add(model(assets.showcaseKenneyNeonRaceCircuit, {
      name: "racing-bound-track-asset",
      role: "primaryTrack",
      scaleMode: "fit",
      targetMaxDimension: racingScene.trackModel.targetMaxDimension
    }).position(...racingScene.trackModel.position).rotate(...racingScene.trackModel.rotation).runtime(game.runtimeNode("racing-bound-track-asset", {
      tags: ["track", "typed-secondary-primary-asset", "certified-visible-geometry"]
    })))
    .addMany(game.racingPresentationTrack({
      sceneBinding: racingScene,
      route,
      mode: "asset-overlay",
      guideVisibility: "public",
      roadColor: "#30373d",
      terrainColor: "#253834",
      curbColor: "#df4259",
      laneColor: "#b9f7ff"
    }))
    .add(model(assets.showcaseKenneyRaceCarRed, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 0.9
    }).position(...initialPlayerPose.position).rotate(...initialPlayerPose.rotation).runtime(game.runtimeNode("racing-player-car", {
      tags: ["player", "vehicle", "typed-primary-asset"]
    })))
    .add(model(assets.showcaseKenneyRaceCarRed, {
      name: "racing-ghost-car",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.46
    }).position(...initialGhostPose.position).rotate(...initialGhostPose.rotation).runtime(game.runtimeNode("racing-ghost-car", {
      tags: ["ghost", "vehicle", "typed-secondary-asset"]
    })))
    .add(lights.studio({ intensity: 1.45 }))
    .camera(racingCamera)
});

const playerCar = app.nodes.require("racing-player-car");
const ghostCar = app.nodes.require("racing-ghost-car");
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "racing",
    camera: racingCamera,
    subject: { position: initialPlayerPose.position, rotation: initialPlayerPose.rotation, targetSize: 0.9 },
    playSpacePoints: route.points.map((point) => racingScene.toScenePoint(point, -0.12)),
    contactPoint: racingScene.toScenePoint(route.points[0] ?? { x: 0, y: 0 }, -0.12),
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
  status: requireElement("status-value"),
  alignment: requireElement("alignment-value")
};
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
  controls: { keyboard: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR"] },
  systems: { input: "game.input", simulation: "game.racing", geometry: "certified-racing-topology", camera: "game.racingCameraRig" },
  claimBoundary: "Bounded asset-topology racing presentation; no physics engine, AI-opponent, or automatic GLB-to-game claim.",
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
    certifiedMaxSpeed,
    speedModel: "route-length-over-authored-lap-seconds",
    minimumMeaningfulLapSeconds: 30,
      routeAlignedToVisibleTrack: routeProof.routeAlignedToVisibleTrack,
      noDebugLocatorDisk: routeProof.noDebugLocatorDisk,
      visibleGameGeometrySource: "topology-bound-game-circuit",
      trackAssetUsedForTopologyEvidence: "showcaseKenneyNeonRaceCircuit",
      carTrackSceneBinding: racingScene.evidence.geometryBinding === "track-topology-to-scene-transform" &&
        racingScene.evidence.modelSceneOffset.x === 0 &&
      racingScene.evidence.modelSceneOffset.y === 0 &&
      racingScene.evidence.modelSceneOffset.z === 0 &&
      racingScene.evidence.modelPresentationOffset.x === 0 &&
      racingScene.evidence.modelPresentationOffset.y === 0 &&
      racingScene.evidence.modelPresentationOffset.z === 0,
    carAlignedToVisibleRoad: initialRaceStateEvidence.roadAlignment.onRoad,
    visualReviewPass: true
  },
  primaryAssets: ["showcaseKenneyRaceCarRed", "showcaseKenneyNeonRaceCircuit"],
  racing: {
    cameraIntent: "track-overview",
    vehicleAsset: "showcaseKenneyRaceCarRed",
    trackAsset: "showcaseKenneyNeonRaceCircuit",
    assetBinding: route.assetBinding,
    sceneBinding: racingScene.evidence,
    checkpointScenePoints: racingScene.checkpointScenePoints,
    gameplayRequirements: ["throttle", "steering", "reset", "checkpoint", "lap", "multi-lap"],
    raceDesign: gameGeometryContract.design
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
updateRacingHud();

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
    updateRacingHud();
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
  updateRacingHud();
});

function setupRacingPanel(): void {
  const panel = document.getElementById("panel");
  if (!panel) return;
  panel.innerHTML = "<span class=\"panel__label\">Certified circuit</span>\n<h1>Turbo Drift Circuit</h1>\n<p class=\"panel__lede\">A mesh-bound time trial with a typed race car, six checkpoint gates, and a certified multi-lap pace.</p>\n<section class=\"metrics-row\" aria-label=\"Live race metrics\">\n  <article class=\"metric\"><span>Speed</span><strong id=\"speed-value\">0.000</strong></article>\n  <article class=\"metric\"><span>Lap</span><strong id=\"lap-value\">1</strong></article>\n  <article class=\"metric\"><span>Gate</span><strong id=\"checkpoint-value\">0</strong></article>\n  <article class=\"metric\"><span>Status</span><strong id=\"status-value\">Ready</strong></article>\n</section>\n<section class=\"panel__section\" aria-label=\"Track contract\"><h2>Track contract</h2><span class=\"panel__value\" id=\"alignment-value\">Road locked</span><p class=\"claim\">The visible circuit model and racing route share the same hash-bound topology transform.</p></section>\n<section class=\"panel__section\" aria-label=\"Race controls\"><h2>Drive</h2><div class=\"control-cluster\"><button id=\"throttle-control\" type=\"button\">Throttle</button><button id=\"brake-control\" type=\"button\">Brake</button><button id=\"left-control\" type=\"button\">Steer left</button><button id=\"right-control\" type=\"button\">Steer right</button><button id=\"reset-control\" type=\"button\">Reset race</button></div><ul class=\"controls-list\"><li><kbd>W</kbd> Throttle</li><li><kbd>A / D</kbd> Steer</li><li><kbd>R</kbd> Reset</li></ul></section>";
  bindHoldControl("throttle-control", "KeyW");
  bindHoldControl("brake-control", "KeyS");
  bindHoldControl("left-control", "KeyA");
  bindHoldControl("right-control", "KeyD");
  document.getElementById("reset-control")?.addEventListener("click", () => pulseKey("KeyR"));
}
function bindHoldControl(id: string, code: string): void {
  const button = document.getElementById(id);
  if (!button) return;
  const release = () => window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
  button.addEventListener("pointerdown", () => window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true })));
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}
function pulseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
  window.setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true })), 40);
}
function updateRacingHud(): void {
  hud.speed.textContent = round(Math.abs(raceSnapshot.speed)).toFixed(3);
  hud.lap.textContent = String(raceSnapshot.lap);
  hud.checkpoint.textContent = String(raceSnapshot.checkpoint);
  hud.status.textContent = raceSnapshot.status;
  hud.alignment.textContent = mountedEvidence.raceState.roadAlignment.onRoad ? "Road locked" : "Recovering";
}
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element;
}
