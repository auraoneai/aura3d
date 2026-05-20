import {
  createV8FlagshipViewer,
  listV8Environments,
  listV8FlagshipAssets,
  type V8EnvironmentId,
  type V8FlagshipAssetId,
  type V8FlagshipViewer,
  type V8Screenshot,
  type V8ViewerSnapshot
} from "../../../packages/engine/src/v8/index";

declare global {
  interface Window {
    __g3dV8FlagshipViewer?: V8FlagshipRuntime;
  }
}

interface V8FlagshipRuntime {
  readonly appId: "v8-flagship-viewer";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly snapshot?: V8ViewerSnapshot;
  readonly screenshot?: Pick<V8Screenshot, "mimeType" | "width" | "height"> & { readonly byteLength: number };
  readonly error?: string;
  orbit(deltaYaw: number, deltaPitch: number): void;
  resize(width: number, height: number): void;
  setEnvironment(id: V8EnvironmentId): Promise<void>;
  setAsset(id: V8FlagshipAssetId): Promise<void>;
  captureScreenshot(): V8Screenshot | undefined;
}

const APP_ID = "v8-flagship-viewer" as const;
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 960;
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_EDGE = 1920;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  let renderSize = syncCanvasRenderSize(canvas);

  let viewer: V8FlagshipViewer | undefined;
  let snapshot: V8ViewerSnapshot | undefined;
  let lastScreenshot: V8FlagshipRuntime["screenshot"] | undefined;
  let pendingRender = false;
  let pointer: { readonly x: number; readonly y: number } | undefined;
  let renderedReadyUi = false;

  const publish = (status: V8FlagshipRuntime["status"], error?: string, renderDom = false): void => {
    const runtime: V8FlagshipRuntime = {
      appId: APP_ID,
      status,
      statusLabel: status === "loading" ? "Loading" : status === "error" ? "Error" : status === "ready" ? "Ready" : "Running",
      ...(snapshot ? { snapshot } : {}),
      ...(lastScreenshot ? { screenshot: lastScreenshot } : {}),
      ...(error ? { error } : {}),
      orbit(deltaYaw, deltaPitch) {
        viewer?.orbit(deltaYaw, deltaPitch);
      },
      resize(width, height) {
        snapshot = viewer?.resize(width, height) ?? snapshot;
        publish(snapshot?.status ?? status, undefined, true);
      },
      async setEnvironment(id) {
        await viewer?.setEnvironment(id);
      },
      async setAsset(id) {
        await viewer?.setAsset(id);
      },
      captureScreenshot() {
        if (!viewer) return undefined;
        const screenshot = viewer.screenshot();
        lastScreenshot = summarizeScreenshot(screenshot);
        publish(snapshot?.status ?? "ready", undefined, true);
        return screenshot;
      }
    };
    window.__g3dV8FlagshipViewer = runtime;
    if (renderDom) renderUi(root, runtime);
  };

  publish("loading", undefined, true);
  try {
    viewer = await createV8FlagshipViewer({
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      origin: location.origin,
      assetId: "damaged-helmet",
      environmentId: "studio-small-08"
    });
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
    bindControls(root, () => viewer, (next) => {
      snapshot = next;
      publish(next.status, undefined, true);
    });
    const resizeObserver = new ResizeObserver(() => {
      const nextSize = syncCanvasRenderSize(canvas);
      if (nextSize.width === renderSize.width && nextSize.height === renderSize.height) return;
      renderSize = nextSize;
      snapshot = viewer?.resize(renderSize.width, renderSize.height) ?? snapshot;
      publish(snapshot?.status ?? "ready", undefined, true);
    });
    resizeObserver.observe(canvas);

    const frame = async (): Promise<void> => {
      if (!viewer || pendingRender) return;
      pendingRender = true;
      snapshot = await viewer.renderFrame();
      pendingRender = false;
      const renderDom = snapshot.status === "error" || !renderedReadyUi;
      publish(snapshot.status, snapshot.error, renderDom);
      if (snapshot.status === "ready" || snapshot.status === "running") renderedReadyUi = true;
      requestAnimationFrame(() => void frame());
    };
    requestAnimationFrame(() => void frame());
  } catch (error) {
    publish("error", formatError(error), true);
  }
}

