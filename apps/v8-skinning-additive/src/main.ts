import { createGLTFSceneAnimationMixer, loadV6GLTFRenderPipeline } from "@galileo3d/assets";
import { AnimationMotionQualityTracker } from "@galileo3d/animation";
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/v9";
import { DirectionalLight, composeMat4, multiplyMat4, type Mat4 } from "@galileo3d/scene";
import {
  createAdditiveLayerController,
  createMaskedAdditiveClips,
  type AdditiveLayerControls,
  type AdditiveLayerSelection
} from "./additiveLayers.js";

declare global {
  interface Window {
    __g3dV8SkinningAdditive?: SkinningAdditiveRuntime;
  }
}

type LoadedPipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;

interface SkinningAdditiveRuntime {
  readonly appId: "v8-skinning-additive";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly loadingStep: string;
  readonly error?: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly animationTime: number;
  readonly baseClip: string;
  readonly additiveClip: string;
  readonly maskName: string;
  readonly layerWeight: number;
  readonly maskedTrackCount: number;
  readonly tracksApplied: number;
  readonly skinningPalettesUpdated: number;
  readonly motionSamples: number;
  readonly motionTimeRange: number;
  readonly poseDiversityScore: number;
  readonly motionHealthy: boolean;
  readonly controls: AdditiveLayerControls;
}

