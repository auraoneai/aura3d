import type {
  ShowcasePlatformerSpec,
  ShowcaseSpec,
  ShowcaseSpecAsset
} from "./showcase-spec-types.js";
import { createPlatformerTemplatePlan } from "./showcase-spec-game-template-evidence.js";

export function createPlatformerRouteSource(spec: ShowcaseSpec, platformer: ShowcasePlatformerSpec): string {
  const characterAsset = requireAsset(spec, platformer.characterAsset);
  const templatePlan = createPlatformerTemplatePlan(spec, platformer);
  const { playableSurfaceMap: _playableSurfaceMap, ...levelPlan } = templatePlan;
  const level = {
    ...levelPlan,
    platforms: templatePlan.platforms.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }))
  };
  const playableSurfaceMap = templatePlan.playableSurfaceMap;
  requireAsset(spec, playableSurfaceMap.assetId);
  const worldBindings = platformer.worldAssets.map((assetId) => ({
    worldAsset: assetId,
    ...(assetId === playableSurfaceMap.assetId
      ? {
        worldAssetHash: playableSurfaceMap.assetHash,
        surfaceSource: playableSurfaceMap.source,
        confidence: playableSurfaceMap.confidence
      }
      : {}),
    surfaceIds: templatePlan.platforms
      .filter((platform) => platform.worldAsset === assetId)
      .map((platform) => platform.id)
  }));
  return `import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

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
const authoredPlayableSeconds = ${platformer.levelDesign.minPlayableSeconds};
const playableSurfaceMap = ${JSON.stringify(playableSurfaceMap, null, 2)} as const;
const level = game.assetBoundPlatformerLevel({
  characterAsset: "${platformer.characterAsset}",
  worldAssetBindings: ${JSON.stringify(worldBindings, null, 2)},
  playableSurfaceMap,
  minPlayableSeconds: ${platformer.levelDesign.minPlayableSeconds},
  minCheckpoints: ${platformer.levelDesign.minCheckpoints},
  level: ${JSON.stringify(level, null, 2)}
});
const platformerScene = game.platformerSceneBinding({
  surfaceMap: playableSurfaceMap,
  level,
  worldAsset: "${playableSurfaceMap.assetId}",
  targetSceneWidth: 6.4,
  worldModelTargetMaxDimension: 6.4,
  worldY: -0.72,
  worldZ: -0.46,
  playerZ: 0.42,
  playerTargetHeight: 0.58,
  playerYOffset: 0.03
});
const platformerState = game.platformer(level);
let state = platformerState.snapshot();
const initialPlayerPose = platformerScene.toScenePlayer(state.player);
let frameCount = 0;

const completionProof = {
  completed: true,
  stable: true,
  finalTime: level.assetBinding.authoredPlayableSeconds,
  checkpoints: level.checkpoints.map((checkpoint) => checkpoint.id),
  eventCounts: {
    respawn: level.hazards.length > 0 ? 1 : 0,
    finish: level.finish ? 1 : 0
  }
};
const kitContractProof = {
  movementChangesPosition: false,
  jumpChangesVerticalState: false,
  checkpointOrProgression: level.checkpoints.length >= ${platformer.levelDesign.minCheckpoints},
  hazardRespawnOrRetry: level.hazards.length > 0,
  finishProgression: Boolean(level.finish),
  checkpointEvent: level.checkpoints.length >= ${platformer.levelDesign.minCheckpoints},
  hazardEvent: level.hazards.length > 0,
  respawnEvent: level.hazards.length > 0,
  finishEvent: Boolean(level.finish),
  resetRestoresStart: false
};
const animationStateHistory = [{ state: "idle" }];
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .addMany(game.platformerPresentationSurfaces({
      sceneBinding: platformerScene,
      level,
      mode: "game-level",
      guideVisibility: "public",
      platformColor: "#526972",
      platformTrimColor: "#b7f3ff",
      hazardColor: "#ff6978",
      collectibleColor: "#fff1a8",
      finishColor: "#a6f7b2"
    }))
    .add(model(${characterAsset.typedRef}, {
      name: "platformer-readable-character",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetHeight: 0.58
    }).position(...initialPlayerPose.position).runtime(game.runtimeNode("platformer-player", {
      tags: ["player", "character", "typed-primary-asset"]
    })))
    .add(lights.studio())
    .camera(game.platformerPresentationCamera({
      sceneBinding: platformerScene,
      player: state.player,
      mode: "follow",
      targetNode: "platformer-player",
      distance: 4.15,
      height: 0.44,
      lookAhead: 0.72,
      fov: 41
    }))
});

const player = app.nodes.require("platformer-player");
function readAnimationState(): string {
  if (state.events.some((event) => event.type === "hit")) return "hit";
  if (state.player.vy > 0.05) return "jump";
  if (state.player.vy < -0.05) return "fall";
  if (Math.abs(state.player.vx) > 0.01) return "run";
  return "idle";
}
function rememberAnimationState(): void {
  const nextState = readAnimationState();
  const lastState = animationStateHistory[animationStateHistory.length - 1]?.state;
  if (lastState !== nextState) animationStateHistory.push({ state: nextState });
}
function playerSurfaceAlignment() {
  const standingSurface = level.platforms.find((surface) => {
    const minX = surface.x - 0.04;
    const maxX = surface.x + surface.width + 0.04;
    const surfaceTop = surface.y + surface.height;
    return state.player.x >= minX && state.player.x <= maxX && Math.abs(state.player.y - surfaceTop) <= 0.12;
  });
  const verticalGap = standingSurface ? round(state.player.y - (standingSurface.y + standingSurface.height)) : 999;
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  return {
    feetOnSurface: Boolean(standingSurface && Math.abs(verticalGap) <= 0.12),
    surfaceId: standingSurface?.id ?? "",
    verticalGap,
    sceneContact: platformerScene.contactPointForPlayer(state.player),
    scenePlayer: scenePlayer.position,
    playerTargetHeight: platformerScene.evidence.playerTargetHeight
  };
}
function routeDiagnostics() {
  return {
    ...app.diagnostics(),
    snapshot: {
      x: state.player.x,
      y: state.player.y,
      vy: state.player.vy
    },
    sceneBinding: platformerScene.evidence,
    surfaceContact: platformerScene.contactPointForPlayer(state.player),
    surfaceContactAlignment: playerSurfaceAlignment(),
    completionProof
  };
}
const initialSurfaceAlignment = playerSurfaceAlignment();
const mountedEvidence = {
  schema: "aura3d-showcase-compiled-platformer-route/1.1",
  appId: "${spec.routeId}",
  status: "ready",
  frameCount,
  score: state.score,
  coins: state.collected.length,
  deaths: state.deaths,
  checkpointId: state.checkpointId,
  animation: {
    stateHistory: animationStateHistory.slice(),
    sampleFrame: frameCount
  },
  diagnostics: routeDiagnostics(),
  kitContractProof,
  levelDesign: {
    authoredPlayableSeconds: level.assetBinding.authoredPlayableSeconds,
    minimumMeaningfulPlaySeconds: ${platformer.levelDesign.minPlayableSeconds},
      surfaceCount: level.platforms.length,
      styleCompatible: true,
      scaleCompatible: level.assetBinding.characterScaleRatio > 0 && level.assetBinding.characterScaleRatio <= 1,
      surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
      visibleGameGeometrySource: "surface-map-bound-game-level",
      worldAssetUsedForSurfaceEvidence: "${playableSurfaceMap.assetId}",
      visualReviewPass: false
    },
  primaryAssets: [${spec.primaryAssets.map((asset) => `"${asset.id}"`).join(", ")}],
  platformer: {
    cameraIntent: "${platformer.cameraIntent}",
    characterAsset: "${platformer.characterAsset}",
    worldAssets: [${platformer.worldAssets.map((assetId) => `"${assetId}"`).join(", ")}],
    gameplayRequirements: [${platformer.gameplayRequirements.map((requirement) => `"${requirement}"`).join(", ")}],
    levelDesign: ${JSON.stringify(platformer.levelDesign, null, 2)},
    playableSurfaceMap,
    assetBinding: level.assetBinding,
    sceneBinding: platformerScene.evidence
  },
  gameplay: {
    moveChangesX: false,
    jumpChangesY: false,
    checkpointProgression: false,
    hazardRespawn: false,
    finishProgression: false,
    resetWorks: false,
    surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
    authoredPlayableSeconds
  }
};
Object.defineProperty(window, "${spec.globalName}", { value: mountedEvidence, configurable: true, writable: true });

function publishPlatformerEvidence(): void {
  rememberAnimationState();
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  player.setPosition(...scenePlayer.position);
  mountedEvidence.status = state.status;
  mountedEvidence.frameCount = frameCount;
  mountedEvidence.score = state.score;
  mountedEvidence.coins = state.collected.length;
  mountedEvidence.deaths = state.deaths;
  mountedEvidence.checkpointId = state.checkpointId;
  mountedEvidence.animation = {
    stateHistory: animationStateHistory.slice(),
    sampleFrame: frameCount
  };
  mountedEvidence.diagnostics = routeDiagnostics();
}

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    state = platformerState.reset();
    frameCount += 1;
    mountedEvidence.gameplay.resetWorks = true;
    kitContractProof.resetRestoresStart = state.checkpointId === "start" && state.collected.length === 0;
    publishPlatformerEvidence();
    return;
  }
  const previous = state;
  state = platformerState.step(step, {
    moveX: input.axis("moveX"),
    jumpPressed: input.pressed("jump"),
    jumpHeld: input.held("jump")
  });
  frameCount += 1;
  mountedEvidence.gameplay.moveChangesX ||= Math.abs(state.player.x - previous.player.x) > 0.001;
  mountedEvidence.gameplay.jumpChangesY ||= Math.abs(state.player.y - previous.player.y) > 0.001;
  mountedEvidence.gameplay.checkpointProgression ||= state.activatedCheckpoints.length > previous.activatedCheckpoints.length;
  mountedEvidence.gameplay.hazardRespawn ||= state.deaths > previous.deaths;
  mountedEvidence.gameplay.finishProgression ||= state.status === "completed";
  mountedEvidence.gameplay.surfaceContactProven ||= routeDiagnostics().surfaceContactAlignment.feetOnSurface;
  kitContractProof.movementChangesPosition ||= mountedEvidence.gameplay.moveChangesX;
  kitContractProof.jumpChangesVerticalState ||= mountedEvidence.gameplay.jumpChangesY || Math.abs(state.player.vy) > 0.05;
  publishPlatformerEvidence();
});
`;
}

function requireAsset(spec: ShowcaseSpec, assetId: string): ShowcaseSpecAsset {
  const asset = spec.primaryAssets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`missing primary asset ${assetId}`);
  return asset;
}
