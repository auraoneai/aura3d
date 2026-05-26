import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  createParallaxBarrierInterleavePlan,
  createParallaxBarrierPixelComposite,
  createStereoEffectPlan,
  createStereoCameraRig,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, quatFromEuler } from "@aura3d/scene";
import { type StereoControlState } from "../../stereo-effects/src/stereoControls.js";

declare global {
  interface Window {
    __a3dV8ParallaxBarrier?: V8ParallaxBarrierRuntime;
  }
}

interface V8ParallaxBarrierRuntime {
  readonly appId: "parallax-barrier";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly leftDrawCalls: number;
  readonly rightDrawCalls: number;
  readonly parallaxPixels: number;
  readonly interleaveAxis: "x" | "y";
  readonly stripPitchPx: number;
  readonly visibleDifference: number;
  readonly appliedConvergence: number;
  readonly stereoRigSource: "public-createStereoCameraRig";
  readonly stereoRigViews: number;
  readonly effectPlanSource: "public-createStereoEffectPlan";
  readonly effectComposition: string;
  readonly barrierMaskEnabled: boolean;
  readonly rendererCompositePixels: number;
  readonly compositeLeftPixels: number;
  readonly compositeRightPixels: number;
  readonly elapsedMs: number;
  readonly error?: string;
}

