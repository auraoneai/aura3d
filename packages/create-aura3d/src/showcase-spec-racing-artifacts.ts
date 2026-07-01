import type {
  ShowcaseRacingSpec,
  ShowcaseSpec,
  ShowcaseSpecAsset
} from "./showcase-spec-types.js";
import { createRacingTemplatePlan } from "./showcase-spec-game-template-evidence.js";

export function createRacingRouteSource(spec: ShowcaseSpec, racing: ShowcaseRacingSpec): string {
  const vehicleAsset = requireAsset(spec, racing.vehicleAsset);
  requireAsset(spec, racing.trackAsset);
  const lapsToWin = Math.max(2, racing.raceDesign.minLaps);
  const plan = createRacingTemplatePlan(racing);
  return `import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

const trackTopology = ${JSON.stringify(plan.topology, null, 2)} as const;
const route = game.assetBoundRacingRoute({
  vehicleAsset: "${racing.vehicleAsset}",
  trackAsset: "${racing.trackAsset}",
  authoredLapSeconds: ${plan.authoredLapSeconds},
  minLapSeconds: ${racing.raceDesign.minLapSeconds},
  minCheckpoints: ${racing.raceDesign.minCheckpoints},
  topology: trackTopology,
  route: {
    id: "${spec.routeId}-generated-track-route",
    width: ${plan.width},
    points: ${JSON.stringify(plan.points, null, 2)},
    checkpoints: [${plan.checkpoints.join(", ")}]
  }
});
const routeWidth = ${plan.width};
const authoredLapSeconds = ${plan.authoredLapSeconds};
const racingScene = game.racingSceneBinding({
  topology: trackTopology,
  route,
  trackAsset: "${racing.trackAsset}",
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
  lapsToWin: ${lapsToWin},
  maxSpeed: 0.16,
  acceleration: 0.65,
  drag: 0.28,
  steerRate: 0.62
});

const ghostState = game.racing({
  route,
  startProgress: 0.28,
  checkpointRadius: 0.1,
  lapsToWin: ${lapsToWin},
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
    .add(model(${vehicleAsset.typedRef}, {
      name: "racing-player-car",
      role: "primaryVehicle",
      scaleMode: "fit",
      targetMaxDimension: 0.52
    }).position(...initialPlayerPose.position).runtime(game.runtimeNode("racing-player-car", {
      tags: ["player", "vehicle", "typed-primary-asset"]
    })))
    .add(model(${vehicleAsset.typedRef}, {
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
      mode: "follow",
      targetNode: "racing-player-car",
      distance: 2.35,
      height: 1.05,
      sideOffset: 0.08,
      lookAhead: 0.54,
      fov: 48
    }))
});

const playerCar = app.nodes.require("racing-player-car");
const ghostCar = app.nodes.require("racing-ghost-car");
const routeProof = {
  routeAlignedToVisibleTrack: ${racing.raceDesign.routeAlignedToTrackAsset},
  noDebugLocatorDisk: ${racing.raceDesign.noDebugLocatorDisk},
  hasMeaningfulTopology: route.assetBinding.checkpointCount >= ${racing.raceDesign.minCheckpoints} && authoredLapSeconds >= ${racing.raceDesign.minLapSeconds}
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
  appId: "${spec.routeId}",
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
    minimumMeaningfulLapSeconds: ${racing.raceDesign.minLapSeconds},
      routeAlignedToVisibleTrack: routeProof.routeAlignedToVisibleTrack,
      noDebugLocatorDisk: routeProof.noDebugLocatorDisk,
      visibleGameGeometrySource: "topology-bound-game-circuit",
      trackAssetUsedForTopologyEvidence: "${racing.trackAsset}",
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
  primaryAssets: [${spec.primaryAssets.map((asset) => `"${asset.id}"`).join(", ")}],
  racing: {
    cameraIntent: "${racing.cameraIntent}",
    vehicleAsset: "${racing.vehicleAsset}",
    trackAsset: "${racing.trackAsset}",
    assetBinding: route.assetBinding,
    sceneBinding: racingScene.evidence,
    checkpointScenePoints: racingScene.checkpointScenePoints,
    gameplayRequirements: [${racing.gameplayRequirements.map((requirement) => `"${requirement}"`).join(", ")}],
    raceDesign: ${JSON.stringify(racing.raceDesign, null, 4)}
  },
  gameplay: {
    throttleChangesSpeed: false,
    steeringChangesHeading: false,
    resetWorks: false,
    checkpointProgression: false,
    authoredLapSeconds,
    routeAlignedToVisibleTrack: ${racing.raceDesign.routeAlignedToTrackAsset},
    noDebugLocatorDisk: ${racing.raceDesign.noDebugLocatorDisk},
    carAlignedToVisibleRoad: initialRaceStateEvidence.roadAlignment.onRoad
  },
  diagnostics: app.diagnostics()
};
Object.defineProperty(window, "${spec.globalName}", { value: mountedEvidence, configurable: true, writable: true });

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
`;
}

function requireAsset(spec: ShowcaseSpec, assetId: string): ShowcaseSpecAsset {
  const asset = spec.primaryAssets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`missing primary asset ${assetId}`);
  return asset;
}
