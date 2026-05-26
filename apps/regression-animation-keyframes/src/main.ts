import { createGLTFSceneAnimationRuntime, loadProductionGLTFRenderPipeline } from "@aura3d/assets";
import {
  Geometry,
  PBRMaterial,
  ProductionWebGL2Renderer,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { DirectionalLight, composeMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";

declare global {
  interface Window {
    __a3dRuntimeParityAnimationKeyframes?: RuntimeParityAnimationKeyframesRuntime;
  }
}

type LifecycleState = "booting" | "loading-assets" | "compiling-renderer" | "first-frame" | "running" | "error";
type AssetStatus = "pending" | "ready" | "error" | "deferred";

interface RuntimeParityAnimationKeyframesRuntime {
  readonly status: LifecycleState;
  readonly appId: "regression-animation-keyframes";
  readonly statusLabel: string;
  readonly elapsedMs: number;
  readonly details: readonly string[];
  readonly error?: string;
  readonly assetStatus?: AssetStatus;
  readonly hdrStatus?: AssetStatus;
  readonly rendererStatus?: AssetStatus;
  readonly clipName?: string;
  readonly clipCount?: number;
  readonly animationTime?: number;
  readonly frameCount: number;
  readonly drawCalls?: number;
  readonly triangles?: number;
  readonly tracksApplied?: number;
  readonly skinningPalettesUpdated?: number;
  readonly fps?: number;
  readonly applyClipMs?: number;
  readonly renderMs?: number;
  readonly frameMs?: number;
}

const APP_ID = "regression-animation-keyframes" as const;
const WIDTH = 1920;
const HEIGHT = 1080;
const FRAME_BOUNDS: CameraFrameBounds = { min: [-0.9, -0.08, -0.9], max: [0.9, 2.05, 0.9] };
const ANIMATED_CHARACTER_URI = "/fixtures/threejs-parity/assets/character/soldier.glb";
const HDR_ENVIRONMENT_URI = "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";
const ASSET_TIMEOUT_MS = 30_000;
const FIRST_FRAME_TIMEOUT_MS = 5_000;

type LoadedPipeline = Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>;

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
  let animationFrame = 0;
  let runtime: RuntimeParityAnimationKeyframesRuntime = {
    status: "booting",
    appId: APP_ID,
    statusLabel: "Booting",
    elapsedMs: 0,
    details: ["Preparing WebGL fallback frame before any heavy asset or HDR work."],
    assetStatus: "pending",
    hdrStatus: "pending",
    rendererStatus: "pending",
    frameCount: 0
  };

  const update = (patch: Partial<RuntimeParityAnimationKeyframesRuntime>): void => {
    runtime = {
      ...runtime,
      ...patch,
      elapsedMs: Math.round(performance.now() - startedAt)
    };
    publish(root, runtime);
  };

  const heartbeat = window.setInterval(() => {
    if (runtime.status !== "running" && runtime.status !== "error") {
      update({ details: runtime.details });
    }
  }, 500);
  const firstFrameGuard = window.setTimeout(() => {
    if (runtime.status === "running" || runtime.status === "first-frame" || runtime.status === "error" || runtime.frameCount > 0) {
      return;
    }
    update({
      statusLabel: "First frame delayed",
      details: [
        `First imported animation frame has not rendered after ${FIRST_FRAME_TIMEOUT_MS / 1000}s.`,
        `Current step: ${runtime.statusLabel}.`,
        ...runtime.details
      ]
    });
  }, FIRST_FRAME_TIMEOUT_MS);

  try {
    drawFallbackFrame(canvas);
    update({
      status: "booting",
      statusLabel: "Booting",
      details: [
        "Fallback WebGL frame is visible.",
        "No screenshot readback or proof capture is blocking startup."
      ]
    });

    update({
      status: "compiling-renderer",
      statusLabel: "Compiling renderer",
      rendererStatus: "pending",
      details: [
        "Creating the A3D WebGL2 renderer.",
        "The route must not claim running until at least one real render frame completes."
      ]
    });
    const renderer = await ProductionWebGL2Renderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.011, 1]
    });
    update({
      rendererStatus: "ready",
      details: ["A3D WebGL2 renderer is ready.", "Loading the animated GLB next."]
    });

    const environmentLighting: RenderSource["environmentLighting"] = false;
    const hdrMessage = `HDR environment deferred for route-health startup; ${HDR_ENVIRONMENT_URI} must not block first frame.`;

    update({
      status: "loading-assets",
      statusLabel: "Loading assets",
      assetStatus: "pending",
      hdrStatus: "deferred",
      details: [
        `Loading animated GLB: ${ANIMATED_CHARACTER_URI}`,
        hdrMessage,
        `Asset timeout: ${ASSET_TIMEOUT_MS / 1000}s.`
      ]
    });
    const pipeline = await withTimeout(loadProductionGLTFRenderPipeline({
      url: ANIMATED_CHARACTER_URI,
      assetId: "soldier-keyframes",
      assetName: "Soldier Keyframes",
      width: WIDTH,
      height: HEIGHT,
      rendererInput: {
        cameraPolicy: "require",
        cameraFrameBounds: FRAME_BOUNDS,
        frame: { yawRadians: -0.34, pitchRadians: -0.08, paddingRatio: 0.08, fovYRadians: 0.48 },
        postprocess: false
      }
    }), ASSET_TIMEOUT_MS, `Timed out loading ${ANIMATED_CHARACTER_URI}`);
    update({
      assetStatus: "ready",
      details: [
        `Animated GLB loaded with ${pipeline.asset.animations.length} clips.`,
        "Preparing animation runtime and first render frame."
      ]
    });

    const clip = pipeline.asset.animations.find((animation) => /walk|run/i.test(animation.name))
      ?? pipeline.asset.animations.find((animation) => /run|dance|wave/i.test(animation.name))
      ?? pipeline.asset.animations[0];
    if (!clip) {
      throw new Error("RuntimeParity animation keyframes requires an imported GLB with at least one animation clip.");
    }

    const animationRuntime = createGLTFSceneAnimationRuntime({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset
    });
    const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: WIDTH, height: HEIGHT }, {
      yawRadians: -0.34,
      pitchRadians: -0.08,
      paddingRatio: 0.08,
      fovYRadians: 0.48,
      nearPadding: 0.18,
      farPadding: 2.4
    });
    const placement = composeMat4([0, 0.02, 0], [0, 0.08, 0, 0.9968], [1, 1, 1]);
    const stageItems = createStageItems();
    const source: RenderSource = {
      collectRenderItems: () => [
        ...collectImportedItems(pipeline, placement),
        ...stageItems
      ],
      collectedLights: createLights(),
      get environmentLighting() {
        return environmentLighting;
      },
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      cameraFrameBounds: FRAME_BOUNDS,
      frustumCulling: false,
      postprocess: false
    };
    const metadata = {
      assetId: APP_ID,
      assetName: "RuntimeParity Animation Keyframes",
      assetUri: "/apps/regression-animation-keyframes/",
      meshCount: pipeline.metadata.meshCount,
      primitiveCount: pipeline.metadata.primitiveCount,
      materialCount: pipeline.metadata.materialCount + 2,
      textureCount: pipeline.metadata.textureCount,
      imageCount: pipeline.metadata.imageCount,
      animationCount: pipeline.metadata.animationCount,
      skinCount: pipeline.metadata.skinCount,
      morphTargetCount: pipeline.metadata.morphTargetCount,
      extensionsUsed: pipeline.metadata.extensionsUsed,
      environmentId: "deferred-for-route-health",
      hdrEnvironmentUri: HDR_ENVIRONMENT_URI
    };

    let first = 0;
    let fpsLast = 0;
    let lastPublish = 0;
    let fpsFrames = 0;
    let fps = 0;
    let frameCount = 0;
    let lastApply = animationRuntime.applyClip(clip, 0);

    const render = (now: number) => {
      try {
        if (first === 0) {
          first = now;
          fpsLast = now;
          lastPublish = now;
        }
        const frameStart = performance.now();
        const elapsed = Math.max(0, (now - first) / 1000);
        const clipTime = clip.duration > 0 ? elapsed % clip.duration : elapsed;
        const applyStart = performance.now();
        lastApply = animationRuntime.applyClip(clip, clipTime);
        const applyClipMs = performance.now() - applyStart;
        const renderStart = performance.now();
        const result = renderer.renderFrame({
          source,
          camera: {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix
          },
          metadata
        });
        const renderMs = performance.now() - renderStart;
        frameCount += 1;
        fpsFrames += 1;
        if (now - fpsLast >= 500) {
          fps = Number((fpsFrames * 1000 / (now - fpsLast)).toFixed(1));
          fpsFrames = 0;
          fpsLast = now;
        }

        const nextRuntime: RuntimeParityAnimationKeyframesRuntime = {
          ...runtime,
          status: frameCount === 1 ? "first-frame" : "running",
          statusLabel: frameCount === 1 ? "First frame rendered" : "Running",
          appId: APP_ID,
          elapsedMs: Math.round(performance.now() - startedAt),
          details: [
            frameCount === 1
              ? "First real A3D animation frame rendered. Running starts on the next frame."
              : "Imported GLB animation is being sampled and rendered every frame.",
            hdrMessage
          ],
          clipName: clip.name,
          clipCount: pipeline.asset.animations.length,
          animationTime: Number(clipTime.toFixed(3)),
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          triangles: Math.floor(pipeline.metadata.indexCount / 3),
          tracksApplied: lastApply.tracksApplied,
          skinningPalettesUpdated: lastApply.skinningPalettesUpdated,
          fps,
          applyClipMs: Number(applyClipMs.toFixed(2)),
          renderMs: Number(renderMs.toFixed(2)),
          frameMs: Number((performance.now() - frameStart).toFixed(2))
        };
        runtime = nextRuntime;
        if (frameCount === 1) window.clearTimeout(firstFrameGuard);
        window.__a3dRuntimeParityAnimationKeyframes = runtime;
        if (frameCount === 1 || now - lastPublish >= 250) {
          publish(root, runtime);
          lastPublish = now;
        }
        animationFrame = requestAnimationFrame(render);
      } catch (error) {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        update({
          status: "error",
          statusLabel: "Error",
          error: formatError(error),
          details: ["The animation loop failed after startup.", "The fallback UI is intentionally still visible."]
        });
      }
    };

    animationFrame = requestAnimationFrame(render);
  } catch (error) {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    update({
      status: "error",
      statusLabel: "Error",
      error: formatError(error),
      details: [
        "The route failed before it could render an imported animation frame.",
        "The visible fallback frame was drawn before this failure."
      ]
    });
  } finally {
    window.clearInterval(heartbeat);
    window.clearTimeout(firstFrameGuard);
  }
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
      label: `runtime-parity-animation:${node.name}`,
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
  const floor = new PBRMaterial({
    name: "runtime-parity-animation-floor",
    baseColor: [0.1, 0.108, 0.118, 1],
    metallic: 0,
    roughness: 0.44,
    clearcoatFactor: 0.12,
    clearcoatRoughnessFactor: 0.2,
    environmentIntensity: 0.92
  });
  const back = new PBRMaterial({
    name: "runtime-parity-animation-backdrop",
    baseColor: [0.018, 0.022, 0.028, 1],
    metallic: 0,
    roughness: 0.62,
    environmentIntensity: 0.65
  });
  return [
    {
      label: "runtime-parity-animation-floor",
      geometry: cube,
      material: floor,
      modelMatrix: composeMat4([0, -0.055, 0], [0, 0, 0, 1], [2.8, 0.04, 1.8])
    },
    {
      label: "runtime-parity-animation-backdrop",
      geometry: cube,
      material: back,
      modelMatrix: composeMat4([0, 0.78, -0.78], [0, 0, 0, 1], [2.8, 1.7, 0.04])
    }
  ];
}

function createLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("runtime-parity-animation-key");
  key.castsShadow = false;
  key.intensity = 4.2;
  key.color = [1, 0.93, 0.82];
  const rim = new DirectionalLight("runtime-parity-animation-rim");
  rim.castsShadow = false;
  rim.intensity = 2.2;
  rim.color = [0.7, 0.82, 1];
  return [
    {
      kind: "directional",
      color: [1, 0.93, 0.82],
      intensity: 4.2,
      position: [2.2, 3.4, 2.1],
      direction: [-0.34, -0.74, -0.5],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: key
    },
    {
      kind: "directional",
      color: [0.7, 0.82, 1],
      intensity: 2.2,
      position: [-2.4, 2.1, -1.5],
      direction: [0.58, -0.34, 0.74],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: rim
    }
  ];
}

function publish(root: HTMLElement, runtime: RuntimeParityAnimationKeyframesRuntime): void {
  window.__a3dRuntimeParityAnimationKeyframes = runtime;
  const statusClass = runtime.status === "error" ? "is-error" : runtime.status === "running" ? "is-running" : "is-loading";
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>RuntimeParity Animation Keyframes</h1>
        <p>Imported GLB clip sampled and rendered every frame by A3D WebGL2.</p>
      </div>
      <button id="runtime-state" class="${statusClass}" type="button" disabled>${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      <span>${escapeHtml(runtime.status)}</span>
      <span>${escapeHtml(runtime.clipName ?? "no clip yet")}</span>
      <span>${runtime.frameCount} frames</span>
      <span>${runtime.fps ?? 0} fps</span>
      <span>${runtime.drawCalls ?? 0} draw calls</span>
      <span>${runtime.triangles ?? 0} triangles</span>
      <span>${runtime.tracksApplied ?? 0} tracks</span>
      <span>${runtime.skinningPalettesUpdated ?? 0} skin palettes</span>
      <span>${runtime.applyClipMs ?? 0}ms clip</span>
      <span>${runtime.renderMs ?? 0}ms render</span>
      <span>${runtime.frameMs ?? 0}ms frame</span>
      <span>${runtime.elapsedMs}ms elapsed</span>
      <span>asset: ${escapeHtml(runtime.assetStatus ?? "pending")}</span>
      <span>renderer: ${escapeHtml(runtime.rendererStatus ?? "pending")}</span>
      <span>hdr: ${escapeHtml(runtime.hdrStatus ?? "pending")}</span>
    </section>
    <section class="runtime-details">
      ${runtime.details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join("")}
    </section>
    ${runtime.error ? `<pre class="runtime-error">${escapeHtml(runtime.error)}</pre>` : ""}
  `;
}

function drawFallbackFrame(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true
  });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0.008, 0.011, 0.016, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  drawRect(gl, 0, 0, canvas.width, Math.round(canvas.height * 0.24), [0.018, 0.024, 0.033, 1]);
  drawRect(gl, Math.round(canvas.width * 0.09), Math.round(canvas.height * 0.2), Math.round(canvas.width * 0.82), 8, [0.22, 0.45, 0.98, 1]);
  drawRect(gl, Math.round(canvas.width * 0.16), Math.round(canvas.height * 0.33), Math.round(canvas.width * 0.08), Math.round(canvas.height * 0.34), [0.28, 0.5, 0.95, 1]);
  drawRect(gl, Math.round(canvas.width * 0.28), Math.round(canvas.height * 0.42), Math.round(canvas.width * 0.1), Math.round(canvas.height * 0.25), [0.18, 0.74, 0.6, 1]);
  drawRect(gl, Math.round(canvas.width * 0.42), Math.round(canvas.height * 0.25), Math.round(canvas.width * 0.2), Math.round(canvas.height * 0.42), [0.72, 0.76, 0.84, 1]);
  drawRect(gl, Math.round(canvas.width * 0.67), Math.round(canvas.height * 0.37), Math.round(canvas.width * 0.09), Math.round(canvas.height * 0.3), [0.95, 0.48, 0.2, 1]);
  drawRect(gl, Math.round(canvas.width * 0.79), Math.round(canvas.height * 0.5), Math.round(canvas.width * 0.05), Math.round(canvas.height * 0.17), [0.96, 0.75, 0.28, 1]);
  gl.disable(gl.SCISSOR_TEST);
}

function drawRect(gl: WebGL2RenderingContext, x: number, y: number, width: number, height: number, color: readonly [number, number, number, number]): void {
  gl.scissor(x, y, width, height);
  gl.clearColor(color[0], color[1], color[2], color[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