const APP_ID = "parallax-barrier" as const;
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;
const MAX_PIXEL_RATIO = 2;
const MAX_RENDER_EDGE = 2560;
const INTERLEAVE_AXIS = "y" as const;
const STRIP_PITCH_PX = 2;
const DEFAULT_BARRIER_MASK_ENABLED = false;
const BOUNDS: CameraFrameBounds = { min: [-1.7, -0.85, -1.4], max: [1.7, 1.45, 1.4] };
const CONTROLS: StereoControlState = {
  ipd: 0.17,
  convergence: 2.6,
  parallax: 0.64,
  mode: "side-by-side"
};

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const leftCanvas = document.getElementById("leftViewport");
  const rightCanvas = document.getElementById("rightViewport");
  const compositeCanvas = document.getElementById("compositeViewport");
  if (!(root instanceof HTMLElement) || !(leftCanvas instanceof HTMLCanvasElement) || !(rightCanvas instanceof HTMLCanvasElement) || !(compositeCanvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app, #leftViewport, #rightViewport, and #compositeViewport.`);
  }
  const barrierMaskEnabled = shouldEnableBarrierMask();
  document.body.classList.toggle("barrier-mask-enabled", barrierMaskEnabled);
  let renderSize = syncStereoCanvasRenderSize(leftCanvas, rightCanvas, compositeCanvas);
  const compositeContext = compositeCanvas.getContext("2d");
  if (!compositeContext) throw new Error(`${APP_ID} could not acquire a 2D composite context.`);

  const startedAt = performance.now();
  let frameCount = 0;
  let runtime: V8ParallaxBarrierRuntime = {
    appId: APP_ID,
    status: "loading",
    statusLabel: "Loading",
    frameCount: 0,
    drawCalls: 0,
    leftDrawCalls: 0,
    rightDrawCalls: 0,
    parallaxPixels: 0,
    interleaveAxis: INTERLEAVE_AXIS,
    stripPitchPx: STRIP_PITCH_PX,
    visibleDifference: 0,
    appliedConvergence: CONTROLS.convergence,
    stereoRigSource: "public-createStereoCameraRig",
    stereoRigViews: 0,
    effectPlanSource: "public-createStereoEffectPlan",
    effectComposition: barrierMaskEnabled ? "interleaved-mask" : "single-view-preview",
    barrierMaskEnabled,
    rendererCompositePixels: 0,
    compositeLeftPixels: 0,
    compositeRightPixels: 0,
    elapsedMs: 0
  };
  const publish = (patch: Partial<V8ParallaxBarrierRuntime>): void => {
    runtime = { ...runtime, ...patch, elapsedMs: Math.round(performance.now() - startedAt) };
    window.__a3dV8ParallaxBarrier = runtime;
    renderUi(root, runtime);
  };

  drawFallback(leftCanvas, [0.02, 0.028, 0.044, 1]);
  drawFallback(rightCanvas, [0.024, 0.018, 0.036, 1]);
  const barrierPlan = createParallaxBarrierInterleavePlan({
    axis: INTERLEAVE_AXIS,
    stripPitchPx: STRIP_PITCH_PX,
    dutyCycle: 0.5,
    rightOpacity: 1
  });
  applyBarrierPlan(leftCanvas, rightCanvas, barrierPlan, barrierMaskEnabled);
  publish({});

  try {
    const [leftRenderer, rightRenderer] = await Promise.all([
      A3DRenderer.create({ canvas: leftCanvas, width: renderSize.width, height: renderSize.height, backend: "webgl2", clearColor: [0.006, 0.008, 0.012, 1] }),
      A3DRenderer.create({ canvas: rightCanvas, width: renderSize.width, height: renderSize.height, backend: "webgl2", clearColor: [0.006, 0.008, 0.012, 1] })
    ]);
    const leftResources = createResources("left");
    const rightResources = createResources("right");
    publish({ status: "ready", statusLabel: "Renderers ready" });

    const render = (now: number): void => {
      try {
        const time = now / 1000;
        const nextSize = syncStereoCanvasRenderSize(leftCanvas, rightCanvas, compositeCanvas);
        if (nextSize.width !== renderSize.width || nextSize.height !== renderSize.height) {
          renderSize = nextSize;
          leftRenderer.resize(renderSize.width, renderSize.height);
          rightRenderer.resize(renderSize.width, renderSize.height);
        }
        const baseFrame = computePerspectiveCameraFrame(BOUNDS, renderSize, {
          yawRadians: -0.42,
          pitchRadians: -0.12,
          paddingRatio: 0.12,
          fovYRadians: 0.64,
          nearPadding: 0.16,
          farPadding: 2.6
        });
        const appliedConvergence = Math.max(CONTROLS.convergence, baseFrame.near + 0.25);
        const effectPlan = createStereoEffectPlan({
          mode: "parallax-barrier",
          width: renderSize.width * 2,
          height: renderSize.height,
          eyeSeparation: CONTROLS.ipd,
          convergenceDistance: appliedConvergence,
          parallaxStrength: CONTROLS.parallax,
          parallaxBarrierAxis: barrierPlan.axis,
          stripPitchPx: barrierPlan.stripPitchPx
        });
        const stereoRig = createStereoCameraRig({
          frame: baseFrame,
          viewport: { x: 0, y: 0, width: renderSize.width * 2, height: renderSize.height },
          eyeSeparation: CONTROLS.ipd * Math.max(0.01, CONTROLS.parallax),
          convergenceDistance: appliedConvergence,
          layout: "side-by-side"
        });
        const [leftEye, rightEye] = stereoRig.views;
        const leftDiagnostics = leftRenderer.render({
          source: createSource(leftResources, time, leftEye.cameraPosition),
          camera: { viewProjectionMatrix: leftEye.viewProjectionMatrix, viewMatrix: leftEye.viewMatrix, projectionMatrix: leftEye.projectionMatrix }
        });
        const rightDiagnostics = rightRenderer.render({
          source: createSource(rightResources, time, rightEye.cameraPosition),
          camera: { viewProjectionMatrix: rightEye.viewProjectionMatrix, viewMatrix: rightEye.viewMatrix, projectionMatrix: rightEye.projectionMatrix }
        });
        const composite = barrierMaskEnabled
          ? createParallaxBarrierPixelComposite({
            width: renderSize.width,
            height: renderSize.height,
            leftPixels: leftRenderer.device.readPixels(0, 0, renderSize.width, renderSize.height),
            rightPixels: rightRenderer.device.readPixels(0, 0, renderSize.width, renderSize.height),
            axis: barrierPlan.axis,
            stripPitchPx: barrierPlan.stripPitchPx,
            dutyCycle: barrierPlan.dutyCycle,
            flipY: true
          })
          : undefined;
        if (composite) {
          compositeContext.putImageData(new ImageData(composite.pixels, composite.width, composite.height), 0, 0);
        }
        frameCount += 1;
        runtime = {
          appId: APP_ID,
          status: frameCount === 1 ? "ready" : "running",
          statusLabel: frameCount === 1 ? "Ready" : "Running",
          frameCount,
          drawCalls: leftDiagnostics.drawCalls + rightDiagnostics.drawCalls,
          leftDrawCalls: leftDiagnostics.drawCalls,
          rightDrawCalls: rightDiagnostics.drawCalls,
          parallaxPixels: Number((CONTROLS.ipd * CONTROLS.parallax * 180).toFixed(1)),
          interleaveAxis: barrierPlan.axis,
          stripPitchPx: STRIP_PITCH_PX,
          visibleDifference: Number((CONTROLS.ipd * CONTROLS.parallax * 100).toFixed(2)),
          appliedConvergence,
          stereoRigSource: "public-createStereoCameraRig",
          stereoRigViews: stereoRig.views.length,
          effectPlanSource: "public-createStereoEffectPlan",
          effectComposition: composite?.composition ?? (barrierMaskEnabled ? effectPlan.composition : "single-view-preview"),
          barrierMaskEnabled,
          rendererCompositePixels: composite ? composite.width * composite.height : 0,
          compositeLeftPixels: composite?.leftPixelCount ?? 0,
          compositeRightPixels: composite?.rightPixelCount ?? 0,
          elapsedMs: Math.round(performance.now() - startedAt)
        };
        window.__a3dV8ParallaxBarrier = runtime;
        if (frameCount === 1 || frameCount % 12 === 0) renderUi(root, runtime);
        requestAnimationFrame(render);
      } catch (error) {
        publish({ status: "error", statusLabel: "Error", error: formatError(error) });
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    publish({ status: "error", statusLabel: "Error", error: formatError(error) });
  }
}

function syncStereoCanvasRenderSize(
  leftCanvas: HTMLCanvasElement,
  rightCanvas: HTMLCanvasElement,
  compositeCanvas: HTMLCanvasElement
): { readonly width: number; readonly height: number } {
  const rect = leftCanvas.getBoundingClientRect();
  const cssWidth = rect.width > 0 ? rect.width : FALLBACK_WIDTH;
  const cssHeight = rect.height > 0 ? rect.height : FALLBACK_HEIGHT;
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, MAX_RENDER_EDGE / Math.max(cssWidth * pixelRatio, cssHeight * pixelRatio));
  const width = Math.max(1, Math.round(cssWidth * pixelRatio * edgeScale));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio * edgeScale));
  if (leftCanvas.width !== width) leftCanvas.width = width;
  if (leftCanvas.height !== height) leftCanvas.height = height;
  if (rightCanvas.width !== width) rightCanvas.width = width;
  if (rightCanvas.height !== height) rightCanvas.height = height;
  if (compositeCanvas.width !== width) compositeCanvas.width = width;
  if (compositeCanvas.height !== height) compositeCanvas.height = height;
  return { width, height };
}

