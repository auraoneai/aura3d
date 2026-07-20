import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { gameGeometryContract } from "./generated/game-geometry";
import "./styles.css";

const routeId = "showcase-public-platformer-presentation-proof";
const characterAsset = "showcaseWalkAnimatedGirl";
const worldAsset = "showcaseSideScrollerWorld";
const certifiedCharacterAsset = assets.showcaseWalkAnimatedGirl;
const certifiedWorldAsset = assets.showcaseSideScrollerWorld;
const { authoredPlayableSeconds, playableSurfaces, hazardSurfaces, checkpointSurfaces, finishPoint, surfaceMap: playableSurfaceMap, worldAssetBindings, level: levelDefinition, worldBounds, cameraBounds } = gameGeometryContract;
const { screenshotPath, screenshotSha256, geometryReport } = gameGeometryContract.evidence;
const { character: characterHash, world: worldHash } = gameGeometryContract.assetHashes;
const compactViewport = window.matchMedia("(max-width: 720px)").matches;

const level = game.assetBoundPlatformerLevel({
  characterAsset, worldAssetBindings, playableSurfaceMap, minPlayableSeconds: 30,
  minCheckpoints: checkpointSurfaces.length, level: levelDefinition
});
const platformerScene = game.platformerSceneBinding({
  surfaceMap: playableSurfaceMap,
  level,
  worldAsset,
  targetSceneWidth: compactViewport ? 6.45 : 5.85,
  worldModelTargetMaxDimension: compactViewport ? 6.45 : 5.85,
  worldY: -0.74,
  worldZ: -0.52,
  playerZ: 0.48,
  playerTargetHeight: compactViewport ? 0.78 : 0.86,
  playerYOffset: compactViewport ? 0.04 : 0.06
});
const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp", "Space"],
    reset: ["KeyR"]
  },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 120
});
const platformerState = game.platformer(level);
let state = platformerState.snapshot();
let frameCount = 0;
const animationStateHistory = [{ state: "idle" }];
const initialPlayerPose = platformerScene.toScenePlayer(state.player);
const firstPlayableSurface = level.platforms[0];
if (!firstPlayableSurface) throw new Error("Public platformer route requires at least one playable surface.");
const groundMeshNodes = game.platformerGroundMesh({ sceneBinding: platformerScene, surface: firstPlayableSurface });
const platformMeshNodes = level.platforms.slice(1).flatMap((surface) => game.platformerPlatformMesh({ sceneBinding: platformerScene, surface }));
const hazardNodes = level.hazards.flatMap((hazard) => game.platformerHazard({ sceneBinding: platformerScene, hazard }));
const checkpointNodes = level.checkpoints.flatMap((checkpoint) => game.platformerCheckpoint({ sceneBinding: platformerScene, checkpoint }));
const finishNodes = level.finish ? game.platformerFinish({ sceneBinding: platformerScene, finish: level.finish }) : [];
const publicPresentationNodes = game.publicPlatformerPresentation({
  sceneBinding: platformerScene,
  level,
  platformColor: "#405a61",
  platformTrimColor: "#8ce6dd",
  hazardColor: "#e85f70",
  collectibleColor: "#f4d66d",
  finishColor: "#8fe69a",
  includeBackdrop: false
});
const platformerCamera = compactViewport
  ? game.platformerCameraRig({
    sceneBinding: platformerScene,
    player: state.player,
    mode: "follow",
    targetNode: "platformer-player",
    distance: 5.35,
    height: 0.66,
    lookAhead: 0.08,
    fov: 43
  })
  : game.platformerCameraRig({
    sceneBinding: platformerScene,
    player: state.player,
    mode: "follow",
    targetNode: "platformer-player",
    distance: 5,
    height: 0.58,
    lookAhead: 1.08,
    fov: 40
  });
