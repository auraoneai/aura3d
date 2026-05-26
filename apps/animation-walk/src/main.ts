import { AnimationMotionQualityTracker, LocomotionController, createRootMotionWalkClip, type LocomotionControllerSample, type LocomotionControllerState } from "@aura3d/animation";
import {
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  createGLTFSceneAnimationRuntime,
  loadProductionGLTFRenderPipeline
} from "@aura3d/assets";
import {
  Geometry,
  PBRMaterial,
  computePerspectiveCameraFrame,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";

declare global {
  interface Window {
    __a3dCurrentRoutesAnimationWalk?: CurrentRoutesAnimationWalkRuntime;
  }
}

interface CurrentRoutesAnimationWalkRuntime {
  appId: "animation-walk";
  status: "loading" | "ready" | "running" | "error";
  statusLabel: string;
  frameCount: number;
  drawCalls: number;
  fps: number;
  elapsedMs: number;
  clipName: string;
  clipTime: number;
  rootMotionDistance: number;
  worldPosition: readonly [number, number, number];
  inPlace: boolean;
  motionSamples: number;
  motionTimeRange: number;
  poseDiversityScore: number;
  motionHealthy: boolean;
  renderer: "a3d-webgl2";
  fixture: string;
  error?: string;
}

const APP_ID = "animation-walk" as const;
const WIDTH = 1280;
const HEIGHT = 720;
const SOLDIER_URL = "/fixtures/threejs-parity/assets/character/soldier.glb";
const bounds = { min: [-1.95, -0.08, -1.95] as const, max: [1.95, 2.0, 1.95] as const };

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

  const startedAt = performance.now();
  const clip = createRootMotionWalkClip();
  const locomotion = new LocomotionController({
    clip,
    speed: 1,
    inPlace: false,
    paused: false,
    pathRadius: 1.05,
    rootMotionScale: 0.78
  });
  const state = locomotion.state;
  let runtime = createRuntime("loading", "Loading A3D walk route", startedAt, state, clip.name, locomotion.sample(0));
  publish(root, runtime, state);
  bindUi(root, state, () => publish(root, runtime, state));

  try {
    const renderer = await A3DRenderer.create({
      canvas,
      backend: "webgl2",
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: SOLDIER_URL,
      assetId: "animation-walk-soldier",
      assetName: "Soldier Walk",
      width: WIDTH,
      height: HEIGHT,
      rendererInput: {
        cameraPolicy: "require",
        cameraFrameBounds: bounds,
        frame: {
          yawRadians: -0.48,
          pitchRadians: -0.16,
          paddingRatio: 0.08,
          fovYRadians: 0.72,
          nearPadding: 0.14,
          farPadding: 2.8
        },
        postprocess: false,
        frustumCulling: false
      }
    });
    const animationRuntime = createGLTFSceneAnimationRuntime({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset
    });
    const walkClip = pipeline.asset.animations.find((candidate) => /^walk$/i.test(candidate.name)) ?? pipeline.asset.animations[0];
    if (!walkClip) throw new Error("CurrentRoutes Animation Walk requires an imported Soldier walk clip.");
    const importedLocomotion = new LocomotionController({
      clip: createRootMotionWalkClip({ duration: walkClip.duration > 0 ? walkClip.duration : 1.2, distance: 1.28 }),
      speed: state.speed,
      inPlace: state.inPlace,
      paused: state.paused,
      pathRadius: state.pathRadius,
      rootMotionScale: 0.78
    });
    Object.assign(state, importedLocomotion.state);
    const fixture = createWalkFixture();
    const camera = computePerspectiveCameraFrame(bounds, { width: WIDTH, height: HEIGHT }, {
      yawRadians: -0.44,
      pitchRadians: -0.2,
      paddingRatio: 0.08,
      fovYRadians: 0.72,
      nearPadding: 0.14,
      farPadding: 2.8
    });
    let frameCount = 0;
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

    const source: RenderSource = {
      collectRenderItems: () => {
        const sample = sampleImportedLocomotion(importedLocomotion, state, Math.max(0, (performance.now() - startedAt) / 1000));
        animationRuntime.applyClip(walkClip, sample.clipTime);
        return [
          ...createWalkItems(fixture, sample, state),
          ...collectImportedItems(pipeline, soldierPlacement(sample))
        ];
      },
      collectedLights: createLights(),
      environmentLighting: DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
      cameraPolicy: "require",
      cameraPosition: camera.cameraPosition,
      frustumCulling: false,
      postprocess: false
    };

    const tick = (now: number): void => {
      try {
        const sample = sampleImportedLocomotion(importedLocomotion, state, Math.max(0, (now - startedAt) / 1000));
        const motion = motionTracker.record({
          timeSeconds: sample.clipTime,
          stride: Math.abs(sample.stride),
          animatedSubjects: state.paused ? 0 : 1
        });
        const diagnostics = renderer.render(source, {
          viewProjectionMatrix: camera.viewProjectionMatrix,
          viewMatrix: camera.viewMatrix,
          projectionMatrix: camera.projectionMatrix
        });
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, state, walkClip.name, sample, {
          frameCount,
          drawCalls: diagnostics.drawCalls,
          fps,
          motionSamples: motion.sampleCount,
          motionTimeRange: motion.timeRangeSeconds,
          poseDiversityScore: motion.poseDiversityScore,
          motionHealthy: motion.healthy
        });
        window.__a3dCurrentRoutesAnimationWalk = runtime;
        if (frameCount === 1 || now - lastUi > 220) {
          publish(root, runtime, state);
          bindUi(root, state, () => publish(root, runtime, state));
          lastUi = now;
        }
        animationFrame = requestAnimationFrame(tick);
      } catch (error) {
        cancelAnimationFrame(animationFrame);
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish(root, runtime, state);
      }
    };
    animationFrame = requestAnimationFrame(tick);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish(root, runtime, state);
  }
}

