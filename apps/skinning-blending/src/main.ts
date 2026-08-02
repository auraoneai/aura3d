import { createGLTFSceneAnimationMixer, loadProductionGLTFRenderPipeline } from "@aura3d/assets";
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
import { createSkinningBlendController, type SkinningBlendControls } from "./blendController.js";
import { renderSkinningBlendingUi, type SkinningBlendingRuntime } from "./ui.js";

declare global {
  interface Window {
    __a3dCurrentRoutesSkinningBlending?: SkinningBlendingRuntime;
  }
}

type LoadedPipeline = Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>;

const APP_ID = "skinning-blending" as const;
const ASSET_URL = "/fixtures/threejs-parity/assets/character/robot-expressive.glb";
const FRAME_BOUNDS: CameraFrameBounds = { min: [-0.85, -0.12, -0.85], max: [0.85, 2.05, 0.85] };
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
  let controls: SkinningBlendControls = {
    playing: true,
    speed: 1,
    orbitYaw: -0.32,
    weights: { idle: 0.2, walk: 0.55, run: 0.25 }
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
  const motionTracker = new AnimationMotionQualityTracker({
    minimumSamples: 6,
    minimumTimeRangeSeconds: 0.12,
    minimumPoseDiversityScore: 0.01
  });

  const publish = (patch: Partial<SkinningBlendingRuntime>): void => {
    runtime = {
      ...runtime,
      ...patch,
      controls: patch.controls ?? controls
    };
    window.__a3dCurrentRoutesSkinningBlending = runtime;
    renderSkinningBlendingUi(root, runtime, setControls);
  };
  const setControls = (next: SkinningBlendControls): void => {
    controls = next;
    publish({ controls });
  };

  drawFallbackFrame(canvas);
  publish({});

  try {
    publish({ status: "loading", loadingStep: `creating A3D renderer for ${ASSET_URL}` });
    const renderer = await A3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.01, 0.014, 1]
    });
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: ASSET_URL,
      assetId: "skinning-blending-robot-expressive",
      assetName: "Robot Expressive Skinning Blend",
      width: WIDTH,
      height: HEIGHT,
      rendererInput: {
        cameraPolicy: "require",
        cameraFrameBounds: FRAME_BOUNDS,
        frame: { yawRadians: -0.32, pitchRadians: -0.08, paddingRatio: 0.08, fovYRadians: 0.48 },
        postprocess: false
      }
    });
    const animationRuntime = createGLTFSceneAnimationMixer({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset,
      autoPlay: false
    });
    const blend = createSkinningBlendController(pipeline.asset.animations);
    const stage = createStageItems();

    publish({
      status: "ready",
      loadingStep: `loaded idle/walk/run clips: ${blend.clipNames.idle}, ${blend.clipNames.walk}, ${blend.clipNames.run}`
    });

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        if (controls.playing) animationTime += delta * controls.speed;
        const weights = blend.normalize(controls.weights);
        const samples = blend.samples(animationTime, weights);
        const activeClipNames = new Set(samples.map((sample) => sample.clipName));
        for (const clipName of animationRuntime.listClips()) {
          if (!activeClipNames.has(clipName)) {
            animationRuntime.setActionWeight(clipName, 0);
          }
        }
        for (const sample of samples) {
          const clip = pipeline.asset.animations.find((candidate) => candidate.name === sample.clipName);
          const sampleTime = clip && clip.duration > 0 ? sample.time % clip.duration : sample.time;
          animationRuntime.playClip(sample.clipName, {
            weight: sample.weight ?? 1,
            timeScale: controls.playing ? Math.max(0, controls.speed) : 0,
            loopMode: "repeat"
          });
          animationRuntime.seek(sample.clipName, sampleTime);
        }
        const apply = animationRuntime.update(0).applyResult;
        const motion = motionTracker.record({
          timeSeconds: animationTime,
          tracksApplied: apply.tracksApplied,
          skinningPalettesUpdated: apply.skinningPalettesUpdated,
          stride: weights.walk * 0.04 + weights.run * 0.08,
          animatedSubjects: controls.playing ? 1 : 0
        });
        const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
          yawRadians: controls.orbitYaw,
          pitchRadians: -0.08,
          paddingRatio: 0.08,
          fovYRadians: 0.48,
          nearPadding: 0.16,
          farPadding: 2.2
        });
        const placement = composeMat4([0, 0, 0], [0, 0, 0, 1], [0.2, 0.2, 0.2]);
        const source: RenderSource = {
          collectRenderItems: () => [...collectImportedItems(pipeline, placement), ...stage],
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
            assetName: "CurrentRoutes Skinning Blending",
            assetUri: "/apps/skinning-blending/",
            meshCount: pipeline.metadata.meshCount,
            primitiveCount: pipeline.metadata.primitiveCount,
            materialCount: pipeline.metadata.materialCount + 3,
            textureCount: pipeline.metadata.textureCount,
            imageCount: pipeline.metadata.imageCount,
            animationCount: pipeline.metadata.animationCount,
            skinCount: pipeline.metadata.skinCount,
            morphTargetCount: pipeline.metadata.morphTargetCount,
            extensionsUsed: pipeline.metadata.extensionsUsed,
            environmentId: "current-routes-fast-studio",
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
        runtime = {
          appId: APP_ID,
          status: frameCount === 1 ? "ready" : "running",
          loadingStep: frameCount === 1 ? "first blended skinning frame rendered" : "blending idle, walk, and run clips live",
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          animationTime: Number(animationTime.toFixed(3)),
          clipWeights: weights,
          tracksApplied: apply.tracksApplied,
          skinningPalettesUpdated: apply.skinningPalettesUpdated,
          motionSamples: motion.sampleCount,
          motionTimeRange: motion.timeRangeSeconds,
          poseDiversityScore: motion.poseDiversityScore,
          motionHealthy: motion.healthy,
          controls
        };
        window.__a3dCurrentRoutesSkinningBlending = runtime;
        if (frameCount === 1 || now - lastPublish > 250) {
          renderSkinningBlendingUi(root, runtime, setControls);
          lastPublish = now;
        }
        raf = requestAnimationFrame(render);
      } catch (error) {
        cancelAnimationFrame(raf);
        publish({ status: "error", loadingStep: "animation blend loop failed", error: formatError(error) });
      }
    };
    raf = requestAnimationFrame(render);
  } catch (error) {
    cancelAnimationFrame(raf);
    publish({ status: "error", loadingStep: `failed while loading ${ASSET_URL}`, error: formatError(error) });
  }
}

