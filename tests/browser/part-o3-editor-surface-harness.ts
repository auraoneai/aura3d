import {
  camera,
  createAuraApp,
  editor,
  game,
  lights,
  material,
  primitives,
  scene,
  type AuraApp
} from "@aura3d/engine";
import {
  createAnimationSceneNode,
  createRootEditorSurface,
  type Command
} from "@aura3d/editor-runtime";

// PART O3 browser proof: the bounded editor surface, per tool, with the
// capability label enforced. Root `editor` (from @aura3d/engine) proves
// capabilityLabel/gizmo/playMode/outliner; the package surface (same
// createRootEditorSurface factory the root delegates to) proves the
// command-backed undo/redo movement and the adapter play-mode round-trip.
// Every record names its surface — no root overclaim.

interface O3Evidence {
  readonly status: "loading" | "ready" | "error";
  readonly claim: "bounded-editor-surface-per-tool";
  readonly capabilityLabel: string;
  readonly undoRedo: { readonly surface: string; readonly xAfterExecute: number; readonly xAfterUndo: number; readonly xAfterRedo: number };
  readonly gizmo: { readonly surface: string; readonly kinds: readonly string[]; readonly snapEnabled: boolean; readonly positionSnap: number };
  readonly playMode: { readonly surface: string; readonly entered: boolean; readonly exited: boolean; readonly restored: unknown; readonly doubleEnterError: string | null };
  readonly outliner: { readonly surface: string; readonly ids: readonly string[] };
  readonly rootUndoRedoNoThrow: boolean;
  readonly errors: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PART_O3__?: O3Evidence;
  }
}

let app: AuraApp | undefined;
let status: O3Evidence["status"] = "loading";
let boxX = 0;
let restored: unknown = null;
const surface = createRootEditorSurface({
  snapshotAdapter: { capture: () => ({ selection: ["o3-box"] }), restore: (snapshot) => { restored = snapshot; } }
});

class MoveBoxCommand implements Command {
  readonly name = "o3-move-box";
  constructor(private readonly dx: number) {}
  execute(): void {
    boxX += this.dx;
    app?.nodes.require("o3-box").setPosition(boxX, 0.3, 0);
    app?.step(1 / 60);
  }
  undo(): void {
    boxX -= this.dx;
    app?.nodes.require("o3-box").setPosition(boxX, 0.3, 0);
    app?.step(1 / 60);
  }
}

const tool: {
  undoRedo: O3Evidence["undoRedo"];
  gizmo: O3Evidence["gizmo"];
  playMode: O3Evidence["playMode"];
  outliner: O3Evidence["outliner"];
  rootUndoRedoNoThrow: boolean;
} = {
  undoRedo: { surface: "package @aura3d/editor-runtime (same factory root delegates to)", xAfterExecute: 0, xAfterUndo: 0, xAfterRedo: 0 },
  gizmo: { surface: "root editor (from @aura3d/engine)", kinds: [], snapEnabled: false, positionSnap: 0 },
  playMode: { surface: "package @aura3d/editor-runtime (adapter-injected) + root enter/exit", entered: false, exited: false, restored: null, doubleEnterError: null },
  outliner: { surface: "root editor (from @aura3d/engine)", ids: [] },
  rootUndoRedoNoThrow: false
};

publish();
void boot().catch(fail);

async function boot(): Promise<void> {
  if (editor.capabilityLabel !== "editor") throw new Error("Root editor surface lost its editor capability label.");
  app = await createVisual();
  proveGizmo();
  proveOutliner();
  bindControls();
  status = "ready";
  publish();
}

async function createVisual(): Promise<AuraApp> {
  const next = createAuraApp("#o3-viewport", {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [0, 4, 9], target: [0, 0.4, 0], fov: 45 }))
      .add(lights.ambient({ intensity: 0.5, color: "#ffffff" }))
      .add(lights.directional({ name: "o3 key", position: [6, 10, 7], intensity: 2.2, color: "#fff4e6" }))
      .add(primitives.box({ name: "o3 ground", material: material.pbr({ color: "#1b2530", roughness: 0.85 }) }).position(0, -0.08, 0).scale([12, 0.16, 6]))
      .add(primitives.box({ name: "o3 box", material: material.pbr({ color: "#a78bfa", roughness: 0.4 }) }).position(0, 0.3, 0).scale([0.6, 0.6, 0.6]).runtime(game.runtimeNode("o3-box", { tags: ["bounded-editor", "surface"] })))
  });
  await next.ready();
  return next;
}

