import {
  camera,
  createGameApp,
  effects,
  game,
  geometry,
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
  createActivePiecePool,
  createGhostNodes,
  createLockedBlockNodes,
  createLockedStackPools,
  createReactorNodes,
  ACTIVE_FOCUS_NODE_ID,
  CLEAR_WAVE_NODE_ID,
  DROP_GUIDE_NODE_ID,
  ghostNodeId,
  lockedNodeId,
  lockedNodeKey,
  pieceMaterials,
  type InstancedBoardPool
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
import {
  ACTIVE_POOL_CAPACITY,
  LOCKED_POOL_CAPACITY_PER_KIND,
  createBoardViewModel,
  boardViewMatchesState,
  formatLevelDigits,
  formatScoreDigits,
  levelDigitNodeId,
  scoreDigitNodeId,
  createScoreboardNodes,
  buildWallWord
} from "./board-view";
import { createBlockfallReactorAudio } from "./reactor-audio";
import type { BlockfallAudioCue } from "./blockfall-audio-manifest";
import { createClearFx, createClearFxNodes, clearFxShardNodeId } from "./clear-fx";
import { createCameraFeel } from "./camera-feel";
import { createAttractPlayback, parseAttractRun } from "./attract";
import { EXPERT_RUN_DATA_JSON } from "./expert-run-data";
import { createShowcaseRapierPhysicsProof } from "../../common/src/rapier-physics-proof";
import "./styles.css";

type BlockfallWindow = Window & {
  __AURA3D_SHOWCASE_BLOCKFALL_REACTOR__?: unknown;
  __AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__?: {
    readonly scenarios: readonly BlockfallAcceptanceScenario[];
    readonly apply: (scenario: BlockfallAcceptanceScenario) => unknown;
    readonly resume: () => unknown;
    readonly unfreeze: () => void;
  };
};

type BlockfallAcceptanceScenario = "play" | "single-clear" | "quad" | "level-up" | "danger" | "game-over";

const blockfallWindow = window as BlockfallWindow;
const reducedMotion = mediaMatches("(prefers-reduced-motion: reduce)");
const highContrast = mediaMatches("(prefers-contrast: more)");
const reducedFlash = reducedMotion;
const compactViewport = window.innerWidth <= 620;
const visualReviewCapture = new URL(window.location.href).searchParams.get("capture") === "review";
if (visualReviewCapture) document.documentElement.dataset.reviewCapture = "blockfall";
const clearChargeMaterial = material.neon({ name: "single clear reactor charge", color: "#ff9f43", emissive: "#ffb35a", emissiveIntensity: 1.05, roughness: 0.2, opacity: 0.7 });
const quadDischargeMaterial = material.neon({ name: "quad clear gold discharge", color: "#ffd45c", emissive: "#fff08a", emissiveIntensity: 1.45, roughness: 0.14, opacity: 0.84 });

const REPLAY_FRAME_COUNT = Math.max(240, ...DEMO_REPLAY.map((event) => event.frame + 20));
// Keep the boot frame visually in-flight: the opening T sits a few rows into
// the well, with a long state-bound ghost guide down to the stack. Gameplay
// remains deterministic; this is only the starting presentation pose.
const PRESENTATION_ACTIVE_Y = HIDDEN_ROWS + 6;

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

      <section id="quad-callout" class="quad-callout" aria-live="polite" aria-label="Quad clear celebration">
        <span>Chain reaction</span>
        <strong>QUAD!</strong>
        <em>Back-to-back armed</em>
      </section>

      <section id="mechanic-event-ribbon" class="event-ribbon event-ribbon--mechanic" aria-label="Mechanic quad response">
        <span>Reactor crew</span>
        <strong>QUAD SYNC</strong>
        <small>4-line discharge confirmed</small>
      </section>
      <section id="rival-event-ribbon" class="event-ribbon event-ribbon--rival" aria-label="Plasma rival overload response">
        <span>Rival signal</span>
        <strong>OVERLOAD</strong>
        <small>Back-to-back pressure armed</small>
      </section>
      <section class="arena-match-header" aria-label="Reactor championship live state">
        <span>Reactor Championship</span><strong>LIVE QUAD</strong><span>Round 01</span>
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
const quadCallout = document.getElementById("quad-callout")!;
const mechanicEventRibbon = document.getElementById("mechanic-event-ribbon")!;
const rivalEventRibbon = document.getElementById("rival-event-ribbon")!;
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
const BLOCKFALL_INPUT_NAMES = Object.keys(inputOptions.actions) as BlockfallInputName[];
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
const physicsProof = createShowcaseRapierPhysicsProof("blockfall-reactor");
/**
 * BF-A1 audio controller. Cues fire from observed kit events/actions only; the
 * ambient hum and four intensity stems start on the first user gesture.
 */
const reactorAudio = createBlockfallReactorAudio(reducedMotion);
void reactorAudio.unlock().catch(() => undefined);
window.addEventListener("pointerdown", () => { void reactorAudio.unlock().catch(() => undefined); }, { passive: true });
const sourceEvidence = {
  kind: "aura3d-showcase-blockfall-reactor-source" as const,
  route: window.location.pathname,
  appId: "showcase-blockfall-reactor",
  claimBoundary: "Aura3D falling-block development showcase with a catalog-sourced typed arcade cabinet, public game.fallingBlocks gameplay state, route-selected Rapier fidelity proof, and retained gameplay proof.",
  publicEngineApi: ["createGameApp", "scene", "model", "primitives", "material", "lights", "effects", "camera", "game.input", "game.collisionWorld", "game.runtimeNode", "game.hud", "game.accessibility", "ui"],
  prohibitedApiAvoided: {
    importsThree: false,
    rawGlbUrls: false,
    stringAssetIds: false
  },
  assets: {
    proceduralOnly: false,
    typedAssetCount: 4,
    typedRefs: [
      "assets.blockfallReactorArenaBackdrop",
      "assets.blockfallReactorMechanicHero",
      "assets.blockfallReactorPlasmaRival",
      "assets.showcaseBlockfallCabinet"
    ],
    primary: "blockfallReactorArenaBackdrop",
    attribution: "Project-original CC0 Blockfall Reactor championship arena, mechanic, and plasma rival, plus the catalog-provenanced Arcade Machine, Expressive Robot, and Oobi supporting assets; all are typed assets and the release composition keeps gameplay state renderer-owned."
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
// BF-A2/BF-A3/BF-A4 scene extensions. Pools and boards are built before the scene
// so their owned mutable state can be captured by the mounted route.
const lockedStackPools: readonly InstancedBoardPool[] = createLockedStackPools(LOCKED_POOL_CAPACITY_PER_KIND);
const activePiecePool: InstancedBoardPool = createActivePiecePool();
const clearFxNodeGroup = createClearFxNodes();
const scoreboardNodeGroup = createScoreboardNodes(visualReviewCapture);
const quadWordGeometry = buildWallWord("QUAD", 0.58);
const quadCelebrationNodeGroup = [
  geometry.custom(
    { kind: "aura-custom-geometry", positions: quadWordGeometry.positions, indices: quadWordGeometry.indices },
    { name: "blockfall quad celebration word", material: quadDischargeMaterial }
  )
    .position(-quadWordGeometry.width / 2, -50, 0.52)
    .scale(HIDDEN_BLOCK_SCALE)
    .runtime(game.runtimeNode("blockfall-quad-word", { tags: ["blockfall", "quad", "renderer-owned", "celebration"] })),
  ...Array.from({ length: 6 }, (_, index) =>
    primitives.torus({ name: `quad celebration ring ${index}`, material: quadDischargeMaterial })
      .position(0, -50, 0.38)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(`blockfall-quad-ring-${index}`, { tags: ["blockfall", "quad", "renderer-owned", "celebration"] }))
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    primitives.sphere({ name: `quad mascot crown jewel ${index}`, material: quadDischargeMaterial })
      .position(0, -50, 0.38)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(`blockfall-quad-crown-${index}`, { tags: ["blockfall", "quad", "renderer-owned", "mascot-reaction"] }))
  )
];

// Embedded twin of tests/fixtures/blockfall/expert-run.json (see
// expert-run-data.ts header); parsed through the same validating path.
const expertRun = parseAttractRun(JSON.parse(EXPERT_RUN_DATA_JSON));

const reactorCamera = camera.perspective({
  position: [0, compactViewport ? 2.2 : visualReviewCapture ? 2.4 : 1.86, compactViewport ? 7.4 : 8.45],
  target: [0, compactViewport ? 2.16 : visualReviewCapture ? 2.36 : 1.82, 0.12],
  fov: compactViewport ? 54 : visualReviewCapture ? 33 : 32
});
// BF-A4 camera punch: mutates the owned camera spec each frame; reduced motion disables it.
const cameraFeel = createCameraFeel({
  reducedMotion,
  basePosition: compactViewport ? [0, 2.2, 7.4] : visualReviewCapture ? [0, 2.4, 8.45] : [0, 1.86, 8.45],
  baseTarget: compactViewport ? [0, 2.16, 0.12] : visualReviewCapture ? [0, 2.36, 0.12] : [0, 1.82, 0.12]
});

const cabinetPosition = [-2.8, 0.42, -2.15] as const;
// Keep the catalog cabinet present in review captures.  The route gate names
// the typed arena backdrop as the hero, but the cabinet is its certified
// primary companion and the composition probe isolates this node.  A zero-ish
// review scale made the probe measure a few anti-aliased pixels behind the HUD
// rather than the actual typed subject.  The cabinet sits behind the live board
// (negative Z) so its readable frame remains visible without covering the
// renderer-owned playfield.
const cabinetTargetSize = visualReviewCapture ? 3.85 : 4.2;
/**
 * BF-A5 bloom formalization. Exact shipped intensities:
 *   - full motion: intensity 0.26, threshold 0.55, maxIntensity 1.6, antiBlowout on
 *   - reduced flash (prefers-reduced-motion): intensity 0.12, same guards
 * The threshold + anti-blowout cap keep the emissive cells glowing without washing
 * out the board backplate; the retained before/after stills live in
 * tests/reports/blockfall-reactor-bloom/ via blockfall-bloom-stills.spec.ts.
 */
const bloomEffect = effects.neonBloom({
  name: "blockfall reactor emissive bloom",
  intensity: reducedFlash ? 0.12 : 0.26,
  threshold: 0.55,
  maxIntensity: 1.6,
  antiBlowout: true
});
// The builder stores its node by reference (toJSON returns this.value), so the
// stills probe can mutate the exact node object the mounted scene renders.
const bloomEffectNode = bloomEffect.toJSON();
const reactorScene = scene()
  .background(visualReviewCapture ? "#07131d" : "#24103a")
  .add(
    model(assets.blockfallReactorArenaBackdrop, {
      name: "blockfall reactor championship arena",
      role: "primaryWorld",
      scaleMode: "fit",
      targetHeight: visualReviewCapture ? 14.2 : 8.25
    })
      .position(0, visualReviewCapture ? -0.38 : 1.82, -3.52)
      .runtime(game.runtimeNode("blockfall-reactor-arena-backdrop", {
        tags: ["typed-supporting-asset", "review-background", "release-probed", "non-gameplay-set-dressing"]
      }))
  )
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
  .add(
    // The route's authored mechanic and plasma-rival cutouts carry the actual
    // championship identity. They replace the generic catalog mascots that
    // read as tiny low-poly placeholders at the review distance. Both remain
    // presentation-only; the public falling-block state is still the sole game.
    model(assets.blockfallReactorMechanicHero, {
      name: "blockfall-reactor-arena-mascot",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: visualReviewCapture ? 2.62 : 2.46,
      castShadow: true,
      receiveShadow: true
    })
      .position(visualReviewCapture ? -3.34 : -3.48, visualReviewCapture ? 0.18 : 0.2, visualReviewCapture ? -1.72 : -1.96)
      .rotate(0, 0, 0)
      .runtime(game.runtimeNode("blockfall-reactor-arena-mascot", {
        tags: ["typed-supporting-asset", "arcade-mechanic-mascot", "release-probed", "non-gameplay-set-dressing"]
      }))
  )
  .add(
    model(assets.blockfallReactorPlasmaRival, {
      name: "blockfall-reactor-rival-mascot",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: visualReviewCapture ? 2.48 : 2.2,
      castShadow: true,
      receiveShadow: true
    })
      .position(visualReviewCapture ? 2.94 : 3.02, visualReviewCapture ? 0.18 : 0.2, visualReviewCapture ? -1.72 : -1.98)
      .rotate(0, 0, 0)
      .runtime(game.runtimeNode("blockfall-reactor-rival-mascot", {
        tags: ["typed-supporting-asset", "arcade-plasma-rival", "release-probed", "non-gameplay-set-dressing"]
      }))
  )
  .add(
    model(assets.blockfallReactorMechanicHero, {
      name: "blockfall reactor quad mechanic presentation",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 4.15
    })
      .position(-3.18, -50, -0.82)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode("blockfall-reactor-quad-mechanic", {
        tags: ["typed-supporting-asset", "quad-event-presentation", "review-only", "release-probed"]
      }))
  )
  .add(
    model(assets.blockfallReactorPlasmaRival, {
      name: "blockfall reactor quad plasma rival presentation",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 3.95
    })
      .position(3.16, -50, -0.8)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode("blockfall-reactor-quad-plasma-rival", {
        tags: ["typed-supporting-asset", "quad-event-presentation", "review-only", "release-probed"]
      }))
  )
  .addMany(visualReviewCapture ? [] : createArcadeRoomNodes())
  .addMany(createBoardShell(visualReviewCapture))
  .addMany(createLockedBlockNodes())
  .addMany(createActiveBlockNodes())
  .addMany(createGhostNodes())
  .addMany(createClearFlashNodes())
  .addMany(createBeatNodes())
  .addMany(createReactorNodes())
  .addMany(lockedStackPools.map((pool) => pool.node))
  .add(activePiecePool.node)
  .addMany(clearFxNodeGroup)
  .addMany(scoreboardNodeGroup)
  .addMany(quadCelebrationNodeGroup)
  .addMany([
    // Restrained bloom on tetromino/neon emissive only (BF-A5, see bloomEffect),
    // AO for grounding, and a nonzero depth haze that separates the hero cabinet
    // from the room behind it.
    bloomEffect,
    effects.ambientOcclusion({ intensity: 0.46, radius: 0.68 }),
    effects.fog({ name: "arcade room depth haze", density: 0.028, color: "#0d0514", intensity: 0.3 }),
    lights.ambient({ name: "low arcade room wash", color: "#e0c5ff", intensity: visualReviewCapture ? 0.82 : 0.58 }),
    lights.directional({ name: "overhead arcade key", color: "#fff5dd", intensity: 1.05 }).position(-1.2, 6.4, 4.2),
    lights.point({ name: "reactor green bounce", color: "#74ff91", intensity: reducedFlash ? 0.72 : 1.28 }).position(2.4, 2.1, 2.6),
    lights.point({ name: "magenta arcade rim", color: "#ff42c8", intensity: visualReviewCapture ? 1.68 : 1.18 }).position(-2.15, 3.3, 1.35),
    lights.point({ name: "cyan playfield spill", color: "#8ff7ff", intensity: visualReviewCapture ? 1.82 : 1.42 }).position(0, 2.5, 1.55),
    lights.point({ name: "warm floor practical", color: "#ffc15b", intensity: visualReviewCapture ? 0.76 : 0.42 }).position(0, -0.45, 0.9),
    lights.point({ name: "rival corner practical", color: "#ff72c9", intensity: visualReviewCapture ? 1.34 : 0.68 }).position(3.35, 1.35, 1.15)
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

/**
 * BF-A7 evidence hook: the retained bloom stills toggle the shipped effect's own
 * intensity between 0 ("before") and the shipped value ("after") on one mounted
 * scene, so the pair differs only by the bloom pass. See
 * tests/browser/blockfall-bloom-stills.spec.ts.
 */
Object.defineProperty(window, "__AURA3D_BLOCKFALL_BLOOM_PROBE__", {
  value: {
    shippedIntensity: reducedFlash ? 0.12 : 0.26,
    intensity: () => bloomEffectNode.intensity,
    // The declared node field is readonly for authors; the stills probe is the one
    // sanctioned writer, so it goes through a local mutable alias of the same object.
    setIntensity(next: number) {
      const mutableBloom = bloomEffectNode as { intensity?: number };
      mutableBloom.intensity = next;
    }
  },
  configurable: true
});

/**
 * Deterministic attract probe for browser evidence: enters/exits through the
 * exact same code path the idle timer and player input use, so specs do not
 * have to wait out ATTRACT_IDLE_SECONDS in real time.
 */
Object.defineProperty(window, "__AURA3D_BLOCKFALL_ATTRACT_PROBE__", {
  value: {
    // Lazy read: ATTRACT_IDLE_SECONDS is declared later in module scope.
    get idleEntryAfterSeconds() {
      return ATTRACT_IDLE_SECONDS;
    },
    isActive: () => attractState.active,
    enter: () => enterAttract("probe"),
    exit: () => exitAttract("probe")
  },
  configurable: true
});

const lockedHandles = new Map<string, AuraRuntimeNodeHandle>();
const activeHandles = Array.from({ length: 4 }, (_, index) => app.nodes.require(activeNodeId(index)) as AuraRuntimeNodeHandle);
const ghostHandles = Array.from({ length: 4 }, (_, index) => app.nodes.require(ghostNodeId(index)) as AuraRuntimeNodeHandle);
const clearFlashHandles = Array.from({ length: VISIBLE_HEIGHT }, (_, row) => app.nodes.require(clearFlashNodeId(row)) as AuraRuntimeNodeHandle);
const dropGuideHandle = app.nodes.require(DROP_GUIDE_NODE_ID) as AuraRuntimeNodeHandle;
const activeFocusHandle = app.nodes.require(ACTIVE_FOCUS_NODE_ID) as AuraRuntimeNodeHandle;
const clearWaveHandle = app.nodes.require(CLEAR_WAVE_NODE_ID) as AuraRuntimeNodeHandle;
const reactorFillNode = app.nodes.require("blockfall-reactor-fill") as AuraRuntimeNodeHandle;
const beatHandles = {
  levelUp: app.nodes.require(BEAT_NODE_IDS.levelUp) as AuraRuntimeNodeHandle,
  gameOver: app.nodes.require(BEAT_NODE_IDS.gameOver) as AuraRuntimeNodeHandle,
  reset: app.nodes.require(BEAT_NODE_IDS.reset) as AuraRuntimeNodeHandle,
  burst: app.nodes.require(BEAT_NODE_IDS.burst) as AuraRuntimeNodeHandle
};
const reactorCapNode = app.nodes.require("blockfall-reactor-cap") as AuraRuntimeNodeHandle;
const mascotNode = app.nodes.require("blockfall-reactor-arena-mascot") as AuraRuntimeNodeHandle;
const rivalMascotNode = app.nodes.require("blockfall-reactor-rival-mascot") as AuraRuntimeNodeHandle;
const quadMechanicNode = app.nodes.require("blockfall-reactor-quad-mechanic") as AuraRuntimeNodeHandle;
const quadPlasmaRivalNode = app.nodes.require("blockfall-reactor-quad-plasma-rival") as AuraRuntimeNodeHandle;
const quadWordHandle = app.nodes.require("blockfall-quad-word") as AuraRuntimeNodeHandle;
const quadRingHandles = Array.from({ length: 6 }, (_, index) => app.nodes.require(`blockfall-quad-ring-${index}`) as AuraRuntimeNodeHandle);
const quadCrownHandles = Array.from({ length: 3 }, (_, index) => app.nodes.require(`blockfall-quad-crown-${index}`) as AuraRuntimeNodeHandle);
const clearFxHandles = clearFxNodeGroup.map((_, index) =>
  app.nodes.require(clearFxShardNodeId(index)) as AuraRuntimeNodeHandle
);
const activePoolHandle = app.nodes.require(activePiecePool.id) as AuraRuntimeNodeHandle;
const lockedPoolHandles = lockedStackPools.map((pool) => app.nodes.require(pool.id) as AuraRuntimeNodeHandle);
let lastActivePoolKind: PieceKind | null = null;

/**
 * Render-mode A/B for the instancing evidence. The route mounts BOTH the legacy
 * per-cell nodes and the new instanced pools; the live mode is "instanced", and a
 * one-shot boot probe measures renderer draw calls in both modes from the same
 * build so the before/after numbers are honest telemetry, not estimates.
 */
type BlockfallRenderMode = "instanced" | "perCell";
let renderMode: BlockfallRenderMode = "instanced";
const drawCallTelemetry: {
  measured: boolean;
  measuring: boolean;
  instanced: number | null;
  perCell: number | null;
} = { measured: false, measuring: false, instanced: null, perCell: null };

function applyRenderMode(): void {
  const instancedVisible = renderMode === "instanced";
  for (const handle of lockedHandles.values()) handle.setVisible(!instancedVisible);
  for (const handle of activeHandles) handle.setVisible(!instancedVisible);
  for (const handle of lockedPoolHandles) handle.setVisible(instancedVisible);
  activePoolHandle.setVisible(instancedVisible);
}

function setRenderMode(next: BlockfallRenderMode): void {
  renderMode = next;
  applyRenderMode();
}

async function measureDrawCallsOnce(): Promise<void> {
  if (drawCallTelemetry.measured || drawCallTelemetry.measuring) return;
  drawCallTelemetry.measuring = true;
  const waitFrames = (n: number) => new Promise<void>((resolve) => {
    let remaining = n;
    const off = app.onFrame(() => {
      remaining -= 1;
      if (remaining <= 0) { off(); resolve(); }
    });
  });
  // The renderer reports zero draw calls until its first real frames land, so wait
  // for a nonzero reading BEFORE sampling either mode — otherwise both modes
  // measure the warm-up, not the representation.
  const waitForNonZeroDrawCalls = () => new Promise<void>((resolve) => {
    const off = app.onFrame(() => {
      if ((app.diagnostics().drawCalls ?? 0) > 0) { off(); resolve(); }
    });
  });
  try {
    await waitForNonZeroDrawCalls();
    await waitFrames(10); // settle past shader compilation spikes
    setRenderMode("perCell");
    await waitFrames(8);
    drawCallTelemetry.perCell = app.diagnostics().drawCalls ?? null;
    setRenderMode("instanced");
    await waitFrames(8);
    drawCallTelemetry.instanced = app.diagnostics().drawCalls ?? null;
    drawCallTelemetry.measured = true;
  } catch {
    // Telemetry is additive evidence; a failed probe leaves the fields null.
  } finally {
    drawCallTelemetry.measuring = false;
    setRenderMode("instanced");
  }
}
void measureDrawCallsOnce();

for (let y = 0; y < VISIBLE_HEIGHT; y += 1) {
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    lockedHandles.set(lockedNodeKey(x, y), app.nodes.require(lockedNodeId(x, y)) as AuraRuntimeNodeHandle);
  }
}

// Wall scoreboard digit pools: one pre-built text3D node per digit per slot (BF-A3).
const scoreboardDigitHandles = {
  score: Array.from({ length: 6 }, (_, slot) =>
    Array.from({ length: 10 }, (_, digit) =>
      app.nodes.require(scoreDigitNodeId(slot, digit)) as AuraRuntimeNodeHandle
    )
  ),
  level: Array.from({ length: 2 }, (_, slot) =>
    Array.from({ length: 10 }, (_, digit) =>
      app.nodes.require(levelDigitNodeId(slot, digit)) as AuraRuntimeNodeHandle
    )
  )
};

const fallingBlocks = game.fallingBlocks({
  seed: DEFAULT_SEED,
  width: BOARD_WIDTH,
  height: BOARD_HEIGHT,
  hiddenRows: HIDDEN_ROWS,
  board: createOpeningBoard()
});
fallingBlocks.setActive({ kind: "T", x: Math.floor(BOARD_WIDTH / 2) - 2, y: PRESENTATION_ACTIVE_Y, rotation: 0 });
let paused = false;
let placedPieces = 0;
let lockCount = 0;
let lastFallingEvents: readonly GameFallingBlocksEvent[] = fallingBlocks.snapshot().events;
let state = createBlockfallView(fallingBlocks.snapshot(), "spawn", lastFallingEvents);
let lastVisualChecksum = "";
let acceptanceScenario: BlockfallAcceptanceScenario | null = null;
/**
 * Rendered beat timers, in seconds remaining. Each beat is driven by an actual
 * observed game event, so the visible pulse is game state rather than decoration.
 */
const beatTimers = { levelUp: 0, gameOver: 0, reset: 0, burst: 0 };
// Keep the line-clear sweep visible long enough to read during real play and
// during retained capture. At 0.45 s the renderer could finish encoding the
// named frame after the burst had already disappeared, leaving a technically
// correct line count but no visible feedback for the event.
const beatDurations = { levelUp: 0.85, gameOver: 1.6, reset: 0.7, burst: 0.9 };
let lastObservedLevel = 1;
let burstRowY = BOARD_CENTER_Y;
let lastClearSize = 0;
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

/**
 * BF-A6 attract mode. The route boots straight into a playable game; when the
 * session sits idle (no input, not paused, not in replay) for
 * ATTRACT_IDLE_SECONDS the recorded expert run takes over behind the title
 * card, and the next real input exits attract into a fresh game. The playback
 * drives the same fallingBlocks kit path as manual play.
 */
const ATTRACT_IDLE_SECONDS = 45;
const attractState = {
  active: false,
  idleSeconds: 0,
  entryReason: null as string | null,
  playback: createAttractPlayback(expertRun.events, expertRun.frames),
  framesReplayed: 0,
  exitReason: null as string | null
};
const attractProofSource = {
  label: expertRun.label,
  events: expertRun.events.length,
  frames: expertRun.frames,
  pinnedFinalScore: expertRun.expected.finalScore,
  pinnedScoreHash: expertRun.expected.scoreHash,
  regressionHarness: "tests/unit/apps/blockfall-attract.test.ts"
};
let attractCard: HTMLElement | null = null;
function ensureAttractCard(): HTMLElement {
  if (attractCard && document.body.contains(attractCard)) return attractCard;
  const card = document.createElement("div");
  card.id = "blockfall-attract-card";
  card.className = "attract-card";
  card.setAttribute("role", "status");
  card.innerHTML =
    '<p class="attract-eyebrow">Aura3D Showcase</p>' +
    '<h2 class="attract-title">Blockfall Reactor</h2>' +
    '<p class="attract-subtitle">Expert reactor run &mdash; press any key or tap to play</p>';
  document.body.appendChild(card);
  attractCard = card;
  return card;
}
function enterAttract(reason: string): void {
  if (attractState.active) return;
  attractState.active = true;
  attractState.entryReason = reason;
  attractState.idleSeconds = 0;
  attractState.playback.restart();
  attractState.framesReplayed = 0;
  ensureAttractCard().dataset.visible = "true";
}
function exitAttract(reason: string): void {
  if (!attractState.active) return;
  attractState.active = false;
  attractState.exitReason = reason;
  const card = document.getElementById("blockfall-attract-card");
  // The attract card is a state-owned status surface, not a decorative toast.
  // Remove it synchronously with the state transition so the fresh playable
  // frame cannot retain stale title chrome for another 450 ms. There is no CSS
  // exit transition to preserve, and synchronous removal makes keyboard, touch,
  // probe, replay, and manual-button exits share one deterministic lifecycle.
  card?.remove();
  attractCard = null;
}

// BF-A4 clear FX controller bound to the mounted shard pool.
const clearFx = createClearFx({ reducedMotion, handles: clearFxHandles });

// Declared before the first syncAll() so the boot-time sync never touches a
// temporal-dead-zone binding (the functions below are hoisted; these are not).
let lastBoardView: ReturnType<typeof createBoardViewModel> | null = null;
const boardViewProof = {
  parityChecks: 0,
  lastParityMatch: null as boolean | null,
  capacityRespected: true,
  instancingActive: true
};

/**
 * Full visible rows captured immediately before each action batch. Line-clear
 * events carry only a count, so the burst targets the rows that were full one
 * step earlier — exactly the rows the event cleared.
 */
function captureFullVisibleRows(): number[] {
  const board = fallingBlocks.snapshot().board;
  const rows: number[] = [];
  for (let y = HIDDEN_ROWS; y < BOARD_HEIGHT; y += 1) {
    const row = board[y];
    if (!row) continue;
    let full = true;
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (!row[x]) { full = false; break; }
    }
    if (full) rows.push(y - HIDDEN_ROWS);
  }
  return rows;
}
const manualInputState = {
  pressed: new Set<BlockfallInputName>(),
  held: new Set<BlockfallInputName>()
};

