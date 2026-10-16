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
  Renderer,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type CollectedLight,
  type Material,
  type RenderItem,
  type RenderSource,
  type RendererPostProcessOptions
} from "@aura3d/rendering";
import { DirectionalLight, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { applyRouteChromeMode, routeRenderQuality } from "./route-quality";

type Pipeline = Awaited<ReturnType<typeof loadProductionGLTFRenderPipeline>>;
type Mixer = ReturnType<typeof createGLTFSceneAnimationMixer>;
type DracoDecoderModuleFactory = (config?: {
  readonly locateFile?: (file: string, prefix: string) => string;
}) => Promise<GLTFDracoDecoderModule> | GLTFDracoDecoderModule;

export interface WowPostProcessConfig {
  readonly tonemapping?: {
    readonly enabled: boolean;
    readonly mode: "aces" | "filmic" | "reinhard";
    readonly exposure: number;
  };
  readonly bloom?: {
    readonly enabled: boolean;
    readonly intensity: number;
    readonly threshold: number;
    readonly radius?: number;
  };
  readonly ssao?: {
    readonly enabled: boolean;
    readonly radius: number;
    readonly intensity: number;
    readonly bias?: number;
  };
  readonly fxaa?: {
    readonly enabled: boolean;
    readonly edgeThreshold?: number;
    readonly subpixelBlend?: number;
  };
  readonly vignette?: {
    readonly enabled: boolean;
    readonly intensity: number;
  };
}

export interface WowStudioLightingConfig {
  readonly keyIntensity?: number;
  readonly fillIntensity?: number;
  readonly rimIntensity?: number;
  readonly keyColor?: readonly [number, number, number];
  readonly fillColor?: readonly [number, number, number];
  readonly rimColor?: readonly [number, number, number];
}

export const DEFAULT_WOW_POST_PROCESS: Required<WowPostProcessConfig> = {
  tonemapping: { enabled: true, mode: "aces", exposure: 1.15 },
  bloom: { enabled: true, intensity: 0.22, threshold: 0.8, radius: 3 },
  ssao: { enabled: true, radius: 2, intensity: 0.32, bias: 0.025 },
  fxaa: { enabled: true, edgeThreshold: 0.08, subpixelBlend: 0.5 },
  vignette: { enabled: true, intensity: 0.22 }
};

export const DEFAULT_WOW_STUDIO_LIGHTING: Required<WowStudioLightingConfig> = {
  keyIntensity: 2.25,
  fillIntensity: 1.0,
  rimIntensity: 1.2,
  keyColor: [1.0, 0.95, 0.88],
  fillColor: [0.62, 0.76, 0.98],
  rimColor: [0.84, 0.91, 1.0]
};

export function createWowStudioLightingRig(
  config: WowStudioLightingConfig = {}
): readonly CollectedLight[] {
  const key = new DirectionalLight("wow-studio-key");
  key.color = [...(config.keyColor ?? DEFAULT_WOW_STUDIO_LIGHTING.keyColor)];
  key.intensity = config.keyIntensity ?? DEFAULT_WOW_STUDIO_LIGHTING.keyIntensity;

  const fill = new DirectionalLight("wow-studio-fill");
  fill.color = [...(config.fillColor ?? DEFAULT_WOW_STUDIO_LIGHTING.fillColor)];
  fill.intensity = config.fillIntensity ?? DEFAULT_WOW_STUDIO_LIGHTING.fillIntensity;

  const rim = new DirectionalLight("wow-studio-rim");
  rim.color = [...(config.rimColor ?? DEFAULT_WOW_STUDIO_LIGHTING.rimColor)];
  rim.intensity = config.rimIntensity ?? DEFAULT_WOW_STUDIO_LIGHTING.rimIntensity;

  return [
    {
      kind: "directional",
      color: key.color,
      intensity: key.intensity,
      position: [4.8, 6.2, 4.6],
      direction: [-0.48, -0.68, -0.55],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: key
    },
    {
      kind: "directional",
      color: fill.color,
      intensity: fill.intensity,
      position: [-5.2, 3.6, 2.8],
      direction: [0.58, -0.38, -0.72],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: fill
    },
    {
      kind: "directional",
      color: rim.color,
      intensity: rim.intensity,
      position: [-2.4, 5.0, -5.4],
      direction: [0.32, -0.52, 0.79],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: rim
    }
  ];
}

export function resolveWowPostProcessOptions(
  preset: WowPostProcessConfig = DEFAULT_WOW_POST_PROCESS
): RendererPostProcessOptions {
  const tonemapping = {
    ...DEFAULT_WOW_POST_PROCESS.tonemapping,
    ...(preset.tonemapping ?? {})
  };
  const bloom = {
    ...DEFAULT_WOW_POST_PROCESS.bloom,
    ...(preset.bloom ?? {})
  };
  const ssao = {
    ...DEFAULT_WOW_POST_PROCESS.ssao,
    ...(preset.ssao ?? {})
  };
  const fxaa = {
    ...DEFAULT_WOW_POST_PROCESS.fxaa,
    ...(preset.fxaa ?? {})
  };
  const vignette = {
    ...DEFAULT_WOW_POST_PROCESS.vignette,
    ...(preset.vignette ?? {})
  };

  return {
    toneMapping: tonemapping.enabled
      ? {
          exposure: tonemapping.exposure,
          whitePoint: 1.35,
          gamma: 2.2,
          operator: tonemapping.mode === "reinhard" ? "reinhard" : "filmic"
        }
      : false,
    tonemapping,
    bloom: bloom.enabled
      ? {
          enabled: true,
          threshold: bloom.threshold,
          intensity: bloom.intensity,
          radius: bloom.radius ?? 3
        }
      : false,
    ssao: ssao.enabled
      ? {
          enabled: true,
          radius: Math.max(1, Math.min(8, Math.round(ssao.radius < 1 ? ssao.radius * 8 : ssao.radius))),
          intensity: ssao.intensity,
          bias: ssao.bias ?? 0.025
        }
      : false,
    colorGrade: {
      contrast: 1.08,
      saturation: 1.06,
      vignette: vignette.enabled ? vignette.intensity : 0,
      sharpening: 0.04
    },
    vignette,
    fxaa: fxaa.enabled
      ? {
          enabled: true,
          edgeThreshold: fxaa.edgeThreshold ?? 0.08,
          subpixelBlend: fxaa.subpixelBlend ?? 0.5
        }
      : false
  } as unknown as RendererPostProcessOptions;
}

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
  readonly lightingRig?: WowStudioLightingConfig;
  readonly postProcess?: WowPostProcessConfig;
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

function ensureCompactWowHudStyles(): void {
  if (typeof document === "undefined" || document.getElementById("a3d-wow-compact-hud")) return;
  const style = document.createElement("style");
  style.id = "a3d-wow-compact-hud";
  style.textContent = `
    #app {
      top: 16px !important;
      left: 16px !important;
      width: min(280px, calc(100vw - 32px)) !important;
      max-width: 280px !important;
    }
    .hud {
      max-width: 280px !important;
      padding: 13px 14px !important;
      background: rgba(8, 13, 23, 0.78) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border-color: rgba(164, 214, 255, 0.2) !important;
    }
    .hud h1 {
      margin: 8px 0 4px !important;
      font-size: clamp(16px, 1.5vw, 19px) !important;
      line-height: 1.15 !important;
    }
    .hud p {
      font-size: 11.5px !important;
      line-height: 1.35 !important;
    }
    .hud .actions {
      margin-top: 8px !important;
      gap: 6px !important;
    }
    .hud button {
      min-height: 28px !important;
      padding: 0 9px !important;
      font-size: 11px !important;
    }
    .hud dl {
      margin-top: 9px !important;
      gap: 5px !important;
    }
    .hud dl div {
      padding: 6px 8px !important;
    }
    .hud dt {
      font-size: 9.5px !important;
    }
    .hud dd {
      margin-top: 2px !important;
      font-size: 11.5px !important;
    }
  `;
  document.head.appendChild(style);
}

ensureCompactWowHudStyles();

export async function startWowGltfShowcase(config: WowGltfShowcaseConfig): Promise<void> {
  ensureCompactWowHudStyles();
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${config.appId} requires #app and canvas#viewport.`);
  }
  const chromeHidden = applyRouteChromeMode();

  let rotateActive = config.animateCamera ?? true;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let orbitYawOffset = 0;
  let orbitPitchOffset = 0;

  let size = syncCanvasSize(canvas);
  let runtime = createRuntime(config, "loading", size, performance.now(), 0, 0);
  if (!chromeHidden) publish(root, runtime, true, rotateActive);
  drawFallbackFrame(canvas, config.clearColor ?? [0.86, 0.86, 0.84, 1]);

  const started = performance.now();
  const studioLights = createWowStudioLightingRig(config.lightingRig);
  const postProcessOptions = resolveWowPostProcessOptions(config.postProcess);
  let pipeline: Pipeline | undefined;
  let mixer: Mixer | undefined;
  let frameCount = 0;
  let fps = 60;
  let fpsFrames = 0;
  let fpsFrom = performance.now();
  let lastFrameAt = started;
  let lastUi = 0;
  let diagnosticsPublished = false;
  let staticRenderItems: readonly RenderItem[] | undefined;
  const timings: Record<string, number> = {};

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "rotate") {
      rotateActive = !rotateActive;
      publish(root, runtime, true, rotateActive);
    } else if (button.dataset.action === "reset") {
      rotateActive = true;
      orbitYawOffset = 0;
      orbitPitchOffset = 0;
      publish(root, runtime, true, rotateActive);
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    orbitYawOffset -= dx * 0.0065;
    orbitPitchOffset = Math.max(-0.55, Math.min(0.45, orbitPitchOffset - dy * 0.0045));
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  try {
    let phaseStarted = performance.now();
    const renderer = await Renderer.create({
      canvas,
      width: size.width,
      height: size.height,
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
        postprocess: postProcessOptions
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
    canvas.classList.toggle("cinematic-drift", Boolean(!clip && rotateActive));
    timings.mixerMs = Math.round(performance.now() - phaseStarted);

    const resizeObserver = new ResizeObserver(() => {
      size = syncCanvasSize(canvas);
      renderer.resize(size.width, size.height);
    });
    resizeObserver.observe(canvas);

    lastFrameAt = performance.now();
    fpsFrom = lastFrameAt;

    const render = (now: number): void => {
      try {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000));
        lastFrameAt = now;
        const seconds = (now - started) / 1000;
        if (clip && mixer) {
          mixer.seek(clip.name, clip.duration > 0 ? seconds % clip.duration : 0);
          mixer.resume(clip.name);
          mixer.update(0);
        }
        if (rotateActive && !dragging) {
          orbitYawOffset += dt * (clip ? 0.14 : 0.18);
        }
        const bounds: CameraFrameBounds = pipeline!.resources.bounds;
        const baseYaw = config.frame?.yawRadians ?? -0.62;
        const basePitch = config.frame?.pitchRadians ?? -0.16;
        const gentleBob = rotateActive
          ? Math.sin(seconds * (config.cameraOrbit?.speed ?? (clip ? 0.22 : 0.35))) * 0.025
          : 0;
        const orbitYaw = baseYaw + orbitYawOffset;
        const orbitPitch = Math.max(-1.1, Math.min(0.85, basePitch + orbitPitchOffset + gentleBob));
        const frame = computePerspectiveCameraFrame(bounds, size, {
          yawRadians: orbitYaw,
          pitchRadians: orbitPitch,
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
          collectedLights: studioLights,
          environmentLighting: DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
          cameraPolicy: "require",
          cameraPosition: frame.cameraPosition,
          cameraFrameBounds: bounds,
          frustumCulling: false,
          postprocess: postProcessOptions
        };
        const renderStarted = performance.now();
        const diagnostics = renderer.render({
          source,
          camera: {
            viewProjectionMatrix: frame.viewProjectionMatrix,
            viewMatrix: frame.viewMatrix,
            projectionMatrix: frame.projectionMatrix
          }
        });
        if (frameCount === 0) {
          timings.firstRenderFrameMs = Math.round(performance.now() - renderStarted);
          timings.firstReadyMs = Math.round(performance.now() - started);
        }
        frameCount += 1;
        fpsFrames += 1;
        const elapsedFpsWindow = now - fpsFrom;
        if (elapsedFpsWindow >= 400) {
          fps = (fpsFrames * 1000) / elapsedFpsWindow;
          fpsFrames = 0;
          fpsFrom = now;
        } else if (frameCount <= 30 && dt > 0) {
          fps = Math.min(60, 1 / dt);
        }
        runtime = createRuntime(config, frameCount === 1 ? "ready" : "running", size, started, frameCount, fps, {
          pipeline,
          drawCalls: diagnostics.drawCalls,
          clipName: clip?.name ?? (rotateActive ? "cinematic camera orbit" : "interactive orbit"),
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
        if (!chromeHidden && (frameCount <= 3 || now - lastUi > 180)) {
          publish(root, runtime, frameCount === 1, rotateActive);
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = createRuntime(config, "error", size, started, frameCount, fps, {
          pipeline,
          error: formatError(error),
          timings
        });
        if (!chromeHidden) publish(root, runtime, true, rotateActive);
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = createRuntime(config, "error", size, started, frameCount, fps, { pipeline, error: formatError(error), timings });
    if (!chromeHidden) publish(root, runtime, true, rotateActive);
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
  const quality = routeRenderQuality({ maxPixelRatio: MAX_DPR, maxRenderEdge: MAX_RENDER_EDGE });
  const dpr = Math.min(quality.maxPixelRatio, Math.max(1, window.devicePixelRatio || 1));
  const edgeScale = Math.min(1, quality.maxRenderEdge / Math.max(cssWidth * dpr, cssHeight * dpr));
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

function publish(root: HTMLElement, runtime: Runtime, _force: boolean, rotateActive = true): void {
  root.innerHTML = `
    <section class="hud ${runtime.status === "error" ? "is-error" : ""}">
      <span class="state ${runtime.status === "error" ? "is-error" : ""}">${escapeHtml(runtime.status)}</span>
      <h1>${escapeHtml(runtime.title)}</h1>
      <p>${escapeHtml(runtime.asset)}</p>
      <p class="credit">${escapeHtml(runtime.attribution)}</p>
      <div class="actions">
        <button class="${rotateActive ? "is-active" : ""}" data-action="rotate" type="button">Rotate</button>
        <button data-action="reset" type="button">Reset</button>
      </div>
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
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, });
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

const DRACO_DECODER_CANDIDATES = [
  "/assets/draco/draco_decoder_nodejs.js",
  "/node_modules/draco3d/draco_decoder_nodejs.js"
] as const;

async function resolveDracoDecoderUrls(): Promise<{ readonly scriptUrl: string; readonly wasmUrl: string }> {
  for (const scriptPath of DRACO_DECODER_CANDIDATES) {
    const scriptUrl = new URL(scriptPath, window.location.origin).href;
    const wasmUrl = new URL(scriptPath.replace(/draco_decoder_nodejs\.js$/, "draco_decoder.wasm"), window.location.origin).href;
    const response = await fetch(scriptUrl);
    if (response.ok) return { scriptUrl, wasmUrl };
  }
  throw new Error(`Failed to load Draco decoder from ${DRACO_DECODER_CANDIDATES.join(", ")}`);
}

async function createBrowserDracoDecoderUncached(): Promise<GLTFDracoDecoder> {
  const { scriptUrl: decoderScriptUrl, wasmUrl: decoderWasmUrl } = await resolveDracoDecoderUrls();
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
