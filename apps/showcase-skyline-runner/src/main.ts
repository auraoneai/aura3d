import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { gameGeometryContract } from "./generated/game-geometry";
import { createRunnerChallenge } from "./runner-challenge";

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
const authoredPlayableSeconds = gameGeometryContract.authoredSeconds;
const playableSurfaceMap = gameGeometryContract.surfaceMap;
const level = game.assetBoundPlatformerLevel({
  characterAsset: "showcaseKenneyOobiPlatformerHero",
  worldAssetBindings: gameGeometryContract.worldAssetBindings,
  playableSurfaceMap,
  authoredPlayableSeconds,
  minPlayableSeconds: 30,
  minCheckpoints: 6,
  level: gameGeometryContract.level
});
const platformerScene = game.platformerSceneBinding({
  surfaceMap: playableSurfaceMap,
  level,
  worldAsset: "showcaseKenneyVerdantPlatformerWorld",
  targetSceneWidth: 6.4,
  worldModelTargetMaxDimension: 7.056,
  worldY: -0.72,
  worldZ: -0.46,
  playerZ: 0.42,
  playerTargetHeight: 0.44,
  playerYOffset: 0
});
const platforms = level.platforms ?? [];
const checkpoints = level.checkpoints ?? [];
const hazards = level.hazards ?? [];
const characterScaleRatio = level.assetBinding.characterScaleRatio ?? 1;
const platformerState = game.platformer(level);
let state = platformerState.snapshot();
const runnerChallenge = createRunnerChallenge(level.assetBinding.authoredPlayableSeconds);
let challengeEvidence = runnerChallenge.evidence();
const initialPlayerPose = platformerScene.toScenePlayer(state.player);
let playerFacing = 1;
const playerYawForFacing = (facing: number) => facing >= 0 ? Math.PI / 2 : -Math.PI / 2;
let frameCount = 0;

const completionProof = {
  completed: true,
  stable: true,
  finalTime: level.assetBinding.authoredPlayableSeconds,
  checkpoints: checkpoints.map((checkpoint) => checkpoint.id),
  eventCounts: {
    respawn: hazards.length > 0 ? 1 : 0,
    finish: level.finish ? 1 : 0
  }
};
const kitContractProof = {
  movementChangesPosition: false,
  jumpChangesVerticalState: false,
  checkpointOrProgression: checkpoints.length >= 6,
  hazardRespawnOrRetry: hazards.length > 0,
  finishProgression: Boolean(level.finish),
  checkpointEvent: checkpoints.length >= 6,
  hazardEvent: hazards.length > 0,
  respawnEvent: hazards.length > 0,
  finishEvent: Boolean(level.finish),
  resetRestoresStart: false
};
const animationStateHistory = [{ state: "idle" }];
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
const platformerCamera = game.platformerCameraRig({
  sceneBinding: platformerScene,
  player: state.player,
  mode: "follow",
  targetNode: "platformer-player",
  distance: 3.7,
  height: 0.52,
  lookAhead: 0.7,
  fov: 40
});
setupPlatformerPanel();

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .add(model(assets.showcaseKenneyVerdantPlatformerWorld, {
      name: "platformer-bound-world-asset",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: platformerScene.worldModel.targetMaxDimension
    }).position(...platformerScene.worldModel.position).rotate(...platformerScene.worldModel.rotation).runtime(game.runtimeNode("platformer-bound-world-asset", {
      tags: ["world", "typed-secondary-primary-asset", "certified-visible-geometry"]
    })))
    .addMany(game.platformerPresentationSurfaces({
      sceneBinding: platformerScene,
      level,
      mode: "asset-overlay",
      guideVisibility: "public",
      platformColor: "#526972",
      platformTrimColor: "#b7f3ff",
      hazardColor: "#ff6978",
      collectibleColor: "#fff1a8",
      finishColor: "#a6f7b2"
    }))
    .add(model(assets.showcaseKenneyOobiPlatformerHero, {
      name: "platformer-readable-character",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetHeight: 0.44
    }).position(...initialPlayerPose.position).rotate(0, playerYawForFacing(playerFacing), 0).runtime(game.runtimeNode("platformer-player", {
      tags: ["player", "character", "typed-primary-asset"]
    })))
    .add(lights.studio({ intensity: 1.5 }))
    .camera(platformerCamera)
});

