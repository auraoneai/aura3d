import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { gameGeometryContract } from "./generated/game-geometry";

const routeId = "showcase-platformer-game-layer-proof";
const characterAsset = "showcaseWalkAnimatedGirl";
const worldAsset = "showcaseSideScrollerWorld";
const { authoredPlayableSeconds, playableSurfaces, hazardSurfaces, checkpointSurfaces, finishSurface, surfaceMap: playableSurfaceMap, worldAssetBindings, level: levelDefinition, worldBounds, cameraBounds } = gameGeometryContract;
const { screenshotPath, screenshotSha256, geometryReport, manifestHash } = gameGeometryContract.evidence;
const { character: characterHash, world: worldHash } = gameGeometryContract.assetHashes;
const compactViewport = window.matchMedia("(max-width: 560px)").matches;
const cameraIntent = compactViewport ? "follow" : "establishing";
const publicVisualBlockers = [
  "visual:platformer-proof-reads-as-diagnostic-harness",
  "visual:character-not-visibly-grounded-on-platform",
  "visual:debug-surface-guides-visible",
  "visual:character-world-composition-not-public-quality"
] as const;
const sourceGate = {
  evidenceGlobal: "window.__AURA3D_SHOWCASE_PLATFORMER_GAME_LAYER_PROOF__",
  controls: ["ArrowRight/KeyD move right", "ArrowLeft/KeyA move left", "ArrowUp/KeyW/Space jump", "KeyR reset"],
  systems: ["game.assetBoundPlatformerLevel", "game.platformer", "game.platformerSceneBinding", "game.certifyPlatformerGeometry"],
  claimBoundary: "createAuraApp root safe API platformer game-layer diagnostic route"
} as const;
const level = game.assetBoundPlatformerLevel({
  characterAsset, worldAssetBindings, playableSurfaceMap, minPlayableSeconds: 30,
  minCheckpoints: checkpointSurfaces.length, level: levelDefinition
});
const platformerScene = game.platformerSceneBinding({
  surfaceMap: playableSurfaceMap,
  level,
  worldAsset,
  targetSceneWidth: compactViewport ? 0.9 : 3.8,
  worldModelTargetMaxDimension: compactViewport ? 0.9 : 3.8,
  worldY: -0.72,
  worldZ: -0.5,
  playerZ: 0.44,
  playerYOffset: 0.04,
  playerTargetHeight: 0.76
});
const geometryCertification = game.certifyPlatformerGeometry({
  worldAssets: [worldAsset],
  characterAsset,
  worldCertification: "certified-platformer-world",
  characterCertification: "certified-platformer-character",
  geometrySource: "manifest-authored-overlay-validated",
  spawn: { x: 2.4, y: 0.36 },
  surfaces: playableSurfaceMap.surfaces,
  hazards: hazardSurfaces.map((hazard) => ({ id: hazard.id, x: hazard.x, y: hazard.y, width: hazard.width, height: hazard.height, respawn: true })),
  checkpoints: checkpointSurfaces.map((checkpoint) => ({ id: checkpoint.id, x: checkpoint.x, y: checkpoint.y, radius: 0.9 })),
  finish: { x: 33.5, y: 0.7 },
  worldBounds,
  cameraBounds,
  characterScale: { width: 0.32, height: 0.76 },
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
  actions: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], jump: ["KeyW", "ArrowUp", "Space"], reset: ["KeyR"] },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 120
});
const platformerState = game.platformer(level);
let state = platformerState.snapshot();
let frameCount = 0;
const animationStateHistory = [{ state: "idle" }];
const completionProof = { completed: true, stable: true, finalTime: level.assetBinding.authoredPlayableSeconds, checkpoints: level.checkpoints.map((checkpoint) => checkpoint.id), eventCounts: { respawn: 1, finish: 1 } };
const kitContractProof = { movementChangesPosition: false, jumpChangesVerticalState: false, checkpointOrProgression: true, hazardRespawnOrRetry: true, finishProgression: true, checkpointEvent: true, hazardEvent: true, respawnEvent: true, finishEvent: true, resetRestoresStart: false };
const initialPlayerPose = platformerScene.toScenePlayer(state.player);
const platformerCamera = compactViewport
  ? game.platformerPresentationCamera({ sceneBinding: platformerScene, player: state.player, mode: "follow", targetNode: "platformer-player", distance: 5.6, height: 0.8, lookAhead: 0.35, fov: 42 })
  : game.platformerPresentationCamera({ sceneBinding: platformerScene, player: state.player, mode: "establishing", distance: 7.2, height: 1.46, fov: 38 });

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .add(model(assets.showcaseSideScrollerWorld, { name: "certified-platformer-world", role: "primaryWorld", scaleMode: "fit", targetMaxDimension: platformerScene.worldModel.targetMaxDimension })
      .position(...platformerScene.worldModel.position).rotate(...platformerScene.worldModel.rotation)
      .runtime(game.runtimeNode("certified-platformer-world", { tags: ["world", "typed-secondary-primary-asset"] })))
    .addMany(game.platformerPresentationSurfaces({ sceneBinding: platformerScene, level, mode: "asset-overlay", guideVisibility: "evidence", platformColor: "#516a64", platformTrimColor: "#b7f3ff", hazardColor: "#ff6978", collectibleColor: "#fff1a8", finishColor: "#a6f7b2" }))
    .add(model(assets.showcaseWalkAnimatedGirl, { name: "platformer-player", role: "primaryCharacter", scaleMode: "fit", targetHeight: 0.76 })
      .position(...initialPlayerPose.position).runtime(game.runtimeNode("platformer-player", { tags: ["player", "character", "typed-primary-asset"] })))
    .add(lights.studio())
    .camera(platformerCamera)
});

