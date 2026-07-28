import {
  camera,
  createGameApp,
  effects,
  game,
  lights,
  material,
  primitives,
  scene,
  ui,
  type AuraMaterialSpec,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle,
  type GameFallingBlockAction,
  type GameFallingBlocksEvent,
  type GameFallingBlocksSnapshot
} from "@aura3d/engine";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_SEED,
  DEMO_REPLAY,
  HIDDEN_ROWS,
  PIECE_KINDS,
  VISIBLE_HEIGHT,
  gravityFrames,
  ghostPiece,
  pieceCells,
  visibleLockedCells,
  type ActivePiece,
  type BlockfallAction,
  type BlockfallState,
  type CellPoint,
  type PieceKind
} from "./rules";
import { createShowcaseCannonPhysicsProof } from "../../showcase-cannon-physics-proof";
import "./styles.css";

type BlockfallWindow = Window & {
  __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: unknown;
};

const blockfallWindow = window as BlockfallWindow;
const reducedMotion = mediaMatches("(prefers-reduced-motion: reduce)");
const highContrast = mediaMatches("(prefers-contrast: more)");
const reducedFlash = reducedMotion;
const compactViewport = window.innerWidth <= 620;

const CELL = 0.208;
const BLOCK_SCALE = [0.138, 0.138, 0.12] as const;
const HIDDEN_BLOCK_SCALE = [0.001, 0.001, 0.001] as const;
const ACTIVE_BLOCK_SCALE = [0.158, 0.158, 0.13] as const;
const GHOST_BLOCK_SCALE = [0.112, 0.112, 0.035] as const;
const CLEAR_FLASH_SCALE = [1.03, 0.036, 0.016] as const;
const BOARD_CENTER_Y = 2.24;
const BOARD_LEFT_X = -((BOARD_WIDTH - 1) * CELL) / 2;
const BOARD_BOTTOM_Y = BOARD_CENTER_Y - ((VISIBLE_HEIGHT - 1) * CELL) / 2;
const REPLAY_FRAME_COUNT = Math.max(240, ...DEMO_REPLAY.map((event) => event.frame + 20));

const pieceMaterials: Record<PieceKind, AuraMaterialSpec> = {
  I: material.neon({ name: "ion cyan tetromino", color: "#1fc7d4", emissive: "#39f6ff", emissiveIntensity: 0.9, roughness: 0.24 }),
  J: material.neon({ name: "cobalt J tetromino", color: "#3558ff", emissive: "#5c7dff", emissiveIntensity: 0.62, roughness: 0.28 }),
  L: material.neon({ name: "amber L tetromino", color: "#f49a2d", emissive: "#ffc04f", emissiveIntensity: 0.68, roughness: 0.32 }),
  O: material.neon({ name: "solar O tetromino", color: "#f2d94e", emissive: "#ffe866", emissiveIntensity: 0.7, roughness: 0.3 }),
  S: material.neon({ name: "reactor green S tetromino", color: "#42d96b", emissive: "#65ff88", emissiveIntensity: 0.72, roughness: 0.3 }),
  T: material.neon({ name: "magenta T tetromino", color: "#c858e9", emissive: "#e279ff", emissiveIntensity: 0.72, roughness: 0.25 }),
  Z: material.neon({ name: "warning red Z tetromino", color: "#ef4f5d", emissive: "#ff6c78", emissiveIntensity: 0.7, roughness: 0.3 })
};

const panelMaterial = material.emissive({ name: "readable graphite board backplate", color: "#17312e", emissive: "#255651", emissiveIntensity: 0.48, roughness: 0.68 });
const railMaterial = material.metal({ name: "brushed safety rail", color: "#a9b49d", roughness: 0.36, metallic: 0.62 });
const gridMaterial = material.emissive({ name: "readable board grid", color: "#5f7770", emissive: "#8fb5a9", emissiveIntensity: 0.22, roughness: 0.72 });
const ghostMaterial = material.glass({ name: "transparent ghost landing piece", color: "#dbe7d9", opacity: 0.26, transmission: 0.45, roughness: 0.12 });
const flashMaterial = material.emissive({ name: "line clear flash", color: "#fff4b8", emissive: "#fff4b8", emissiveIntensity: 1.8 });
const reactorMaterial = material.neon({ name: "reactor charge column", color: "#6dee8d", emissive: "#77ff96", emissiveIntensity: 1.1, roughness: 0.18 });
const reactorCapMaterial = material.neon({ name: "reactor critical cap", color: "#ffb35a", emissive: "#ffd05d", emissiveIntensity: 0.9, roughness: 0.2 });

ui.html(
  "#hud",
  `
    <main class="overlay-shell" aria-label="Blockfall Reactor game interface">
      <section class="hud-panel hud-panel--status" aria-label="Run status">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">Aura3D Showcase</p>
            <h1>Blockfall Reactor</h1>
          </div>
        </div>
        <div class="status-strip">
          <span id="status-mode">Running</span>
          <span id="status-speed">48f gravity</span>
        </div>
        <div class="controls-strip" aria-label="Keyboard controls">
          <span>Move <b>A/D</b> or <b>&larr;/&rarr;</b></span>
          <span>Rotate <b>Q/Z</b> and <b>W/E/&uarr;</b></span>
          <span>Drop <b>Space</b></span>
          <span>Hold <b>C</b></span>
        </div>
      </section>

      <section class="hud-panel hud-panel--score" aria-label="Score and reactor state">
        <div class="stat-grid">
          <article><span>Score</span><strong id="stat-score">0</strong></article>
          <article><span>Lines</span><strong id="stat-lines">0</strong></article>
          <article><span>Level</span><strong id="stat-level">1</strong></article>
          <article><span>Combo</span><strong id="stat-combo">0</strong></article>
        </div>
        <div class="reactor-meter" id="reactor-meter" aria-label="Reactor charge">
          <span id="reactor-fill"></span>
        </div>
        <div class="reactor-meta">
          <span id="stat-reactor">0%</span>
          <span id="stat-b2b">B2B off</span>
        </div>
      </section>

      <section class="hud-panel hud-panel--preview" aria-label="Hold and next queue">
        <article class="piece-bay">
          <span>Hold</span>
          <div id="hold-piece" class="mini-piece" aria-label="Held piece"></div>
        </article>
        <article class="piece-bay piece-bay--next">
          <span>Next</span>
          <div id="next-queue" class="next-queue" aria-label="Next piece queue"></div>
        </article>
      </section>

      <section id="hud-actions" class="hud-panel hud-panel--actions" aria-label="Game actions">
        <button id="move-left-button" type="button">Left</button>
        <button id="move-right-button" type="button">Right</button>
        <button id="rotate-left-button" type="button">Rot L</button>
        <button id="rotate-right-button" type="button">Rot R</button>
        <button id="soft-drop-button" type="button">Soft</button>
        <button id="hard-drop-button" type="button">Drop</button>
        <button id="hold-button" type="button">Hold</button>
        <button id="pause-button" type="button">Pause</button>
        <button id="reset-button" type="button">Reset</button>
        <button id="replay-button" type="button">Replay</button>
      </section>

      <section class="hud-panel hud-panel--evidence" aria-label="Route evidence">
        <span>Checksum <code id="state-checksum">booting</code></span>
        <span>Replay <code id="replay-checksum">pending</code></span>
      </section>
    </main>
  `
);

