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
import { publishBlockfallEvidence } from "../evidence";
import { applyBlockfallScenario, parseBlockfallScenario } from "../scenarios";

const ROUTE_FLAG = "A3D_QR_ROUTE_BLOCKFALL_REACTOR" as const;
const SIM_STEP = 1 / 60;

const target = document.getElementById("app") ?? document.body;
const routeParams = new URLSearchParams(window.location.search);
const scenario = parseBlockfallScenario(routeParams.get("scenario"));
const autorunRequested = routeParams.get("autorun") === "1" || scenario === "replay";
const sceneSwaps = 0;
const bootedAtMs = performance.now();
let frame = 0;
let firstFrameAt: number | null = null;
let lastPose: AuraCameraPose | null = null;

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

const audio = createBlockfallReactorAudio(reducedMotion);
const audioCueLog: string[] = [];
function pushCue(cue: BlockfallAudioCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue);
}
const unlockAudio = () => void audio.unlock();
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });


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

let state: BlockfallState = createInitialState(DEFAULT_SEED, createOpeningBoard());
let queuedActions: BlockfallAction[] = [];
let pendingBurst: BlockfallAction[] = [];
let simAccum = 0;
let replayActive = autorunRequested;
let replayIndex = 0;
const replayEvents: readonly BlockfallReplayEvent[] = DEMO_REPLAY_60S;
let touchEngaged = false;
let clearBeatTimer = 0;
const clearBeatDuration = 0.9;
let burstRowY = 0;
let lastClearSize = 0;
let linesClearedThisRound = 0;
let lastActivePoolKind: PieceKind | null = null;
const boardViewProof = { lastParityMatch: true, capacityRespected: true };
const beatTimers = { levelUp: 0, reset: 0, burst: 0 };
const beatDurations = { levelUp: 0.85, reset: 0.7, burst: 0.9 };

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

const input: GameInputController = engineGame.input({
  actions: {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    rotateCW: ["ArrowUp", "KeyW", "KeyX", "KeyE"],
    rotateCCW: ["KeyZ", "KeyQ"],
    softDrop: ["ArrowDown", "KeyS"],
    hardDrop: ["Space"],
    hold: ["KeyC", "ShiftLeft", "ShiftRight"],
    pause: ["Escape", "KeyP"],
    reset: ["KeyR"]
  },
  bufferMs: 120
});

// Manual DAS-repeat state (rules consume discrete moves per press/repeat).
const dasTimers = { left: 0, right: 0, soft: 0 };
function dasRepeat(timerKey: keyof typeof dasTimers, dt: number, pressed: boolean, held: boolean): boolean {
  const timers = dasTimers;
  if (pressed) { timers[timerKey] = 0.16; return true; }
  if (!held) { timers[timerKey] = 0; return false; }
  timers[timerKey] -= dt;
  if (timers[timerKey] <= 0) { timers[timerKey] = 0.055; return true; }
  return false;
}

// Touch zones: left-third tap = move left, right-third = move right, lower
// third = soft drop, swipe-down = hard drop, upper two-thirds centre tap =
// rotate, two-finger tap = hold. Pointer zones, not DOM buttons (touch:null stub).
const canvas = game.app.canvas;
if (canvas) {
  canvas.style.touchAction = "none";
  const zones = new Map<number, { x0: number; y0: number; role: "move" | "soft" | "hard" | "rotate" }>();
  canvas.addEventListener("pointerdown", (event) => {
    unlockAudio();
    touchEngaged = true;
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (ny > 0.72) zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "soft" });
    else if (nx < 0.42) zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "move" });
    else if (nx > 0.58) zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "move" });
    else zones.set(event.pointerId, { x0: event.clientX, y0: event.clientY, role: "rotate" });
    const zone = zones.get(event.pointerId);
    if (zone?.role === "move") {
      queuedActions.push({ type: "move", dx: nx < 0.42 ? -1 : 1 });
    } else if (zone?.role === "rotate") {
      queuedActions.push({ type: "rotate", direction: 1 });
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const zone = zones.get(event.pointerId);
    if (!zone) return;
    const dy = event.clientY - zone.y0;
    if (dy > 48 && zone.role !== "soft") {
      zone.role = "hard";
      queuedActions.push({ type: "hardDrop" });
    }
  });
  canvas.addEventListener("pointerup", (event) => zones.delete(event.pointerId));
  canvas.addEventListener("pointercancel", (event) => zones.delete(event.pointerId));
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.session.pause("visibility");
    if (!state.paused && !state.gameOver) queuedActions.push({ type: "pause" });
  } else {
    game.session.resume();
    if (state.paused) queuedActions.push({ type: "pause" });
  }
});

