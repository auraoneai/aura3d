import {
  camera,
  game,
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
    __AURA3D_FALLING_BLOCKS_STARTER__?: FallingBlocksStarterEvidence;
  }
}

type Piece = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
type Cell = Piece | null;
type Board = readonly (readonly Cell[])[];
type KitState = ReturnType<typeof falling.snapshot>;

interface FallingBlocksStarterEvidence {
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

// kenneyPlatformerBlockGrass is a 1.962×2.0×1.962 m bevelled cube centred on
// its origin. CELL_SCALE brings it to one 0.24 m board cell; the slight fill
// reduction keeps a visible bevel gap between adjacent cells.
const CELL_SCALE = cellSize / 2;
const CELL_FILL_SCALE = 0.112;
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

const falling = game.fallingBlocks({
  width: boardWidth,
  height: boardHeight,
  hiddenRows,
  seed: 7,
  gravityFrames: 999,
  lockDelayFrames: 18
});
const routeEvents = game.eventLog({ label: "falling blocks starter events", maxEvents: 18 });
// HUD bindings as descriptor literals (the deprecated game.hud.* helpers are
// replaced by the createGame `hud` option + evidence channel sections).
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
];

setupPracticeBoard();

const evidenceMode = navigator.webdriver;
const blockfallGame = createGame({
  id: "falling-blocks-starter",
  target: "#app",
  autoStart: !evidenceMode,
  diagnostics: { overlay: true, performancePanel: true },
  scene: () => buildScene(falling.snapshot().board),
  input: inputOptions,
  hud: { theme: "arcade-neon", widgets: [] },
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
      "game-over": { id: "game-over", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.8 }
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
    sections: { fallingBlocksStarter: () => window.__AURA3D_FALLING_BLOCKS_STARTER__ ?? { status: "unbound" } },
    legacyGlobals: ["__AURA3D_FALLING_BLOCKS_STARTER__"]
  }
});
const app = blockfallGame.app;
const input = blockfallGame.input;
if (!input) throw new Error("create-aura3d falling-blocks-starter failed to create runtime-owned input.");

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

app.onFrame(({ dt }) => {
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

  tickAccumulator += dt;
  while (tickAccumulator >= 1 / 30) {
    recordKitEvents(falling.tick(1));
    tickAccumulator -= 1 / 30;
  }

  const state = falling.snapshot();
  rebuildSettledCells(state);
  renderBoard(state);
  renderHud(state);
  publishEvidence(state);
  previousBoard = state.board;
});

renderBoard(falling.snapshot());
renderHud(falling.snapshot());
publishEvidence(falling.snapshot());

// Keep browser evidence deterministic on software GPUs without replacing real
// keyboard input. The input controller receives each DOM event first; this
// handler then advances the same app.onFrame gameplay callback and presents one
// completed frame. Generated apps outside WebDriver retain continuous playback.
if (evidenceMode) {
  await app.ready();
  // Complete one real production frame for the exact-installed visual gate.
  // Software renderers may take seconds to drain this typed GLB scene, so keep
  // later input-contract reads free of synchronous GPU submissions.
  await app.stepAsync(0);
  const advanceFromKeyboard = () => {
    app.advance(1 / 60);
  };
  window.addEventListener("keydown", advanceFromKeyboard);
  window.addEventListener("keyup", advanceFromKeyboard);
}

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
  }
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
    model(assets.cabinetModel, { name: "typed arcade cabinet", castShadow: true })
      .position(1.9, 0.2, -0.7)
      .scale(0.2),
    // Dark glossy board backing sourced from the same typed block GLB.
    model(assets.blockCell, { name: "board glossy backplate", material: material.pbr({ color: "#0b0e18", roughness: 0.18, metalness: 0.55 }) })
      .position(0, boardCenterY, -0.16)
      .scale([1.42, 2.5, 0.03]),
    ...boardFrameNodes(),
    ...settledCellsNode(board),
    ...activeCellNodes(),
    ...flashRowNodes(),
    model(assets.blockCell, { name: "hold preview", material: material.neon({ color: "#b987d0", emissive: "#b987d0", emissiveIntensity: 0.5 }) })
      .position(-2.05, 1.92, 0.1)
      .scale(0.09)
      .runtime(game.runtimeNode("hold-preview", { tags: ["hold", "runtime"] }))
  ];

  // The neon-arcade look supplies the night-city sky gradient, key light,
  // fog and grade — no ambient fill, background override or debug overlay.
  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.orthographic({ position: [0.35, 0.75, 4.6], target: [0, boardCenterY, 0], orthographicSize: 2.9 }));
}

function boardFrameNodes(): AuraNodeInput[] {
  const rail = material.pbr({ color: FRAME_COLOR, roughness: 0.3, metalness: 0.5, emissive: FRAME_ACCENT, emissiveIntensity: 0.22 });
  const railThickness = 0.045; // 0.09 m rails around the 2.4 × 4.8 m well
  const railHeight = (visibleRows * cellSize) / 2 + railThickness;
  return [
    model(assets.blockCell, { name: "board frame left rail", material: rail })
      .position(boardOrigin.x - railThickness, boardCenterY, 0)
      .scale([railThickness, railHeight, 0.09]),
    model(assets.blockCell, { name: "board frame right rail", material: rail })
      .position(-boardOrigin.x + railThickness, boardCenterY, 0)
      .scale([railThickness, railHeight, 0.09]),
    model(assets.blockCell, { name: "board frame bottom rail", material: rail })
      .position(0, boardOrigin.y - railThickness, 0)
      .scale([0.69, railThickness, 0.09]),
    model(assets.blockCell, { name: "board frame top rail", material: rail })
      .position(0, boardTop + railThickness, 0)
      .scale([0.69, railThickness, 0.09])
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
    instances.model(assets.blockCell, {
      name: "settled board cells",
      transforms,
      colors,
      material: material.pbr({ color: "#ffffff", roughness: 0.22, metalness: 0.3 }),
      instancingAware: true
    })
  ];
}

function activeCellNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    model(assets.blockCell, { name: `active piece cell ${index}`, material: material.neon({ color: "#4de8ff", emissive: "#4de8ff", emissiveIntensity: 0.45 }) })
      .position(0, -50, 0.14)
      .scale(CELL_SCALE)
      .runtime(game.runtimeNode(`active-cell-${index}`, { tags: ["active-cell", "runtime"] }))
  );
}

// Line-clear flash is a model surface, not a particle pool: four instanced-GLB
// bars stretch across the board and pulse emissive while a clear animates.
function flashRowNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    model(assets.blockCell, { name: `line clear flash ${index}`, material: material.neon({ color: FRAME_ACCENT, emissive: FRAME_ACCENT, emissiveIntensity: 1.6 }) })
      .position(0, -50, 0.16)
      .scale([0.66, CELL_FILL_SCALE, 0.05])
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
  root.id = "falling-blocks-starter-hud";
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
  hudRoot.innerHTML = [
    `<strong>Aura3D Falling Blocks Starter</strong>`,
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
  window.__AURA3D_FALLING_BLOCKS_STARTER__ = {
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
      cellAsset: { id: "blockCell", url: assets.blockCell.url, metres: assets.blockCell.bounds },
      drawCalls: diagnostics.drawCalls
    },
    flash: { modelBased: true, activeRows: performance.now() < flashRows.until ? flashRows.rows : [] },
    evidence
  };
}
