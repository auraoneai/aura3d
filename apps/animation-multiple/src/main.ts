import {
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  createGLTFSceneAnimationRuntime,
  loadV6GLTFRenderPipeline
} from "@galileo3d/assets";
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
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import { DirectionalLight, composeMat4, multiplyMat4, type Mat4 } from "@galileo3d/scene";
import {
  createAgentSpawnerState,
  sampleAgentPoses,
  spawnAgents,
  type AgentPose,
  type AgentSpawnerState
} from "./agentSpawner.js";

declare global {
  interface Window {
    __g3dV8AnimationMultiple?: V8AnimationMultipleRuntime;
  }
}

type LoadedPipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;

interface V8AnimationMultipleRuntime {
  appId: "animation-multiple";
  status: "loading" | "ready" | "running" | "error";
  statusLabel: string;
  frameCount: number;
  drawCalls: number;
  fps: number;
  elapsedMs: number;
  agentCount: number;
  animatedAgents: number;
  clipName: string;
  averageStride: number;
  motionSamples: number;
  motionTimeRange: number;
  poseDiversityScore: number;
  motionHealthy: boolean;
  skinningPalettesUpdated: number;
  renderer: "g3d-webgl2";
  fixture: string;
  error?: string;
}

const APP_ID = "animation-multiple" as const;
const ASSET_URL = "/fixtures/threejs-parity/assets/character/soldier.glb";
const RENDER_SIZE = createRenderSize();
const WIDTH = RENDER_SIZE.width;
const HEIGHT = RENDER_SIZE.height;
const FRAME_BOUNDS: CameraFrameBounds = { min: [-2.45, -0.08, -0.65], max: [2.45, 2.05, 0.65] };

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

  const state = createAgentSpawnerState();
  state.count = 3;
  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading imported multi-character route", startedAt, state);
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

  const publish = (): void => {
    window.__g3dV8AnimationMultiple = runtime;
    renderUi(root, runtime, state);
    bindUi(root, state, publish);
  };
  publish();

  try {
    const renderer = await G3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      antialias: true,
      clearColor: [0.62, 0.62, 0.62, 1]
    });
    const pipeline = await loadV6GLTFRenderPipeline({
      url: ASSET_URL,
      assetId: "animation-multiple-soldier-crowd",
      assetName: "Soldier Multiple Characters",
      width: WIDTH,
      height: HEIGHT,
      rendererInput: {
        cameraPolicy: "require",
        cameraFrameBounds: FRAME_BOUNDS,
        frame: { yawRadians: Math.PI, pitchRadians: -0.2, paddingRatio: 0.08, fovYRadians: 0.72 },
        postprocess: false
      }
    });
    const animationRuntime = createGLTFSceneAnimationRuntime({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset
    });
    const cloneSampler = animationRuntime.createCloneSampler();
    const primaryClip = pipeline.asset.animations.find((item) => /^walk$/i.test(item.name))
      ?? pipeline.asset.animations.find((item) => /^walking$/i.test(item.name))
      ?? pipeline.asset.animations.find((item) => /walk|run|dance/i.test(item.name))
      ?? pipeline.asset.animations[0];
    if (!primaryClip) throw new Error("Multiple animation route requires at least one imported animation clip.");
    const activeClips = selectAgentClips(pipeline.asset.animations, primaryClip);
    const agents = spawnAgents(3);
    const stage = createStageItems();

    const tick = (now: number): void => {
      try {
        const seconds = (now - startedAt) / 1000;
        const poses = sampleAgentPoses(agents, state, seconds);
        let lastSkinningPalettesUpdated = 0;
        const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
          yawRadians: Math.PI,
          pitchRadians: -0.2,
          paddingRatio: 0.08,
          fovYRadians: 0.72,
          nearPadding: 0.16,
          farPadding: 2.4
        });
        const source: RenderSource = {
          collectRenderItems: () => [
            ...stage,
            ...collectCrowdItems(pipeline, cloneSampler, activeClips, poses, seconds, state, (count) => {
              lastSkinningPalettesUpdated += count;
            })
          ],
          collectedLights: createLights(),
          environmentLighting: DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
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
            assetName: "V8 Animation Multiple",
            assetUri: "/apps/animation-multiple/",
            meshCount: pipeline.metadata.meshCount * poses.length,
            primitiveCount: pipeline.metadata.primitiveCount * poses.length,
            materialCount: pipeline.metadata.materialCount + 2,
            textureCount: pipeline.metadata.textureCount,
            imageCount: pipeline.metadata.imageCount,
            animationCount: activeClips.length,
            skinCount: pipeline.metadata.skinCount,
            morphTargetCount: pipeline.metadata.morphTargetCount,
            extensionsUsed: pipeline.metadata.extensionsUsed,
            environmentId: "v8-fast-studio",
            hdrEnvironmentUri: "deferred"
          }
        });
        const averageStride = poses.reduce((sum, pose) => sum + Math.abs(pose.stride), 0) / Math.max(1, poses.length);
        const motion = motionTracker.record({
          timeSeconds: seconds,
          skinningPalettesUpdated: lastSkinningPalettesUpdated,
          stride: averageStride,
          animatedSubjects: state.paused ? 0 : poses.length
        });
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, state, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          averageStride,
          motionSamples: motion.sampleCount,
          motionTimeRange: motion.timeRangeSeconds,
          poseDiversityScore: motion.poseDiversityScore,
          motionHealthy: motion.healthy,
          clipName: activeClips.map((item) => item.name).join(" / "),
          animatedAgents: state.paused ? 0 : poses.length,
          skinningPalettesUpdated: lastSkinningPalettesUpdated
        });
        if (lastSkinningPalettesUpdated <= 0) {
          throw new Error("Imported multiple-character route did not update any skinning palettes.");
        }
        window.__g3dV8AnimationMultiple = runtime;
        if (frameCount === 1 || now - lastUi > 220) {
          publish();
          lastUi = now;
        }
        animationFrame = requestAnimationFrame(tick);
      } catch (error) {
        cancelAnimationFrame(animationFrame);
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish();
      }
    };
    animationFrame = requestAnimationFrame(tick);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createRuntime(
  status: V8AnimationMultipleRuntime["status"],
  statusLabel: string,
  startedAt: number,
  state: AgentSpawnerState,
  counters: Partial<Pick<V8AnimationMultipleRuntime, "frameCount" | "drawCalls" | "fps" | "averageStride" | "motionSamples" | "motionTimeRange" | "poseDiversityScore" | "motionHealthy" | "clipName" | "animatedAgents" | "skinningPalettesUpdated">> = {}
): V8AnimationMultipleRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: counters.frameCount ?? 0,
    drawCalls: counters.drawCalls ?? 0,
    fps: counters.fps ?? 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    agentCount: state.count,
    animatedAgents: counters.animatedAgents ?? (state.paused ? 0 : state.count),
    clipName: counters.clipName ?? "loading imported Walking clip",
    averageStride: counters.averageStride ?? 0,
    motionSamples: counters.motionSamples ?? 0,
    motionTimeRange: counters.motionTimeRange ?? 0,
    poseDiversityScore: counters.poseDiversityScore ?? 0,
    motionHealthy: counters.motionHealthy ?? false,
    skinningPalettesUpdated: counters.skinningPalettesUpdated ?? 0,
    renderer: "g3d-webgl2",
    fixture: "imported soldier.glb independent Idle Run Walk clones"
  };
}

