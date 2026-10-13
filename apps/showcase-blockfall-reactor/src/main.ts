// Blockfall Reactor — rebuilt on the falling-blocks-starter scaffold.
// Single code path: every URL (including ?scene=default) boots this module;
// the former legacy/v2 dispatcher is deleted.
import {
  camera,
  game,
  gameFeel,
  instances,
  looks,
  material,
  model,
  scene,
  type AuraColor,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle,
  type AuraTransformSpec
} from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the §7.7 arcade-neon HUD theme, the §6.11 dpad-2btn touch preset,
// game-sfx-core cues, and the juice event map (no route-local hit-stop).
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __aura3dGameSnapshot?: BlockfallReactorEvidence;
  }
}

type Piece = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
type Cell = Piece | null;
type Board = readonly (readonly Cell[])[];
type KitState = ReturnType<typeof falling.snapshot>;

interface BlockfallReactorEvidence {
  readonly framed: boolean;
  readonly frame: number;
  readonly score: number;
  readonly lines: number;
  readonly checksum: string;
  readonly active: { readonly kind: Piece; readonly x: number; readonly y: number; readonly rotation: number } | null;
  readonly hold: Piece | null;
  readonly gameOver: boolean;
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly board: {
    readonly width: number;
    readonly height: number;
    readonly visibleRows: number;
    readonly filledCells: number;
    readonly rendering: "instanced-model";
    readonly cellAsset: { readonly id: string; readonly url: string; readonly metres: readonly [number, number, number] };
    readonly drawCalls: number;
  };
  readonly flash: { readonly modelBased: boolean; readonly activeRows: readonly number[] };
  // Measured framing: the board subject's (well + rails bounds) projected
  // height as a fraction of screen height, from the C-22 camera
  // evidence's real view-projection matrix. Null when that evidence
  // carries no matrix (default boot mounts the stub camera controller,
  // whose viewProjection is empty) — never re-derived in the app.
  readonly framing: { readonly rig: string; readonly subjectScreenHeightFraction: number | null };
  // S11 audio evidence, read from the real GameAudio object every frame:
  // `requestedEvents` are the art/direction.ts audio[] events this route has
  // cued; `playedEvents` are those the sound object's own evidence reports
  // as actually-played nodes (suppressed cues never land there); the counts
  // and context fields are the sound object's, verbatim. GameAudio evidence
  // exposes no synth/asset cue split, so none is published.
  readonly audio: {
    readonly synthCues: number;
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly contextState: string;
    readonly unlocked: boolean;
  };
  readonly evidence: unknown;
}

const LOOK_ID = "neon-arcade" as const;
const boardWidth = 10;
const boardHeight = 22;
const hiddenRows = 2;
const visibleRows = boardHeight - hiddenRows;
const cellSize = 0.24;
const boardOrigin = { x: -1.2, y: -2.18 };
const boardTop = boardOrigin.y + visibleRows * cellSize;
const boardCenterY = (boardOrigin.y + boardTop) / 2;
const wellWidth = boardWidth * cellSize;
const wellHeight = visibleRows * cellSize;
const railSize = 0.09; // world-metre rail thickness around the 2.4 × 4.8 m well
const subjectWidth = wellWidth + 2 * railSize;
const subjectHeight = wellHeight + 2 * railSize;
// Orthographic half-height so the framed subject (well + rails, 4.98 m)
// fills ~0.65 of screen height — the centre of the retired framing
// spec's [0.55, 0.75] band — at any viewport aspect (orthographic height
// is aspect-independent; the starter's fixed 2.9 put the well at 0.83
// while its rendered surfaces covered far less, see below).
const ORTHOGRAPHIC_SIZE = subjectHeight / (2 * 0.65);

