// apps/showcase-skyline-runner/src/v2/boot.ts — Skyline Runner v2 shell (T2.x).
// Drives the real platformer kit through the shared scene binding, with the
// Rapier character solver deciding contact truth exactly like the legacy loop.
import { game as engineGame, scene } from "@aura3d/engine";
import { createGame, lookManifest, type Prd09Game } from "@aura3d/game";
import type { AuraRuntimeNodeHandle, GamePlatformerSnapshot } from "@aura3d/engine";
import direction from "../../art/direction";
import {
  SKYLINE_AUTHORED_PLAYABLE_SECONDS,
  SKYLINE_CHARACTER_HEIGHT,
  SKYLINE_CHARACTER_WIDTH,
  SKYLINE_MOVING_PLATFORMS,
  skylineMotion
} from "../gameplay/level";
import { resolveSkylineActIndex, skylineDistrictPaletteSignature } from "../gameplay/act-palette";
import { createRunnerChallenge } from "../gameplay/runner-challenge";
import {
  createSkylineCharacterWorld,
  skylineLiftOffset,
  type SkylineLiftSpec,
  type SkylinePhysicalPlatform
} from "../legacy/character-world";
import { createSkylineFeel } from "../legacy/feel";
import { skylineCameraTuning } from "../legacy/camera-readability";
import { createSkylineAudio } from "../legacy/skyline-audio";
import {
  GAMEPLAY_ACTOR_DEPTH,
  checkpoints,
  collectibles,
  level,
  platformerScene,
  platforms
} from "./scene/binding";
import { createSkylineRig, skylineCameraSpec, skylinePoseFor } from "./scene/camera";
import { skylineLighting } from "./scene/lighting";
import { SKYLINE_BG } from "./scene/materials";
import { wireSkylineFx } from "./scene/fx";
import { HERO_NODE_ID, LIFT_CARD_NODE_IDS, skylineWorldNodes } from "./scene/world";
import { publishSkylineEvidence } from "./evidence";
import { applySkylineScenario, parseSkylineScenario, skylineScenarioLook } from "./scenarios";
import { createSkylineSolver } from "./solver";
import { createSkylineTouch, wireSkylineTouch } from "./touch-input";
import { createSkylineFlowCtx, wireSkylineFlow } from "./flow";
import { wireSkylineSync, SKYLINE_LIFT_SPECS } from "./sync";
import { createSkylineInput } from "./input";

const ROUTE_FLAG = "A3D_QR_ROUTE_SKYLINE_RUNNER" as const;

const params = new URLSearchParams(window.location.search);
const scenario = parseSkylineScenario(params.get("scenario"));
const autorunRequested = params.get("autorun") === "1";

const world = skylineWorldNodes();
const buildScene = () =>
  scene()
    .background(SKYLINE_BG)
    .camera(skylineCameraSpec())
    .addMany(world.nodes)
    .addMany(skylineLighting());

// Accessibility is read before the audio/feel controllers so reduced-motion
// snapshots exist before any cue could try to fire.
const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;
const audio = createSkylineAudio(reducedMotion);
const feel = createSkylineFeel({
  reducedMotion,
  cameraTuning: skylineCameraTuning(false),
  audio
});

const target = document.getElementById("app") ?? document.body;

