import { createGLTFSceneAnimationRuntime, loadV6GLTFRenderPipeline } from "@galileo3d/assets";
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
import { bindIkUi, renderIkUi, type V8SkinningIkRuntime } from "./ui.js";
import { createDefaultIkTargetState, targetFromCanvasPoint, type IkTargetState, type Vec3 } from "./ikTargets.js";

declare global {
  interface Window {
    __g3dV8SkinningIk?: V8SkinningIkRuntime;
  }
}

type LoadedPipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;

const APP_ID = "v8-skinning-ik" as const;
const ASSET_URL = "/fixtures/v8/assets/character/robot-expressive.glb";
const IK_JOINTS = ["UpperArm.R", "LowerArm.R", "Palm2.R"] as const;
const FRAME_BOUNDS: CameraFrameBounds = { min: [-3.4, -0.2, -2.65], max: [3.4, 4.7, 2.65] };
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;
const MAX_DPR = 2;
const MAX_RENDER_EDGE = 2560;

interface RenderSize {
  readonly width: number;
  readonly height: number;
}

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport`);
  }
  let size = syncCanvasSize(canvas);
  drawFallbackFrame(canvas);

  const startedAt = performance.now();
  const state = createDefaultIkTargetState();
  let runtime = createRuntime("loading", "Loading imported robot IK route", startedAt, state);
  let animationFrame = 0;
  let frameCount = 0;
  let animationTime = 0;
  let lastNow = 0;
  let fpsNow = 0;
  let fpsFrames = 0;
  let fps = 0;
  let lastUi = 0;
  const motionTracker = new AnimationMotionQualityTracker({
    minimumSamples: 6,
    minimumTimeRangeSeconds: 0.12,
    minimumPoseDiversityScore: 0.01
  });

  const publish = (): void => {
    window.__g3dV8SkinningIk = runtime;
    renderIkUi(root, runtime, state);
    bindControls(root, state, publish);
  };
  publish();
  installCanvasDrag(canvas, state);

  try {
    const renderer = await G3DRenderer.create({
      canvas,
      width: size.width,
      height: size.height,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const resizeObserver = new ResizeObserver(() => {
      size = syncCanvasSize(canvas);
      renderer.resize(size.width, size.height);
    });
    resizeObserver.observe(canvas);
    const pipeline = await loadV6GLTFRenderPipeline({
      url: ASSET_URL,
      assetId: "v8-skinning-ik-robot-expressive",
      assetName: "Robot Expressive Imported Skeleton IK",
      width: size.width,
      height: size.height,
      rendererInput: {
        cameraPolicy: "require",
        cameraFrameBounds: FRAME_BOUNDS,
        frame: { yawRadians: -0.36, pitchRadians: -0.08, paddingRatio: 0.16, fovYRadians: 0.68 },
        postprocess: false
      }
    });
    const animationRuntime = createGLTFSceneAnimationRuntime({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset
    });
    const ikController = animationRuntime.createTwoBoneIKController({
      jointNames: IK_JOINTS,
      target: state.target,
      pole: state.pole,
      weight: state.weight,
      allowStretch: state.allowStretch,
      apply: true
    });
    const baseClip = selectVisibleAnimationClip(pipeline.asset.animations);
    if (!baseClip) throw new Error("Imported IK route requires at least one robot animation clip.");
    const stage = createStageItems();

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.min(0.18, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        animationTime += delta * 1.35;

        const baseApply = animationRuntime.applyClip(baseClip, baseClip.duration > 0 ? animationTime % baseClip.duration : 0);
        const target = breathingTarget(state, animationTime);
        const ik = ikController.solve({
          target,
          pole: state.pole,
          weight: state.weight,
          allowStretch: state.allowStretch,
          apply: true
        });
        const motion = motionTracker.record({
          timeSeconds: animationTime,
          tracksApplied: baseApply.tracksApplied,
          skinningPalettesUpdated: ik.skinningPalettesUpdated,
          stride: Math.abs(target[0] - state.target[0]) + Math.abs(target[1] - state.target[1]) + Math.abs(target[2] - state.target[2]),
          animatedSubjects: state.weight > 0 ? 1 : 0
        });
        const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, size, {
          yawRadians: -0.36 + Math.sin(animationTime * 0.46) * 0.18,
          pitchRadians: -0.08 + Math.cos(animationTime * 0.32) * 0.055,
          paddingRatio: 0.13,
          fovYRadians: 0.68,
          nearPadding: 0.16,
          farPadding: 2.2
        });
        const placement = composeMat4([0, 0, 0], [0, 0.04, 0, 0.9992], [1, 1, 1]);
        const source: RenderSource = {
          collectRenderItems: () => [
            ...collectImportedItems(pipeline, placement),
            ...stage.items(target, animationTime)
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
            assetName: "Robot Expressive IK",
            assetUri: "/apps/v8-skinning-ik/",
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
        if (fpsNow === 0) fpsNow = now;
        if (now - fpsNow >= 500) {
          fps = fpsFrames * 1000 / (now - fpsNow);
          fpsFrames = 0;
          fpsNow = now;
        }
        runtime = {
          appId: APP_ID,
          status: frameCount === 1 ? "ready" : "running",
          statusLabel: frameCount === 1 ? "Ready" : "Running",
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          elapsedMs: Math.round(performance.now() - startedAt),
          target,
          endEffector: ik.solution.end,
          endEffectorDistance: ik.solution.endDistanceToTarget,
          reached: ik.solution.reached,
          stretched: ik.solution.stretched,
          poleInfluence: ik.solution.poleInfluence,
          weight: state.weight,
          skinningPalettesUpdated: ik.skinningPalettesUpdated,
          motionSamples: motion.sampleCount,
          motionTimeRange: motion.timeRangeSeconds,
          poseDiversityScore: motion.poseDiversityScore,
          motionHealthy: motion.healthy,
          width: size.width,
          height: size.height,
          skinName: ik.skinName,
          jointNames: ik.jointNames,
          clipName: baseClip.name,
          renderer: "g3d-webgl2",
          fixture: "imported robot-expressive.glb skeleton IK"
        };
        window.__g3dV8SkinningIk = runtime;
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

function createRuntime(status: V8SkinningIkRuntime["status"], statusLabel: string, startedAt: number, state: IkTargetState): V8SkinningIkRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: 0,
    drawCalls: 0,
    fps: 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    target: state.target,
    endEffector: [0, 0, 0],
    endEffectorDistance: 0,
    reached: false,
    stretched: false,
    poleInfluence: 0,
    weight: state.weight,
    skinningPalettesUpdated: 0,
    motionSamples: 0,
    motionTimeRange: 0,
    poseDiversityScore: 0,
    motionHealthy: false,
    skinName: "pending",
    jointNames: IK_JOINTS,
    clipName: "pending",
    renderer: "g3d-webgl2",
    fixture: "imported robot-expressive.glb skeleton IK"
  };
}

function bindControls(root: HTMLElement, state: IkTargetState, afterUpdate: () => void): void {
  bindIkUi(root, {
    setWeight(value) {
      state.weight = clamp(value, 0, 1);
      afterUpdate();
    },
    setTargetX(value) {
      state.target = [clamp(value, -1.12, 1.18), state.target[1], state.target[2]];
      afterUpdate();
    },
    setTargetY(value) {
      state.target = [state.target[0], clamp(value, 0.18, 1.62), state.target[2]];
      afterUpdate();
    },
    setAllowStretch(value) {
      state.allowStretch = value;
      afterUpdate();
    },
    reset() {
      const fresh = createDefaultIkTargetState();
      state.target = fresh.target;
      state.pole = fresh.pole;
      state.weight = fresh.weight;
      state.allowStretch = fresh.allowStretch;
      afterUpdate();
    }
  });
}

function installCanvasDrag(canvas: HTMLCanvasElement, state: IkTargetState): void {
  let dragging = false;
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    state.target = targetFromCanvasPoint(canvas, event.clientX, event.clientY);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    state.target = targetFromCanvasPoint(canvas, event.clientX, event.clientY);
  });
  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });
}

function breathingTarget(state: IkTargetState, timeSeconds: number): Vec3 {
  return [
    state.target[0] + Math.sin(timeSeconds * 1.18) * 0.48,
    state.target[1] + Math.sin(timeSeconds * 2.05) * 0.3 + Math.sin(timeSeconds * 3.8) * 0.06,
    state.target[2] + Math.cos(timeSeconds * 0.96) * 0.26
  ];
}

function selectVisibleAnimationClip(
  clips: readonly { readonly name: string; readonly duration: number }[]
): { readonly name: string; readonly duration: number } | undefined {
  const preferred = [
    /dance/i,
    /walk/i,
    /run/i,
    /jump/i,
    /wave/i,
    /punch/i,
    /idle/i
  ];
  for (const pattern of preferred) {
    const clip = clips.find((candidate) => pattern.test(candidate.name) && candidate.duration > 0.2);
    if (clip) return clip;
  }
  return clips.find((clip) => clip.duration > 0.2) ?? clips[0];
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
      label: `v8-ik:${node.name}`,
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

function createStageItems(): { readonly materialCount: number; readonly items: (target: Vec3, timeSeconds: number) => readonly RenderItem[] } {
  const cube = Geometry.litCube(1);
  const targetSphere = Geometry.uvSphere(0.055, 24, 12);
  const sensorSphere = Geometry.uvSphere(0.042, 18, 10);
  const floor = new PBRMaterial({ name: "v8-ik-floor", baseColor: [0.035, 0.045, 0.055, 1], roughness: 0.5, metallic: 0.06, environmentIntensity: 0.72 });
  const deck = new PBRMaterial({ name: "v8-ik-deck", baseColor: [0.07, 0.09, 0.11, 1], roughness: 0.38, metallic: 0.16, environmentIntensity: 0.78 });
  const rail = new PBRMaterial({ name: "v8-ik-chain-rail", baseColor: [0.12, 0.28, 0.42, 1], roughness: 0.34, metallic: 0.18, environmentIntensity: 0.8 });
  const wall = new PBRMaterial({ name: "v8-ik-lab-wall", baseColor: [0.025, 0.035, 0.052, 1], roughness: 0.44, metallic: 0.12, environmentIntensity: 0.62 });
  const glass = new PBRMaterial({ name: "v8-ik-glass-panel", baseColor: [0.08, 0.2, 0.28, 0.72], roughness: 0.18, metallic: 0.02, transmissionFactor: 0.2, emissiveColor: [0.01, 0.06, 0.08], emissiveStrength: 0.8 });
  const emissiveBlue = new PBRMaterial({ name: "v8-ik-blue-light", baseColor: [0.12, 0.5, 0.82, 1], roughness: 0.22, metallic: 0.05, emissiveColor: [0.03, 0.28, 0.62], emissiveStrength: 2.4 });
  const emissiveAmber = new PBRMaterial({ name: "v8-ik-amber-light", baseColor: [0.9, 0.52, 0.18, 1], roughness: 0.28, metallic: 0.04, emissiveColor: [0.45, 0.18, 0.04], emissiveStrength: 2.1 });
  const target = new PBRMaterial({ name: "v8-ik-target", baseColor: [0.28, 0.95, 0.68, 1], roughness: 0.26, metallic: 0.08, emissiveColor: [0.02, 0.16, 0.08], emissiveStrength: 1.35 });
  const ghost = new PBRMaterial({ name: "v8-ik-target-history", baseColor: [0.16, 0.52, 0.84, 0.82], roughness: 0.28, metallic: 0.02, emissiveColor: [0.02, 0.16, 0.32], emissiveStrength: 1.4 });
  return {
    materialCount: 9,
    items: (targetPosition, timeSeconds) => {
      const items: RenderItem[] = [
        { label: "v8-ik-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.085, 0.15], [0, 0, 0, 1], [4.1, 0.05, 2.75]) },
        { label: "v8-ik-deck", geometry: cube, material: deck, modelMatrix: composeMat4([0, -0.045, 0.22], [0, 0, 0, 1], [2.35, 0.05, 1.7]) },
        { label: "v8-ik-back-wall", geometry: cube, material: wall, modelMatrix: composeMat4([0, 1.15, -1.35], [0, 0, 0, 1], [4.2, 2.35, 0.06]) },
        { label: "v8-ik-left-workcell", geometry: cube, material: wall, modelMatrix: composeMat4([-1.85, 0.56, -0.58], [0, 0, 0, 1], [0.14, 1.05, 1.12]) },
        { label: "v8-ik-right-workcell", geometry: cube, material: wall, modelMatrix: composeMat4([1.85, 0.56, -0.58], [0, 0, 0, 1], [0.14, 1.05, 1.12]) },
        { label: "v8-ik-left-rail", geometry: cube, material: rail, modelMatrix: composeMat4([-1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) },
        { label: "v8-ik-right-rail", geometry: cube, material: rail, modelMatrix: composeMat4([1.18, 0.3, -0.62], [0, 0, 0, 1], [0.06, 0.75, 0.06]) },
        { label: "v8-ik-target", geometry: targetSphere, material: target, modelMatrix: composeMat4(targetPosition, [0, 0, 0, 1], [1.3, 1.3, 1.3]) }
      ];

      const floorXTransforms: Mat4[] = [];
      for (let index = 0; index < 9; index += 1) {
        floorXTransforms.push(composeMat4([-1.8 + index * 0.45, -0.035, 0.22], [0, 0, 0, 1], [0.012, 0.012, 2.58]));
      }
      items.push({ label: "v8-ik-floor-grid-x", geometry: cube, material: rail, modelMatrix: identityMatrix(), instanceTransforms: flattenMatrices(floorXTransforms) });

      const floorZTransforms: Mat4[] = [];
      for (let index = 0; index < 7; index += 1) {
        floorZTransforms.push(composeMat4([0, -0.032, -1.02 + index * 0.4], [0, 0, 0, 1], [3.85, 0.012, 0.012]));
      }
      items.push({ label: "v8-ik-floor-grid-z", geometry: cube, material: rail, modelMatrix: identityMatrix(), instanceTransforms: flattenMatrices(floorZTransforms) });

      const trailTransforms: Mat4[] = [];
      for (let index = 0; index < 5; index += 1) {
        const phase = timeSeconds * 1.2 - index * 0.42;
        trailTransforms.push(composeMat4([
          targetPosition[0] - Math.sin(phase) * 0.18,
          targetPosition[1] - index * 0.055,
          targetPosition[2] - 0.08 - index * 0.055
        ], [0, 0, 0, 1], [1, 1, 1]));
      }
      items.push({ label: "v8-ik-target-trail", geometry: sensorSphere, material: ghost, modelMatrix: identityMatrix(), instanceTransforms: flattenMatrices(trailTransforms) });

      const blueStatusTransforms: Mat4[] = [];
      const amberStatusTransforms: Mat4[] = [];
      for (let index = 0; index < 6; index += 1) {
        const y = 0.24 + index * 0.22;
        const targetTransforms = index % 2 === 0 ? blueStatusTransforms : amberStatusTransforms;
        targetTransforms.push(composeMat4([-2.03, y, -1.3], [0, 0, 0, 1], [0.18, 0.018, 0.018]));
        targetTransforms.push(composeMat4([2.03, y, -1.3], [0, 0, 0, 1], [0.18, 0.018, 0.018]));
      }
      items.push({ label: "v8-ik-status-strip-blue", geometry: cube, material: emissiveBlue, modelMatrix: identityMatrix(), instanceTransforms: flattenMatrices(blueStatusTransforms) });
      items.push({ label: "v8-ik-status-strip-amber", geometry: cube, material: emissiveAmber, modelMatrix: identityMatrix(), instanceTransforms: flattenMatrices(amberStatusTransforms) });
      const scanY = 0.36 + (Math.sin(timeSeconds * 1.7) * 0.5 + 0.5) * 1.25;
      items.push({ label: "v8-ik-scanline", geometry: cube, material: emissiveBlue, modelMatrix: composeMat4([0, scanY, -1.305], [0, 0, 0, 1], [3.5, 0.014, 0.014]) });
      items.push({ label: "v8-ik-glass-left", geometry: cube, material: glass, modelMatrix: composeMat4([-1.42, 0.82, -0.98], [0, 0, 0, 1], [0.34, 0.62, 0.026]) });
      items.push({ label: "v8-ik-glass-right", geometry: cube, material: glass, modelMatrix: composeMat4([1.42, 0.82, -0.98], [0, 0, 0, 1], [0.34, 0.62, 0.026]) });
      return items;
    }
  };
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("v8-ik-key");
  key.intensity = 4.4;
  key.color = [1, 0.94, 0.82];
  const rim = new DirectionalLight("v8-ik-rim");
  rim.intensity = 2;
  rim.color = [0.64, 0.78, 1];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [2.2, 3.2, 2.1], direction: [-0.42, -0.72, -0.54], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [-2.2, 2.1, -1.5], direction: [0.56, -0.28, 0.78], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.01, 0.012, 0.018, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function syncCanvasSize(canvas: HTMLCanvasElement): RenderSize {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width || canvas.clientWidth || FALLBACK_WIDTH);
  const cssHeight = Math.max(1, rect.height || canvas.clientHeight || FALLBACK_HEIGHT);
  const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  const rawWidth = Math.max(FALLBACK_WIDTH, Math.round(cssWidth * dpr));
  const rawHeight = Math.max(FALLBACK_HEIGHT, Math.round(cssHeight * dpr));
  const scale = Math.min(1, MAX_RENDER_EDGE / Math.max(rawWidth, rawHeight));
  const width = Math.max(FALLBACK_WIDTH, Math.round(rawWidth * scale));
  const height = Math.max(FALLBACK_HEIGHT, Math.round(rawHeight * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function identityMatrix(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

function flattenMatrices(matrices: readonly Mat4[]): number[] {
  const values: number[] = [];
  for (const matrix of matrices) values.push(...matrix);
  return values;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
