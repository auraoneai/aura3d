import { loadV6GLTFRenderPipeline, type V6GLTFRenderMetadata } from "@galileo3d/engine/assets/browser";
import {
  ProductionWebGL2Renderer,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  createV6WebGPUReport,
  summarizeV6WebGL2Proof,
  type V6RenderProof,
  type V6WebGPUReport
} from "@galileo3d/engine/rendering";

export interface V6ExampleAsset {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly role: "primary" | "secondary";
}

export interface V6ExampleEnvironment {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly exposure: number;
  readonly intensity: number;
  readonly rotation: number;
}

export interface V6ExampleDefinition {
  readonly appId: string;
  readonly sceneId: string;
  readonly title: string;
  readonly workflow: string;
  readonly assets: readonly V6ExampleAsset[];
  readonly environment: V6ExampleEnvironment;
  readonly postprocess: boolean;
  readonly webgpuReport: boolean;
  readonly expectedPostprocessChain: readonly string[];
}

export interface V6ExampleRuntimeMetrics {
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

export interface V6ExampleRuntime {
  readonly status: "loading" | "ready" | "error";
  readonly appId: string;
  readonly sceneId: string;
  readonly error?: string;
  readonly rendererBackend?: "webgl2";
  readonly runtime?: V6ExampleRuntimeMetrics;
  readonly metadata?: V6GLTFRenderMetadata;
  readonly secondaryMetadata?: readonly V6GLTFRenderMetadata[];
  readonly proof?: V6RenderProof;
  readonly proofSummary?: ReturnType<typeof summarizeV6WebGL2Proof>;
  readonly webgpu?: V6WebGPUReport;
  readonly interactionCount: number;
  readonly lastInteraction?: string;
}

declare global {
  interface Window {
    __g3dV6Example?: V6ExampleRuntime;
  }
}

export async function runV6Example(definition: V6ExampleDefinition): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${definition.appId} requires #app and canvas#viewport.`);
  }

  window.__g3dV6Example = {
    status: "loading",
    appId: definition.appId,
    sceneId: definition.sceneId,
    interactionCount: 0
  };
  mountV6ExampleShell(root, definition, window.__g3dV6Example);

  try {
    const primary = definition.assets.find((asset) => asset.role === "primary") ?? definition.assets[0];
    if (!primary) throw new Error(`${definition.appId} has no primary asset.`);
    const hdr = await fetchArrayBuffer(`/fixtures/v6/environments/hdri/${definition.environment.file}`);
    const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
      id: definition.environment.id,
      label: definition.environment.label,
      intensity: definition.environment.intensity,
      backgroundIntensity: 0.9,
      rotation: definition.environment.rotation,
      toneMapping: { operator: "filmic", exposure: definition.environment.exposure, whitePoint: 11.2 }
    });
    const lighting = createV6EnvironmentLightingResources(hdrPipeline);
    const pipeline = await loadV6GLTFRenderPipeline({
      url: `/fixtures/v6/assets/corpus/${primary.file}`,
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
        hdrEnvironmentUri: `/fixtures/v6/environments/hdri/${definition.environment.file}`
      }
    });
    const webgpu = definition.webgpuReport
      ? await createV6WebGPUReport((navigator as Navigator & { gpu?: unknown }).gpu as Parameters<typeof createV6WebGPUReport>[0])
      : undefined;
    const runtime: V6ExampleRuntime = {
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
      proofSummary: summarizeV6WebGL2Proof(proof),
      ...(webgpu ? { webgpu } : {}),
      interactionCount: 0
    };
    window.__g3dV6Example = runtime;
    mountV6ExampleShell(root, definition, runtime);
  } catch (error) {
    window.__g3dV6Example = {
      status: "error",
      appId: definition.appId,
      sceneId: definition.sceneId,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      interactionCount: window.__g3dV6Example?.interactionCount ?? 0
    };
    mountV6ExampleShell(root, definition, window.__g3dV6Example);
  }
}

function mountV6ExampleShell(root: HTMLElement, definition: V6ExampleDefinition, runtime: V6ExampleRuntime): void {
  const metrics = runtime.runtime;
  root.innerHTML = `
    <section class="g3d-v6-panel">
      <div>
        <h1>${definition.title}</h1>
        <p>${definition.workflow}</p>
      </div>
      <button id="g3d-v6-action" type="button">Inspect</button>
    </section>
    <section class="g3d-v6-metrics">
      <span>${runtime.status}</span>
      <span>${metrics ? `${metrics.drawCalls} draw calls` : definition.environment.label}</span>
      <span>${metrics ? `${metrics.triangleCount} triangles` : definition.assets.map((asset) => asset.id).join(", ")}</span>
      <span>${metrics ? `${metrics.textureCount} textures` : "HDR IBL"}</span>
    </section>
  `;
  root.querySelector("#g3d-v6-action")?.addEventListener("click", () => {
    const current = window.__g3dV6Example;
    if (!current) return;
    window.__g3dV6Example = {
      ...current,
      interactionCount: current.interactionCount + 1,
      lastInteraction: "Inspect"
    };
    mountV6ExampleShell(root, definition, window.__g3dV6Example);
  });
}

async function loadSecondaryMetadata(
  definition: V6ExampleDefinition,
  primaryAssetId: string,
  width: number,
  height: number
): Promise<readonly V6GLTFRenderMetadata[]> {
  const metadata: V6GLTFRenderMetadata[] = [];
  for (const asset of definition.assets.filter((item) => item.id !== primaryAssetId)) {
    const pipeline = await loadV6GLTFRenderPipeline({
      url: `/fixtures/v6/assets/corpus/${asset.file}`,
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

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return await response.arrayBuffer();
}