ui.html(
  "#touch-controls",
  `
    <div class="touch-cluster touch-cluster--left" aria-label="Movement controls">
      <button type="button" data-touch-action="left">Left</button>
      <button type="button" data-touch-action="right">Right</button>
      <button type="button" data-touch-action="soft">Soft</button>
    </div>
    <div class="touch-cluster touch-cluster--right" aria-label="Piece controls">
      <button type="button" data-touch-action="rotate-left">Rot L</button>
      <button type="button" data-touch-action="rotate-right">Rot R</button>
      <button type="button" data-touch-action="hold">Hold</button>
      <button type="button" data-touch-action="drop">Drop</button>
    </div>
  `
);

const hudScore = ui.text("#stat-score");
const hudLines = ui.text("#stat-lines");
const hudLevel = ui.text("#stat-level");
const hudCombo = ui.text("#stat-combo");
const hudReactor = ui.text("#stat-reactor");
const hudBackToBack = ui.text("#stat-b2b");
const hudMode = ui.text("#status-mode");
const hudSpeed = ui.text("#status-speed");
const hudChecksum = ui.text("#state-checksum");
const hudReplayChecksum = ui.text("#replay-checksum");
const reactorFill = ui.text("#reactor-fill");
const holdPiece = ui.text("#hold-piece");
const nextQueue = ui.text("#next-queue");
const moveLeftButton = ui.button("#move-left-button");
const moveRightButton = ui.button("#move-right-button");
const rotateLeftButton = ui.button("#rotate-left-button");
const rotateRightButton = ui.button("#rotate-right-button");
const softDropButton = ui.button("#soft-drop-button");
const hardDropButton = ui.button("#hard-drop-button");
const holdButton = ui.button("#hold-button");
const pauseButton = ui.button("#pause-button");
const resetButton = ui.button("#reset-button");
const replayButton = ui.button("#replay-button");

const inputOptions = {
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
  bufferMs: 120,
  gamepad: false,
  touch: true
} as const;
type BlockfallInputName = keyof typeof inputOptions.actions;
const keyboardActionByCode = new Map<string, BlockfallInputName>(
  (Object.entries(inputOptions.actions) as Array<[BlockfallInputName, readonly string[]]>)
    .flatMap(([action, codes]) => codes.map((code) => [code, action] as const))
);

const hudBindings = game.hud.bindings([
  game.hud.meter({ id: "reactor-meter-binding", actorId: "reactor", label: "Reactor charge", valuePath: "reactor.charge", maxPath: "reactor.max", a11yLabel: "reactor charge" }),
  game.hud.combo({ id: "combo-binding", actorId: "player", label: "Combo", valuePath: "combo", a11yLabel: "combo count" }),
  game.hud.round({ id: "level-binding", label: "Level", valuePath: "level", a11yLabel: "level" }),
  game.hud.debugToggle({ id: "evidence-toggle-binding", label: "Evidence", action: "debug", statePath: "evidence.visible", a11yLabel: "evidence status" })
]);

const accessibilitySources = [
  game.accessibility.label({
    targetId: "hud",
    label: "Blockfall Reactor HUD with score, line clears, hold piece, queue, reactor charge, and checksum evidence.",
    live: true
  }),
  game.accessibility.focus({
    scopeId: "hud-actions",
    label: "Blockfall Reactor action buttons",
    targets: [
      "#move-left-button",
      "#move-right-button",
      "#rotate-left-button",
      "#rotate-right-button",
      "#soft-drop-button",
      "#hard-drop-button",
      "#hold-button",
      "#pause-button",
      "#reset-button",
      "#replay-button"
    ]
  }),
  game.accessibility.reducedMotion({ enabled: reducedMotion }),
  game.accessibility.reducedFlash({ enabled: reducedFlash }),
  game.accessibility.highContrast({ enabled: highContrast }),
  game.accessibility.pauseControls({
    actions: ["pause", "Escape"],
    resumeActions: ["pause", "Enter"],
    menuId: "hud-actions"
  })
];

const touchLayout = game.touchControls({
  width: window.innerWidth,
  height: window.innerHeight,
  buttons: [
    { id: "touch-left", action: "left", label: "Left", binding: "TouchLeft", side: "left" },
    { id: "touch-right", action: "right", label: "Right", binding: "TouchRight", side: "left" },
    { id: "touch-soft", action: "softDrop", label: "Soft", binding: "TouchSoftDrop", side: "left" },
    { id: "touch-rotate-left", action: "rotateCCW", label: "Rot L", binding: "TouchRotateLeft", side: "right" },
    { id: "touch-rotate-right", action: "rotateCW", label: "Rot R", binding: "TouchRotateRight", side: "right" },
    { id: "touch-hold", action: "hold", label: "Hold", binding: "TouchHold", side: "right" },
    { id: "touch-hard", action: "hardDrop", label: "Drop", binding: "TouchHardDrop", side: "right" }
  ]
});

