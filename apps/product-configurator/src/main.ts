import {
  createProductViewer,
  loadGltfScene,
  loadHdrEnvironment,
  type A3DGltfScene,
  type A3DHdrEnvironment,
  type A3DProductViewer,
  type A3DProductViewerSettings,
  type A3DRenderResult
} from "@aura3d/engine/production-runtime";
import { scene } from "./scene";
import { ui } from "./ui";

const environmentOptions = [
  { id: scene.environment.id, label: scene.environment.label, file: scene.environment.file, url: scene.environment.url, exposure: scene.environment.exposure, intensity: scene.environment.intensity, rotation: scene.environment.rotation },
  { id: "autumn-field", label: "Autumn Field", file: "autumn_field_puresky_1k.hdr", exposure: 1.1, intensity: 1.25, rotation: -0.18 },
  { id: "kloppenheim-sky", label: "Kloppenheim Sky", file: "kloppenheim_06_puresky_1k.hdr", exposure: 1.0, intensity: 1.32, rotation: 0.34 }
] as const;

const FLAGSHIP_RENDER_LONG_EDGE = 5120;
const FLAGSHIP_RENDER_SHORT_EDGE = 2880;

let loadedEnvironments = new Map<string, A3DHdrEnvironment>();

interface A3DProductionRuntimeMetrics {
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
  readonly renderResolution: {
    readonly width: number;
    readonly height: number;
    readonly cssWidth: number;
    readonly cssHeight: number;
    readonly pixelRatio: number;
  };
  readonly animationState: {
    readonly importedAnimation: boolean;
    readonly skinningReady: boolean;
    readonly morphTargetsReady: boolean;
  };
  readonly frameTimeMs: number;
  readonly warnings: readonly string[];
  readonly screenshotPath: string;
}

interface A3DProductionRuntime {
  readonly status: "loading" | "ready" | "error";
  readonly error?: string;
  readonly appId: string;
  readonly sceneId: string;
  readonly selectedAssetId?: string;
  readonly rendererBackend?: "webgl2";
  readonly runtime?: A3DProductionRuntimeMetrics;
  readonly metadata?: A3DGltfScene["metadata"];
  readonly secondaryMetadata?: readonly A3DGltfScene["metadata"][];
  readonly proof?: A3DRenderResult["proof"];
  readonly proofSummary?: A3DRenderResult["summary"];
  readonly interactionCount: number;
  readonly lastInteraction?: string;
  readonly sdkSurface?: string;
  readonly viewerDiagnostics?: ReturnType<A3DProductViewer["diagnostics"]>;
  readonly screenshotDataUrl?: string;
}

declare global {
  interface Window {
    __a3dProductionRuntime?: A3DProductionRuntime;
  }
}

void runProductConfigurator();