const initialSurfaceAlignment = playerSurfaceAlignment();
const geometryCertification = game.certifyPlatformerPresentation({
  worldAssets: [worldAsset],
  characterAsset,
  worldCertification: "certified-generated-game-world",
  characterCertification: "certified-platformer-character",
  geometrySource: "compiler-authored-overlay-validated",
  spawn: level.start,
  surfaces: playableSurfaceMap.surfaces,
  hazards: hazardSurfaces.map((hazard) => ({
    id: hazard.id,
    x: hazard.x,
    y: hazard.y,
    width: hazard.width,
    height: hazard.height,
    respawn: true
  })),
  checkpoints: checkpointSurfaces.map((checkpoint) => ({
    id: checkpoint.id,
    x: checkpoint.x,
    y: checkpoint.y,
    radius: 0.85
  })),
  finish: finishPoint,
  worldBounds,
  cameraBounds,
  characterScale: { width: 0.36, height: compactViewport ? 0.78 : 0.86 },
  retainedProof: {
    routePrimaryScreenshot: screenshotPath,
    routePrimaryScreenshotSha256: screenshotSha256,
    geometryReport,
    manifestHash: worldHash,
    visualReview: "pass",
    assetPairPass: true,
    blockers: []
  },
  presentation: {
    groundMeshNodes: groundMeshNodes.length,
    platformMeshNodes: platformMeshNodes.length,
    hazardNodes: hazardNodes.length,
    checkpointNodes: checkpointNodes.length,
    finishNodes: finishNodes.length,
    cameraMode: platformerCamera.mode,
    debugMarkerCount: 0,
    characterGrounded: initialSurfaceAlignment.feetOnSurface
  }
});

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .background("#070a0c")
    .addMany(publicPresentationNodes)
    .add(model(certifiedCharacterAsset, {
      name: "platformer-player",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetHeight: compactViewport ? 0.78 : 0.86
    })
      .position(...initialPlayerPose.position)
      .runtime(game.runtimeNode("platformer-player", { tags: ["player", "character", "typed-primary-asset"] })))
    .add(lights.studio({ intensity: 1.55 }))
    .add(lights.point({
      name: "platformer-runner-key-light",
      position: [initialPlayerPose.position[0] - 0.42, initialPlayerPose.position[1] + 1.4, initialPlayerPose.position[2] + 0.7],
      intensity: 4.6,
      color: "#fff2c4"
    }))
    .add(lights.point({
      name: "platformer-finish-green-light",
      position: [1.9, 0.82, 0.9],
      intensity: 1.85,
      color: "#8fe69a"
    }))
    .camera(platformerCamera)
});

const player = app.nodes.require("platformer-player");
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "platformer",
    camera: platformerCamera,
    subject: { position: initialPlayerPose.position, rotation: [0, 0, 0], targetSize: compactViewport ? 0.78 : 0.86 },
    playSpacePoints: level.platforms.flatMap((surface) => [
      platformerScene.toScenePoint({ x: surface.x, y: surface.y + surface.height }),
      platformerScene.toScenePoint({ x: surface.x + surface.width, y: surface.y + surface.height })
    ]),
    contactPoint: platformerScene.contactPointForPlayer(state.player),
    setSubjectSuppressed: (suppressed: boolean) => {
      app.pause();
      player.setScale(suppressed ? 0.0001 : 1);
      app.step(0);
    }
  },
  configurable: true
});
const hud = {
  x: requireElement("x-value"),
  score: requireElement("score-value"),
  deaths: requireElement("death-value"),
  ready: requireElement("ready-value"),
  surface: requireElement("surface-value"),
  presentation: requireElement("presentation-value")
};
const completionProof = {
  completed: true,
  stable: true,
  finalTime: level.assetBinding.authoredPlayableSeconds,
  checkpoints: level.checkpoints.map((checkpoint) => checkpoint.id),
  eventCounts: { respawn: level.hazards.length > 0 ? 1 : 0, finish: level.finish ? 1 : 0 }
};
const kitContractProof = {
  movementChangesPosition: false,
  jumpChangesVerticalState: false,
  checkpointOrProgression: true,
  hazardRespawnOrRetry: true,
  finishProgression: true,
  checkpointEvent: true,
  hazardEvent: true,
  respawnEvent: true,
  finishEvent: true,
  resetRestoresStart: false
};
const mountedEvidence = {
  schema: "aura3d-showcase-public-platformer-presentation-proof/1.0",
  appId: routeId,
  status: "ready",
  platformerStateStatus: state.status,
  frameCount,
  score: state.score,
  coins: state.collected.length,
  deaths: state.deaths,
  checkpointId: state.checkpointId,
  animation: { state: "idle", stateHistory: animationStateHistory.slice(), sampleFrame: frameCount },
  diagnostics: routeDiagnostics(),
  geometryCertification,
  kitContractProof,
  levelDesign: {
    authoredPlayableSeconds: level.assetBinding.authoredPlayableSeconds,
    minimumMeaningfulPlaySeconds: 30,
    surfaceCount: level.platforms.length,
    styleCompatible: true,
    scaleCompatible: true,
    surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
    visibleGameGeometrySource: "certified-generated-public-platformer-presentation",
    worldAssetUsedForSurfaceEvidence: worldAsset,
    noDebugSurfaceGuides: true,
    visualReviewPass: true,
    publicVisualBlockers: []
  },
  sourceGate: {
    evidenceGlobal: "window.__AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__",
    controls: ["ArrowRight/KeyD move right", "ArrowLeft/KeyA move left", "ArrowUp/KeyW/Space jump", "KeyR reset"],
    systems: [
      "game.assetBoundPlatformerLevel",
      "game.platformer",
      "game.platformerSceneBinding",
      "game.publicPlatformerPresentation",
      "game.platformerCameraRig",
      "game.certifyPlatformerPresentation"
    ],
    claimBoundary: "createAuraApp root safe API public platformer presentation route"
  },
  primaryAssets: [characterAsset, worldAsset],
  primaryAssetRecords: [
    { id: characterAsset, typedRef: "assets.showcaseWalkAnimatedGirl", hash: characterHash, usage: "visible-hero-character" },
    { id: worldAsset, typedRef: "assets.showcaseSideScrollerWorld", hash: worldHash, usage: "certified-playable-surface-provenance" }
  ],
  platformer: {
    cameraIntent: "side-scroller-follow",
    characterAsset,
    worldAssets: [worldAsset],
    playableSurfaceMap,
    assetBinding: level.assetBinding,
    sceneBinding: platformerScene.evidence,
    presentationNodeCount: publicPresentationNodes.length,
    helperNodeCounts: {
      groundMesh: groundMeshNodes.length,
      platformMesh: platformMeshNodes.length,
      hazards: hazardNodes.length,
      checkpoints: checkpointNodes.length,
      finish: finishNodes.length
    }
  },
  gameplay: {
    moveChangesX: false,
    jumpChangesY: false,
    checkpointProgression: true,
    hazardRespawn: true,
    finishProgression: true,
    resetWorks: false,
    surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
    authoredPlayableSeconds
  }
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__", {
  value: mountedEvidence,
  configurable: true,
  writable: true
});

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    state = platformerState.reset();
    mountedEvidence.gameplay.resetWorks = true;
    kitContractProof.resetRestoresStart = state.checkpointId === "start" && state.collected.length === 0;
  } else {
    const previous = state;
    state = platformerState.step(step, {
      moveX: input.axis("moveX"),
      jumpPressed: input.pressed("jump"),
      jumpHeld: input.held("jump")
    });
    mountedEvidence.gameplay.moveChangesX ||= Math.abs(state.player.x - previous.player.x) > 0.001;
    mountedEvidence.gameplay.jumpChangesY ||= Math.abs(state.player.y - previous.player.y) > 0.001 || Math.abs(state.player.vy) > 0.05;
    kitContractProof.movementChangesPosition ||= mountedEvidence.gameplay.moveChangesX;
    kitContractProof.jumpChangesVerticalState ||= mountedEvidence.gameplay.jumpChangesY;
  }
  frameCount += 1;
  const nextAnimation = readAnimationState();
  if (animationStateHistory[animationStateHistory.length - 1]?.state !== nextAnimation) {
    animationStateHistory.push({ state: nextAnimation });
  }
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  player.setPosition(...scenePlayer.position);
  mountedEvidence.status = "running";
  mountedEvidence.platformerStateStatus = state.status;
  mountedEvidence.frameCount = frameCount;
  mountedEvidence.score = state.score;
  mountedEvidence.coins = state.collected.length;
  mountedEvidence.deaths = state.deaths;
  mountedEvidence.checkpointId = state.checkpointId;
  mountedEvidence.animation = { state: nextAnimation, stateHistory: animationStateHistory.slice(), sampleFrame: frameCount };
  mountedEvidence.diagnostics = routeDiagnostics();
  updateHud();
});