function createRuntime(
  status: CurrentRoutesAnimationWalkRuntime["status"],
  statusLabel: string,
  startedAt: number,
  state: LocomotionControllerState,
  clipName: string,
  sample: LocomotionControllerSample,
  counters: Partial<Pick<CurrentRoutesAnimationWalkRuntime, "frameCount" | "drawCalls" | "fps" | "motionSamples" | "motionTimeRange" | "poseDiversityScore" | "motionHealthy">> = {}
): CurrentRoutesAnimationWalkRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: counters.frameCount ?? 0,
    drawCalls: counters.drawCalls ?? 0,
    fps: counters.fps ?? 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    clipName,
    clipTime: sample.clipTime,
    rootMotionDistance: sample.rootMotionDistance,
    worldPosition: [sample.worldX, 0, sample.worldZ],
    inPlace: state.inPlace,
    motionSamples: counters.motionSamples ?? 0,
    motionTimeRange: counters.motionTimeRange ?? 0,
    poseDiversityScore: counters.poseDiversityScore ?? 0,
    motionHealthy: counters.motionHealthy ?? false,
    renderer: "a3d-webgl2",
    fixture: "imported Soldier GLB Walk clip with A3D root-motion locomotion"
  };
}

function createWalkFixture() {
  return {
    stage: Geometry.litCube(1),
    path: Geometry.litCube(1),
    stageMaterial: new PBRMaterial({ name: "walk-stage", baseColor: [0.72, 0.72, 0.72, 1], roughness: 0.66, metallic: 0, environmentIntensity: 0.25 }),
    pathMaterial: new PBRMaterial({ name: "walk-path", baseColor: [0.36, 0.42, 0.5, 1], roughness: 0.72, metallic: 0, environmentIntensity: 0.18 })
  };
}

function createWalkItems(fixture: ReturnType<typeof createWalkFixture>, sample: LocomotionControllerSample, state: LocomotionControllerState): readonly RenderItem[] {
  const x = sample.worldX;
  const z = sample.worldZ;
  const items: RenderItem[] = [
    { label: "walk-stage", geometry: fixture.stage, material: fixture.stageMaterial, modelMatrix: composeMat4([0, -0.055, 0], [0, 0, 0, 1], [4.8, 0.045, 4.8]) }
  ];
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    items.push({
      label: `walk-path-${index}`,
      geometry: fixture.path,
      material: fixture.pathMaterial,
      modelMatrix: composeMat4([Math.sin(angle) * state.pathRadius, -0.022, Math.cos(angle) * state.pathRadius], [0, -Math.sin(angle / 2), 0, Math.cos(angle / 2)], [0.2, 0.012, 0.035])
    });
  }
  return items;
}