const replayEvidence = createPublicReplayEvidence();
const lineClearProof = createPublicLineClearProof();
const fallingBlocksKitContractProof = createFallingBlocksKitContractProof();
const physicsProof = createShowcaseCannonPhysicsProof("blockfall-reactor");
const sourceEvidence = {
  kind: "aura3d-showcase-blockfall-reactor-source" as const,
  route: window.location.pathname,
  appId: "showcase-blockfall-reactor",
  claimBoundary: "procedural Aura3D falling-block board with public game.fallingBlocks gameplay state, a route-selected cannon-es fidelity proof, and retained gameplay proof.",
  publicEngineApi: ["createGameApp", "scene", "primitives", "material", "lights", "effects", "camera", "game.input", "game.collisionWorld", "game.runtimeNode", "game.hud", "game.accessibility", "ui"],
  prohibitedApiAvoided: {
    importsThree: false,
    rawGlbUrls: false,
    stringAssetIds: false
  },
  assets: {
    proceduralOnly: true,
    typedAssetCount: 0,
    typedRefs: []
  },
  rules: {
    deterministicModule: "game.fallingBlocks",
    board: `${BOARD_WIDTH}x${BOARD_HEIGHT}`,
    visibleRows: VISIBLE_HEIGHT,
    hiddenRows: HIDDEN_ROWS,
    pieces: PIECE_KINDS,
    features: ["seven-bag queue", "rotation with wall kicks", "soft drop", "hard drop", "hold", "line clears", "combo", "back-to-back", "reactor meter derived from public kit events", "speed escalation"]
  },
  controls: {
    keyboard: {
      move: ["ArrowLeft", "ArrowRight", "A", "D"],
      rotateClockwise: ["ArrowUp", "W", "X", "E"],
      rotateCounterClockwise: ["Z", "Q"],
      softDrop: ["ArrowDown", "S"],
      hardDrop: ["Space"],
      hold: ["C", "Shift"],
      pause: ["Escape", "P"],
      reset: ["R"]
    },
    touch: touchLayout
  },
  replay: replayEvidence,
  kitContractProof: fallingBlocksKitContractProof,
  startState: {
    source: "clean playable board",
    lockedCells: 0,
    replayStartsOnlyFromButton: true
  },
  lineClearProof
};

const reactorScene = scene()
  .background("#040608")
  .addMany(createBoardShell())
  .addMany(createLockedBlockNodes())
  .addMany(createActiveBlockNodes())
  .addMany(createGhostNodes())
  .addMany(createClearFlashNodes())
  .addMany(createReactorNodes())
  .addMany([
    effects.neonBloom({ intensity: reducedFlash ? 0.06 : 0.1 }),
    effects.ambientOcclusion({ intensity: 0.28 }),
    effects.fog({ name: "arcade reactor depth haze", density: 0, color: "#040608", intensity: 0 }),
    lights.ambient({ name: "low control room wash", color: "#f3f0de", intensity: 0.32 }),
    lights.directional({ name: "overhead white key", color: "#fff5dd", intensity: 1.22 }).position(0, 6, 5),
    lights.point({ name: "reactor green bounce", color: "#74ff91", intensity: reducedFlash ? 0.55 : 1.05 }).position(2.5, 2.2, 2.7),
    lights.point({ name: "warning amber rim", color: "#ffc15b", intensity: 0.68 }).position(-2.6, 3.4, 2.2),
    lights.point({ name: "magenta arcade spill", color: "#f04cff", intensity: 0.08 }).position(0, 3.2, 2.1)
  ])
  .camera(camera.perspective({ position: [0, 2.46, compactViewport ? 8.2 : 7.7], target: [0, 2.02, -0.03], fov: compactViewport ? 45 : 40 }));

const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  input: inputOptions,
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: reactorScene
});

const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Blockfall Reactor failed to create Aura3D input.");

const lockedHandles = new Map<string, AuraRuntimeNodeHandle>();
const activeHandles = Array.from({ length: 4 }, (_, index) => app.nodes.require(activeNodeId(index)) as AuraRuntimeNodeHandle);
const ghostHandles = Array.from({ length: 4 }, (_, index) => app.nodes.require(ghostNodeId(index)) as AuraRuntimeNodeHandle);
const clearFlashHandles = Array.from({ length: VISIBLE_HEIGHT }, (_, row) => app.nodes.require(clearFlashNodeId(row)) as AuraRuntimeNodeHandle);
const reactorFillNode = app.nodes.require("blockfall-reactor-fill") as AuraRuntimeNodeHandle;
const reactorCapNode = app.nodes.require("blockfall-reactor-cap") as AuraRuntimeNodeHandle;

for (let y = 0; y < VISIBLE_HEIGHT; y += 1) {
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    lockedHandles.set(lockedNodeKey(x, y), app.nodes.require(lockedNodeId(x, y)) as AuraRuntimeNodeHandle);
  }
}

const fallingBlocks = game.fallingBlocks({
  seed: DEFAULT_SEED,
  width: BOARD_WIDTH,
  height: BOARD_HEIGHT,
  hiddenRows: HIDDEN_ROWS
});
fallingBlocks.setActive({ kind: "T", x: Math.floor(BOARD_WIDTH / 2) - 2, y: HIDDEN_ROWS + 3, rotation: 0 });
let paused = false;
let placedPieces = 0;
let lockCount = 0;
let lastFallingEvents: readonly GameFallingBlocksEvent[] = fallingBlocks.snapshot().events;
let state = createBlockfallView(fallingBlocks.snapshot(), "spawn", lastFallingEvents);
let lastVisualChecksum = "";
let queuedActions: BlockfallAction[] = [];
let replayPlayback: { active: boolean; frame: number } = { active: false, frame: 0 };
const repeat = {
  left: createRepeatGate(0.15, 0.055),
  right: createRepeatGate(0.15, 0.055),
  soft: createRepeatGate(0.025, 0.025)
};
const manualInputState = {
  pressed: new Set<BlockfallInputName>(),
  held: new Set<BlockfallInputName>()
};

installDomControls();
syncAll(true);

gameApp.onFrame(({ dt }) => {
  input.update(dt);

  if (replayPlayback.active) {
    replayPlayback = { ...replayPlayback, frame: replayPlayback.frame + 1 };
    const replayActions = DEMO_REPLAY.filter((event) => event.frame === replayPlayback.frame).map((event) => event.action);
    state = advanceFallingBlocks(replayActions);
    if (replayPlayback.frame >= REPLAY_FRAME_COUNT || state.gameOver) replayPlayback = { active: false, frame: 0 };
  } else {
    const actions = [...queuedActions, ...collectInputActions(dt)];
    queuedActions = [];
    state = advanceFallingBlocks(actions);
  }

  syncAll(false);
});

