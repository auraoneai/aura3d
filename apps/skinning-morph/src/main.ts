import { createGLTFSceneAnimationRuntime, loadV6GLTFRenderPipeline } from "@aura3d/assets";
import { AnimationMotionQualityTracker } from "@aura3d/animation";
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import {
  clamp,
  createMorphControlState,
  evaluateMorphControls,
  type MorphControlState
} from "./morphControls.js";

declare global {
  interface Window {
    __a3dV8SkinningMorph?: V8SkinningMorphRuntime;
  }
}

type LoadedPipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;

interface V8SkinningMorphRuntime {
  appId: "skinning-morph";
  status: "loading" | "ready" | "running" | "error";
  statusLabel: string;
  frameCount: number;
  drawCalls: number;
  fps: number;
  elapsedMs: number;
  weights: readonly [number, number, number];
  morphLabels: readonly string[];
  morphTargetCount: number;
  animatedMorphClip: boolean;
  clipName: string;
  tracksApplied: number;
  morphWeightTracksApplied: number;
  skinningPalettesUpdated: number;
  motionSamples: number;
  motionTimeRange: number;
  poseDiversityScore: number;
  motionHealthy: boolean;
  renderer: "a3d-webgl2";
  fixture: string;
  error?: string;
}

const APP_ID = "skinning-morph" as const;
const ASSET_URL = "/fixtures/threejs-parity/assets/character/robot-expressive.glb";
const MORPH_TARGET = "Head.weights";
const FRAME_BOUNDS: CameraFrameBounds = { min: [-2.6, -0.2, -2], max: [2.6, 5.2, 2] };
const WIDTH = 1280;
const HEIGHT = 720;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  drawFallbackFrame(canvas);

  const state = createMorphControlState();
  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading imported robot morph route", startedAt, state, [0, 0, 0]);
  let frameCount = 0;
  let animationTime = 0;
  let lastNow = 0;
  let fps = 0;
  let fpsFrom = 0;
  let fpsFrames = 0;
  let lastUi = 0;
  let animationFrame = 0;
  const motionTracker = new AnimationMotionQualityTracker({
    minimumSamples: 6,
    minimumTimeRangeSeconds: 0.12,
    minimumPoseDiversityScore: 0.01
  });

  const publish = (): void => {
    window.__a3dV8SkinningMorph = runtime;
    renderUi(root, runtime, state);
    bindUi(root, state, publish);
  };
  publish();

  try {
    const renderer = await A3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const pipeline = await loadV6GLTFRenderPipeline({
      url: ASSET_URL,
      assetId: "skinning-morph-robot-expressive",
      assetName: "Robot Expressive Skinning Morph",
      width: WIDTH,
      height: HEIGHT,
      rendererInput: {
        cameraPolicy: "require",
        cameraFrameBounds: FRAME_BOUNDS,
        frame: { yawRadians: -0.34, pitchRadians: -0.08, paddingRatio: 0.16, fovYRadians: 0.68 },
        postprocess: false
      }
    });
    const animationRuntime = createGLTFSceneAnimationRuntime({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset
    });
    const morphController = animationRuntime.createMorphTargetController({
      target: MORPH_TARGET,
      labels: ["smile", "blink", "jaw"],
      initialWeights: [0, 0, 0]
    });
    const bodyClip = selectBodyClip(pipeline.asset.animations);
    const stage = createStageItems();

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        animationTime += delta * state.speed;

        const weights = evaluateMorphControls(state, animationTime).weights;
        const bodyApply = animationRuntime.applyClip(bodyClip, bodyClip.duration > 0 ? animationTime % bodyClip.duration : 0);
        const morphApply = morphController.setWeights(weights).apply(animationTime, "manual Head.weights morph");
        const tracksApplied = bodyApply.tracksApplied + morphApply.tracksApplied;
        const morphWeightTracksApplied = bodyApply.morphWeightTracksApplied + morphApply.morphWeightTracksApplied;
        const skinningPalettesUpdated = Math.max(bodyApply.skinningPalettesUpdated, morphApply.skinningPalettesUpdated);
        const motion = motionTracker.record({
          timeSeconds: animationTime,
          tracksApplied,
          skinningPalettesUpdated,
          stride: weights.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, weights.length),
          animatedSubjects: state.autoAnimate ? 1 : 0
        });
        const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
          yawRadians: -0.34,
          pitchRadians: -0.08,
          paddingRatio: 0.16,
          fovYRadians: 0.68,
          nearPadding: 0.16,
          farPadding: 2.2
        });
        const placement = composeMat4([0, 0, 0], [0, 0.04, 0, 0.9992], [1, 1, 1]);
        const source: RenderSource = {
          collectRenderItems: () => [
            ...collectImportedItems(pipeline, placement),
            ...stage.items(weights)
          ],
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
            assetName: "V8 Skinning Morph",
            assetUri: "/apps/skinning-morph/",
            meshCount: pipeline.metadata.meshCount,
            primitiveCount: pipeline.metadata.primitiveCount,
            materialCount: pipeline.metadata.materialCount + stage.materialCount,
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
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, state, weights, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          morphTargetCount: pipeline.metadata.morphTargetCount,
          clipName: bodyClip.name,
          tracksApplied,
          morphWeightTracksApplied,
          skinningPalettesUpdated,
          motionSamples: motion.sampleCount,
          motionTimeRange: motion.timeRangeSeconds,
          poseDiversityScore: motion.poseDiversityScore,
          motionHealthy: motion.healthy
        });
        window.__a3dV8SkinningMorph = runtime;
        if (frameCount === 1 || now - lastUi > 220) {
          publish();
          lastUi = now;
        }
        animationFrame = requestAnimationFrame(render);
      } catch (error) {
        cancelAnimationFrame(animationFrame);
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish();
      }
    };
    animationFrame = requestAnimationFrame(render);
  } catch (error) {
    cancelAnimationFrame(animationFrame);
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createRuntime(
  status: V8SkinningMorphRuntime["status"],
  statusLabel: string,
  startedAt: number,
  state: MorphControlState,
  weights: readonly [number, number, number],
  counters: Partial<Pick<V8SkinningMorphRuntime, "frameCount" | "drawCalls" | "fps" | "morphTargetCount" | "clipName" | "tracksApplied" | "morphWeightTracksApplied" | "skinningPalettesUpdated" | "motionSamples" | "motionTimeRange" | "poseDiversityScore" | "motionHealthy">> = {}
): V8SkinningMorphRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: counters.frameCount ?? 0,
    drawCalls: counters.drawCalls ?? 0,
    fps: counters.fps ?? 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    weights,
    morphLabels: ["smile", "blink", "jaw"],
    morphTargetCount: counters.morphTargetCount ?? 0,
    animatedMorphClip: state.autoAnimate,
    clipName: counters.clipName ?? "pending",
    tracksApplied: counters.tracksApplied ?? 0,
    morphWeightTracksApplied: counters.morphWeightTracksApplied ?? 0,
    skinningPalettesUpdated: counters.skinningPalettesUpdated ?? 0,
    motionSamples: counters.motionSamples ?? 0,
    motionTimeRange: counters.motionTimeRange ?? 0,
    poseDiversityScore: counters.poseDiversityScore ?? 0,
    motionHealthy: counters.motionHealthy ?? false,
    renderer: "a3d-webgl2",
    fixture: "imported robot-expressive.glb skinning + Head.weights morph targets"
  };
}

