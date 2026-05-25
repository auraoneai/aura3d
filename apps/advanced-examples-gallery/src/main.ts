import {
  composeEnvironmentLighting,
  computePerspectiveCameraFrame,
  loadV6HdrEnvironment,
  type EnvironmentLightingOptions,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type V6LoadedHdrEnvironment
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import { DEMOS, getDemo, type DemoDefinition } from "./metadata";
import { buildScene, createResources, type ControlValues, type GalleryState, type Ripple, type SceneFrame } from "./sceneBuilders";
import { createAuthoredGalleryLayer, type AuthoredAssetRuntimeState } from "./authoredLayer";
import {
  collectProductConfiguratorHotspotTargets,
  pickProductConfiguratorHotspotTarget,
  type ProductConfiguratorHotspotTarget
} from "./productConfiguratorVisualCleanup";
import { clamp, formatNumber } from "./math";
import {
  createRendererEnvironmentBackgroundEvidence,
  createRendererEnvironmentLightingEvidence,
  getRendererEnvironmentBackgroundDefinition,
  type RendererEnvironmentBackgroundDefinition,
  type RendererEnvironmentBackgroundEvidence,
  type RendererEnvironmentLightingEvidence
} from "./rendererEnvironmentBackgroundEvidence";
import { createAdvancedGalleryShaderLibrary } from "./showcaseShaders";
import {
  applyGalleryRouteCameraPolicy,
  applyGalleryRoutePostprocessPolicy,
  composeGalleryRouteRenderItems,
  maxCanvasBackingEdgeForRoute,
  minimumCanvasBackingDprForRoute,
  rendererEnvironmentLightingCompositionOptionsForRoute,
  routeReceivesWaterRipples,
  usesProductConfiguratorHotspotPicking,
  visibleProceduralItemsForRoute
} from "./galleryRoutePolicies";
import {
  applyGalleryOrbitDrag,
  pointer01FromClient,
  resolveGalleryPointerDownAction,
  routePointerCreatesRipple
} from "./galleryInteractionAdapter";
import "./styles.css";

declare global {
  interface Window {
    __G3D_V9_ADVANCED_EXAMPLES_GALLERY__?: AdvancedGalleryRuntime;
  }
}

interface AdvancedGalleryRuntime {
  readonly status: "loading" | "ready" | "running" | "error";
  readonly route: string;
  readonly demoId: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly visibleObjects: number;
  readonly objectCount: number;
  readonly instanceCount: number;
  readonly fps: number;
  readonly frameMs: number;
  readonly width: number;
  readonly height: number;
  readonly renderer: "g3d-webgl2";
  readonly postprocess: boolean;
  readonly environmentBackground?: {
    readonly source: "loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass";
    readonly routeId: string;
    readonly enabled: true;
    readonly rendererField: "source.environmentBackground";
    readonly passName: "environment-background";
    readonly projection: "equirect" | "cubemap";
    readonly encoding: "linear";
    readonly outputColorSpace: "srgb";
    readonly textureDimension: "2d" | "cube";
    readonly textureLabel: string;
    readonly textureWidth: number;
    readonly textureHeight: number;
    readonly cubeFaceCount: number | null;
    readonly visibleInDefaultShowcase: boolean;
    readonly activeInCurrentFrame: boolean;
    readonly visibleBackgroundUsage: "default-showcase" | "diagnostic-proof-only";
    readonly visibilityReason: string;
    readonly lightingIntensity: number;
    readonly backgroundIntensity: number;
    readonly hdr: {
      readonly loader: "loadV6HdrEnvironment";
      readonly uri: string;
      readonly id: string;
      readonly label: string;
      readonly radianceWidth: number;
      readonly radianceHeight: number;
      readonly format: "rgbe-hdr";
      readonly realRadianceHdr: true;
      readonly environmentTextureFormat: string;
      readonly cubemapTextureFormat: string;
      readonly pmremMipCount: number;
    };
    readonly rendererEvidence: readonly string[];
    readonly claimBoundary: string;
  };
  readonly environmentLighting?: {
    readonly source: "loadV6HdrEnvironment -> Renderer.environmentLighting -> ForwardPass.environmentCubeMapTexture";
    readonly routeId: string;
    readonly enabled: true;
    readonly rendererField: "source.environmentLighting";
    readonly forwardPassField: "ForwardPassOptions.environmentLighting";
    readonly textureDimension: "cube";
    readonly textureLabel: string;
    readonly textureWidth: number;
    readonly textureHeight: number;
    readonly cubeFaceCount: 6;
    readonly fallbackEquirectTextureDimension: "2d";
    readonly fallbackEquirectTextureLabel: string;
    readonly brdfLutTextureLabel: string;
    readonly environmentMapIntensity: number;
    readonly environmentMapSpecularIntensity: number;
    readonly environmentMapRotation: number;
    readonly environmentMapMipCount: number;
    readonly environmentMapEncoding: "linear";
    readonly nativeEnvironmentBindings: number;
    readonly uniformKeys: readonly string[];
    readonly textureBindingContract: "TextureBinding.expectedDimension=cube";
    readonly materialSchemaContract: "MaterialUniformKind.textureCube";
    readonly rendererEvidence: readonly string[];
    readonly claimBoundary: string;
  };
  readonly environmentFog?: {
    readonly source: "Renderer.environmentFog -> ForwardPass.environmentFog";
    readonly routeId: string;
    readonly enabled: true;
    readonly rendererField: "source.environmentFog";
    readonly forwardPassField: "ForwardPassOptions.environmentFog";
    readonly profilePreset: string;
    readonly mode: string;
    readonly color: readonly [number, number, number];
    readonly near: number;
    readonly far: number;
    readonly density: number;
    readonly heightFalloff: number;
    readonly heightReference: number;
    readonly maxOpacity: number;
    readonly capabilityIds: readonly string[];
    readonly uniformKeys: readonly string[];
    readonly uniforms: {
      readonly u_environmentFogEnabled: 1;
      readonly u_environmentFogMode: 1 | 2 | 3;
      readonly u_environmentFogColor: readonly [number, number, number];
      readonly u_environmentFogNear: number;
      readonly u_environmentFogFar: number;
      readonly u_environmentFogDensity: number;
      readonly u_environmentFogHeightFalloff: number;
      readonly u_environmentFogHeightReference: number;
      readonly u_environmentFogMaxOpacity: number;
    };
    readonly sampleDistances: readonly number[];
    readonly sampleFactors: readonly number[];
    readonly monotonicDistanceResponse: boolean;
    readonly proxyGeometryExcludedFromClaim: true;
    readonly proxyGeometryLabels: readonly string[];
    readonly proxyGeometryInstanceCount: number;
    readonly rendererEvidence: readonly string[];
    readonly claimBoundary: string;
  };
  readonly postprocessDiagnostics?: {
    readonly passes: number;
    readonly passNames: readonly string[];
    readonly targetFormat?: "rgba8" | "rgba16f" | "rgba32f";
    readonly renderTargets: number;
    readonly textures: number;
    readonly width: number;
    readonly height: number;
    readonly plan?: NonNullable<RenderDeviceDiagnostics["postprocessPlan"]>;
  };
  readonly systems: readonly string[];
  readonly approximations: readonly string[];
  readonly waterTelemetry?: SceneFrame["waterTelemetry"];
  readonly dataGalaxyEvidence?: SceneFrame["dataGalaxyEvidence"];
  readonly interactionState: {
    readonly source: "galleryInteractionAdapter + metadata controls";
    readonly selected: string;
    readonly cameraPreset: string;
    readonly pointer: { readonly x: number; readonly y: number };
    readonly controls: ControlValues;
    readonly routeInteractions: readonly string[];
    readonly pointerAction: "product-hotspot" | "scene-ripple-or-select";
    readonly routePointerCreatesRipple: boolean;
    readonly activeRippleCount: number;
    readonly productHotspotTargetCount: number;
    readonly sharedPointerMath: "galleryInteractionAdapter";
  };
  readonly animationState: {
    readonly source: "scene frame + authored runtime";
    readonly frameCount: number;
    readonly routeAnimatedSystems: readonly string[];
    readonly authoredAnimationTracksApplied: number;
    readonly authoredSkinningPalettesUpdated: number;
    readonly motionSampleSource: "screenshot-delta + frameCount";
    readonly paused: boolean;
  };
  readonly resetState: {
    readonly source: "reset action restores createControlValues, hero camera, cleared selection, and cleared ripples";
    readonly resettable: true;
    readonly defaultControls: ControlValues;
    readonly currentMatchesDefaults: boolean;
    readonly currentControlKeys: readonly string[];
    readonly defaultControlKeys: readonly string[];
    readonly resetClearsSelection: true;
    readonly resetClearsRipples: true;
    readonly resetCameraPreset: "hero";
  };
  readonly unsupportedBoundaries: readonly string[];
  readonly timings: {
    readonly buildSceneMs: number;
    readonly authoredFrameMs: number;
    readonly cameraMs: number;
    readonly renderMs: number;
    readonly totalLoopMs: number;
    readonly routeColdLoadMs: number;
    readonly rendererCreateMs: number;
    readonly firstFrameMs: number;
    readonly authoredLoadMs: number;
    readonly authoredReadyMs: number;
    readonly rafFrameMs: number;
    readonly steadyStateLoopMs: number;
    readonly steadyStateRenderMs: number;
    readonly screenshotCaptureOverheadMs: number;
  };
  readonly telemetry: {
    readonly coldLoad: {
      readonly source: "performance.now";
      readonly routeElapsedMs: number;
      readonly rendererCreateMs: number;
      readonly firstFrameMs: number;
      readonly firstRuntimeReadyMs: number;
    };
    readonly rafCadence: {
      readonly source: "requestAnimationFrame";
      readonly fps: number;
      readonly averageFrameMs: number;
      readonly lastFrameMs: number;
      readonly windowMs: number;
      readonly sampleCount: number;
      readonly minFrameMs: number;
      readonly maxFrameMs: number;
      readonly longFrameCount: number;
    };
    readonly renderWork: {
      readonly source: "renderer.render";
      readonly lastMs: number;
      readonly steadyStateAverageMs: number;
      readonly steadyStateMinMs: number;
      readonly steadyStateMaxMs: number;
      readonly steadyStateSamples: number;
    };
    readonly loopWork: {
      readonly source: "performance.now loop span";
      readonly lastMs: number;
      readonly steadyStateAverageMs: number;
      readonly steadyStateMinMs: number;
      readonly steadyStateMaxMs: number;
      readonly steadyStateSamples: number;
    };
    readonly authoredLoad: {
      readonly source: "authoredLayer";
      readonly status: AuthoredAssetRuntimeState["status"] | "unreported";
      readonly loadMs: number;
      readonly readyMs: number;
      readonly assetCount: number;
      readonly drawItems: number;
    };
    readonly captureOverhead: {
      readonly source: "canvas.toDataURL + RAF stall";
      readonly directCaptureCount: number;
      readonly lastDirectCaptureMs: number;
      readonly lastCanvasEncodeMs: number;
      readonly lastWindowOpenMs: number;
      readonly observedRafStallMs: number;
      readonly maxObservedRafStallMs: number;
      readonly observedRafStallSamples: number;
    };
  };
  readonly authoredAsset?: AuthoredAssetRuntimeState;
  readonly error?: string;
}

interface WorkAccumulator {
  samples: number;
  totalLoopMs: number;
  totalRenderMs: number;
  minLoopMs: number;
  maxLoopMs: number;
  minRenderMs: number;
  maxRenderMs: number;
}

interface CaptureOverheadState {
  directCaptureCount: number;
  lastDirectCaptureMs: number;
  lastCanvasEncodeMs: number;
  lastWindowOpenMs: number;
  observedRafStallMs: number;
  maxObservedRafStallMs: number;
  observedRafStallSamples: number;
}

interface RendererEnvironmentBackgroundLoadState {
  readonly definition: RendererEnvironmentBackgroundDefinition;
  readonly startedAt: number;
  environment?: V6LoadedHdrEnvironment;
  loadMs?: number;
  error?: string;
  promise?: Promise<void>;
}

const canvasElement = document.querySelector<HTMLCanvasElement>("#viewport");
const appElement = document.querySelector<HTMLElement>("#app");
if (!canvasElement || !appElement) {
  throw new Error("Advanced gallery requires #app and canvas#viewport.");
}
const canvas = canvasElement;
const app = appElement;

const runtimeStartedAt = performance.now();
const resources = createResources();
const authoredLayer = createAuthoredGalleryLayer();
const rendererEnvironmentBackgrounds = new Map<string, RendererEnvironmentBackgroundLoadState>();
let routeId = normalizeHash(location.hash);
let galleryMode = isGalleryRoute(routeId);
let selectedDemo = getDemo(galleryMode ? null : routeId);
let controls = createControlValues(selectedDemo);
let ripples: Ripple[] = [];
let selected = "none";
let cameraPreset = "hero";
let yaw = -0.45;
let pitch = -0.22;
let padding = 0.14;
let frameCount = 0;
let fps = 0;
let frameMs = 0;
let fpsFrames = 0;
let fpsFrom = runtimeStartedAt;
let fpsReadyResetDemoId: string | undefined;
let lastTime = runtimeStartedAt;
let routeStartedAt = runtimeStartedAt;
let rendererCreateMs = 0;
let firstFrameMs = 0;
let firstRuntimeReadyMs = 0;
let authoredReadyMs = 0;
let lastRafIntervalMs = 0;
let lastRafWindowMs = 0;
let lastRafWindowSamples = 0;
let lastRafWindowMinMs = 0;
let lastRafWindowMaxMs = 0;
let lastRafWindowLongFrames = 0;
let currentRafWindowSamples = 0;
let currentRafWindowTotalMs = 0;
let currentRafWindowMinMs = Number.POSITIVE_INFINITY;
let currentRafWindowMaxMs = 0;
let currentRafWindowLongFrames = 0;
let previousLoopWorkMs = 0;
let steadyStateWork = createWorkAccumulator();
let steadyStateStartedFrame = 0;
let captureOverhead = createCaptureOverheadState();
let lastTimings: AdvancedGalleryRuntime["timings"] = createEmptyTimings();
let dragging = false;
let lastPointer: { x: number; y: number } | null = null;
let productHotspotTargets: readonly ProductConfiguratorHotspotTarget[] = [];
let runtime: AdvancedGalleryRuntime = createRuntime("loading", selectedDemo, undefined, undefined, []);

publish(runtime);
renderShell();

void run();

async function run(): Promise<void> {
  try {
    const renderSize = syncCanvasSize();
    const rendererCreateStartedAt = performance.now();
    const renderer = await G3DRenderer.create({
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      backend: "webgl2",
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      errorCheckMode: "frame",
      clearColor: [0, 0, 0, 0],
      shaderLibrary: createAdvancedGalleryShaderLibrary()
    });
    rendererCreateMs = performance.now() - rendererCreateStartedAt;

    bindEvents(renderer);

    const loop = (now: number): void => {
      try {
        const loopStartedAt = performance.now();
        lastRafIntervalMs = Math.max(0, now - lastTime);
        recordObservedRafStall(lastRafIntervalMs);
        const delta = Math.min(lastRafIntervalMs / 1000, 0.05);
        let fpsSampleIntervalMs = lastRafIntervalMs;
        lastTime = now;
        frameCount += 1;
        const renderSize = syncCanvasSize();
        renderer.resize(renderSize.width, renderSize.height);
        const time = now / 1000;
        ripples = ripples.filter((ripple) => time - ripple.startedAt < 4.75);

        prepareRendererEnvironmentBackground(selectedDemo.id);
        const environmentBackground = resolveRendererEnvironmentBackground(selectedDemo.id);
        authoredLayer.prepare(selectedDemo.id, renderSize);
        const buildStartedAt = performance.now();
        const scene = buildScene(selectedDemo, resources, time, {
          controls,
          ripples,
          selected,
          cameraPreset,
          pointer: lastPointer ?? { x: 0.5, y: 0.5 },
          pulse: frameCount
        });
        const buildFinishedAt = performance.now();
        const rendererEnvironmentLighting = resolveRendererEnvironmentLighting(selectedDemo.id, scene.environment);
        const authoredStartedAt = performance.now();
        const authored = authoredLayer.frame(selectedDemo.id, time, controls);
        const authoredFinishedAt = performance.now();
        if (authored.runtime.status === "ready" && fpsReadyResetDemoId !== selectedDemo.id) {
          authoredReadyMs = authoredFinishedAt - routeStartedAt;
          resetFpsWindow(now);
          resetSteadyStateWork(frameCount);
          fpsSampleIntervalMs = 0;
          fpsReadyResetDemoId = selectedDemo.id;
        }
        recordFpsSample(now, fpsSampleIntervalMs);
        const proceduralItems = visibleProceduralItemsForRoute(scene, selectedDemo.id, authored.runtime);
        const renderItems = composeGalleryRouteRenderItems(selectedDemo.id, proceduralItems, authored.items);
        const cameraStartedAt = performance.now();
        const cameraPolicy = applyGalleryRouteCameraPolicy({
          demoId: selectedDemo.id,
          cameraPreset,
          time,
          frameCount,
          controls,
          authored: authored.runtime,
          sceneBounds: scene.bounds,
          yawRadians: yaw,
          pitchRadians: pitch,
          paddingRatio: padding
        });
        const frame = computePerspectiveCameraFrame(cameraPolicy.bounds, renderSize, {
          yawRadians: cameraPolicy.yawRadians,
          pitchRadians: cameraPolicy.pitchRadians,
          paddingRatio: cameraPolicy.paddingRatio,
          fovYRadians: cameraPreset === "detail" ? 0.42 : 0.55,
          nearPadding: 0.08,
          farPadding: 3.2
        });
        productHotspotTargets = usesProductConfiguratorHotspotPicking(selectedDemo.id)
          ? collectProductConfiguratorHotspotTargets(renderItems, frame.viewProjectionMatrix)
          : [];
        const cameraFinishedAt = performance.now();
        const postprocess = applyGalleryRoutePostprocessPolicy(selectedDemo.id, scene.postprocess, controls);
        const rendererEnvironmentFogDisabled = isRendererEnvironmentFogDisabledForProof();
        const rendererEnvironmentBackgroundActive = shouldRenderRendererEnvironmentBackground(environmentBackground);
        const renderStartedAt = performance.now();
        const diagnostics = renderer.render({
          source: {
            renderItems,
            cameraPolicy: "require",
            cameraPosition: frame.cameraPosition,
            collectedLights: scene.lights,
            environmentLighting: rendererEnvironmentLighting,
            environmentBackground: rendererEnvironmentBackgroundActive ? environmentBackground?.forwardOptions ?? false : false,
            environmentFog: rendererEnvironmentFogDisabled ? false : scene.environmentFog?.forwardOptions ?? false,
            postprocess,
            frustumCulling: false,
            staticBatching: true
          },
          camera: {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix
          }
        });
        const renderFinishedAt = performance.now();
        const environmentLighting = resolveRendererEnvironmentLightingEvidence(selectedDemo.id, diagnostics, rendererEnvironmentLighting);
        const renderMs = renderFinishedAt - renderStartedAt;
        const totalLoopMs = performance.now() - loopStartedAt;
        if (firstFrameMs === 0) {
          firstFrameMs = performance.now() - routeStartedAt;
          firstRuntimeReadyMs = firstFrameMs;
        }
        recordSteadyStateWork(totalLoopMs, renderMs, authored.runtime);
        lastTimings = {
          buildSceneMs: buildFinishedAt - buildStartedAt,
          authoredFrameMs: authoredFinishedAt - authoredStartedAt,
          cameraMs: cameraFinishedAt - cameraStartedAt,
          renderMs,
          totalLoopMs,
          routeColdLoadMs: firstFrameMs,
          rendererCreateMs,
          firstFrameMs,
          authoredLoadMs: authored.runtime.loadMs,
          authoredReadyMs,
          rafFrameMs: lastRafIntervalMs,
          steadyStateLoopMs: averageWork(steadyStateWork.totalLoopMs, steadyStateWork.samples),
          steadyStateRenderMs: averageWork(steadyStateWork.totalRenderMs, steadyStateWork.samples),
          screenshotCaptureOverheadMs: Math.max(captureOverhead.lastDirectCaptureMs, captureOverhead.observedRafStallMs)
        };
        previousLoopWorkMs = totalLoopMs;
        document.querySelector<HTMLElement>("#loading")?.setAttribute("hidden", "true");
        runtime = createRuntime(
          frameCount === 1 ? "ready" : "running",
          selectedDemo,
          diagnostics,
          scene,
          renderItems,
          undefined,
          postprocess !== false,
          authored.runtime,
          environmentBackground,
          environmentLighting,
          rendererEnvironmentBackgroundActive
        );
        publish(runtime);
        if (frameCount === 1 || frameCount % 12 === 0) updateMetrics(scene, authored.runtime, authored.labels);
        requestAnimationFrame(loop);
      } catch (error) {
        runtime = createRuntime("error", selectedDemo, undefined, undefined, [], formatError(error));
        publish(runtime);
        showError(runtime.error ?? "Unknown render error");
      }
    };
    requestAnimationFrame(loop);
  } catch (error) {
    runtime = createRuntime("error", selectedDemo, undefined, undefined, [], formatError(error));
    publish(runtime);
    showError(runtime.error ?? "Unknown startup error");
  }
}

window.addEventListener("beforeunload", () => {
  authoredLayer.dispose();
  for (const state of rendererEnvironmentBackgrounds.values()) {
    state.environment?.dispose();
  }
});

function bindEvents(renderer: G3DRenderer): void {
  window.addEventListener("hashchange", () => {
    routeId = normalizeHash(location.hash);
    galleryMode = isGalleryRoute(routeId);
    selectedDemo = getDemo(galleryMode ? null : routeId);
    controls = createControlValues(selectedDemo);
    ripples = [];
    selected = "none";
    productHotspotTargets = [];
    cameraPreset = "hero";
    resetRouteTelemetry(performance.now());
    applyCameraPreset("hero");
    renderShell();
  });

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    const pointer = pointer01(event);
    lastPointer = pointer;
    if (resolveGalleryPointerDownAction(selectedDemo.id) === "product-hotspot") {
      handleProductConfiguratorPointerPick(pointer);
    } else {
      addInteractionRipple(event);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const pointer = pointer01(event);
    if (dragging && event.buttons !== 0) {
      const previous = lastPointer ?? pointer;
      const orbit = applyGalleryOrbitDrag({ yaw, pitch }, previous, pointer);
      yaw = orbit.yaw;
      pitch = orbit.pitch;
      addInteractionRipple(event, 0.45);
    }
    lastPointer = pointer;
  });
  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener("dblclick", () => {
    selected = selected === "none" ? selectedDemo.systems[0] ?? "selected system" : "none";
  });

  app.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const key = target.dataset.control;
    if (!key) return;
    controls = {
      ...controls,
      [key]: target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target instanceof HTMLInputElement && target.type === "range"
          ? Number(target.value)
          : target.value
    };
    resetRuntimeSampling(performance.now());
    fpsReadyResetDemoId = undefined;
    updateControlReadouts();
  });

  app.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action],button[data-demo],button[data-camera]");
    if (!button) return;
    const demo = button.dataset.demo;
    if (demo) {
      location.hash = demo;
      return;
    }
    const camera = button.dataset.camera;
    if (camera) {
      cameraPreset = camera;
      applyCameraPreset(camera);
      renderShell();
      return;
    }
    const action = button.dataset.action;
    if (action === "reset") {
      controls = createControlValues(selectedDemo);
      ripples = [];
      selected = "none";
      resetRuntimeSampling(performance.now());
      fpsReadyResetDemoId = undefined;
      applyCameraPreset("hero");
      renderShell();
    } else if (action === "capture") {
      captureCanvas();
    } else if (action === "spawn") {
      controls = { ...controls, spawnToken: Date.now() };
      resetRuntimeSampling(performance.now());
      fpsReadyResetDemoId = undefined;
      selected = "spawned pile";
    } else if (action === "home") {
      location.hash = "gallery";
    } else if (action === "dispose") {
      renderer.dispose();
      runtime = { ...runtime, status: "ready", route: "disposed" };
      publish(runtime);
    }
  });
}

