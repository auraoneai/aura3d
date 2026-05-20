import { Engine, type DiagnosticsSnapshot } from "@galileo3d/core";
import { Renderer, type RenderDeviceDiagnostics, type RendererOptions } from "@galileo3d/rendering";
import {
  createAssetViewerWorkflow,
  createInteractiveSceneWorkflow,
  createMaterialStudioWorkflow,
  createProductConfiguratorWorkflow,
  createSceneShowcaseWorkflow,
  type AssetViewerWorkflowOptions,
  type G3DWorkflowResult,
  type InteractiveSceneWorkflowOptions,
  type MaterialStudioWorkflowOptions,
  type ProductConfiguratorWorkflowOptions,
  type SceneShowcaseWorkflowOptions
} from "@galileo3d/workflows";

export type G3DAppQualityPreset = "draft" | "balanced" | "production";
export type G3DAppWorkflowPreset = "asset-viewer" | "product-configurator" | "material-studio" | "scene-showcase" | "interactive-scene";

export interface G3DAppQualitySettings {
  readonly preset: G3DAppQualityPreset;
  readonly width: number;
  readonly height: number;
  readonly antialias: boolean;
  readonly preserveDrawingBuffer: boolean;
  readonly targetFormat: "rgba8" | "rgba16f";
  readonly diagnostics: readonly string[];
}

export interface G3DAppOptions {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly quality?: G3DAppQualityPreset;
  readonly width?: number;
  readonly height?: number;
  readonly rendererFactory?: (options: RendererOptions) => Promise<G3DAppRendererLike>;
}

export interface G3DAppRendererLike {
  render(source: G3DWorkflowResult["source"], camera?: G3DWorkflowResult["camera"]): RenderDeviceDiagnostics;
  dispose?(): void;
}

export interface G3DAppDiagnostics {
  readonly appState: "ready" | "disposed";
  readonly quality: G3DAppQualitySettings;
  readonly workflowRuns: number;
  readonly lastWorkflow?: G3DAppWorkflowPreset;
  readonly lastRender?: RenderDeviceDiagnostics;
  readonly engine: DiagnosticsSnapshot;
}

export interface G3DApp {
  readonly engine: Engine;
  readonly renderer?: G3DAppRendererLike;
  readonly quality: G3DAppQualitySettings;
  renderWorkflow(preset: "asset-viewer", options: AssetViewerWorkflowOptions): Promise<G3DWorkflowResult>;
  renderWorkflow(preset: "product-configurator", options: ProductConfiguratorWorkflowOptions): Promise<G3DWorkflowResult>;
  renderWorkflow(preset: "material-studio", options?: MaterialStudioWorkflowOptions): Promise<G3DWorkflowResult>;
  renderWorkflow(preset: "scene-showcase", options?: SceneShowcaseWorkflowOptions): Promise<G3DWorkflowResult>;
  renderWorkflow(preset: "interactive-scene", options?: InteractiveSceneWorkflowOptions): Promise<G3DWorkflowResult>;
  renderWorkflow(preset: G3DAppWorkflowPreset, options?: unknown): Promise<G3DWorkflowResult>;
  diagnostics(): G3DAppDiagnostics;
  dispose(): Promise<void>;
}

export const G3D_APP_WORKFLOW_PRESETS: readonly G3DAppWorkflowPreset[] = [
  "asset-viewer",
  "product-configurator",
  "material-studio",
  "scene-showcase",
  "interactive-scene"
] as const;

export function resolveG3DAppQualityPreset(preset: G3DAppQualityPreset = "balanced", overrides: Pick<G3DAppOptions, "width" | "height"> = {}): G3DAppQualitySettings {
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

export async function createG3DApp(options: G3DAppOptions = {}): Promise<G3DApp> {
  const quality = resolveG3DAppQualityPreset(options.quality, options);
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
  let lastWorkflow: G3DAppWorkflowPreset | undefined;
  let lastRender: RenderDeviceDiagnostics | undefined;

  return {
    engine,
    renderer,
    quality,
    async renderWorkflow(preset: G3DAppWorkflowPreset, workflowOptions?: unknown): Promise<G3DWorkflowResult> {
      if (disposed) throw new Error("G3D app has been disposed.");
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
    diagnostics(): G3DAppDiagnostics {
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

async function createWorkflow(preset: G3DAppWorkflowPreset, options: unknown): Promise<G3DWorkflowResult> {
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