function collectImportedItems(pipeline: Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>, placement: Mat4): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const skinning = renderable.skinning
      ? { jointCount: renderable.skinning.jointCount, matrices: new Float32Array(renderable.skinning.matrices) }
      : undefined;
    items.push({
      label: `animation-walk:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(skinning ? { skinning } : {})
    });
  }
  return items;
}

function soldierPlacement(sample: LocomotionControllerSample): Mat4 {
  const headingQuat = [0, Math.sin(sample.heading / 2), 0, Math.cos(sample.heading / 2)] as const;
  return composeMat4([sample.worldX, 0, sample.worldZ], headingQuat, [0.78, 0.78, 0.78]);
}

function sampleImportedLocomotion(controller: LocomotionController, state: LocomotionControllerState, elapsedSeconds: number): LocomotionControllerSample {
  Object.assign(controller.state, state);
  return controller.sample(elapsedSeconds);
}

function publish(root: HTMLElement, runtime: CurrentRoutesAnimationWalkRuntime, state: LocomotionControllerState): void {
  window.__a3dCurrentRoutesAnimationWalk = runtime;
  root.innerHTML = `
    <section class="panel">
      <h1>CurrentRoutes Animation Walk</h1>
      <span class="status" data-state="${runtime.status}">${escapeHtml(runtime.statusLabel)}</span>
      <div class="metrics">
        ${metric("Frames", runtime.frameCount)}
        ${metric("Draw calls", runtime.drawCalls)}
        ${metric("FPS", runtime.fps.toFixed(1))}
        ${metric("Clip time", runtime.clipTime.toFixed(2))}
        ${metric("Root motion", runtime.rootMotionDistance.toFixed(2))}
        ${metric("Mode", runtime.inPlace ? "in-place" : "root motion")}
        ${metric("Motion", runtime.motionHealthy ? "healthy" : "sampling")}
        ${metric("Pose", runtime.poseDiversityScore.toFixed(3))}
      </div>
      <label>Speed ${state.speed.toFixed(2)}<input id="walk-speed" type="range" min="0.2" max="2.2" step="0.05" value="${state.speed}"></label>
      <label>Path radius ${state.pathRadius.toFixed(2)}<input id="walk-radius" type="range" min="0.65" max="1.45" step="0.05" value="${state.pathRadius}"></label>
      <label><span><input id="walk-inplace" type="checkbox" ${state.inPlace ? "checked" : ""}> In-place walk</span></label>
      <label><span><input id="walk-paused" type="checkbox" ${state.paused ? "checked" : ""}> Pause clip</span></label>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

function bindUi(root: HTMLElement, state: LocomotionControllerState, afterUpdate: () => void): void {
  bindRange(root, "#walk-speed", (value) => { state.speed = clamp(value, 0.2, 2.2); afterUpdate(); });
  bindRange(root, "#walk-radius", (value) => { state.pathRadius = clamp(value, 0.65, 1.45); afterUpdate(); });
  root.querySelector<HTMLInputElement>("#walk-inplace")?.addEventListener("change", (event) => {
    state.inPlace = (event.currentTarget as HTMLInputElement).checked;
    afterUpdate();
  });
  root.querySelector<HTMLInputElement>("#walk-paused")?.addEventListener("change", (event) => {
    state.paused = (event.currentTarget as HTMLInputElement).checked;
    afterUpdate();
  });
}

function bindRange(root: HTMLElement, selector: string, update: (value: number) => void): void {
  root.querySelector<HTMLInputElement>(selector)?.addEventListener("input", (event) => {
    update(Number((event.currentTarget as HTMLInputElement).value));
  });
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("current-routes-walk-key");
  key.intensity = 4.4;
  key.color = [1, 0.94, 0.82];
  const rim = new DirectionalLight("current-routes-walk-rim");
  rim.intensity = 2;
  rim.color = [0.68, 0.8, 1];
  return [
    { kind: "directional", color: [1, 0.94, 0.82], intensity: 4.4, position: [2.4, 3.2, 2.4], direction: [-0.48, -0.7, -0.5], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: [0.68, 0.8, 1], intensity: 2, position: [-2.4, 2.1, -1.2], direction: [0.58, -0.3, 0.76], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.01, 0.012, 0.018, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function drawWalkOverlay(canvas: HTMLCanvasElement, sample: LocomotionControllerSample, state: LocomotionControllerState): void {
  const gl = canvas.getContext("webgl2");
  if (!gl) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.colorMask(true, true, true, true);
  gl.drawBuffers([gl.BACK]);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.SCISSOR_TEST);
  drawRect(gl, 0, 0, canvas.width, canvas.height, [0.08, 0.1, 0.14, 1]);
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    const x = Math.round(canvas.width * (0.5 + Math.sin(angle) * state.pathRadius * 0.18));
    const y = Math.round(canvas.height * (0.38 + Math.cos(angle) * state.pathRadius * 0.18));
    drawRect(gl, x - 13, y - 4, 26, 8, [0.28, 0.42, 0.56, 1]);
  }
  const x = Math.round(canvas.width * (0.5 + sample.worldX * 0.2));
  const y = Math.round(canvas.height * (0.34 + sample.worldZ * 0.16));
  drawRect(gl, x - 42, y + 8, 84, 148, [0.18, 0.5, 0.88, 1]);
  drawRect(gl, x - 34, y + 160, 68, 68, [0.88, 0.68, 0.48, 1]);
  drawRect(gl, x - 86, y + 20 + sample.stride * 30, 28, 112, [0.66, 0.76, 0.84, 1]);
  drawRect(gl, x + 58, y + 20 - sample.stride * 30, 28, 112, [0.66, 0.76, 0.84, 1]);
  drawRect(gl, x - 36, y - 88 + sample.stride * 34, 30, 112, [0.66, 0.76, 0.84, 1]);
  drawRect(gl, x + 6, y - 88 - sample.stride * 34, 30, 112, [0.66, 0.76, 0.84, 1]);
  gl.disable(gl.SCISSOR_TEST);
}

function drawRect(gl: WebGL2RenderingContext, x: number, y: number, width: number, height: number, color: readonly [number, number, number, number]): void {
  const sx = Math.max(0, Math.min(gl.drawingBufferWidth, Math.round(x)));
  const sy = Math.max(0, Math.min(gl.drawingBufferHeight, Math.round(y)));
  const sw = Math.max(0, Math.min(gl.drawingBufferWidth - sx, Math.round(width)));
  const sh = Math.max(0, Math.min(gl.drawingBufferHeight - sy, Math.round(height)));
  if (sw === 0 || sh === 0) return;
  gl.scissor(sx, sy, sw, sh);
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
