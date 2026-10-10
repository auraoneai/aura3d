// apps/showcase-blockfall-reactor/src/v2/boot.ts — QR-14 rebuild shell (T2.1–T2.6).
// Runs only under `?a3d-qr=route-blockfall-reactor` / env A3D_QR_ROUTE_BLOCKFALL_REACTOR.
// The deterministic kit rules (rules.ts createInitialState + advanceFrame) drive
// the sim at a fixed 60 Hz; the two instanced pools are the only tile layer (the
// §6.9.16 per-cell massacre stays deleted); ghost/guide/focus/clear beats are
// timed off real observed events; the static rig tilts onto the well with an
// idle drift and the authored camera-feel punch on quads/level-ups; audio rides
// the legacy cue controller on admitted sfx ids until C-25 (stand-in R-14-15).
import { game as engineGame, scene, type AuraCameraPose, type GameInputController } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import {
  DEFAULT_SEED,
  HIDDEN_ROWS,
  VISIBLE_HEIGHT,
  DEMO_REPLAY_60S,
  createInitialState,
  createOpeningBoard,
  advanceFrame,
  ghostPiece,
  pieceCells,
  visibleLockedCells,
  type BlockfallAction,
  type BlockfallState,
  type BlockfallReplayEvent,
  type PieceKind
} from "../gameplay/rules";
import {
  ACTIVE_FOCUS_NODE_ID,
  BEAT_NODE_IDS,
  CLEAR_WAVE_NODE_ID,
  DROP_GUIDE_NODE_ID,
  HIDDEN_BLOCK_SCALE,
  BLOCK_SCALE,
  ACTIVE_BLOCK_SCALE,
  GHOST_BLOCK_SCALE,
  cellPosition,
  clearFlashNodeId,
  ghostNodeId,
  pieceMaterials
} from "../gameplay/reactor-scene";
import {
  LOCKED_POOL_CAPACITY_PER_KIND,
  boardViewMatchesState,
  createBoardViewModel,
  formatLevelDigits,
  formatScoreDigits,
  scoreDigitNodeId,
  levelDigitNodeId,
  type BoardViewModel
} from "../gameplay/board-view";
import { createBlockfallReactorAudio } from "../gameplay/reactor-audio";
import type { BlockfallAudioCue } from "../gameplay/blockfall-audio-manifest";
import { createClearFx } from "../legacy/clear-fx";
import { createCameraFeel } from "../legacy/camera-feel";
import direction from "../../art/direction";
import { blockfallWorldNodes } from "./scene/world";
import { blockfallLighting } from "./scene/lighting";
import { createBlockfallRig, blockfallCameraSpec, BASE_POSE } from "./scene/camera";
import { wireBlockfallFx } from "./scene/fx";
import { ROOM_BG } from "./scene/materials";
import { publishBlockfallEvidence } from "./evidence";
import { applyBlockfallScenario, parseBlockfallScenario } from "./scenarios";
import { createBlockfallCtx } from "./state";
import { createBlockfallAudioBlock } from "./audio";
import { createBlockfallInput, wireBlockfallTouch } from "./input";
import { wireBlockfallSync } from "./sync";
import { wireBlockfallFlow } from "./flow";

const ROUTE_FLAG = "A3D_QR_ROUTE_BLOCKFALL_REACTOR" as const;
const SIM_STEP = 1 / 60;

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const scenario = parseBlockfallScenario(routeParams.get("scenario"));
const autorunRequested = routeParams.get("autorun") === "1" || scenario === "replay";
const sceneSwaps = 0;
const bootedAtMs = performance.now();

// ---------------------------------------------------------------- scene -----

const world = blockfallWorldNodes();
function buildScene() {
  return scene()
    .background(ROOM_BG)
    .camera(blockfallCameraSpec())
    .addMany(world.nodes)
    .addMany(blockfallLighting());
}

