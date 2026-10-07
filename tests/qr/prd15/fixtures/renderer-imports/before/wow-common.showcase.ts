import {
  createCurrentRoutesFlagshipViewer,
  type CurrentRoutesEnvironmentId,
  type CurrentRoutesFlagshipAssetId,
  type CurrentRoutesFlagshipViewer,
  type CurrentRoutesViewerControls,
  type CurrentRoutesViewerSnapshot
} from "../../../packages/engine/src/threejs-example-parity/index";
import { applyRouteChromeMode, routeRenderQuality } from "./route-quality";

export interface WowShowcaseConfig {
  readonly appId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly assetId: CurrentRoutesFlagshipAssetId;
  readonly environmentId: CurrentRoutesEnvironmentId;
  readonly controls?: Partial<CurrentRoutesViewerControls>;
  readonly orbitSpeed?: number;
  readonly pitchDrift?: number;
}

interface Runtime {
  readonly appId: string;
  readonly status: "loading" | "ready" | "running" | "error";
  readonly title: string;
  readonly subtitle: string;
  readonly asset: string;
  readonly environment: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly averageFrameMs: number;
  readonly textures: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly loadMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

declare global {
  interface Window {
    __a3dWowRuntime?: Runtime;
  }
}

const FALLBACK_WIDTH = 1440;
const FALLBACK_HEIGHT = 960;
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_EDGE = 2160;
const PUBLIC_ASSET_ORIGIN = "https://cdn.jsdelivr.net/gh/auraoneai/aura3d@main";

export async function startWowShowcase(config: WowShowcaseConfig): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${config.appId} requires #app and canvas#viewport.`);
  }
  const chromeHidden = applyRouteChromeMode();

  let renderSize = syncCanvasRenderSize(canvas);
  let viewer: CurrentRoutesFlagshipViewer | undefined;
  let snapshot: CurrentRoutesViewerSnapshot | undefined;
  let pointer: { readonly x: number; readonly y: number } | undefined;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastUi = 0;
  let pendingFrame = false;
  const startedAt = performance.now();

  const publish = (status: Runtime["status"], error?: string, force = false): void => {
    const metrics = snapshot?.metrics;
    const runtime: Runtime = {
      appId: config.appId,
      status,
      title: config.title,
      subtitle: config.subtitle,
      asset: snapshot?.asset.name ?? config.assetId,
      environment: snapshot?.environment.label ?? config.environmentId,
      frameCount: metrics?.frameCount ?? 0,
      drawCalls: metrics?.drawCalls ?? 0,
      fps,
      averageFrameMs: metrics?.averageFrameMs ?? 0,
      textures: metrics?.textures ?? 0,
      renderWidth: renderSize.width,
      renderHeight: renderSize.height,
      loadMs: Math.round((snapshot?.loading.assetMs ?? 0) + (snapshot?.loading.rendererMs ?? 0)),
      renderer: "a3d-webgl2",
      ...(error ? { error } : {})
    };
    window.__a3dWowRuntime = runtime;
    (window as unknown as Record<string, Runtime>)[`__a3d${config.appId.replaceAll("-", "")}`] = runtime;
    const now = performance.now();
    if (!chromeHidden && (force || now - lastUi > 250)) {
      renderUi(root, runtime);
      lastUi = now;
    }
  };

  publish("loading", undefined, true);

  try {
    viewer = await createCurrentRoutesFlagshipViewer({
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      origin: publicAssetOrigin(),
      assetId: config.assetId,
      environmentId: config.environmentId
    });
    if (config.controls) viewer.updateControls(config.controls);
    bindCanvasOrbit(canvas, {
      onStart: (x, y) => {
        pointer = { x, y };
      },
      onMove: (x, y) => {
        if (!pointer || !viewer) return;
        viewer.orbit((x - pointer.x) * 0.006, (y - pointer.y) * 0.004);
        pointer = { x, y };
      },
      onEnd: () => {
        pointer = undefined;
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      const nextSize = syncCanvasRenderSize(canvas);
      if (nextSize.width === renderSize.width && nextSize.height === renderSize.height) return;
      renderSize = nextSize;
      snapshot = viewer?.resize(renderSize.width, renderSize.height) ?? snapshot;
      publish(snapshot?.status ?? "ready", undefined, true);
    });
    resizeObserver.observe(canvas);

    const frame = async (now: number): Promise<void> => {
      if (!viewer || pendingFrame) {
        requestAnimationFrame((next) => void frame(next));
        return;
      }
      pendingFrame = true;
      fpsFrames += 1;
      if (fpsFrom === 0) fpsFrom = now;
      if (now - fpsFrom >= 500) {
        fps = fpsFrames * 1000 / (now - fpsFrom);
        fpsFrames = 0;
        fpsFrom = now;
      }
      const seconds = (now - startedAt) / 1000;
      const orbitSpeed = config.orbitSpeed ?? 0.0035;
      const pitchDrift = config.pitchDrift ?? 0.00018;
      viewer.orbit(orbitSpeed, Math.sin(seconds * 0.7) * pitchDrift);
      snapshot = await viewer.renderFrame();
      pendingFrame = false;
      publish(snapshot.status, snapshot.error, snapshot.metrics.frameCount <= 2);
      requestAnimationFrame((next) => void frame(next));
    };
    requestAnimationFrame((now) => void frame(now));
  } catch (error) {
    publish("error", formatError(error), true);
  }
}