function collectInputActions(dt: number): BlockfallAction[] {
  const pressed = (action: BlockfallInputName) => input.pressed(action) || manualInputState.pressed.has(action);
  const held = (action: BlockfallInputName) => input.held(action) || manualInputState.held.has(action);

  const actions: BlockfallAction[] = [];
  if (pressed("reset")) {
    actions.push({ type: "reset", seed: DEFAULT_SEED });
  } else if (pressed("pause")) {
    actions.push({ type: "pause" });
  } else {
    if (pressed("hold")) actions.push({ type: "hold" });
    if (repeat.left.update(dt, pressed("left"), held("left"))) actions.push({ type: "move", dx: -1 });
    if (repeat.right.update(dt, pressed("right"), held("right"))) actions.push({ type: "move", dx: 1 });
    if (pressed("rotateCW")) actions.push({ type: "rotate", direction: 1 });
    if (pressed("rotateCCW")) actions.push({ type: "rotate", direction: -1 });
    if (repeat.soft.update(dt, pressed("softDrop"), held("softDrop"))) actions.push({ type: "softDrop" });
    if (pressed("hardDrop")) actions.push({ type: "hardDrop" });
  }
  manualInputState.pressed.clear();
  return actions;
}

function advanceFallingBlocks(actions: readonly BlockfallAction[] = []): BlockfallState {
  let lastMove = "frame";
  let resetApplied = false;

  for (const action of actions) {
    if (action.type === "pause") {
      paused = !paused;
      lastMove = paused ? "pause" : "resume";
      continue;
    }
    if (action.type === "reset") {
      paused = false;
      placedPieces = 0;
      lockCount = 0;
      const resetSnapshot = fallingBlocks.reset(action.seed ?? DEFAULT_SEED);
      lastFallingEvents = resetSnapshot.events;
      lastMove = "reset";
      resetApplied = true;
      continue;
    }
    if (paused || state.gameOver) continue;
    const fallingAction = toFallingBlockAction(action);
    const nextSnapshot = fallingBlocks.step(fallingAction);
    lastFallingEvents = nextSnapshot.events;
    lastMove = formatBlockfallAction(action);
    countFallingBlockEvents(lastFallingEvents);
  }

  if (!resetApplied && !paused && !fallingBlocks.snapshot().gameOver) {
    const tickSnapshot = fallingBlocks.tick();
    lastFallingEvents = tickSnapshot.events;
    if (tickSnapshot.events.length > 0) {
      lastMove = tickSnapshot.events.map((event) => event.type).join("+");
      countFallingBlockEvents(lastFallingEvents);
    }
  }

  return createBlockfallView(fallingBlocks.snapshot(), lastMove, lastFallingEvents);
}

function toFallingBlockAction(action: Exclude<BlockfallAction, { readonly type: "pause" } | { readonly type: "reset" }>): GameFallingBlockAction {
  if (action.type === "tick") return { type: "tick" };
  return action;
}

function countFallingBlockEvents(events: readonly GameFallingBlocksEvent[]): void {
  const locks = events.filter((event) => event.type === "lock").length;
  if (locks > 0) {
    lockCount += locks;
    placedPieces += locks;
  }
}

function createBlockfallView(snapshot: GameFallingBlocksSnapshot, lastMove: string, events: readonly GameFallingBlocksEvent[]): BlockfallState {
  const lineClear = events.find((event) => event.type === "line-clear");
  const combo = snapshot.combo < 0 ? -1 : snapshot.combo;
  const reactor = Math.min(100, Math.max(0, (snapshot.lines % 10) * 10 + Math.max(0, combo + 1) * 8 + (snapshot.backToBack ? 14 : 0)));
  return {
    seed: snapshot.seed,
    rng: snapshot.seed,
    board: snapshot.board as BlockfallState["board"],
    queue: snapshot.queue as readonly PieceKind[],
    active: snapshot.active as ActivePiece | null,
    hold: snapshot.hold as PieceKind | null,
    holdUsed: snapshot.holdUsed,
    score: snapshot.score,
    lines: snapshot.lines,
    level: snapshot.level,
    combo,
    backToBack: snapshot.backToBack,
    reactor,
    reactorLevel: Math.max(0, snapshot.level - 1),
    piecesPlaced: placedPieces,
    lockCount,
    frame: snapshot.frame,
    paused,
    gameOver: snapshot.gameOver,
    lastMove,
    lastClearedLines: lineClear?.lines ?? 0,
    lastClearedRows: []
  };
}

function summarizeBlockfallState(nextState: BlockfallState) {
  return {
    checksum: blockfallChecksum(nextState),
    score: nextState.score,
    lines: nextState.lines,
    level: nextState.level,
    combo: nextState.combo,
    backToBack: nextState.backToBack,
    reactor: nextState.reactor,
    reactorLevel: nextState.reactorLevel,
    piecesPlaced: nextState.piecesPlaced,
    active: nextState.active?.kind ?? null,
    hold: nextState.hold,
    next: nextState.queue.slice(0, 5),
    gameOver: nextState.gameOver,
    paused: nextState.paused
  };
}

function blockfallChecksum(nextState: BlockfallState): string {
  return hashString(JSON.stringify({
    seed: nextState.seed,
    board: nextState.board,
    active: nextState.active,
    hold: nextState.hold,
    queue: nextState.queue,
    score: nextState.score,
    lines: nextState.lines,
    level: nextState.level,
    combo: nextState.combo,
    frame: nextState.frame,
    paused: nextState.paused,
    gameOver: nextState.gameOver
  }));
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function formatBlockfallAction(action: BlockfallAction): string {
  if (action.type === "move") return `move:${action.dx}`;
  if (action.type === "rotate") return `rotate:${action.direction}`;
  if (action.type === "softDrop") return "soft-drop";
  if (action.type === "hardDrop") return "hard-drop";
  if (action.type === "hold") return "hold";
  if (action.type === "tick") return "tick";
  if (action.type === "pause") return "pause";
  return "reset";
}

function syncAll(force: boolean): void {
  const checksum = blockfallChecksum(state);
  if (force || checksum !== lastVisualChecksum) {
    syncBoardVisuals();
    syncHud();
    lastVisualChecksum = checksum;
  }
  publishEvidence();
}

function syncBoardVisuals(): void {
  const visible = new Map<string, PieceKind>();
  for (const cell of visibleLockedCells(state)) visible.set(`${cell.x}:${cell.y}`, cell.kind);

  for (let y = 0; y < VISIBLE_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const kind = visible.get(`${x}:${y}`);
      const handle = lockedHandles.get(lockedNodeKey(x, y));
      if (!handle) continue;
      if (!kind) {
        handle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
        continue;
      }
      const position = cellPosition(x, y, 0.18);
      handle
        .setMaterial(pieceMaterials[kind])
        .setPosition(position[0], position[1], position[2])
        .setScale(BLOCK_SCALE)
        .setVisible(true);
    }
  }

  syncActivePiece(state.active);
  syncGhostPiece(ghostPiece(state));
  syncClearFlash();
  syncReactor();
}