const game: Prd09Game<string, string> = createGame({
  id: "showcase-skyline-runner",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "sci-fi-telemetry",
    maxScreenFraction: 0.2,
    widgets: [
      { id: "act", kind: "label", anchor: "top-left", label: "ACT" },
      { id: "score", kind: "label", anchor: "top", label: "SCORE" },
      { id: "lives", kind: "label", anchor: "top-right", label: "LIVES" },
      { id: "shards", kind: "label", anchor: "top-right", label: "SHARDS" },
      { id: "flow", kind: "gauge", anchor: "bottom-left", label: "FLOW" },
      { id: "state", kind: "label", anchor: "bottom", label: "STATUS" }
    ]
  },
  touch: {
    preset: "lane-swipe",
    bindings: { stick: "moveX", tap: "jump", swipeDown: "fastfall", swipeRight: "dash", pause: "menu" }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_skyline_runner` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-skyline-runner`).
    flags: ["route_skyline_runner", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireSkylineFx(game);

// Lazy runtime-node lookup — nodes.get returns AuraRuntimeNodeHandle | undefined.
const nodeMap = new Map<string, AuraRuntimeNodeHandle | null>();
function handle(name: string): AuraRuntimeNodeHandle | null {
  if (!nodeMap.has(name)) nodeMap.set(name, game.app.nodes?.get(name) ?? null);
  return nodeMap.get(name) ?? null;
}

// ---- Kit + solver -----------------------------------------------------------
const platformerState = engineGame.platformer(level);
let state: GamePlatformerSnapshot = platformerState.snapshot();
let playerFacing = state.player.facing;

const skylineCharacterWorld = createSkylineCharacterWorld({
  scene: platformerScene,
  platforms: platforms.map(
    (surface: (typeof platforms)[number]): SkylinePhysicalPlatform => ({
      id: surface.id,
      x: surface.x,
      y: surface.y,
      width: surface.width,
      height: surface.height
    })
  ),
  lifts: SKYLINE_LIFT_SPECS,
  characterHeight: SKYLINE_CHARACTER_HEIGHT,
  characterWidth: SKYLINE_CHARACTER_WIDTH,
  authoredGravity: skylineMotion.gravity,
  spawn: { x: state.player.x, y: state.player.y }
});

/** Lean port of the legacy authority merge: Rapier owns the transform. */
const solver = createSkylineSolver(skylineCharacterWorld, state.player.y);
const { physicsProof, advancePhysicalCharacter, solverReset } = solver;

// ---- Input ------------------------------------------------------------------
const input = createSkylineInput();

// Touch zones — lane-swipe preset plus manual pointer zones on the canvas so a
// coarse-pointer run works end to end (move / jump / dash / fastfall).
const touch = createSkylineTouch();
wireSkylineTouch(touch, () => target.querySelector("canvas"));

// ---- Run state ---------------------------------------------------------------
const runnerChallenge = createRunnerChallenge(SKYLINE_AUTHORED_PLAYABLE_SECONDS);
let challengeEvidence = runnerChallenge.evidence();
let runEnded = false;
let frame = 0;
let firstFrameAt = 0;

// Autorun: scripted run-right with periodic jumps/dashes through the kit's own
// inputs, starting mid-course so act-2 conditions are reachable inside capture
// deadlines.
let autorunActive = autorunRequested;
let autorunClock = 0;
let autorunNextJump = 0.55;
let autorunNextDash = 3.1;


const flowCtx = createSkylineFlowCtx({
  act: resolveSkylineActIndex(state.player.x),
  collected: state.collected
});
const flow = wireSkylineFlow(flowCtx, {
  world, handle, platformerState,
  getState: () => state,
  setState: (next) => { state = next; },
  characterWorld: skylineCharacterWorld,
  solverReset,
  scene: platformerScene,
  collectibles, feel, fx, audio
});
const { applyActVisibility, respawnAt, observeEvents } = flow;
applyActVisibility(flowCtx.currentAct);

function collectInputs(): { moveX: number; jumpPressed: boolean; jumpHeld: boolean; dashPressed: boolean; fastFall: boolean } {
  if (input.pressed("reset")) {
    state = platformerState.reset();
    skylineCharacterWorld.place({ x: state.player.x, y: state.player.y }, state.time);
    runEnded = false;
  }
  if (input.pressed("pause")) {
    feel.togglePause();
    void audio.cue("pause");
  }
  if (autorunActive) {
    autorunClock += 1 / 60;
    const jumpNow = autorunClock >= autorunNextJump;
    if (jumpNow) {
      autorunNextJump = autorunClock + 0.9 + (autorunClock % 1.3);
    }
    const dashNow = autorunClock >= autorunNextDash;
    if (dashNow) autorunNextDash = autorunClock + 2.8;
    return { moveX: 1, jumpPressed: jumpNow, jumpHeld: true, dashPressed: dashNow, fastFall: false };
  }
  const jumpQueued = touch.touchJumpQueued;
  const dashQueued = touch.touchDashQueued;
  touch.touchJumpQueued = false;
  touch.touchDashQueued = false;
  return {
    moveX: input.axis("moveX") + touch.touchMoveX !== 0 ? Math.max(-1, Math.min(1, input.axis("moveX") + touch.touchMoveX)) : 0,
    jumpPressed: input.pressed("jump") || jumpQueued,
    jumpHeld: input.held("jump") || touch.touchJumpHeld,
    dashPressed: input.pressed("dash") || dashQueued,
    fastFall: touch.touchFastFall
  };
}

let emberStock = 0;
function updateGameplay(dt: number) {
  input.update(dt);
  if (game.session.paused) return;
  const step = Math.min(dt, 1 / 20);
  const prev = state;
  const controls = collectInputs();
  const authored = platformerState.step(step, {
    moveX: controls.moveX,
    jumpPressed: controls.jumpPressed,
    jumpHeld: controls.jumpHeld,
    dashPressed: controls.dashPressed,
    fastFall: controls.fastFall
  });
  state = advancePhysicalCharacter(step, authored);
  if (!runEnded && state.lives <= 0) {
    runEnded = true;
    feel.togglePause();
    void audio.cue("death");
  }
  observeEvents(prev, state);
  emberStock = state.collected.filter((id: string) => String(id).includes("ember-charge")).length;
  if (input.pressed("fire") && emberStock > 0) {
    const [sx, sy] = platformerScene.toScenePoint({ x: state.player.x, y: state.player.y + 0.2 });
    const point: readonly [number, number, number] = [sx, sy, GAMEPLAY_ACTOR_DEPTH];
    feel.onEmberFire(point);
    fx.emberVolley(point);
    void audio.cue("ember-fire");
  }
  challengeEvidence = runnerChallenge.step(step, prev, state);
  playerFacing = state.player.facing;
  const nextAct = resolveSkylineActIndex(state.player.x);
  if (nextAct !== flowCtx.currentAct) {
    flowCtx.currentAct = nextAct;
    applyActVisibility(flowCtx.currentAct);
    audio.setAmbienceAct(flowCtx.currentAct);
  }
}

// ---- Per-frame node sync -----------------------------------------------------
const sync = wireSkylineSync({
  handle, game, feel, input,
  getState: () => state,
  getPlayerFacing: () => playerFacing,
  getCurrentAct: () => flowCtx.currentAct,
  getCollectedSize: () => flowCtx.collectedSet.size,
  getChallengeFlow: () => challengeEvidence.flow,
  getRunEnded: () => runEnded,
  getEmberStock: () => emberStock
});
const { syncHero, syncLiftCards, syncHud, syncFeelPresentation } = sync;

// ---- Frame loop --------------------------------------------------------------
game.app.onFrame?.(({ dt }) => {
  updateGameplay(dt);
  syncHero();
  syncLiftCards();
  syncFeelPresentation(dt);
  syncHud();
  frame += 1;
  if (firstFrameAt === 0) firstFrameAt = performance.now();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.session.pause("visibility");
  } else {
    game.session.resume();
  }
});

const rigState = {
  get playerX() { return state.player.x; },
  get playerY() { return state.player.y; },
  get facing() { return playerFacing; },
  get shake() { return feel.snapshot().cameraShakeOffset as readonly [number, number, number]; }
};

game.start();
wireSkylineTouch(touch, () => target.querySelector("canvas"));

void game.ready().then(() => {
  const rig = createSkylineRig(rigState);
  game.app.camera?.use?.(rig, { blend: 0.12 });
  game.app.setOutput?.({ preset: "cinematic-film", exposure: Math.pow(2, direction.lighting.exposureEV ?? 0) });
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get frame() { return frame; },
    firstFrameAt: performance.now(),
    sessionStartedAt: performance.now()
  };
});