interface BarrierResources {
  readonly cube: Geometry;
  readonly sphere: Geometry;
  readonly cylinder: Geometry;
  readonly floor: PBRMaterial;
  readonly red: PBRMaterial;
  readonly cyan: PBRMaterial;
  readonly gold: PBRMaterial;
  readonly glass: PBRMaterial;
  readonly dark: PBRMaterial;
}

function createResources(eye: "left" | "right"): BarrierResources {
  const tint = eye === "left" ? 1 : 0.82;
  return {
    cube: Geometry.litCube(1),
    sphere: Geometry.uvSphere(0.5, 48, 24),
    cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 48 }),
    floor: new PBRMaterial({ name: `barrier-floor-${eye}`, baseColor: [0.06 * tint, 0.07 * tint, 0.085 * tint, 1], roughness: 0.58, metallic: 0.05 }),
    red: new PBRMaterial({ name: `barrier-red-${eye}`, baseColor: [0.9, 0.12 * tint, 0.1 * tint, 1], roughness: 0.28, clearcoatFactor: 0.35 }),
    cyan: new PBRMaterial({ name: `barrier-cyan-${eye}`, baseColor: [0.08 * tint, 0.68, 0.92, 1], roughness: 0.26, clearcoatFactor: 0.35 }),
    gold: new PBRMaterial({ name: `barrier-gold-${eye}`, baseColor: [1, 0.62, 0.18, 1], roughness: 0.22, metallic: 0.5 }),
    glass: new PBRMaterial({ name: `barrier-glass-${eye}`, baseColor: [0.46, 0.72, 1, 1], roughness: 0.08, clearcoatFactor: 0.8, transmissionFactor: 0.1 }),
    dark: new PBRMaterial({ name: `barrier-dark-${eye}`, baseColor: [0.02, 0.028, 0.04, 1], roughness: 0.5, metallic: 0.08 })
  };
}

