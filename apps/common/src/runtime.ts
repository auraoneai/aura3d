import { createGLTFSceneAnimationRuntime, loadV6GLTFRenderPipeline, type V6GLTFRenderMetadata } from "@galileo3d/assets";
import {
  computePerspectiveCameraFrame,
  Geometry,
  PBRMaterial,
  ProductionWebGL2Renderer,
  UnlitMaterial,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  createV6WebGPUReport,
  summarizeV6AnimationWorkflow,
  type CameraFrameBounds,
  type V6ImportedAssetRenderMetadata,
  type V6RenderProof,
  type RenderItem,
  type RenderSource,
  type V6WebGPUReport
} from "@galileo3d/rendering";
import { composeMat4, multiplyMat4, transformPoint, type Mat4 } from "@galileo3d/scene";

export interface V6AppAsset {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly role: "primary" | "secondary";
}

export interface V6AppSceneDefinition {
  readonly appId: string;
  readonly sceneId: string;
  readonly title: string;
  readonly workflow: string;
  readonly assets: readonly V6AppAsset[];
  readonly environment: {
    readonly id: string;
    readonly label: string;
    readonly file: string;
    readonly exposure: number;
    readonly intensity: number;
    readonly rotation: number;
  };
  readonly postprocess: boolean;
  readonly webgpuReport: boolean;
  readonly expectedPostprocessChain: readonly string[];
  readonly renderSecondaryAssets?: boolean;
  readonly studioStage?: boolean;
  readonly cameraFrameBounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly cameraFrameOptions?: {
    readonly fovYRadians?: number;
    readonly paddingRatio?: number;
    readonly minDistance?: number;
    readonly nearPadding?: number;
    readonly farPadding?: number;
    readonly yawRadians?: number;
    readonly pitchRadians?: number;
  };
}

export interface V6AppUiDefinition {
  readonly primaryActionLabel: string;
  readonly secondaryLabel: string;
}

export interface G3DV6RuntimeMetrics {
  readonly appId: string;
  readonly sceneId: string;
  readonly workflow: string;
  readonly rendererBackend: "webgl2";
  readonly assetIds: readonly string[];
  readonly primaryAssetId: string;
  readonly hdrEnvironmentId: string;
  readonly drawCalls: number;
  readonly triangleCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly textureMemoryEstimate: number;
  readonly lightCount: number;
  readonly shadowMapCount: number;
  readonly postprocessChain: readonly string[];
  readonly animationState: {
    readonly importedAnimation: boolean;
    readonly skinningReady: boolean;
    readonly morphTargetsReady: boolean;
  };
  readonly frameTimeMs: number;
  readonly startupTimeMs: number;
  readonly firstFrameTimeMs: number;
  readonly firstFrameRenderedAtMs: number;
  readonly warnings: readonly string[];
  readonly screenshotPath: string;
  readonly animationFrameCount?: number;
  readonly animationClipName?: string;
  readonly animationFps?: number;
  readonly animationLoopStarted?: boolean;
  readonly animationLastFrameTimeMs?: number;
  readonly animationClipTime?: number;
  readonly animationClipCount?: number;
}

export type G3DV6RuntimeStatus =
  | "loading"
  | "loading-environment"
  | "loading-asset"
  | "creating-renderer"
  | "rendering-first-frame"
  | "ready"
  | "animating"
  | "error";

export interface G3DV6RuntimeLifecycle {
  readonly status: G3DV6RuntimeStatus;
  readonly message: string;
  readonly startedAtMs: number;
  readonly updatedAtMs: number;
  readonly elapsedMs: number;
  readonly timings: readonly G3DV6RuntimeTiming[];
}

export interface G3DV6RuntimeTiming {
  readonly phase: G3DV6RuntimeStatus | "load-secondary-assets";
  readonly durationMs: number;
}

export interface G3DV6Runtime {
  readonly status: G3DV6RuntimeStatus;
  readonly error?: string;
  readonly appId: string;
  readonly sceneId: string;
  readonly rendererBackend?: "webgl2";
  readonly lifecycle: G3DV6RuntimeLifecycle;
  readonly runtime?: G3DV6RuntimeMetrics;
  readonly metadata?: V6GLTFRenderMetadata;
  readonly secondaryMetadata?: readonly V6GLTFRenderMetadata[];
  readonly proof?: V6RenderProof;
  readonly frame?: ReturnType<ProductionWebGL2Renderer["renderFrame"]>;
  readonly webgpu?: V6WebGPUReport;
  readonly interactionCount: number;
  readonly lastInteraction?: string;
}