// ------------------------------------------------------------ state sync ----

function isDangerState(nextState: BlockfallState): boolean {
  return visibleLockedCells(nextState).some((cell) => cell.y <= 4);
}

let clearedRowsThisBeat: readonly number[] = [];

function stackHeight(s: BlockfallState): number {
  const cells = visibleLockedCells(s);
  if (cells.length === 0) return 0;
  const minY = Math.min(...cells.map((cell) => cell.y));
  return VISIBLE_HEIGHT - minY;
}

function syncInstancedPools(view: BoardViewModel): void {
  world.lockedPools.forEach((pool, poolIndex) => {
    const kind = ["I", "J", "L", "O", "S", "T", "Z"][poolIndex] as PieceKind;
    const cells = view.lockedByKind[kind];
    for (let index = 0; index < pool.transforms.length; index += 1) {
      const spec = pool.transforms[index];
      const cell = cells[index];
      if (!cell) {
        spec.position = [0, -50, 0];
        spec.scale = [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]];
        continue;
      }
      spec.position = [cell.position[0], cell.position[1], cell.position[2]];
      spec.scale = [BLOCK_SCALE[0], BLOCK_SCALE[1], BLOCK_SCALE[2]];
    }
  });
  const activeKind = state.active && !state.gameOver ? state.active.kind : null;
  const activeNode = handle("blockfall-active-instanced");
  if (activeKind && activeKind !== lastActivePoolKind) {
    lastActivePoolKind = activeKind;
    (activeNode as { setMaterial?(m: unknown): void } | null)?.setMaterial?.(pieceMaterials[activeKind]);
  }
  if (!activeKind) {
    lastActivePoolKind = null;
    activeNode?.setVisible(false);
  } else {
    activeNode?.setVisible(true);
  }
  for (let index = 0; index < world.activePool.transforms.length; index += 1) {
    const spec = world.activePool.transforms[index];
    const cell = view.active[index];
    if (!cell || !activeKind) {
      spec.position = [0, -50, 0];
      spec.scale = [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]];
      continue;
    }
    spec.position = [cell.position[0], cell.position[1], cell.position[2]];
    spec.scale = [ACTIVE_BLOCK_SCALE[0], ACTIVE_BLOCK_SCALE[1], ACTIVE_BLOCK_SCALE[2]];
  }
}

