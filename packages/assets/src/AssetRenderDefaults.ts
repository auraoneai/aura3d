import type { CameraFrameViewport, PerspectiveCameraFrameOptions, RendererPostProcessOptions, RendererShadowOptions } from "@galileo3d/rendering";
import { createLightingDefault } from "@galileo3d/rendering";

export type AssetRenderLightingPreset = "studioProduct" | "outdoorDay" | "interiorGallery" | "gameNight";

export interface AssetRenderDefaults {
  readonly viewport: CameraFrameViewport;
  readonly camera: "auto-frame";
  readonly frame: PerspectiveCameraFrameOptions;
  readonly lighting: AssetRenderLightingPreset;
  readonly shadows: RendererShadowOptions;
  readonly postprocess: RendererPostProcessOptions;
}

export const DEFAULT_ASSET_RENDER_VIEWPORT: CameraFrameViewport = {
  width: 960,
  height: 540
};

export function createAssetRenderDefaults(lighting: AssetRenderLightingPreset = "studioProduct"): AssetRenderDefaults {
  const defaults = createLightingDefault(lighting);
  return {
    viewport: DEFAULT_ASSET_RENDER_VIEWPORT,
    camera: "auto-frame",
    frame: {
      paddingRatio: 0.16,
      yawRadians: -0.38,
      pitchRadians: -0.16,
      nearPadding: 0.18,
      farPadding: 2.4
    },
    lighting,
    shadows: defaults.shadow,
    postprocess: defaults.postprocess
  };
}