function createSource(resources: BarrierResources, time: number, cameraPosition: readonly [number, number, number]): RenderSource {
  return {
    collectRenderItems: () => createItems(resources, time),
    collectedLights: createLights(),
    cameraPolicy: "require",
    cameraPosition,
    cameraFrameBounds: BOUNDS,
    environmentLighting: {
      color: [0.74, 0.8, 0.9],
      intensity: 0.38,
      proceduralMap: {
        skyColor: [0.08, 0.16, 0.3],
        horizonColor: [0.42, 0.68, 0.86],
        groundColor: [0.04, 0.045, 0.06],
        specularColor: [0.88, 0.94, 1],
        intensity: 0.48,
        specularIntensity: 0.86
      }
    },
    frustumCulling: false,
    postprocess: false
  };
}

function createItems(resources: BarrierResources, time: number): readonly RenderItem[] {
  const t = time * 0.85;
  return [
    { label: "barrier-floor", geometry: resources.cube, material: resources.floor, modelMatrix: composeMat4([0, -0.68, 0], [0, 0, 0, 1], [4.2, 0.05, 3.0]) },
    { label: "barrier-back", geometry: resources.cube, material: resources.dark, modelMatrix: composeMat4([0, 0.35, -1.48], [0, 0, 0, 1], [4.2, 2.1, 0.05]) },
    { label: "barrier-center-glass", geometry: resources.sphere, material: resources.glass, modelMatrix: composeMat4([0, 0.32 + Math.sin(t) * 0.06, 0], quatFromEuler(0, t, 0), [0.72, 0.72, 0.72]) },
    { label: "barrier-near-gold", geometry: resources.cube, material: resources.gold, modelMatrix: composeMat4([Math.sin(t) * 0.4, -0.2, 0.88], quatFromEuler(0.25, t, 0.1), [0.34, 0.34, 0.34]) },
    { label: "barrier-left-column", geometry: resources.cylinder, material: resources.cyan, modelMatrix: composeMat4([-0.95, -0.16, -0.36], [0, 0, 0, 1], [0.16, 0.9, 0.16]) },
    { label: "barrier-right-column", geometry: resources.cylinder, material: resources.red, modelMatrix: composeMat4([0.95, -0.16, -0.36], [0, 0, 0, 1], [0.16, 0.9, 0.16]) },
    { label: "barrier-far-left", geometry: resources.sphere, material: resources.red, modelMatrix: composeMat4([-1.32, -0.18, -0.9], [0, 0, 0, 1], [0.22, 0.22, 0.22]) },
    { label: "barrier-far-right", geometry: resources.sphere, material: resources.cyan, modelMatrix: composeMat4([1.32, -0.18, -0.9], [0, 0, 0, 1], [0.22, 0.22, 0.22]) }
  ];
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-barrier-key");
  key.intensity = 3.6;
  key.color = [1, 0.94, 0.84];
  const rim = new DirectionalLight("v8-barrier-rim");
  rim.intensity = 1.8;
  rim.color = [0.55, 0.74, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.2, 3.1, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2.2, 2.1, -1.8], direction: [0.58, -0.36, 0.73], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function renderUi(root: HTMLElement, runtime: V8ParallaxBarrierRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <p id="runtime-state" class="runtime-pill is-${runtime.status}">${runtime.statusLabel}</p>
      <h1>V8 Parallax Barrier</h1>
      <p>${runtime.barrierMaskEnabled ? "A3D-only interleaved stereo route for webgl_effects_parallaxbarrier parity work." : "Single-view preview. Add ?mask=1 to inspect the interleaved parallax barrier mask."}</p>
      <dl>
        <dt>Frames</dt><dd>${runtime.frameCount}</dd>
        <dt>Draw calls</dt><dd>${runtime.drawCalls}</dd>
        <dt>Left/right</dt><dd>${runtime.leftDrawCalls}/${runtime.rightDrawCalls}</dd>
        <dt>Interleave axis</dt><dd>${runtime.interleaveAxis}</dd>
        <dt>Strip pitch</dt><dd>${runtime.stripPitchPx}px</dd>
        <dt>Parallax</dt><dd>${runtime.parallaxPixels}px</dd>
        <dt>Convergence</dt><dd>${runtime.appliedConvergence.toFixed(1)}</dd>
        <dt>Rig views</dt><dd>${runtime.stereoRigViews}</dd>
        <dt>Composition</dt><dd>${escapeHtml(runtime.effectComposition)}</dd>
        <dt>Barrier mask</dt><dd>${runtime.barrierMaskEnabled ? "on" : "off"}</dd>
        <dt>Composite pixels</dt><dd>${runtime.rendererCompositePixels}</dd>
      </dl>
      <p>Rig: ${escapeHtml(runtime.stereoRigSource)}</p>
      <p>Effect plan: ${escapeHtml(runtime.effectPlanSource)}</p>
      ${runtime.error ? `<pre class="runtime-error">${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

function applyBarrierPlan(
  leftCanvas: HTMLCanvasElement,
  rightCanvas: HTMLCanvasElement,
  plan: ReturnType<typeof createParallaxBarrierInterleavePlan>,
  enabled: boolean
): void {
  if (!enabled) {
    leftCanvas.style.maskImage = "none";
    leftCanvas.style.setProperty("-webkit-mask-image", "none");
    rightCanvas.style.maskImage = "none";
    rightCanvas.style.setProperty("-webkit-mask-image", "none");
    rightCanvas.style.opacity = "0";
    rightCanvas.style.visibility = "hidden";
    document.body.style.removeProperty("--barrier-overlay-background");
    return;
  }
  leftCanvas.style.maskImage = plan.leftMaskImage;
  leftCanvas.style.setProperty("-webkit-mask-image", plan.leftMaskImage);
  rightCanvas.style.maskImage = plan.rightMaskImage;
  rightCanvas.style.setProperty("-webkit-mask-image", plan.rightMaskImage);
  rightCanvas.style.opacity = String(plan.rightOpacity);
  rightCanvas.style.visibility = "visible";
  document.body.style.setProperty("--barrier-overlay-background", plan.overlayBackground);
}

function shouldEnableBarrierMask(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mask") === "1" || params.get("barrier") === "1") return true;
  if (params.get("mask") === "0" || params.get("barrier") === "0") return false;
  return DEFAULT_BARRIER_MASK_ENABLED;
}

function drawFallback(canvas: HTMLCanvasElement, color: readonly [number, number, number, number]): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