function syncActivePiece(piece: ActivePiece | null): void {
  activeHandles.forEach((handle) => handle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false));
  if (!piece) return;
  const cells = pieceCells(piece);
  cells.forEach((cell, index) => {
    const visibleY = cell.y - HIDDEN_ROWS;
    const handle = activeHandles[index];
    if (!handle || visibleY < 0 || visibleY >= VISIBLE_HEIGHT) {
      handle?.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
      return;
    }
    const position = cellPosition(cell.x, visibleY, 0.28);
    handle
      .setMaterial(pieceMaterials[piece.kind])
      .setPosition(position[0], position[1], position[2])
      .setScale(ACTIVE_BLOCK_SCALE)
      .setVisible(true);
  });
}

function syncGhostPiece(piece: ActivePiece | null): void {
  ghostHandles.forEach((handle) => handle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false));
  if (!piece || state.gameOver) return;
  const activeCells = state.active ? pieceCells(state.active).map((cell) => `${cell.x}:${cell.y}`).join("|") : "";
  const ghostCells = pieceCells(piece);
  if (ghostCells.map((cell) => `${cell.x}:${cell.y}`).join("|") === activeCells) return;
  ghostCells.forEach((cell, index) => {
    const visibleY = cell.y - HIDDEN_ROWS;
    if (visibleY < 0 || visibleY >= VISIBLE_HEIGHT) return;
    const position = cellPosition(cell.x, visibleY, 0.06);
    ghostHandles[index]
      .setPosition(position[0], position[1], position[2])
      .setScale(GHOST_BLOCK_SCALE)
      .setVisible(true);
  });
}

function syncClearFlash(): void {
  const clearRows = new Set(state.lastClearedRows.map((row) => row - HIDDEN_ROWS).filter((row) => row >= 0 && row < VISIBLE_HEIGHT));
  for (let row = 0; row < VISIBLE_HEIGHT; row += 1) {
    clearFlashHandles[row].setScale(clearRows.has(row) ? CLEAR_FLASH_SCALE : HIDDEN_BLOCK_SCALE).setVisible(clearRows.has(row));
  }
}

function syncReactor(): void {
  const charge = Math.max(0.04, state.reactor / 100);
  const height = 0.18 + charge * 1.25;
  reactorFillNode.setScale([0.08, height, 0.08]).setPosition(1.78, 1.32 + height * 0.5, 0.2).setVisible(true);
  reactorCapNode
    .setScale(state.reactor >= 88 || state.reactorLevel > 0 ? [0.16, 0.09, 0.16] : HIDDEN_BLOCK_SCALE)
    .setVisible(state.reactor >= 88 || state.reactorLevel > 0);
}

function syncHud(): void {
  const summary = summarizeBlockfallState(state);
  ui.setText(hudScore, summary.score.toLocaleString("en-US"));
  ui.setText(hudLines, summary.lines);
  ui.setText(hudLevel, summary.level);
  ui.setText(hudCombo, summary.combo < 0 ? "0" : `${summary.combo + 1}x`);
  ui.setText(hudReactor, `${summary.reactor}%`);
  ui.setText(hudBackToBack, summary.backToBack ? "B2B armed" : "B2B off");
  ui.setText(hudMode, state.gameOver ? "Game over" : replayPlayback.active ? "Replay" : state.paused ? "Paused" : "Running");
  ui.setText(hudSpeed, `${gravityFrames(state)}f gravity`);
  ui.setText(hudChecksum, summary.checksum);
  ui.setText(hudReplayChecksum, replayEvidence.replayChecksum);
  reactorFill.style.width = `${summary.reactor}%`;
  pauseButton.textContent = state.paused ? "Resume" : "Pause";
  ui.setPressed(pauseButton, state.paused);
  holdPiece.innerHTML = renderMiniPiece(summary.hold);
  nextQueue.innerHTML = summary.next.map((kind) => `<div class="next-item">${renderMiniPiece(kind)}<b>${kind}</b></div>`).join("");
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.blockfallState = state.gameOver ? "game-over" : state.paused ? "paused" : "running";
}

function publishEvidence(): void {
  const summary = summarizeBlockfallState(state);
  const hudSnapshot = game.hud.snapshot({
    bindings: hudBindings,
    round: { index: state.level },
    runtime: { frame: state.frame, paused: state.paused },
    appState: {
      score: state.score,
      lines: state.lines,
      level: state.level,
      combo: state.combo,
      reactor: { charge: state.reactor, max: 100 },
      evidence: { visible: true }
    }
  });

  blockfallWindow.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__ = {
    ...sourceEvidence,
    status: state.gameOver || state.paused ? "ready" : "running",
    appId: "showcase-blockfall-reactor",
    frameCount: state.frame,
    systems: [
      "createGameApp fixed-step runtime",
      "game.input keyboard and touch mapping",
      "runtime node pools for locked, active, ghost, clear flash, and reactor meter blocks",
      "public game.fallingBlocks state machine",
      "hold piece and next queue",
      "line clear, combo, back-to-back, and speed escalation proof",
      "replay checksum evidence",
      "HUD and accessibility evidence"
    ],
    controls: [
      "ArrowLeft/ArrowRight or A/D move",
      "ArrowUp/W/X/E rotate clockwise",
      "Z/Q rotate counter-clockwise",
      "ArrowDown/S soft drop",
      "Space hard drop",
      "C or Shift hold",
      "Escape/P pause",
      "R reset",
      "Touch buttons for move, rotate left/right, hold, and drop"
    ],
    claimBoundary: sourceEvidence.claimBoundary,
    diagnostics: app.diagnostics(),
    current: summary,
    live: {
      frame: state.frame,
      checksum: summary.checksum,
      lastMove: state.lastMove,
      activeCells: state.active ? pieceCells(state.active) : [],
      visibleLockedCells: visibleLockedCells(state).length,
      replayPlayback
    },
    runtimeEvidence: app.evidence({
      input,
      collisionWorld: physicsProof.collisionWorld,
      hud: hudBindings,
      accessibility: accessibilitySources,
      stage: {
        id: "blockfall-reactor-well",
        safeZones: true,
        bounds: { width: BOARD_WIDTH, height: BOARD_HEIGHT, visibleHeight: VISIBLE_HEIGHT },
        warnings: []
      },
      assets: { typedAssets: 0, missingAssets: [] },
      source: {
        mode: "mounted-runtime",
        expectsGame: true,
        label: "Blockfall Reactor mounted Aura3D game route"
      },
      ownership: [
        { subsystem: "runtime-nodes", owner: "aura3d", configured: true, evidence: "Every visible block pool is registered with game.runtimeNode." },
        { subsystem: "frame-loop", owner: "aura3d", configured: true, evidence: "createGameApp owns the fixed-step frame loop." },
        { subsystem: "input", owner: "aura3d", configured: true, evidence: "Aura3D input edges feed the public game.fallingBlocks kit." },
        { subsystem: "hud", owner: "app", configured: true, evidence: "DOM HUD is bound through Aura3D ui and game.hud evidence." },
        { subsystem: "accessibility", owner: "app", configured: true, evidence: "Pause, focus, and motion preferences are declared through game.accessibility." }
      ]
    }),
    physics: physicsProof.evidence,
    hudSnapshot
  };
}