declare global {
  interface Window {
    __g3dV6Runtime?: G3DV6Runtime;
    __g3dV6Controls?: G3DV6AnimationControls;
  }
}

export interface G3DV6AnimationControls {
  paused: boolean;
  clipIndex: number;
  scrubTime: number;
  speed: number;
}

export async function runV6App(scene: V6AppSceneDefinition, ui: V6AppUiDefinition): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${scene.appId} requires #app and canvas#viewport.`);
  }
  const startedAtMs = performance.now();
  const timings: G3DV6RuntimeTiming[] = [];
  const initial: G3DV6Runtime = {
    status: "loading",
    appId: scene.appId,
    sceneId: scene.sceneId,
    lifecycle: createLifecycle("loading", "Preparing V6 interactive renderer startup.", startedAtMs, timings),
    interactionCount: 0
  };
  publishV6Runtime(root, scene, ui, initial);

  try {
    const primary = scene.assets.find((asset) => asset.role === "primary") ?? scene.assets[0];
    if (!primary) throw new Error(`${scene.appId} has no configured V6 asset.`);
    const publishPhase = (status: G3DV6RuntimeStatus, message: string) => {
      publishV6Runtime(root, scene, ui, {
        ...(window.__g3dV6Runtime ?? initial),
        status,
        appId: scene.appId,
        sceneId: scene.sceneId,
        lifecycle: createLifecycle(status, message, startedAtMs, timings)
      });
    };

    publishPhase("loading-environment", `Loading HDR environment ${scene.environment.label}.`);
    const hdrStart = performance.now();
    const hdr = await fetchBytes(`/fixtures/environment-corpus/hdri/${scene.environment.file}`);
    timings.push(createTiming("loading-environment", hdrStart));

    const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
      id: scene.environment.id,
      label: scene.environment.label,
      intensity: scene.environment.intensity,
      backgroundIntensity: 0.85,
      rotation: scene.environment.rotation,
      toneMapping: { operator: "filmic", exposure: scene.environment.exposure, whitePoint: 11.2 }
    });
    const lighting = createV6EnvironmentLightingResources(hdrPipeline);

    publishPhase("loading-asset", `Loading primary GLB ${primary.label}.`);
    const assetStart = performance.now();
    const pipeline = await loadV6GLTFRenderPipeline({
      url: resolveV6AssetUrl(primary.file),
      assetId: primary.id,
      assetName: primary.label,
      width: canvas.width,
      height: canvas.height,
      rendererInput: {
        environmentLighting: lighting.lighting,
        qualityPreset: scene.postprocess ? "hdr-studio-preview" : "studio-preview",
        cameraPolicy: "require",
        ...(scene.cameraFrameBounds ? { cameraFrameBounds: scene.cameraFrameBounds } : {}),
        ...(scene.cameraFrameOptions ? { frame: scene.cameraFrameOptions } : {}),
        ...(scene.postprocess ? {} : { postprocess: false })
      }
    });
    timings.push(createTiming("loading-asset", assetStart));

    publishPhase("loading-asset", "Loading secondary scene assets.");
    const secondaryStart = performance.now();
    const secondaryPipelines = scene.renderSecondaryAssets === false
      ? []
      : await loadSecondaryPipelines(scene, primary.id, canvas.width, canvas.height);
    timings.push(createTiming("load-secondary-assets", secondaryStart));
    const secondaryMetadata = secondaryPipelines.map((item) => item.metadata);
    const composed = secondaryPipelines.length > 0
      ? createComposedRenderInput([pipeline, ...secondaryPipelines], {
          width: canvas.width,
          height: canvas.height,
          environmentLighting: lighting.lighting,
          postprocess: pipeline.source.postprocess,
          frameOptions: scene.cameraFrameOptions,
          studioStage: scene.studioStage
        })
      : {
          source: pipeline.source,
          camera: pipeline.camera,
          frameBounds: pipeline.resources.bounds,
          metadata: pipeline.metadata
        };

    publishPhase("creating-renderer", "Creating WebGL2 renderer.");
    const rendererStart = performance.now();
    const renderer = await ProductionWebGL2Renderer.create({
      canvas,
      width: canvas.width,
      height: canvas.height,
      preserveDrawingBuffer: true,
      clearColor: [0.012, 0.015, 0.02, 1]
    });
    timings.push(createTiming("creating-renderer", rendererStart));

    publishPhase("rendering-first-frame", "Rendering first interactive frame.");
    const frameStart = performance.now();
    const importedAssetMetadata = createImportedAssetMetadata(composed.metadata, scene);
    const frame = renderer.renderFrame({
      source: composed.source,
      camera: composed.camera,
      metadata: importedAssetMetadata
    });
    const frameTimeMs = Number((performance.now() - frameStart).toFixed(3));
    timings.push(createTiming("rendering-first-frame", frameStart));
    const animation = summarizeV6AnimationWorkflow({
      assetId: pipeline.metadata.assetId,
      animationCount: pipeline.metadata.animationCount,
      skinCount: pipeline.metadata.skinCount,
      morphTargetCount: pipeline.metadata.morphTargetCount,
      primitiveCount: pipeline.metadata.primitiveCount,
      materialCount: pipeline.metadata.materialCount
    });
    const webgpu = scene.webgpuReport
      ? await createV6WebGPUReport((navigator as Navigator & { gpu?: unknown }).gpu as Parameters<typeof createV6WebGPUReport>[0])
      : undefined;
    const runtime: G3DV6Runtime = {
      status: "ready",
      appId: scene.appId,
      sceneId: scene.sceneId,
      rendererBackend: "webgl2",
      lifecycle: createLifecycle("ready", "First interactive WebGL2 frame rendered.", startedAtMs, timings),
      runtime: {
        appId: scene.appId,
        sceneId: scene.sceneId,
        workflow: scene.workflow,
        rendererBackend: "webgl2",
        assetIds: scene.assets.map((asset) => asset.id),
        primaryAssetId: pipeline.metadata.assetId,
        hdrEnvironmentId: scene.environment.id,
        drawCalls: frame.diagnostics.drawCalls,
        triangleCount: Math.max(0, Math.floor(composed.metadata.indexCount / 3)),
        materialCount: composed.metadata.materialCount,
        textureCount: composed.metadata.textureCount,
        textureMemoryEstimate: frame.diagnostics.textureBytes ?? 0,
        lightCount: 1,
        shadowMapCount: 0,
        postprocessChain: scene.expectedPostprocessChain,
        animationState: {
          importedAnimation: animation.importedAnimation,
          skinningReady: animation.skinningReady,
          morphTargetsReady: animation.morphTargetsReady || secondaryMetadata.some((metadata) => metadata.hasMorphTargets)
        },
        frameTimeMs,
        startupTimeMs: Number((performance.now() - startedAtMs).toFixed(3)),
        firstFrameTimeMs: frameTimeMs,
        firstFrameRenderedAtMs: Number((performance.now() - startedAtMs).toFixed(3)),
        warnings: [...animation.warnings, ...(webgpu?.warnings ?? [])],
        screenshotPath: `tests/reports/production-runtime-app-suite/${scene.appId}.png`
      },
      metadata: pipeline.metadata,
      secondaryMetadata,
      frame,
      ...(webgpu ? { webgpu } : {}),
      interactionCount: 0
    };
    publishV6Runtime(root, scene, ui, runtime);
    if (secondaryPipelines.length === 0 && pipeline.asset.animations.length > 0) {
      startV6AnimationLoop({
        root,
        scene,
        ui,
        renderer,
        pipeline,
        source: composed.source,
        camera: composed.camera,
        metadata: importedAssetMetadata,
        startedAtMs,
        timings
      });
    }
  } catch (error) {
    publishV6Runtime(root, scene, ui, {
      status: "error",
      appId: scene.appId,
      sceneId: scene.sceneId,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      lifecycle: createLifecycle("error", "V6 app startup failed before a usable interactive frame.", startedAtMs, timings),
      interactionCount: window.__g3dV6Runtime?.interactionCount ?? 0
    });
  }
}

