import {
  Renderer, createCameraFrame, createGroundedStage, createStudioLighting, loadHdrEnvironment,
  type A3DGltfScene, type A3DViewport
} from "@aura3d/engine/renderer";
import marketing from "../../../marketing/package.json";
import { applyRouteChromeMode, routeRenderQuality } from "./route-quality";

interface ProductScene {
  readonly id: string;
  readonly loadModel: (viewport: A3DViewport) => Promise<A3DGltfScene>;
  readonly lighting: { readonly intensity: number; readonly reflection: number; readonly specular: number; readonly rotation: number };
  readonly background: boolean;
  readonly orbit: { readonly yaw: number; readonly pitch: number; readonly zoom: number; readonly radiansPerSecond: number };
}

const enginePackage = "@aura3d/engine";
const engineVersion = marketing.dependencies[enginePackage];
const environmentUrl = "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";

export async function startProductScene(config: ProductScene): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas#viewport");
  const status = document.querySelector<HTMLElement>(".example-status");
  const toggle = document.querySelector<HTMLButtonElement>("[data-orbit-toggle]");
  const details = document.querySelector<HTMLElement>("#app");
  if (!canvas || !status || !toggle || !details) throw new Error("Missing product viewer elements.");
  applyRouteChromeMode();

  const quality = routeRenderQuality({ maxPixelRatio: 2, maxRenderEdge: 2160 });
  function measure(surface: HTMLCanvasElement): A3DViewport {
    const rect = surface.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio, quality.maxRenderEdge / Math.max(1, rect.width, rect.height));
    return { width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) };
  }
  let viewport = measure(canvas);
  let resized = false;
  let yaw = config.orbit.yaw;
  let pitch = config.orbit.pitch;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let automatic = !preference.matches;
  function updateToggle(): void {
    if (toggle) toggle.textContent = automatic ? "Pause orbit" : "Resume orbit";
  }
  toggle.addEventListener("click", () => { automatic = !automatic; updateToggle(); });
  preference.addEventListener("change", () => { automatic = !preference.matches; updateToggle(); });
  updateToggle();

  function rotate(x: number, y: number): void {
    yaw += x;
    pitch = Math.max(-1.1, Math.min(1.1, pitch + y));
  }
  let pointer: { id: number; x: number; y: number } | undefined;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pointer) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointer?.id !== event.pointerId) return;
    rotate((event.clientX - pointer.x) * 0.006, (event.clientY - pointer.y) * 0.004);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (pointer?.id === event.pointerId) pointer = undefined;
  });
  const arrows: Record<string, readonly [number, number]> = {
    ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08]
  };
  canvas.addEventListener("keydown", (event) => {
    const delta = arrows[event.key];
    if (delta) { event.preventDefault(); rotate(...delta); }
  });

  const runtime = {
    appId: config.id, enginePackage, engineVersion, status: "loading", renderer: "", asset: "",
    assetUrl: "", environment: "Studio Small 08", environmentUrl, frameCount: 0, drawCalls: 0,
    textures: 0, fps: 0, averageFrameMs: 0, loadMs: 0, renderWidth: viewport.width,
    renderHeight: viewport.height, camera: { yaw, pitch }, error: ""
  };
  Object.assign(window, { __a3dWowRuntime: runtime, [`__a3d${config.id.replaceAll("-", "")}`]: runtime });
  function fail(cause: unknown): void {
    runtime.status = "error";
    runtime.error = cause instanceof Error ? cause.message : String(cause);
    delete document.body.dataset.sceneReady;
    if (status) status.textContent = "The interactive scene could not load. Showing the captured view.";
    if (toggle) toggle.hidden = true;
  }

  const cleanup: Array<() => void> = [];
  let closed = false;
  function dispose(): void {
    closed = true;
    for (const release of cleanup.splice(0).reverse()) release();
  }
  window.addEventListener("pagehide", (event) => { if (!event.persisted) dispose(); });
  const started = performance.now();
  try {
    const asset = await config.loadModel(viewport);
    cleanup.push(() => asset.dispose());
    const environment = await loadHdrEnvironment({ url: environmentUrl, id: "studio-small-08", label: runtime.environment });
    cleanup.push(() => environment.dispose());
    const renderer = await Renderer.create({
      canvas, ...viewport, backend: "webgl2", preserveDrawingBuffer: true, clearColor: [0.01, 0.012, 0.016, 1]
    });
    cleanup.push(() => renderer.dispose());
    if (closed) { dispose(); return; }
    const stage = createGroundedStage(asset.resources.bounds, {
      labelPrefix: config.id, floorColor: [0.025, 0.028, 0.033, 1], backdropColor: [0.012, 0.014, 0.018, 1],
      shadowLightDirection: [-0.42, -0.82, -0.38]
    });
    cleanup.push(() => stage.dispose());
    stage.update({ backgroundVisible: config.background, backgroundBlur: 0.08 });
    const lighting = {
      ...environment.environmentLighting, intensity: config.lighting.intensity,
      environmentMapIntensity: config.lighting.reflection, environmentMapSpecularIntensity: config.lighting.specular,
      environmentMapRotation: config.lighting.rotation
    };
    function buildSceneInput() {
      return asset.createRendererInput({
        viewport, environment, environmentLighting: lighting,
        renderItems: stage.renderItems({ shadows: true, backgroundVisible: config.background }),
        collectedLights: createStudioLighting({ preset: "product", shadows: true }), shadow: true,
        postprocess: {
          toneMapping: { operator: "filmic", exposure: 1.08, whitePoint: 1.35, gamma: 2.2 },
          bloom: { threshold: 0.82, intensity: 0.16, radius: 3 },
          ssao: { radius: 2, intensity: 0.26, bias: 0.02 },
          colorGrade: { contrast: 1.06, saturation: 1.05, vignette: 0.18, sharpening: 0.04 },
          fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.5 }
        }
      });
    }
    let input = buildSceneInput();
    const observer = new ResizeObserver(() => { resized = true; });
    observer.observe(canvas);
    cleanup.push(() => observer.disconnect());
    runtime.asset = asset.metadata.assetName;
    runtime.assetUrl = asset.metadata.assetUri;
    runtime.renderer = `a3d-${renderer.device.kind}`;
    let previous = 0;
    let lastUi = -Infinity;
    const frame = async (now: number): Promise<void> => {
      if (closed) return;
      if (resized) {
        resized = false;
        const next = measure(canvas);
        if (next.width !== viewport.width || next.height !== viewport.height) {
          viewport = next;
          renderer.resize(next.width, next.height);
          input = buildSceneInput();
        }
      }
      const elapsed = previous ? now - previous : 0;
      if (automatic && !pointer) rotate(Math.min(elapsed, 100) * config.orbit.radiansPerSecond / 1000, 0);
      previous = now;
      const { camera } = createCameraFrame({
        bounds: asset.resources.bounds, viewport, preset: "product-hero", yawRadians: yaw, pitchRadians: pitch, zoom: config.orbit.zoom
      });
      const metrics = await renderer.renderAsync(input.source, camera);
      if (closed) return;
      if (!runtime.frameCount && !metrics.drawCalls) throw new Error("No geometry submitted.");
      if (!runtime.frameCount) {
        runtime.loadMs = Math.round(performance.now() - started);
        document.body.dataset.sceneReady = "true";
        status.textContent = "";
        toggle.hidden = false;
      }
      runtime.frameCount++;
      runtime.status = "running";
      runtime.drawCalls = metrics.drawCalls;
      runtime.textures = metrics.textures ?? 0;
      runtime.renderWidth = viewport.width;
      runtime.renderHeight = viewport.height;
      runtime.camera = { yaw, pitch };
      if (elapsed > 0) {
        runtime.averageFrameMs = runtime.averageFrameMs ? 0.9 * runtime.averageFrameMs + 0.1 * elapsed : elapsed;
        runtime.fps = 1000 / runtime.averageFrameMs;
      }
      if (now - lastUi > 500) {
        details.textContent = `Aura3D ${engineVersion} · ${runtime.asset} · ${runtime.environment} · ${runtime.drawCalls} draw calls · ${runtime.textures} textures · ${runtime.renderWidth} × ${runtime.renderHeight} · ${runtime.fps.toFixed(0)} FPS`;
        lastUi = now;
      }
      schedule();
    };
    function schedule(): void {
      requestAnimationFrame((now) => { void frame(now).catch((cause) => { fail(cause); dispose(); }); });
    }
    schedule();
  } catch (cause) {
    fail(cause);
    dispose();
  }
}
