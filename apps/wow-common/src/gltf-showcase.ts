import {
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  createDracoDecoder,
  createGLTFSceneAnimationMixer,
  loadProductionGLTFRenderPipeline,
  type GLTFDracoDecodeDescriptor,
  type GLTFDracoDecoder,
  type GLTFDracoDecoderModule
} from "@aura3d/assets";
import {
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type Material,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { multiplyMat4, type Mat4 } from "@aura3d/scene";

type Pipeline = Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>;
type Mixer = ReturnType<typeof createGLTFSceneAnimationMixer>;
type DracoDecoderModuleFactory = (config?: {
  readonly locateFile?: (file: string, prefix: string) => string;
}) => Promise<GLTFDracoDecoderModule> | GLTFDracoDecoderModule;

export interface WowGltfShowcaseConfig {
  readonly appId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly assetUrl: string;
  readonly assetName: string;
  readonly attribution: string;
  readonly preferredClip?: RegExp;
  readonly clearColor?: readonly [number, number, number, number];
  readonly frame?: {
    readonly yawRadians?: number;
    readonly pitchRadians?: number;
    readonly paddingRatio?: number;
    readonly fovYRadians?: number;
  };
  readonly cameraOrbit?: {
    readonly yawAmplitudeRadians?: number;
    readonly speed?: number;
    readonly targetFps?: number;
  };
  readonly requiresDraco?: boolean;
  readonly modelMatrix?: Mat4;
  readonly animateCamera?: boolean;
  readonly materialOverride?: (entry: {
    readonly nodeName: string;
    readonly geometryName: string;
    readonly materialKey: string;
  }) => Material | undefined;
}

interface Runtime {
  readonly appId: string;
  readonly status: "loading" | "ready" | "running" | "error";
  readonly title: string;
  readonly asset: string;
  readonly attribution: string;
  readonly clip: string;
  readonly frames: number;
  readonly fps: number;
  readonly drawCalls: number;
  readonly meshes: number;
  readonly primitives: number;
  readonly materials: number;
  readonly textures: number;
  readonly animations: number;
  readonly renderSize: string;
  readonly loadMs: number;
  readonly timings?: Readonly<Record<string, number>>;
  readonly error?: string;
}

declare global {
  interface Window {
    __a3dWowGltfRuntime?: Runtime;
    __a3dWowGltfDiagnostics?: unknown;
  }
}

const MAX_DPR = 2;
const MAX_RENDER_EDGE = 3200;

export async function startWowGltfShowcase(config: WowGltfShowcaseConfig): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${config.appId} requires #app and canvas#viewport.`);
  }

  let size = syncCanvasSize(canvas);
  let runtime = createRuntime(config, "loading", size, performance.now(), 0, 0);
  publish(root, runtime, true);
  drawFallbackFrame(canvas, config.clearColor ?? [0.86, 0.86, 0.84, 1]);

  const started = performance.now();
  let pipeline: Pipeline | undefined;
  let mixer: Mixer | undefined;
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = performance.now();
  let lastUi = 0;
  let diagnosticsPublished = false;
  let staticRenderItems: readonly RenderItem[] | undefined;
  const timings: Record<string, number> = {};

  try {
    let phaseStarted = performance.now();
    const renderer = await A3DRenderer.create({
      canvas,
      width: size.width,
      height: size.height,
	      preserveDrawingBuffer: true,
	      antialias: true,
	      errorCheckMode: "frame",
	      clearColor: config.clearColor ?? [0.86, 0.86, 0.84, 1]
	    });
    timings.rendererCreateMs = Math.round(performance.now() - phaseStarted);
    phaseStarted = performance.now();
    const dracoDecoder = config.requiresDraco === true ? await createBrowserDracoDecoder() : undefined;
    timings.dracoDecoderMs = config.requiresDraco === true ? Math.round(performance.now() - phaseStarted) : 0;
    phaseStarted = performance.now();
    pipeline = await loadProductionGLTFRenderPipeline({
      url: config.assetUrl,
      assetId: config.appId,
      assetName: config.assetName,
      ...(dracoDecoder ? { dracoDecoder } : {}),
      width: size.width,
      height: size.height,
      rendererInput: {
        qualityPreset: "hdr-studio-preview",
        cameraPolicy: "require",
        frame: {
          yawRadians: config.frame?.yawRadians ?? -0.62,
          pitchRadians: config.frame?.pitchRadians ?? -0.16,
          paddingRatio: config.frame?.paddingRatio ?? 0.08,
          fovYRadians: config.frame?.fovYRadians ?? 0.58
        },
        postprocess: false
      }
    });
    timings.pipelineMs = Math.round(performance.now() - phaseStarted);
    phaseStarted = performance.now();
    mixer = createGLTFSceneAnimationMixer({
      scene: pipeline.resources.scene,
      clips: pipeline.asset.animations,
      asset: pipeline.asset,
      autoPlay: false
    });
	    const clip = selectClip(pipeline, config.preferredClip);
	    if (clip) {
	      mixer.playExclusive(clip.name, { weight: 1, timeScale: 1, loopMode: "repeat" });
	    }
	    canvas.classList.toggle("cinematic-drift", Boolean(!clip && config.animateCamera));
	    timings.mixerMs = Math.round(performance.now() - phaseStarted);

    const resizeObserver = new ResizeObserver(() => {
      size = syncCanvasSize(canvas);
      renderer.resize(size.width, size.height);
    });
    resizeObserver.observe(canvas);

    const render = (now: number): void => {
      try {
        const seconds = (now - started) / 1000;
        if (clip && mixer) {
          mixer.seek(clip.name, clip.duration > 0 ? seconds % clip.duration : 0);
          mixer.resume(clip.name);
          mixer.update(0);
        }
        const bounds = pipeline!.resources.bounds;
	        const shouldAnimateCamera = Boolean(clip || config.animateCamera);
	        const orbitYaw = (config.frame?.yawRadians ?? -0.62) + (shouldAnimateCamera
            ? Math.sin(seconds * (config.cameraOrbit?.speed ?? (clip ? 0.11 : 0.32))) * (config.cameraOrbit?.yawAmplitudeRadians ?? (clip ? 0.08 : 0.2))
            : 0);
        const frame = computePerspectiveCameraFrame(bounds, size, {
          yawRadians: orbitYaw,
          pitchRadians: config.frame?.pitchRadians ?? -0.16,
          paddingRatio: config.frame?.paddingRatio ?? 0.08,
          fovYRadians: config.frame?.fovYRadians ?? 0.58,
          nearPadding: 0.08,
          farPadding: 2.6
        });
	        const source: RenderSource = {
	          collectRenderItems: () => {
	            if (!clip) {
	              staticRenderItems ??= collectImportedItems(pipeline!, config);
	              return staticRenderItems;
	            }
	            return collectImportedItems(pipeline!, config);
	          },
          collectedLights: [],
          environmentLighting: DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
          cameraPolicy: "require",
          cameraPosition: frame.cameraPosition,
          cameraFrameBounds: bounds,
          frustumCulling: false,
          postprocess: false
        };
	        const renderStarted = performance.now();
	        const result = renderer.renderFrame({
          source,
          camera: {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix
          },
          metadata: {
            assetId: config.appId,
            assetName: config.assetName,
            assetUri: config.assetUrl,
            meshCount: pipeline!.metadata.meshCount,
            primitiveCount: pipeline!.metadata.primitiveCount,
            materialCount: pipeline!.metadata.materialCount,
            textureCount: pipeline!.metadata.textureCount,
            imageCount: pipeline!.metadata.imageCount,
            animationCount: pipeline!.metadata.animationCount,
            skinCount: pipeline!.metadata.skinCount,
            morphTargetCount: pipeline!.metadata.morphTargetCount,
            extensionsUsed: pipeline!.metadata.extensionsUsed,
            environmentId: "studio-preview",
            hdrEnvironmentUri: "default-gltf-studio-preview"
          }
	        });
	        if (frameCount === 0) {
	          timings.firstRenderFrameMs = Math.round(performance.now() - renderStarted);
	          timings.firstReadyMs = Math.round(performance.now() - started);
	        }
	        frameCount += 1;
        fpsFrames += 1;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
	        runtime = createRuntime(config, frameCount === 1 ? "ready" : "running", size, started, frameCount, fps, {
	          pipeline,
	          drawCalls: result.diagnostics.drawCalls,
		          clipName: clip?.name ?? (config.animateCamera ? "cinematic camera orbit" : "static scene"),
	          timings
	        });
	        window.__a3dWowGltfRuntime = runtime;
	        (window as unknown as Record<string, Runtime>)[`__a3d${config.appId.replaceAll("-", "")}`] = runtime;
	        if (!diagnosticsPublished) {
	          const diagnosticsStarted = performance.now();
	          window.__a3dWowGltfDiagnostics = createDiagnostics(pipeline!, config);
	          timings.diagnosticsMs = Math.round(performance.now() - diagnosticsStarted);
	          diagnosticsPublished = true;
	        }
        if (frameCount === 1 || now - lastUi > 250) {
          publish(root, runtime, frameCount === 1);
          lastUi = now;
        }
	        if (clip) {
	          requestAnimationFrame(render);
	        } else if (config.animateCamera) {
	          window.setTimeout(() => requestAnimationFrame(render), 1000 / (config.cameraOrbit?.targetFps ?? 18));
	        }
      } catch (error) {
	        runtime = createRuntime(config, "error", size, started, frameCount, fps, {
	          pipeline,
	          error: formatError(error),
	          timings
	        });
        publish(root, runtime, true);
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = createRuntime(config, "error", size, started, frameCount, fps, { pipeline, error: formatError(error), timings });
    publish(root, runtime, true);
  }
}

function createDiagnostics(pipeline: Pipeline, config: WowGltfShowcaseConfig): unknown {
  const renderables = pipeline.resources.scene.collectRenderables().map(({ node, renderable }) => {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = config.materialOverride?.({
      nodeName: node.name,
      geometryName: renderable.geometry,
      materialKey: renderable.material
    }) ?? pipeline.resources.materialLibrary.get(renderable.material);
    const textureBinding = material?.getParameter("u_baseColorTexture") ?? material?.getParameter("u_texture");
    const texture = textureBinding && typeof textureBinding === "object" && "texture" in textureBinding
      ? (textureBinding as { readonly texture?: { readonly label?: string; readonly width?: number; readonly height?: number; readonly source?: unknown; readonly data?: unknown; readonly mipLevels?: readonly unknown[]; readonly colorSpace?: string } }).texture
      : undefined;
    return {
      nodeName: node.name,
      geometryName: renderable.geometry,
      materialKey: renderable.material,
      materialName: material?.name,
      shaderKey: material?.shaderKey,
      baseTextureEnabled: material?.getParameter("u_baseColorTextureEnabled"),
      texture: texture ? {
        label: texture.label,
        width: texture.width,
        height: texture.height,
        colorSpace: texture.colorSpace,
        hasSource: Boolean(texture.source),
        hasData: Boolean(texture.data),
        mipLevels: texture.mipLevels?.length ?? 0
      } : null,
      hasSkinning: Boolean(renderable.skinning),
      vertexStride: geometry?.vertexBuffer.format.stride,
      attributes: geometry?.vertexBuffer.format.attributes.map((attribute) => ({
        semantic: attribute.semantic,
        shaderName: attribute.shaderName,
        shaderLocation: attribute.shaderLocation,
        components: attribute.components,
        offset: attribute.offset
      })) ?? []
    };
  });
  return {
    appId: config.appId,
    renderables,
    materials: [...pipeline.resources.materialLibrary.entries()].map(([key, material]) => ({
      key,
      name: material.name,
      shaderKey: material.shaderKey,
      baseTextureEnabled: material.getParameter("u_baseColorTextureEnabled"),
      hasTexture: Boolean(material.getParameter("u_baseColorTexture") ?? material.getParameter("u_texture"))
    }))
  };
}

function collectImportedItems(pipeline: Pipeline, config: WowGltfShowcaseConfig): readonly RenderItem[] {
  const items: RenderItem[] = [];
  pipeline.resources.scene.updateWorldTransforms();
  for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
    const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
    const material = config.materialOverride?.({
      nodeName: node.name,
      geometryName: renderable.geometry,
      materialKey: renderable.material
    }) ?? pipeline.resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: `wow-gltf:${node.name}`,
      geometry,
      material,
      modelMatrix: config.modelMatrix ? multiplyMat4(config.modelMatrix, node.transform.worldMatrix) : node.transform.worldMatrix,
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function selectClip(pipeline: Pipeline, preferred?: RegExp): Pipeline["asset"]["animations"][number] | undefined {
  if (pipeline.asset.animations.length === 0) return undefined;
  return (preferred ? pipeline.asset.animations.find((clip) => preferred.test(clip.name)) : undefined)
    ?? pipeline.asset.animations.find((clip) => /animation|Take|default|walk|run|dance/i.test(clip.name))
    ?? pipeline.asset.animations[0];
}

function syncCanvasSize(canvas: HTMLCanvasElement): { readonly width: number; readonly height: number } {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width || window.innerWidth || 1440);
  const cssHeight = Math.max(1, rect.height || window.innerHeight || 900);
  const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, MAX_RENDER_EDGE / Math.max(cssWidth * dpr, cssHeight * dpr));
  const width = Math.round(cssWidth * dpr * edgeScale);
  const height = Math.round(cssHeight * dpr * edgeScale);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function createRuntime(
  config: WowGltfShowcaseConfig,
  status: Runtime["status"],
  size: { readonly width: number; readonly height: number },
  started: number,
  frames: number,
  fps: number,
  options: {
    readonly pipeline?: Pipeline;
    readonly drawCalls?: number;
    readonly clipName?: string;
    readonly error?: string;
    readonly timings?: Readonly<Record<string, number>>;
  } = {}
): Runtime {
  const pipeline = options.pipeline;
  return {
    appId: config.appId,
    status,
    title: config.title,
    asset: config.assetName,
    attribution: config.attribution,
    clip: options.clipName ?? "loading",
    frames,
    fps,
    drawCalls: options.drawCalls ?? 0,
    meshes: pipeline?.metadata.meshCount ?? 0,
    primitives: pipeline?.metadata.primitiveCount ?? 0,
    materials: pipeline?.metadata.materialCount ?? 0,
    textures: pipeline?.metadata.textureCount ?? 0,
    animations: pipeline?.metadata.animationCount ?? 0,
    renderSize: `${size.width}x${size.height}`,
    loadMs: options.timings?.firstReadyMs ?? Math.round(performance.now() - started),
    ...(options.timings ? { timings: { ...options.timings } } : {}),
    ...(options.error ? { error: options.error } : {})
  };
}

function publish(root: HTMLElement, runtime: Runtime, force: boolean): void {
  if (!force && runtime.frames > 1) return;
  root.innerHTML = `
    <section class="hud ${runtime.status === "error" ? "is-error" : ""}">
      <span class="state ${runtime.status === "error" ? "is-error" : ""}">${escapeHtml(runtime.status)}</span>
      <h1>${escapeHtml(runtime.title)}</h1>
      <p>${escapeHtml(runtime.asset)}</p>
      <p class="credit">${escapeHtml(runtime.attribution)}</p>
      <dl>
        <div><dt>Frames</dt><dd>${runtime.frames}</dd></div>
        <div><dt>FPS</dt><dd>${runtime.fps.toFixed(1)}</dd></div>
        <div><dt>Draw calls</dt><dd>${runtime.drawCalls}</dd></div>
        <div><dt>Textures</dt><dd>${runtime.textures}</dd></div>
        <div><dt>Meshes</dt><dd>${runtime.meshes}</dd></div>
        <div><dt>Materials</dt><dd>${runtime.materials}</dd></div>
        <div><dt>Animations</dt><dd>${runtime.animations}</dd></div>
        <div><dt>Render size</dt><dd>${runtime.renderSize}</dd></div>
      </dl>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

function drawFallbackFrame(canvas: HTMLCanvasElement, clear: readonly [number, number, number, number]): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

let browserDracoDecoderPromise: Promise<GLTFDracoDecoder> | undefined;

export async function createBrowserDracoDecoder(): Promise<GLTFDracoDecoder> {
  browserDracoDecoderPromise ??= createBrowserDracoDecoderUncached();
  return browserDracoDecoderPromise;
}

async function createBrowserDracoDecoderUncached(): Promise<GLTFDracoDecoder> {
  const decoderScriptUrl = new URL("/node_modules/draco3d/draco_decoder_nodejs.js", window.location.origin).href;
  const decoderWasmUrl = new URL("/node_modules/draco3d/draco_decoder.wasm", window.location.origin).href;
  const response = await fetch(decoderScriptUrl);
  if (!response.ok) {
    throw new Error(`Failed to load Draco decoder: HTTP ${response.status}`);
  }
  const source = await response.text();
  const sourceMapIndex = source.indexOf("//# sourceMappingURL=");
  const moduleSource = sourceMapIndex >= 0 ? source.slice(0, sourceMapIndex) : source;
  const factory = new Function(`${moduleSource}\nreturn typeof DracoDecoderModule === "function" ? DracoDecoderModule : undefined;`)() as unknown;
  if (typeof factory !== "function") {
    throw new Error("Draco decoder script did not expose DracoDecoderModule.");
  }
  const module = await (factory as DracoDecoderModuleFactory)({
    locateFile: (file) => file === "draco_decoder.wasm" ? decoderWasmUrl : new URL(file, decoderScriptUrl).href
  });
  const base = createDracoDecoder(module);
  return (source: Uint8Array, descriptor: GLTFDracoDecodeDescriptor) => base(source, descriptor);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