// Board surfaces (backplate, rails, cells, flash) are sized in world
// metres with `scaleMode: "world"`: the engine then renders
// scale × asset-bounds on each axis, so `worldScale*` converts a desired
// metre size into the node scale for the cubic crate. The starter's
// RENORM literals instead went through the default normalize-to-unit fit
// (rendered size = scale × 1.55 m regardless of asset size), which left
// the backplate and rails spanning only ~43% of the 4.8 m well and the
// settled practice rows as a ~5%-of-screen strip (lane 38422405739
// contact sheet: a tiny board in a black void). bs() now serves only the
// hold-preview stand-in, which keeps its authored starter size.
const RENORM = 1.082 / assets.quaterniusCubeCrate.bounds[1];
const bs = (n: number) => n * RENORM;
const CRATE_BOUNDS = assets.quaterniusCubeCrate.bounds;
const worldScale = (metres: number) => metres / CRATE_BOUNDS[1];
const worldScale3 = (x: number, y: number, z: number): [number, number, number] =>
  [x / CRATE_BOUNDS[0], y / CRATE_BOUNDS[1], z / CRATE_BOUNDS[2]];
// Active cells render at 96% of a 0.24 m board cell, settled cells at
// 92% — the slight fill reduction keeps a visible bevel gap.
const CELL_SCALE = worldScale(cellSize * 0.96);
const CELL_FILL_SCALE = worldScale(cellSize * 0.92);
const FLASH_MS = 280;

// Per-piece colours stay inside the neon-arcade palette family: the cyan
// accent plus its complementary saturated neon hues over the dark base.
const pieceColors: Record<Piece, AuraColor> = {
  I: "#4de8ff",
  J: "#7d9dd4",
  L: "#f4a259",
  O: "#ffd166",
  S: "#4ce8b0",
  T: "#b987d0",
  Z: "#ff5d7d"
};
const FRAME_COLOR: AuraColor = "#232c4d";
const FRAME_ACCENT: AuraColor = "#4de8ff";
const activeShapes: Record<Piece, readonly (readonly { readonly x: number; readonly y: number }[])[]> = {
  I: [
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
    [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
    [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]
  ],
  J: [
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }]
  ],
  L: [
    [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
  ],
  O: [
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]
  ],
  S: [
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
  ],
  T: [
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
  ],
  Z: [
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }]
  ]
};

const inputOptions = {
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    rotateRight: ["KeyW", "ArrowUp", "KeyX"],
    rotateLeft: ["KeyQ", "KeyZ"],
    softDrop: ["KeyS", "ArrowDown"],
    hardDrop: ["Space"],
    hold: ["KeyC", "ShiftLeft", "ShiftRight"],
    reset: ["KeyR"]
  },
  bufferMs: 100
} as const;

// Reactor retune: the starter pins gravityFrames 999 (pieces effectively do
// not fall unaided). The reactor well runs a real fall — one row per 150 kit
// frames (5 s at the 30 Hz tick below) with a 24-frame lock delay. Board
// dimensions stay at the standard 10 x 22 the framing math derives from, and
// the kit exposes no health knob, so no other kit values change.
const falling = game.fallingBlocks({
  width: boardWidth,
  height: boardHeight,
  hiddenRows,
  seed: 7,
  gravityFrames: 150,
  lockDelayFrames: 24
});
const routeEvents = game.eventLog({ label: "blockfall reactor events", maxEvents: 18 });
// HUD bindings as descriptor literals (the deprecated game.hud.* helpers are
// replaced by the createGame `hud` option + evidence channel sections).
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

// Latest published snapshot, read by the createGame evidence section below.
// `window.__aura3dGameSnapshot` stays the sole evidence global.
let latestSnapshot: BlockfallReactorEvidence | undefined;

setupPracticeBoard();