export async function runV6InteractiveApp(scene: V6AppSceneDefinition, ui: V6AppUiDefinition): Promise<void> {
  return runV6App(scene, ui);
}

function publishV6Runtime(root: HTMLElement, scene: V6AppSceneDefinition, ui: V6AppUiDefinition, runtime: G3DV6Runtime): void {
  window.__g3dV6Runtime = runtime;
  mountV6AppShell(root, scene, ui, runtime);
}

function createLifecycle(
  status: G3DV6RuntimeStatus,
  message: string,
  startedAtMs: number,
  timings: readonly G3DV6RuntimeTiming[]
): G3DV6RuntimeLifecycle {
  const now = performance.now();
  return {
    status,
    message,
    startedAtMs: Number(startedAtMs.toFixed(3)),
    updatedAtMs: Number(now.toFixed(3)),
    elapsedMs: Number((now - startedAtMs).toFixed(3)),
    timings: [...timings]
  };
}

function createTiming(phase: G3DV6RuntimeTiming["phase"], startMs: number): G3DV6RuntimeTiming {
  return {
    phase,
    durationMs: Number((performance.now() - startMs).toFixed(3))
  };
}

function createImportedAssetMetadata(
  metadata: V6GLTFRenderMetadata,
  scene: V6AppSceneDefinition
): V6ImportedAssetRenderMetadata {
  return {
    assetId: metadata.assetId,
    assetName: metadata.assetName,
    assetUri: metadata.assetUri,
    meshCount: metadata.meshCount,
    primitiveCount: metadata.primitiveCount,
    materialCount: metadata.materialCount,
    textureCount: metadata.textureCount,
    imageCount: metadata.imageCount,
    animationCount: metadata.animationCount,
    skinCount: metadata.skinCount,
    morphTargetCount: metadata.morphTargetCount,
    extensionsUsed: metadata.extensionsUsed,
    environmentId: scene.environment.id,
    hdrEnvironmentUri: `/fixtures/environment-corpus/hdri/${scene.environment.file}`
  };
}

