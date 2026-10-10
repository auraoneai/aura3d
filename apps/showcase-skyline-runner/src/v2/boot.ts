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

const LIFT_SPECS: readonly SkylineLiftSpec[] = SKYLINE_MOVING_PLATFORMS.map(
  (platform): SkylineLiftSpec => ({
    id: platform.id,
    x: platform.x,
    y: platform.y,
    width: platform.width,
    height: platform.height,
    axis: platform.axis,
    amplitude: platform.amplitude,
    periodSeconds: platform.period,
    phase: platform.phase ?? 0
  })
);

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
  lifts: LIFT_SPECS,
  characterHeight: SKYLINE_CHARACTER_HEIGHT,
  characterWidth: SKYLINE_CHARACTER_WIDTH,
  authoredGravity: skylineMotion.gravity,
  spawn: { x: state.player.x, y: state.player.y }
});

/** Lean port of the legacy authority merge: Rapier owns the transform. */
const SKYLINE_AUTHORITY_DESYNC_GAME_UNITS = SKYLINE_CHARACTER_HEIGHT * 2.5;
const physicsProof = {
  solverSteps: 0,
  solverGroundedFrames: 0,
  solverAirborneFrames: 0,
  solverCollisionFrames: 0,
  respawnTeleportsApplied: 0,
  desyncRecoveries: 0,
  liftCarriedSteps: 0,
  airborneTransitions: 0,
  solverLandings: 0,
  maxJumpApexGameUnits: 0,
  maxDescentSpeedGameUnitsPerSecond: 0,
  lastAuthorityDriftGameUnits: 0,
  maxAuthorityDriftGameUnits: 0
};
let solverVelocity = { x: 0, y: 0 };
let lastSupportedY = state.player.y;
let solverWasAirborne = false;
let currentArcApex = 0;

function advancePhysicalCharacter(frameSeconds: number, authored: GamePlatformerSnapshot): GamePlatformerSnapshot {
  const teleported = authored.events.some(
    (event: (typeof authored.events)[number]) => event.type === "respawn" || event.type === "reset"
  );
  const solverPosition = skylineCharacterWorld.position();
  const driftFromRules = Math.hypot(authored.player.x - solverPosition.x, authored.player.y - solverPosition.y);
  const desynced = !teleported && (!Number.isFinite(driftFromRules) || driftFromRules > SKYLINE_AUTHORITY_DESYNC_GAME_UNITS);
  if (teleported || desynced) {
    if (desynced) physicsProof.desyncRecoveries += 1;
    if (teleported) physicsProof.respawnTeleportsApplied += 1;
    skylineCharacterWorld.place({ x: authored.player.x, y: authored.player.y }, authored.time);
    solverVelocity = { x: 0, y: 0 };
    lastSupportedY = authored.player.y;
    solverWasAirborne = false;
  }
  const intent = authored.status === "completed" ? { vx: 0, vy: 0 } : { vx: authored.player.vx, vy: authored.player.vy };
  const steps = skylineCharacterWorld.advance(frameSeconds, intent);
  const last = steps[steps.length - 1];
  physicsProof.solverSteps += steps.length;
  if (last) {
    const drift = Math.hypot(last.position.x - authored.player.x, last.position.y - authored.player.y);
    physicsProof.lastAuthorityDriftGameUnits = drift;
    physicsProof.maxAuthorityDriftGameUnits = Math.max(physicsProof.maxAuthorityDriftGameUnits, drift);
    solverVelocity = last.velocity;
    if (last.collisions > 0) physicsProof.solverCollisionFrames += 1;
    if (last.ridingLiftId) physicsProof.liftCarriedSteps += 1;
    physicsProof.maxDescentSpeedGameUnitsPerSecond = Math.max(
      physicsProof.maxDescentSpeedGameUnitsPerSecond,
      Math.max(0, -last.velocity.y)
    );
  }
  const grounded = skylineCharacterWorld.grounded();
  const pose = skylineCharacterWorld.position();
  if (grounded) {
    physicsProof.solverGroundedFrames += 1;
    if (solverWasAirborne) {
      physicsProof.solverLandings += 1;
      physicsProof.maxJumpApexGameUnits = Math.max(physicsProof.maxJumpApexGameUnits, currentArcApex);
      currentArcApex = 0;
      solverWasAirborne = false;
    }
    lastSupportedY = pose.y;
  } else {
    physicsProof.solverAirborneFrames += 1;
    if (!solverWasAirborne) physicsProof.airborneTransitions += 1;
    solverWasAirborne = true;
    currentArcApex = Math.max(currentArcApex, pose.y - lastSupportedY);
  }
  return {
    ...authored,
    player: { ...authored.player, x: pose.x, y: pose.y, vx: solverVelocity.x, vy: solverVelocity.y, grounded }
  };
}