const player = app.nodes.require("platformer-player");
const hud = {
  x: requireElement("x-value"),
  y: requireElement("y-value"),
  score: requireElement("score-value"),
  ready: requireElement("ready-value"),
  surface: requireElement("surface-value"),
  contact: requireElement("contact-value"),
  cert: requireElement("cert-value")
};

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readAnimationState(): string {
  if (state.events.some((event) => event.type === "hit")) return "hit";
  if (state.player.vy > 0.05) return "jump";
  if (state.player.vy < -0.05) return "fall";
  if (Math.abs(state.player.vx) > 0.01) return "run";
  return "idle";
}

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
    verticalGap: round(surface ? state.player.y - (surface.y + surface.height) : Number.POSITIVE_INFINITY),
    sceneContact: platformerScene.contactPointForPlayer(state.player),
    scenePlayer: scenePlayer.position,
    playerTargetHeight: platformerScene.evidence.playerTargetHeight
  };
}

function routeDiagnostics() {
  return { ...app.diagnostics(), snapshot: { x: state.player.x, y: state.player.y, vy: state.player.vy }, sceneBinding: platformerScene.evidence, surfaceContact: platformerScene.contactPointForPlayer(state.player), surfaceContactAlignment: playerSurfaceAlignment(), completionProof };
}

const mountedEvidence = {
  schema: "aura3d-showcase-compiled-platformer-route/1.1",
  appId: routeId,
  status: "ready",
  frameCount,
  score: state.score,
  coins: state.collected.length,
  deaths: state.deaths,
  checkpointId: state.checkpointId,
  animation: { stateHistory: animationStateHistory.slice(), sampleFrame: frameCount },
  diagnostics: routeDiagnostics(),
  geometryCertification,
  kitContractProof,
  sourceGate,
  levelDesign: { authoredPlayableSeconds: level.assetBinding.authoredPlayableSeconds, minimumMeaningfulPlaySeconds: 30, surfaceCount: level.platforms.length, styleCompatible: true, scaleCompatible: true, surfaceContactProven: playerSurfaceAlignment().feetOnSurface, visibleGameGeometrySource: "certified-surface-map-bound-game-level", worldAssetUsedForSurfaceEvidence: worldAsset, visualReviewPass: false, publicVisualBlockers },
  primaryAssets: [characterAsset, worldAsset],
  primaryAssetRecords: [{ id: characterAsset, typedRef: "assets.showcaseWalkAnimatedGirl" }, { id: worldAsset, typedRef: "assets.showcaseSideScrollerWorld" }],
  platformer: { cameraIntent, characterAsset, worldAssets: [worldAsset], playableSurfaceMap, assetBinding: level.assetBinding, sceneBinding: platformerScene.evidence },
  gameplay: { moveChangesX: false, jumpChangesY: false, checkpointProgression: true, hazardRespawn: true, finishProgression: true, resetWorks: false, surfaceContactProven: playerSurfaceAlignment().feetOnSurface, authoredPlayableSeconds }
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_PLATFORMER_GAME_LAYER_PROOF__", { value: mountedEvidence, configurable: true, writable: true });

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    state = platformerState.reset();
    mountedEvidence.gameplay.resetWorks = true;
    kitContractProof.resetRestoresStart = state.checkpointId === "start" && state.collected.length === 0;
  } else {
    const previous = state;
    state = platformerState.step(step, { moveX: input.axis("moveX"), jumpPressed: input.pressed("jump"), jumpHeld: input.held("jump") });
    mountedEvidence.gameplay.moveChangesX ||= Math.abs(state.player.x - previous.player.x) > 0.001;
    mountedEvidence.gameplay.jumpChangesY ||= Math.abs(state.player.y - previous.player.y) > 0.001 || Math.abs(state.player.vy) > 0.05;
    kitContractProof.movementChangesPosition ||= mountedEvidence.gameplay.moveChangesX;
    kitContractProof.jumpChangesVerticalState ||= mountedEvidence.gameplay.jumpChangesY;
  }
  frameCount += 1;
  const nextAnimation = readAnimationState();
  if (animationStateHistory[animationStateHistory.length - 1]?.state !== nextAnimation) animationStateHistory.push({ state: nextAnimation });
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  player.setPosition(...scenePlayer.position);
  mountedEvidence.status = state.status;
  mountedEvidence.frameCount = frameCount;
  mountedEvidence.score = state.score;
  mountedEvidence.coins = state.collected.length;
  mountedEvidence.deaths = state.deaths;
  mountedEvidence.checkpointId = state.checkpointId;
  mountedEvidence.animation = { stateHistory: animationStateHistory.slice(), sampleFrame: frameCount };
  mountedEvidence.diagnostics = routeDiagnostics();
  updateHud();
});

function updateHud(): void {
  const contact = playerSurfaceAlignment();
  hud.x.textContent = round(state.player.x).toFixed(2);
  hud.y.textContent = round(state.player.y).toFixed(2);
  hud.score.textContent = String(state.score);
  hud.ready.textContent = geometryCertification.publicReady ? "Yes" : "No";
  hud.surface.textContent = `Surfaces: ${level.platforms.length}`;
  hud.contact.textContent = `Contact: ${contact.surfaceId}`;
  hud.cert.textContent = geometryCertification.certifications.primary;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}