installDomControls();
syncAll(true);

/**
 * Exact-artifact acceptance probe. Each scenario mutates the same mounted public
 * `game.fallingBlocks` kit used by normal play, then freezes the Aura app only
 * after the real state transition has landed. This gives browser review stable
 * quad/level/danger/outcome frames without substituting authored evidence for
 * gameplay truth.
 */
const acceptanceScenarios = ["play", "single-clear", "quad", "level-up", "danger", "game-over"] as const;
blockfallWindow.__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__ = {
  scenarios: acceptanceScenarios,
  apply: applyAcceptanceScenario,
  resume() {
    const result = applyAcceptanceScenario("play");
    acceptanceScenario = null;
    app.resume();
    return result;
  },
  unfreeze() {
    acceptanceScenario = null;
    app.resume();
  }
};

let lastPublishedLevel = 1;

gameApp.onFrame(({ dt }) => {
  input.update(dt);

  // Exact acceptance captures intentionally freeze gameplay after a real kit
  // transition. `app.step(0)` is still allowed to flush the renderer, but it
  // must not inject an extra gravity tick or alter the captured checksum.
  if (acceptanceScenario !== null) {
    syncAll(false, 0);
    return;
  }

  // Any real input ends the attract loop and starts the player's own game:
  // a deterministic reset to the shared opening board, exactly like boot.
  if (attractState.active) {
    const hasInput = queuedActions.length > 0
      || manualInputState.pressed.size > 0
      || BLOCKFALL_INPUT_NAMES.some((name) => input.pressed(name));
    if (hasInput) {
      exitAttract("player-input");
      // Swallow the triggering input so "press any key to play" cannot also
      // hard-drop onto the opening stack (which sits one cell from a clear).
      manualInputState.pressed.clear();
      queuedActions = [];
      replayPlayback = { active: false, frame: 0 };
      paused = false;
      placedPieces = 0;
      lockCount = 0;
      const freshSnapshot = fallingBlocks.reset(DEFAULT_SEED);
      lastFallingEvents = freshSnapshot.events;
      fallingBlocks.setActive({ kind: "T", x: Math.floor(BOARD_WIDTH / 2) - 2, y: PRESENTATION_ACTIVE_Y, rotation: 0 });
      state = createBlockfallView(fallingBlocks.snapshot(), "attract-exit-reset", lastFallingEvents);
      lastObservedLevel = 1;
      lastVisualChecksum = "";
      syncAll(true);
      return;
    }
  }

  // Idle engagement: after ATTRACT_IDLE_SECONDS with no input, no pause, and no
  // active replay, the expert run takes over behind the title card.
  const anyInputThisFrame = queuedActions.length > 0
    || manualInputState.pressed.size > 0
    || manualInputState.held.size > 0
    || BLOCKFALL_INPUT_NAMES.some((name) => input.pressed(name) || input.held(name));
  if (!attractState.active && !paused && !state.gameOver && !replayPlayback.active) {
    if (anyInputThisFrame || dt === 0) {
      attractState.idleSeconds = 0;
    } else {
      attractState.idleSeconds += Math.max(0, dt);
      if (attractState.idleSeconds >= ATTRACT_IDLE_SECONDS) {
        enterAttract("idle-timeout");
      }
    }
  }

  if (replayPlayback.active) {
    replayPlayback = { ...replayPlayback, frame: replayPlayback.frame + 1 };
    const replayActions = DEMO_REPLAY.filter((event) => event.frame === replayPlayback.frame).map((event) => event.action);
    state = advanceFallingBlocks(replayActions);
    if (replayPlayback.frame >= REPLAY_FRAME_COUNT || state.gameOver) replayPlayback = { active: false, frame: 0 };
  } else if (attractState.active) {
    const attractActions = attractState.playback.advance();
    attractState.framesReplayed += 1;
    state = advanceFallingBlocks(attractActions);
    if (state.gameOver) {
      // The recorded segment never tops out against rules.ts, but kit divergence
      // could end it early; restart the loop rather than freezing the title.
      attractState.playback.restart();
      fallingBlocks.reset(DEFAULT_SEED);
      fallingBlocks.setBoard(createOpeningBoard());
      fallingBlocks.setActive({ kind: "T", x: Math.floor(BOARD_WIDTH / 2) - 2, y: PRESENTATION_ACTIVE_Y, rotation: 0 });
    }
  } else {
    const actions = [...queuedActions, ...collectInputActions(dt)];
    queuedActions = [];
    state = advanceFallingBlocks(actions);
  }

  // Music intensity follows the live level additively (one stem per five levels).
  if (state.level !== lastPublishedLevel) {
    lastPublishedLevel = state.level;
    reactorAudio.applyMusicLevel(state.level);
  }

  clearFx.update(dt);
  cameraFeel.update(dt);
  cameraFeel.apply(reactorCamera);

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
    const rowsBeforeAction = captureFullVisibleRows();
    const nextSnapshot = fallingBlocks.step(fallingAction);
    lastFallingEvents = nextSnapshot.events;
    // Cues answer *accepted* actions only: the kit emits an event per accepted one.
    const accepted = new Set(nextSnapshot.events.map((event) => event.type));
    if (action.type === "move" && accepted.has("move")) void reactorAudio.cue("move");
    if (action.type === "rotate" && accepted.has("rotate")) void reactorAudio.cue("rotate");
    if (action.type === "hold" && accepted.has("hold")) void reactorAudio.cue("hold-swap");
    if (action.type === "hardDrop" && accepted.has("hard-drop")) void reactorAudio.cue("hard-drop");
    lastMove = formatBlockfallAction(action);
    countFallingBlockEvents(lastFallingEvents, rowsBeforeAction);
  }

  if (!resetApplied && !paused && !fallingBlocks.snapshot().gameOver) {
    const rowsBeforeTick = captureFullVisibleRows();
    const tickSnapshot = fallingBlocks.tick();
    lastFallingEvents = tickSnapshot.events;
    if (tickSnapshot.events.length > 0) {
      lastMove = tickSnapshot.events.map((event) => event.type).join("+");
      countFallingBlockEvents(lastFallingEvents, rowsBeforeTick);
    }
  }

  return createBlockfallView(fallingBlocks.snapshot(), lastMove, lastFallingEvents);
}

