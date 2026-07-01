import {
  camera,
  createAuraApp,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __AURA3D_FALLING_BLOCKS_STARTER__?: FallingBlocksStarterEvidence;
  }
}

type Piece = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
type Cell = Piece | null;

interface FallingBlocksStarterEvidence {
  readonly frame: number;
  readonly score: number;
  readonly lines: number;
  readonly checksum: string;
  readonly active: { readonly kind: Piece; readonly x: number; readonly y: number; readonly rotation: number } | null;
  readonly hold: Piece | null;
  readonly gameOver: boolean;
  readonly events: readonly string[];
  readonly lineClearProof: {
    readonly lines: number;
    readonly events: readonly string[];
    readonly checksum: string;
  };
  readonly evidence: unknown;
}

const boardWidth = 10;
const boardHeight = 22;
const hiddenRows = 2;
const cellSize = 0.24;
const boardOrigin = { x: -1.2, y: -2.18 };
const pieceColors: Record<Piece, string> = {
  I: "#5ed7df",
  J: "#7fa5df",
  L: "#dfbd65",
  O: "#dccf78",
  S: "#84d09a",
  T: "#b987d0",
  Z: "#d88791"
};
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
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }],
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
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }]
  ]
};

const input = game.input({
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
});

const falling = game.fallingBlocks({
  width: boardWidth,
  height: boardHeight,
  hiddenRows,
  seed: 7,
  gravityFrames: 999,
  lockDelayFrames: 18
});
const routeEvents = game.eventLog({ label: "falling blocks starter events", maxEvents: 18 });
const hud = game.hud.bindings([
  game.hud.score({ valuePath: "appState.score" }),
  game.hud.objective({ valuePath: "appState.objective" }),
  game.hud.eventLog({ valuePath: "appState.events" })
]);
const lineClearProof = createLineClearProof();

setupPracticeBoard();

const app = createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: buildScene()
});

const boardNodes = Array.from({ length: boardHeight - hiddenRows }, (_, rowIndex) =>
  Array.from({ length: boardWidth }, (_, x) => app.nodes.require(`board-cell-${x}-${rowIndex + hiddenRows}`))
);
const activeNodes = Array.from({ length: 4 }, (_, index) => app.nodes.require(`active-cell-${index}`));
const holdNode = app.nodes.require("hold-preview");
const hudRoot = createHud();
let objective = "Clear the prepared line. Move, rotate, hold, or hard drop.";
let tickAccumulator = 0;

app.onFrame(({ dt }: { readonly dt: number }) => {
  input.update(dt);
  if (input.pressed("reset")) {
    setupPracticeBoard();
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
  renderBoard(state);
  renderHud(state);
  publishEvidence(state);
});

renderBoard(falling.snapshot());
renderHud(falling.snapshot());
publishEvidence(falling.snapshot());

function recordKitEvents(state: ReturnType<typeof falling.snapshot>): void {
  for (const event of state.events) {
    routeEvents.push({
      type: event.type,
      label: event.piece ? `${event.type}:${event.piece}` : event.type,
      severity: event.type === "line-clear" ? "success" : event.type === "game-over" ? "warning" : "info",
      frame: event.frame
    });
    if (event.type === "line-clear") objective = `Line clear. ${state.lines} line cleared. Press R to replay.`;
    if (event.type === "hold") objective = "Held piece. Press R or continue.";
    if (event.type === "rotate") objective = "Rotation accepted.";
    if (event.type === "move") objective = "Move accepted.";
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

function buildScene() {
  const nodes: AuraNodeInput[] = [
    model(assets.cabinetModel, { name: "typed arcade cabinet", castShadow: true })
      .position(1.75, 0.28, -0.55)
      .scale(0.2),
    primitives.box({ name: "falling blocks board backplate", material: material.pbr({ color: "#172027", roughness: 0.82, metallic: 0.04 }) })
      .position(0, 0, -0.08)
      .scale([2.76, 5.25, 0.08]),
    primitives.box({ name: "falling blocks board frame", material: material.neon({ color: "#8ee8d5", emissive: "#8ee8d5", emissiveIntensity: 0.22 }) })
      .position(0, 0, -0.02)
      .scale([2.92, 5.42, 0.04]),
    ...boardCellNodes(),
    ...activeCellNodes(),
    primitives.box({ name: "hold preview", material: material.neon({ color: "#b987d0", emissive: "#b987d0", emissiveIntensity: 0.38 }) })
      .position(-2.02, 1.92, 0.08)
      .scale([0.42, 0.42, 0.16])
      .runtime(game.runtimeNode("hold-preview", { tags: ["hold", "runtime"] }))
  ];

  return scene()
    .background("#06090d")
    .addMany(nodes)
    .add(lights.ambient({ name: "blockfall ambient", intensity: 0.36, color: "#e8fbff" }))
    .add(lights.directional({ name: "blockfall key", position: [3.8, 6.2, 5], intensity: 1.15, color: "#ffffff" }))
    .camera(camera.perspective({ position: [0.25, 1.2, 7.2], target: [0.1, 0.1, 0], fov: 38 }));
}

function boardCellNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (let y = hiddenRows; y < boardHeight; y += 1) {
    for (let x = 0; x < boardWidth; x += 1) {
      nodes.push(
        primitives.box({ name: `board cell ${x} ${y}`, material: material.pbr({ color: "#dccf78", roughness: 0.62, metallic: 0.02 }) })
          .position(...cellPosition(x, y), 0)
          .scale([cellSize * 0.86, cellSize * 0.86, 0.12])
          .runtime(game.runtimeNode(`board-cell-${x}-${y}`, { tags: ["board-cell", "runtime"] }))
      );
    }
  }
  return nodes;
}

function activeCellNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    primitives.box({ name: `active piece cell ${index}`, material: material.neon({ color: "#5ed7df", emissive: "#5ed7df", emissiveIntensity: 0.4 }) })
      .position(-3, -3, 0.12)
      .scale([cellSize * 0.92, cellSize * 0.92, 0.16])
      .runtime(game.runtimeNode(`active-cell-${index}`, { tags: ["active-cell", "runtime"] }))
  );
}

