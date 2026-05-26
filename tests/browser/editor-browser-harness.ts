import { Ray, Vector3 } from "@aura3d/math";
import { Scene } from "@aura3d/scene";
import { EditorRuntime } from "@aura3d/editor-runtime";

interface EditorBrowserResult {
  readonly status: "ready" | "error";
  readonly pickedId?: string;
  readonly translatedX?: number;
  readonly selectedHierarchyId?: string | number;
  readonly flattenedHierarchy?: readonly string[];
  readonly inspectorPropertyCount?: number;
  readonly inspectorEditedName?: string;
  readonly undoName?: string;
  readonly redoName?: string;
  readonly playModeEditBlocked?: boolean;
  readonly snapshotUndoDepth?: number;
  readonly nonBlankPixels?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_EDITOR_BROWSER_TEST__?: EditorBrowserResult;
  }
}

function publish(result: EditorBrowserResult): void {
  window.__AURA3D_EDITOR_BROWSER_TEST__ = result;
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#editor-viewport");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) throw new Error("Editor viewport canvas is unavailable.");

  const scene = new Scene();
  const node = scene.createNode("editor-cube");
  scene.root.addChild(node);
  const child = scene.createNode("editor-child");
  node.addChild(child);

  const runtime = new EditorRuntime();
  runtime.setPickTargets([{ id: "editor-cube", node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } }]);
  const hit = runtime.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
  await runtime.translateTarget(node, { axis: "x", delta: 3 });
  runtime.select([child.id]);
  const hierarchy = runtime.describeHierarchy(scene.root);
  const selectedHierarchyId = hierarchy.children[0]?.children[0]?.selected ? hierarchy.children[0].children[0].id : undefined;
  const inspectorProperties = runtime.inspect(node);
  await runtime.editInspectedProperty(node, ["name"], "inspected-cube");
  const inspectorEditedName = node.name;
  await runtime.undo();
  const undoName = node.name;
  await runtime.redo();
  const redoName = node.name;
  const flattenedHierarchy = runtime.flattenHierarchy(scene.root).map((descriptor) => `${descriptor.depth}:${descriptor.name}:${descriptor.selected ? "selected" : "idle"}`);
  runtime.setMode("play");
  let playModeEditBlocked = false;
  try {
    await runtime.editInspectedProperty(node, ["visible"], false);
  } catch {
    playModeEditBlocked = true;
  }
  runtime.setMode("edit");
  const snapshot = runtime.snapshot();

  context.fillStyle = "#111827";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#22c55e";
  context.fillRect(50 + node.transform.position[0] * 4, 46, 28, 28);
  context.strokeStyle = "#f59e0b";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(64, 64);
  context.lineTo(104, 64);
  context.stroke();

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonBlankPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > 20 || pixels[index + 1] > 20 || pixels[index + 2] > 20) {
      nonBlankPixels += 1;
    }
  }

  publish({
    status: "ready",
    pickedId: hit?.target.id,
    translatedX: node.transform.position[0],
    selectedHierarchyId,
    flattenedHierarchy,
    inspectorPropertyCount: inspectorProperties.length,
    inspectorEditedName,
    undoName,
    redoName,
    playModeEditBlocked,
    snapshotUndoDepth: snapshot.undoDepth,
    nonBlankPixels
  });
} catch (error) {
  publish({
    status: "error",
    error: error instanceof Error ? error.message : String(error)
  });
}
