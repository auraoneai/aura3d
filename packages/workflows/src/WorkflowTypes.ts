import type { AnimationClip, AnimationMixerSnapshot } from "@aura3d/animation";
import type { RenderDeviceDiagnostics, RenderItem, RenderSource, CameraLike } from "@aura3d/rendering";
import type { RenderableAsset, RenderableScene, CreateRenderableSceneOptions, LoadRenderableAssetOptions } from "@aura3d/assets";
import type { ProductAsset, ProductAssetLoadOptions, ProductRenderScene } from "@aura3d/product-studio";

export type A3DWorkflowKind =
  | "asset-viewer"
  | "product-configurator"
  | "material-studio"
  | "scene-showcase"
  | "interactive-scene"
  | "animation-lab"
  | "comparison";

export interface A3DWorkflowDiagnostics {
  readonly workflow: A3DWorkflowKind;
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

export interface A3DWorkflowResult {
  readonly kind: A3DWorkflowKind;
  readonly source: RenderSource;
  readonly camera?: CameraLike;
  readonly renderItems?: readonly RenderItem[];
  readonly diagnostics: A3DWorkflowDiagnostics;
  dispose(): void;
}

export interface AssetViewerWorkflowOptions extends CreateRenderableSceneOptions, LoadRenderableAssetOptions {
  readonly url: string;
}

export interface AssetViewerWorkflowResult extends A3DWorkflowResult {
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

export interface ProductConfiguratorWorkflowResult extends A3DWorkflowResult {
  readonly kind: "product-configurator";
  readonly asset: ProductAsset;
  readonly scene: ProductRenderScene;
}

export interface MaterialStudioWorkflowOptions {
  readonly mode?: "comparison" | "metals" | "transparent";
}

export interface MaterialStudioWorkflowResult extends A3DWorkflowResult {
  readonly kind: "material-studio";
}

export interface SceneShowcaseWorkflowOptions {
  readonly preset?: "studio" | "gallery" | "dramatic";
}

export interface SceneShowcaseWorkflowResult extends A3DWorkflowResult {
  readonly kind: "scene-showcase";
}

export interface InteractiveSceneWorkflowOptions {
  readonly preset?: "orbiting-products" | "input-ready";
}

export interface InteractiveSceneWorkflowResult extends A3DWorkflowResult {
  readonly kind: "interactive-scene";
  update(timeSeconds: number): RenderSource;
}

export interface AnimationLabWorkflowOptions {
  readonly clip?: "idle" | "walk" | "run";
  readonly speed?: number;
}

export interface AnimationLabWorkflowResult extends A3DWorkflowResult {
  readonly kind: "animation-lab";
  readonly clips: readonly AnimationClip[];
  readonly mixer: AnimationMixerSnapshot;
  update(timeSeconds: number): RenderSource;
}

export interface ComparisonWorkflowOptions {
  readonly focus?: "setup" | "rendering" | "migration";
}

export interface ComparisonWorkflowResult extends A3DWorkflowResult {
  readonly kind: "comparison";
  readonly comparison: {
    readonly focus: "setup" | "rendering" | "migration";
    readonly a3dSteps: readonly string[];
    readonly threeJsSteps: readonly string[];
    readonly migrationNotes: readonly string[];
  };
}
