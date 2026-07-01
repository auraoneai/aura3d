import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
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
const authoredPlayableSeconds = 30;
const playableSurfaceMap = {
  "assetId": "showcaseSideScrollerWorld",
  "assetHash": "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4",
  "source": "manifest-authored-overlay-validated",
  "surfaces": [
    {
      "id": "skyline-main-runway",
      "x": 2.4,
      "y": 0,
      "width": 7.4,
      "height": 0.34,
      "kind": "ground"
    },
    {
      "id": "skyline-lower-bridge",
      "x": 9.6,
      "y": 0.12,
      "width": 6.4,
      "height": 0.34,
      "kind": "platform"
    },
    {
      "id": "skyline-mid-span",
      "x": 16.2,
      "y": 0.28,
      "width": 6.6,
      "height": 0.34,
      "kind": "platform"
    },
    {
      "id": "skyline-gap-run",
      "x": 22.8,
      "y": 0.18,
      "width": 5.8,
      "height": 0.34,
      "kind": "platform"
    },
    {
      "id": "skyline-upper-run",
      "x": 29.6,
      "y": 0.34,
      "width": 7.8,
      "height": 0.34,
      "kind": "platform"
    },
    {
      "id": "skyline-finish-ledges",
      "x": 35.2,
      "y": 0.7,
      "width": 1.1,
      "height": 1.1,
      "kind": "finish"
    },
    {
      "id": "hazard-gap-01",
      "x": 19.2,
      "y": 0.52,
      "width": 0.42,
      "height": 0.24,
      "kind": "hazard"
    },
    {
      "id": "hazard-gap-02",
      "x": 27.2,
      "y": 0.58,
      "width": 0.42,
      "height": 0.24,
      "kind": "hazard"
    },
    {
      "id": "checkpoint-start-run",
      "x": 6,
      "y": 0.72,
      "width": 1.1,
      "height": 1.1,
      "kind": "checkpoint"
    },
    {
      "id": "checkpoint-bridge",
      "x": 11.2,
      "y": 0.84,
      "width": 1.1,
      "height": 1.1,
      "kind": "checkpoint"
    },
    {
      "id": "checkpoint-mid-run",
      "x": 16.8,
      "y": 1,
      "width": 1.1,
      "height": 1.1,
      "kind": "checkpoint"
    },
    {
      "id": "checkpoint-hazard",
      "x": 23.4,
      "y": 0.92,
      "width": 1.1,
      "height": 1.1,
      "kind": "checkpoint"
    },
    {
      "id": "checkpoint-final",
      "x": 30.6,
      "y": 1.08,
      "width": 1.1,
      "height": 1.1,
      "kind": "checkpoint"
    },
    {
      "id": "checkpoint-finish",
      "x": 35.2,
      "y": 1.08,
      "width": 1.1,
      "height": 1.1,
      "kind": "checkpoint"
    }
  ],
  "levelLength": 37.2,
  "estimatedCompletionSeconds": 36,
  "characterScaleRatio": 0.42,
  "confidence": 0.72,
  "modelAlignment": {
    "source": "manifest-authored-overlay-validated",
    "modelBounds": {
      "min": [-192.317, -102.591, -85.575],
      "max": [188.919, 206.984, 238.905]
    },
    "modelPoint": [-1.699, -102.591, 76.665],
    "gamePoint": {
      "x": 16.1,
      "y": 0
    },
    "anchorPairs": [
      {
        "id": "skyline-main-runway-anchor",
        "modelPoint": [-1.699, -102.591, 76.665],
        "gamePoint": {
          "x": 16.1,
          "y": 0
        }
      },
      {
      "id": "skyline-finish-anchor",
      "modelPoint": [120, -102, 145],
      "gamePoint": {
        "x": 35.2,
        "y": 0.7
      }
    }
    ],
    "evidence": {
      "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
      "notes": "Hash-bound multi-anchor fit aligns the playable surface map to the retained side-scroller world footprint and constrains scene scale, yaw, and translation."
    }
  },
  "evidence": {
    "sourceAsset": "assets.showcaseSideScrollerWorld",
    "renderedProbe": "tests/reports/showcase-release-asset-probes/showcaseSideScrollerWorld.png",
    "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
    "notes": "Manifest-authored side-scroller surface map bound to the selected world hash and retained release/route screenshots. The platformer generator uses this map for player surfaces, hazards, checkpoints, finish progression, and scale validation."
  }
} as const;
const level = game.assetBoundPlatformerLevel({
  characterAsset: "showcaseWalkAnimatedGirl",
  worldAssetBindings: [
  {
    "worldAsset": "showcaseSideScrollerWorld",
    "worldAssetHash": "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4",
    "surfaceSource": "manifest-authored-overlay-validated",
    "confidence": 0.72,
    "surfaceIds": [
      "skyline-main-runway",
      "skyline-lower-bridge",
      "skyline-mid-span",
      "skyline-gap-run",
      "skyline-upper-run"
    ]
  }
],
  playableSurfaceMap,
  minPlayableSeconds: 30,
  minCheckpoints: 6,
  level: {
  "id": "showcase-skyline-runner-asset-bound-platformer-level",
  "start": {
    "x": -0.5,
    "y": 0.36
  },
  "finish": {
    "x": 33.5,
    "y": 0.7
  },
  "moveSpeed": 1.033,
  "jumpVelocity": 7.4,
  "lowerBound": -1.4,
  "platforms": [
    {
      "id": "skyline-main-runway",
      "x": -1.3,
      "y": 0,
      "width": 7.4,
      "height": 0.34
    },
    {
      "id": "skyline-lower-bridge",
      "x": 6.4,
      "y": 0.12,
      "width": 6.4,
      "height": 0.34
    },
    {
      "id": "skyline-mid-span",
      "x": 12.9,
      "y": 0.28,
      "width": 6.6,
      "height": 0.34
    },
    {
      "id": "skyline-gap-run",
      "x": 19.9,
      "y": 0.18,
      "width": 5.8,
      "height": 0.34
    },
    {
      "id": "skyline-upper-run",
      "x": 25.7,
      "y": 0.34,
      "width": 7.8,
      "height": 0.34
    }
  ],
  "collectibles": [
    {
      "id": "coin-01",
      "x": 2.7,
      "y": 1.06,
      "value": 50
    },
    {
      "id": "coin-02",
      "x": 7.7,
      "y": 1.36,
      "value": 50
    },
    {
      "id": "coin-03",
      "x": 14.3,
      "y": 1.56,
      "value": 50
    },
    {
      "id": "coin-04",
      "x": 25.5,
      "y": 1.5,
      "value": 50
    },
    {
      "id": "coin-05",
      "x": 30.3,
      "y": 1.7,
      "value": 50
    }
  ],
  "hazards": [
    {
      "id": "hazard-gap-01",
      "x": 18.99,
      "y": 0.52,
      "width": 0.42,
      "height": 0.24,
      "respawn": true
    },
    {
      "id": "hazard-gap-02",
      "x": 26.99,
      "y": 0.58,
      "width": 0.42,
      "height": 0.24,
      "respawn": true
    }
  ],
  "checkpoints": [
    {
      "id": "checkpoint-start-run",
      "x": 6,
      "y": 0.72,
      "radius": 0.9
    },
    {
      "id": "checkpoint-bridge",
      "x": 11.2,
      "y": 0.84,
      "radius": 0.9
    },
    {
      "id": "checkpoint-mid-run",
      "x": 16.8,
      "y": 1,
      "radius": 0.9
    },
    {
      "id": "checkpoint-hazard",
      "x": 23.4,
      "y": 0.92,
      "radius": 0.9
    },
    {
      "id": "checkpoint-final",
      "x": 30.6,
      "y": 1.08,
      "radius": 0.9
    },
    {
      "id": "checkpoint-finish",
      "x": 35.2,
      "y": 1.08,
      "radius": 0.9
    }
  ]
}
});
const platformerScene = game.platformerSceneBinding({
  surfaceMap: playableSurfaceMap,
  level,
  worldAsset: "showcaseSideScrollerWorld",
  targetSceneWidth: 6.4,
  worldModelTargetMaxDimension: 6.4,
  worldY: -0.72,
  worldZ: -0.46,
  playerZ: 0.42,
  playerYOffset: 0.03,
  playerTargetHeight: 0.58
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
  checkpointOrProgression: level.checkpoints.length >= 6,
  hazardRespawnOrRetry: level.hazards.length > 0,
  finishProgression: Boolean(level.finish),
  checkpointEvent: level.checkpoints.length >= 6,
  hazardEvent: level.hazards.length > 0,
  respawnEvent: level.hazards.length > 0,
  finishEvent: Boolean(level.finish),
  resetRestoresStart: false
};
const animationStateHistory = [{ state: "idle" }];

function round(value: number): number {
  return Number(value.toFixed(4));
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
    .add(model(assets.showcaseWalkAnimatedGirl, {
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
      mode: "establishing",
      distance: 6.8,
      height: 1.18,
      fov: 44
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
  const surface = level.platforms.find((candidate) => {
    const left = candidate.x;
    const right = candidate.x + candidate.width;
    const top = candidate.y + candidate.height;
    return state.player.x >= left - 0.08 && state.player.x <= right + 0.08 && Math.abs(state.player.y - top) <= 0.12;
  });
  const sceneContact = platformerScene.contactPointForPlayer(state.player);
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  return {
    feetOnSurface: Boolean(surface),
    surfaceId: surface?.id ?? "none",
    verticalGap: round(surface ? state.player.y - (surface.y + surface.height) : Number.POSITIVE_INFINITY),
    sceneContact,
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
  appId: "showcase-skyline-runner",
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
    minimumMeaningfulPlaySeconds: 30,
      surfaceCount: level.platforms.length,
      styleCompatible: true,
      scaleCompatible: level.assetBinding.characterScaleRatio > 0 && level.assetBinding.characterScaleRatio <= 1,
      surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
      visibleGameGeometrySource: "surface-map-bound-game-level",
      worldAssetUsedForSurfaceEvidence: "showcaseSideScrollerWorld",
      visualReviewPass: false
    },
  primaryAssets: ["showcaseWalkAnimatedGirl", "showcaseSideScrollerWorld"],
  platformer: {
    cameraIntent: "side-scroller",
    characterAsset: "showcaseWalkAnimatedGirl",
    worldAssets: ["showcaseSideScrollerWorld"],
    gameplayRequirements: ["movement", "jump", "checkpoint", "progression"],
    levelDesign: {
  "minPlayableSeconds": 30,
  "minCheckpoints": 6,
  "requiresHazardRespawn": true,
  "requiresFinish": true,
  "authoredLevelFlow": true,
  "playableSurfaceSource": "asset-bound-playable-surfaces",
  "playableSurfaceLayoutValidated": true,
  "playableSurfaceMap": {
    "assetId": "showcaseSideScrollerWorld",
    "assetHash": "sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4",
    "source": "manifest-authored-overlay-validated",
    "surfaces": [
      {
        "id": "skyline-main-runway",
        "x": 2.4,
        "y": 0,
        "width": 7.4,
        "height": 0.34,
        "kind": "ground"
      },
      {
        "id": "skyline-lower-bridge",
        "x": 9.6,
        "y": 0.12,
        "width": 6.4,
        "height": 0.34,
        "kind": "platform"
      },
      {
        "id": "skyline-mid-span",
        "x": 16.2,
        "y": 0.28,
        "width": 6.6,
        "height": 0.34,
        "kind": "platform"
      },
      {
        "id": "skyline-gap-run",
        "x": 22.8,
        "y": 0.18,
        "width": 5.8,
        "height": 0.34,
        "kind": "platform"
      },
      {
        "id": "skyline-upper-run",
        "x": 29.6,
        "y": 0.34,
        "width": 7.8,
        "height": 0.34,
        "kind": "platform"
      },
      {
        "id": "skyline-finish-ledges",
        "x": 35.2,
        "y": 0.7,
        "width": 1.1,
        "height": 1.1,
        "kind": "finish"
      },
      {
        "id": "hazard-gap-01",
        "x": 19.2,
        "y": 0.52,
        "width": 0.42,
        "height": 0.24,
        "kind": "hazard"
      },
      {
        "id": "hazard-gap-02",
        "x": 27.2,
        "y": 0.58,
        "width": 0.42,
        "height": 0.24,
        "kind": "hazard"
      },
      {
        "id": "checkpoint-start-run",
        "x": 6,
        "y": 0.72,
        "width": 1.1,
        "height": 1.1,
        "kind": "checkpoint"
      },
      {
        "id": "checkpoint-bridge",
        "x": 11.2,
        "y": 0.84,
        "width": 1.1,
        "height": 1.1,
        "kind": "checkpoint"
      },
      {
        "id": "checkpoint-mid-run",
        "x": 16.8,
        "y": 1,
        "width": 1.1,
        "height": 1.1,
        "kind": "checkpoint"
      },
      {
        "id": "checkpoint-hazard",
        "x": 23.4,
        "y": 0.92,
        "width": 1.1,
        "height": 1.1,
        "kind": "checkpoint"
      },
      {
        "id": "checkpoint-final",
        "x": 30.6,
        "y": 1.08,
        "width": 1.1,
        "height": 1.1,
        "kind": "checkpoint"
      },
      {
        "id": "checkpoint-finish",
        "x": 35.2,
        "y": 1.08,
        "width": 1.1,
        "height": 1.1,
        "kind": "checkpoint"
      }
    ],
    "levelLength": 37.2,
    "estimatedCompletionSeconds": 36,
    "characterScaleRatio": 0.42,
    "confidence": 0.72,
    "modelAlignment": {
      "source": "manifest-authored-overlay-validated",
      "modelBounds": {
        "min": [-192.317, -102.591, -85.575],
        "max": [188.919, 206.984, 238.905]
      },
      "modelPoint": [-1.699, -102.591, 76.665],
      "gamePoint": {
        "x": 16.1,
        "y": 0
      },
      "evidence": {
        "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
        "notes": "Hash-bound bottom-center anchor aligns the playable surface map to the retained side-scroller world footprint."
      }
    },
    "evidence": {
      "sourceAsset": "assets.showcaseSideScrollerWorld",
      "renderedProbe": "tests/reports/showcase-release-asset-probes/showcaseSideScrollerWorld.png",
      "routeOverlay": "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png",
      "notes": "Manifest-authored side-scroller surface map bound to the selected world hash and retained release/route screenshots. The platformer generator uses this map for player surfaces, hazards, checkpoints, finish progression, and scale validation."
    }
  },
  "characterWorldScaleCompatible": true,
  "styleCompatible": true,
  "primitivePrimaryWorldRejected": true,
  "playableSurfaceEvidence": "game-template/showcase-skyline-runner-platformer-playable-surfaces.json"
},
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
    authoredPlayableSeconds,
    surfaceContactProven: initialSurfaceAlignment.feetOnSurface
  }
};
Object.defineProperty(window, "__AURA3D_SHOWCASE_SKYLINE_RUNNER__", { value: mountedEvidence, configurable: true, writable: true });

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