function collectCrowdItems(
  pipeline: LoadedPipeline,
  cloneSampler: ReturnType<ReturnType<typeof createGLTFSceneAnimationRuntime>["createCloneSampler"]>,
  clips: readonly LoadedPipeline["asset"]["animations"][number][],
  poses: readonly AgentPose[],
  seconds: number,
  state: AgentSpawnerState,
  onSkinningPalettesUpdated: (count: number) => void
): readonly RenderItem[] {
  const items: RenderItem[] = [];
  const posesByCloneId = new Map<string, AgentPose>();
  const cloneSamples = poses.map((pose) => {
    const clip = pickAgentClip(clips, pose);
    const speed = clipPlaybackRate(clip, pose);
    const clipTime = state.paused || clip.duration <= 0
      ? pose.agent.offset % Math.max(clip.duration, 1)
      : (seconds * state.speed * speed + pose.agent.offset) % clip.duration;
    const cloneId = String(pose.agent.id);
    posesByCloneId.set(cloneId, pose);
    return { cloneId, clipName: clip.name, time: clipTime };
  });
  cloneSampler.sampleClones(cloneSamples, (sample) => {
    const pose = posesByCloneId.get(sample.cloneId);
    if (!pose) return;
    onSkinningPalettesUpdated(sample.applyResult.skinningPalettesUpdated);
    items.push(...collectImportedItems(pipeline, agentPlacement(pose)));
  });
  return items;
}

