import { DebugLineCanvasRenderer, DebugOverlay, PhysicsDebugAdapter, type DebugRenderLine } from "@galileo3d/debug";
import { PhysicsWorld, Shape } from "@galileo3d/physics";
import { Bounds3, PerspectiveCamera } from "@galileo3d/scene";

interface DebugBrowserResult {
  readonly status: "ready" | "error";
  readonly physicsLineCount?: number;
  readonly cameraLineCount?: number;
  readonly boundsLineCount?: number;
  readonly totalLineCount?: number;
  readonly overlaySections?: number;
  readonly overlayRows?: number;
  readonly baseBeforePixel?: readonly number[];
  readonly baseAfterDiagnosticsPixel?: readonly number[];
  readonly debugPhysicsPixel?: readonly number[];
  readonly debugCameraPixel?: readonly number[];
  readonly debugBoundsPixel?: readonly number[];
  readonly renderBounds?: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_DEBUG_BROWSER_TEST__?: DebugBrowserResult;
  }
}

try {
  const baseCanvas = requireCanvas("base");
  const baseContext = require2d(baseCanvas);
  const lineCanvas = requireCanvas("debug-lines");
  const lineContext = require2d(lineCanvas);

  drawBaseScene(baseContext, baseCanvas);
  const baseBeforePixel = readPixel(baseContext, 44, 46);

  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const body = world.createRigidBody({ type: "static", position: [-1.6, 0.6, 0] });
  world.createCollider(body, { shape: Shape.box(0.35, 0.35, 0.35) });
  const physicsLines = new PhysicsDebugAdapter().buildLines(world).map(lineFromPhysics);

  const camera = new PerspectiveCamera({ aspect: 1.5 });
  const cameraLines = buildCameraLines(camera);
  const boundsLines = buildBoundsLines(Bounds3.fromCenterSize([1.45, -0.3, 0], [0.7, 0.55, 0.2]));
  const allLines = [...physicsLines, ...cameraLines, ...boundsLines];

  const overlay = new DebugOverlay();
  overlay.setSection("Runtime", [
    { label: "physicsLines", value: physicsLines.length },
    { label: "cameraLines", value: cameraLines.length },
    { label: "boundsLines", value: boundsLines.length }
  ]);
  overlay.setSection("Frame", [
    { label: "diagnosticsMutateBase", value: false },
    { label: "debugPassExplicit", value: true }
  ]);
  renderOverlay(document.getElementById("overlay"), overlay);

  const baseAfterDiagnosticsPixel = readPixel(baseContext, 44, 46);

  lineContext.fillStyle = "rgb(7, 10, 14)";
  lineContext.fillRect(0, 0, lineCanvas.width, lineCanvas.height);
  const renderResult = new DebugLineCanvasRenderer().render(lineContext, allLines, {
    scale: 44,
    origin: [120, 82],
    lineWidth: 3
  });

  const snapshot = overlay.snapshot();
  window.__GALILEO3D_DEBUG_BROWSER_TEST__ = {
    status: "ready",
    physicsLineCount: physicsLines.length,
    cameraLineCount: cameraLines.length,
    boundsLineCount: boundsLines.length,
    totalLineCount: renderResult.lineCount,
    overlaySections: snapshot.sections.length,
    overlayRows: snapshot.sections.reduce((count, section) => count + section.rows.length, 0),
    baseBeforePixel,
    baseAfterDiagnosticsPixel,
    debugPhysicsPixel: readPixel(lineContext, 50, 41),
    debugCameraPixel: readPixel(lineContext, 120, 82),
    debugBoundsPixel: readPixel(lineContext, 168, 95),
    renderBounds: renderResult.bounds
  };
} catch (error) {
  window.__GALILEO3D_DEBUG_BROWSER_TEST__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
}

function drawBaseScene(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.fillStyle = "rgb(12, 17, 22)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgb(48, 118, 210)";
  context.fillRect(24, 26, 40, 40);
  context.fillStyle = "rgb(220, 170, 44)";
  context.fillRect(150, 105, 44, 18);
}

function lineFromPhysics(line: { readonly from: readonly [number, number, number]; readonly to: readonly [number, number, number]; readonly color: readonly [number, number, number, number] }): DebugRenderLine {
  return {
    from: line.from,
    to: line.to,
    color: [0.2, 0.95, 1, 1]
  };
}

function buildCameraLines(camera: PerspectiveCamera): readonly DebugRenderLine[] {
  const halfY = Math.tan(camera.fovYRadians / 2) * 1.15;
  const halfX = halfY * camera.aspect;
  const color: readonly [number, number, number, number] = [1, 0.82, 0.18, 1];
  return [
    { from: [0, 0, 0], to: [-halfX, halfY, 0], color },
    { from: [0, 0, 0], to: [halfX, halfY, 0], color },
    { from: [0, 0, 0], to: [-halfX, -halfY, 0], color },
    { from: [0, 0, 0], to: [halfX, -halfY, 0], color }
  ];
}

function buildBoundsLines(bounds: Bounds3): readonly DebugRenderLine[] {
  const z = 0;
  const min = bounds.min;
  const max = bounds.max;
  const color: readonly [number, number, number, number] = [0.95, 0.25, 0.82, 1];
  const a: readonly [number, number, number] = [min[0], min[1], z];
  const b: readonly [number, number, number] = [max[0], min[1], z];
  const c: readonly [number, number, number] = [max[0], max[1], z];
  const d: readonly [number, number, number] = [min[0], max[1], z];
  return [
    { from: a, to: b, color },
    { from: b, to: c, color },
    { from: c, to: d, color },
    { from: d, to: a, color }
  ];
}

function renderOverlay(host: HTMLElement | null, overlay: DebugOverlay): void {
  if (!host) {
    throw new Error("Debug overlay host is missing.");
  }
  host.innerHTML = "";
  for (const section of overlay.snapshot().sections) {
    const container = document.createElement("section");
    container.dataset.debugSection = section.title;
    const title = document.createElement("h2");
    title.textContent = section.title;
    container.append(title);
    for (const row of section.rows) {
      const div = document.createElement("div");
      div.dataset.debugRow = row.label;
      div.textContent = `${row.label}: ${String(row.value)}`;
      container.append(div);
    }
    host.append(container);
  }
}

function requireCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Missing canvas: ${id}`);
  }
  return canvas;
}

function require2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(`2D context unavailable for ${canvas.id}.`);
  }
  return context;
}

function readPixel(context: CanvasRenderingContext2D, x: number, y: number): readonly number[] {
  return Array.from(context.getImageData(x, y, 1, 1).data);
}