async function runProductConfigurator(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${scene.appId} requires #app and canvas#viewport.`);
  }
  const renderResolution = configureFlagshipCanvas(canvas);

  const loading: A3DProductionRuntime = {
    status: "loading",
    appId: scene.appId,
    sceneId: scene.sceneId,
    interactionCount: 0,
    sdkSurface: "@aura3d/engine/production-runtime"
  };
  publishRuntime(root, loading);

  try {
    const primary = scene.assets.find((asset) => asset.role === "primary") ?? scene.assets[0];
    const selectedAsset = selectedAssetFromLocation() ?? primary;
    if (!selectedAsset) throw new Error(`${scene.appId} has no configured product asset.`);

    const viewport = { width: renderResolution.width, height: renderResolution.height };
    const [asset, environments] = await Promise.all([
      loadGltfScene({
        url: assetUrl(selectedAsset),
        assetId: selectedAsset.id,
        assetName: selectedAsset.label,
        viewport,
        rendererInput: {
          qualityPreset: "hdr-studio-preview",
          cameraPolicy: "require",
          ...(scene.postprocess ? {} : { postprocess: false })
        }
      }),
      Promise.all(environmentOptions.map((environment) => loadHdrEnvironment({
        url: environment.url ?? `/fixtures/environment-corpus/hdri/${environment.file}`,
        id: environment.id,
        label: environment.label,
        intensity: environment.intensity,
        backgroundIntensity: 1,
        rotation: environment.rotation,
        toneMapping: { operator: "filmic", exposure: environment.exposure, whitePoint: 11.2 }
      })))
    ]);
    loadedEnvironments = new Map(environments.map((environment) => [environment.id, environment]));
    const environment = loadedEnvironments.get(scene.environment.id) ?? environments[0];
    if (!environment) throw new Error(`${scene.appId} did not load an HDR environment.`);

    const viewer = await createProductViewer({
      backend: "webgl2",
      canvas,
      asset,
      environment,
      width: viewport.width,
      height: viewport.height,
      camera: { preset: "product-hero", orbit: true },
      lighting: { ibl: true, shadows: true },
      postprocess: { toneMapping: "aces", exposure: scene.environment.exposure, bloom: scene.postprocess, ssao: scene.postprocess, fxaa: scene.postprocess, colorGrade: scene.postprocess }
    });

    const frameStart = performance.now();
    const result = viewer.render();
    const runtime = createReadyRuntime(asset, environment, viewer, result, Number((performance.now() - frameStart).toFixed(3)), renderResolution, selectedAsset.id);
    publishRuntime(root, runtime, viewer);
  } catch (error) {
    publishRuntime(root, {
      status: "error",
      appId: scene.appId,
      sceneId: scene.sceneId,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      interactionCount: window.__a3dProductionRuntime?.interactionCount ?? 0,
      sdkSurface: "@aura3d/engine/production-runtime"
    });
  }
}

function createReadyRuntime(
  asset: A3DGltfScene,
  environment: A3DHdrEnvironment,
  viewer: A3DProductViewer,
  result: A3DRenderResult,
  frameTimeMs: number,
  renderResolution: A3DProductionRuntimeMetrics["renderResolution"],
  selectedAssetId: string
): A3DProductionRuntime {
  const metadata = asset.metadata;
  return {
    status: "ready",
    appId: scene.appId,
    sceneId: scene.sceneId,
    selectedAssetId,
    rendererBackend: "webgl2",
    runtime: {
      appId: scene.appId,
      sceneId: scene.sceneId,
      workflow: scene.workflow,
      rendererBackend: "webgl2",
      assetIds: scene.assets.map((assetDefinition) => assetDefinition.id),
      primaryAssetId: metadata.assetId,
      hdrEnvironmentId: environment.id,
      drawCalls: result.proof.diagnostics.drawCalls,
      triangleCount: Math.max(0, Math.floor(metadata.indexCount / 3)),
      materialCount: metadata.materialCount,
      textureCount: metadata.textureCount,
      textureMemoryEstimate: result.proof.diagnostics.textureBytes ?? 0,
      lightCount: environment.environmentLighting.environmentMapTexture ? 1 : 0,
      shadowMapCount: (result.proof.diagnostics.nativeShadowMapBindings ?? 0) > 0 ? 1 : 0,
      postprocessChain: scene.expectedPostprocessChain,
      renderResolution,
      animationState: {
        importedAnimation: metadata.hasAnimation,
        skinningReady: metadata.hasSkinning,
        morphTargetsReady: metadata.hasMorphTargets
      },
      frameTimeMs,
      warnings: [],
      screenshotPath: `tests/reports/production-runtime-app-suite/${scene.appId}.png`
    },
    metadata,
    secondaryMetadata: [],
    proof: result.proof,
    proofSummary: result.summary,
    interactionCount: 0,
    sdkSurface: "@aura3d/engine/production-runtime",
    viewerDiagnostics: viewer.diagnostics()
  };
}

function publishRuntime(root: HTMLElement, runtime: A3DProductionRuntime, viewer?: A3DProductViewer): void {
  window.__a3dProductionRuntime = runtime;
  mountProductConfigurator(root, runtime, viewer);
}

