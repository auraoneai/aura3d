import {
  createCurrentRoutesFlagshipViewer,
  type CurrentRoutesFlagshipViewer,
  type CurrentRoutesScreenshot,
  type CurrentRoutesViewerSnapshot
} from "../../../packages/engine/src/threejs-example-parity/index";
import type { CinematicSceneIR } from "./cinematic-demo-fixtures";

declare global {
  interface Window {
    __a3dWowRuntime?: {
      readonly appId: string;
      readonly status: string;
      readonly title: string;
      readonly subtitle: string;
      readonly asset: string;
      readonly environment: string;
      readonly frameCount: number;
      readonly drawCalls: number;
      readonly fps: number;
      readonly averageFrameMs: number;
      readonly textures: number;
      readonly materials: number;
      readonly renderWidth: number;
      readonly renderHeight: number;
      readonly renderer: string;
      readonly backend: string;
      readonly cinematicScene?: CurrentRoutesViewerSnapshot["cinematicScene"];
      readonly error?: string;
    };
  }
}

export interface SceneViewportSnapshot {
  readonly status: "loading" | "ready" | "running" | "error";
  readonly renderer: string;
  readonly frameCount: number;
  readonly fps: number;
  readonly drawCalls: number;
  readonly textures: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly averageFrameMs: number;
  readonly camera?: CurrentRoutesViewerSnapshot["camera"];
  readonly cinematicScene?: CurrentRoutesViewerSnapshot["cinematicScene"];
  readonly error?: string;
}

export interface SceneViewportController {
  readonly setScene: (scene: CinematicSceneIR) => Promise<void>;
  readonly setPlaying: (playing: boolean) => void;
  readonly setTime: (seconds: number) => void;
  readonly captureScreenshot: () => CurrentRoutesScreenshot | undefined;
  readonly latestSnapshot: () => SceneViewportSnapshot;
}

export interface SceneViewportOptions {
  readonly canvas: HTMLCanvasElement;
  readonly initialScene: CinematicSceneIR;
  readonly onSnapshot: (snapshot: SceneViewportSnapshot) => void;
  readonly onTimeline: (seconds: number) => void;
  readonly onError: (message: string) => void;
}

const FALLBACK_WIDTH = 1440;
const FALLBACK_HEIGHT = 900;
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_EDGE = 2160;