function publicAssetOrigin(): string {
  const configured = (window as unknown as { AURA3D_PUBLIC_ASSET_ORIGIN?: string }).AURA3D_PUBLIC_ASSET_ORIGIN;
  return configured ?? PUBLIC_ASSET_ORIGIN;
}

function syncCanvasRenderSize(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width > 0 ? rect.width : FALLBACK_WIDTH;
  const cssHeight = rect.height > 0 ? rect.height : FALLBACK_HEIGHT;
  const quality = routeRenderQuality({ maxPixelRatio: MAX_PIXEL_RATIO, maxRenderEdge: MAX_RENDER_EDGE });
  const pixelRatio = Math.min(quality.maxPixelRatio, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, quality.maxRenderEdge / Math.max(cssWidth * pixelRatio, cssHeight * pixelRatio));
  const width = Math.max(1, Math.round(cssWidth * pixelRatio * edgeScale));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio * edgeScale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function renderUi(root: HTMLElement, runtime: Runtime): void {
  root.innerHTML = `
    <section class="hud ${runtime.status === "error" ? "is-error" : ""}">
      <span class="state ${runtime.status === "error" ? "is-error" : ""}">${escapeHtml(runtime.status)}</span>
      <h1>${escapeHtml(runtime.title)}</h1>
      <p>${escapeHtml(runtime.subtitle)}</p>
      <dl>
        <div><dt>Asset</dt><dd>${escapeHtml(runtime.asset)}</dd></div>
        <div><dt>Environment</dt><dd>${escapeHtml(runtime.environment)}</dd></div>
        <div><dt>Frames</dt><dd>${runtime.frameCount}</dd></div>
        <div><dt>FPS</dt><dd>${runtime.fps.toFixed(1)}</dd></div>
        <div><dt>Draw calls</dt><dd>${runtime.drawCalls}</dd></div>
        <div><dt>Textures</dt><dd>${runtime.textures}</dd></div>
        <div><dt>Render size</dt><dd>${runtime.renderWidth}x${runtime.renderHeight}</dd></div>
        <div><dt>Avg frame</dt><dd>${runtime.averageFrameMs.toFixed(1)} ms</dd></div>
      </dl>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

function bindCanvasOrbit(
  canvas: HTMLCanvasElement,
  handlers: {
    readonly onStart: (x: number, y: number) => void;
    readonly onMove: (x: number, y: number) => void;
    readonly onEnd: () => void;
  }
): void {
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    handlers.onStart(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.buttons !== 1) return;
    handlers.onMove(event.clientX, event.clientY);
  });
  const end = (): void => handlers.onEnd();
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
