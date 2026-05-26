import { loadProductionGLTFRenderPipeline, type ProductionGLTFRenderMetadata as ProductionGLTFRenderMetadata } from "@aura3d/engine/assets/browser";
import {
  ProductionWebGL2Renderer,
  createProductionEnvironmentLightingResources as createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance as createProductionPbrHdrPipelineFromRadiance,
  createProductionWebGPUReport,
  summarizeProductionWebGL2Proof as summarizeProductionWebGL2Proof,
  type ProductionRenderProof as ProductionRenderProof,
  type ProductionWebGPUReport
} from "@aura3d/engine/rendering";

export interface ProductionExampleAsset {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly role: "primary" | "secondary";
}

export interface ProductionExampleEnvironment {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly exposure: number;
  readonly intensity: number;
  readonly rotation: number;
}

export interface ProductionExampleDefinition {
  readonly appId: string;
  readonly sceneId: string;
  readonly title: string;
  readonly workflow: string;
  readonly assets: readonly ProductionExampleAsset[];
  readonly environment: ProductionExampleEnvironment;
  readonly postprocess: boolean;
  readonly webgpuReport: boolean;
  readonly expectedPostprocessChain: readonly string[];
}

export interface ProductionExampleRuntimeMetrics {
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
  readonly postprocessChain: readonly string[];
  readonly frameTimeMs: number;
  readonly warnings: readonly string[];
}

export interface ProductionExampleRuntime {
  readonly status: "loading" | "ready" | "error";
  readonly appId: string;
  readonly sceneId: string;
  readonly error?: string;
  readonly rendererBackend?: "webgl2";
  readonly runtime?: ProductionExampleRuntimeMetrics;
  readonly metadata?: ProductionGLTFRenderMetadata;
  readonly secondaryMetadata?: readonly ProductionGLTFRenderMetadata[];
  readonly proof?: ProductionRenderProof;
  readonly proofSummary?: ReturnType<typeof summarizeProductionWebGL2Proof>;
  readonly webgpu?: ProductionWebGPUReport;
  readonly interactionCount: number;
  readonly lastInteraction?: string;
}

declare global {
  interface Window {
    __a3dProductionExample?: ProductionExampleRuntime;
  }
}

export async function runProductionExample(definition: ProductionExampleDefinition): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${definition.appId} requires #app and canvas#viewport.`);
  }

  window.__a3dProductionExample = {
    status: "loading",
    appId: definition.appId,
    sceneId: definition.sceneId,
    interactionCount: 0
  };
  mountProductionExampleShell(root, definition, window.__a3dProductionExample);

  try {
    const primary = definition.assets.find((asset) => asset.role === "primary") ?? definition.assets[0];
    if (!primary) throw new Error(`${definition.appId} has no primary asset.`);
    const hdr = await fetchArrayBuffer(resolveEnvironmentUrl(definition.environment.file));
    const hdrPipeline = createProductionPbrHdrPipelineFromRadiance(hdr, {
      id: definition.environment.id,
      label: definition.environment.label,
      intensity: definition.environment.intensity,
      backgroundIntensity: 0.9,
      rotation: definition.environment.rotation,
      toneMapping: { operator: "filmic", exposure: definition.environment.exposure, whitePoint: 11.2 }
    });
    const lighting = createProductionEnvironmentLightingResources(hdrPipeline);
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: resolveAssetUrl(primary.file),
      assetId: primary.id,
      assetName: primary.label,
      width: canvas.width,
      height: canvas.height,
      rendererInput: {
        environmentLighting: lighting.lighting,
        qualityPreset: definition.postprocess ? "hdr-studio-preview" : "studio-preview",
        cameraPolicy: "require",
        postprocess: false
      }
    });
    const secondaryMetadata = await loadSecondaryMetadata(definition, primary.id, canvas.width, canvas.height);
    const renderer = await ProductionWebGL2Renderer.create({
      canvas,
      width: canvas.width,
      height: canvas.height,
      preserveDrawingBuffer: true,
      clearColor: [0.01, 0.012, 0.016, 1]
    });
    const frameStart = performance.now();
    const proof = renderer.renderImportedAsset({
      source: pipeline.source,
      camera: pipeline.camera,
      metadata: {
        assetId: pipeline.metadata.assetId,
        assetName: pipeline.metadata.assetName,
        assetUri: pipeline.metadata.assetUri,
        meshCount: pipeline.metadata.meshCount,
        primitiveCount: pipeline.metadata.primitiveCount,
        materialCount: pipeline.metadata.materialCount,
        textureCount: pipeline.metadata.textureCount,
        imageCount: pipeline.metadata.imageCount,
        animationCount: pipeline.metadata.animationCount,
        skinCount: pipeline.metadata.skinCount,
        morphTargetCount: pipeline.metadata.morphTargetCount,
        extensionsUsed: pipeline.metadata.extensionsUsed,
        environmentId: definition.environment.id,
        hdrEnvironmentUri: resolveEnvironmentUrl(definition.environment.file)
      }
    });
    const webgpu = definition.webgpuReport
      ? await createProductionWebGPUReport((navigator as Navigator & { gpu?: unknown }).gpu as Parameters<typeof createProductionWebGPUReport>[0])
      : undefined;
    const runtime: ProductionExampleRuntime = {
      status: "ready",
      appId: definition.appId,
      sceneId: definition.sceneId,
      rendererBackend: "webgl2",
      runtime: {
        appId: definition.appId,
        sceneId: definition.sceneId,
        workflow: definition.workflow,
        rendererBackend: "webgl2",
        assetIds: definition.assets.map((asset) => asset.id),
        primaryAssetId: pipeline.metadata.assetId,
        hdrEnvironmentId: definition.environment.id,
        drawCalls: proof.diagnostics.drawCalls,
        triangleCount: Math.max(1, Math.floor(pipeline.metadata.indexCount / 3)),
        materialCount: pipeline.metadata.materialCount,
        textureCount: pipeline.metadata.textureCount,
        textureMemoryEstimate: proof.diagnostics.textureBytes ?? 0,
        postprocessChain: [],
        frameTimeMs: Number((performance.now() - frameStart).toFixed(3)),
        warnings: [
          ...(definition.postprocess ? ["Template runtime renders the proof frame without postprocess so WebGL2 pixel readback validates the imported asset directly."] : []),
          ...(webgpu?.warnings ?? [])
        ]
      },
      metadata: pipeline.metadata,
      secondaryMetadata,
      proof,
      proofSummary: summarizeProductionWebGL2Proof(proof),
      ...(webgpu ? { webgpu } : {}),
      interactionCount: 0
    };
    window.__a3dProductionExample = runtime;
    mountProductionExampleShell(root, definition, runtime);
  } catch (error) {
    window.__a3dProductionExample = {
      status: "error",
      appId: definition.appId,
      sceneId: definition.sceneId,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      interactionCount: window.__a3dProductionExample?.interactionCount ?? 0
    };
    mountProductionExampleShell(root, definition, window.__a3dProductionExample);
  }
}