function syncCanvasRenderSize(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width > 0 ? rect.width : FALLBACK_WIDTH;
  const cssHeight = rect.height > 0 ? rect.height : FALLBACK_HEIGHT;
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, MAX_RENDER_EDGE / Math.max(cssWidth * pixelRatio, cssHeight * pixelRatio));
  const width = Math.max(1, Math.round(cssWidth * pixelRatio * edgeScale));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio * edgeScale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function renderUi(root: HTMLElement, runtime: V8FlagshipRuntime): void {
  const snapshot = runtime.snapshot;
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>G3D V8 Flagship Viewer</h1>
        <p>${snapshot ? `${snapshot.asset.name} · ${snapshot.environment.label}` : "Loading local GLB and HDRI"}</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${runtime.statusLabel}</button>
    </section>
    <section class="metrics">
      <span>Frames<br><strong>${snapshot?.metrics.frameCount ?? 0}</strong></span>
      <span>Draw calls<br><strong>${snapshot?.metrics.drawCalls ?? 0}</strong></span>
      <span>Avg frame<br><strong>${snapshot?.metrics.averageFrameMs ?? 0} ms</strong></span>
      <span>Textures<br><strong>${snapshot?.metrics.textures ?? 0}</strong></span>
      <span>Asset load<br><strong>${snapshot?.loading.assetMs ?? 0} ms</strong></span>
      <span>Environment<br><strong>${snapshot?.environment.id ?? "pending"}</strong></span>
      <span>Exposure<br><strong>${snapshot?.environment.exposure.toFixed(2) ?? "0.00"}</strong></span>
      <span>Screenshots<br><strong>${snapshot?.screenshotCount ?? 0}</strong></span>
    </section>
    <section class="controls">
      <label>Asset
        <select id="asset-picker">${assetOptions(snapshot?.asset.id)}</select>
      </label>
      <label>Environment
        <select id="environment-picker">${environmentOptions(snapshot?.environment.id)}</select>
      </label>
      <label>Exposure
        <input id="exposure-control" type="range" min="0.35" max="2.2" step="0.01" value="${snapshot?.controls.exposure ?? 1}">
      </label>
      <label>Environment rotation
        <input id="environment-rotation-control" type="range" min="-3.14" max="3.14" step="0.01" value="${snapshot?.controls.environmentRotation ?? 0}">
      </label>
      <label>Roughness
        <input id="roughness-control" type="range" min="0.45" max="1.65" step="0.01" value="${snapshot?.controls.roughnessScale ?? 1}">
      </label>
      <label>Metallic
        <input id="metallic-control" type="range" min="0.35" max="1.65" step="0.01" value="${snapshot?.controls.metallicScale ?? 1}">
      </label>
      <label>Clearcoat
        <input id="clearcoat-control" type="range" min="0" max="0.6" step="0.01" value="${snapshot?.controls.clearcoatBoost ?? 0}">
      </label>
      <label>Background blur
        <input id="background-blur-control" type="range" min="0" max="1" step="0.01" value="${snapshot?.controls.backgroundBlur ?? 0.08}">
      </label>
      <label>Ground shadows
        <input id="shadows-control" type="checkbox" ${snapshot?.controls.shadows === false ? "" : "checked"}>
      </label>
      <label>Background
        <input id="background-control" type="checkbox" ${snapshot?.controls.backgroundVisible === false ? "" : "checked"}>
      </label>
    </section>
    <section class="button-row">
      <button id="orbit-left" type="button">Orbit left</button>
      <button id="orbit-right" type="button">Orbit right</button>
      <button id="orbit-up" type="button">Orbit up</button>
      <button id="orbit-down" type="button">Orbit down</button>
      <button id="zoom-in" type="button">Zoom in</button>
      <button id="zoom-out" type="button">Zoom out</button>
      <button id="screenshot-button" type="button">Screenshot</button>
    </section>
    <section class="diagnostics">
      <h2>Runtime</h2>
      <span>Backend<br><strong>${snapshot?.metrics.backend ?? "pending"}</strong></span>
      <span>Camera yaw<br><strong>${snapshot?.camera.yawRadians.toFixed(3) ?? "0.000"}</strong></span>
      <span>Camera zoom<br><strong>${snapshot?.camera.zoom.toFixed(3) ?? "1.000"}</strong></span>
      <span>Materials<br><strong>${snapshot?.asset.materialCount ?? 0}</strong></span>
      <span>Screenshot bytes<br><strong>${runtime.screenshot?.byteLength ?? 0}</strong></span>
      <span>Status<br><strong>${runtime.statusLabel}</strong></span>
      ${runtime.error || snapshot?.error ? `<span class="runtime-error">Error<br><strong>${escapeHtml(runtime.error ?? snapshot?.error ?? "")}</strong></span>` : ""}
    </section>
  `;
}

function bindControls(
  root: HTMLElement,
  getViewer: () => V8FlagshipViewer | undefined,
  onSnapshot: (snapshot: V8ViewerSnapshot) => void
): void {
  root.addEventListener("click", (event) => {
    const target = event.target;
    const viewer = getViewer();
    if (!(target instanceof HTMLElement) || !viewer) return;
    if (target.id === "orbit-left") viewer.orbit(-0.14, 0);
    if (target.id === "orbit-right") viewer.orbit(0.14, 0);
    if (target.id === "orbit-up") viewer.orbit(0, -0.09);
    if (target.id === "orbit-down") viewer.orbit(0, 0.09);
    if (target.id === "zoom-in") viewer.zoom(0.88);
    if (target.id === "zoom-out") viewer.zoom(1.12);
    if (target.id === "screenshot-button") {
      window.__g3dV8FlagshipViewer?.captureScreenshot();
    }
    onSnapshot(viewer.snapshot());
  });
  root.addEventListener("input", (event) => {
    const target = event.target;
    const viewer = getViewer();
    if (!(target instanceof HTMLInputElement) || !viewer) return;
    if (target.id === "exposure-control") viewer.updateControls({ exposure: Number(target.value) });
    if (target.id === "environment-rotation-control") viewer.updateControls({ environmentRotation: Number(target.value) });
    if (target.id === "roughness-control") viewer.updateControls({ roughnessScale: Number(target.value) });
    if (target.id === "metallic-control") viewer.updateControls({ metallicScale: Number(target.value) });
    if (target.id === "clearcoat-control") viewer.updateControls({ clearcoatBoost: Number(target.value) });
    if (target.id === "background-blur-control") viewer.updateControls({ backgroundBlur: Number(target.value) });
    if (target.id === "shadows-control") viewer.updateControls({ shadows: target.checked });
    if (target.id === "background-control") viewer.updateControls({ backgroundVisible: target.checked });
    onSnapshot(viewer.snapshot());
  });
  root.addEventListener("change", (event) => {
    const target = event.target;
    const viewer = getViewer();
    if (!(target instanceof HTMLSelectElement) || !viewer) return;
    if (target.id === "asset-picker") {
      void viewer.setAsset(target.value as V8FlagshipAssetId).then(() => onSnapshot(viewer.snapshot()));
    }
    if (target.id === "environment-picker") {
      void viewer.setEnvironment(target.value as V8EnvironmentId).then(() => onSnapshot(viewer.snapshot()));
    }
  });
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
  canvas.addEventListener("pointermove", (event) => handlers.onMove(event.clientX, event.clientY));
  canvas.addEventListener("pointerup", () => handlers.onEnd());
  canvas.addEventListener("pointercancel", () => handlers.onEnd());
}

function assetOptions(selected?: string): string {
  return listV8FlagshipAssets().map((asset) => (
    `<option value="${asset.id}" ${asset.id === selected ? "selected" : ""}>${asset.name}</option>`
  )).join("");
}

function environmentOptions(selected?: string): string {
  return listV8Environments().map((environment) => (
    `<option value="${environment.id}" ${environment.id === selected ? "selected" : ""}>${environment.label}</option>`
  )).join("");
}

function summarizeScreenshot(screenshot: V8Screenshot): V8FlagshipRuntime["screenshot"] {
  return {
    mimeType: screenshot.mimeType,
    width: screenshot.width,
    height: screenshot.height,
    byteLength: screenshot.dataUrl.length
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
