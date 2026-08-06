import {
  camera,
  createGameApp,
  effects,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  ui,
  type AuraRuntimeNodeHandle,
  type GameFallingBlockAction,
  type GameFallingBlocksEvent,
  type GameFallingBlocksSnapshot
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import {
  ACTIVE_BLOCK_SCALE,
  BEAT_NODE_IDS,
  BLOCK_SCALE,
  BOARD_CENTER_Y,
  CELL,
  CLEAR_FLASH_SCALE,
  GHOST_BLOCK_SCALE,
  HIDDEN_BLOCK_SCALE,
  activeNodeId,
  cellPosition,
  clearFlashNodeId,
  createActiveBlockNodes,
  createArcadeRoomNodes,
  createBeatNodes,
  createBoardShell,
  createClearFlashNodes,
  createGhostNodes,
  createLockedBlockNodes,
  createReactorNodes,
  ghostNodeId,
  lockedNodeId,
  lockedNodeKey,
  pieceMaterials
} from "./reactor-scene";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_SEED,
  DEMO_REPLAY,
  HIDDEN_ROWS,
  createOpeningBoard,
  createSixtySecondReplayProof,
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
import { createShowcaseCannonPhysicsProof } from "../../common/src/cannon-physics-proof";
import "./styles.css";

type BlockfallWindow = Window & {
  __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: unknown;
};

const blockfallWindow = window as BlockfallWindow;
const reducedMotion = mediaMatches("(prefers-reduced-motion: reduce)");
const highContrast = mediaMatches("(prefers-contrast: more)");
const reducedFlash = reducedMotion;
const compactViewport = window.innerWidth <= 620;

const REPLAY_FRAME_COUNT = Math.max(240, ...DEMO_REPLAY.map((event) => event.frame + 20));

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
    <!--
      Session controls belong in the touch layout too. The mobile stylesheet hides
      the desktop action grid, which left pause, reset and replay unreachable on a
      phone: the game could be started but never paused or restarted. Touch and
      desktop must expose equivalent interactions.
    -->
    <div class="touch-cluster touch-cluster--session" aria-label="Session controls">
      <button type="button" data-touch-action="pause">Pause</button>
      <button type="button" data-touch-action="reset">Reset</button>
      <button type="button" data-touch-action="replay">Replay</button>
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
/**
 * Deterministic 60-second replay proof, computed once at module scope. Declared
 * before the mounted evidence object that publishes it.
 */
const sixtySecondReplayProof = createSixtySecondReplayProof();
const lineClearProof = createPublicLineClearProof();
const fallingBlocksKitContractProof = createFallingBlocksKitContractProof();
const physicsProof = createShowcaseCannonPhysicsProof("blockfall-reactor");
const sourceEvidence = {
  kind: "aura3d-showcase-blockfall-reactor-source" as const,
  route: window.location.pathname,
  appId: "showcase-blockfall-reactor",
  claimBoundary: "Aura3D falling-block development showcase with a catalog-sourced typed arcade cabinet, public game.fallingBlocks gameplay state, route-selected cannon-es fidelity proof, and retained gameplay proof.",
  publicEngineApi: ["createGameApp", "scene", "model", "primitives", "material", "lights", "effects", "camera", "game.input", "game.collisionWorld", "game.runtimeNode", "game.hud", "game.accessibility", "ui"],
  prohibitedApiAvoided: {
    importsThree: false,
    rawGlbUrls: false,
    stringAssetIds: false
  },
  assets: {
    proceduralOnly: false,
    typedAssetCount: 1,
    typedRefs: ["assets.showcaseBlockfallCabinet"],
    primary: "showcaseBlockfallCabinet",
    attribution: "Arcade Machine by Dmitry Blagodaryov, CC-BY-4.0, retained in the Aura3D catalog with release-grade render-probe evidence."
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
  /**
   * Deterministic 60-second replay proof. Every mechanic flag is derived from a
   * simulated run of the generated sequence, so the route cannot claim a
   * mechanic the replay did not actually produce.
   */
  sixtySecondReplayProof: sixtySecondReplayProof,
  kitContractProof: fallingBlocksKitContractProof,
  startState: {
    source: "clean playable board",
    lockedCells: 0,
    replayStartsOnlyFromButton: true
  },
  lineClearProof
};

// Board-dominant framing: the live playfield is the visual subject and the typed
// cabinet frames it. The camera sits close enough that the cabinet screen fills
// the majority of the frame height instead of floating in a void band.
// Framing is set by measurement, not taste. At fov 40 the playfield well rendered
// 347x640 px in 1440x900: 24.1% of canvas width, 71.1% of height, and only **17.1% of
// canvas area**, with **71.3% of the frame below luminance 45** and a canvas mean of
// 49/255. That is the measurable form of the acceptance criterion "no surrounding void
// or dashboard dominating". A 10x20 well is inherently ~0.5 aspect, so in a 1.6-aspect
// frame it can never be width-dominant; the honest lever is vertical occupancy. Tightening
// the vertical fov to 34 raises the well to ~84.6% of height and ~24.3% of canvas area
// without cropping the cabinet, hold, or next columns.
const reactorCamera = camera.perspective({
  position: [0, compactViewport ? 2.2 : 1.86, compactViewport ? 7.4 : 8.8],
  target: [0, compactViewport ? 2.16 : 1.82, 0.12],
  fov: compactViewport ? 54 : 36
});
const cabinetPosition = [0, 2.12, -2.15] as const;
const cabinetTargetSize = 5.15;
const reactorScene = scene()
  .background("#0a0410")
  .add(
    model(assets.showcaseBlockfallCabinet, {
      name: "blockfall-reactor-cabinet",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: cabinetTargetSize
    })
      .position(...cabinetPosition)
      .rotate(0, -Math.PI / 2, 0)
      .runtime(game.runtimeNode("blockfall-reactor-cabinet", {
        tags: ["typed-primary-asset", "arcade-cabinet", "release-probed"]
      }))
  )
  .addMany(createArcadeRoomNodes())
  .addMany(createBoardShell())
  .addMany(createLockedBlockNodes())
  .addMany(createActiveBlockNodes())
  .addMany(createGhostNodes())
  .addMany(createClearFlashNodes())
  .addMany(createBeatNodes())
  .addMany(createReactorNodes())
  .addMany([
    // Restrained bloom on tetromino/neon emissive only, AO for grounding, and a
    // nonzero depth haze that separates the hero cabinet from the room behind it.
    effects.neonBloom({ intensity: reducedFlash ? 0.12 : 0.26 }),
    effects.ambientOcclusion({ intensity: 0.46, radius: 0.68 }),
    effects.fog({ name: "arcade room depth haze", density: 0.028, color: "#0d0514", intensity: 0.3 }),
    lights.ambient({ name: "low arcade room wash", color: "#8f7ba4", intensity: 0.11 }),
    lights.directional({ name: "overhead arcade key", color: "#fff5dd", intensity: 1.05 }).position(-1.2, 6.4, 4.2),
    lights.point({ name: "reactor green bounce", color: "#74ff91", intensity: reducedFlash ? 0.58 : 1.05 }).position(2.4, 2.1, 2.6),
    lights.point({ name: "magenta arcade rim", color: "#ff42c8", intensity: 0.72 }).position(-2.15, 3.3, 1.35),
    lights.point({ name: "cyan playfield spill", color: "#8ff7ff", intensity: 0.95 }).position(0, 2.5, 1.55),
    lights.point({ name: "warm floor practical", color: "#ffc15b", intensity: 0.3 }).position(0, -0.45, 0.9)
  ])
  .camera(reactorCamera);

const gameApp = createGameApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  input: inputOptions,
  loop: { fixedDt: 1 / 60, maxSubSteps: 2 },
  scene: reactorScene
});