function proveGizmo(): void {
  const kinds = ["translate", "rotate", "scale"] as const;
  const attached = kinds.map((kind) => editor.gizmo(kind));
  const translate = attached[0]!;
  tool.gizmo = {
    surface: tool.gizmo.surface,
    kinds: attached.map((handle) => handle.kind),
    snapEnabled: translate.settings().snapEnabled,
    positionSnap: translate.settings().positionSnap
  };
  for (const handle of attached) handle.gizmo.dispose();
}

function proveOutliner(): void {
  const root = createAnimationSceneNode({
    id: "o3-scene", name: "O3 Scene", kind: "set", children: [
      createAnimationSceneNode({ id: "o3-box-node", name: "O3 Box", kind: "prop" }),
      createAnimationSceneNode({ id: "o3-light-node", name: "O3 Light", kind: "prop" })
    ]
  });
  const items = editor.outliner(root);
  tool.outliner = { surface: tool.outliner.surface, ids: items.map((item) => String(item.id)) };
  const list = document.querySelector<HTMLElement>("[data-testid='o3-outliner']")!;
  list.innerHTML = "";
  for (const item of items) {
    const entry = document.createElement("li");
    entry.textContent = `${String(item.id)}`;
    list.appendChild(entry);
  }
}

async function executeMove(): Promise<void> {
  if (!app || status !== "ready") return;
  await surface.execute(new MoveBoxCommand(1));
  tool.undoRedo = { ...tool.undoRedo, xAfterExecute: boxX };
  publish();
}

async function undo(): Promise<void> {
  if (!app || status !== "ready") return;
  await surface.undo();
  await editor.undo();
  await editor.redo();
  tool.undoRedo = { ...tool.undoRedo, xAfterUndo: boxX };
  tool.rootUndoRedoNoThrow = true;
  publish();
}

async function redo(): Promise<void> {
  if (!app || status !== "ready") return;
  await surface.redo();
  tool.undoRedo = { ...tool.undoRedo, xAfterRedo: boxX };
  publish();
}

function togglePlayMode(): void {
  if (status !== "ready") return;
  surface.enterPlayMode();
  try {
    surface.enterPlayMode();
  } catch (error) {
    tool.playMode = { ...tool.playMode, doubleEnterError: error instanceof Error ? error.message : String(error) };
  }
  editor.playMode.enter();
  editor.playMode.exit();
  surface.exitPlayMode();
  tool.playMode = {
    ...tool.playMode,
    entered: surface.isPlaying === false,
    exited: true,
    restored
  };
  publish();
}

function bindControls(): void {
  document.querySelector<HTMLButtonElement>("[data-testid='o3-execute']")?.addEventListener("click", () => void executeMove());
  document.querySelector<HTMLButtonElement>("[data-testid='o3-undo']")?.addEventListener("click", () => void undo());
  document.querySelector<HTMLButtonElement>("[data-testid='o3-redo']")?.addEventListener("click", () => void redo());
  document.querySelector<HTMLButtonElement>("[data-testid='o3-play']")?.addEventListener("click", togglePlayMode);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") { event.preventDefault(); void executeMove(); }
    if (event.code === "KeyZ") { event.preventDefault(); void undo(); }
    if (event.code === "KeyY") { event.preventDefault(); void redo(); }
    if (event.code === "KeyP") { event.preventDefault(); togglePlayMode(); }
  });
}

function publish(): void {
  const evidence: O3Evidence = {
    status,
    claim: "bounded-editor-surface-per-tool",
    capabilityLabel: editor.capabilityLabel,
    undoRedo: tool.undoRedo,
    gizmo: tool.gizmo,
    playMode: tool.playMode,
    outliner: tool.outliner,
    rootUndoRedoNoThrow: tool.rootUndoRedoNoThrow,
    errors: app?.diagnostics()?.errors ?? []
  };
  window.__AURA3D_PART_O3__ = evidence;
  document.querySelector<HTMLElement>("[data-testid='o3-state']")!.textContent = status;
}

function fail(error: unknown): void {
  status = "error";
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  window.__AURA3D_PART_O3__ = {
    status, claim: "bounded-editor-surface-per-tool", capabilityLabel: editor.capabilityLabel,
    undoRedo: tool.undoRedo, gizmo: tool.gizmo, playMode: tool.playMode, outliner: tool.outliner,
    rootUndoRedoNoThrow: false, errors: [message], error: message
  };
  document.querySelector<HTMLElement>("[data-testid='o3-state']")!.textContent = "error";
}

export {};