function syncGhostAndGuide(): void {
  const ghost = ghostPiece(state);
  const activeCells = state.active ? pieceCells(state.active) : [];
  const activeKey = activeCells.map((cell) => `${cell.x}:${cell.y}`).join("|");
  const ghostCells = ghost && !state.gameOver ? pieceCells(ghost) : [];
  const guide = handle(DROP_GUIDE_NODE_ID);
  if (ghostCells.map((cell) => `${cell.x}:${cell.y}`).join("|") === activeKey) {
    for (const id of ghostHandles) handle(id)?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    guide?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
  } else {
    ghostHandles.forEach((id, index) => {
      const cell = ghostCells[index];
      const visibleY = cell ? cell.y - HIDDEN_ROWS : -1;
      const node = handle(id);
      if (!cell || visibleY < 0 || visibleY >= VISIBLE_HEIGHT) {
        node?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
        return;
      }
      const position = cellPosition(cell.x, visibleY, 0.06);
      node?.setPosition(position[0], position[1], position[2]).setScale([...GHOST_BLOCK_SCALE]).setVisible(true);
    });
    // Slim beam between the active silhouette's bottom and the ghost's top.
    const activeVisible = activeCells
      .map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
      .filter((cell) => cell.visibleY >= 0 && cell.visibleY < VISIBLE_HEIGHT);
    const ghostVisible = ghostCells
      .map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
      .filter((cell) => cell.visibleY >= 0 && cell.visibleY < VISIBLE_HEIGHT);
    if (activeVisible.length === 0 || ghostVisible.length === 0 || !guide) return;
    const beamX = cellPosition(ghostVisible.reduce((sum, cell) => sum + cell.x, 0) / ghostVisible.length, 0, 0)[0];
    const activeY = Math.max(...activeVisible.map((cell) => cell.visibleY));
    const ghostY = Math.min(...ghostVisible.map((cell) => cell.visibleY));
    if (ghostY <= activeY) {
      guide.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
      return;
    }
    const activePositionY = cellPosition(0, activeY, 0)[1];
    const ghostPositionY = cellPosition(0, ghostY, 0)[1];
    const span = Math.max(0.08, activePositionY - ghostPositionY);
    guide
      .setPosition(beamX, ghostPositionY + span * 0.5, 0.075)
      .setScale([0.014, span * 0.5, 0.018])
      .setVisible(true);
  }
}

function syncActiveFocus(): void {
  const focus = handle(ACTIVE_FOCUS_NODE_ID);
  const piece = state.gameOver ? null : state.active;
  if (!piece || !focus) {
    focus?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    return;
  }
  const visible = pieceCells(piece)
    .map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
    .filter((cell) => cell.visibleY > 0 && cell.visibleY < VISIBLE_HEIGHT);
  if (visible.length === 0) {
    focus.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
    return;
  }
  const averageX = visible.reduce((sum, cell) => sum + cell.x, 0) / visible.length;
  const averageY = visible.reduce((sum, cell) => sum + cell.visibleY, 0) / visible.length;
  const position = cellPosition(averageX, averageY, 0.112);
  const pulse = 0.92 + Math.sin(state.frame * 0.16) * 0.08;
  focus
    .setPosition(position[0], position[1], position[2])
    .setScale([0.34 * pulse, 0.16 * pulse, 0.045])
    .setVisible(true);
}

function syncClearFlash(): void {
  // Timed renderer beat: the row stays lit for clearBeatDuration after the
  // observed clear so capture shots keep visible feedback.
  for (let row = 0; row < VISIBLE_HEIGHT; row += 1) {
    const node = handle(clearFlashIds[row]);
    if (clearBeatTimer <= 0 || !clearedRowsThisBeat.includes(row)) {
      node?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
      continue;
    }
    const position = cellPosition(0, row, 0.17);
    const width = CELL_BOARD_WIDTH_HALF;
    node
      ?.setPosition(position[0], position[1], position[2])
      .setScale([width, 0.085, 0.02])
      .setVisible(true);
  }
}
const CELL_BOARD_WIDTH_HALF = 1.39; // half of 10 × CELL(0.278)