export function createSceneViewport(options: SceneViewportOptions): SceneViewportController {
  let scene = options.initialScene;
  let viewer: CurrentRoutesFlagshipViewer | undefined;
  let latest = createLoadingSnapshot(options.canvas);
  let renderSize = syncCanvasRenderSize(options.canvas);
  let playing = true;
  let seconds = 0;
  let lastFrameAt = performance.now();
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let pendingFrame = false;
  let pointer: { readonly x: number; readonly y: number } | undefined;

  applySceneOverlay(scene, seconds);
  bindCanvasOrbit(options.canvas, {
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
    const nextSize = syncCanvasRenderSize(options.canvas);
    if (nextSize.width === renderSize.width && nextSize.height === renderSize.height) return;
    renderSize = nextSize;
    const snapshot = viewer?.resize(renderSize.width, renderSize.height);
    if (snapshot) publish(snapshot);
  });
  resizeObserver.observe(options.canvas);

  void initialize();

  const controller: SceneViewportController = {
    setScene: async (nextScene) => {
      scene = nextScene;
      applySceneOverlay(scene, seconds);
      if (!viewer) return;
      try {
        const current = viewer.snapshot();
        if (current.asset.id !== scene.assetId) {
          await viewer.setAsset(scene.assetId as Parameters<CurrentRoutesFlagshipViewer["setAsset"]>[0]);
        }
        if (current.environment.id !== scene.environmentId) {
          await viewer.setEnvironment(scene.environmentId as Parameters<CurrentRoutesFlagshipViewer["setEnvironment"]>[0]);
        }
        viewer.updateControls(scene.renderControls);
        publish(viewer.snapshot());
      } catch (error) {
        const message = formatError(error);
        options.onError(message);
        latest = { ...latest, status: "error", error: message };
        options.onSnapshot(latest);
      }
    },
    setPlaying: (nextPlaying) => {
      playing = nextPlaying;
      lastFrameAt = performance.now();
    },
    setTime: (nextSeconds) => {
      seconds = clamp(nextSeconds, 0, scene.shot.durationSeconds);
      updateTimelineControls();
      applySceneOverlay(scene, seconds);
    },
    captureScreenshot: () => viewer?.screenshot(),
    latestSnapshot: () => latest
  };

  return controller;

  async function initialize(): Promise<void> {
    try {
      viewer = await createCurrentRoutesFlagshipViewer({
        canvas: options.canvas,
        width: renderSize.width,
        height: renderSize.height,
        origin: location.origin,
        assetId: scene.assetId as Parameters<typeof createCurrentRoutesFlagshipViewer>[0]["assetId"],
        environmentId: scene.environmentId as Parameters<typeof createCurrentRoutesFlagshipViewer>[0]["environmentId"],
        cinematicScene: "rainy-neon-alley"
      });
      viewer.updateControls(scene.renderControls);
      publish(viewer.snapshot());
      requestAnimationFrame((now) => void frame(now));
    } catch (error) {
      const message = formatError(error);
      options.onError(message);
      latest = { ...latest, status: "error", error: message };
      options.onSnapshot(latest);
    }
  }

  async function frame(now: number): Promise<void> {
    if (!viewer || pendingFrame) {
      requestAnimationFrame((next) => void frame(next));
      return;
    }
    pendingFrame = true;
    const delta = Math.max(0, Math.min(0.1, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    if (playing) {
      seconds = (seconds + delta) % scene.shot.durationSeconds;
      updateTimelineControls();
    }
    fpsFrames += 1;
    if (fpsFrom === 0) fpsFrom = now;
    if (now - fpsFrom >= 500) {
      fps = fpsFrames * 1000 / (now - fpsFrom);
      fpsFrames = 0;
      fpsFrom = now;
    }
    const progress = scene.shot.durationSeconds > 0 ? seconds / scene.shot.durationSeconds : 0;
    const shotArc = Math.sin(progress * Math.PI * 2);
    const dolly = scene.camera.dolly === "out" ? 1 - progress : progress;
    viewer.updateControls({
      ...scene.renderControls,
      yaw: scene.renderControls.yaw + shotArc * 0.18,
      pitch: clamp(scene.renderControls.pitch + Math.sin(progress * Math.PI) * -0.08, -0.75, 0.75),
      target: [
        scene.renderControls.target[0] + shotArc * 0.18,
        scene.renderControls.target[1] + Math.sin(progress * Math.PI) * 0.1,
        scene.renderControls.target[2]
      ],
      zoom: clamp(scene.renderControls.zoom + dolly * 0.34, 0.28, 1.5)
    });
    applySceneOverlay(scene, seconds);
    const snapshot = await viewer.renderFrame();
    publish(snapshot);
    pendingFrame = false;
    requestAnimationFrame((next) => void frame(next));
  }

  function publish(snapshot: CurrentRoutesViewerSnapshot): void {
    latest = {
      status: snapshot.status,
      renderer: snapshot.metrics.backend,
      frameCount: snapshot.metrics.frameCount,
      fps,
      drawCalls: snapshot.metrics.drawCalls,
      textures: snapshot.metrics.textures,
      cinematicScene: snapshot.cinematicScene,
      renderWidth: renderSize.width,
      renderHeight: renderSize.height,
      averageFrameMs: snapshot.metrics.averageFrameMs,
      camera: snapshot.camera,
      ...(snapshot.error ? { error: snapshot.error } : {})
    };
    window.__a3dWowRuntime = {
      appId: "cinematic-prompt-to-scene",
      status: latest.status,
      title: scene.title,
      subtitle: scene.prompt,
      asset: snapshot.asset.name,
      environment: snapshot.environment.label,
      frameCount: latest.frameCount,
      drawCalls: latest.drawCalls,
      fps: latest.fps,
      averageFrameMs: latest.averageFrameMs,
      textures: latest.textures,
      materials: snapshot.asset.materialCount,
      renderWidth: latest.renderWidth,
      renderHeight: latest.renderHeight,
      renderer: "a3d-webgl2",
      backend: "webgl2",
      ...(snapshot.cinematicScene ? { cinematicScene: snapshot.cinematicScene } : {}),
      ...(latest.error ? { error: latest.error } : {})
    };
    options.onSnapshot(latest);
  }

  function updateTimelineControls(): void {
    options.onTimeline(seconds);
  }
}

function applySceneOverlay(scene: CinematicSceneIR, seconds: number): void {
  const root = document.documentElement;
  root.style.setProperty("--cinematic-rain-opacity", String(0.08 + scene.atmosphere.rain * 0.22));
  root.style.setProperty("--cinematic-fog-opacity", String(0.14 + scene.atmosphere.fog * 0.34));
  root.style.setProperty("--cinematic-bloom-opacity", String(0.18 + scene.atmosphere.bloom * 0.44));
  root.style.setProperty("--cinematic-key-color", scene.lighting.keyColor);
  root.style.setProperty("--cinematic-rim-color", scene.lighting.rimColor);
  root.style.setProperty("--cinematic-light-intensity", String(scene.lighting.intensity));
  root.style.setProperty("--hero-x", `${scene.hero.x * 16}vw`);
  root.style.setProperty("--hero-scale", String(scene.hero.scale));
  root.style.setProperty("--shot-progress", String(scene.shot.durationSeconds > 0 ? seconds / scene.shot.durationSeconds : 0));
  document.body.dataset.materialPreset = scene.materialPreset;
  document.body.dataset.extraProp = scene.assets.some((asset) => asset.id === "extra-lantern") ? "true" : "false";
}

function createLoadingSnapshot(canvas: HTMLCanvasElement): SceneViewportSnapshot {
  return {
    status: "loading",
    renderer: "webgl2",
    frameCount: 0,
    fps: 0,
    drawCalls: 0,
    textures: 0,
    renderWidth: canvas.width || FALLBACK_WIDTH,
    renderHeight: canvas.height || FALLBACK_HEIGHT,
    averageFrameMs: 0
  };
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
  canvas.addEventListener("pointerup", handlers.onEnd);
  canvas.addEventListener("pointercancel", handlers.onEnd);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