function renderBoard(state: ReturnType<typeof falling.snapshot>): void {
  for (let y = hiddenRows; y < boardHeight; y += 1) {
    for (let x = 0; x < boardWidth; x += 1) {
      const node = boardNodes[y - hiddenRows][x];
      const cell = state.board[y][x];
      node.setVisible(Boolean(cell)).setPosition(...cellPosition(x, y), 0);
    }
  }

  activeNodes.forEach((node) => node.setVisible(false));
  if (state.active) {
    const cells = activeShapes[state.active.kind][state.active.rotation] ?? activeShapes[state.active.kind][0];
    cells.forEach((cell, index) => {
      const x = state.active!.x + cell.x;
      const y = state.active!.y + cell.y;
      activeNodes[index]
        .setVisible(y >= hiddenRows)
        .setPosition(...cellPosition(x, y), 0.14)
        .setScale([cellSize * 0.94, cellSize * 0.94, 0.16]);
    });
  }
  holdNode.setVisible(Boolean(state.hold));
}

function cellPosition(x: number, y: number): [number, number] {
  return [
    boardOrigin.x + (x + 0.5) * cellSize,
    boardOrigin.y + (boardHeight - hiddenRows - (y - hiddenRows) - 0.5) * cellSize
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
    "background:rgba(3,9,14,0.78)",
    "border:1px solid rgba(125,220,235,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(state: ReturnType<typeof falling.snapshot>): void {
  hudRoot.innerHTML = [
    `<strong>Aura3D Falling Blocks Starter</strong>`,
    `<div>Score ${state.score} | Lines ${state.lines} | Level ${state.level}</div>`,
    `<div>Active ${state.active?.kind ?? "--"} | Hold ${state.hold ?? "--"} | Checksum ${state.checksum.slice(0, 8)}</div>`,
    `<div>${objective}</div>`,
    `<div>Move arrows/A-D. Rotate W/Q. Drop Space. Hold C. Reset R.</div>`
  ].join("");
}

function publishEvidence(state: ReturnType<typeof falling.snapshot>): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud,
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
  window.__AURA3D_FALLING_BLOCKS_STARTER__ = {
    frame: state.frame,
    score: state.score,
    lines: state.lines,
    checksum: state.checksum,
    active: state.active,
    hold: state.hold,
    gameOver: state.gameOver,
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    lineClearProof,
    evidence
  };
}

function createLineClearProof(): FallingBlocksStarterEvidence["lineClearProof"] {
  const proof = game.fallingBlocks({ width: boardWidth, height: boardHeight, hiddenRows, seed: 7, gravityFrames: 999 });
  proof.setBoard(createPracticeBoard());
  proof.setActive({ kind: "I", x: 3, y: boardHeight - 3, rotation: 0 });
  const cleared = proof.hardDrop();
  return {
    lines: cleared.lines,
    events: cleared.events.map((event) => event.piece ? `${event.type}:${event.piece}` : event.type),
    checksum: cleared.checksum
  };
}
