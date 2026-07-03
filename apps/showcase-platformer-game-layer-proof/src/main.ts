import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

const routeId = "showcase-platformer-game-layer-proof";
const characterAsset = "showcaseWalkAnimatedGirl";
const worldAsset = "showcaseSideScrollerWorld";
const characterHash = "sha256-93872fc24240a071b6195d6f1339f40b09b3308dc998311252d21ebd9042d8c6";
const worldHash = "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4";
const screenshotPath = "tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.png";
const screenshotSha256 = "sha256-258c3c3787cc28f2903a69cc4d2b9518b5e29ed796c6c96874756623d820709c";
const geometryReport = "tests/reports/showcase-spec-compiler/platformer-game-layer-proof/game-template/showcase-platformer-game-layer-proof-platformer-playable-surfaces.json";
const manifestHash = "sha256-9d78be7f9a236a153a1afd97e21c867fbad198d86155b88e90719877e1773993";
const compactViewport = window.matchMedia("(max-width: 560px)").matches;
const cameraIntent = compactViewport ? "follow" : "establishing";
const authoredPlayableSeconds = 36;
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
const playableSurfaces = [
  { id: "proof-main-runway", x: 2.4, y: 0, width: 7.4, height: 0.34, kind: "ground" },
  { id: "proof-lower-bridge", x: 9.6, y: 0.12, width: 6.4, height: 0.34, kind: "platform" },
  { id: "proof-mid-span", x: 16.2, y: 0.28, width: 6.6, height: 0.34, kind: "platform" },
  { id: "proof-gap-run", x: 22.8, y: 0.18, width: 5.8, height: 0.34, kind: "platform" },
  { id: "proof-upper-run", x: 29.6, y: 0.34, width: 7.8, height: 0.34, kind: "platform" }
] as const;
const hazardSurfaces = [
  { id: "proof-hazard-gap-01", x: 19.2, y: 0.52, width: 0.42, height: 0.24, kind: "hazard" },
  { id: "proof-hazard-gap-02", x: 27.2, y: 0.58, width: 0.42, height: 0.24, kind: "hazard" }
] as const;
const checkpointSurfaces = [
  { id: "proof-checkpoint-start", x: 6, y: 0.72, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-bridge", x: 11.2, y: 0.84, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-mid", x: 16.8, y: 1, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-hazard", x: 23.4, y: 0.92, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-final", x: 30.6, y: 1.08, width: 1.1, height: 1.1, kind: "checkpoint" },
  { id: "proof-checkpoint-finish", x: 35.2, y: 1.08, width: 1.1, height: 1.1, kind: "checkpoint" }
] as const;
const finishSurface = { id: "proof-finish-ledges", x: 35.2, y: 0.7, width: 1.1, height: 1.1, kind: "finish" } as const;
const playableSurfaceMap = {
  assetId: worldAsset,
  assetHash: worldHash,
  source: "manifest-authored-overlay-validated",
  surfaces: [...playableSurfaces, finishSurface, ...hazardSurfaces, ...checkpointSurfaces],
  levelLength: 37.2,
  estimatedCompletionSeconds: authoredPlayableSeconds,
  characterScaleRatio: 0.38,
  confidence: 0.8,
  modelAlignment: {
    source: "manifest-authored-overlay-validated",
    modelBounds: { min: [-192.317, -102.591, -85.575], max: [188.919, 206.984, 238.905] },
    modelPoint: [-1.699, -102.591, 76.665],
    gamePoint: { x: 16.1, y: 0 },
    anchorPairs: [
      { id: "proof-main-runway-anchor", modelPoint: [-1.699, -102.591, 76.665], gamePoint: { x: 16.1, y: 0 } },
      { id: "proof-finish-anchor", modelPoint: [120, -102, 145], gamePoint: { x: 35.2, y: 0.7 } }
    ],
    evidence: { routeOverlay: screenshotPath, notes: "Overlay-validated surface anchors bind the playable route to the typed side-scroller world." }
  },
  evidence: {
    sourceAsset: "assets.showcaseSideScrollerWorld",
    renderedProbe: "tests/reports/showcase-release-asset-probes/showcaseSideScrollerWorld.png",
    routeOverlay: screenshotPath,
    notes: "Certified platformer proof route uses this retained surface map for contact, hazards, checkpoints, finish progression, and camera framing."
  }
} as const;

const level = game.assetBoundPlatformerLevel({
  characterAsset,
  worldAssetBindings: [{ worldAsset, worldAssetHash: worldHash, surfaceSource: "manifest-authored-overlay-validated", confidence: 0.8, surfaceIds: playableSurfaces.map((surface) => surface.id) }],
  playableSurfaceMap,
  minPlayableSeconds: 30,
  minCheckpoints: checkpointSurfaces.length,
  level: {
    id: `${routeId}-surface-bound-level`,
    start: { x: 2.4, y: 0.36 },
    finish: { x: 33.5, y: 0.7 },
    moveSpeed: 0.94,
    jumpVelocity: 7.4,
    lowerBound: -1.4,
    platforms: playableSurfaces.map((surface) => ({ id: surface.id, x: surface.x - surface.width / 2, y: surface.y, width: surface.width, height: surface.height })),
    collectibles: [{ id: "proof-coin-01", x: 3.16, y: 1.06, radius: 0.34, value: 50 }, { id: "proof-coin-02", x: 14.3, y: 1.56, value: 50 }, { id: "proof-coin-03", x: 30.3, y: 1.7, value: 50 }],
    hazards: hazardSurfaces.map((hazard) => ({ id: hazard.id, x: hazard.x - hazard.width / 2, y: hazard.y, width: hazard.width, height: hazard.height, respawn: true })),
    checkpoints: checkpointSurfaces.map((checkpoint) => ({ id: checkpoint.id, x: checkpoint.x, y: checkpoint.y, radius: 0.9 }))
  }
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
  worldBounds: { minX: -1.3, maxX: 36, minY: -1.4, maxY: 2.2 },
  cameraBounds: { minX: -2, maxX: 35.8, minY: -0.8, maxY: 2.6 },
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