function syncBeats(dt: number): void {
  beatTimers.levelUp = Math.max(0, beatTimers.levelUp - dt);
  beatTimers.reset = Math.max(0, beatTimers.reset - dt);
  beatTimers.burst = Math.max(0, beatTimers.burst - dt);
  clearBeatTimer = Math.max(0, clearBeatTimer - dt);

  const levelUpNode = handle(BEAT_NODE_IDS.levelUp);
  const levelUpProgress = beatTimers.levelUp / beatDurations.levelUp;
  if (levelUpProgress > 0) {
    levelUpNode?.setPosition(1.52, 2.66, 0.24).setScale([0.1 + levelUpProgress * 0.05, 0.035, 0.035]).setVisible(true);
  } else {
    levelUpNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
  }

  const gameOverNode = handle(BEAT_NODE_IDS.gameOver);
  if (isDangerState(state) || state.gameOver) {
    gameOverNode
      ?.setPosition(-1.52, 2, 0.2)
      .setScale(state.gameOver ? [0.085, 1.56, 0.055] : [0.045, 1.2, 0.045])
      .setVisible(true);
  } else {
    gameOverNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
  }

  const resetNode = handle(BEAT_NODE_IDS.reset);
  const resetProgress = beatTimers.reset / beatDurations.reset;
  if (resetProgress > 0) {
    resetNode?.setPosition(1.52, 1.34, 0.24).setScale([0.1 + resetProgress * 0.05, 0.035, 0.035]).setVisible(true);
  } else {
    resetNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
  }

  const waveNode = handle(CLEAR_WAVE_NODE_ID);
  const burstProgress = beatTimers.burst / beatDurations.burst;
  if (burstProgress > 0) {
    const waveProgress = 1 - burstProgress;
    const waveWidth = lastClearSize >= 4 ? 1.22 : 0.72;
    waveNode
      ?.setPosition(0, burstRowY, 0.232)
      .setScale([waveWidth + waveProgress * 1.52, 0.22 + waveProgress * 0.08, 0.038])
      .setVisible(true);
  } else {
    waveNode?.setScale([...HIDDEN_BLOCK_SCALE]).setVisible(false);
  }
}

function syncReactor(): void {
  const charge = Math.max(0.04, state.reactor / 100);
  const height = 0.18 + charge * 1.25;
  handle("blockfall-reactor-fill")
    ?.setScale([0.08, height, 0.08])
    .setPosition(1.52, 1.32 + height * 0.5, 0.2)
    .setVisible(true);
  const critical = state.gameOver || isDangerState(state) || state.reactor >= 88 || state.reactorLevel > 0;
  handle("blockfall-reactor-cap")
    ?.setScale(critical ? [0.12, 0.06, 0.055] : [...HIDDEN_BLOCK_SCALE])
    .setVisible(critical);
}

function syncScoreboard(): void {
  const scoreText = formatScoreDigits(state.score);
  for (let slot = 0; slot < 6; slot += 1) {
    const shown = Number(scoreText[slot]);
    for (let digit = 0; digit <= 9; digit += 1) {
      handle(scoreDigitNodeId(slot, digit))?.setVisible(digit === shown);
    }
  }
  const levelText = formatLevelDigits(state.level);
  for (let slot = 0; slot < 2; slot += 1) {
    const shown = Number(levelText[slot]);
    for (let digit = 0; digit <= 9; digit += 1) {
      handle(levelDigitNodeId(slot, digit))?.setVisible(digit === shown);
    }
  }
}

// Dirty-checked HUD: one write only when a value actually changes.
let lastHudKey = "";
function syncHud(): void {
  const hud = {
    score: state.score,
    lines: state.lines,
    level: state.level,
    reactor: state.reactor,
    hold: state.hold ?? "—",
    next: state.queue.slice(0, 3).join(" "),
    mode: state.gameOver ? "GAME OVER" : replayActive ? "REPLAY" : state.paused ? "PAUSED" : "RUNNING"
  };
  const key = JSON.stringify(hud);
  if (key === lastHudKey) return;
  lastHudKey = key;
  game.hud.set("score", String(hud.score));
  game.hud.set("lines", String(hud.lines));
  game.hud.set("level", String(hud.level));
  game.hud.set("reactor", `${hud.reactor}%`);
  game.hud.set("hold", String(hud.hold));
  game.hud.set("next", hud.next);
  game.hud.set("mode", hud.mode);
}

// ---------------------------------------------------------- event wiring ----

