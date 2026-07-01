import type {
  ShowcaseGeometryEvidenceSource,
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseSpec,
  ShowcaseSpecAsset,
  ShowcaseRacingTrackTopology
} from "./showcase-spec-types.js";

export function applySelectedReplacement(options: {
  readonly spec: ShowcaseSpec;
  readonly rejectedAssetId: string;
  readonly selectedAsset: ShowcaseSpecAsset;
  readonly selectedEvidence?: string;
  readonly selectedRacingTopology?: ShowcaseRacingTrackTopology;
  readonly selectedPlayableSurfaceMap?: ShowcasePlatformerPlayableSurfaceMap;
}): ShowcaseSpec {
  const existingSelected = options.spec.primaryAssets.find((asset) => asset.id === options.selectedAsset.id);
  const primaryAssets = options.spec.primaryAssets
    .filter((asset) => asset.id !== options.rejectedAssetId)
    .map((asset) => asset.id === options.selectedAsset.id ? { ...asset, role: options.selectedAsset.role } : asset);
  const nextAssets = existingSelected ? primaryAssets : [...primaryAssets, options.selectedAsset];
  const releaseAssetProbes = { ...(options.spec.evidence.releaseAssetProbes ?? {}) };
  delete releaseAssetProbes[options.rejectedAssetId];
  if (options.selectedEvidence) releaseAssetProbes[options.selectedAsset.id] = options.selectedEvidence;
  return {
    ...options.spec,
    primaryAssets: nextAssets,
    platformer: options.spec.platformer
      ? replacePlatformerAsset({
          platformer: options.spec.platformer,
          rejectedAssetId: options.rejectedAssetId,
          selectedAssetId: options.selectedAsset.id,
          selectedSurfaceMap: options.selectedPlayableSurfaceMap
        })
      : options.spec.platformer,
    racing: options.spec.racing
      ? replaceRacingAsset({
          racing: options.spec.racing,
          rejectedAssetId: options.rejectedAssetId,
          selectedAssetId: options.selectedAsset.id,
          selectedTopology: options.selectedRacingTopology
        })
      : options.spec.racing,
    categoryPlan: options.spec.categoryPlan
      ? {
        ...options.spec.categoryPlan,
        primaryAsset: options.spec.categoryPlan.primaryAsset === options.rejectedAssetId ? options.selectedAsset.id : options.spec.categoryPlan.primaryAsset
      }
      : options.spec.categoryPlan,
    layout: {
      ...options.spec.layout,
      heroAsset: options.spec.layout.heroAsset === options.rejectedAssetId ? options.selectedAsset.id : options.spec.layout.heroAsset
    },
    evidence: {
      ...options.spec.evidence,
      deployCommand: replaceDeployAsset(options.spec.evidence.deployCommand, options.rejectedAssetId, options.selectedAsset.id),
      releaseAssetProbes
    }
  };
}

interface PlatformerReplacementInput {
  readonly platformer: NonNullable<ShowcaseSpec["platformer"]>;
  readonly rejectedAssetId: string;
  readonly selectedAssetId: string;
  readonly selectedSurfaceMap?: ShowcasePlatformerPlayableSurfaceMap;
}

function replacePlatformerAsset(input: PlatformerReplacementInput): NonNullable<ShowcaseSpec["platformer"]> {
  const { platformer, rejectedAssetId, selectedAssetId, selectedSurfaceMap } = input;
  const characterAsset = platformer.characterAsset === rejectedAssetId ? selectedAssetId : platformer.characterAsset;
  const worldAssets = unique(platformer.worldAssets.map((assetId) => assetId === rejectedAssetId ? selectedAssetId : assetId));
  const replacingWorldAsset = platformer.worldAssets.includes(rejectedAssetId);
  const replacingCharacterAsset = platformer.characterAsset === rejectedAssetId;
  if (!replacingWorldAsset && !replacingCharacterAsset) {
    return { ...platformer, characterAsset, worldAssets };
  }
  if (replacingWorldAsset && selectedSurfaceMap) {
    return {
      ...platformer,
      characterAsset,
      worldAssets,
      levelDesign: {
        minPlayableSeconds: platformer.levelDesign.minPlayableSeconds,
        minCheckpoints: platformer.levelDesign.minCheckpoints,
        requiresHazardRespawn: platformer.levelDesign.requiresHazardRespawn,
        requiresFinish: platformer.levelDesign.requiresFinish,
        authoredLevelFlow: platformer.levelDesign.authoredLevelFlow,
        playableSurfaceSource: playableSurfaceSourceForGeometry(selectedSurfaceMap.source),
        playableSurfaceLayoutValidated: true,
        playableSurfaceMap: selectedSurfaceMap,
        characterWorldScaleCompatible: characterScaleRatioIsCompatible(selectedSurfaceMap.characterScaleRatio),
        styleCompatible: retainedAssetPairStillMatches(platformer.levelDesign.assetPairEvidence, selectedAssetId),
        primitivePrimaryWorldRejected: platformer.levelDesign.primitivePrimaryWorldRejected
      }
    };
  }
  return {
    ...platformer,
    characterAsset,
    worldAssets,
    levelDesign: {
      minPlayableSeconds: platformer.levelDesign.minPlayableSeconds,
      minCheckpoints: platformer.levelDesign.minCheckpoints,
      requiresHazardRespawn: platformer.levelDesign.requiresHazardRespawn,
      requiresFinish: platformer.levelDesign.requiresFinish,
      authoredLevelFlow: platformer.levelDesign.authoredLevelFlow,
      playableSurfaceSource: "authored-route-rectangles",
      playableSurfaceLayoutValidated: false,
      characterWorldScaleCompatible: false,
      styleCompatible: false,
      primitivePrimaryWorldRejected: platformer.levelDesign.primitivePrimaryWorldRejected
    }
  };
}

