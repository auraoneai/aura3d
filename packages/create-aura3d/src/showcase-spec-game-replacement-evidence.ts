import type { ManifestAsset } from "./showcase-spec-replacement-manifest.js";
import {
  extractPlatformerPlayableSurfaceMapFromAsset,
  extractRacingTrackTopologyFromAsset
} from "./showcase-spec-game-geometry-extractor.js";
import type {
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingTrackTopology,
  ShowcaseSpec
} from "./showcase-spec-types.js";

export interface GameGeometryGate {
  readonly reasons: readonly string[];
  readonly penalties: readonly string[];
  readonly racingTopology?: ShowcaseRacingTrackTopology;
  readonly playableSurfaceMap?: ShowcasePlatformerPlayableSurfaceMap;
}

interface GameGeometryGateOptions {
  readonly projectDir?: string;
}

export function gameGeometryGate(
  spec: ShowcaseSpec,
  role: string,
  asset: ManifestAsset,
  options: GameGeometryGateOptions = {}
): GameGeometryGate {
  if (spec.category === "game-racing" && role === "track") return racingTrackGeometryGate(spec, asset, options);
  if (spec.category === "game-platformer" && isPlatformerWorldRole(role)) return platformerWorldGeometryGate(spec, asset, options);
  if (spec.category === "game-platformer" && role === "character") return platformerCharacterGeometryGate(spec, asset);
  return { reasons: [], penalties: [] };
}

function racingTrackGeometryGate(spec: ShowcaseSpec, asset: ManifestAsset, options: GameGeometryGateOptions): GameGeometryGate {
  const extracted = extractRacingTrackTopologyFromAsset(asset.id, { projectDir: options.projectDir });
  if (extracted.ok) {
    const topology = extracted.value;
    const minCheckpoints = spec.racing?.raceDesign.minCheckpoints ?? 4;
    if (topology.checkpoints.length < minCheckpoints) {
      return {
        reasons: extracted.reasons,
        penalties: [`game asset mesh-derived track topology checkpoints too low:${topology.checkpoints.length}`],
        racingTopology: topology
      };
    }
    return {
      reasons: ["mesh-derived racing topology evidence matches candidate", ...extracted.reasons],
      penalties: [],
      racingTopology: topology
    };
  }
  const topology = asset.racingTopology ?? spec.racing?.raceDesign.trackTopology;
  if (!topology || topology.assetId !== asset.id) {
    return {
      reasons: extracted.reasons,
      penalties: ["game asset track lacks mesh-derived racing topology evidence", ...extracted.blockers]
    };
  }
  if (asset.hash && topology.assetHash !== asset.hash) {
    return {
      reasons: extracted.reasons,
      penalties: [`game asset track topology hash mismatch:${asset.id}`, ...extracted.blockers]
    };
  }
  if (topology.source !== "asset-mesh-extracted") {
    const penalties = validateOverlayValidatedRacingTopology(topology, spec);
    if (penalties.length === 0) {
      return {
        reasons: [
          "overlay-validated racing topology evidence matches candidate",
          "mesh extraction did not produce a candidate; retained hash-bound topology evidence accepted",
          ...extracted.reasons
        ],
        penalties: [],
        racingTopology: topology
      };
    }
    return {
      reasons: extracted.reasons,
      penalties,
      racingTopology: topology
    };
  }
  return {
    reasons: extracted.reasons,
    penalties: ["game asset track mesh extraction failed", ...extracted.blockers],
    racingTopology: topology
  };
}

function platformerWorldGeometryGate(spec: ShowcaseSpec, asset: ManifestAsset, options: GameGeometryGateOptions): GameGeometryGate {
  const extracted = extractPlatformerPlayableSurfaceMapFromAsset(asset.id, {
    projectDir: options.projectDir,
    characterAssetId: spec.platformer?.characterAsset,
    characterScaleRatio: spec.platformer?.levelDesign.playableSurfaceMap?.characterScaleRatio ?? 0.42
  });
  if (extracted.ok) {
    const surfaceMap = extracted.value;
    const playableSurfaceCount = countPublicPlatformerPlayableSurfaces(surfaceMap);
    if (playableSurfaceCount < 5) {
      return {
        reasons: extracted.reasons,
        penalties: [`game asset mesh-derived platformer playable surface count too low:${playableSurfaceCount}`],
        playableSurfaceMap: surfaceMap
      };
    }
    return {
      reasons: ["mesh-derived playable-surface evidence matches candidate", ...extracted.reasons],
      penalties: [],
      playableSurfaceMap: surfaceMap
    };
  }
  const surfaceMap = asset.playableSurfaceMap ?? spec.platformer?.levelDesign.playableSurfaceMap;
  if (!surfaceMap || surfaceMap.assetId !== asset.id) {
    return {
      reasons: extracted.reasons,
      penalties: ["game asset platformer world lacks mesh-derived playable-surface evidence", ...extracted.blockers]
    };
  }
  if (asset.hash && surfaceMap.assetHash !== asset.hash) {
    return {
      reasons: extracted.reasons,
      penalties: [`game asset platformer surface hash mismatch:${asset.id}`, ...extracted.blockers]
    };
  }
  if (surfaceMap.source !== "asset-mesh-extracted") {
    const penalties = validateOverlayValidatedPlatformerSurfaceMap(surfaceMap, spec);
    if (penalties.length === 0) {
      return {
        reasons: [
          "overlay-validated playable-surface evidence matches candidate",
          "mesh extraction did not produce a candidate; retained hash-bound surface evidence accepted",
          ...extracted.reasons
        ],
        penalties: [],
        playableSurfaceMap: surfaceMap
      };
    }
    return {
      reasons: extracted.reasons,
      penalties,
      playableSurfaceMap: surfaceMap
    };
  }
  return {
    reasons: extracted.reasons,
    penalties: ["game asset platformer mesh extraction failed", ...extracted.blockers],
    playableSurfaceMap: surfaceMap
  };
}