function createRuntime(status: SkinningBlendingRuntime["status"], loadingStep: string, controls: SkinningBlendControls): SkinningBlendingRuntime {
  return {
    appId: APP_ID,
    status,
    loadingStep,
    frameCount: 0,
    drawCalls: 0,
    fps: 0,
    animationTime: 0,
    clipWeights: controls.weights,
    tracksApplied: 0,
    skinningPalettesUpdated: 0,
    motionSamples: 0,
    motionTimeRange: 0,
    poseDiversityScore: 0,
    motionHealthy: false,
    controls
  };
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
      label: `current-routes-blending:${node.name}`,
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

function createStageItems(): readonly RenderItem[] {
  const cube = Geometry.litCube(1);
  const floor = new PBRMaterial({ name: "current-routes-blend-floor", baseColor: [0.06, 0.08, 0.09, 1], roughness: 0.42, metallic: 0.04, environmentIntensity: 0.75 });
  const rail = new PBRMaterial({ name: "current-routes-blend-rail", baseColor: [0.11, 0.23, 0.34, 1], roughness: 0.32, metallic: 0.22, environmentIntensity: 0.8 });
  return [
    { label: "current-routes-blend-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.07, 0], [0, 0, 0, 1], [3.1, 0.04, 2.1]) },
    { label: "current-routes-blend-left-rail", geometry: cube, material: rail, modelMatrix: composeMat4([-1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) },
    { label: "current-routes-blend-right-rail", geometry: cube, material: rail, modelMatrix: composeMat4([1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) }
  ];
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("current-routes-blend-key");
  key.intensity = 4.4;
  key.color = [1, 0.94, 0.84];
  const fill = new DirectionalLight("current-routes-blend-fill");
  fill.intensity = 2.0;
  fill.color = [0.6, 0.78, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.3, 3.3, 2.2], direction: [-0.4, -0.72, -0.54], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: fill.color, intensity: fill.intensity, position: [-2.3, 2.2, -1.7], direction: [0.58, -0.36, 0.73], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: fill }
  ];
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.006, 0.01, 0.014, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  drawRect(gl, 0, 0, canvas.width, Math.round(canvas.height * 0.23), [0.02, 0.03, 0.04, 1]);
  drawRect(gl, Math.round(canvas.width * 0.22), Math.round(canvas.height * 0.32), Math.round(canvas.width * 0.12), Math.round(canvas.height * 0.38), [0.15, 0.65, 0.46, 1]);
  drawRect(gl, Math.round(canvas.width * 0.44), Math.round(canvas.height * 0.24), Math.round(canvas.width * 0.12), Math.round(canvas.height * 0.48), [0.76, 0.84, 0.95, 1]);
  drawRect(gl, Math.round(canvas.width * 0.66), Math.round(canvas.height * 0.37), Math.round(canvas.width * 0.13), Math.round(canvas.height * 0.31), [0.28, 0.52, 0.94, 1]);
  gl.disable(gl.SCISSOR_TEST);
}

function drawRect(gl: WebGL2RenderingContext, x: number, y: number, width: number, height: number, color: readonly [number, number, number, number]): void {
  gl.scissor(x, y, width, height);
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