publishSkylineEvidence({
  player: () => ({
    x: state.player.x,
    y: state.player.y,
    vx: state.player.vx,
    vy: state.player.vy,
    airborne: !state.player.grounded,
    grounded: state.player.grounded,
    facing: playerFacing
  }),
  level: () => ({
    act: flowCtx.currentAct,
    districtIndex: flowCtx.currentAct,
    checkpointId: state.checkpointId,
    checkpointsActivated: state.activatedCheckpoints.length,
    finishReached: state.status === "completed",
    paletteSignature: skylineDistrictPaletteSignature(flowCtx.currentAct)
  }),
  run: () => ({
    lives: state.lives,
    score: state.score,
    deaths: state.deaths,
    collected: flowCtx.collectedSet.size,
    emberStock,
    runEnded,
    paused: game.session.paused,
    replayActive: autorunActive,
    touchEngaged: touch.touchEngaged,
    solverGroundedFrames: physicsProof.solverGroundedFrames,
    solverAirborneFrames: physicsProof.solverAirborneFrames,
    desyncRecoveries: physicsProof.desyncRecoveries
  }),
  fx: () => ({ liveCount: game.fx.liveCount, backend: game.fx.backend }),
  audio: () => {
    const proof = audio.proof();
    return {
      lastCue: proof.lastCue,
      cueLog: proof.recentCues,
      ambience: proof.ambience.activeStemBus
    };
  },
  feel: () => ({ ...feel.snapshot(), physics: { ...physicsProof }, challenge: { ...challengeEvidence } }),
  render: () => ({ frame, firstFrameAt }),
  loading: () => ({ sceneSwaps: 0, lazyLoadedCount: 0 }),
  // T2.2-post: appliedLook derives from the C-31 runtime manifest.
  appliedLook: () => ({
    ...lookManifest(game.lookSource()),
    ...skylineScenarioLook(scenario),
    background: SKYLINE_BG,
    exposureEV: direction.lighting.exposureEV,
    key: direction.lighting.key
  }),
  rig: () => {
    const pose = skylinePoseFor({ playerX: state.player.x, playerY: state.player.y, facing: playerFacing });
    return { id: "skyline-runner.follow2d", position: pose.position, target: pose.target, fov: pose.fov };
  },
  scenario: () => ({ name: scenario ?? "default-play", appliedLook: skylineScenarioLook(scenario) })
});

if (scenario) {
  applySkylineScenario(scenario, {
    respawnAt,
    startAutorun: () => {
      autorunActive = true;
      const actTwoCheckpoint = checkpoints.find(
        (cp: (typeof checkpoints)[number]) => resolveSkylineActIndex(cp.x) >= 2
      );
      if (actTwoCheckpoint) respawnAt(actTwoCheckpoint.id);
    }
  });
}
if (autorunRequested && !scenario) {
  const actTwoCheckpoint = checkpoints.find(
    (cp: (typeof checkpoints)[number]) => resolveSkylineActIndex(cp.x) >= 2
  );
  if (actTwoCheckpoint) respawnAt(actTwoCheckpoint.id);
}