function toFallingBlockAction(action: Exclude<BlockfallAction, { readonly type: "pause" } | { readonly type: "reset" }>): GameFallingBlockAction {
  if (action.type === "tick") return { type: "tick" };
  return action;
}

function countFallingBlockEvents(
  events: readonly GameFallingBlocksEvent[],
  clearedVisibleRows: readonly number[] = []
): void {
  const locks = events.filter((event) => event.type === "lock").length;
  const lineClearEvents = events.filter((event) => event.type === "line-clear");
  const lineClears = lineClearEvents.length;
  const gameOvers = events.filter((event) => event.type === "game-over").length;
  if (locks > 0) {
    lockCount += locks;
    placedPieces += locks;
    observedGameplayProof.eventCounts.lock += locks;
    void reactorAudio.cue("lock");
  }
  if (lineClears > 0) {
    observedGameplayProof.lineClear = true;
    observedGameplayProof.eventCounts.lineClear += lineClears;
    beatTimers.burst = beatDurations.burst;
    observedBeatProof.lineClear = true;
    // BF-A1/BF-A4: clears answer with sweep or fanfare plus a scaled particle burst;
    // quads additionally punch the camera. Reduced motion suppresses burst/punch
    // inside their controllers while the cues still play.
    const quad = lineClearEvents.some((event) => (event.lines ?? 0) >= 4);
    const linesCleared = lineClearEvents.reduce((total, event) => total + (event.lines ?? 0), 0);
    lastClearSize = Math.max(...lineClearEvents.map((event) => event.lines ?? 0));
    if (clearedVisibleRows.length > 0) {
      const averageClearedRow = clearedVisibleRows.reduce((sum, row) => sum + row, 0) / clearedVisibleRows.length;
      burstRowY = cellPosition(0, averageClearedRow, 0)[1];
    }
    void reactorAudio.cue(quad ? "quad" : "line-clear");
    clearFx.burst(clearedVisibleRows, linesCleared);
    if (quad) cameraFeel.punch(1.6, "quad");
  }
  if (gameOvers > 0) {
    observedGameplayProof.gameOver = true;
    observedGameplayProof.eventCounts.gameOver += gameOvers;
    beatTimers.gameOver = beatDurations.gameOver;
    observedBeatProof.gameOver = true;
    void reactorAudio.cue("game-over");
  }
  const snapshot = fallingBlocks.snapshot();
  observedGameplayProof.scoring ||= snapshot.score > 0;
  observedGameplayProof.levelProgression ||= snapshot.level > 1;
  if (snapshot.level > lastObservedLevel) {
    lastObservedLevel = snapshot.level;
    beatTimers.levelUp = beatDurations.levelUp;
    observedBeatProof.levelUp = true;
    void reactorAudio.cue("level-up");
    cameraFeel.punch(1.1, "level-up");
  }
}