const APP_ID = "v8-skinning-additive" as const;
const ASSET_URL = "/fixtures/v8/assets/character/robot-expressive.glb";
const FRAME_BOUNDS: CameraFrameBounds = { min: [-0.9, -0.12, -0.9], max: [0.9, 2.15, 0.9] };
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
  let controls: AdditiveLayerControls = {
    playing: true,
    speed: 1,
    orbitYaw: -0.4,
    baseClip: "Walking",
    additiveClip: "Wave",
    maskName: "upper body",
    layerWeight: 0.65
  };
  let runtime = createRuntime("loading", "drawing fallback WebGL frame", controls);
  let raf = 0;
  let frameCount = 0;
  let animationTime = 0;
  let lastNow = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsLast = performance.now();
  let lastPublish = 0;
  let controller: ReturnType<typeof createAdditiveLayerController> | undefined;
  const motionTracker = new AnimationMotionQualityTracker({
    minimumSamples: 6,
    minimumTimeRangeSeconds: 0.12,
    minimumPoseDiversityScore: 0.01
  });

  const publish = (patch: Partial<SkinningAdditiveRuntime>): void => {
    runtime = { ...runtime, ...patch, controls: patch.controls ?? controls };
    window.__g3dV8SkinningAdditive = runtime;
    renderUi(root, runtime, controller, setControls);
  };
  const setControls = (next: AdditiveLayerControls): void => {
    controls = next;
    publish({ controls });
  };

  drawFallbackFrame(canvas);
  publish({});

  try {
    publish({ status: "loading", loadingStep: `creating G3D renderer for ${ASSET_URL}` });
    const renderer = await G3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.007, 0.009, 0.013, 1]
    });
    const pipeline = await loadV6GLTFRenderPipeline({
      url: ASSET_URL,
      assetId: "v8-skinning-additive-robot",
      assetName: "Robot Expressive Additive Layers",
      width: WIDTH,
      height: HEIGHT,
      rendererInput: {
        cameraPolicy: "require",
        cameraFrameBounds: FRAME_BOUNDS,
        frame: { yawRadians: -0.4, pitchRadians: -0.08, paddingRatio: 0.1, fovYRadians: 0.54 },
        postprocess: false
      }
    });
    const maskedClips = createMaskedAdditiveClips(pipeline.asset.animations);
    controller = createAdditiveLayerController([...pipeline.asset.animations, ...maskedClips]);
    controls = {
      ...controls,
      baseClip: controller.baseClips.includes(controls.baseClip) ? controls.baseClip : controller.baseClips[0]!,
      additiveClip: controller.additiveClips.includes(controls.additiveClip) ? controls.additiveClip : controller.additiveClips[0]!,
      maskName: controller.masks.some((mask) => mask.name === controls.maskName) ? controls.maskName : controller.masks[0]!.name
    };
    const animationRuntime = createGLTFSceneAnimationMixer({
      scene: pipeline.resources.scene,
      clips: [...pipeline.asset.animations, ...maskedClips],
      asset: pipeline.asset,
      autoPlay: false
    });
    const stage = createStageItems();

    publish({ status: "ready", loadingStep: "loaded base locomotion and masked additive clips", controls });

    const render = (now: number): void => {
      try {
        if (!controller) throw new Error("Additive layer controller was not initialized.");
        if (lastNow === 0) lastNow = now;
        const delta = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        if (controls.playing) animationTime += delta * controls.speed;
        const selection = controller.resolve(controls);
        const samples = [
          { clipName: selection.baseClipName, time: animationTime, weight: 1 },
          ...(controls.layerWeight > 0
            ? [{ clipName: selection.maskedClipName, time: animationTime, weight: controls.layerWeight, additive: true }]
            : [])
        ];
        const apply = animationRuntime.applyClipSamples(samples).applyResult;
        const motion = motionTracker.record({
          timeSeconds: animationTime,
          tracksApplied: apply.tracksApplied,
          skinningPalettesUpdated: apply.skinningPalettesUpdated,
          stride: controls.layerWeight * 0.05,
          animatedSubjects: controls.playing ? 1 : 0
        });
        const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
          yawRadians: controls.orbitYaw,
          pitchRadians: -0.08,
          paddingRatio: 0.1,
          fovYRadians: 0.54,
          nearPadding: 0.16,
          farPadding: 2.2
        });
        const placement = composeMat4([0, 0, 0], [0, 0.04, 0, 0.9992], [0.2, 0.2, 0.2]);
        const source: RenderSource = {
          collectRenderItems: () => [...collectImportedItems(pipeline, placement), ...stage.items(controls.layerWeight)],
          collectedLights: createLights(),
          environmentLighting: false,
          cameraPolicy: "require",
          cameraPosition: frame.cameraPosition,
          cameraFrameBounds: FRAME_BOUNDS,
          frustumCulling: false,
          postprocess: false
        };
        const result = renderer.renderFrame({
          source,
          camera: { viewProjectionMatrix: frame.viewProjectionMatrix, viewMatrix: frame.viewMatrix, projectionMatrix: frame.projectionMatrix },
          metadata: {
            assetId: APP_ID,
            assetName: "V8 Skinning Additive",
            assetUri: "/apps/v8-skinning-additive/",
            meshCount: pipeline.metadata.meshCount,
            primitiveCount: pipeline.metadata.primitiveCount,
            materialCount: pipeline.metadata.materialCount + 3,
            textureCount: pipeline.metadata.textureCount,
            imageCount: pipeline.metadata.imageCount,
            animationCount: pipeline.metadata.animationCount,
            skinCount: pipeline.metadata.skinCount,
            morphTargetCount: pipeline.metadata.morphTargetCount,
            extensionsUsed: pipeline.metadata.extensionsUsed,
            environmentId: "v8-fast-studio",
            hdrEnvironmentUri: "deferred"
          }
        });
        frameCount += 1;
        fpsFrames += 1;
        if (now - fpsLast >= 500) {
          fps = fpsFrames * 1000 / (now - fpsLast);
          fpsFrames = 0;
          fpsLast = now;
        }
        runtime = createRunningRuntime(frameCount === 1 ? "ready" : "running", result.diagnostics.drawCalls, fps, animationTime, controls, selection, apply.tracksApplied, apply.skinningPalettesUpdated, motion);
        window.__g3dV8SkinningAdditive = runtime;
        if (frameCount === 1 || now - lastPublish > 250) {
          renderUi(root, runtime, controller, setControls);
          lastPublish = now;
        }
        raf = requestAnimationFrame(render);
      } catch (error) {
        cancelAnimationFrame(raf);
        publish({ status: "error", loadingStep: "additive animation loop failed", error: formatError(error) });
      }
    };
    raf = requestAnimationFrame(render);
  } catch (error) {
    cancelAnimationFrame(raf);
    publish({ status: "error", loadingStep: `failed while loading ${ASSET_URL}`, error: formatError(error) });
  }

  function createRunningRuntime(
    status: "ready" | "running",
    drawCalls: number,
    nextFps: number,
    time: number,
    nextControls: AdditiveLayerControls,
    selection: AdditiveLayerSelection,
    tracksApplied: number,
    skinningPalettesUpdated: number,
    motion: ReturnType<AnimationMotionQualityTracker["report"]>
  ): SkinningAdditiveRuntime {
    return {
      appId: APP_ID,
      status,
      loadingStep: status === "ready" ? "first additive skinning frame rendered" : "applying masked additive layer over base locomotion",
      frameCount,
      drawCalls,
      fps: nextFps,
      animationTime: Number(time.toFixed(3)),
      baseClip: selection.baseClipName,
      additiveClip: selection.additiveClipName,
      maskName: selection.maskName,
      layerWeight: nextControls.layerWeight,
      maskedTrackCount: selection.maskedTrackCount,
      tracksApplied,
      skinningPalettesUpdated,
      motionSamples: motion.sampleCount,
      motionTimeRange: motion.timeRangeSeconds,
      poseDiversityScore: motion.poseDiversityScore,
      motionHealthy: motion.healthy,
      controls: nextControls
    };
  }
}