function renderShell(): void {
  document.documentElement.dataset.demo = galleryMode ? "gallery" : selectedDemo.id;
  for (const node of Array.from(app.querySelectorAll(".gallery-ui"))) node.remove();
  const shell = document.createElement("div");
  shell.className = "gallery-ui";
  if (galleryMode) {
    shell.classList.add("is-home");
    shell.innerHTML = `
      <section class="gallery-home">
        <header>
          <span>G3D Advanced Gallery</span>
          <h1>Production-Grade Engine Showcase Candidates</h1>
          <p>Every demo remains failed or candidate until screenshot review proves authored assets, complex systems, interaction, motion, and visual composition against its Three.js-style target.</p>
        </header>
        <div class="gallery-grid">
          ${DEMOS.map((demo, index) => `
            <button class="gallery-card review-${escapeHtml(demo.visualReview.status)}" data-demo="${demo.id}" type="button">
              <span class="demo-preview preview-${escapeHtml(demo.id)}"><i></i><i></i><i></i></span>
              <span class="gallery-card-copy">
                <small>${index + 1}. ${escapeHtml(demo.difficulty)} / ${escapeHtml(reviewLabel(demo.visualReview.status))}</small>
                <b>${escapeHtml(demo.title)}</b>
                <em>${escapeHtml(demo.threeCategory)}</em>
                <span>${escapeHtml(demo.subtitle)}</span>
              </span>
              <strong>Launch</strong>
            </button>
          `).join("")}
        </div>
      </section>
      <div class="capture-toast" id="capture-toast" hidden></div>
    `;
    app.appendChild(shell);
    return;
  }
  shell.innerHTML = `
    <section class="top-hud">
      <button data-action="home" type="button">Gallery</button>
      <button data-camera="hero" type="button">Hero</button>
      <button data-camera="detail" type="button">Detail</button>
      <button data-camera="wide" type="button">Wide</button>
      <button data-action="reset" type="button">Reset</button>
      <button data-action="capture" type="button">Capture</button>
    </section>
    <aside class="right-panel">
      <header>
        <span>${escapeHtml(selectedDemo.difficulty)} / ${escapeHtml(reviewLabel(selectedDemo.visualReview.status))}</span>
        <h1>${escapeHtml(selectedDemo.title)}</h1>
        <p>${escapeHtml(selectedDemo.subtitle)}</p>
      </header>
      <section class="visual-review review-${escapeHtml(selectedDemo.visualReview.status)}">
        <h2>Visual Review</h2>
        <strong>${escapeHtml(reviewLabel(selectedDemo.visualReview.status))}</strong>
        <p>${escapeHtml(selectedDemo.visualReview.notes)}</p>
        <small>${escapeHtml(selectedDemo.visualReview.screenshot)}</small>
      </section>
      <section class="stats-grid" id="stats-grid">
        ${metric("Status", runtime.status)}
        ${metric("FPS", "0")}
        ${metric("Frame", "0ms")}
        ${metric("Draw calls", "0")}
        ${metric("Objects", "0")}
        ${metric("Render", `${canvas.width}x${canvas.height}`)}
      </section>
      <section class="control-section">
        <h2>Controls</h2>
        ${renderControls(selectedDemo)}
      </section>
      <section class="info-section">
        <h2>What This Proves</h2>
        ${list(selectedDemo.proves)}
        <h2>G3D Features Used</h2>
        ${chips(selectedDemo.features)}
        <h2>Three.js Reference Target</h2>
        <p>${escapeHtml(selectedDemo.reference)}</p>
        <h2>Known Gaps</h2>
        ${list(selectedDemo.knownGaps)}
        <h2>Acceptance Criteria</h2>
        ${list(selectedDemo.acceptance)}
      </section>
    </aside>
    <div class="caption-strip" id="caption-strip">
      ${selectedDemo.systems.map((system) => `<span>${escapeHtml(system)}</span>`).join("")}
    </div>
    <div class="capture-toast" id="capture-toast" hidden></div>
  `;
  app.appendChild(shell);
  updateControlReadouts();
}