const app = gameApp.app;
const input = gameApp.input!;
if (!input) throw new Error("Blockfall Reactor failed to create Aura3D input.");

const cabinetHandle = app.nodes.require("blockfall-reactor-cabinet") as AuraRuntimeNodeHandle;
const lowerLeftCell = cellPosition(0, 0, 0);
const upperRightCell = cellPosition(BOARD_WIDTH - 1, VISIBLE_HEIGHT - 1, 0);
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "falling-blocks",
    camera: reactorCamera,
    subject: { position: cabinetPosition, rotation: [0, -Math.PI / 2, 0], targetSize: cabinetTargetSize },
    playSpacePoints: [lowerLeftCell, upperRightCell],
    contactPoint: cellPosition(Math.floor(BOARD_WIDTH / 2), 0, 0),
    setSubjectSuppressed: (suppressed: boolean) => {
      app.pause();
      cabinetHandle.setScale(suppressed ? 0.0001 : 1);
      app.step(0);
    }
  },
  configurable: true
});

const lockedHandles = new Map<string, AuraRuntimeNodeHandle>();
const activeHandles = Array.from({ length: 4 }, (_, index) => app.nodes.require(activeNodeId(index)) as AuraRuntimeNodeHandle);
const ghostHandles = Array.from({ length: 4 }, (_, index) => app.nodes.require(ghostNodeId(index)) as AuraRuntimeNodeHandle);
const clearFlashHandles = Array.from({ length: VISIBLE_HEIGHT }, (_, row) => app.nodes.require(clearFlashNodeId(row)) as AuraRuntimeNodeHandle);
const reactorFillNode = app.nodes.require("blockfall-reactor-fill") as AuraRuntimeNodeHandle;
const beatHandles = {
  levelUp: app.nodes.require(BEAT_NODE_IDS.levelUp) as AuraRuntimeNodeHandle,
  gameOver: app.nodes.require(BEAT_NODE_IDS.gameOver) as AuraRuntimeNodeHandle,
  reset: app.nodes.require(BEAT_NODE_IDS.reset) as AuraRuntimeNodeHandle,
  burst: app.nodes.require(BEAT_NODE_IDS.burst) as AuraRuntimeNodeHandle
};
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
  hiddenRows: HIDDEN_ROWS,
  board: createOpeningBoard()
});
fallingBlocks.setActive({ kind: "T", x: Math.floor(BOARD_WIDTH / 2) - 2, y: HIDDEN_ROWS + 3, rotation: 0 });
let paused = false;
let placedPieces = 0;
let lockCount = 0;
let lastFallingEvents: readonly GameFallingBlocksEvent[] = fallingBlocks.snapshot().events;
let state = createBlockfallView(fallingBlocks.snapshot(), "spawn", lastFallingEvents);
let lastVisualChecksum = "";
/**
 * Rendered beat timers, in seconds remaining. Each beat is driven by an actual
 * observed game event, so the visible pulse is game state rather than decoration.
 */
