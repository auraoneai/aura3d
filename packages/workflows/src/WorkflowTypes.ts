import type { AnimationClip, AnimationMixerSnapshot } from "@galileo3d/animation";
import type { RenderDeviceDiagnostics, RenderItem, RenderSource, CameraLike } from "@galileo3d/rendering";
import type { RenderableAsset, RenderableScene, CreateRenderableSceneOptions, LoadRenderableAssetOptions } from "@galileo3d/assets";
import type { ProductAsset, ProductAssetLoadOptions, ProductRenderScene } from "@galileo3d/product-studio";

export type G3DWorkflowKind =
  | "asset-viewer"
  | "product-configurator"
  | "material-studio"
  | "scene-showcase"
  | "interactive-scene"
  | "animation-lab"
  | "comparison";

export interface G3DWorkflowDiagnostics {
  readonly workflow: G3DWorkflowKind;
  readonly warnings: readonly string[];
  readonly featureChecklist: readonly string[];
  readonly asset?: {
    readonly kind: string;
    readonly meshCount: number;
    readonly materialCount: number;
    readonly textureCount: number;
  };
  readonly renderDiagnostics?: RenderDeviceDiagnostics;
}

export interface G3DWorkflowResult {
  readonly kind: G3DWorkflowKind;
  readonly source: RenderSource;
  readonly camera?: CameraLike;
  readonly renderItems?: readonly RenderItem[];
  readonly diagnostics: G3DWorkflowDiagnostics;
  dispose(): void;
}

export interface AssetViewerWorkflowOptions extends CreateRenderableSceneOptions, LoadRenderableAssetOptions {
  readonly url: string;
}

export interface AssetViewerWorkflowResult extends G3DWorkflowResult {
  readonly kind: "asset-viewer";
  readonly asset: RenderableAsset;
  readonly scene: RenderableScene;
}

export interface ProductConfiguratorWorkflowOptions {
  readonly asset: ProductAssetLoadOptions;
  readonly materialMode?: "asset" | "clay" | "matte" | "metal-check" | "contrast";
  readonly lighting?: "catalog-softbox" | "inspection-bay" | "hero-contrast";
  readonly camera?: "front-three-quarter" | "side-profile" | "top-detail" | "macro-detail";
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
}

export interface ProductConfiguratorWorkflowResult extends G3DWorkflowResult {
  readonly kind: "product-configurator";
  readonly asset: ProductAsset;
  readonly scene: ProductRenderScene;
}

export interface MaterialStudioWorkflowOptions {
  readonly mode?: "comparison" | "metals" | "transparent";
}

export interface MaterialStudioWorkflowResult extends G3DWorkflowResult {
  readonly kind: "material-studio";
}

export interface SceneShowcaseWorkflowOptions {
  readonly preset?: "studio" | "gallery" | "dramatic";
}

export interface SceneShowcaseWorkflowResult extends G3DWorkflowResult {
  readonly kind: "scene-showcase";
}

export interface InteractiveSceneWorkflowOptions {
  readonly preset?: "orbiting-products" | "input-ready";
}

export interface InteractiveSceneWorkflowResult extends G3DWorkflowResult {
  readonly kind: "interactive-scene";
  update(timeSeconds: number): RenderSource;
}

export interface AnimationLabWorkflowOptions {
  readonly clip?: "idle" | "walk" | "run";
  readonly speed?: number;
}

export interface AnimationLabWorkflowResult extends G3DWorkflowResult {
  readonly kind: "animation-lab";
  readonly clips: readonly AnimationClip[];
  readonly mixer: AnimationMixerSnapshot;
  update(timeSeconds: number): RenderSource;
}

export interface ComparisonWorkflowOptions {
  readonly focus?: "setup" | "rendering" | "migration";
}

export interface ComparisonWorkflowResult extends G3DWorkflowResult {
  readonly kind: "comparison";
  readonly comparison: {
    readonly focus: "setup" | "rendering" | "migration";
    readonly g3dSteps: readonly string[];
    readonly threeJsSteps: readonly string[];
    readonly migrationNotes: readonly string[];
  };
}