function selectAgentClips(
  animations: readonly LoadedPipeline["asset"]["animations"][number][],
  fallback: LoadedPipeline["asset"]["animations"][number]
): readonly LoadedPipeline["asset"]["animations"][number][] {
  const preferred = [/^walk$/i, /^run$/i, /^idle$/i]
    .map((pattern) => animations.find((clip) => pattern.test(clip.name)))
    .filter((clip): clip is LoadedPipeline["asset"]["animations"][number] => Boolean(clip));
  return preferred.length > 0 ? preferred : [fallback];
}

function pickAgentClip(
  clips: readonly LoadedPipeline["asset"]["animations"][number][],
  pose: AgentPose
): LoadedPipeline["asset"]["animations"][number] {
  const run = clips.find((clip) => /^run$/i.test(clip.name));
  const idle = clips.find((clip) => /^idle$/i.test(clip.name));
  const walk = clips.find((clip) => /^walk$/i.test(clip.name)) ?? clips[0];
  if (idle && pose.agent.id === 1) return idle;
  if (run && pose.agent.id === 2) return run;
  return walk;
}

function clipPlaybackRate(
  clip: LoadedPipeline["asset"]["animations"][number],
  pose: AgentPose
): number {
  if (/^idle$/i.test(clip.name)) return 0.72;
  if (/^run$/i.test(clip.name)) return 1.62;
  if (/^walk$/i.test(clip.name)) return 0.92;
  return 1 + pose.agent.id * 0.08;
}