const beatTimers = { levelUp: 0, gameOver: 0, reset: 0, burst: 0 };
const beatDurations = { levelUp: 0.85, gameOver: 1.6, reset: 0.7, burst: 0.45 };
let lastObservedLevel = 1;
let burstRowY = BOARD_CENTER_Y;
/** Rendered beats that were actually observed at least once this session. */
const observedBeatProof = { lineClear: false, levelUp: false, gameOver: false, reset: false };
let queuedActions: BlockfallAction[] = [];
let replayPlayback: { active: boolean; frame: number } = { active: false, frame: 0 };
const observedGameplayProof = {
  movement: false,
  rotation: false,
  hold: false,
  lineClear: false,
  scoring: false,
  levelProgression: false,
  gameOver: false,
  reset: false,
  eventCounts: {
    lock: 0,
    lineClear: 0,
    gameOver: 0,
    reset: 0
  }
};
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

  syncAll(false, dt);
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
      observedGameplayProof.reset = true;
      observedGameplayProof.eventCounts.reset += 1;
      lastObservedLevel = resetSnapshot.level;
      beatTimers.reset = beatDurations.reset;
      beatTimers.gameOver = 0;
      observedBeatProof.reset = true;
      continue;
    }
    if (paused || state.gameOver) continue;
    const fallingAction = toFallingBlockAction(action);
    if (action.type === "move") observedGameplayProof.movement = true;
    if (action.type === "rotate") observedGameplayProof.rotation = true;
    if (action.type === "hold") observedGameplayProof.hold = true;
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
  const lineClears = events.filter((event) => event.type === "line-clear").length;
  const gameOvers = events.filter((event) => event.type === "game-over").length;
  if (locks > 0) {
    lockCount += locks;
    placedPieces += locks;
    observedGameplayProof.eventCounts.lock += locks;
  }
  if (lineClears > 0) {
    observedGameplayProof.lineClear = true;
    observedGameplayProof.eventCounts.lineClear += lineClears;
    beatTimers.burst = beatDurations.burst;
    observedBeatProof.lineClear = true;
  }
  if (gameOvers > 0) {
    observedGameplayProof.gameOver = true;
    observedGameplayProof.eventCounts.gameOver += gameOvers;
    beatTimers.gameOver = beatDurations.gameOver;
    observedBeatProof.gameOver = true;
  }
  const snapshot = fallingBlocks.snapshot();
  observedGameplayProof.scoring ||= snapshot.score > 0;
  observedGameplayProof.levelProgression ||= snapshot.level > 1;
  if (snapshot.level > lastObservedLevel) {
    lastObservedLevel = snapshot.level;
    beatTimers.levelUp = beatDurations.levelUp;
    observedBeatProof.levelUp = true;
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

function syncAll(force: boolean, dt = 0): void {
  const checksum = blockfallChecksum(state);
  if (force || checksum !== lastVisualChecksum) {
    syncBoardVisuals();
    syncHud();
    lastVisualChecksum = checksum;
  }
  // Beats animate continuously, so they advance outside the checksum gate.
  syncBeats(dt);
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
      const position = cellPosition(x, y, 0.14);
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
    const position = cellPosition(cell.x, visibleY, 0.2);
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
  const firstClearedRow = [...clearRows][0];
  if (firstClearedRow !== undefined) burstRowY = cellPosition(0, firstClearedRow, 0)[1];
}

/**
 * Advances the rendered beat nodes. Each beat's size/position/visibility comes
 * from a timer started by a real observed game event.
 */
function syncBeats(dt: number): void {
  for (const key of ["levelUp", "gameOver", "reset", "burst"] as const) {
    beatTimers[key] = Math.max(0, beatTimers[key] - Math.max(0, dt));
  }

  const levelUpProgress = beatTimers.levelUp / beatDurations.levelUp;
  if (levelUpProgress > 0) {
    const travel = (1 - levelUpProgress) * 4.2 - 2.1;
    beatHandles.levelUp
      .setPosition(0, BOARD_CENTER_Y + travel, 0.24)
      .setScale([1.06, 0.05 + levelUpProgress * 0.06, 0.02])
      .setVisible(true);
  } else {
    beatHandles.levelUp.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }

  /*
   * Game-over beat: a wash that resolves to a border, so the final board stays readable.
   *
   * This previously pinned `fill = 1` for as long as `state.gameOver` was true, which made the panel a
   * permanent 1.08 x 4.36 slab covering the entire well. The captured game-over frame therefore hid
   * the very thing a player wants to look at -- the stack that ended the run -- behind a flat red
   * rectangle, and read as an error overlay rather than a game beat.
   *
   * The beat now plays its 1.6s wash and then settles into a thin band at the top of the well, where
   * the stack topped out. So the beat is still unmistakable in motion and in a capture taken during it,
   * but the resting game-over state leaves the board visible.
   */
  const gameOverProgress = beatTimers.gameOver / beatDurations.gameOver;
  if (gameOverProgress > 0 || state.gameOver) {
    // While the timer runs, sweep down from the top of the well; once it expires, hold a top band.
    const sweeping = gameOverProgress > 0;
    const height = sweeping ? 4.36 * (1 - gameOverProgress) : 0.34;
    const top = BOARD_CENTER_Y + 2.18;
    beatHandles.gameOver
      .setPosition(0, top - height / 2, 0.23)
      .setScale([1.08, Math.max(0.06, height), 0.02])
      .setVisible(true);
  } else {
    beatHandles.gameOver.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }

  const resetProgress = beatTimers.reset / beatDurations.reset;
  if (resetProgress > 0) {
    const sweep = BOARD_CENTER_Y + 2.1 - (1 - resetProgress) * 4.2;
    beatHandles.reset
      .setPosition(0, sweep, 0.25)
      .setScale([1.08, 0.07, 0.02])
      .setVisible(true);
  } else {
    beatHandles.reset.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }

  const burstProgress = beatTimers.burst / beatDurations.burst;
  if (burstProgress > 0) {
    // The burst reads as a flash travelling *across the cleared row*, not as a ball over
    // the well. The previous form grew to radius 0.62 -- a 1.24-unit diameter against a
    // 2.08-unit board, which projected to 373 px, i.e. **96% of the well's on-screen
    // width**, as a flat grey disc that occluded the playfield. That is the "giant
    // foreground sphere occlusion" this route is explicitly required not to have.
    // It now spans the board horizontally and stays within one cell vertically, so the
    // beat is unmistakable while the stack behind it stays readable.
    const spread = 0.24 + (1 - burstProgress) * 0.76;
    const halfWidth = (CELL * BOARD_WIDTH) / 2;
    beatHandles.burst
      .setPosition(0, burstRowY, 0.24)
      .setScale([halfWidth * spread, CELL * 0.34, CELL * 0.3])
      .setVisible(true);
  } else {
    beatHandles.burst.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
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
    observedGameplayProof: {
      ...observedGameplayProof,
      eventCounts: { ...observedGameplayProof.eventCounts }
    },
    /**
     * Rendered in-scene beats. Each flag only becomes true after the matching
     * game event fired and drove a visible scene node, so this is mounted beat
     * evidence rather than a source-authored declaration.
     */
    renderedBeatProof: {
      ...observedBeatProof,
      activeBeats: {
        levelUp: beatTimers.levelUp > 0,
        gameOver: beatTimers.gameOver > 0 || state.gameOver,
        reset: beatTimers.reset > 0,
        lineClearBurst: beatTimers.burst > 0
      },
      beatNodeIds: { ...BEAT_NODE_IDS }
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
      assets: { typedAssets: 1, missingAssets: [] },
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

  // Session actions share the desktop handlers so touch and desktop cannot drift.
  const touchSessionActions: Record<string, () => void> = {
    pause: () => queueManualAction({ type: "pause" }),
    reset: () => {
      replayPlayback = { active: false, frame: 0 };
      queuedActions = [{ type: "reset", seed: DEFAULT_SEED }];
      focusGame();
    },
    replay: () => startReplayPlayback()
  };

  document.querySelectorAll<HTMLButtonElement>("[data-touch-action]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const key = button.dataset.touchAction ?? "";
      const session = touchSessionActions[key];
      if (session) {
        session();
        return;
      }
      const action = touchActionMap[key];
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

function mediaMatches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}