function selectBodyClip(clips: LoadedPipeline["asset"]["animations"]): LoadedPipeline["asset"]["animations"][number] {
  const clip = clips.find((item) => /^walking$/i.test(item.name))
    ?? clips.find((item) => /dance|walk|idle/i.test(item.name))
    ?? clips[0];
  if (!clip) {
    throw new Error("Imported morph route requires at least one robot animation clip.");
  }
  return clip;
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
      label: `v8-morph:${node.name}`,
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

function createStageItems(): { readonly materialCount: number; readonly items: (weights: readonly [number, number, number]) => readonly RenderItem[] } {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({ name: "v8-morph-floor", baseColor: [0.06, 0.075, 0.09, 1], roughness: 0.42, metallic: 0.04, environmentIntensity: 0.72 });
  const smile = new PBRMaterial({ name: "v8-morph-smile-meter", baseColor: [0.2, 0.68, 0.88, 1], roughness: 0.28, metallic: 0.12, environmentIntensity: 0.78 });
  const blink = new PBRMaterial({ name: "v8-morph-blink-meter", baseColor: [0.94, 0.58, 0.12, 1], roughness: 0.28, metallic: 0.12, environmentIntensity: 0.78 });
  const jaw = new PBRMaterial({ name: "v8-morph-jaw-meter", baseColor: [0.34, 0.88, 0.56, 1], roughness: 0.28, metallic: 0.12, environmentIntensity: 0.78 });
  return {
    materialCount: 4,
    items: ([smileWeight, blinkWeight, jawWeight]) => [
      { label: "v8-morph-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.07, 0], [0, 0, 0, 1], [3.1, 0.04, 2.1]) },
      { label: "v8-morph-smile-meter", geometry: cube, material: smile, modelMatrix: composeMat4([-1.18, 0.13 + smileWeight * 0.32, -0.64], [0, 0, 0, 1], [0.07, 0.28 + smileWeight * 0.55, 0.07]) },
      { label: "v8-morph-blink-meter", geometry: cube, material: blink, modelMatrix: composeMat4([-1.02, 0.13 + blinkWeight * 0.32, -0.64], [0, 0, 0, 1], [0.07, 0.28 + blinkWeight * 0.55, 0.07]) },
      { label: "v8-morph-jaw-meter", geometry: cube, material: jaw, modelMatrix: composeMat4([-0.86, 0.13 + jawWeight * 0.32, -0.64], [0, 0, 0, 1], [0.07, 0.28 + jawWeight * 0.55, 0.07]) }
    ]
  };
}

function renderUi(root: HTMLElement, runtime: V8SkinningMorphRuntime, state: MorphControlState): void {
  window.__a3dV8SkinningMorph = runtime;
  root.innerHTML = `
    <section class="panel">
      <h1>V8 Skinning Morph</h1>
      <span class="status" data-state="${runtime.status}">${escapeHtml(runtime.statusLabel)}</span>
      <div class="metrics">
        ${metric("Frames", runtime.frameCount)}
        ${metric("Draw calls", runtime.drawCalls)}
        ${metric("FPS", runtime.fps.toFixed(1))}
        ${metric("Targets", runtime.morphTargetCount)}
        ${metric("Smile", runtime.weights[0].toFixed(2))}
        ${metric("Blink", runtime.weights[1].toFixed(2))}
        ${metric("Jaw", runtime.weights[2].toFixed(2))}
        ${metric("Morph tracks", runtime.morphWeightTracksApplied)}
        ${metric("Palettes", runtime.skinningPalettesUpdated)}
        ${metric("Motion", runtime.motionHealthy ? "healthy" : "sampling")}
        ${metric("Pose", runtime.poseDiversityScore.toFixed(3))}
        ${metric("Clip", runtime.clipName)}
      </div>
      <label>Smile ${state.smile.toFixed(2)}<input id="morph-smile" type="range" min="0" max="1" step="0.01" value="${state.smile}"></label>
      <label>Blink ${state.blink.toFixed(2)}<input id="morph-blink" type="range" min="0" max="1" step="0.01" value="${state.blink}"></label>
      <label>Jaw ${state.jaw.toFixed(2)}<input id="morph-jaw" type="range" min="0" max="1" step="0.01" value="${state.jaw}"></label>
      <label>Speed ${state.speed.toFixed(2)}<input id="morph-speed" type="range" min="0.1" max="2.5" step="0.05" value="${state.speed}"></label>
      <label><span><input id="morph-auto" type="checkbox" ${state.autoAnimate ? "checked" : ""}> Animated morph clip</span></label>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

function bindUi(root: HTMLElement, state: MorphControlState, afterUpdate: () => void): void {
  bindRange(root, "#morph-smile", (value) => { state.smile = clamp(value); afterUpdate(); });
  bindRange(root, "#morph-blink", (value) => { state.blink = clamp(value); afterUpdate(); });
  bindRange(root, "#morph-jaw", (value) => { state.jaw = clamp(value); afterUpdate(); });
  bindRange(root, "#morph-speed", (value) => { state.speed = clamp(value, 0.1, 2.5); afterUpdate(); });
  root.querySelector<HTMLInputElement>("#morph-auto")?.addEventListener("change", (event) => {
    state.autoAnimate = (event.currentTarget as HTMLInputElement).checked;
    afterUpdate();
  });
}

function bindRange(root: HTMLElement, selector: string, update: (value: number) => void): void {
  root.querySelector<HTMLInputElement>(selector)?.addEventListener("input", (event) => {
    update(Number((event.currentTarget as HTMLInputElement).value));
  });
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-morph-key");
  key.intensity = 4.6;
  key.color = [1, 0.94, 0.84];
  const rim = new DirectionalLight("v8-morph-rim");
  rim.intensity = 2.2;
  rim.color = [0.68, 0.8, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.2, 3.2, 2], direction: [-0.42, -0.7, -0.58], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2, 2, -1], direction: [0.54, -0.3, 0.78], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.01, 0.012, 0.018, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><b>${escapeHtml(label)}</b><span>${escapeHtml(String(value))}</span></div>`;
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