function platformerCharacterGeometryGate(spec: ShowcaseSpec, asset: ManifestAsset): GameGeometryGate {
  const assetPairEvidence = spec.platformer?.levelDesign.assetPairEvidence;
  if (assetPairEvidence?.verdict === "pass" && assetPairEvidence.assets.includes(asset.id)) {
    return {
      reasons: ["platformer character accepted by retained asset-pair evidence"],
      penalties: []
    };
  }
  return {
    reasons: [],
    penalties: ["game asset character lacks retained platformer pair evidence"]
  };
}

function isPlatformerWorldRole(role: string): boolean {
  return role === "world" || role === "stage" || role === "level";
}

function validateOverlayValidatedRacingTopology(topology: ShowcaseRacingTrackTopology, spec: ShowcaseSpec): readonly string[] {
  const racing = spec.racing;
  const penalties: string[] = [];
  if (!racing) return ["game asset track topology used outside racing spec"];
  if (!isOverlayValidatedGeometrySource(topology.source)) {
    penalties.push(`game asset track topology source is not public-safe:${topology.source}`);
  }
  if (!topology.evidence.routeOverlay) {
    penalties.push("game asset track topology missing retained route overlay evidence");
  }
  penalties.push(...validateOverlayValidatedModelAlignment("game asset track topology", topology.modelAlignment));
  if (topology.assetHash.startsWith("sha256-000000")) {
    penalties.push("game asset track topology missing asset hash binding");
  }
  if (topology.confidence < 0.65) {
    penalties.push(`game asset track topology confidence too low:${topology.confidence}`);
  }
  if (topology.estimatedLapSeconds < racing.raceDesign.minLapSeconds) {
    penalties.push(`game asset track topology lap duration too low:${topology.estimatedLapSeconds}`);
  }
  if (topology.roadCenterline.length < 8) {
    penalties.push(`game asset track topology point count too low:${topology.roadCenterline.length}`);
  }
  if (topology.checkpoints.length < racing.raceDesign.minCheckpoints) {
    penalties.push(`game asset track topology checkpoint count too low:${topology.checkpoints.length}`);
  }
  return penalties;
}

function validateOverlayValidatedPlatformerSurfaceMap(surfaceMap: ShowcasePlatformerPlayableSurfaceMap, spec: ShowcaseSpec): readonly string[] {
  const platformer = spec.platformer;
  const penalties: string[] = [];
  if (!platformer) return ["game asset platformer surface map used outside platformer spec"];
  if (!isOverlayValidatedGeometrySource(surfaceMap.source)) {
    penalties.push(`game asset platformer surface map source is not public-safe:${surfaceMap.source}`);
  }
  if (!surfaceMap.evidence.routeOverlay) {
    penalties.push("game asset platformer surface map missing retained route overlay evidence");
  }
  penalties.push(...validateOverlayValidatedModelAlignment("game asset platformer surface map", surfaceMap.modelAlignment));
  if (surfaceMap.assetHash.startsWith("sha256-000000")) {
    penalties.push("game asset platformer surface map missing asset hash binding");
  }
  if (surfaceMap.confidence < 0.65) {
    penalties.push(`game asset platformer surface map confidence too low:${surfaceMap.confidence}`);
  }
  if (surfaceMap.estimatedCompletionSeconds < platformer.levelDesign.minPlayableSeconds) {
    penalties.push(`game asset platformer surface map completion duration too low:${surfaceMap.estimatedCompletionSeconds}`);
  }
  const playableSurfaceCount = countPublicPlatformerPlayableSurfaces(surfaceMap);
  if (playableSurfaceCount < 5) {
    penalties.push(`game asset platformer playable surface count too low:${playableSurfaceCount}`);
  }
  if (surfaceMap.characterScaleRatio <= 0 || surfaceMap.characterScaleRatio > 1.25) {
    penalties.push(`game asset platformer character scale ratio invalid:${surfaceMap.characterScaleRatio}`);
  }
  return penalties;
}

function countPublicPlatformerPlayableSurfaces(surfaceMap: ShowcasePlatformerPlayableSurfaceMap): number {
  return surfaceMap.surfaces.filter((surface) =>
    surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving"
  ).length;
}

function validateOverlayValidatedModelAlignment(
  label: string,
  alignment: ShowcaseRacingTrackTopology["modelAlignment"] | ShowcasePlatformerPlayableSurfaceMap["modelAlignment"]
): readonly string[] {
  if (alignment.source === "asset-mesh-extracted") return [];
  const penalties: string[] = [];
  if (!isOverlayValidatedGeometrySource(alignment.source)) {
    penalties.push(`${label} model alignment source is not public-safe:${alignment.source}`);
  }
  if (!alignment.evidence.routeOverlay) {
    penalties.push(`${label} model alignment missing retained route overlay evidence`);
  }
  if (!alignment.anchorPairs || alignment.anchorPairs.length < 2) {
    penalties.push(`${label} model alignment needs at least two retained anchor pairs`);
  }
  return penalties;
}

function isOverlayValidatedGeometrySource(source: string): boolean {
  return source === "asset-mesh-extracted" || source === "manifest-authored-overlay-validated" || source === "compiler-authored-overlay-validated";
}