function createPublicReplayEvidence() {
  const runReplay = () => {
    const kit = game.fallingBlocks({ seed: DEFAULT_SEED, width: BOARD_WIDTH, height: BOARD_HEIGHT, hiddenRows: HIDDEN_ROWS });
    const timeline: { readonly frame: number; readonly checksum: string; readonly action: string }[] = [];
    for (let frame = 1; frame <= REPLAY_FRAME_COUNT; frame += 1) {
      const actions = DEMO_REPLAY.filter((event) => event.frame === frame).map((event) => event.action);
      for (const action of actions) {
        if (action.type !== "pause") kit.step(toFallingBlockAction(action));
      }
      const snapshot = kit.tick();
      if (actions.length > 0 || frame === REPLAY_FRAME_COUNT) {
        timeline.push({
          frame,
          checksum: snapshot.checksum,
          action: actions.map(formatBlockfallAction).join(",") || "frame"
        });
      }
    }
    const final = kit.snapshot();
    return {
      seed: DEFAULT_SEED,
      frames: REPLAY_FRAME_COUNT,
      eventCount: DEMO_REPLAY.length,
      finalChecksum: final.checksum,
      finalSummary: {
        checksum: final.checksum,
        score: final.score,
        lines: final.lines,
        level: final.level,
        active: final.active?.kind ?? null,
        hold: final.hold,
        next: final.queue.slice(0, 5),
        gameOver: final.gameOver
      },
      timeline
    };
  };
  const first = runReplay();
  const second = runReplay();
  return {
    kind: "blockfall-public-kit-replay-evidence" as const,
    source: "game.fallingBlocks" as const,
    replayName: "opening-reactor-sequence",
    replayChecksum: hashString(first.timeline.map((entry) => `${entry.frame}:${entry.checksum}`).join("|")),
    deterministic: first.finalChecksum === second.finalChecksum,
    first,
    secondFinalChecksum: second.finalChecksum
  };
}

function createPublicLineClearProof() {
  const falling = game.fallingBlocks({ seed: 0xC1EA12, width: BOARD_WIDTH, height: BOARD_HEIGHT, hiddenRows: HIDDEN_ROWS });
  const board = Array.from({ length: BOARD_HEIGHT }, () => Array.from({ length: BOARD_WIDTH }, () => null as PieceKind | null));
  board[BOARD_HEIGHT - 1] = board[BOARD_HEIGHT - 1].map((_, x) => (x === 4 || x === 5 ? null : "Z"));
  const before = falling.setBoard(board);
  falling.setActive({ kind: "O", x: 3, y: 18, rotation: 0 });
  const after = falling.hardDrop();
  return {
    kind: "blockfall-public-kit-line-clear-proof" as const,
    source: "game.fallingBlocks" as const,
    passed: after.lines === 1 && after.score > 0 && after.events.some((event) => event.type === "line-clear"),
    beforeChecksum: before.checksum,
    afterChecksum: after.checksum,
    clearedLines: after.events.find((event) => event.type === "line-clear")?.lines ?? 0,
    reactor: Math.min(100, after.lines * 10),
    summary: {
      checksum: after.checksum,
      score: after.score,
      lines: after.lines,
      level: after.level,
      active: after.active?.kind ?? null,
      hold: after.hold,
      next: after.queue.slice(0, 5),
      gameOver: after.gameOver
    }
  };
}

function createFallingBlocksKitContractProof() {
  const falling = game.fallingBlocks({ seed: 7 });
  const start = falling.snapshot();
  const moved = falling.move(1);
  const rotated = falling.rotate(1);
  const held = falling.hold();

  const softProbe = game.fallingBlocks({ seed: 13 });
  const softBefore = softProbe.snapshot();
  const softAfter = softProbe.softDrop();

  const width = held.width;
  const height = held.height;
  const board = Array.from({ length: height }, () => Array.from({ length: width }, () => null as "O" | null));
  board[height - 1] = board[height - 1].map((_, x) => (x >= 3 && x <= 6 ? null : "O"));
  falling.setBoard(board);
  falling.setActive({ kind: "I", x: 3, y: height - 2, rotation: 0 });
  const cleared = falling.hardDrop();

  const firstReplay = game.fallingBlocks({ seed: 11 });
  const secondReplay = game.fallingBlocks({ seed: 11 });
  const sequence = [
    { type: "move", dx: 1 },
    { type: "rotate", direction: 1 },
    { type: "softDrop" },
    { type: "hardDrop" }
  ] as const;
  for (const action of sequence) {
    firstReplay.step(action);
    secondReplay.step(action);
  }

  return {
    kind: "aura-game-falling-blocks-kit-browser-contract" as const,
    source: "game.fallingBlocks" as const,
    moveChangesX: moved.active?.x === (start.active?.x ?? 0) + 1,
    rotateChangesRotation: rotated.active?.rotation !== moved.active?.rotation,
    holdStoresPiece: held.hold === rotated.active?.kind,
    softDropMovesDown: (softAfter.active?.y ?? 0) > (softBefore.active?.y ?? 0),
    hardDropLocksPiece: cleared.events.some((event) => event.type === "lock"),
    lineClear: cleared.lines === 1 && cleared.events.some((event) => event.type === "line-clear"),
    replayRecordsActions: firstReplay.replay().length === sequence.length,
    replayChecksumStable: firstReplay.checksum() === secondReplay.checksum(),
    checksum: firstReplay.checksum(),
    eventTypes: Array.from(new Set([
      ...moved.events.map((event) => event.type),
      ...rotated.events.map((event) => event.type),
      ...held.events.map((event) => event.type),
      ...softAfter.events.map((event) => event.type),
      ...cleared.events.map((event) => event.type)
    ])),
    linesAfterClear: cleared.lines,
    scoreAfterClear: cleared.score
  };
}