const accessibilitySettings = engineGame.accessibility.settings([
  engineGame.accessibility.reducedMotion({
    enabled: typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
]);
const reducedMotion: boolean = accessibilitySettings.reducedMotion;

// ---------------------------------------------------------------- audio -----

const audioBlock = createBlockfallAudioBlock(reducedMotion);
const { audio, audioCueLog, pushCue, unlockAudio } = audioBlock;

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-blockfall-reactor",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "arcade-neon",
    maxScreenFraction: 0.18,
    widgets: [
      { id: "score", kind: "label", anchor: "top", label: "SCORE" },
      { id: "lines", kind: "label", anchor: "top-left", label: "LINES" },
      { id: "level", kind: "label", anchor: "top-left", label: "LEVEL" },
      { id: "reactor", kind: "gauge", anchor: "top-right", label: "REACTOR" },
      { id: "hold", kind: "label", anchor: "bottom-left", label: "HOLD" },
      { id: "next", kind: "label", anchor: "bottom-right", label: "NEXT" },
      { id: "mode", kind: "label", anchor: "bottom", label: "STATUS" }
    ]
  },
  touch: {
    preset: "dpad-4btn",
    bindings: {
      stick: "move",
      fire: "hard-drop",
      secondary: "rotate",
      pause: "menu"
    }
  },
  sound: {
    cues: {
      move: { asset: "blockfallMoveSfx" },
      rotate: { asset: "blockfallRotateSfx" },
      "hold-swap": { asset: "blockfallHoldSwapSfx" },
      "hard-drop": { asset: "blockfallHardDropSlamSfx" },
      lock: { asset: "blockfallLockThudSfx" },
      "line-clear": { asset: "blockfallLineClearSfx" },
      quad: { asset: "blockfallQuadFanfareSfx" },
      "level-up": { asset: "blockfallLevelUpSfx" },
      "game-over": { asset: "blockfallGameOverStingSfx" },
      "ambient-hum": { asset: "blockfallReactorHumLoop" }
    }
  },
  juice: {
    "hard-drop": { hitStopMs: 25, trauma: 0.12 },
    "line-clear": { hitStopMs: 45, trauma: 0.2 },
    quad: { hitStopMs: 80, trauma: 0.42 },
    "level-up": { hitStopMs: 55, trauma: 0.24 },
    "game-over": { hitStopMs: 90, trauma: 0.35 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_blockfall_reactor` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-blockfall-reactor`).
    flags: ["route_blockfall_reactor", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireBlockfallFx(game);

// Node handles (resolved lazily once the scene mounts) -------------------------

type NodeHandle = NonNullable<ReturnType<Game["app"]["nodes"]["get"]>>;
const handles = new Map<string, NodeHandle | null>();
function handle(name: string): NodeHandle | null {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name) ?? null);
  return handles.get(name) ?? null;
}
const ghostHandles = Array.from({ length: 4 }, (_, index) => ghostNodeId(index));
const clearFlashIds = Array.from({ length: VISIBLE_HEIGHT }, (_, row) => clearFlashNodeId(row));

// -------------------------------------------------------------- sim state ---

const ctx = createBlockfallCtx(autorunRequested);

const cameraFeel = createCameraFeel({
  reducedMotion,
  basePosition: BASE_POSE.position,
  baseTarget: BASE_POSE.target
});
const clearFx = createClearFx({
  reducedMotion,
  handles: world.shardNodeIds.map((id) => ({
    setPosition(x: number, y: number, z: number) { handle(id)?.setPosition(x, y, z); },
    setRotation(x: number, y: number, z: number) { handle(id)?.setRotation(x, y, z); },
    setScale(scale: number | readonly [number, number, number]) { handle(id)?.setScale(scale as [number, number, number]); },
    setVisible(visible: boolean) { handle(id)?.setVisible(visible); }
  }))
});

// ------------------------------------------------------------- input --------

const input = createBlockfallInput();
wireBlockfallTouch(ctx, { game, unlockAudio });

// ------------------------------------------------------------ state sync ----

const sync = wireBlockfallSync(ctx, {
  handle, game, fx, clearFx, cameraFeel, ghostHandles, clearFlashIds, world
});
const { isDangerState, stackHeight, syncInstancedPools, syncGhostAndGuide, syncActiveFocus,
  syncClearFlash, syncBeats, syncReactor, syncScoreboard, syncHud } = sync;

// ---------------------------------------------------------- event wiring ----

const flow = wireBlockfallFlow(ctx, {
  game, pushCue, fx, clearFx, cameraFeel, input, audio,
  queue: (actions: BlockfallAction[]) => { ctx.queuedActions.push(...actions); }
});
const { observeEvents, collectInputActions } = flow;

// ------------------------------------------------------------- update -------

function updateGameplay(dt: number): void {
  ctx.frame += 1;
  input.update(dt);
  if (game.session.paused) {
    ctx.queuedActions = [];
    return;
  }
  collectInputActions(dt);

  // Scenario action bursts spread across consecutive frames (real path: they
  // queue into the same per-frame action array the keyboard uses).
  if (ctx.pendingBurst.length > 0) {
    ctx.queuedActions.push(...ctx.pendingBurst.splice(0, 3));
  }

  ctx.simAccum += dt;
  let simAdvanced = false;
  while (ctx.simAccum >= SIM_STEP) {
    ctx.simAccum -= SIM_STEP;
    simAdvanced = true;
    if (ctx.replayActive) {
      while (ctx.replayIndex < ctx.replayEvents.length && ctx.replayEvents[ctx.replayIndex].frame <= ctx.state.frame) {
        ctx.queuedActions.push(ctx.replayEvents[ctx.replayIndex].action);
        ctx.replayIndex += 1;
      }
      if (ctx.state.gameOver || ctx.replayIndex >= ctx.replayEvents.length && ctx.state.frame > ctx.replayEvents[ctx.replayEvents.length - 1].frame + 240) {
        ctx.replayActive = false;
        ctx.replayIndex = 0;
        ctx.queuedActions.push({ type: "reset", seed: DEFAULT_SEED });
      }
    }
    const prev = ctx.state;
    ctx.state = advanceFrame(ctx.state, ctx.queuedActions);
    ctx.queuedActions = [];
    observeEvents(prev, ctx.state);
  }
  if (!simAdvanced) return;

  const view = createBoardViewModel(ctx.state);
  ctx.boardViewProof.lastParityMatch = boardViewMatchesState(view, ctx.state);
  ctx.boardViewProof.capacityRespected = ctx.boardViewProof.capacityRespected
    && view.lockedCount <= LOCKED_POOL_CAPACITY_PER_KIND * 7;
  syncInstancedPools(view);
  syncGhostAndGuide();
  syncActiveFocus();
  syncClearFlash();
  syncReactor();
  syncScoreboard();
}

game.app.onFrame?.(({ dt: rawDt }) => {
  const frameDt = game.session.scaledDt(rawDt) || rawDt;
  const dt = Math.min(0.05, Math.max(0.001, frameDt));
  updateGameplay(dt);
  clearFx.update(dt);
  syncBeats(dt);
  syncHud();
  cameraFeel.update(dt);
  if (ctx.firstFrameAt === null) ctx.firstFrameAt = performance.now();
});

game.start();
void game.ready().then(() => {
  const rig = createBlockfallRig();
  ctx.rigForEvidence = rig;
  const origUpdate = rig.update.bind(rig);
    (rig as { update(ctx: { dt: number }): AuraCameraPose }).update = (frameCtx) => {
    rig.rigState.punch = cameraFeel.proof().punchActive ? 1 : 0;
    const pose = origUpdate(frameCtx);
    // Camera-feel offset composited over the drifted pose: the feel controller
    // writes base+offset into a scratch spec, and only its delta applies.
    const scratch: { position?: [number, number, number]; target?: [number, number, number] } = {};
    cameraFeel.apply(scratch);
    const poseOut: AuraCameraPose = {
      position: [
        pose.position[0] + (scratch.position?.[0] ?? BASE_POSE.position[0]) - BASE_POSE.position[0],
        pose.position[1] + (scratch.position?.[1] ?? BASE_POSE.position[1]) - BASE_POSE.position[1],
        pose.position[2] + (scratch.position?.[2] ?? BASE_POSE.position[2]) - BASE_POSE.position[2]
      ],
      target: [
        pose.target[0] + (scratch.target?.[0] ?? BASE_POSE.target[0]) - BASE_POSE.target[0],
        pose.target[1] + (scratch.target?.[1] ?? BASE_POSE.target[1]) - BASE_POSE.target[1],
        pose.target[2] + (scratch.target?.[2] ?? BASE_POSE.target[2]) - BASE_POSE.target[2]
      ],
      up: pose.up,
      roll: pose.roll,
      fov: pose.fov,
      near: pose.near,
      far: pose.far
    };
    ctx.lastPose = poseOut;
    return poseOut;
  };
  game.app.camera?.use?.(rig as never, { blend: 0.12 });
    game.app.setOutput?.({ preset: "neon-night",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  ctx.firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return ctx.frame; },
    firstFrameAt: ctx.firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});

publishBlockfallEvidence({
  gameplay: () => ({
    paused: ctx.state.paused,
    gameOver: ctx.state.gameOver,
    replayActive: ctx.replayActive,
    touchEngaged: ctx.touchEngaged,
    lastMove: ctx.state.lastMove,
    replayIndex: ctx.replayIndex,
    replayTotal: ctx.replayEvents.length
  }),
  board: () => ({
    lines: ctx.state.lines,
    linesClearedThisRound: ctx.linesClearedThisRound,
    stackHeight: stackHeight(ctx.state),
    score: ctx.state.score,
    level: ctx.state.level,
    combo: ctx.state.combo,
    backToBack: ctx.state.backToBack,
    reactor: ctx.state.reactor,
    piecesPlaced: ctx.state.piecesPlaced,
    lockedCells: visibleLockedCells(ctx.state).length,
    activeKind: ctx.state.active?.kind ?? null,
    hold: ctx.state.hold,
    queue: ctx.state.queue.slice(0, 3)
  }),
  boardView: () => ({
    ...ctx.boardViewProof,
    lockedGroups: world.lockedPools.length,
    lockedSubPools: world.lockedPools.length,
    perCellNodesDeleted: true as const
  }),
  fx: () => ({ liveCount: game.fx.liveCount, backend: game.fx.backend }),
  clearFx: () => clearFx.proof(),
  cameraFeel: () => cameraFeel.proof(),
  audio: () => audio.proof(),
  render: () => ({ frame: ctx.frame, bootedAtMs, firstFrameAt: ctx.firstFrameAt }),
  loading: () => ({ sceneSwaps, lazyLoadedCount: 0 }),
  physics: () => ({ backend: "rapier", bodyCount: 0, sensorCount: 0 }),
  // T2.2-post: appliedLook derives from the C-31 runtime manifest.
  appliedLook: { ...lookManifest(game.lookSource()), preset: "neon-night" },
  rig: () => ({ id: "blockfall-reactor.static", driftDeg: 1.5, punch: ctx.rigForEvidence?.rigState.punch ?? 0 }),
  scenario: () => scenario
});

if (scenario) {
  applyBlockfallScenario(scenario, {
    queue: (actions) => { ctx.pendingBurst.push(...actions); },
    startReplay: () => { ctx.replayActive = true; ctx.replayIndex = 0; },
    seedBoard: (board) => {
      ctx.state = createInitialState(DEFAULT_SEED, board);
    }
  });
}