function mountProductConfigurator(root: HTMLElement, runtime: A3DProductionRuntime, viewer?: A3DProductViewer): void {
  const metrics = runtime.runtime;
  const settings = viewer?.getSettings() ?? runtime.viewerDiagnostics?.settings;
  const material = runtime.metadata;
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
      <span>${metrics ? `${metrics.drawCalls} draw calls` : "loading A3D renderer"}</span>
      <span>${metrics ? `${metrics.triangleCount} triangles` : scene.environment.label}</span>
      <span>${metrics ? `${metrics.textureCount} textures` : scene.assets.map((asset) => asset.id).join(", ")}</span>
      <span>${metrics ? `${metrics.renderResolution.width}x${metrics.renderResolution.height} render` : "flagship render target"}</span>
      <span>${runtime.sdkSurface ?? "@aura3d/engine/production-runtime"}</span>
    </section>
    <section class="controls">
      <label>
        Asset
        <select id="asset-picker">
          ${scene.assets.map((asset) => `<option value="${asset.id}" ${runtime.selectedAssetId === asset.id ? "selected" : ""}>${asset.label}</option>`).join("")}
        </select>
      </label>
      <label>
        Environment
        <select id="environment-picker">
          ${environmentOptions.map((environment) => `<option value="${environment.id}" ${runtime.viewerDiagnostics?.environment.id === environment.id ? "selected" : ""}>${environment.label}</option>`).join("")}
        </select>
      </label>
      <label>
        Exposure
        <input id="exposure-control" type="range" min="0" max="3" step="0.05" value="${settings?.exposure ?? 1.08}">
      </label>
      <label>
        IBL
        <input id="ibl-control" type="range" min="0" max="3" step="0.05" value="${settings?.iblIntensity ?? 1.2}">
      </label>
      <label>
        Specular
        <input id="specular-control" type="range" min="0" max="3" step="0.05" value="${settings?.specularIntensity ?? 1}">
      </label>
      <label>
        Env Rotation
        <input id="environment-rotation-control" type="range" min="-1" max="1" step="0.01" value="${settings?.environmentRotation ?? 0}">
      </label>
      <label>
        Background Blur
        <input id="background-blur-control" type="range" min="0" max="1" step="0.01" value="${settings?.backgroundBlur ?? 0.025}">
      </label>
      <label>
        Background
        <input id="background-control" type="checkbox" ${settings?.backgroundVisible === false ? "" : "checked"}>
      </label>
      <label>
        Bloom
        <input id="bloom-control" type="checkbox" ${settings?.bloom === false ? "" : "checked"}>
      </label>
      <label>
        SSAO
        <input id="ssao-control" type="checkbox" ${settings?.ssao === false ? "" : "checked"}>
      </label>
      <label>
        FXAA
        <input id="fxaa-control" type="checkbox" ${settings?.fxaa === false ? "" : "checked"}>
      </label>
      <label>
        Grounding
        <input id="shadows-control" type="checkbox" ${settings?.shadows === false ? "" : "checked"}>
      </label>
    </section>
    <section class="button-row">
      <button id="orbit-left" type="button">Orbit Left</button>
      <button id="orbit-right" type="button">Orbit Right</button>
      <button id="pan-left" type="button">Pan Left</button>
      <button id="pan-right" type="button">Pan Right</button>
      <button id="zoom-in" type="button">Zoom In</button>
      <button id="zoom-out" type="button">Zoom Out</button>
      <button id="reset-camera" type="button">Reset Camera</button>
      <button id="capture-screenshot" type="button">Capture PNG</button>
    </section>
    <section class="diagnostics">
      <h2>Material Diagnostics</h2>
      <span>${material ? `${material.materialCount} materials` : "loading materials"}</span>
      <span>${material ? `${material.normalMapCount} normal maps` : "normal maps pending"}</span>
      <span>${material ? `${material.ormTextureCount} ORM textures` : "ORM pending"}</span>
      <span>${material ? `${material.emissiveTextureCount} emissive textures` : "emissive pending"}</span>
      <span>${material ? `${material.unsupportedExtensions.length} unsupported extensions` : "extension scan pending"}</span>
      <span>${material ? `${material.warnings.length} warnings` : "warnings pending"}</span>
      <span>${material ? material.materialFeatures.join(", ") || "base PBR" : "feature scan pending"}</span>
      <span>${runtime.screenshotDataUrl ? "screenshot captured" : "screenshot ready"}</span>
      <a href="/tests/reports/runtime-parity/product-viewer/product-viewer-report.json">Three.js comparison report</a>
    </section>
  `;
  root.querySelector("#primary-action")?.addEventListener("click", () => {
    viewer?.controls.rotate(0.18, 0.04);
    rerenderViewer(root, viewer, ui.primaryActionLabel);
  });
  bindRange(root, "#exposure-control", viewer, (value) => ({ exposure: value }), "Adjust Exposure");
  bindRange(root, "#ibl-control", viewer, (value) => ({ iblIntensity: value }), "Adjust IBL");
  bindRange(root, "#specular-control", viewer, (value) => ({ specularIntensity: value }), "Adjust Specular");
  bindRange(root, "#environment-rotation-control", viewer, (value) => ({ environmentRotation: value }), "Rotate Environment");
  bindRange(root, "#background-blur-control", viewer, (value) => ({ backgroundBlur: value }), "Adjust Background Blur");
  bindCheckbox(root, "#background-control", viewer, (checked) => ({ backgroundVisible: checked }), "Toggle Background");
  bindCheckbox(root, "#bloom-control", viewer, (checked) => ({ bloom: checked }), "Toggle Bloom");
  bindCheckbox(root, "#ssao-control", viewer, (checked) => ({ ssao: checked }), "Toggle SSAO");
  bindCheckbox(root, "#fxaa-control", viewer, (checked) => ({ fxaa: checked }), "Toggle FXAA");
  bindCheckbox(root, "#shadows-control", viewer, (checked) => ({ shadows: checked }), "Toggle Grounding");
  const environmentPicker = root.querySelector("#environment-picker");
  if (environmentPicker instanceof HTMLSelectElement) {
    environmentPicker.addEventListener("change", () => {
      const environment = loadedEnvironments.get(environmentPicker.value);
      if (!environment) return;
      viewer?.setEnvironment(environment);
      rerenderViewer(root, viewer, `Environment ${environment.label}`);
    });
  }
  const assetPicker = root.querySelector("#asset-picker");
  if (assetPicker instanceof HTMLSelectElement) {
    assetPicker.addEventListener("change", () => {
      const params = new URLSearchParams(window.location.search);
      params.set("asset", assetPicker.value);
      window.location.search = params.toString();
    });
  }
  root.querySelector("#orbit-left")?.addEventListener("click", () => {
    viewer?.controls.rotate(-0.24, 0);
    rerenderViewer(root, viewer, "Orbit Left");
  });
  root.querySelector("#orbit-right")?.addEventListener("click", () => {
    viewer?.controls.rotate(0.24, 0);
    rerenderViewer(root, viewer, "Orbit Right");
  });
  root.querySelector("#pan-left")?.addEventListener("click", () => {
    viewer?.controls.pan(-0.5, 0);
    rerenderViewer(root, viewer, "Pan Left");
  });
  root.querySelector("#pan-right")?.addEventListener("click", () => {
    viewer?.controls.pan(0.5, 0);
    rerenderViewer(root, viewer, "Pan Right");
  });
  root.querySelector("#zoom-in")?.addEventListener("click", () => {
    viewer?.controls.dolly(0.86);
    rerenderViewer(root, viewer, "Zoom In");
  });
  root.querySelector("#zoom-out")?.addEventListener("click", () => {
    viewer?.controls.dolly(1.16);
    rerenderViewer(root, viewer, "Zoom Out");
  });
  root.querySelector("#reset-camera")?.addEventListener("click", () => {
    viewer?.controls.reset();
    rerenderViewer(root, viewer, "Reset Camera");
  });
  root.querySelector("#capture-screenshot")?.addEventListener("click", () => {
    const current = window.__a3dProductionRuntime;
    if (!current || !viewer) return;
    window.__a3dProductionRuntime = {
      ...current,
      interactionCount: current.interactionCount + 1,
      lastInteraction: "Capture Screenshot",
      screenshotDataUrl: viewer.captureScreenshot(),
      viewerDiagnostics: viewer.diagnostics()
    };
    mountProductConfigurator(root, window.__a3dProductionRuntime, viewer);
  });
}

function configureFlagshipCanvas(canvas: HTMLCanvasElement): A3DProductionRuntimeMetrics["renderResolution"] {
  const cssWidth = Math.max(1, Math.round(canvas.getBoundingClientRect().width || canvas.clientWidth || 1024));
  const cssHeight = Math.max(1, Math.round(canvas.getBoundingClientRect().height || canvas.clientHeight || cssWidth));
  const deviceScale = Math.min(3.25, globalThis.devicePixelRatio || 1);
  const cssLongEdge = Math.max(cssWidth, cssHeight);
  const cssShortEdge = Math.min(cssWidth, cssHeight);
  const longEdgeScale = Math.max(FLAGSHIP_RENDER_LONG_EDGE, Math.ceil(cssLongEdge * deviceScale)) / cssLongEdge;
  const shortEdgeScale = FLAGSHIP_RENDER_SHORT_EDGE / cssShortEdge;
  const scale = Math.max(longEdgeScale, shortEdgeScale);
  const targetWidth = Math.ceil(cssWidth * scale);
  const targetHeight = Math.ceil(cssHeight * scale);
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  canvas.dataset.renderResolution = `${targetWidth}x${targetHeight}`;
  canvas.dataset.flagshipRenderTarget = "true";
  return {
    width: targetWidth,
    height: targetHeight,
    cssWidth,
    cssHeight,
    pixelRatio: Number((targetWidth / Math.max(1, cssWidth)).toFixed(3))
  };
}

function assetUrl(asset: { readonly file: string; readonly url?: string }): string {
  return asset.url ?? `/fixtures/asset-corpus/${asset.file}`;
}

function selectedAssetFromLocation() {
  const requested = new URLSearchParams(window.location.search).get("asset");
  if (!requested) return undefined;
  return scene.assets.find((asset) => asset.id === requested);
}

function bindRange(
  root: HTMLElement,
  selector: string,
  viewer: A3DProductViewer | undefined,
  update: (value: number) => Partial<A3DProductViewerSettings>,
  label: string
): void {
  const input = root.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("input", () => {
    viewer?.setSettings(update(Number(input.value)));
    rerenderViewer(root, viewer, label);
  });
}

function bindCheckbox(
  root: HTMLElement,
  selector: string,
  viewer: A3DProductViewer | undefined,
  update: (checked: boolean) => Partial<A3DProductViewerSettings>,
  label: string
): void {
  const input = root.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("change", () => {
    viewer?.setSettings(update(input.checked));
    rerenderViewer(root, viewer, label);
  });
}

function rerenderViewer(root: HTMLElement, viewer: A3DProductViewer | undefined, interaction: string): void {
  const current = window.__a3dProductionRuntime;
  if (!current || !viewer) return;
  const frameStart = performance.now();
  const result = viewer.render();
  const diagnostics = viewer.diagnostics();
  window.__a3dProductionRuntime = {
    ...current,
    runtime: current.runtime ? {
      ...current.runtime,
      hdrEnvironmentId: diagnostics.environment.id,
      shadowMapCount: (result.proof.diagnostics.nativeShadowMapBindings ?? 0) > 0 ? 1 : 0,
      frameTimeMs: Number((performance.now() - frameStart).toFixed(3))
    } : current.runtime,
    proof: result.proof,
    proofSummary: result.summary,
    interactionCount: current.interactionCount + 1,
    lastInteraction: interaction,
    viewerDiagnostics: diagnostics
  };
  mountProductConfigurator(root, window.__a3dProductionRuntime, viewer);
}
