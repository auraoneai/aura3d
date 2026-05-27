import type { RenderDeviceDiagnostics } from "/packages/rendering/src/index.ts";
import { applyRouteChromeMode, routeRenderQuality } from "./route-quality";

export type WebGPUShowcaseStatus = "loading" | "ready" | "running" | "unsupported" | "error";

export interface WebGPUShowcaseRuntime {
  readonly appId: string;
  readonly status: WebGPUShowcaseStatus;
  readonly title: string;
  readonly subtitle: string;
  readonly requestedBackend: "webgpu" | "auto";
  readonly selectedBackend: "webgpu" | "webgl2" | "none";
  readonly backend: "a3d-webgpu" | "a3d-webgl2" | "none";
  readonly adapterName: string;
  readonly deviceAvailable: boolean;
  readonly unsupportedReason: string;
  readonly capabilities: readonly string[];
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly averageFrameMs: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly nativeSubmissions: number;
  readonly nativeTextureBindings: number;
  readonly nativePbrSubmissions: number;
  readonly renderTargets: number;
  readonly textures: number;
  readonly readbackMode?: string;
  readonly comparison?: string;
  readonly error?: string;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
}

export interface WebGPUShowcaseRenderResult {
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly readbackMode?: string;
  readonly comparison?: string;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
}

export interface WebGPUShowcaseScene {
  readonly requestedBackend?: "webgpu" | "auto";
  readonly selectedBackend?: "webgpu" | "webgl2";
  readonly adapterName?: string;
  readonly capabilities?: readonly string[];
  render(timeSeconds: number, renderSize: { readonly width: number; readonly height: number }): Promise<WebGPUShowcaseRenderResult>;
  resize?(width: number, height: number): void;
  dispose?(): void;
}

export interface WebGPUShowcaseConfig {
  readonly appId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly labels: {
    readonly concept: string;
    readonly workload: string;
    readonly api: string;
  };
  setup(context: {
    readonly canvas: HTMLCanvasElement;
    readonly renderSize: { readonly width: number; readonly height: number };
  }): Promise<WebGPUShowcaseScene>;
}

declare global {
  interface Window {
    __a3dWowRuntime?: WebGPUShowcaseRuntime;
  }
}

const FALLBACK_WIDTH = 1440;
const FALLBACK_HEIGHT = 960;
const MAX_PIXEL_RATIO = 1.5;
const MAX_RENDER_EDGE = 2160;