const blockfallGame = createGame({
  id: "blockfall-reactor",
  target: "#app",
  diagnostics: { overlay: true, performancePanel: true },
  scene: () => buildScene(falling.snapshot().board),
  input: inputOptions,
  hud: {
    theme: "arcade-neon",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "lines", kind: "score", anchor: "top-right", label: "LINES" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", dash: "softDrop", jump: "rotateRight", attack: "hardDrop" }
  },
  sound: {
    cues: {
      move: { id: "move", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.3 },
      rotate: { id: "rotate", asset: { url: sfxUrl("ui.toggle.01") }, volume: 0.35 },
      "hard-drop": { id: "hard-drop", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.6 },
      "line-clear": { id: "line-clear", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.8 },
      "game-over": { id: "game-over", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.8 },
      // art/direction.ts audio[] events (tile-lock / quad-clear / level-up /
      // reactor-hum) on the same sfx-pack asset mechanism as the cues above.
      "tile-lock": { id: "tile-lock", asset: { url: sfxUrl("impact.wood.light.00") }, volume: 0.5 },
      "quad-clear": { id: "quad-clear", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.85 },
      "level-up": { id: "level-up", asset: { url: sfxUrl("stinger.level-start.00") }, volume: 0.7 },
      "reactor-hum": { id: "reactor-hum", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.25, loop: true }
    }
  },
  juice: {
    "hard-drop": { hitStop: 0.03, shake: 0.25, rumble: { strong: 0.4, ms: 120 } },
    "line-clear": { flash: { color: "#5ed7df", peak: 0.22, ms: 240 }, punch: { fovDeg: 1.8, ms: 220 }, rumble: { weak: 0.5, ms: 200 } },
    "game-over": { flash: { color: "#d88791", peak: 0.3, ms: 400 }, vignette: { amount: 0.6, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { blockfallReactor: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = blockfallGame.app;
const input = blockfallGame.input;
if (!input) throw new Error("blockfall-reactor failed to create runtime-owned input.");
// Drive the createGame lifecycle the way the arena-shooter template does:
// start() transitions the session booting -> loading, starts the runtime,
// and ready() lands it in "playing" after the first presented draw. Without
// this the beacon state never leaves "booting" (the falling-blocks-starter
// template this route was rebuilt from omits the call too).
blockfallGame.start();
// Direction reactor-hum: the looping ambience bed, cued once at start. Pre-
// gesture it may be suppressed by the locked AudioContext; the published
// audio evidence reports that honestly (requested vs played).
void blockfallGame.sound?.cue("reactor-hum");

// Runtime handles are re-required after every setScene rebuild because the
// instanced settled board is mount-time data, not a mutable runtime spec.
let activeNodes: AuraRuntimeNodeHandle[] = [];
let flashNodes: AuraRuntimeNodeHandle[] = [];
let holdNode: AuraRuntimeNodeHandle | undefined;
mountRuntimeHandles();
const hudRoot = createHud();
let objective = "Clear the prepared line. Move, rotate, hold, or hard drop.";
let tickAccumulator = 0;
let settledSignature = settledCellsSignature(falling.snapshot().board);
let previousBoard: Board = falling.snapshot().board;
let flashRows: { readonly rows: readonly number[]; readonly until: number } = { rows: [], until: 0 };
let activeKind: Piece | null = null;
let holdKind: Piece | null = null;
// Direction audio[] events this route has cued, and the subset the sound
// object's evidence has reported as actually-played nodes (merged in
// publishEvidence from GameAudioEvidence.playingNodes).
const DIRECTION_AUDIO_EVENTS = new Set(["tile-lock", "line-clear", "quad-clear", "level-up", "reactor-hum"]);
const requestedAudioEvents = new Set<string>(["reactor-hum"]);
const playedAudioEvents = new Set<string>();
let previousLevel = 1;

function cueDirectionEvent(event: "tile-lock" | "quad-clear" | "level-up"): void {
  requestedAudioEvents.add(event);
  void blockfallGame.sound?.cue(event);
}

// F-08-1: a static rig presents the board framing, pitched ~10° about X off
// the authored spec (flag-off mounts the no-op stub controller; that spec
// stays the fallback). F-08-5: feel bus + GameFeel attach through app.time.
app.camera?.use(
  camera.rigs.static({
    position: [0.35, boardCenterY + 0.81, 4.6],
    target: [0, boardCenterY, 0],
    orthographicSize: ORTHOGRAPHIC_SIZE
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("puzzle");

app.onFrame(({ dt }) => {
  feel.update(dt * 1000);
  if (input.pressed("reset")) {
    setupPracticeBoard();
    flashRows = { rows: [], until: 0 };
    routeEvents.push({ type: "reset", label: "reset" });
    objective = "Clear the prepared line. Move, rotate, hold, or hard drop.";
  }
  if (input.pressed("left")) recordKitEvents(falling.move(-1));
  if (input.pressed("right")) recordKitEvents(falling.move(1));
  if (input.pressed("rotateRight")) recordKitEvents(falling.rotate(1));
  if (input.pressed("rotateLeft")) recordKitEvents(falling.rotate(-1));
  if (input.pressed("softDrop")) recordKitEvents(falling.softDrop());
  if (input.pressed("hold")) recordKitEvents(falling.hold());
  if (input.pressed("hardDrop")) recordKitEvents(falling.hardDrop());

  if (app.diagnostics().drawCalls > 0) {
    tickAccumulator += dt;
    while (tickAccumulator >= 1 / 30) {
      recordKitEvents(falling.tick(1));
      tickAccumulator -= 1 / 30;
    }
  }

  const state = falling.snapshot();
  if (app.diagnostics().drawCalls > 0) {
    rebuildSettledCells(state);
  }
  renderBoard(state);
  renderHud(state);
  publishEvidence(state);
  previousBoard = state.board;
});

renderBoard(falling.snapshot());
renderHud(falling.snapshot());
publishEvidence(falling.snapshot());


function recordKitEvents(state: KitState): void {
  for (const event of state.events) {
    routeEvents.push({
      type: event.type,
      label: event.piece ? `${event.type}:${event.piece}` : event.type,
      severity: event.type === "line-clear" ? "success" : event.type === "game-over" ? "warning" : "info",
      frame: event.frame
    });
    if (event.type === "line-clear") {
      objective = `Line clear. ${state.lines} line cleared. Press R to replay.`;
      // The kit reports the count, not the rows: the cleared rows are exactly
      // the rows that were full in the previous snapshot's board.
      const cleared = fullRows(previousBoard).filter((row) => row >= hiddenRows);
      flashRows = { rows: cleared, until: performance.now() + FLASH_MS };
    }
    if (event.type === "hold") objective = "Held piece. Press R or continue.";
    if (event.type === "rotate") objective = "Rotation accepted.";
    if (event.type === "move") objective = "Move accepted.";
    if (event.type === "move" || event.type === "rotate") void blockfallGame.sound?.cue(event.type);
    if (event.type === "hard-drop" || event.type === "line-clear" || event.type === "game-over") {
      blockfallGame.juice.fire(event.type);
      void blockfallGame.sound?.cue(event.type);
    }
    // Direction audio[] mapping from real kit events: a placed piece locks,
    // a 4-line clear is the quad, and the kit level (lines / 10 + 1) rising
    // is the level-up. line-clear itself is cued just above.
    if (event.type === "lock") cueDirectionEvent("tile-lock");
    if (event.type === "line-clear") {
      requestedAudioEvents.add("line-clear");
      if (event.lines === 4) cueDirectionEvent("quad-clear");
    }
  }
  if (state.level > previousLevel) cueDirectionEvent("level-up");
  previousLevel = state.level;
}

function setupPracticeBoard(): void {
  falling.reset(7);
  falling.setBoard(createPracticeBoard());
  falling.setActive({ kind: "I", x: 3, y: boardHeight - 3, rotation: 0 });
}

function createPracticeBoard(): Cell[][] {
  const board = Array.from({ length: boardHeight }, () => Array.from({ length: boardWidth }, () => null as Cell));
  board[boardHeight - 1] = board[boardHeight - 1].map((_, x) => (x >= 3 && x <= 6 ? null : "O"));
  board[boardHeight - 2][0] = "J";
  board[boardHeight - 2][9] = "L";
  return board;
}

function buildScene(board: Board) {
  const nodes: AuraNodeInput[] = [
    // Modular wall panel stands in for the arcade cabinet silhouette
    // (library approximation, #481 mapping); scale keeps the old height.
    model(assets.quaterniusWallModular, { name: "typed arcade cabinet", castShadow: true })
      .position(1.9, 0.2, -0.7)
      .scale(0.2),
    // Dark glossy board backing sourced from the same typed block GLB,
    // sized in world metres to the full subject (well + rails).
    model(assets.quaterniusCubeCrate, { name: "board glossy backplate", material: material.pbr({ color: "#0b0e18", roughness: 0.18, metalness: 0.55 }), scaleMode: "world" })
      .position(0, boardCenterY, -0.16)
      .scale(worldScale3(subjectWidth, subjectHeight, 0.06)),
    ...boardFrameNodes(),
    ...settledCellsNode(board),
    ...activeCellNodes(),
    ...flashRowNodes(),
    model(assets.quaterniusCubeCrate, { name: "hold preview", material: material.neon({ color: "#b987d0", emissive: "#b987d0", emissiveIntensity: 0.5 }) })
      .position(-2.05, 1.92, 0.1)
      .scale(bs(0.09))
      .runtime(game.runtimeNode("hold-preview", { tags: ["hold", "runtime"] }))
  ];

  // The neon-arcade look supplies the night-city sky gradient, key light,
  // fog and grade — no ambient fill, background override or debug overlay.
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.orthographic({ position: [0.35, 0.75, 4.6], target: [0, boardCenterY, 0], orthographicSize: ORTHOGRAPHIC_SIZE }));
}

function boardFrameNodes(): AuraNodeInput[] {
  const rail = material.pbr({ color: FRAME_COLOR, roughness: 0.3, metalness: 0.5, emissive: FRAME_ACCENT, emissiveIntensity: 0.22, practical: true });
  const railDepth = 0.18;
  const halfRail = railSize / 2;
  return [
    model(assets.quaterniusCubeCrate, { name: "board frame left rail", material: rail, scaleMode: "world" })
      .position(boardOrigin.x - halfRail, boardCenterY, 0)
      .scale(worldScale3(railSize, subjectHeight, railDepth)),
    model(assets.quaterniusCubeCrate, { name: "board frame right rail", material: rail, scaleMode: "world" })
      .position(-boardOrigin.x + halfRail, boardCenterY, 0)
      .scale(worldScale3(railSize, subjectHeight, railDepth)),
    model(assets.quaterniusCubeCrate, { name: "board frame bottom rail", material: rail, scaleMode: "world" })
      .position(0, boardOrigin.y - halfRail, 0)
      .scale(worldScale3(subjectWidth, railSize, railDepth)),
    model(assets.quaterniusCubeCrate, { name: "board frame top rail", material: rail, scaleMode: "world" })
      .position(0, boardTop + halfRail, 0)
      .scale(worldScale3(subjectWidth, railSize, railDepth))
  ];
}

// The settled board renders as ONE instanced bevelled-cube mesh: every filled
// cell is an instance of the typed block GLB tinted to its piece colour.
function settledCellsNode(board: Board): AuraNodeInput[] {
  const transforms: AuraTransformSpec[] = [];
  const colors: AuraColor[] = [];
  for (let y = hiddenRows; y < boardHeight; y += 1) {
    for (let x = 0; x < boardWidth; x += 1) {
      const cell = board[y]?.[x];
      if (!cell) continue;
      const [px, py] = cellPosition(x, y);
      transforms.push({ position: [px, py, 0], scale: CELL_FILL_SCALE });
      colors.push(pieceColors[cell]);
    }
  }
  if (transforms.length === 0) {
    // instances.* requires at least one transform; park a scale-0 dummy.
    transforms.push({ position: [0, -50, 0], scale: 0 });
    colors.push("#141828");
  }
  return [
    instances.model(assets.quaterniusCubeCrate, {
      name: "settled board cells",
      transforms,
      colors,
      material: material.pbr({ color: "#ffffff", roughness: 0.22, metalness: 0.3 }),
      scaleMode: "world",
      instancingAware: true
    })
  ];
}

function activeCellNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    model(assets.quaterniusCubeCrate, { name: `active piece cell ${index}`, material: material.neon({ color: "#4de8ff", emissive: "#4de8ff", emissiveIntensity: 0.45 }), scaleMode: "world" })
      .position(0, -50, 0.14)
      .scale(CELL_SCALE)
      .runtime(game.runtimeNode(`active-cell-${index}`, { tags: ["active-cell", "runtime"] }))
  );
}

// Line-clear flash is a model surface, not a particle pool: four instanced-GLB
// bars stretch across the board and pulse emissive while a clear animates.
function flashRowNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    model(assets.quaterniusCubeCrate, { name: `line clear flash ${index}`, material: material.neon({ color: FRAME_ACCENT, emissive: FRAME_ACCENT, emissiveIntensity: 1.6 }), scaleMode: "world" })
      .position(0, -50, 0.16)
      .scale(worldScale3(wellWidth, cellSize * 0.92, 0.1))
      .runtime(game.runtimeNode(`flash-row-${index}`, { tags: ["flash", "runtime"] }))
  );
}

function mountRuntimeHandles(): void {
  activeNodes = Array.from({ length: 4 }, (_, index) => app.nodes.require(`active-cell-${index}`));
  flashNodes = Array.from({ length: 4 }, (_, index) => app.nodes.require(`flash-row-${index}`));
  holdNode = app.nodes.require("hold-preview");
}

// The instanced settled mesh is mount-time data: rebuild the scene only when
// the settled board signature changes (lock, line clear, reset) — never on
// per-frame motion of the active piece.
function rebuildSettledCells(state: KitState): void {
  const signature = settledCellsSignature(state.board);
  if (signature === settledSignature) return;
  try {
    app.setScene(buildScene(state.board));
  } catch {
    // Frame submission can be pending during a mid-frame rebuild; retry on the
    // next frame instead of tearing down the gameplay callback.
    return;
  }
  settledSignature = signature;
  mountRuntimeHandles();
}

function settledCellsSignature(board: Board): string {
  const cells: string[] = [];
  for (let y = hiddenRows; y < boardHeight; y += 1) {
    for (let x = 0; x < boardWidth; x += 1) {
      const cell = board[y]?.[x];
      if (cell) cells.push(`${x}:${y}:${cell}`);
    }
  }
  return cells.join("|");
}

function fullRows(board: Board): number[] {
  const rows: number[] = [];
  for (let y = hiddenRows; y < boardHeight; y += 1) {
    if (board[y]?.every((cell) => cell !== null)) rows.push(y);
  }
  return rows;
}

function filledCellCount(board: Board): number {
  let count = 0;
  for (let y = hiddenRows; y < boardHeight; y += 1) {
    for (let x = 0; x < boardWidth; x += 1) {
      if (board[y]?.[x]) count += 1;
    }
  }
  return count;
}

function renderBoard(state: KitState): void {
  if (state.active) {
    const kind = state.active.kind;
    if (kind !== activeKind) {
      const activeMaterial = material.neon({ color: pieceColors[kind], emissive: pieceColors[kind], emissiveIntensity: 0.45 });
      activeNodes.forEach((node) => node.setMaterial(activeMaterial));
      activeKind = kind;
    }
    const cells = activeShapes[kind][state.active.rotation] ?? activeShapes[kind][0];
    activeNodes.forEach((node, index) => {
      const cell = cells[index];
      if (!cell) {
        node.setVisible(false);
        return;
      }
      const x = state.active!.x + cell.x;
      const y = state.active!.y + cell.y;
      const [px, py] = cellPosition(x, y);
      node.setVisible(y >= hiddenRows).setPosition(px, py, 0.14).setScale(CELL_SCALE);
    });
  } else {
    activeNodes.forEach((node) => node.setVisible(false));
  }

  const flashing = performance.now() < flashRows.until;
  flashNodes.forEach((node, index) => {
    const row = flashRows.rows[index];
    if (!flashing || row === undefined) {
      node.setVisible(false);
      return;
    }
    const [, py] = cellPosition(0, row);
    node.setVisible(true).setPosition(0, py, 0.16);
  });

  if (state.hold) {
    if (state.hold !== holdKind) {
      holdKind = state.hold;
      holdNode?.setMaterial(material.neon({ color: pieceColors[holdKind], emissive: pieceColors[holdKind], emissiveIntensity: 0.5 }));
    }
    holdNode?.setVisible(true);
  } else {
    holdNode?.setVisible(false);
  }
}

function cellPosition(x: number, y: number): [number, number] {
  return [
    boardOrigin.x + (x + 0.5) * cellSize,
    boardOrigin.y + (visibleRows - (y - hiddenRows) - 0.5) * cellSize
  ];
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "blockfall-reactor-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:310px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#f5fbff",
    "background:rgba(8,10,22,0.72)",
    "border:1px solid rgba(77,232,255,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(state: KitState): void {
  // C-24 kit widgets (declared in the createGame `hud` option) mirror the
  // same state the route-local panel below renders.
  blockfallGame.hud.set("score", state.score);
  blockfallGame.hud.set("lines", state.lines);
  blockfallGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Blockfall Reactor</strong>`,
    `<div>Score ${state.score} | Lines ${state.lines} | Level ${state.level}</div>`,
    `<div>Active ${state.active?.kind ?? "--"} | Hold ${state.hold ?? "--"} | Checksum ${state.checksum.slice(0, 8)}</div>`,
    `<div>${objective}</div>`,
    `<div>Move arrows/A-D. Rotate W/Q. Drop Space. Hold C. Reset R.</div>`
  ].join("");
}

function publishEvidence(state: KitState): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score: state.score,
      objective,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });
  const diagnostics = app.diagnostics();
  const snapshot: BlockfallReactorEvidence = {
    // Framed once the renderer is submitting draw calls for a board that
    // carries settled cells inside the fixed orthographic rig.
    framed: diagnostics.drawCalls > 0 && filledCellCount(state.board) > 0,
    frame: state.frame,
    score: state.score,
    lines: state.lines,
    checksum: state.checksum,
    active: state.active,
    hold: state.hold,
    gameOver: state.gameOver,
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    look: { id: LOOK_ID, category: "studio" },
    board: {
      width: boardWidth,
      height: boardHeight,
      visibleRows,
      filledCells: filledCellCount(state.board),
      rendering: "instanced-model",
      cellAsset: { id: "quaterniusCubeCrate", url: assets.quaterniusCubeCrate.url, metres: assets.quaterniusCubeCrate.bounds },
      drawCalls: diagnostics.drawCalls
    },
    flash: { modelBased: true, activeRows: performance.now() < flashRows.until ? flashRows.rows : [] },
    framing: framingEvidence(),
    audio: audioEvidence(),
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

// Projects the board subject bounds (well + rails, backplate back to rail
// front in z) through the camera evidence's view-projection matrix and
// reports the NDC height as a screen-height fraction. The default boot
// mounts the stub camera controller whose evidence carries an empty
// matrix, so the fraction is null there — measuring it would mean
// re-deriving the engine's projection in the app, which could drift from
// the matrix the renderer actually drew with.
function framingEvidence(): BlockfallReactorEvidence["framing"] {
  const cam = app.camera?.evidence?.();
  const vp = cam?.viewProjection;
  if (!cam || !vp || vp.length !== 16) {
    return { rig: cam?.rig ?? "unavailable", subjectScreenHeightFraction: null };
  }
  const min: readonly [number, number, number] = [boardOrigin.x - railSize, boardOrigin.y - railSize, -0.19];
  const max: readonly [number, number, number] = [-boardOrigin.x + railSize, boardTop + railSize, 0.09];
  let ndcMin = Infinity;
  let ndcMax = -Infinity;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const clipY = vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!;
        const clipW = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
        if (!Number.isFinite(clipY) || !Number.isFinite(clipW) || clipW === 0) {
          return { rig: cam.rig, subjectScreenHeightFraction: null };
        }
        const ndcY = clipY / clipW;
        ndcMin = Math.min(ndcMin, ndcY);
        ndcMax = Math.max(ndcMax, ndcY);
      }
    }
  }
  return { rig: cam.rig, subjectScreenHeightFraction: (ndcMax - ndcMin) / 2 };
}

function audioEvidence(): BlockfallReactorEvidence["audio"] {
  const sound = blockfallGame.sound?.evidence;
  // Actually-played nodes only: GameAudio keeps suppressed cues out of
  // playingNodes, so merging its cue ids can never claim a silent play.
  for (const node of sound?.playingNodes ?? []) {
    if (DIRECTION_AUDIO_EVENTS.has(node.cue)) playedAudioEvents.add(node.cue);
  }
  return {
    synthCues: sound?.synthCues ?? 0,
    requestedEvents: [...requestedAudioEvents].sort(),
    playedEvents: [...playedAudioEvents].sort(),
    playedCueCount: sound?.playedCueCount ?? 0,
    suppressedCueCount: sound?.suppressedCueCount ?? 0,
    contextState: sound?.contextState ?? "none",
    unlocked: sound?.unlocked ?? false
  };
}