function mountProductionExampleShell(root: HTMLElement, definition: ProductionExampleDefinition, runtime: ProductionExampleRuntime): void {
  const metrics = runtime.runtime;
  root.innerHTML = `
    <section class="a3d-production-runtime-panel">
      <div>
        <h1>${definition.title}</h1>
        <p>${definition.workflow}</p>
      </div>
      <button id="a3d-production-runtime-action" type="button">Inspect</button>
    </section>
    <section class="a3d-production-runtime-metrics">
      <span>${runtime.status}</span>
      <span>${metrics ? `${metrics.drawCalls} draw calls` : definition.environment.label}</span>
      <span>${metrics ? `${metrics.triangleCount} triangles` : definition.assets.map((asset) => asset.id).join(", ")}</span>
      <span>${metrics ? `${metrics.textureCount} textures` : "HDR IBL"}</span>
    </section>
  `;
  root.querySelector("#a3d-production-runtime-action")?.addEventListener("click", () => {
    const current = window.__a3dProductionExample;
    if (!current) return;
    window.__a3dProductionExample = {
      ...current,
      interactionCount: current.interactionCount + 1,
      lastInteraction: "Inspect"
    };
    mountProductionExampleShell(root, definition, window.__a3dProductionExample);
  });
}

async function loadSecondaryMetadata(
  definition: ProductionExampleDefinition,
  primaryAssetId: string,
  width: number,
  height: number
): Promise<readonly ProductionGLTFRenderMetadata[]> {
  const metadata: ProductionGLTFRenderMetadata[] = [];
  for (const asset of definition.assets.filter((item) => item.id !== primaryAssetId)) {
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: resolveAssetUrl(asset.file),
      assetId: asset.id,
      assetName: asset.label,
      width,
      height,
      rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", postprocess: false }
    });
    metadata.push(pipeline.metadata);
  }
  return metadata;
}

function resolveAssetUrl(file: string): string {
  if (file.startsWith("/")) return file;
  if (file.startsWith("fixtures/")) return `/${file}`;
  if (file.includes("/")) return `/fixtures/${file}`;
  return `/fixtures/asset-corpus/${file}`;
}

function resolveEnvironmentUrl(file: string): string {
  if (file.startsWith("/")) return file;
  if (file.startsWith("fixtures/")) return `/${file}`;
  if (file.includes("/")) return `/fixtures/${file}`;
  return `/fixtures/environment-corpus/hdri/${file}`;
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return await response.arrayBuffer();
}