function reviewLabel(status: DemoDefinition["visualReview"]["status"]): string {
  if (status === "accepted") return "accepted";
  if (status === "candidate") return "candidate";
  return "failed visual gate";
}

function renderControls(demo: DemoDefinition): string {
  return demo.controls.map((control) => {
    const value = controls[control.key] ?? control.value;
    if (control.kind === "toggle") {
      return `<label class="control-row"><span>${escapeHtml(control.label)}</span><input data-control="${escapeHtml(control.key)}" type="checkbox" ${value === true ? "checked" : ""}></label>`;
    }
    if (control.kind === "select") {
      return `<label class="control-row"><span>${escapeHtml(control.label)}</span><select data-control="${escapeHtml(control.key)}">${(control.options ?? []).map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
    }
    if (control.kind === "button") {
      return `<button class="wide-command" data-action="${escapeHtml(control.key)}" type="button">${escapeHtml(control.label)}</button>`;
    }
    return `<label class="control-row is-range"><span>${escapeHtml(control.label)} <b data-readout="${escapeHtml(control.key)}">${escapeHtml(String(value))}</b></span><input data-control="${escapeHtml(control.key)}" type="range" min="${control.min ?? 0}" max="${control.max ?? 1}" step="${control.step ?? 0.01}" value="${escapeHtml(String(value ?? 0))}"></label>`;
  }).join("");
}

function updateMetrics(scene: SceneFrame, authored?: AuthoredAssetRuntimeState, authoredLabels: readonly string[] = []): void {
  const stats = document.querySelector<HTMLElement>("#stats-grid");
  if (!stats) return;
  const authoredDiagnostics = summarizeAuthoredDiagnostics(authored);
  stats.innerHTML = `
    ${metric("Status", runtime.status)}
    ${metric("FPS", fps.toFixed(1))}
    ${metric("RAF cadence", `${frameMs.toFixed(1)}ms`)}
    ${metric("Render work", `${lastTimings.renderMs.toFixed(1)}ms`)}
    ${metric("Loop work", `${lastTimings.totalLoopMs.toFixed(1)}ms`)}
    ${lastTimings.steadyStateLoopMs > 0 ? metric("Steady loop", `${lastTimings.steadyStateLoopMs.toFixed(1)}ms`) : ""}
    ${lastTimings.routeColdLoadMs > 0 ? metric("Cold load", `${lastTimings.routeColdLoadMs.toFixed(0)}ms`) : ""}
    ${metric("Draw calls", runtime.drawCalls)}
    ${metric("Objects", formatNumber(scene.objectCount))}
    ${metric("Instances", formatNumber(scene.instanceCount))}
    ${metric("Render", `${canvas.width}x${canvas.height}`)}
    ${runtime.environmentFog ? metric("Env fog", runtime.environmentFog.mode) : ""}
    ${authored && authored.status !== "idle" ? metric("Authored GLB", `${authored.status} / ${authored.drawItems}`) : ""}
    ${authored && authored.loadMs > 0 ? metric("GLB load", `${authored.loadMs}ms`) : ""}
    ${authoredDiagnostics.animationTracksApplied > 0 ? metric("Anim tracks", authoredDiagnostics.animationTracksApplied) : ""}
    ${authoredDiagnostics.skinningPalettesUpdated > 0 ? metric("Skin palettes", authoredDiagnostics.skinningPalettesUpdated) : ""}
    ${authoredDiagnostics.materialCount > 0 ? metric("GLB mats/tex", `${authoredDiagnostics.materialCount}/${authoredDiagnostics.textureCount}`) : ""}
    ${authoredDiagnostics.missingResourceDrawItems > 0 ? metric("Missing GLB", authoredDiagnostics.missingResourceDrawItems) : ""}
    ${authoredDiagnostics.fallbackWhiteDrawItems > 0 ? metric("Fallback white", authoredDiagnostics.fallbackWhiteDrawItems) : ""}
    ${metric("Systems", scene.animatedSystems.length)}
  `;
  const captions = document.querySelector<HTMLElement>("#caption-strip");
  if (captions) {
    const authoredCaption = authored && authored.status !== "idle"
      ? [`Authored assets: ${authored.assets.join(", ") || authored.status}`, ...authored.clips]
      : [];
    captions.innerHTML = [...authoredCaption, ...authoredLabels.slice(0, 3), ...scene.labels, ...scene.approximations.slice(0, 1)]
      .map((label) => `<span>${escapeHtml(label)}</span>`)
      .join("");
  }
}

function summarizeAuthoredDiagnostics(authored?: AuthoredAssetRuntimeState): {
  readonly materialCount: number;
  readonly textureCount: number;
  readonly animationTracksApplied: number;
  readonly skinningPalettesUpdated: number;
  readonly fallbackWhiteDrawItems: number;
  readonly missingResourceDrawItems: number;
} {
  if (!authored || authored.status === "idle") return {
    materialCount: 0,
    textureCount: 0,
    animationTracksApplied: 0,
    skinningPalettesUpdated: 0,
    fallbackWhiteDrawItems: 0,
    missingResourceDrawItems: 0
  };
  return authored.materialDiagnostics.reduce((summary, diagnostic) => ({
    materialCount: summary.materialCount + diagnostic.materialCount,
    textureCount: summary.textureCount + diagnostic.textureCount,
    animationTracksApplied: summary.animationTracksApplied,
    skinningPalettesUpdated: summary.skinningPalettesUpdated,
    fallbackWhiteDrawItems: summary.fallbackWhiteDrawItems + diagnostic.fallbackWhiteDrawItems,
    missingResourceDrawItems: summary.missingResourceDrawItems + diagnostic.missingGeometryDrawItems + diagnostic.missingMaterialDrawItems
  }), {
    materialCount: 0,
    textureCount: 0,
    animationTracksApplied: authored.animationDiagnostics.reduce((sum, diagnostic) => sum + diagnostic.tracksApplied, 0),
    skinningPalettesUpdated: authored.animationDiagnostics.reduce((sum, diagnostic) => sum + diagnostic.skinningPalettesUpdated, 0),
    fallbackWhiteDrawItems: 0,
    missingResourceDrawItems: 0
  });
}

function updateControlReadouts(): void {
  for (const node of Array.from(app.querySelectorAll<HTMLElement>("[data-readout]"))) {
    const key = node.dataset.readout;
    if (!key) continue;
    const value = controls[key];
    node.textContent = typeof value === "number" ? value.toFixed(value < 10 ? 2 : 0) : String(value ?? "");
  }
}

function syncCanvasSize(): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width > 0 ? rect.width : window.innerWidth;
  const cssHeight = rect.height > 0 ? rect.height : window.innerHeight;
  const dpr = Math.min(2, Math.max(minimumCanvasBackingDprForRoute(selectedDemo.id), window.devicePixelRatio || 1));
  const maxEdge = maxCanvasBackingEdgeForRoute(selectedDemo.id);
  const edgeScale = Math.min(1, maxEdge / Math.max(cssWidth * dpr, cssHeight * dpr));
  const width = Math.max(1, Math.round(cssWidth * dpr * edgeScale));
  const height = Math.max(1, Math.round(cssHeight * dpr * edgeScale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function addInteractionRipple(event: PointerEvent, strength = 1): void {
  const rect = canvas.getBoundingClientRect();
  const x01 = (event.clientX - rect.left) / Math.max(1, rect.width);
  const y01 = (event.clientY - rect.top) / Math.max(1, rect.height);
  if (routePointerCreatesRipple(selectedDemo.id)) {
    const radius = Number(controls.radius ?? 1);
    ripples = [
      ...ripples.slice(-12),
      {
        x: (x01 - 0.5) * 12,
        z: (y01 - 0.5) * 9,
        startedAt: performance.now() / 1000,
        strength: strength * radius
      }
    ];
  } else {
    selected = selectedDemo.systems[Math.floor(x01 * selectedDemo.systems.length)] ?? "selected system";
  }
}

function handleProductConfiguratorPointerPick(pointer: { readonly x: number; readonly y: number }): void {
  const target = pickProductConfiguratorHotspotTarget(pointer, productHotspotTargets);
  if (!target) {
    selected = "product hotspot screen-space miss";
    return;
  }
  controls = {
    ...controls,
    focusPart: target.focusPart
  };
  selected = `product imported hotspot ${target.focusPart}`;
  resetRuntimeSampling(performance.now());
  fpsReadyResetDemoId = undefined;
  renderShell();
}

function pointer01(event: PointerEvent): { readonly x: number; readonly y: number } {
  const rect = canvas.getBoundingClientRect();
  return pointer01FromClient(event.clientX, event.clientY, rect);
}

function applyCameraPreset(preset: string): void {
  if (preset === "detail") {
    yaw = -0.18;
    pitch = -0.08;
    padding = 0.02;
  } else if (preset === "wide") {
    yaw = -0.62;
    pitch = -0.36;
    padding = 0.32;
  } else {
    yaw = -0.44;
    pitch = -0.22;
    padding = 0.14;
  }
}

function createControlValues(demo: DemoDefinition): ControlValues {
  const next: ControlValues = {};
  for (const control of demo.controls) {
    if (control.value !== undefined) next[control.key] = control.value;
  }
  return next;
}

function prepareRendererEnvironmentBackground(demoId: string): void {
  const definition = getRendererEnvironmentBackgroundDefinition(demoId);
  if (!definition || rendererEnvironmentBackgrounds.has(demoId)) return;
  const state: RendererEnvironmentBackgroundLoadState = {
    definition,
    startedAt: performance.now()
  };
  state.promise = loadRendererEnvironmentBackground(state);
  rendererEnvironmentBackgrounds.set(demoId, state);
}

function resolveRendererEnvironmentBackground(demoId: string): RendererEnvironmentBackgroundEvidence | null {
  const state = rendererEnvironmentBackgrounds.get(demoId);
  if (!state?.environment) return null;
  return createRendererEnvironmentBackgroundEvidence(state.definition, state.environment);
}

function resolveRendererEnvironmentLighting(
  demoId: DemoDefinition["id"],
  fallback: EnvironmentLightingOptions
): EnvironmentLightingOptions {
  const state = rendererEnvironmentBackgrounds.get(demoId);
  if (!state?.environment?.lighting) return fallback;
  return composeEnvironmentLighting(fallback, state.environment.lighting, rendererEnvironmentLightingCompositionOptionsForRoute(demoId));
}

function resolveRendererEnvironmentLightingEvidence(
  demoId: string,
  diagnostics: RenderDeviceDiagnostics,
  activeLighting?: EnvironmentLightingOptions
): RendererEnvironmentLightingEvidence | null {
  const state = rendererEnvironmentBackgrounds.get(demoId);
  if (!state?.environment) return null;
  return createRendererEnvironmentLightingEvidence(state.definition, state.environment, diagnostics, activeLighting);
}

async function loadRendererEnvironmentBackground(state: RendererEnvironmentBackgroundLoadState): Promise<void> {
  try {
    const response = await fetch(state.definition.hdrUri);
    if (!response.ok) {
      throw new Error(`Failed to load HDR environment ${state.definition.hdrUri}: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    state.environment = loadV6HdrEnvironment(buffer, {
      id: state.definition.environmentId,
      label: state.definition.environmentLabel,
      intensity: state.definition.lightingIntensity,
      rotation: state.definition.rotation
    });
    state.loadMs = performance.now() - state.startedAt;
  } catch (error) {
    state.error = formatError(error);
  }
}

function normalizeHash(hash: string): string | null {
  const value = hash.replace(/^#\/?/, "").trim();
  return value || null;
}

function isRendererEnvironmentFogDisabledForProof(): boolean {
  return document.documentElement.dataset.rendererFogProof === "off";
}

function rendererEnvironmentBackgroundProofMode(): "default" | "on" | "off" {
  const value = document.documentElement.dataset.environmentBackgroundProof;
  return value === "on" || value === "off" ? value : "default";
}

function shouldRenderRendererEnvironmentBackground(evidence: RendererEnvironmentBackgroundEvidence | null): boolean {
  if (!evidence) return false;
  const mode = rendererEnvironmentBackgroundProofMode();
  if (mode === "on") return true;
  if (mode === "off") return false;
  return evidence.visibleInDefaultShowcase;
}

function isGalleryRoute(value: string | null): boolean {
  return value === null || value === "gallery";
}

function captureCanvas(): void {
  const toast = document.querySelector<HTMLElement>("#capture-toast");
  try {
    const captureStartedAt = performance.now();
    const encodeStartedAt = performance.now();
    const dataUrl = canvas.toDataURL("image/png");
    const encodeMs = performance.now() - encodeStartedAt;
    const openStartedAt = performance.now();
    window.open(dataUrl, "_blank", "noopener,noreferrer");
    const openMs = performance.now() - openStartedAt;
    recordDirectCapture(performance.now() - captureStartedAt, encodeMs, openMs);
    refreshPublishedTelemetry();
    if (toast) {
      toast.hidden = false;
      toast.textContent = `Captured ${selectedDemo.shortTitle} at ${canvas.width}x${canvas.height}`;
      setTimeout(() => { toast.hidden = true; }, 2200);
    }
  } catch (error) {
    if (toast) {
      toast.hidden = false;
      toast.textContent = `Capture unavailable: ${formatError(error)}`;
    }
  }
}

function createRuntime(
  status: AdvancedGalleryRuntime["status"],
  demo: DemoDefinition,
  diagnostics?: RenderDeviceDiagnostics,
  scene?: SceneFrame,
  items: readonly RenderItem[] = [],
  error?: string,
  actualPostprocess = false,
  authoredAsset?: AuthoredAssetRuntimeState,
  environmentBackground?: RendererEnvironmentBackgroundEvidence | null,
  environmentLighting?: RendererEnvironmentLightingEvidence | null,
  environmentBackgroundActive = false
): AdvancedGalleryRuntime {
  const renderedInstanceCount = countRenderItemInstances(items);
  const environmentFog = createRuntimeEnvironmentFog(scene);
  return {
    status,
    route: "/apps/advanced-examples-gallery/",
    demoId: demo.id,
    frameCount,
    drawCalls: diagnostics?.drawCalls ?? 0,
    visibleObjects: diagnostics?.visibleObjects ?? items.length,
    objectCount: items.length + renderedInstanceCount,
    instanceCount: renderedInstanceCount,
    fps,
    frameMs,
    width: canvas.width,
    height: canvas.height,
    renderer: "g3d-webgl2",
    postprocess: actualPostprocess,
    ...(environmentBackground ? { environmentBackground: createRuntimeEnvironmentBackground(environmentBackground, environmentBackgroundActive) } : {}),
    ...(environmentLighting ? { environmentLighting: createRuntimeEnvironmentLighting(environmentLighting) } : {}),
    ...(environmentFog ? { environmentFog } : {}),
    ...(diagnostics?.postprocessPasses !== undefined ? {
      postprocessDiagnostics: {
        passes: diagnostics.postprocessPasses,
        passNames: diagnostics.postprocessPassNames ?? [],
        targetFormat: diagnostics.postprocessTargetFormat,
        renderTargets: diagnostics.postprocessRenderTargets ?? 0,
        textures: diagnostics.postprocessTextures ?? 0,
        width: diagnostics.postprocessTargetWidth ?? 0,
        height: diagnostics.postprocessTargetHeight ?? 0,
        ...(diagnostics.postprocessPlan ? { plan: diagnostics.postprocessPlan } : {})
      }
    } : {}),
    systems: scene?.animatedSystems ?? demo.systems,
    approximations: scene?.approximations ?? demo.knownGaps,
    ...(scene?.waterTelemetry ? { waterTelemetry: scene.waterTelemetry } : {}),
    ...(scene?.dataGalaxyEvidence ? { dataGalaxyEvidence: scene.dataGalaxyEvidence } : {}),
    interactionState: createRuntimeInteractionState(demo),
    animationState: createRuntimeAnimationState(scene, authoredAsset),
    resetState: createRuntimeResetState(demo),
    unsupportedBoundaries: uniqueStrings([...(scene?.approximations ?? []), ...demo.knownGaps]),
    timings: lastTimings,
    telemetry: createRuntimeTelemetry(authoredAsset),
    ...(authoredAsset && authoredAsset.status !== "idle" ? { authoredAsset } : {}),
    ...(error ? { error } : {})
  };
}

function createRuntimeInteractionState(demo: DemoDefinition): AdvancedGalleryRuntime["interactionState"] {
  return {
    source: "galleryInteractionAdapter + metadata controls",
    selected,
    cameraPreset,
    pointer: lastPointer ?? { x: 0.5, y: 0.5 },
    controls: { ...controls },
    routeInteractions: demo.interactions,
    pointerAction: resolveGalleryPointerDownAction(demo.id),
    routePointerCreatesRipple: routePointerCreatesRipple(demo.id),
    activeRippleCount: ripples.length,
    productHotspotTargetCount: usesProductConfiguratorHotspotPicking(demo.id) ? productHotspotTargets.length : 0,
    sharedPointerMath: "galleryInteractionAdapter"
  };
}

function createRuntimeAnimationState(
  scene?: SceneFrame,
  authoredAsset?: AuthoredAssetRuntimeState
): AdvancedGalleryRuntime["animationState"] {
  return {
    source: "scene frame + authored runtime",
    frameCount,
    routeAnimatedSystems: scene?.animatedSystems ?? selectedDemo.systems,
    authoredAnimationTracksApplied: authoredAsset?.animationDiagnostics.reduce((sum, diagnostic) => sum + diagnostic.tracksApplied, 0) ?? 0,
    authoredSkinningPalettesUpdated: authoredAsset?.animationDiagnostics.reduce((sum, diagnostic) => sum + diagnostic.skinningPalettesUpdated, 0) ?? 0,
    motionSampleSource: "screenshot-delta + frameCount",
    paused: controls.paused === true || controls.playing === false || controls.running === false
  };
}

function createRuntimeResetState(demo: DemoDefinition): AdvancedGalleryRuntime["resetState"] {
  const defaultControls = createControlValues(demo);
  return {
    source: "reset action restores createControlValues, hero camera, cleared selection, and cleared ripples",
    resettable: true,
    defaultControls,
    currentMatchesDefaults: controlsMatchDefaults(controls, defaultControls),
    currentControlKeys: Object.keys(controls).sort(),
    defaultControlKeys: Object.keys(defaultControls).sort(),
    resetClearsSelection: true,
    resetClearsRipples: true,
    resetCameraPreset: "hero"
  };
}

function controlsMatchDefaults(current: ControlValues, defaults: ControlValues): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(defaults)]);
  for (const key of keys) {
    if (current[key] !== defaults[key]) return false;
  }
  return true;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function createRuntimeEnvironmentBackground(
  evidence: RendererEnvironmentBackgroundEvidence,
  activeInCurrentFrame: boolean
): AdvancedGalleryRuntime["environmentBackground"] {
  return {
    source: evidence.source,
    routeId: evidence.routeId,
    enabled: true,
    rendererField: evidence.rendererField,
    passName: evidence.passName,
    projection: evidence.projection,
    encoding: evidence.encoding,
    outputColorSpace: evidence.outputColorSpace,
    textureDimension: evidence.textureDimension,
    textureLabel: evidence.textureLabel,
    textureWidth: evidence.textureWidth,
    textureHeight: evidence.textureHeight,
    cubeFaceCount: evidence.cubeFaceCount,
    visibleInDefaultShowcase: evidence.visibleInDefaultShowcase,
    activeInCurrentFrame,
    visibleBackgroundUsage: evidence.visibleBackgroundUsage,
    visibilityReason: evidence.visibilityReason,
    lightingIntensity: evidence.lightingIntensity,
    backgroundIntensity: evidence.backgroundIntensity,
    hdr: evidence.hdr,
    rendererEvidence: evidence.rendererEvidence,
    claimBoundary: evidence.claimBoundary
  };
}

function createRuntimeEnvironmentLighting(
  evidence: RendererEnvironmentLightingEvidence
): AdvancedGalleryRuntime["environmentLighting"] {
  return {
    source: evidence.source,
    routeId: evidence.routeId,
    enabled: evidence.enabled,
    rendererField: evidence.rendererField,
    forwardPassField: evidence.forwardPassField,
    textureDimension: evidence.textureDimension,
    textureLabel: evidence.textureLabel,
    textureWidth: evidence.textureWidth,
    textureHeight: evidence.textureHeight,
    cubeFaceCount: evidence.cubeFaceCount,
    fallbackEquirectTextureDimension: evidence.fallbackEquirectTextureDimension,
    fallbackEquirectTextureLabel: evidence.fallbackEquirectTextureLabel,
    brdfLutTextureLabel: evidence.brdfLutTextureLabel,
    environmentMapIntensity: evidence.environmentMapIntensity,
    environmentMapSpecularIntensity: evidence.environmentMapSpecularIntensity,
    environmentMapRotation: evidence.environmentMapRotation,
    environmentMapMipCount: evidence.environmentMapMipCount,
    environmentMapEncoding: evidence.environmentMapEncoding,
    nativeEnvironmentBindings: evidence.nativeEnvironmentBindings,
    uniformKeys: evidence.uniformKeys,
    textureBindingContract: evidence.textureBindingContract,
    materialSchemaContract: evidence.materialSchemaContract,
    rendererEvidence: evidence.rendererEvidence,
    claimBoundary: evidence.claimBoundary
  };
}

function createRuntimeEnvironmentFog(scene?: SceneFrame): AdvancedGalleryRuntime["environmentFog"] | undefined {
  const fog = scene?.environmentFog;
  if (!fog) return undefined;
  const profile = fog.profile;
  return {
    source: fog.source,
    routeId: fog.routeId,
    enabled: true,
    rendererField: fog.rendererField,
    forwardPassField: fog.forwardPassField,
    profilePreset: profile.preset,
    mode: profile.mode,
    color: profile.color,
    near: profile.near,
    far: profile.far,
    density: profile.density,
    heightFalloff: profile.heightFalloff,
    heightReference: profile.heightReference,
    maxOpacity: profile.maxOpacity,
    capabilityIds: profile.capabilityIds,
    uniformKeys: profile.telemetry.uniformKeys,
    uniforms: profile.uniforms,
    sampleDistances: profile.telemetry.sampleDistances,
    sampleFactors: profile.telemetry.sampleFactors,
    monotonicDistanceResponse: profile.telemetry.monotonicDistanceResponse,
    proxyGeometryExcludedFromClaim: fog.proxyGeometryExcludedFromClaim,
    proxyGeometryLabels: fog.proxyGeometryLabels,
    proxyGeometryInstanceCount: fog.proxyGeometryInstanceCount,
    rendererEvidence: fog.rendererEvidence,
    claimBoundary: fog.claimBoundary
  };
}

function createRuntimeTelemetry(authoredAsset?: AuthoredAssetRuntimeState): AdvancedGalleryRuntime["telemetry"] {
  const steadyStateLoopMs = averageWork(steadyStateWork.totalLoopMs, steadyStateWork.samples);
  const steadyStateRenderMs = averageWork(steadyStateWork.totalRenderMs, steadyStateWork.samples);
  return {
    coldLoad: {
      source: "performance.now",
      routeElapsedMs: Math.max(0, performance.now() - routeStartedAt),
      rendererCreateMs,
      firstFrameMs,
      firstRuntimeReadyMs
    },
    rafCadence: {
      source: "requestAnimationFrame",
      fps,
      averageFrameMs: frameMs,
      lastFrameMs: lastRafIntervalMs,
      windowMs: lastRafWindowMs,
      sampleCount: lastRafWindowSamples,
      minFrameMs: lastRafWindowMinMs,
      maxFrameMs: lastRafWindowMaxMs,
      longFrameCount: lastRafWindowLongFrames
    },
    renderWork: {
      source: "renderer.render",
      lastMs: lastTimings.renderMs,
      steadyStateAverageMs: steadyStateRenderMs,
      steadyStateMinMs: accumulatorMin(steadyStateWork.minRenderMs, steadyStateWork.samples),
      steadyStateMaxMs: accumulatorMax(steadyStateWork.maxRenderMs, steadyStateWork.samples),
      steadyStateSamples: steadyStateWork.samples
    },
    loopWork: {
      source: "performance.now loop span",
      lastMs: lastTimings.totalLoopMs,
      steadyStateAverageMs: steadyStateLoopMs,
      steadyStateMinMs: accumulatorMin(steadyStateWork.minLoopMs, steadyStateWork.samples),
      steadyStateMaxMs: accumulatorMax(steadyStateWork.maxLoopMs, steadyStateWork.samples),
      steadyStateSamples: steadyStateWork.samples
    },
    authoredLoad: {
      source: "authoredLayer",
      status: authoredAsset?.status ?? "unreported",
      loadMs: authoredAsset?.loadMs ?? 0,
      readyMs: authoredReadyMs,
      assetCount: authoredAsset?.assets.length ?? 0,
      drawItems: authoredAsset?.drawItems ?? 0
    },
    captureOverhead: {
      source: "canvas.toDataURL + RAF stall",
      directCaptureCount: captureOverhead.directCaptureCount,
      lastDirectCaptureMs: captureOverhead.lastDirectCaptureMs,
      lastCanvasEncodeMs: captureOverhead.lastCanvasEncodeMs,
      lastWindowOpenMs: captureOverhead.lastWindowOpenMs,
      observedRafStallMs: captureOverhead.observedRafStallMs,
      maxObservedRafStallMs: captureOverhead.maxObservedRafStallMs,
      observedRafStallSamples: captureOverhead.observedRafStallSamples
    }
  };
}

function resetRouteTelemetry(now: number): void {
  frameCount = 0;
  routeStartedAt = now;
  firstFrameMs = 0;
  firstRuntimeReadyMs = 0;
  authoredReadyMs = 0;
  previousLoopWorkMs = 0;
  captureOverhead = createCaptureOverheadState();
  lastTimings = createEmptyTimings();
  resetRuntimeSampling(now);
  lastTime = now;
}

function resetRuntimeSampling(now: number): void {
  resetFpsWindow(now);
  resetSteadyStateWork(frameCount);
  previousLoopWorkMs = 0;
}

function resetFpsWindow(now: number): void {
  fps = 0;
  frameMs = 0;
  fpsFrames = 0;
  fpsFrom = now;
  lastRafIntervalMs = 0;
  lastRafWindowMs = 0;
  lastRafWindowSamples = 0;
  lastRafWindowMinMs = 0;
  lastRafWindowMaxMs = 0;
  lastRafWindowLongFrames = 0;
  currentRafWindowSamples = 0;
  currentRafWindowTotalMs = 0;
  currentRafWindowMinMs = Number.POSITIVE_INFINITY;
  currentRafWindowMaxMs = 0;
  currentRafWindowLongFrames = 0;
}

function resetSteadyStateWork(startedFrame: number): void {
  steadyStateWork = createWorkAccumulator();
  steadyStateStartedFrame = startedFrame;
}

function recordFpsSample(now: number, intervalMs: number): void {
  fpsFrames += 1;
  if (intervalMs > 0) {
    if (intervalMs <= 1000) {
      currentRafWindowSamples += 1;
      currentRafWindowTotalMs += intervalMs;
      currentRafWindowMinMs = Math.min(currentRafWindowMinMs, intervalMs);
      currentRafWindowMaxMs = Math.max(currentRafWindowMaxMs, intervalMs);
    }
    if (intervalMs > 50 && intervalMs <= 1000) currentRafWindowLongFrames += 1;
  }
  if (now - fpsFrom < 500) return;
  lastRafWindowMs = Math.max(1, now - fpsFrom);
  lastRafWindowSamples = currentRafWindowSamples;
  lastRafWindowMinMs = Number.isFinite(currentRafWindowMinMs) ? currentRafWindowMinMs : 0;
  lastRafWindowMaxMs = currentRafWindowMaxMs;
  lastRafWindowLongFrames = currentRafWindowLongFrames;
  if (currentRafWindowSamples > 0) {
    frameMs = currentRafWindowTotalMs / currentRafWindowSamples;
    fps = frameMs > 0 ? 1000 / frameMs : 0;
  }
  fpsFrames = 0;
  fpsFrom = now;
  currentRafWindowSamples = 0;
  currentRafWindowTotalMs = 0;
  currentRafWindowMinMs = Number.POSITIVE_INFINITY;
  currentRafWindowMaxMs = 0;
  currentRafWindowLongFrames = 0;
}

function recordSteadyStateWork(loopMs: number, renderMs: number, authored: AuthoredAssetRuntimeState): void {
  if (!isSteadyStateFrame(authored)) return;
  steadyStateWork.samples += 1;
  steadyStateWork.totalLoopMs += loopMs;
  steadyStateWork.totalRenderMs += renderMs;
  steadyStateWork.minLoopMs = Math.min(steadyStateWork.minLoopMs, loopMs);
  steadyStateWork.maxLoopMs = Math.max(steadyStateWork.maxLoopMs, loopMs);
  steadyStateWork.minRenderMs = Math.min(steadyStateWork.minRenderMs, renderMs);
  steadyStateWork.maxRenderMs = Math.max(steadyStateWork.maxRenderMs, renderMs);
}

function isSteadyStateFrame(authored: AuthoredAssetRuntimeState): boolean {
  if (frameCount <= steadyStateStartedFrame + 1) return false;
  if (authored.status === "ready") return authoredReadyMs > 0;
  return authored.status === "idle" && frameCount > 4;
}

function recordObservedRafStall(intervalMs: number): void {
  if (steadyStateWork.samples <= 0 || previousLoopWorkMs <= 0 || intervalMs <= 0) return;
  const cadenceBudgetMs = frameMs > 0 ? Math.max(16.7, frameMs) : 16.7;
  const externalStallMs = Math.max(0, intervalMs - Math.max(previousLoopWorkMs, cadenceBudgetMs));
  if (externalStallMs <= 4) return;
  captureOverhead.observedRafStallMs = externalStallMs;
  captureOverhead.maxObservedRafStallMs = Math.max(captureOverhead.maxObservedRafStallMs, externalStallMs);
  captureOverhead.observedRafStallSamples += 1;
}

function recordDirectCapture(totalMs: number, encodeMs: number, openMs: number): void {
  captureOverhead.directCaptureCount += 1;
  captureOverhead.lastDirectCaptureMs = totalMs;
  captureOverhead.lastCanvasEncodeMs = encodeMs;
  captureOverhead.lastWindowOpenMs = openMs;
}

function refreshPublishedTelemetry(): void {
  lastTimings = {
    ...lastTimings,
    screenshotCaptureOverheadMs: Math.max(captureOverhead.lastDirectCaptureMs, captureOverhead.observedRafStallMs)
  };
  runtime = {
    ...runtime,
    timings: lastTimings,
    telemetry: createRuntimeTelemetry(runtime.authoredAsset)
  };
  publish(runtime);
}

function createWorkAccumulator(): WorkAccumulator {
  return {
    samples: 0,
    totalLoopMs: 0,
    totalRenderMs: 0,
    minLoopMs: Number.POSITIVE_INFINITY,
    maxLoopMs: 0,
    minRenderMs: Number.POSITIVE_INFINITY,
    maxRenderMs: 0
  };
}

function createCaptureOverheadState(): CaptureOverheadState {
  return {
    directCaptureCount: 0,
    lastDirectCaptureMs: 0,
    lastCanvasEncodeMs: 0,
    lastWindowOpenMs: 0,
    observedRafStallMs: 0,
    maxObservedRafStallMs: 0,
    observedRafStallSamples: 0
  };
}

function createEmptyTimings(): AdvancedGalleryRuntime["timings"] {
  return {
    buildSceneMs: 0,
    authoredFrameMs: 0,
    cameraMs: 0,
    renderMs: 0,
    totalLoopMs: 0,
    routeColdLoadMs: 0,
    rendererCreateMs,
    firstFrameMs: 0,
    authoredLoadMs: 0,
    authoredReadyMs: 0,
    rafFrameMs: 0,
    steadyStateLoopMs: 0,
    steadyStateRenderMs: 0,
    screenshotCaptureOverheadMs: 0
  };
}

function averageWork(totalMs: number, samples: number): number {
  return samples > 0 ? totalMs / samples : 0;
}

function accumulatorMin(value: number, samples: number): number {
  return samples > 0 && Number.isFinite(value) ? value : 0;
}

function accumulatorMax(value: number, samples: number): number {
  return samples > 0 && Number.isFinite(value) ? value : 0;
}

function countRenderItemInstances(items: readonly RenderItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, Math.floor((item.instanceTransforms?.length ?? 0) / 16)), 0);
}

function publish(value: AdvancedGalleryRuntime): void {
  window.__G3D_V9_ADVANCED_EXAMPLES_GALLERY__ = value;
}

function showError(message: string): void {
  const loading = document.querySelector<HTMLElement>("#loading");
  if (loading) {
    loading.textContent = message;
    loading.classList.add("is-error");
  }
}

function metric(label: string, value: string | number): string {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function list(items: readonly string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function chips(items: readonly string[]): string {
  return `<div class="chip-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
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