// ---- Input ------------------------------------------------------------------
const input = engineGame.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp", "Space"],
    dash: ["ShiftLeft", "KeyK"],
    fire: ["KeyJ", "KeyL"],
    pause: ["KeyP"],
    reset: ["KeyR"]
  },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 120
});

// Touch zones — lane-swipe preset plus manual pointer zones on the canvas so a
// coarse-pointer run works end to end (move / jump / dash / fastfall).
let touchMoveX = 0;
let touchJumpQueued = false;
let touchJumpHeld = false;
let touchDashQueued = false;
let touchFastFall = false;
let touchEngaged = false;
let activePointer: { id: number; x: number; y: number } | null = null;

const canvasEl = (): HTMLElement | null => target.querySelector("canvas");
function wireTouch() {
  const canvas = canvasEl();
  if (!canvas) return;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    touchEngaged = true;
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (event.clientY - rect.top) / Math.max(1, rect.height);
    activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (nx < 0.33) touchMoveX = -1;
    else if (nx > 0.67) touchMoveX = 1;
    else { touchJumpQueued = true; touchJumpHeld = true; }
    if (ny > 0.75) touchFastFall = true;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!activePointer || event.pointerId !== activePointer.id) return;
    const dy = event.clientY - activePointer.y;
    const dx = event.clientX - activePointer.x;
    if (dy < -48) { touchJumpQueued = true; touchJumpHeld = true; activePointer.y = event.clientY; }
    if (dy > 56) touchFastFall = true;
    if (Math.abs(dx) > 64) { touchDashQueued = true; activePointer.x = event.clientX; }
  });
  const release = (event: PointerEvent) => {
    if (activePointer && event.pointerId === activePointer.id) {
      activePointer = null;
      touchMoveX = 0;
      touchJumpHeld = false;
      touchFastFall = false;
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}
wireTouch();

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

let currentAct = resolveSkylineActIndex(state.player.x);
const collectedSet = new Set<string>(state.collected);

function applyActVisibility(actIndex: number) {
  for (const [act, ids] of Object.entries(world.actNodeIds) as [string, readonly string[]][]) {
    const visible = Number(act) === actIndex;
    for (const id of ids) handle(id)?.setVisible(visible);
  }
}
applyActVisibility(currentAct);

function respawnAt(checkpointId: string) {
  state = platformerState.reset(checkpointId);
  skylineCharacterWorld.place({ x: state.player.x, y: state.player.y }, state.time);
  solverVelocity = { x: 0, y: 0 };
  lastSupportedY = state.player.y;
  collectedSet.clear();
  for (const id of state.collected) collectedSet.add(id);
}

function observeEvents(prev: GamePlatformerSnapshot, next: GamePlatformerSnapshot) {
  for (const event of next.events) {
    const [ex, ey] = platformerScene.toScenePoint({ x: event.x, y: event.y });
    const point: readonly [number, number, number] = [ex, ey, GAMEPLAY_ACTOR_DEPTH];
    switch (event.type) {
      case "jump":
        feel.onJump(point);
        fx.jumpKick(point);
        void audio.cue("jump");
        break;
      case "land":
        feel.onLand(point);
        fx.landingPuff(point);
        void audio.cue("land-dust");
        break;
      case "dash":
        feel.onDash(point);
        fx.dashStreak(point);
        void audio.cue("dash");
        break;
      case "collect": {
        const collectible = collectibles.find((item: (typeof collectibles)[number]) => item.id === event.id);
        const [sx, sy] = collectible
          ? platformerScene.toScenePoint({ x: collectible.x, y: collectible.y })
          : [ex, ey];
        const cpoint: readonly [number, number, number] = [sx, sy, GAMEPLAY_ACTOR_DEPTH];
        collectedSet.add(String(event.id));
        if (String(event.id).includes("ember-charge")) {
          feel.onEmberPickup(cpoint);
          void audio.cue("ember-pickup");
        } else {
          feel.onCollect(cpoint);
          fx.pickupSparkle(cpoint);
          void audio.cue("coin-chime");
        }
        break;
      }
      case "checkpoint":
        feel.onCheckpoint("", point);
        fx.checkpointChime(point);
        void audio.cue("checkpoint");
        break;
      case "hazard":
      case "fall": {
        const visible = platformerScene.toScenePlayer(next.player).position;
        feel.onHazard(visible);
        fx.hazardHit(visible);
        void audio.cue("death");
        break;
      }
      case "respawn":
        feel.onRespawn(point);
        fx.respawnBlink(point);
        void audio.cue("respawn");
        break;
      case "defeat":
      case "stomp":
        feel.onSentryDefeat(point, event.type === "stomp" ? 100 : 150);
        void audio.cue("sentry-defeat");
        break;
      case "complete":
        feel.onSummit(point);
        fx.summitFlare(point);
        void audio.cue("summit");
        break;
      case "reset":
        break;
    }
  }
}

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
  const jumpQueued = touchJumpQueued;
  const dashQueued = touchDashQueued;
  touchJumpQueued = false;
  touchDashQueued = false;
  return {
    moveX: input.axis("moveX") + touchMoveX !== 0 ? Math.max(-1, Math.min(1, input.axis("moveX") + touchMoveX)) : 0,
    jumpPressed: input.pressed("jump") || jumpQueued,
    jumpHeld: input.held("jump") || touchJumpHeld,
    dashPressed: input.pressed("dash") || dashQueued,
    fastFall: touchFastFall
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
  if (nextAct !== currentAct) {
    currentAct = nextAct;
    applyActVisibility(currentAct);
    audio.setAmbienceAct(currentAct);
  }
}

// ---- Per-frame node sync -----------------------------------------------------
function syncHero() {
  const hero = handle(HERO_NODE_ID);
  if (!hero) return;
  const pose = platformerScene.toScenePlayer(state.player);
  hero.setPosition(pose.position[0], pose.position[1], pose.position[2]);
  hero.setRotation(0, playerFacing < 0 ? Math.PI : 0, 0);
}

function syncLiftCards() {
  LIFT_SPECS.forEach((lift, index) => {
    const liftNode = handle(LIFT_CARD_NODE_IDS[index]!);
    if (!liftNode) return;
    const offset = skylineLiftOffset(lift, state.time);
    const rect = platformerScene.surfaceToSceneRect({
      id: lift.id,
      x: lift.x + (lift.axis === "x" ? offset : 0),
      y: lift.y + (lift.axis === "y" ? offset : 0),
      width: lift.width,
      height: lift.height
    });
    liftNode.setPosition(rect.center[0], rect.center[1], GAMEPLAY_ACTOR_DEPTH - 0.08);
  });
}

let lastHudKey = "";
function syncHud() {
  const actTitle = `Act ${currentAct + 1}`;
  const key = JSON.stringify([currentAct, state.score, state.lives, collectedSet.size, challengeEvidence.flow, runEnded, game.session.paused]);
  if (key === lastHudKey) return;
  lastHudKey = key;
  game.hud.set("act", actTitle);
  game.hud.set("score", String(state.score).padStart(6, "0"));
  game.hud.set("lives", String(Math.max(0, state.lives)));
  game.hud.set("shards", String(collectedSet.size));
  game.hud.set("flow", `${Math.round(challengeEvidence.flow * 100)}%`);
  game.hud.set("state", runEnded ? "RUN ENDED" : game.session.paused ? "PAUSED" : "");
}

function syncFeelPresentation(dt: number) {
  feel.updatePresentation(dt, {
    simTime: state.time,
    playerX: state.player.x,
    playerY: state.player.y,
    playerFacing,
    sceneBinding: platformerScene,
    defeatedHazardIds: state.defeatedHazards,
    sentryNodes: {},
    sentryAccentNodes: {},
    emberVolleys: [],
    emberVolleyNodes: [],
    firePressed: input.held("fire"),
    emberStock,
    scoreElement: null
  });
}

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
wireTouch();

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
  game,
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
    act: currentAct,
    districtIndex: currentAct,
    checkpointId: state.checkpointId,
    checkpointsActivated: state.activatedCheckpoints.length,
    finishReached: state.status === "completed",
    paletteSignature: skylineDistrictPaletteSignature(currentAct)
  }),
  run: () => ({
    lives: state.lives,
    score: state.score,
    deaths: state.deaths,
    collected: collectedSet.size,
    emberStock,
    runEnded,
    paused: game.session.paused,
    replayActive: autorunActive,
    touchEngaged,
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