function installDomControls(): void {
  const focusGame = () => {
    try {
      document.body.focus({ preventScroll: true });
    } catch {
      document.body.focus();
    }
  };
  const queueManualAction = (action: BlockfallAction) => {
    replayPlayback = { active: false, frame: 0 };
    queuedActions.push(action);
    focusGame();
  };

  document.body.tabIndex = -1;
  document.querySelector<HTMLElement>("#app")?.setAttribute("tabindex", "-1");
  requestAnimationFrame(focusGame);
  window.addEventListener("pointerdown", focusGame, { passive: true });

  ui.onClick(moveLeftButton, () => queueManualAction({ type: "move", dx: -1 }));
  ui.onClick(moveRightButton, () => queueManualAction({ type: "move", dx: 1 }));
  ui.onClick(rotateLeftButton, () => queueManualAction({ type: "rotate", direction: -1 }));
  ui.onClick(rotateRightButton, () => queueManualAction({ type: "rotate", direction: 1 }));
  ui.onClick(softDropButton, () => queueManualAction({ type: "softDrop" }));
  ui.onClick(hardDropButton, () => queueManualAction({ type: "hardDrop" }));
  ui.onClick(holdButton, () => queueManualAction({ type: "hold" }));
  ui.onClick(pauseButton, () => {
    queueManualAction({ type: "pause" });
  });
  ui.onClick(resetButton, () => {
    replayPlayback = { active: false, frame: 0 };
    queuedActions = [{ type: "reset", seed: DEFAULT_SEED }];
    focusGame();
  });
  ui.onClick(replayButton, () => startReplayPlayback());

  const touchActionMap: Record<string, BlockfallAction> = {
    left: { type: "move", dx: -1 },
    right: { type: "move", dx: 1 },
    soft: { type: "softDrop" },
    "rotate-left": { type: "rotate", direction: -1 },
    "rotate-right": { type: "rotate", direction: 1 },
    hold: { type: "hold" },
    drop: { type: "hardDrop" }
  };

  document.querySelectorAll<HTMLButtonElement>("[data-touch-action]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const action = touchActionMap[button.dataset.touchAction ?? ""];
      if (action) queueManualAction(action);
    });
  });

  window.addEventListener("keydown", (event) => {
    const action = keyboardActionByCode.get(event.code);
    if (!action) return;
    event.preventDefault();
    focusGame();
    if (!event.repeat) manualInputState.pressed.add(action);
    manualInputState.held.add(action);
  }, { passive: false });
  window.addEventListener("keyup", (event) => {
    const action = keyboardActionByCode.get(event.code);
    if (!action) return;
    event.preventDefault();
    manualInputState.held.delete(action);
  }, { passive: false });
}

function startReplayPlayback(): void {
  paused = false;
  placedPieces = 0;
  lockCount = 0;
  const resetSnapshot = fallingBlocks.reset(DEFAULT_SEED);
  lastFallingEvents = resetSnapshot.events;
  state = createBlockfallView(resetSnapshot, "replay-reset", lastFallingEvents);
  replayPlayback = { active: true, frame: 0 };
  queuedActions = [];
  syncAll(true);
}

function createBoardShell(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    primitives.box({ name: "blockfall neutral evidence backdrop", material: material.emissive({ color: "#040608", emissive: "#040608", emissiveIntensity: 1 }) })
      .position(0, 2.18, -1.32)
      .scale([12, 8, 0.025]),
    primitives.box({ name: "reactor board backplate", material: panelMaterial, receiveShadow: true }).position(0, BOARD_CENTER_Y, -0.035).scale([1.64, 4.42, 0.06]),
    primitives.box({ name: "arcade reactor recessed cabinet wall", material: material.emissive({ color: "#101712", emissive: "#286046", emissiveIntensity: 0.18 }) })
      .position(0, BOARD_CENTER_Y, -0.92)
      .scale([2.05, 4.3, 0.03]),
    primitives.torus({ name: "arcade reactor playfield halo", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.16, opacity: 0.12 }) })
      .position(0, BOARD_CENTER_Y - 2.02, -0.04)
      .rotate(1.5708, 0, 0)
      .scale([0.78, 0.15, 0.018]),
    primitives.box({ name: "blockfall reactor marquee beam", material: material.neon({ color: "#ffe866", emissive: "#ffe866", emissiveIntensity: 0.72 }) })
      .position(0, BOARD_CENTER_Y + 2.08, 0.11)
      .scale([1.46, 0.045, 0.045]),
    primitives.box({ name: "blockfall lower cabinet glow shelf", material: material.neon({ color: "#74ff91", emissive: "#74ff91", emissiveIntensity: 0.54 }) })
      .position(0, BOARD_CENTER_Y - 2.08, 0.11)
      .scale([1.46, 0.04, 0.045]),
    primitives.box({ name: "left load-bearing board rail", material: railMaterial, castShadow: true }).position(-1.24, BOARD_CENTER_Y, 0.08).scale([0.05, 4.22, 0.11]),
    primitives.box({ name: "right load-bearing board rail", material: railMaterial, castShadow: true }).position(1.24, BOARD_CENTER_Y, 0.08).scale([0.05, 4.22, 0.11]),
    primitives.box({ name: "top board rail", material: railMaterial, castShadow: true }).position(0, BOARD_CENTER_Y + 2.13, 0.08).scale([1.48, 0.052, 0.11]),
    primitives.box({ name: "bottom board rail", material: railMaterial, castShadow: true }).position(0, BOARD_CENTER_Y - 2.13, 0.08).scale([1.48, 0.052, 0.11]),
    primitives.box({ name: "reactor cabinet floor", material: material.emissive({ color: "#05080a", emissive: "#05080a", emissiveIntensity: 0.8 }), receiveShadow: true })
      .position(0, -0.12, -0.32)
      .scale([3.35, 0.045, 0.95]),
    primitives.box({ name: "left cyan arcade light column", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.6 }) })
      .position(-1.08, BOARD_CENTER_Y, 0.04)
      .scale([0.018, 2.06, 0.022]),
    primitives.box({ name: "right magenta arcade light column", material: material.neon({ color: "#e279ff", emissive: "#e279ff", emissiveIntensity: 0.56 }) })
      .position(1.08, BOARD_CENTER_Y, 0.04)
      .scale([0.018, 2.06, 0.022])
  ];

  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    const px = BOARD_LEFT_X - CELL / 2 + x * CELL;
    nodes.push(primitives.box({ name: `board vertical grid ${x}`, material: gridMaterial }).position(px, BOARD_CENTER_Y, 0.03).scale([0.008, VISIBLE_HEIGHT * CELL, 0.016]));
  }
  for (let y = 0; y <= VISIBLE_HEIGHT; y += 1) {
    const py = BOARD_BOTTOM_Y - CELL / 2 + y * CELL;
    nodes.push(primitives.box({ name: `board horizontal grid ${y}`, material: gridMaterial }).position(0, py, 0.03).scale([1.08, 0.008, 0.016]));
  }

  return nodes;
}

function createLockedBlockNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (let y = 0; y < VISIBLE_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const position = cellPosition(x, y, 0.18);
      nodes.push(
        primitives.box({
          name: `locked block cell ${x} ${y}`,
          material: pieceMaterials.I,
          castShadow: true,
          receiveShadow: true
        })
          .position(position[0], position[1], position[2])
          .scale(HIDDEN_BLOCK_SCALE)
          .runtime(game.runtimeNode(lockedNodeId(x, y), { tags: ["blockfall", "locked", "piece-material-runtime"] }))
      );
    }
  }
  return nodes;
}

function createActiveBlockNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (let index = 0; index < 4; index += 1) {
    nodes.push(
      primitives.box({
        name: `active block ${index}`,
        material: pieceMaterials.T,
        castShadow: true,
        receiveShadow: true
      })
        .position(0, 0, 0.28)
        .scale(HIDDEN_BLOCK_SCALE)
        .runtime(game.runtimeNode(activeNodeId(index), { tags: ["blockfall", "active", "piece-material-runtime"] }))
    );
  }
  return nodes;
}

function createGhostNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    primitives.box({
      name: `ghost landing block ${index}`,
      material: ghostMaterial
    })
      .position(0, 0, 0)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(ghostNodeId(index), { tags: ["blockfall", "ghost"] }))
  );
}

function createClearFlashNodes(): AuraNodeInput[] {
  return Array.from({ length: VISIBLE_HEIGHT }, (_, row) => {
    const position = cellPosition(Math.floor(BOARD_WIDTH / 2), row, 0.18);
    return primitives.box({ name: `line clear flash row ${row}`, material: flashMaterial })
      .position(0, position[1], position[2])
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(clearFlashNodeId(row), { tags: ["blockfall", "line-clear-flash"] }));
  });
}

function createReactorNodes(): AuraNodeInput[] {
  return [
    primitives.cylinder({ name: "reactor charge glass tube", material: material.glass({ color: "#e7f7e7", opacity: 0.34, transmission: 0.55, roughness: 0.08 }) })
      .position(1.52, 2.0, 0.16)
      .scale([0.095, 0.68, 0.095]),
    primitives.cylinder({ name: "reactor fill", material: reactorMaterial })
      .position(1.52, 1.42, 0.2)
      .scale([0.08, 0.18, 0.08])
      .runtime(game.runtimeNode("blockfall-reactor-fill", { tags: ["blockfall", "reactor", "meter"] })),
    primitives.sphere({ name: "reactor cap", material: reactorCapMaterial })
      .position(1.52, 3.1, 0.2)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode("blockfall-reactor-cap", { tags: ["blockfall", "reactor", "critical"] })),
    primitives.box({ name: "left hold dock glow", material: material.emissive({ color: "#8b7a55", emissive: "#d3a23c", emissiveIntensity: 0.22 }) }).position(-1.45, 3.2, 0.02).scale([0.13, 0.025, 0.018]),
    primitives.box({ name: "right queue dock glow", material: material.emissive({ color: "#55725a", emissive: "#69dd83", emissiveIntensity: 0.2 }) }).position(1.45, 1.04, 0.02).scale([0.13, 0.025, 0.018])
  ];
}

function cellPosition(x: number, visibleY: number, z: number): readonly [number, number, number] {
  return [
    BOARD_LEFT_X + x * CELL,
    BOARD_BOTTOM_Y + (VISIBLE_HEIGHT - 1 - visibleY) * CELL,
    z
  ];
}

function renderMiniPiece(kind: PieceKind | null): string {
  const occupied = new Set<CellPoint>();
  if (kind) {
    const normalized = normalizeMiniCells(pieceCells({ kind, x: 0, y: 0, rotation: 0 }));
    for (const cell of normalized) occupied.add(cell);
  }

  let markup = "";
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const filled = [...occupied].some((cell) => cell.x === x && cell.y === y);
      markup += `<span class="${filled && kind ? `is-filled piece-${kind}` : ""}"></span>`;
    }
  }
  return markup;
}

function normalizeMiniCells(cells: readonly CellPoint[]): readonly CellPoint[] {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY }));
}

function createRepeatGate(initialDelay: number, interval: number) {
  let timer = 0;
  return {
    update(dt: number, pressed: boolean, held: boolean): boolean {
      if (pressed) {
        timer = initialDelay;
        return true;
      }
      if (!held) {
        timer = 0;
        return false;
      }
      timer -= dt;
      if (timer <= 0) {
        timer = interval;
        return true;
      }
      return false;
    }
  };
}

function lockedNodeId(x: number, y: number): string {
  return `blockfall-locked-${x}-${y}`;
}

function activeNodeId(index: number): string {
  return `blockfall-active-${index}`;
}

function ghostNodeId(index: number): string {
  return `blockfall-ghost-${index}`;
}

function clearFlashNodeId(row: number): string {
  return `blockfall-clear-flash-${row}`;
}

function lockedNodeKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function mediaMatches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}