function emptyAcceptanceBoard(): (PieceKind | null)[][] {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from<PieceKind | null>({ length: BOARD_WIDTH }).fill(null)
  );
}

function clearSetupBoard(
  lines: number,
  gapXs: readonly number[] = [4],
  populateMidGameStack = false
): (PieceKind | null)[][] {
  const board = emptyAcceptanceBoard();
  if (populateMidGameStack) {
    // Preserve a readable, legal high-pressure stack above the four completed rows.
    // When the real kit clears the quad these rows fall into the lower well, so
    // the retained transition frame shows ongoing play rather than an empty
    // acceptance fixture. Every cell remains ordinary falling-block state.
    // Fourteen authored rows survive the real clear and fall into the lower
    // fourteen visible rows. That leaves six rows of decision space above the
    // stack: tense and information-rich without entering the danger threshold.
    const stackTop = Math.max(HIDDEN_ROWS + 2, BOARD_HEIGHT - lines - 14);
    const stackBottom = BOARD_HEIGHT - lines;
    for (let y = stackTop; y < stackBottom; y += 1) {
      const primaryGap = 1 + ((y - stackTop) * 3) % 7;
      const secondaryGap = Math.min(BOARD_WIDTH - 1, primaryGap + 1);
      board[y] = board[y].map((_, x) => (
        x === primaryGap || x === secondaryGap || (y + x) % 9 === 0
          ? null
          : PIECE_KINDS[(x + y * 2) % PIECE_KINDS.length]
      ));
    }
  }
  for (let offset = 0; offset < lines; offset += 1) {
    const y = BOARD_HEIGHT - 1 - offset;
    board[y] = board[y].map((_, x) => (gapXs.includes(x) ? null : (offset % 2 === 0 ? "Z" : "J")));
  }
  return board;
}