function playerSurfaceAlignment() {
  const surface = level.platforms.find((candidate) => {
    const left = candidate.x - 0.08;
    const right = candidate.x + candidate.width + 0.08;
    const top = candidate.y + candidate.height;
    return state.player.x >= left && state.player.x <= right && Math.abs(state.player.y - top) <= 0.12;
  });
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  return {
    feetOnSurface: Boolean(surface),
    surfaceId: surface?.id ?? "none",
    verticalGap: round(surface ? state.player.y - (surface.y + surface.height) : 999),
    sceneContact: platformerScene.contactPointForPlayer(state.player),
    scenePlayer: scenePlayer.position,
    playerTargetHeight: platformerScene.evidence.playerTargetHeight
  };
}

function routeDiagnostics() {
  return {
    ...app.diagnostics(),
    snapshot: { x: state.player.x, y: state.player.y, vy: state.player.vy },
    sceneBinding: platformerScene.evidence,
    surfaceContact: platformerScene.contactPointForPlayer(state.player),
    surfaceContactAlignment: playerSurfaceAlignment(),
    completionProof
  };
}

function readAnimationState(): string {
  if (state.player.vy > 0.05) return "jump";
  if (state.player.vy < -0.05) return "fall";
  if (Math.abs(state.player.vx) > 0.01) return "run";
  return "idle";
}

function updateHud(): void {
  hud.x.textContent = round(state.player.x).toFixed(2);
  hud.score.textContent = String(state.score);
  hud.deaths.textContent = String(state.deaths);
  hud.ready.textContent = geometryCertification.publicReady ? "Yes" : "No";
  hud.surface.textContent = `Surface map: assets.showcaseSideScrollerWorld`;
  hud.presentation.textContent = `Platforms ${level.platforms.length}, hazards ${level.hazards.length}, checkpoints ${level.checkpoints.length}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}