function observeEvents(prev: BlockfallState, next: BlockfallState): void {
  // Locks: piecesPlaced increments through the real kit path.
  if (next.piecesPlaced > prev.piecesPlaced) {
    pushCue("lock");
    const cells = pieceCells(prev.active ?? next.active!);
    if (cells.length > 0) {
      const cx = cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length;
      const cy = cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length;
      const position = cellPosition(cx, Math.max(0, cy - HIDDEN_ROWS), 0);
      fx.lockFlash(position[0], position[1]);
    }
    if (next.lastMove === "hard-drop") {
      const active = next.active ?? prev.active;
      if (active) {
        const position = cellPosition(active.x + 0.5, 8, 0);
        fx.hardDropTrail(position[0], position[1] + 1.4, position[1]);
      }
    }
  }
  if (next.lastClearedLines > 0) {
    linesClearedThisRound += next.lastClearedLines;
    lastClearSize = next.lastClearedLines;
    const rows = next.lastClearedRows.map((row) => row - HIDDEN_ROWS).filter((row) => row >= 0 && row < VISIBLE_HEIGHT);
    clearedRowsThisBeat = rows;
    if (rows.length > 0) {
      const averageRow = rows.reduce((sum, row) => sum + row, 0) / rows.length;
      burstRowY = cellPosition(0, averageRow, 0)[1];
    }
    beatTimers.burst = beatDurations.burst;
    clearBeatTimer = clearBeatDuration;
    pushCue(next.lastClearedLines >= 4 ? "quad" : "line-clear");
    clearFx.burst(rows, next.lastClearedLines);
    fx.clearBurst(burstRowY, next.lastClearedLines);
    if (next.lastClearedLines >= 4) cameraFeel.punch(1.6, "quad");
  }
  if (!prev.gameOver && next.gameOver) {
    pushCue("game-over");
    fx.gameOverAccent();
  }
  if (next.level > prev.level) {
    beatTimers.levelUp = beatDurations.levelUp;
    pushCue("level-up");
    audio.applyMusicLevel(next.level);
    fx.levelUpFlare();
    cameraFeel.punch(1.1, "level-up");
    linesClearedThisRound = 0;
  }
  if (next.lastMove === "reset" && prev.frame !== next.frame) {
    beatTimers.reset = beatDurations.reset;
    linesClearedThisRound = 0;
  }
}

function collectInputActions(dt: number): void {
  if (input.pressed("reset")) queuedActions.push({ type: "reset", seed: DEFAULT_SEED });
  else if (input.pressed("pause")) queuedActions.push({ type: "pause" });
  else {
    if (input.pressed("hold")) queuedActions.push({ type: "hold" });
    if (dasRepeat("left", dt, input.pressed("left"), input.held("left"))) queuedActions.push({ type: "move", dx: -1 });
    if (dasRepeat("right", dt, input.pressed("right"), input.held("right"))) queuedActions.push({ type: "move", dx: 1 });
    if (input.pressed("rotateCW")) queuedActions.push({ type: "rotate", direction: 1 });
    if (input.pressed("rotateCCW")) queuedActions.push({ type: "rotate", direction: -1 });
    if (dasRepeat("soft", dt, input.pressed("softDrop"), input.held("softDrop"))) queuedActions.push({ type: "softDrop" });
    if (input.pressed("hardDrop")) queuedActions.push({ type: "hardDrop" });
  }
}

// ------------------------------------------------------------- update -------