function mountV6AppShell(root: HTMLElement, scene: V6AppSceneDefinition, ui: V6AppUiDefinition, runtime: G3DV6Runtime): void {
  const metrics = runtime.runtime;
  const lifecycle = runtime.lifecycle;
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>${scene.title}</h1>
        <p>${ui.secondaryLabel}</p>
      </div>
      <button id="primary-action" type="button">${ui.primaryActionLabel}</button>
    </section>
    <section class="metrics">
      <span>${runtime.status}</span>
      <span>${lifecycle.message}</span>
      <span>${lifecycle.elapsedMs}ms startup</span>
      <span>${metrics ? `${metrics.drawCalls} draw calls` : "loading renderer"}</span>
      <span>${metrics ? `${metrics.triangleCount} triangles` : scene.environment.label}</span>
      <span>${metrics ? `${metrics.textureCount} textures` : scene.assets.map((asset) => asset.id).join(", ")}</span>
      ${metrics ? `<span>${metrics.firstFrameTimeMs}ms first frame</span>` : ""}
      ${metrics?.animationClipName ? `<span>${metrics.animationClipName}</span>` : ""}
      ${metrics?.animationFrameCount !== undefined ? `<span>${metrics.animationFrameCount} animation frames</span>` : ""}
      ${metrics?.animationClipTime !== undefined ? `<span>${metrics.animationClipTime}s clip</span>` : ""}
      ${metrics?.animationFps !== undefined ? `<span>${metrics.animationFps} fps</span>` : ""}
      ${runtime.error ? `<span>${runtime.error}</span>` : ""}
    </section>
    ${metrics?.animationClipName ? renderV6AnimationControls(runtime) : ""}
  `;
  root.querySelector("#primary-action")?.addEventListener("click", () => {
    const current = window.__g3dV6Runtime;
    const controls = getV6AnimationControls();
    controls.paused = !controls.paused;
    if (!current) return;
    window.__g3dV6Runtime = {
      ...current,
      interactionCount: current.interactionCount + 1,
      lastInteraction: ui.primaryActionLabel
    };
    mountV6AppShell(root, scene, ui, window.__g3dV6Runtime);
  });
  root.querySelector<HTMLSelectElement>("#clip-select")?.addEventListener("change", (event) => {
    const controls = getV6AnimationControls();
    controls.clipIndex = Number((event.currentTarget as HTMLSelectElement).value) || 0;
    controls.scrubTime = 0;
  });
  root.querySelector<HTMLInputElement>("#clip-scrub")?.addEventListener("input", (event) => {
    const controls = getV6AnimationControls();
    controls.paused = true;
    controls.scrubTime = Number((event.currentTarget as HTMLInputElement).value) || 0;
  });
}

function renderV6AnimationControls(runtime: G3DV6Runtime): string {
  const controls = getV6AnimationControls();
  const clipCount = Math.max(1, runtime.runtime?.animationClipCount ?? 1);
  const duration = Math.max(0.1, runtime.runtime?.animationClipTime ?? controls.scrubTime ?? 1);
  return `
    <section class="metrics" data-production-runtime-animation-controls="ready">
      <label>
        Clip
        <select id="clip-select">
          ${Array.from({ length: clipCount }, (_, index) => `<option value="${index}" ${index === controls.clipIndex ? "selected" : ""}>Clip ${index + 1}</option>`).join("")}
        </select>
      </label>
      <label>
        Scrub
        <input id="clip-scrub" type="range" min="0" max="${duration.toFixed(3)}" step="0.033" value="${controls.scrubTime.toFixed(3)}" />
      </label>
      <span>${controls.paused ? "paused" : "playing"}</span>
    </section>
  `;
}

type V6Pipeline = Awaited<ReturnType<typeof loadV6GLTFRenderPipeline>>;

async function loadSecondaryPipelines(
  scene: V6AppSceneDefinition,
  primaryAssetId: string,
  width: number,
  height: number
): Promise<readonly V6Pipeline[]> {
  const results: V6Pipeline[] = [];
  for (const asset of scene.assets.filter((item) => item.id !== primaryAssetId)) {
    const pipeline = await loadV6GLTFRenderPipeline({
      url: resolveV6AssetUrl(asset.file),
      assetId: asset.id,
      assetName: asset.label,
      width,
      height,
      rendererInput: {
        qualityPreset: "studio-preview",
        cameraPolicy: "require",
        postprocess: false
      }
    });
    results.push(pipeline);
  }
  return results;
}

function startV6AnimationLoop(options: {
  readonly root: HTMLElement;
  readonly scene: V6AppSceneDefinition;
  readonly ui: V6AppUiDefinition;
  readonly renderer: ProductionWebGL2Renderer;
  readonly pipeline: V6Pipeline;
  readonly source: RenderSource;
  readonly camera: V6Pipeline["camera"];
  readonly metadata: V6ImportedAssetRenderMetadata;
  readonly startedAtMs: number;
  readonly timings: readonly G3DV6RuntimeTiming[];
}): void {
  const clips = options.pipeline.asset.animations;
  const initialClip = clips.find((animation) => /walk|run|idle/i.test(animation.name)) ?? clips[0];
  if (!initialClip) return;
  window.__g3dV6Controls = {
    paused: false,
    clipIndex: Math.max(0, clips.indexOf(initialClip)),
    scrubTime: 0,
    speed: 1
  };
  const runtime = createGLTFSceneAnimationRuntime({
    scene: options.pipeline.resources.scene,
    clips,
    asset: options.pipeline.asset
  });
  let startTime = 0;
  let lastPublish = 0;
  let fpsStart = 0;
  let fpsFrames = 0;
  let fps = 0;
  let animationFrameCount = 0;
  let animationFrameId = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
  };
  window.addEventListener("beforeunload", stop, { once: true });
  (import.meta as unknown as { readonly hot?: { dispose(callback: () => void): void } }).hot?.dispose(stop);
  const tick = (now: number) => {
    if (stopped) return;
    if (startTime === 0) {
      startTime = now;
      lastPublish = now;
      fpsStart = now;
    }
    const animationFrameStart = performance.now();
    let result: ReturnType<ProductionWebGL2Renderer["renderFrame"]>;
    try {
      const elapsedSeconds = Math.max(0, (now - startTime) / 1000);
      const controls = getV6AnimationControls();
      const clip = clips[Math.max(0, Math.min(clips.length - 1, controls.clipIndex))] ?? initialClip;
      const animatedTime = elapsedSeconds * Math.max(0, controls.speed);
      const clipTime = controls.paused
        ? Math.max(0, Math.min(clip.duration || 0, controls.scrubTime))
        : clip.duration > 0 ? animatedTime % clip.duration : animatedTime;
      controls.scrubTime = clipTime;
      runtime.applyClip(clip, clipTime);
      result = options.renderer.renderFrame({
        source: options.source,
        camera: options.camera,
        metadata: options.metadata
      });
    } catch (error) {
      stopped = true;
      const current = window.__g3dV6Runtime;
      publishV6Runtime(options.root, options.scene, options.ui, {
        ...(current ?? {
          appId: options.scene.appId,
          sceneId: options.scene.sceneId,
          interactionCount: 0
        }),
        status: "error",
        appId: options.scene.appId,
        sceneId: options.scene.sceneId,
        error: error instanceof Error ? error.stack ?? error.message : String(error),
        lifecycle: createLifecycle("error", "Animation loop failed after first frame.", options.startedAtMs, options.timings)
      });
      return;
    }
    const animationLastFrameTimeMs = Number((performance.now() - animationFrameStart).toFixed(3));
    animationFrameCount += 1;
    fpsFrames += 1;
    if (now - fpsStart >= 500) {
      fps = Number((fpsFrames * 1000 / (now - fpsStart)).toFixed(1));
      fpsFrames = 0;
      fpsStart = now;
    }
    const current = window.__g3dV6Runtime;
    if (current?.runtime && now - lastPublish >= 250) {
      publishV6Runtime(options.root, options.scene, options.ui, {
        ...current,
        status: "ready",
        lifecycle: createLifecycle("animating", "Animation loop is rendering imported GLB frames.", options.startedAtMs, options.timings),
        frame: result,
        runtime: {
          ...current.runtime,
          drawCalls: result.diagnostics.drawCalls,
          animationFrameCount,
          animationClipName: clip.name,
          animationClipCount: clips.length,
          animationClipTime: Number(controls.scrubTime.toFixed(3)),
          animationFps: fps,
          animationLoopStarted: true,
          animationLastFrameTimeMs
        }
      });
      lastPublish = now;
    }
    animationFrameId = requestAnimationFrame(tick);
  };
  animationFrameId = requestAnimationFrame(tick);
}

function getV6AnimationControls(): G3DV6AnimationControls {
  window.__g3dV6Controls ??= {
    paused: false,
    clipIndex: 0,
    scrubTime: 0,
    speed: 1
  };
  return window.__g3dV6Controls;
}

function resolveV6AssetUrl(file: string): string {
  if (file.startsWith("/")) return file;
  if (file.includes("/")) return `/fixtures/production-runtime/assets/${file}`;
  return `/fixtures/asset-corpus/${file}`;
}

interface ComposedRenderInput {
  readonly source: RenderSource;
  readonly camera: V6Pipeline["camera"];
  readonly frameBounds: CameraFrameBounds;
  readonly metadata: V6GLTFRenderMetadata;
}

function createComposedRenderInput(
  pipelines: readonly V6Pipeline[],
  options: {
    readonly width: number;
    readonly height: number;
    readonly environmentLighting: NonNullable<RenderSource["environmentLighting"]>;
    readonly postprocess: RenderSource["postprocess"];
    readonly frameOptions?: V6AppSceneDefinition["cameraFrameOptions"];
    readonly studioStage?: boolean;
  }
): ComposedRenderInput {
  const placements = createAssetPlacements(pipelines);
  const items: RenderItem[] = [];
  const transformedBounds: CameraFrameBounds[] = [];
  for (let index = 0; index < pipelines.length; index += 1) {
    const pipeline = pipelines[index]!;
    const placement = placements[index]!;
    transformedBounds.push(transformBounds(pipeline.resources.bounds, placement));
    pipeline.resources.scene.updateWorldTransforms();
    for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
      const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
      const material = pipeline.resources.materialLibrary.get(renderable.material);
      if (!geometry || !material) continue;
      const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
      const modelMatrix = multiplyMat4(placement, node.transform.worldMatrix as Mat4);
      items.push({
        geometry,
        material,
        label: `${pipeline.metadata.assetId}:${node.name}`,
        modelMatrix,
        ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
        ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
        ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
      });
    }
  }
  const frameBounds = unionBounds(transformedBounds);
  if (options.studioStage !== false) {
    items.push(...createStudioStageItems(frameBounds));
  }
  const frame = computePerspectiveCameraFrame(frameBounds, { width: options.width, height: options.height }, {
    paddingRatio: 0.12,
    yawRadians: -0.44,
    pitchRadians: -0.16,
    nearPadding: 0.18,
    farPadding: 2.6,
    ...options.frameOptions
  });
  return {
    source: {
      renderItems: items,
      environmentLighting: options.environmentLighting,
      ...(options.postprocess !== undefined ? { postprocess: options.postprocess } : {}),
      cameraPolicy: "require",
      cameraPosition: frame.cameraPosition,
      cameraFrameBounds: frameBounds,
      frustumCulling: false
    },
    camera: {
      viewProjectionMatrix: frame.viewProjectionMatrix,
      viewMatrix: frame.viewMatrix,
      projectionMatrix: frame.projectionMatrix
    },
    frameBounds,
    metadata: mergePipelineMetadata(pipelines)
  };
}

function createAssetPlacements(pipelines: readonly V6Pipeline[]): readonly Mat4[] {
  if (pipelines.length <= 1) return [identityPlacement()];
  const spacing = pipelines.length === 2 ? 1.45 : 1.22;
  const center = (pipelines.length - 1) / 2;
  return pipelines.map((pipeline, index) => {
    const bounds = pipeline.resources.bounds;
    const height = Math.max(0.001, bounds.max[1] - bounds.min[1]);
    const depth = Math.max(0.001, bounds.max[2] - bounds.min[2]);
    const targetHeight = index === 0 ? 1.55 : 1.28;
    const scale = targetHeight / height;
    const assetCenter: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2
    ];
    const offset: [number, number, number] = [
      (index - center) * spacing,
      0,
      index === 0 ? 0 : Math.min(0.28, depth * scale * 0.18)
    ];
    return multiplyMat4(
      composeMat4(offset, [0, 0, 0, 1], [scale, scale, scale]),
      composeMat4([-assetCenter[0], -assetCenter[1], -assetCenter[2]], [0, 0, 0, 1], [1, 1, 1])
    );
  });
}

function createStudioStageItems(bounds: CameraFrameBounds): readonly RenderItem[] {
  const width = Math.max(4.8, (bounds.max[0] - bounds.min[0]) * 2.8);
  const height = Math.max(2.8, (bounds.max[1] - bounds.min[1]) * 2.2);
  const depth = Math.max(3.6, (bounds.max[2] - bounds.min[2]) * 4 + 2.4);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const floorY = bounds.min[1] - 0.06;
  const backZ = bounds.min[2] - depth * 0.34;
  const sideX = width * 0.46;
  const stageGeometry = Geometry.litCube(1);
  const softboxGeometry = Geometry.litCube(1);
  const floorMaterial = new PBRMaterial({
    name: "production-runtime-studio-matte-floor",
    baseColor: [0.18, 0.19, 0.2, 1],
    metallic: 0,
    roughness: 0.74,
    environmentIntensity: 0.48
  });
  const backdropMaterial = new PBRMaterial({
    name: "production-runtime-studio-gradient-backdrop",
    baseColor: [0.075, 0.09, 0.12, 1],
    metallic: 0,
    roughness: 0.88,
    environmentIntensity: 0.58
  });
  const warmSoftbox = new UnlitMaterial({ name: "production-runtime-studio-warm-softbox", color: [1, 0.82, 0.52, 1] });
  const coolSoftbox = new UnlitMaterial({ name: "production-runtime-studio-cool-softbox", color: [0.38, 0.62, 1, 1] });
  return [
    {
      label: "production-runtime-studio-floor",
      geometry: stageGeometry,
      material: floorMaterial,
      modelMatrix: composeMat4([centerX, floorY, centerZ + depth * 0.15], [0, 0, 0, 1], [width, 0.04, depth])
    },
    {
      label: "production-runtime-studio-backdrop",
      geometry: stageGeometry,
      material: backdropMaterial,
      modelMatrix: composeMat4([centerX, centerY + height * 0.2, backZ], [0, 0, 0, 1], [width, height, 0.05])
    },
    {
      label: "production-runtime-studio-warm-softbox",
      geometry: softboxGeometry,
      material: warmSoftbox,
      modelMatrix: composeMat4([centerX - sideX, centerY + height * 0.22, centerZ - 0.62], [0, 0, 0, 1], [0.08, height * 0.58, 0.05])
    },
    {
      label: "production-runtime-studio-cool-softbox",
      geometry: softboxGeometry,
      material: coolSoftbox,
      modelMatrix: composeMat4([centerX + sideX, centerY + height * 0.12, centerZ - 0.92], [0, 0, 0, 1], [0.08, height * 0.46, 0.05])
    }
  ];
}

function identityPlacement(): Mat4 {
  return composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
}

function transformBounds(bounds: CameraFrameBounds, matrix: Mat4): CameraFrameBounds {
  const corners: readonly [number, number, number][] = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]]
  ];
  const transformed = corners.map((corner) => transformPoint(matrix, corner));
  return {
    min: [
      Math.min(...transformed.map((point) => point[0])),
      Math.min(...transformed.map((point) => point[1])),
      Math.min(...transformed.map((point) => point[2]))
    ],
    max: [
      Math.max(...transformed.map((point) => point[0])),
      Math.max(...transformed.map((point) => point[1])),
      Math.max(...transformed.map((point) => point[2]))
    ]
  };
}

function unionBounds(bounds: readonly CameraFrameBounds[]): CameraFrameBounds {
  return {
    min: [
      Math.min(...bounds.map((item) => item.min[0])),
      Math.min(...bounds.map((item) => item.min[1])),
      Math.min(...bounds.map((item) => item.min[2]))
    ],
    max: [
      Math.max(...bounds.map((item) => item.max[0])),
      Math.max(...bounds.map((item) => item.max[1])),
      Math.max(...bounds.map((item) => item.max[2]))
    ]
  };
}

function mergePipelineMetadata(pipelines: readonly V6Pipeline[]): V6GLTFRenderMetadata {
  const primary = pipelines[0]!.metadata;
  const sum = (field: keyof Pick<V6GLTFRenderMetadata, "meshCount" | "primitiveCount" | "materialCount" | "textureCount" | "imageCount" | "animationCount" | "skinCount" | "morphTargetCount" | "vertexCount" | "indexCount" | "normalMapCount" | "ormTextureCount" | "emissiveTextureCount">): number =>
    pipelines.reduce((total, item) => total + Number(item.metadata[field] ?? 0), 0);
  return {
    ...primary,
    assetId: pipelines.length > 1 ? `${primary.assetId}-composition` : primary.assetId,
    assetName: pipelines.length > 1 ? `${primary.assetName} Composition` : primary.assetName,
    meshCount: sum("meshCount"),
    primitiveCount: sum("primitiveCount"),
    materialCount: sum("materialCount"),
    textureCount: sum("textureCount"),
    imageCount: sum("imageCount"),
    animationCount: sum("animationCount"),
    skinCount: sum("skinCount"),
    morphTargetCount: sum("morphTargetCount"),
    vertexCount: sum("vertexCount"),
    indexCount: sum("indexCount"),
    normalMapCount: sum("normalMapCount"),
    ormTextureCount: sum("ormTextureCount"),
    emissiveTextureCount: sum("emissiveTextureCount"),
    extensionsUsed: [...new Set(pipelines.flatMap((item) => item.metadata.extensionsUsed))].sort(),
    materialFeatures: [...new Set(pipelines.flatMap((item) => item.metadata.materialFeatures))].sort(),
    materialExtensionCoverage: [...new Set(pipelines.flatMap((item) => item.metadata.materialExtensionCoverage))].sort(),
    hasPbr: pipelines.some((item) => item.metadata.hasPbr),
    hasSkinning: pipelines.some((item) => item.metadata.hasSkinning),
    hasMorphTargets: pipelines.some((item) => item.metadata.hasMorphTargets)
  };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}
