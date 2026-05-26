import {
  buildAxesHelper,
  buildBoundsHelper,
  buildCameraFrustumHelper,
  buildDirectionalLightHelper,
  buildGridHelper,
  buildSkeletonHelper,
  type DebugRenderLine
} from "@aura3d/debug";
import { Geometry, UnlitMaterial, type RenderItem } from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dCurrentRoutesLinesHelpers?: CurrentRoutesLinesHelpersRuntime;
  }
}

interface CurrentRoutesLinesHelpersRuntime {
  readonly appId: "lines-helpers";
  readonly status: "ready" | "running" | "error";
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly helperCount: number;
  readonly lineCount: number;
  readonly renderer: "a3d-webgl2";
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "lines-helpers" as const;
const WIDTH = 1280;
const HEIGHT = 720;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const startedAt = performance.now();
  let runtime = createRuntime(startedAt, "ready");
  const publish = (): void => {
    window.__a3dCurrentRoutesLinesHelpers = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({
      backend: "webgl2",
      canvas,
      width: WIDTH,
      height: HEIGHT,
      clearColor: [0.006, 0.008, 0.012, 1],
      antialias: true,
      preserveDrawingBuffer: true
    });
    const helperSets = createHelperSets();
    const items = helperSets.map((helper) => ({
      geometry: geometryFromLines(helper.lines),
      material: new UnlitMaterial({ name: helper.id, color: helper.color }),
      label: helper.id
    }));
    const lineCount = helperSets.reduce((sum, helper) => sum + helper.lines.length, 0);
    let frameCount = 0;
    let lastUi = 0;

    const render = (now: number): void => {
      try {
        frameCount += 1;
        const diagnostics = renderer.render({
          cameraPolicy: "identity",
          renderItems: items.map((item, index) => ({
            ...item,
            modelMatrix: composeModelMatrix(Math.sin(now / 1700 + index) * 0.015, 0, 0)
          }))
        });
        runtime = createRuntime(startedAt, frameCount === 1 ? "ready" : "running", {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          helperCount: helperSets.length,
          lineCount
        });
        window.__a3dCurrentRoutesLinesHelpers = runtime;
        if (frameCount === 1 || now - lastUi > 250) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = createRuntime(startedAt, "error", { error: formatError(error), frameCount, helperCount: helperSets.length, lineCount });
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = createRuntime(startedAt, "error", { error: formatError(error) });
    publish();
  }
}

function createHelperSets(): readonly {
  readonly id: string;
  readonly color: readonly [number, number, number, number];
  readonly lines: readonly DebugRenderLine[];
}[] {
  return [
    {
      id: "grid-helper-lines",
      color: [0.48, 0.56, 0.68, 1],
      lines: buildGridHelper({ size: 1.5, divisions: 12, y: -0.62 })
    },
    {
      id: "axes-helper-lines",
      color: [0.95, 0.95, 0.95, 1],
      lines: buildAxesHelper({ size: 0.44, origin: [-0.72, -0.5, 0] })
    },
    {
      id: "bounds-helper-lines",
      color: [1, 0.72, 0.24, 1],
      lines: buildBoundsHelper({ min: [-0.28, -0.18, -0.1], max: [0.3, 0.28, 0.1] })
    },
    {
      id: "camera-frustum-helper-lines",
      color: [0.34, 0.76, 1, 1],
      lines: buildCameraFrustumHelper({ nearHalfWidth: 0.08, nearHalfHeight: 0.05, farHalfWidth: 0.32, farHalfHeight: 0.2, nearZ: 0.02, farZ: 0.3 })
    },
    {
      id: "directional-light-helper-lines",
      color: [1, 0.95, 0.38, 1],
      lines: buildDirectionalLightHelper({ origin: [0.55, 0.35, 0], direction: [-0.55, -0.8, 0.2], length: 0.5 })
    },
    {
      id: "skeleton-helper-lines",
      color: [0.7, 1, 0.64, 1],
      lines: buildSkeletonHelper([
        { id: "root", position: [-0.62, 0.06, 0] },
        { id: "spine", parentId: "root", position: [-0.5, 0.3, 0] },
        { id: "head", parentId: "spine", position: [-0.42, 0.52, 0] },
        { id: "arm", parentId: "spine", position: [-0.22, 0.18, 0] }
      ])
    }
  ];
}

function geometryFromLines(lines: readonly DebugRenderLine[]): Geometry {
  return Geometry.lineSegments(lines.flatMap((line) => [line.from, line.to]));
}

function composeModelMatrix(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function createRuntime(
  startedAt: number,
  status: CurrentRoutesLinesHelpersRuntime["status"],
  patch: Partial<Omit<CurrentRoutesLinesHelpersRuntime, "appId" | "status" | "renderer" | "elapsedMs">> = {}
): CurrentRoutesLinesHelpersRuntime {
  return {
    appId: APP_ID,
    status,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    helperCount: patch.helperCount ?? 0,
    lineCount: patch.lineCount ?? 0,
    renderer: "a3d-webgl2",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...(patch.error ? { error: patch.error } : {})
  };
}

function renderUi(root: HTMLElement, runtime: CurrentRoutesLinesHelpersRuntime): void {
  root.innerHTML = `
    <h1>CurrentRoutes Lines Helpers</h1>
    <p>Debug helper builders rendered as real A3D line-segment geometry through WebGL2.</p>
    <p>${runtime.helperCount} helpers · ${runtime.lineCount} line segments · ${runtime.drawCalls} draw calls · ${runtime.frameCount} frames</p>
    <span class="status">${escapeHtml(runtime.status)}</span>
    ${runtime.error ? `<p>${escapeHtml(runtime.error)}</p>` : ""}
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