function updateGameplay(dt: number): void {
  frame += 1;
  input.update(dt);
  if (game.session.paused) {
    queuedActions = [];
    return;
  }
  collectInputActions(dt);

  // Scenario action bursts spread across consecutive frames (real path: they
  // queue into the same per-frame action array the keyboard uses).
  if (pendingBurst.length > 0) {
    queuedActions.push(...pendingBurst.splice(0, 3));
  }

  simAccum += dt;
  let simAdvanced = false;
  while (simAccum >= SIM_STEP) {
    simAccum -= SIM_STEP;
    simAdvanced = true;
    if (replayActive) {
      while (replayIndex < replayEvents.length && replayEvents[replayIndex].frame <= state.frame) {
        queuedActions.push(replayEvents[replayIndex].action);
        replayIndex += 1;
      }
      if (state.gameOver || replayIndex >= replayEvents.length && state.frame > replayEvents[replayEvents.length - 1].frame + 240) {
        replayActive = false;
        replayIndex = 0;
        queuedActions.push({ type: "reset", seed: DEFAULT_SEED });
      }
    }
    const prev = state;
    state = advanceFrame(state, queuedActions);
    queuedActions = [];
    observeEvents(prev, state);
  }
  if (!simAdvanced) return;

  const view = createBoardViewModel(state);
  boardViewProof.lastParityMatch = boardViewMatchesState(view, state);
  boardViewProof.capacityRespected = boardViewProof.capacityRespected
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
  if (firstFrameAt === null) firstFrameAt = performance.now();
});

game.start();
let rigForEvidence: ReturnType<typeof createBlockfallRig> | null = null;
void game.ready().then(() => {
  const rig = createBlockfallRig();
  rigForEvidence = rig;
  const origUpdate = rig.update.bind(rig);
  (rig as { update(ctx: { dt: number }): AuraCameraPose }).update = (ctx) => {
    rig.rigState.punch = cameraFeel.proof().punchActive ? 1 : 0;
    const pose = origUpdate(ctx);
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
    lastPose = poseOut;
    return poseOut;
  };
  game.app.camera?.use?.(rig as never, { blend: 0.12 });
    game.app.setOutput?.({ preset: "neon-night",  exposure: Math.pow(2, direction.lighting.exposureEV) });
  firstFrameAt = performance.now();
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});

publishBlockfallEvidence({
  gameplay: () => ({
    paused: state.paused,
    gameOver: state.gameOver,
    replayActive,
    touchEngaged,
    lastMove: state.lastMove,
    replayIndex,
    replayTotal: replayEvents.length
  }),
  board: () => ({
    lines: state.lines,
    linesClearedThisRound,
    stackHeight: stackHeight(state),
    score: state.score,
    level: state.level,
    combo: state.combo,
    backToBack: state.backToBack,
    reactor: state.reactor,
    piecesPlaced: state.piecesPlaced,
    lockedCells: visibleLockedCells(state).length,
    activeKind: state.active?.kind ?? null,
    hold: state.hold,
    queue: state.queue.slice(0, 3)
  }),
  boardView: () => ({
    ...boardViewProof,
    lockedGroups: world.lockedPools.length,
    lockedSubPools: world.lockedPools.length,
    perCellNodesDeleted: true as const
  }),
  fx: () => ({ liveCount: game.fx.liveCount, backend: game.fx.backend }),
  clearFx: () => clearFx.proof(),
  cameraFeel: () => cameraFeel.proof(),
  audio: () => audio.proof(),
  render: () => ({ frame, bootedAtMs, firstFrameAt }),
  loading: () => ({ sceneSwaps, lazyLoadedCount: 0 }),
  physics: () => ({ backend: "rapier", bodyCount: 0, sensorCount: 0 }),
  // T2.2-post: appliedLook derives from the C-31 runtime manifest.
  appliedLook: { ...lookManifest(game.lookSource()), preset: "neon-night" },
  rig: () => ({ id: "blockfall-reactor.static", driftDeg: 1.5, punch: rigForEvidence?.rigState.punch ?? 0 }),
  scenario: () => scenario
});

if (scenario) {
  applyBlockfallScenario(scenario, {
    queue: (actions) => { pendingBurst.push(...actions); },
    startReplay: () => { replayActive = true; replayIndex = 0; },
    seedBoard: (board) => {
      state = createInitialState(DEFAULT_SEED, board);
    }
  });
}
