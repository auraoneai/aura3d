import { Engine, type DiagnosticsSnapshot } from "@aura3d/core";
import { Renderer, type RenderDeviceDiagnostics, type RendererOptions } from "@aura3d/rendering";
import {
  createAssetViewerWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow,
  type AssetViewerWorkflowOptions,
  type A3DWorkflowResult,
  type InteractiveSceneWorkflowOptions,
  type MaterialStudioWorkflowOptions,
  type ProductConfiguratorWorkflowOptions,
  type SceneShowcaseWorkflowOptions
} from "@aura3d/workflows";

export type A3DAppQualityPreset = "draft" | "balanced" | "production";
export type A3DAppWorkflowPreset = "asset-viewer" | "product-configurator" | "material-studio" | "scene-showcase" | "interactive-scene";

export interface A3DAppQualitySettings {
  readonly preset: A3DAppQualityPreset;
  readonly width: number;
  readonly height: number;
  readonly antialias: boolean;
  readonly preserveDrawingBuffer: boolean;
  readonly targetFormat: "rgba8" | "rgba16f";
  readonly diagnostics: readonly string[];
}

export interface A3DAppOptions {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly quality?: A3DAppQualityPreset;
  readonly width?: number;
  readonly height?: number;
  readonly rendererFactory?: (options: RendererOptions) => Promise<A3DAppRendererLike>;
}

export interface A3DAppRendererLike {
  render(source: A3DWorkflowResult["source"], camera?: A3DWorkflowResult["camera"]): RenderDeviceDiagnostics;
  dispose?(): void;
}

export interface A3DAppDiagnostics {
  readonly appState: "ready" | "disposed";
  readonly quality: A3DAppQualitySettings;
  readonly workflowRuns: number;
  readonly lastWorkflow?: A3DAppWorkflowPreset;
  readonly lastRender?: RenderDeviceDiagnostics;
  readonly engine: DiagnosticsSnapshot;
}

export interface A3DApp {
  readonly engine: Engine;
  readonly renderer?: A3DAppRendererLike;
  readonly quality: A3DAppQualitySettings;
  renderWorkflow(preset: "asset-viewer", options: AssetViewerWorkflowOptions): Promise<A3DWorkflowResult>;
  renderWorkflow(preset: "product-configurator", options: ProductConfiguratorWorkflowOptions): Promise<A3DWorkflowResult>;
  renderWorkflow(preset: "material-studio", options?: MaterialStudioWorkflowOptions): Promise<A3DWorkflowResult>;
  renderWorkflow(preset: "scene-showcase", options?: SceneShowcaseWorkflowOptions): Promise<A3DWorkflowResult>;
  renderWorkflow(preset: "interactive-scene", options?: InteractiveSceneWorkflowOptions): Promise<A3DWorkflowResult>;
  renderWorkflow(preset: A3DAppWorkflowPreset, options?: unknown): Promise<A3DWorkflowResult>;
  diagnostics(): A3DAppDiagnostics;
  dispose(): Promise<void>;
}

export const A3D_APP_WORKFLOW_PRESETS: readonly A3DAppWorkflowPreset[] = [
  "asset-viewer",
  "product-configurator",
  "material-studio",
  "scene-showcase",
  "interactive-scene"
] as const;

export function resolveA3DAppQualityPreset(preset: A3DAppQualityPreset = "balanced", overrides: Pick<A3DAppOptions, "width" | "height"> = {}): A3DAppQualitySettings {
  const base = preset === "production"
    ? { width: 1600, height: 1000, antialias: true, preserveDrawingBuffer: true, targetFormat: "rgba16f" as const }
    : preset === "draft"
      ? { width: 960, height: 540, antialias: false, preserveDrawingBuffer: false, targetFormat: "rgba8" as const }
      : { width: 1280, height: 720, antialias: true, preserveDrawingBuffer: true, targetFormat: "rgba16f" as const };
  return {
    preset,
    ...base,
    width: overrides.width ?? base.width,
    height: overrides.height ?? base.height,
    diagnostics: [
      "quality-preset",
      "workflow-presets",
      "renderer-diagnostics",
      "engine-diagnostics"
    ]
  };
}

export async function createA3DApp(options: A3DAppOptions = {}): Promise<A3DApp> {
  const quality = resolveA3DAppQualityPreset(options.quality, options);
  const engine = new Engine({ autoStart: false });
  await engine.init();
  const renderer = options.canvas
    ? await (options.rendererFactory ?? Renderer.create)({
      backend: "webgl2",
      canvas: options.canvas,
      width: quality.width,
      height: quality.height,
      antialias: quality.antialias,
      preserveDrawingBuffer: quality.preserveDrawingBuffer,
      clearColor: [0.018, 0.02, 0.024, 1]
    })
    : undefined;
  let disposed = false;
  let workflowRuns = 0;
  let lastWorkflow: A3DAppWorkflowPreset | undefined;
  let lastRender: RenderDeviceDiagnostics | undefined;

  return {
    engine,
    renderer,
    quality,
    async renderWorkflow(preset: A3DAppWorkflowPreset, workflowOptions?: unknown): Promise<A3DWorkflowResult> {
      if (disposed) throw new Error("A3D app has been disposed.");
      const workflow = await createWorkflow(preset, workflowOptions);
      workflowRuns += 1;
      lastWorkflow = preset;
      engine.diagnostics.increment(`workflow.${preset}.runs`);
      if (renderer) {
        lastRender = renderer.render(workflow.source, workflow.camera);
        engine.diagnostics.gauge("renderer.drawCalls", lastRender.drawCalls);
      }
      return workflow;
    },
    diagnostics(): A3DAppDiagnostics {
      return {
        appState: disposed ? "disposed" : "ready",
        quality,
        workflowRuns,
        ...(lastWorkflow ? { lastWorkflow } : {}),
        ...(lastRender ? { lastRender } : {}),
        engine: engine.diagnostics.snapshot()
      };
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      renderer?.dispose?.();
      await engine.dispose();
    }
  };
}

async function createWorkflow(preset: A3DAppWorkflowPreset, options: unknown): Promise<A3DWorkflowResult> {
  switch (preset) {
    case "asset-viewer":
      return createAssetViewerWorkflow(options as AssetViewerWorkflowOptions);
    case "product-configurator":
      return createProductConfiguratorWorkflow(options as ProductConfiguratorWorkflowOptions);
    case "material-studio":
      return createMaterialStudioWorkflow(options as MaterialStudioWorkflowOptions | undefined);
    case "scene-showcase":
      return createSceneShowcaseWorkflow(options as SceneShowcaseWorkflowOptions | undefined);
    case "interactive-scene":
      return createInteractiveSceneWorkflow(options as InteractiveSceneWorkflowOptions | undefined);
  }
}
