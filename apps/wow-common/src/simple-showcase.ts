import { type Mat4 } from "/packages/scene/src/index.ts";
import {
  Renderer,
  type Bounds3,
  type EnvironmentLightingOptions,
  type RenderItem,
  type RendererCameraPolicy,
  type RendererPostProcessOptions,
  type RenderDeviceDiagnostics
} from "/packages/rendering/src/index.ts";
import { applyRouteChromeMode, routeRenderQuality } from "./route-quality";

export interface SimpleGraphicsFrame {
  readonly renderItems: readonly RenderItem[];
  readonly bounds: Bounds3;
  readonly cameraPolicy?: RendererCameraPolicy;
  readonly cameraFrameOptions?: {
    readonly paddingRatio?: number;
    readonly yawRadians?: number;
    readonly pitchRadians?: number;
  };
  readonly environmentLighting?: EnvironmentLightingOptions | false;
  readonly postprocess?: RendererPostProcessOptions | false;
}

export interface SimpleGraphicsShowcaseConfig {
  readonly appId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly labels: {
    readonly concept: string;
    readonly primitive: string;
    readonly api: string;
  };
  createFrame(timeSeconds: number): SimpleGraphicsFrame;
}

interface Runtime {
  readonly appId: string;
  readonly status: "loading" | "ready" | "running" | "error";
  readonly title: string;
  readonly subtitle: string;
  readonly concept: string;
  readonly primitive: string;
  readonly api: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly averageFrameMs: number;
  readonly textures: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
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
const MAX_PIXEL_RATIO = 1.5;
const MAX_RENDER_EDGE = 2160;

export async function startSimpleGraphicsShowcase(config: SimpleGraphicsShowcaseConfig): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${config.appId} requires #app and canvas#viewport.`);
  }
  const chromeHidden = applyRouteChromeMode();

  let renderSize = syncCanvasRenderSize(canvas);
  let renderer: Renderer | undefined;
  let diagnostics: RenderDeviceDiagnostics | undefined;
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastFrameMs = 0;
  let smoothedFrameMs = 0;
  let lastUi = 0;
  const startedAt = performance.now();

  const publish = (status: Runtime["status"], error?: string, force = false): void => {
    const runtime: Runtime = {
      appId: config.appId,
      status,
      title: config.title,
      subtitle: config.subtitle,
      concept: config.labels.concept,
      primitive: config.labels.primitive,
      api: config.labels.api,
      frameCount,
      drawCalls: diagnostics?.drawCalls ?? 0,
      fps,
      averageFrameMs: smoothedFrameMs || lastFrameMs,
      textures: diagnostics?.textures ?? 0,
      renderWidth: renderSize.width,
      renderHeight: renderSize.height,
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
    renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      clearColor: [0.012, 0.014, 0.018, 1],
      antialias: true
    });

    const resizeObserver = new ResizeObserver(() => {
      const nextSize = syncCanvasRenderSize(canvas);
      if (nextSize.width === renderSize.width && nextSize.height === renderSize.height) return;
      renderSize = nextSize;
      renderer?.resize(renderSize.width, renderSize.height);
    });
    resizeObserver.observe(canvas);

    const frame = (now: number): void => {
      if (!renderer) return;
      const before = performance.now();
      const seconds = (now - startedAt) / 1000;
      const scene = config.createFrame(seconds);
      diagnostics = renderer.render({
        renderItems: scene.renderItems,
        cameraPolicy: scene.cameraPolicy ?? "auto-frame",
        cameraFrameBounds: scene.bounds,
        cameraFrameOptions: scene.cameraFrameOptions ?? { paddingRatio: 0.18, yawRadians: -0.4, pitchRadians: -0.16 },
        environmentLighting: scene.environmentLighting ?? false,
        shadow: false,
        postprocess: scene.postprocess ?? false
      });
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
      publish(frameCount > 1 ? "running" : "ready");
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    publish("error", formatError(error));
  }
}

export function rotationYQuat(angle: number): readonly [number, number, number, number] {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

export function rotationZQuat(angle: number): readonly [number, number, number, number] {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}

export function simpleBounds(radius = 1.5): Bounds3 {
  return { min: [-radius, -radius, -radius], max: [radius, radius, radius] };
}

export function matrixIdentity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
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
        <div><dt>Concept</dt><dd>${escapeHtml(runtime.concept)}</dd></div>
        <div><dt>Primitive</dt><dd>${escapeHtml(runtime.primitive)}</dd></div>
        <div><dt>API</dt><dd>${escapeHtml(runtime.api)}</dd></div>
        <div><dt>FPS</dt><dd>${runtime.fps.toFixed(1)}</dd></div>
        <div><dt>Frames</dt><dd>${runtime.frameCount}</dd></div>
        <div><dt>Draw calls</dt><dd>${runtime.drawCalls}</dd></div>
        <div><dt>Render size</dt><dd>${runtime.renderWidth}x${runtime.renderHeight}</dd></div>
        <div><dt>Backend</dt><dd>${runtime.renderer}</dd></div>
        <div><dt>Avg frame</dt><dd>${runtime.averageFrameMs.toFixed(1)} ms</dd></div>
      </dl>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
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