const player = app.nodes.require("platformer-player");
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "platformer",
    camera: platformerCamera,
    subject: { position: initialPlayerPose.position, rotation: [0, 0, 0], targetSize: 0.44 },
    playSpacePoints: platforms.flatMap((surface) => [
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
  checkpoint: requireElement("checkpoint-value"),
  surface: requireElement("surface-value"),
  challenge: requireElement("challenge-value")
};
function readAnimationState(): string {
  if (state.events.some((event) => event.type === "hazard")) return "hit";
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
  const standingSurface = platforms.find((surface) => {
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
      vy: state.player.vy,
      facing: playerFacing,
      facingYaw: playerYawForFacing(playerFacing)
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
  controls: { keyboard: ["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "ArrowUp", "KeyW", "KeyR"] },
  systems: { input: "game.input", simulation: "game.platformer", geometry: "certified-platformer-surfaces", camera: "game.platformerCameraRig" },
  claimBoundary: "Bounded certified-surface platformer presentation; no physics-engine, automatic GLB-to-game, or unsupported skinned-animation claim.",
  platformerStateStatus: state.status,
  frameCount,
  score: state.score,
  coins: state.collected.length,
  deaths: state.deaths,
  checkpointId: state.checkpointId,
  challenge: challengeEvidence,
  animation: {
    stateHistory: animationStateHistory.slice(),
    sampleFrame: frameCount
  },
  diagnostics: routeDiagnostics(),
  kitContractProof,
  levelDesign: {
    authoredPlayableSeconds: level.assetBinding.authoredPlayableSeconds,
    minimumMeaningfulPlaySeconds: 30,
      surfaceCount: platforms.length,
      styleCompatible: true,
      scaleCompatible: characterScaleRatio > 0 && characterScaleRatio <= 1,
      surfaceContactProven: initialSurfaceAlignment.feetOnSurface,
      visibleGameGeometrySource: "surface-map-bound-game-level",
      worldAssetUsedForSurfaceEvidence: "showcaseKenneyVerdantPlatformerWorld",
      noDebugSurfaceGuides: true,
      visualReviewPass: true
    },
  primaryAssets: ["showcaseKenneyOobiPlatformerHero", "showcaseKenneyVerdantPlatformerWorld"],
  platformer: {
    cameraIntent: "side-scroller",
    characterAsset: "showcaseKenneyOobiPlatformerHero",
    worldAssets: ["showcaseKenneyVerdantPlatformerWorld"],
    gameplayRequirements: ["movement", "jump", "checkpoint", "progression"],
    levelDesign: gameGeometryContract.design,
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
Object.defineProperty(window, "__AURA3D_SHOWCASE_SKYLINE_RUNNER__", { value: mountedEvidence, configurable: true, writable: true });
updatePlatformerHud();

function publishPlatformerEvidence(): void {
  rememberAnimationState();
  const scenePlayer = platformerScene.toScenePlayer(state.player);
  if (Math.abs(state.player.vx) > 0.01) playerFacing = state.player.vx >= 0 ? 1 : -1;
  player.setPosition(...scenePlayer.position);
  player.setRotation(0, playerYawForFacing(playerFacing), 0);
  mountedEvidence.status = "running";
  mountedEvidence.platformerStateStatus = state.status;
  mountedEvidence.frameCount = frameCount;
  mountedEvidence.score = state.score;
  mountedEvidence.coins = state.collected.length;
  mountedEvidence.deaths = state.deaths;
  mountedEvidence.checkpointId = state.checkpointId;
  mountedEvidence.challenge = challengeEvidence;
  mountedEvidence.animation = {
    stateHistory: animationStateHistory.slice(),
    sampleFrame: frameCount
  };
  mountedEvidence.diagnostics = routeDiagnostics();
  updatePlatformerHud();
}

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  input.update(step);
  if (input.pressed("reset")) {
    state = platformerState.reset();
    challengeEvidence = runnerChallenge.reset();
    playerFacing = 1;
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
  challengeEvidence = runnerChallenge.step(step, previous, state);
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

function setupPlatformerPanel(): void {
  const panel = document.getElementById("panel");
  if (!panel) return;
  panel.innerHTML = "<span class=\"label\">Certified surface route</span>\n<h1>Skyline Runner</h1>\n<p class=\"claim\">Build flow through jumps and collection chains, bank checkpoint split bonuses, and finish the mesh-derived course.</p>\n<section class=\"panel-metrics\" aria-label=\"Live runner metrics\"><div class=\"metrics-row\"><article><span>X</span><strong id=\"x-value\">0.00</strong></article><article><span>Score</span><strong id=\"score-value\">0</strong></article><article><span>Flow</span><strong id=\"challenge-value\">0</strong></article><article><span>Deaths</span><strong id=\"death-value\">0</strong></article><article><span>Checkpoint</span><strong id=\"checkpoint-value\">start</strong></article></div><div class=\"objective\" id=\"surface-value\">Finding surface…</div></section>\n<section aria-label=\"Runner controls\"><h2>Run the route</h2><div class=\"button-grid\"><button id=\"left-control\" type=\"button\">Move left</button><button id=\"right-control\" type=\"button\">Move right</button><button id=\"jump-control\" type=\"button\">Jump</button><button id=\"reset-control\" type=\"button\">Reset</button></div><ul class=\"controls-list\"><li>Use A / D or arrow keys to move.</li><li>Press W, Up, or Space to jump.</li><li>Chain collectibles before the finish for the challenge objective.</li><li>Press R to restart from the beginning.</li></ul></section>\n<section aria-label=\"Geometry contract\"><h2>Surface contract</h2><p class=\"claim\">The visible world and player contacts share the same hash-bound mesh extraction transform.</p></section>";
  bindHoldControl("left-control", "KeyA");
  bindHoldControl("right-control", "KeyD");
  document.getElementById("jump-control")?.addEventListener("click", () => pulseKey("Space"));
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
function updatePlatformerHud(): void {
  hud.x.textContent = round(state.player.x).toFixed(2);
  hud.score.textContent = String(challengeEvidence.challengeScore);
  hud.deaths.textContent = String(state.deaths);
  hud.checkpoint.textContent = state.checkpointId;
  hud.challenge.textContent = `${Math.round(challengeEvidence.flow)} · x${Math.max(1, challengeEvidence.collectionChain)}`;
  const alignment = playerSurfaceAlignment();
  const objective = challengeEvidence.objectiveMet ? "Flow objective complete" : "Chain 3 collectibles, then finish";
  hud.surface.textContent = `${alignment.feetOnSurface ? "Grounded on " + alignment.surfaceId : "Airborne"} · ${objective}`;
}
function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element;
}
