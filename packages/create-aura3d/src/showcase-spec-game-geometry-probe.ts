import {
  extractPlatformerPlayableSurfaceMapFromAsset,
  extractRacingTrackTopologyFromAsset,
  type ExtractOptions,
  type GeometryExtractionResult
} from "./showcase-spec-game-geometry-extractor.js";
import type {
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingTrackTopology
} from "./showcase-spec-types.js";

export type ShowcaseGameGeometryCategory = "racing" | "platformer";

export type ShowcaseGameGeometryProbeResult =
  | {
    readonly category: "racing";
    readonly assetId: string;
    readonly extraction: GeometryExtractionResult<ShowcaseRacingTrackTopology>;
  }
  | {
    readonly category: "platformer";
    readonly assetId: string;
    readonly extraction: GeometryExtractionResult<ShowcasePlatformerPlayableSurfaceMap>;
  };

export function probeShowcaseGameGeometry(
  assetId: string,
  category: "racing",
  options?: ExtractOptions
): Extract<ShowcaseGameGeometryProbeResult, { readonly category: "racing" }>;
export function probeShowcaseGameGeometry(
  assetId: string,
  category: "platformer",
  options?: ExtractOptions
): Extract<ShowcaseGameGeometryProbeResult, { readonly category: "platformer" }>;
export function probeShowcaseGameGeometry(
  assetId: string,
  category: ShowcaseGameGeometryCategory,
  options?: ExtractOptions
): ShowcaseGameGeometryProbeResult;
export function probeShowcaseGameGeometry(
  assetId: string,
  category: ShowcaseGameGeometryCategory,
  options: ExtractOptions = {}
): ShowcaseGameGeometryProbeResult {
  if (category === "racing") {
    return {
      category,
      assetId,
      extraction: extractRacingTrackTopologyFromAsset(assetId, options)
    };
  }
  return {
    category,
    assetId,
    extraction: extractPlatformerPlayableSurfaceMapFromAsset(assetId, options)
  };
}