function collectImportedItems(pipeline: LoadedPipeline, placement: Mat4): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    const skinning = renderable.skinning
      ? { jointCount: renderable.skinning.jointCount, matrices: new Float32Array(renderable.skinning.matrices) }
      : undefined;
    items.push({
      label: `v8-multiple:${node.name}`,
      geometry,
      material,
      modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
      ...(skinning ? { skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function agentPlacement(pose: AgentPose): Mat4 {
  const yaw = 0;
  const scale = 0.68 * pose.agent.scale;
  return composeMat4([pose.x, pose.y, pose.z], [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], [scale, scale, scale]);
}

function createStageItems(): readonly RenderItem[] {
  const cube = Geometry.litCube(1);
  const shadow = Geometry.cylinder({ radius: 0.5, height: 1, segments: 48, capped: true });
  const floor = new PBRMaterial({ name: "multiple-reference-floor", baseColor: [0.73, 0.73, 0.73, 1], roughness: 0.66, metallic: 0, environmentIntensity: 0.25 });
  const contact = new PBRMaterial({ name: "multiple-reference-contact-shadow", baseColor: [0.42, 0.42, 0.42, 1], roughness: 0.9, metallic: 0, environmentIntensity: 0 });
  return [
    { label: "multiple-reference-floor", geometry: cube, material: floor, modelMatrix: composeMat4([0, -0.055, 0], [0, 0, 0, 1], [9, 0.035, 8]) },
    { label: "multiple-contact-shadow-idle", geometry: shadow, material: contact, modelMatrix: composeMat4([-1.48, -0.024, 0.16], [0, 0, 0, 1], [1.25, 0.012, 0.62]) },
    { label: "multiple-contact-shadow-run", geometry: shadow, material: contact, modelMatrix: composeMat4([0, -0.024, 0.12], [0, 0, 0, 1], [1.35, 0.012, 0.7]) },
    { label: "multiple-contact-shadow-walk", geometry: shadow, material: contact, modelMatrix: composeMat4([1.48, -0.024, 0.16], [0, 0, 0, 1], [1.25, 0.012, 0.62]) }
  ];
}

function renderUi(root: HTMLElement, runtime: V8AnimationMultipleRuntime, state: AgentSpawnerState): void {
  root.innerHTML = `
    <section class="panel">
      <h1>V8 Animation Multiple</h1>
      <span class="status" data-state="${runtime.status}">${escapeHtml(runtime.statusLabel)}</span>
      <p>3 independent Soldier clones</p>
      <p>${escapeHtml(runtime.clipName)}</p>
      <label><span><input id="agent-paused" type="checkbox" ${state.paused ? "checked" : ""}> Pause clips</span></label>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
    <section class="panel metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Agents", runtime.agentCount)}
      ${metric("Animated", runtime.animatedAgents)}
      ${metric("Clip", runtime.clipName)}
      ${metric("Avg stride", runtime.averageStride.toFixed(2))}
      ${metric("Motion", runtime.motionHealthy ? "healthy" : "sampling")}
      ${metric("Pose", runtime.poseDiversityScore.toFixed(3))}
      ${metric("Palettes", runtime.skinningPalettesUpdated)}
      ${metric("Renderer", runtime.renderer)}
    </section>
  `;
}

function bindUi(root: HTMLElement, state: AgentSpawnerState, afterUpdate: () => void): void {
  bindRange(root, "#agent-count", (value) => { state.count = Math.max(3, Math.min(3, Math.round(value))); afterUpdate(); });
  bindRange(root, "#agent-speed", (value) => { state.speed = clamp(value, 0.2, 2.2); afterUpdate(); });
  bindRange(root, "#agent-spread", (value) => { state.spread = clamp(value, 0.75, 1.35); afterUpdate(); });
  root.querySelector<HTMLInputElement>("#agent-paused")?.addEventListener("change", (event) => {
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
  const key = new DirectionalLight("v8-multiple-key");
  key.intensity = 5.6;
  key.color = [1, 1, 1];
  const rim = new DirectionalLight("v8-multiple-rim");
  rim.intensity = 2.4;
  rim.color = [0.78, 0.82, 0.9];
  return [
    { kind: "directional", color: key.color, intensity: key.intensity, position: [-3, 10, -10], direction: [0.24, -0.78, 0.58], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: key },
    { kind: "directional", color: rim.color, intensity: rim.intensity, position: [3, 4, 4], direction: [-0.46, -0.42, -0.78], range: 0, spotAngle: 0, penumbra: 0, castsShadow: false, layerMask: 0xffffffff, source: rim }
  ];
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.62, 0.62, 0.62, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function createRenderSize(): { readonly width: number; readonly height: number } {
  const cssWidth = Math.max(1, Math.round(window.innerWidth || 1280));
  const cssHeight = Math.max(1, Math.round(window.innerHeight || 720));
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  const scale = Math.max(0.75, Math.min(dpr, 1600 / cssWidth, 900 / cssHeight));
  return {
    width: Math.round(cssWidth * scale),
    height: Math.round(cssHeight * scale)
  };
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