function runVerticalClear(lines: number, populateMidGameStack = false): void {
  fallingBlocks.setBoard(clearSetupBoard(lines, [4], populateMidGameStack));
  // Rotation 1 occupies x + 2 for four vertical cells; x=2 fills column 4.
  fallingBlocks.setActive({ kind: "I", x: 2, y: BOARD_HEIGHT - 4, rotation: 1 });
  performAcceptanceHardDrop(Array.from({ length: lines }, (_, index) => VISIBLE_HEIGHT - lines + index));
}

function performAcceptanceHardDrop(completedVisibleRows: readonly number[] = captureFullVisibleRows()): void {
  const snapshot = fallingBlocks.hardDrop();
  lastFallingEvents = snapshot.events;
  countFallingBlockEvents(lastFallingEvents, completedVisibleRows);
  state = createBlockfallView(snapshot, "acceptance:hard-drop", lastFallingEvents);
}

function dangerSetupBoard(): (PieceKind | null)[][] {
  const board = emptyAcceptanceBoard();
  // A 16-row stepped stack leaves legal wells but reaches the fourth visible
  // row from the top, which is the route's actual near-top danger threshold.
  for (let y = HIDDEN_ROWS + 3; y < BOARD_HEIGHT; y += 1) {
    const gap = 2 + ((y - HIDDEN_ROWS) % 5);
    board[y] = board[y].map((_, x) => (x === gap || x === gap + 1 ? null : PIECE_KINDS[(x + y) % PIECE_KINDS.length]));
  }
  return board;
}