interface RacingReplacementInput {
  readonly racing: NonNullable<ShowcaseSpec["racing"]>;
  readonly rejectedAssetId: string;
  readonly selectedAssetId: string;
  readonly selectedTopology?: ShowcaseRacingTrackTopology;
}

function replaceRacingAsset(input: RacingReplacementInput): NonNullable<ShowcaseSpec["racing"]> {
  const { racing, rejectedAssetId, selectedAssetId, selectedTopology } = input;
  const vehicleAsset = racing.vehicleAsset === rejectedAssetId ? selectedAssetId : racing.vehicleAsset;
  const trackAsset = racing.trackAsset === rejectedAssetId ? selectedAssetId : racing.trackAsset;
  const replacingTrackAsset = racing.trackAsset === rejectedAssetId;
  const replacingVehicleAsset = racing.vehicleAsset === rejectedAssetId;
  if (!replacingTrackAsset && !replacingVehicleAsset) return { ...racing, vehicleAsset, trackAsset };
  if (replacingTrackAsset && selectedTopology) {
    return {
      ...racing,
      vehicleAsset,
      trackAsset,
      raceDesign: {
        minCheckpoints: racing.raceDesign.minCheckpoints,
        minLaps: racing.raceDesign.minLaps,
        minLapSeconds: racing.raceDesign.minLapSeconds,
        routeAlignedToTrackAsset: true,
        visibleTrackTopology: racingTopologyVisibility(selectedTopology.source),
        trackTopology: selectedTopology,
        carTrackScaleCompatible: true,
        noDebugLocatorDisk: racing.raceDesign.noDebugLocatorDisk
      }
    };
  }
  return {
    ...racing,
    vehicleAsset,
    trackAsset,
    raceDesign: {
      minCheckpoints: racing.raceDesign.minCheckpoints,
      minLaps: racing.raceDesign.minLaps,
      minLapSeconds: racing.raceDesign.minLapSeconds,
      routeAlignedToTrackAsset: false,
      visibleTrackTopology: "authored-route-over-visible-track",
      carTrackScaleCompatible: false,
      noDebugLocatorDisk: racing.raceDesign.noDebugLocatorDisk
    }
  };
}

function replaceDeployAsset(command: string, rejectedAssetId: string, selectedAssetId: string): string {
  const tokens = command.split(" ");
  const result: string[] = [];
  let selectedPresent = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token === "--asset" && next === rejectedAssetId) {
      index += 1;
      continue;
    }
    if (token === "--asset" && next === selectedAssetId) selectedPresent = true;
    result.push(token);
  }
  return selectedPresent ? result.join(" ") : `${result.join(" ")} --asset ${selectedAssetId}`;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function racingTopologyVisibility(source: ShowcaseGeometryEvidenceSource): NonNullable<ShowcaseSpec["racing"]>["raceDesign"]["visibleTrackTopology"] {
  return source === "asset-mesh-extracted" ? "mesh-road-topology" : "asset-bound-road-topology";
}

function playableSurfaceSourceForGeometry(source: ShowcaseGeometryEvidenceSource): NonNullable<ShowcaseSpec["platformer"]>["levelDesign"]["playableSurfaceSource"] {
  return source === "asset-mesh-extracted" ? "asset-derived-playable-surfaces" : "asset-bound-playable-surfaces";
}

function characterScaleRatioIsCompatible(value: number): boolean {
  return value >= 0.2 && value <= 0.75;
}

function retainedAssetPairStillMatches(
  evidence: NonNullable<ShowcaseSpec["platformer"]>["levelDesign"]["assetPairEvidence"],
  selectedAssetId: string
): boolean {
  return evidence?.verdict === "pass" && evidence.assets.includes(selectedAssetId);
}