function createRuntime(status: SkinningAdditiveRuntime["status"], loadingStep: string, controls: AdditiveLayerControls): SkinningAdditiveRuntime {
  return {
    appId: APP_ID,
    status,
    loadingStep,
    frameCount: 0,
    drawCalls: 0,
    fps: 0,
    animationTime: 0,
    baseClip: controls.baseClip,
    additiveClip: controls.additiveClip,
    maskName: controls.maskName,
    layerWeight: controls.layerWeight,
    maskedTrackCount: 0,
    tracksApplied: 0,
    skinningPalettesUpdated: 0,
    motionSamples: 0,
    motionTimeRange: 0,
    poseDiversityScore: 0,
    motionHealthy: false,
    controls
  };
}

function renderUi(
  root: HTMLElement,
  runtime: SkinningAdditiveRuntime,
  controller: ReturnType<typeof createAdditiveLayerController> | undefined,
  onControls: (controls: AdditiveLayerControls) => void
): void {
  const baseClips = controller?.baseClips ?? [runtime.controls.baseClip];
  const additiveClips = controller?.additiveClips ?? [runtime.controls.additiveClip];
  const masks = controller?.masks.map((mask) => mask.name) ?? [runtime.controls.maskName];
  root.innerHTML = `
    <section class="panel">
      <div class="header">
        <h1>V8 Skinning Additive</h1>
        <span class="status ${runtime.status}">${runtime.status}</span>
      </div>
      <div class="metrics">
        ${metric("frames", String(runtime.frameCount))}
        ${metric("draw calls", String(runtime.drawCalls))}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("weight", runtime.layerWeight.toFixed(2))}
        ${metric("mask tracks", String(runtime.maskedTrackCount))}
        ${metric("palettes", String(runtime.skinningPalettesUpdated))}
        ${metric("motion", runtime.motionHealthy ? "healthy" : "sampling")}
        ${metric("pose", runtime.poseDiversityScore.toFixed(3))}
      </div>
      <div class="controls">
        <button id="play-toggle" type="button">${runtime.controls.playing ? "Pause" : "Play"}</button>
        <label>Base
          <select id="base-select">${baseClips.map((name) => option(name, runtime.controls.baseClip)).join("")}</select>
        </label>
        <label>Additive
          <select id="additive-select">${additiveClips.map((name) => option(name, runtime.controls.additiveClip)).join("")}</select>
        </label>
        <label>Mask
          <select id="mask-select">${masks.map((name) => option(name, runtime.controls.maskName)).join("")}</select>
        </label>
        <label>Layer Weight ${runtime.controls.layerWeight.toFixed(2)}
          <input id="weight-range" type="range" min="0" max="1" step="0.01" value="${runtime.controls.layerWeight}">
        </label>
        <label>Speed ${runtime.controls.speed.toFixed(2)}x
          <input id="speed-range" type="range" min="0" max="2" step="0.05" value="${runtime.controls.speed}">
        </label>
        <label>Camera Orbit
          <input id="orbit-range" type="range" min="-1.4" max="1.1" step="0.01" value="${runtime.controls.orbitYaw}">
        </label>
      </div>
      <p class="details">${escapeHtml(runtime.loadingStep)}</p>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
  bindUi(root, runtime.controls, onControls);
}

function bindUi(root: HTMLElement, controls: AdditiveLayerControls, onControls: (controls: AdditiveLayerControls) => void): void {
  root.querySelector("#play-toggle")?.addEventListener("click", () => onControls({ ...controls, playing: !controls.playing }));
  bindSelect(root, "#base-select", (value) => onControls({ ...controls, baseClip: value }));
  bindSelect(root, "#additive-select", (value) => onControls({ ...controls, additiveClip: value }));
  bindSelect(root, "#mask-select", (value) => onControls({ ...controls, maskName: value }));
  bindRange(root, "#weight-range", (value) => onControls({ ...controls, layerWeight: value }));
  bindRange(root, "#speed-range", (value) => onControls({ ...controls, speed: value }));
  bindRange(root, "#orbit-range", (value) => onControls({ ...controls, orbitYaw: value }));
}

function bindSelect(root: HTMLElement, selector: string, handler: (value: string) => void): void {
  root.querySelector(selector)?.addEventListener("change", (event) => {
    if (event.target instanceof HTMLSelectElement) handler(event.target.value);
  });
}

function bindRange(root: HTMLElement, selector: string, handler: (value: number) => void): void {
  root.querySelector(selector)?.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement) handler(Number(event.target.value));
  });
}

function option(value: string, selected: string): string {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function collectImportedItems(pipeline: LoadedPipeline, placement: Mat4): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `v8-additive:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function createStageItems(): { readonly items: (weight: number) => readonly RenderItem[] } {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({ name: "v8-additive-floor", baseColor: [0.065, 0.075, 0.085, 1], roughness: 0.42, metallic: 0.04, environmentIntensity: 0.75 });
  const base = new PBRMaterial({ name: "v8-additive-base-marker", baseColor: [0.18, 0.31, 0.5, 1], roughness: 0.32, metallic: 0.18, environmentIntensity: 0.8 });
  const layer = new PBRMaterial({ name: "v8-additive-layer-marker", baseColor: [0.94, 0.58, 0.14, 1], roughness: 0.28, metallic: 0.1, environmentIntensity: 0.8 });
  return {
    items: (weight) => [
      { label: "v8-additive-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.07, 0], [0, 0, 0, 1], [3.1, 0.04, 2.1]) },
      { label: "v8-additive-base-marker", geometry: cube, material: base, modelMatrix: composeMat4([-1.18, 0.34, -0.62], [0, 0, 0, 1], [0.06, 0.85, 0.06]) },
      { label: "v8-additive-layer-marker", geometry: cube, material: layer, modelMatrix: composeMat4([1.18, 0.18 + weight * 0.38, -0.62], [0, 0, 0, 1], [0.08, 0.32 + weight * 0.55, 0.08]) }
    ]
  };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-additive-key");
  key.intensity = 4.5;
  key.color = [1, 0.94, 0.82];
  const fill = new DirectionalLight("v8-additive-fill");
  fill.intensity = 2.2;
  fill.color = [0.62, 0.8, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.4, 3.4, 2.2], direction: [-0.42, -0.72, -0.52], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.5, 2.2, -1.6], direction: [0.6, -0.34, 0.72], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.007, 0.009, 0.013, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  drawRect(gl, 0, 0, canvas.width, Math.round(canvas.height * 0.23), [0.022, 0.027, 0.038, 1]);
  drawRect(gl, Math.round(canvas.width * 0.22), Math.round(canvas.height * 0.35), Math.round(canvas.width * 0.11), Math.round(canvas.height * 0.35), [0.2, 0.38, 0.64, 1]);
  drawRect(gl, Math.round(canvas.width * 0.43), Math.round(canvas.height * 0.25), Math.round(canvas.width * 0.15), Math.round(canvas.height * 0.48), [0.86, 0.88, 0.9, 1]);
  drawRect(gl, Math.round(canvas.width * 0.66), Math.round(canvas.height * 0.3), Math.round(canvas.width * 0.13), Math.round(canvas.height * 0.4), [0.94, 0.58, 0.14, 1]);
  gl.disable(gl.SCISSOR_TEST);
}

function drawRect(gl: WebGL2RenderingContext, x: number, y: number, width: number, height: number, color: readonly [number, number, number, number]): void {
  gl.scissor(x, y, width, height);
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