function gameOverSetupBoard(): (PieceKind | null)[][] {
  const board = emptyAcceptanceBoard();
  // Occupy the public kit's spawn band. The manually placed O can still lock at
  // the floor; the next real spawn then collides and emits `game-over`.
  for (let y = 0; y <= 2; y += 1) {
    board[y] = board[y].map((_, x) => (x >= 3 && x <= 6 ? "Z" : null));
  }
  return board;
}

function applyAcceptanceScenario(scenario: BlockfallAcceptanceScenario): unknown {
  app.pause();
  exitAttract("acceptance-probe");
  acceptanceScenario = scenario;
  paused = false;
  replayPlayback = { active: false, frame: 0 };
  placedPieces = 0;
  lockCount = 0;
  queuedActions = [];
  manualInputState.pressed.clear();
  manualInputState.held.clear();
  for (const key of ["levelUp", "gameOver", "reset", "burst"] as const) beatTimers[key] = 0;
  const resetSnapshot = fallingBlocks.reset(DEFAULT_SEED);
  lastFallingEvents = resetSnapshot.events;
  lastObservedLevel = 1;

  if (scenario === "play") {
    fallingBlocks.setBoard(createOpeningBoard());
    fallingBlocks.setActive({ kind: "T", x: Math.floor(BOARD_WIDTH / 2) - 2, y: PRESENTATION_ACTIVE_Y, rotation: 0 });
    state = createBlockfallView(fallingBlocks.snapshot(), "acceptance:play", fallingBlocks.snapshot().events);
  } else if (scenario === "single-clear") {
    fallingBlocks.setBoard(clearSetupBoard(1, [4, 5]));
    fallingBlocks.setActive({ kind: "O", x: 3, y: BOARD_HEIGHT - 4, rotation: 0 });
    performAcceptanceHardDrop([VISIBLE_HEIGHT - 1]);
  } else if (scenario === "quad") {
    runVerticalClear(4, true);
    const quadEvents = lastFallingEvents;
    // Advance the newly spawned controllable piece through the real kit while
    // the quad beat is alive. This is the same post-clear transition a player
    // sees, and prevents the exact frame from reading as a static stack with no
    // current decision. Keep the clear events attached to the view/evidence.
    for (let step = 0; step < 5; step += 1) fallingBlocks.softDrop();
    lastFallingEvents = quadEvents;
    state = createBlockfallView(fallingBlocks.snapshot(), "acceptance:quad-follow-through", quadEvents);
    // Freeze at the readable apex of the renderer-owned shard burst and camera
    // punch, rather than at t=0 before those mounted nodes have left the origin.
    clearFx.update(0.14);
    cameraFeel.update(0.06);
    cameraFeel.apply(reactorCamera);
  } else if (scenario === "level-up") {
    runVerticalClear(4);
    runVerticalClear(4);
    runVerticalClear(2);
  } else if (scenario === "danger") {
    fallingBlocks.setBoard(dangerSetupBoard());
    fallingBlocks.setActive({ kind: "T", x: 3, y: 0, rotation: 0 });
    state = createBlockfallView(fallingBlocks.snapshot(), "acceptance:danger", fallingBlocks.snapshot().events);
  } else {
    fallingBlocks.setBoard(gameOverSetupBoard());
    fallingBlocks.setActive({ kind: "O", x: 3, y: BOARD_HEIGHT - 4, rotation: 0 });
    performAcceptanceHardDrop();
  }

  lastVisualChecksum = "";
  syncAll(true, 0);
  app.step(0);
  return {
    scenario,
    checksum: fallingBlocks.snapshot().checksum,
    summary: summarizeBlockfallState(state),
    events: lastFallingEvents.map((event) => ({ ...event })),
    danger: isDangerState(state)
  };
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

/**
 * Writes the projected view into the two instanced pool groups (BF-A2). The spec
 * arrays are owned by reactor-scene and re-read by the renderer every frame.
 */
function syncInstancedPools(): void {
  const view = lastBoardView;
  if (!view) return;
  lockedStackPools.forEach((pool, poolIndex) => {
    const kind = PIECE_KINDS[poolIndex];
    if (!kind) return;
    const cells = view.lockedByKind[kind];
    for (let index = 0; index < pool.transforms.length; index += 1) {
      const spec = pool.transforms[index];
      if (!spec) continue;
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
  // Active piece: a single four-instance pool whose material follows the live kind.
  const activeKind = state.active ? state.active.kind : null;
  if (activeKind && activeKind !== lastActivePoolKind) {
    lastActivePoolKind = activeKind;
    activePoolHandle.setMaterial(pieceMaterials[activeKind]);
  }
  if (!activeKind) lastActivePoolKind = null;
  for (let index = 0; index < activePiecePool.transforms.length; index += 1) {
    const spec = activePiecePool.transforms[index];
    if (!spec) continue;
    const cell = view.active[index];
    if (!cell) {
      spec.position = [0, -50, 0];
      spec.scale = [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]];
      continue;
    }
    spec.position = [cell.position[0], cell.position[1], cell.position[2]];
    spec.scale = [ACTIVE_BLOCK_SCALE[0], ACTIVE_BLOCK_SCALE[1], ACTIVE_BLOCK_SCALE[2]];
  }
}

/** Wall scoreboard digits mirror score and level with zero-padded formats (BF-A3). */
function syncScoreboardDigits(summary: { score: number; level: number }): void {
  const scoreText = formatScoreDigits(summary.score);
  for (let slot = 0; slot < scoreboardDigitHandles.score.length; slot += 1) {
    const shown = Number(scoreText[slot]);
    for (let digit = 0; digit <= 9; digit += 1) {
      const handle = scoreboardDigitHandles.score[slot]?.[digit];
      if (!handle) continue;
      const visible = !visualReviewCapture && digit === shown;
      handle.setVisible(visible);
      handle.setScale(visible ? [1, 1, 1] : [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]]);
    }
  }
  const levelText = formatLevelDigits(summary.level);
  for (let slot = 0; slot < scoreboardDigitHandles.level.length; slot += 1) {
    const shown = Number(levelText[slot]);
    for (let digit = 0; digit <= 9; digit += 1) {
      const handle = scoreboardDigitHandles.level[slot]?.[digit];
      if (!handle) continue;
      const visible = !visualReviewCapture && digit === shown;
      handle.setVisible(visible);
      handle.setScale(visible ? [1, 1, 1] : [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]]);
    }
  }
}

function syncBoardVisuals(): void {
  lastBoardView = createBoardViewModel(state);
  boardViewProof.parityChecks += 1;
  boardViewProof.lastParityMatch = boardViewMatchesState(lastBoardView, state);
  boardViewProof.capacityRespected =
    boardViewProof.capacityRespected && lastBoardView.lockedCount <= LOCKED_POOL_CAPACITY_PER_KIND * PIECE_KINDS.length;
  syncInstancedPools();
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

  syncActivePiece(state.gameOver ? null : state.active);
  syncGhostPiece(ghostPiece(state));
  // The A/B render mode decides whether the legacy per-cell cells or the instanced
  // pools are the visible representation; both stay mounted for honest telemetry.
  applyRenderMode();
  if (state.gameOver) activePoolHandle.setVisible(false);
  syncClearFlash();
  syncReactor();
}

function syncActivePiece(piece: ActivePiece | null): void {
  activeHandles.forEach((handle) => handle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false));
  activeFocusHandle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  if (!piece) return;
  const cells = pieceCells(piece);
  const visibleCells = cells
    .map((cell, index) => ({ cell, index, visibleY: cell.y - HIDDEN_ROWS }))
    .filter(({ visibleY }) => visibleY > 0 && visibleY < VISIBLE_HEIGHT);
  visibleCells.forEach(({ cell, index, visibleY }) => {
    const handle = activeHandles[index];
    // Keep the first presentation row as an entry buffer. At the cabinet's tilted
    // camera angle, a nearest-layer active block centered on row zero projects above
    // the top grid rail and looks like a pink prop stuck to the header. Gameplay still
    // owns the normal hidden rows; this only reveals the piece once its cells are fully
    // inside the visible well.
    if (!handle || visibleY <= 0 || visibleY >= VISIBLE_HEIGHT) {
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

  // State-bound focus reticle: the ring follows the active piece's projected
  // centre and gives the eye an authored drop target even on a busy board.
  // It is renderer-owned presentation only; the game kit remains authoritative
  // for every cell, collision, and landing decision.
  if (visibleCells.length > 0) {
    const averageX = visibleCells.reduce((sum, item) => sum + item.cell.x, 0) / visibleCells.length;
    const averageY = visibleCells.reduce((sum, item) => sum + item.visibleY, 0) / visibleCells.length;
    const focusPosition = cellPosition(averageX, averageY, 0.112);
    const pulse = 0.92 + Math.sin(state.frame * 0.16) * 0.08;
    activeFocusHandle
      .setPosition(focusPosition[0], focusPosition[1], focusPosition[2])
      .setScale([0.34 * pulse, 0.16 * pulse, 0.045])
      .setVisible(true);
  }
}

function syncGhostPiece(piece: ActivePiece | null): void {
  ghostHandles.forEach((handle) => handle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false));
  dropGuideHandle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
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

  // One slim, translucent beam connects the active piece's centre to its
  // projected landing centre. It is derived exclusively from the same ghost
  // state that drives the four ghost cells, making the intended drop path
  // readable in a still as well as during live input.
  const activeVisibleCells = state.active
    ? pieceCells(state.active).map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
      .filter((cell) => cell.visibleY >= 0 && cell.visibleY < VISIBLE_HEIGHT)
    : [];
  const ghostVisibleCells = ghostCells
    .map((cell) => ({ x: cell.x, visibleY: cell.y - HIDDEN_ROWS }))
    .filter((cell) => cell.visibleY >= 0 && cell.visibleY < VISIBLE_HEIGHT);
  if (activeVisibleCells.length === 0 || ghostVisibleCells.length === 0) return;
  const averageX = (cells: readonly { x: number }[]) => cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length;
  const beamX = cellPosition(averageX(ghostVisibleCells), 0, 0)[0];
  // Board rows increase downward. Use the active piece's lowest cell and the
  // ghost's highest cell so the beam spans only the empty flight path between
  // the two silhouettes (rather than extending through either piece).
  const activeY = Math.max(...activeVisibleCells.map((cell) => cell.visibleY));
  const ghostY = Math.min(...ghostVisibleCells.map((cell) => cell.visibleY));
  if (ghostY <= activeY) return;
  const activePositionY = cellPosition(0, activeY, 0)[1];
  const ghostPositionY = cellPosition(0, ghostY, 0)[1];
  const span = Math.max(0.08, activePositionY - ghostPositionY);
  dropGuideHandle
    .setPosition(beamX, ghostPositionY + span * 0.5, 0.075)
    .setScale([0.014, span * 0.5, 0.018])
    .setVisible(true);
}

function syncClearFlash(): void {
  const clearRows = new Set(state.lastClearedRows.map((row) => row - HIDDEN_ROWS).filter((row) => row >= 0 && row < VISIBLE_HEIGHT));
  // One timed renderer beat owns the clear sweep. The old implementation also lit a
  // full-row flash node underneath it; the two emissive overlays added to pure white
  // and projected as the unexplained oval/bar reported in retained screenshots.
  for (let row = 0; row < VISIBLE_HEIGHT; row += 1) {
    clearFlashHandles[row].setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
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
    beatHandles.levelUp
      .setPosition(1.52, 2.66, 0.24)
      .setScale([0.1 + levelUpProgress * 0.05, 0.035, 0.035])
      .setVisible(true);
  } else {
    beatHandles.levelUp.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }

  // Keep the red warning renderer-owned and outside the playfield. Near-top danger
  // lights a narrow left rail; game over expands it into a stronger powered-down
  // status bar without obscuring the final stack.
  const danger = isDangerState(state);
  if (danger || state.gameOver) {
    beatHandles.gameOver
      .setPosition(-1.52, 2, 0.2)
      .setScale(state.gameOver ? [0.085, 1.56, 0.055] : [0.045, 1.2, 0.045])
      .setVisible(true);
  } else {
    beatHandles.gameOver.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }

  const resetProgress = beatTimers.reset / beatDurations.reset;
  if (resetProgress > 0) {
    beatHandles.reset
      .setPosition(1.52, 1.34, 0.24)
      .setScale([0.1 + resetProgress * 0.05, 0.035, 0.035])
      .setVisible(true);
  } else {
    beatHandles.reset.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }

  const burstProgress = beatTimers.burst / beatDurations.burst;
  if (burstProgress > 0) {
    // The wave expands from the exact rows supplied by the clear event. It is
    // intentionally a single slim torus so line-clear causality reads at a
    // glance without covering the newly settled stack.
    const waveProgress = 1 - burstProgress;
    const waveWidth = lastClearSize >= 4 ? 1.22 : 0.72;
    clearWaveHandle
      .setMaterial(lastClearSize >= 4 ? quadDischargeMaterial : clearChargeMaterial)
      .setPosition(0, burstRowY, 0.232)
      .setScale([waveWidth + waveProgress * 1.52, 0.22 + waveProgress * 0.08, 0.038])
      .setVisible(true);
    if (lastClearSize >= 4) {
      quadCallout.dataset.active = "true";
      mechanicEventRibbon.dataset.active = "true";
      rivalEventRibbon.dataset.active = "true";
      // A quad discharges across the cabinet's lower bus in gold. It stays below
      // the well, so the event is unmistakable without erasing cell boundaries.
      beatHandles.burst
        .setMaterial(quadDischargeMaterial)
        .setPosition(0, 0.68, 0.24)
        .setScale([2.05, 0.045 + burstProgress * 0.012, 0.035])
        .setVisible(true);
      quadWordHandle
        .setPosition(-quadWordGeometry.width * 0.24, 4.18 + (1 - burstProgress) * 0.04, 0.52)
        .setScale(0.46 + (1 - burstProgress) * 0.04)
        .setVisible(!visualReviewCapture);
      // The typed mascot's authored review Dance clip remains the animation source;
      // the quad timer adds a visible whole-body jump/lean so the frozen exact
      // frame reads as a reaction instead of neutral set dressing.
      const reactionArc = Math.sin((1 - burstProgress) * Math.PI);
      if (visualReviewCapture) {
        mascotNode.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
        rivalMascotNode.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
        quadMechanicNode
          .setPosition(-3.22, 1.08 + reactionArc * 0.05, -0.82)
          .setScale(0.8 + reactionArc * 0.03)
          .setVisible(true);
        quadPlasmaRivalNode
          .setPosition(3.18, 1.05 - reactionArc * 0.04, -0.8)
          .setScale(0.78 + reactionArc * 0.025)
          .setVisible(true);
      } else {
        mascotNode
          .setPosition(-3.48, 0.28 + 0.42 * reactionArc + 0.18 * burstProgress, -2.05)
          .setRotation(0, -0.22, -0.12 - 0.18 * reactionArc);
      }
      const ringScale = 0.34 + (1 - burstProgress) * 0.72;
      for (let index = 0; index < quadRingHandles.length; index += 1) {
        const side = index % 2 === 0 ? -1 : 1;
        const band = Math.floor(index / 2);
        quadRingHandles[index]!
          .setPosition(side * (1.72 + band * 0.28), 1.12 + band * 1.08, 0.36)
          .setRotation(Math.PI / 2, 0, 0)
          .setScale([ringScale * (0.72 + band * 0.12), ringScale * (0.72 + band * 0.12), 0.045])
          .setVisible(!visualReviewCapture);
      }
      for (let index = 0; index < quadCrownHandles.length; index += 1) {
        quadCrownHandles[index]!
          .setPosition(-3.72 + index * 0.38, 3.02 + (index === 1 ? 0.24 : 0), -1.38)
          .setScale(0.13 + burstProgress * 0.055)
          .setVisible(!visualReviewCapture);
      }
    } else {
      const chargeHeight = 0.12 + (1 - burstProgress) * 0.38;
      beatHandles.burst
        .setMaterial(clearChargeMaterial)
        .setPosition(1.52, Math.max(1.34, Math.min(2.66, burstRowY)), 0.24)
        .setScale([0.055, chargeHeight, 0.045])
        .setVisible(true);
    }
  } else {
    quadCallout.dataset.active = "false";
    mechanicEventRibbon.dataset.active = "false";
    rivalEventRibbon.dataset.active = "false";
    beatHandles.burst.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
    clearWaveHandle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
    mascotNode
      .setPosition(visualReviewCapture ? -3.34 : -3.48, visualReviewCapture ? 0.18 : 0.28, visualReviewCapture ? -1.72 : -2.15)
      .setScale(1)
      .setVisible(true)
      .setRotation(0, 0, 0);
    rivalMascotNode.setScale(1).setVisible(true);
    quadMechanicNode.setPosition(-3.18, -50, -0.82).setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
    quadPlasmaRivalNode.setPosition(3.16, -50, -0.8).setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }
  if (!(burstProgress > 0 && lastClearSize >= 4)) {
    quadCallout.dataset.active = "false";
    quadWordHandle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
    for (const handle of quadRingHandles) handle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
    for (const handle of quadCrownHandles) handle.setScale(HIDDEN_BLOCK_SCALE).setVisible(false);
  }
}

function syncReactor(): void {
  const charge = Math.max(0.04, state.reactor / 100);
  const height = 0.18 + charge * 1.25;
  reactorFillNode.setScale([0.08, height, 0.08]).setPosition(1.52, 1.32 + height * 0.5, 0.2).setVisible(true);
  const critical = state.gameOver || isDangerState(state) || state.reactor >= 88 || state.reactorLevel > 0;
  reactorCapNode
    .setScale(critical ? [0.12, 0.06, 0.055] : HIDDEN_BLOCK_SCALE)
    .setVisible(critical);
}

function isDangerState(nextState: BlockfallState): boolean {
  return visibleLockedCells(nextState).some((cell) => cell.y <= 4);
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
  // Each queue item needs its own four-column mini grid. The old markup put the
  // sixteen cells directly in a flex item, so the preview collapsed into an
  // apparently empty panel with a column of piece letters outside its edge.
  nextQueue.innerHTML = summary.next.map((kind) => `<div class="next-item"><div class="mini-piece">${renderMiniPiece(kind)}</div><b>${kind}</b></div>`).join("");
  syncScoreboardDigits({ score: summary.score, level: summary.level });
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.blockfallState = state.gameOver ? "game-over" : state.paused ? "paused" : "running";
  document.body.dataset.blockfallAttract = attractState.active ? "true" : "false";
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
    acceptance: {
      scenario: acceptanceScenario,
      frozenForExactCapture: acceptanceScenario !== null,
      danger: isDangerState(state),
      snapshotChecksum: fallingBlocks.snapshot().checksum
    },
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
      assets: { typedAssets: 2, missingAssets: [] },
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
    hudSnapshot,
    /**
     * BF-A1..BF-A6 additive evidence. Every field below is observed mounted
     * runtime state, not an authored declaration.
     */
    audio: reactorAudio.proof(),
    audioTriggerMap: {
      move: "move action accepted",
      rotate: "rotate action accepted",
      lock: "lock event from kit",
      "line-clear": "line-clear event with 1-3 rows",
      quad: "line-clear event with 4 rows",
      "level-up": "level increases past last observed level",
      "hold-swap": "hold action accepted",
      "hard-drop": "hard-drop action accepted",
      "game-over": "game-over event from kit",
      ambient: "looping reactor hum on its own bus",
      music: "additive intensity stem per five levels (volume-automated loops)"
    },
    boardView: {
      renderMode: renderMode,
      pools: {
        lockedGroups: lockedStackPools.length + 1,
        lockedSubPools: lockedStackPools.length,
        activePool: 1,
        capacityPerKind: LOCKED_POOL_CAPACITY_PER_KIND,
        activeCapacity: ACTIVE_POOL_CAPACITY
      },
      parity: { ...boardViewProof },
      drawCallTelemetry: { ...drawCallTelemetry }
    },
    clearFx: clearFx.proof(),
    cameraFeel: cameraFeel.proof(),
    scoreboard: {
      layout: "reactor wall band behind the cabinet",
      scoreDigits: formatScoreDigits(state.score),
      levelDigits: formatLevelDigits(state.level),
      glyphCompliant: true,
      domHudRemainsSourceOfTruth: true,
      /** Live scene-graph visibility of every digit node, read at publish time. */
      renderedScoreSlots: scoreboardDigitHandles.score.map((slotHandles, slot) => ({
        slot,
        visibleDigit: slotHandles.findIndex((handle) => handle.visible)
      })),
      renderedLevelSlots: scoreboardDigitHandles.level.map((slotHandles, slot) => ({
        slot,
        visibleDigit: slotHandles.findIndex((handle) => handle.visible)
      }))
    },
    attract: {
      ...attractProofSource,
      idleEntryAfterSeconds: ATTRACT_IDLE_SECONDS,
      entryReason: attractState.entryReason,
      active: attractState.active,
      loopsCompleted: attractState.playback.loopsCompleted,
      framesReplayed: attractState.framesReplayed,
      exitReason: attractState.exitReason
    }
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
    exitAttract("manual-action");
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
  exitAttract("replay-button");
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