export async function startWebGPUShowcase(config: WebGPUShowcaseConfig): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${config.appId} requires #app and canvas#viewport.`);
  }
  const chromeHidden = applyRouteChromeMode();

  let renderSize = syncCanvasRenderSize(canvas);
  let scene: WebGPUShowcaseScene | undefined;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastFrameMs = 0;
  let smoothedFrameMs = 0;
  let lastUi = 0;
  let readbackMode: string | undefined;
  let comparison: string | undefined;
  let fields: Readonly<Record<string, string | number | boolean>> | undefined;
  const startedAt = performance.now();

  const publish = (status: WebGPUShowcaseStatus, message?: string, force = false): void => {
    const runtime: WebGPUShowcaseRuntime = {
      appId: config.appId,
      status,
      title: config.title,
      subtitle: config.subtitle,
      requestedBackend: scene?.requestedBackend ?? "webgpu",
      selectedBackend: scene?.selectedBackend ?? (status === "unsupported" ? "none" : "webgpu"),
      backend: scene?.selectedBackend === "webgl2" ? "a3d-webgl2" : scene?.selectedBackend === "webgpu" ? "a3d-webgpu" : status === "unsupported" ? "none" : "a3d-webgpu",
      adapterName: scene?.adapterName ?? "unavailable",
      deviceAvailable: Boolean(scene?.selectedBackend === "webgpu"),
      unsupportedReason: status === "unsupported" ? message ?? "WebGPU is unavailable in this browser or device." : "",
      capabilities: scene?.capabilities ?? [],
      frameCount,
      drawCalls: diagnostics?.drawCalls ?? 0,
      fps,
      averageFrameMs: smoothedFrameMs || lastFrameMs,
      renderWidth: renderSize.width,
      renderHeight: renderSize.height,
      nativeSubmissions: diagnostics?.nativeSubmissions ?? 0,
      nativeTextureBindings: diagnostics?.nativeTextureBindings ?? 0,
      nativePbrSubmissions: diagnostics?.nativePbrSubmissions ?? 0,
      renderTargets: diagnostics?.renderTargets ?? 0,
      textures: diagnostics?.textures ?? 0,
      ...(readbackMode ? { readbackMode } : {}),
      ...(comparison ? { comparison } : {}),
      ...(message && status === "error" ? { error: message } : {}),
      ...(fields ? { fields } : {})
    };
    window.__a3dWowRuntime = runtime;
    (window as unknown as Record<string, WebGPUShowcaseRuntime>)[`__a3d${config.appId.replaceAll("-", "")}`] = runtime;
    const now = performance.now();
    if (!chromeHidden && (force || now - lastUi > 250)) {
      renderUi(root, runtime, config.labels);
      lastUi = now;
    }
  };

  publish("loading", undefined, true);

  try {
    scene = await config.setup({ canvas, renderSize });
  } catch (error) {
    const message = formatError(error);
    publish(isUnsupportedWebGPUError(error) ? "unsupported" : "error", message, true);
    return;
  }

  const resizeObserver = new ResizeObserver(() => {
    const nextSize = syncCanvasRenderSize(canvas);
    if (nextSize.width === renderSize.width && nextSize.height === renderSize.height) return;
    renderSize = nextSize;
    scene?.resize?.(renderSize.width, renderSize.height);
    publish(frameCount > 0 ? "running" : "ready", undefined, true);
  });
  resizeObserver.observe(canvas);

  const frame = async (now: number): Promise<void> => {
    if (!scene) return;
    const before = performance.now();
    try {
      const result = await scene.render((now - startedAt) / 1000, renderSize);
      diagnostics = result.diagnostics;
      readbackMode = result.readbackMode;
      comparison = result.comparison;
      fields = result.fields;
      frameCount += 1;
      fpsFrames += 1;
      if (fpsFrom === 0) fpsFrom = now;
      if (now - fpsFrom >= 500) {
        fps = fpsFrames * 1000 / (now - fpsFrom);
        fpsFrames = 0;
        fpsFrom = now;
      }
      lastFrameMs = performance.now() - before;
      smoothedFrameMs = smoothedFrameMs === 0 ? lastFrameMs : smoothedFrameMs * 0.86 + lastFrameMs * 0.14;
      publish(frameCount > 1 ? "running" : "ready", undefined, frameCount <= 2);
    } catch (error) {
      publish(isUnsupportedWebGPUError(error) ? "unsupported" : "error", formatError(error), true);
      return;
    }
    requestAnimationFrame((next) => void frame(next));
  };
  requestAnimationFrame((now) => void frame(now));

  window.addEventListener("pagehide", () => {
    scene?.dispose?.();
    resizeObserver.disconnect();
  }, { once: true });
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

function renderUi(root: HTMLElement, runtime: WebGPUShowcaseRuntime, labels: WebGPUShowcaseConfig["labels"]): void {
  const stateClass = runtime.status === "error" || runtime.status === "unsupported" ? "is-error" : "";
  const statusFields: Record<string, string | number | boolean> = {
    Concept: labels.concept,
    Workload: labels.workload,
    API: labels.api,
    Backend: runtime.backend,
    Adapter: runtime.adapterName,
    Frames: runtime.frameCount,
    FPS: runtime.fps.toFixed(1),
    "Draw calls": runtime.drawCalls,
    "Native submissions": runtime.nativeSubmissions,
    "Texture bindings": runtime.nativeTextureBindings,
    "Render targets": runtime.renderTargets,
    "Render size": `${runtime.renderWidth}x${runtime.renderHeight}`,
    "Avg frame": `${runtime.averageFrameMs.toFixed(1)} ms`,
    ...(runtime.readbackMode ? { Readback: runtime.readbackMode } : {}),
    ...(runtime.comparison ? { Comparison: runtime.comparison } : {}),
    ...(runtime.fields ?? {})
  };
  root.innerHTML = `
    <section class="hud ${stateClass}">
      <span class="state ${stateClass}">${escapeHtml(runtime.status)}</span>
      <h1>${escapeHtml(runtime.title)}</h1>
      <p>${escapeHtml(runtime.subtitle)}</p>
      <dl>
        ${Object.entries(statusFields).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
      ${runtime.unsupportedReason ? `<pre>${escapeHtml(runtime.unsupportedReason)}</pre>` : ""}
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

function isUnsupportedWebGPUError(error: unknown): boolean {
  const text = formatError(error);
  return /WEBGPU_|WebGPU|navigator\.gpu|webgpu context|requestAdapter|requestDevice|native render pipeline|texture-to-buffer/i.test(text);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
