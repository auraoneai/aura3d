import type {
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcasePlatformerSpec,
  ShowcaseRacingSpec,
  ShowcaseRacingTrackTopology,
  ShowcaseSpec
} from "./showcase-spec-types.js";
import {
  extractPlatformerPlayableSurfaceMapFromAsset,
  extractRacingTrackTopologyFromAsset
} from "./showcase-spec-game-geometry-extractor.js";

export interface ShowcaseGameTemplateArtifacts {
  readonly spec: ShowcaseSpec;
  readonly artifacts: Readonly<Record<string, unknown>>;
}

export interface ShowcaseGameTemplateEvidenceOptions {
  readonly projectDir?: string;
}

export interface RacingTemplatePlan {
  readonly width: number;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly checkpoints: readonly number[];
  readonly routeLength: number;
  readonly authoredLapSeconds: number;
  readonly topology: ShowcaseRacingTrackTopology;
  readonly extractionReasons: readonly string[];
  readonly extractionBlockers: readonly string[];
}

export interface PlatformerTemplatePlan {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly finish: { readonly x: number; readonly y: number };
  readonly moveSpeed: number;
  readonly jumpVelocity: number;
  readonly lowerBound: number;
  readonly platforms: readonly PlatformerSurface[];
  readonly collectibles: readonly { readonly id: string; readonly x: number; readonly y: number; readonly value: number }[];
  readonly hazards: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly respawn: true }[];
  readonly checkpoints: readonly { readonly id: string; readonly x: number; readonly y: number; readonly radius: number }[];
  readonly playableSurfaceMap: ShowcasePlatformerPlayableSurfaceMap;
  readonly extractionReasons: readonly string[];
  readonly extractionBlockers: readonly string[];
}

export interface PlatformerSurface {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly worldAsset: string;
  readonly evidenceRole: "playable-surface" | "bridge" | "finish-run";
}

export function applyGeneratedGameTemplateEvidence(
  spec: ShowcaseSpec,
  options: ShowcaseGameTemplateEvidenceOptions = {}
): ShowcaseGameTemplateArtifacts {
  if (spec.category === "game-racing" && spec.racing && !spec.racing.raceDesign.trackTopologyEvidence) {
    const evidencePath = `game-template/${spec.routeId}-racing-track-topology.json`;
    const racing: ShowcaseRacingSpec = {
      ...spec.racing,
      raceDesign: {
        ...spec.racing.raceDesign,
        trackTopologyEvidence: evidencePath
      }
    };
    const nextSpec: ShowcaseSpec = { ...spec, racing };
    return {
      spec: nextSpec,
      artifacts: {
        [evidencePath]: createRacingTrackTopologyEvidence(nextSpec, racing, options)
      }
    };
  }

  if (spec.category === "game-platformer" && spec.platformer && !spec.platformer.levelDesign.playableSurfaceEvidence) {
    const evidencePath = `game-template/${spec.routeId}-platformer-playable-surfaces.json`;
    const platformer: ShowcasePlatformerSpec = {
      ...spec.platformer,
      levelDesign: {
        ...spec.platformer.levelDesign,
        playableSurfaceEvidence: evidencePath
      }
    };
    const nextSpec: ShowcaseSpec = { ...spec, platformer };
    return {
      spec: nextSpec,
      artifacts: {
        [evidencePath]: createPlatformerPlayableSurfaceEvidence(nextSpec, platformer, options)
      }
    };
  }

  return { spec, artifacts: {} };
}

export function createRacingTemplatePlan(
  racing: ShowcaseRacingSpec,
  options: ShowcaseGameTemplateEvidenceOptions = {}
): RacingTemplatePlan {
  const extracted = extractRacingTrackTopologyFromAsset(racing.trackAsset, {
    projectDir: options.projectDir,
    renderedProbePath: racing.raceDesign.trackTopology?.evidence.renderedProbe,
    routeOverlayPath: racing.raceDesign.trackTopology?.evidence.routeOverlay
  });
  if (extracted.ok) {
    const topology = extracted.value;
    const points = topology.roadCenterline.map((point) => ({ x: point.x, y: point.z }));
    const routeLength = topology.lapLengthMeters ?? measureRouteLength(points);
    return {
      width: topology.roadCenterline.find((point) => point.width !== undefined)?.width ?? 0.18,
      points,
      checkpoints: topology.checkpoints.map((checkpoint) => checkpoint.progress),
      routeLength,
      authoredLapSeconds: topology.estimatedLapSeconds,
      topology,
      extractionReasons: extracted.reasons,
      extractionBlockers: []
    };
  }
  if (racing.raceDesign.trackTopology) {
    const topology = racing.raceDesign.trackTopology;
    const points = topology.roadCenterline.map((point) => ({ x: point.x, y: point.z }));
    const routeLength = topology.lapLengthMeters ?? measureRouteLength(points);
    return {
      width: topology.roadCenterline.find((point) => point.width !== undefined)?.width ?? 0.18,
      points,
      checkpoints: topology.checkpoints.map((checkpoint) => checkpoint.progress),
      routeLength,
      authoredLapSeconds: topology.estimatedLapSeconds,
      topology,
      extractionReasons: extracted.reasons,
      extractionBlockers: extracted.blockers
    };
  }
  const points = [
    { x: -1.72, y: 0.76 },
    { x: -1.28, y: 1.18 },
    { x: -0.42, y: 1.08 },
    { x: 0.14, y: 0.52 },
    { x: 0.02, y: -0.12 },
    { x: -0.72, y: -0.4 },
    { x: -1.12, y: -0.02 },
    { x: -0.68, y: 0.5 },
    { x: 0.18, y: 0.36 },
    { x: 0.92, y: 0.78 },
    { x: 1.54, y: 0.42 },
    { x: 1.32, y: -0.34 },
    { x: 0.58, y: -0.74 },
    { x: -0.26, y: -0.88 },
    { x: -1.18, y: -0.56 },
    { x: -1.74, y: 0.04 },
    { x: -1.72, y: 0.76 }
  ];
  const routeLength = measureRouteLength(points);
  const authoredLapSeconds = Math.max(racing.raceDesign.minLapSeconds, Math.round(routeLength / 0.11));
  const fallbackTopology: ShowcaseRacingTrackTopology = {
    assetId: racing.trackAsset,
    assetHash: "sha256-0000000000000000000000000000000000000000000000000000000000000000",
    source: "compiler-authored",
    roadCenterline: points.map((point) => ({ x: point.x, z: point.y, width: 0.18 })),
    checkpoints: createCheckpointProgresses(Math.max(6, racing.raceDesign.minCheckpoints)).map((progress) => ({ progress, width: 0.18 })),
    lapLengthMeters: Number(routeLength.toFixed(3)),
    estimatedLapSeconds: authoredLapSeconds,
    confidence: 0.35,
    modelAlignment: {
      source: "compiler-authored",
      modelBounds: { min: [-1, -0.05, -1], max: [1, 0.05, 1] },
      modelPoint: [0, -0.05, 0],
      gamePoint: { x: 0, z: 0 },
      evidence: {
        notes: "Diagnostic fallback alignment only; public racing output requires hash-bound mesh or overlay-validated model alignment."
      }
    },
    evidence: {
      sourceAsset: `assets.${racing.trackAsset}`,
      notes: "Compiler-authored fallback route. This is retained for diagnostics only and is not sufficient for public racing release without hash-bound track topology."
    }
  };
  return {
    width: 0.18,
    points,
    checkpoints: createCheckpointProgresses(Math.max(6, racing.raceDesign.minCheckpoints)),
    routeLength,
    authoredLapSeconds,
    topology: fallbackTopology,
    extractionReasons: extracted.reasons,
    extractionBlockers: extracted.blockers
  };
}

export function createPlatformerTemplatePlan(
  spec: ShowcaseSpec,
  platformer: ShowcasePlatformerSpec,
  options: ShowcaseGameTemplateEvidenceOptions = {}
): PlatformerTemplatePlan {
  const worldAsset = platformer.worldAssets[0] ?? "missing-world-asset";
  const extracted = extractPlatformerPlayableSurfaceMapFromAsset(worldAsset, {
    projectDir: options.projectDir,
    renderedProbePath: platformer.levelDesign.playableSurfaceMap?.evidence.renderedProbe,
    routeOverlayPath: platformer.levelDesign.playableSurfaceMap?.evidence.routeOverlay
  });
  if (extracted.ok) {
    return platformerPlanFromSurfaceMap(spec, platformer, extracted.value, extracted.reasons, []);
  }
  if (platformer.levelDesign.playableSurfaceMap) {
    const surfaceMap = platformer.levelDesign.playableSurfaceMap;
    return platformerPlanFromSurfaceMap(
      spec,
      platformer,
      surfaceMap,
      extracted.reasons,
      extracted.blockers
    );
  }
  const platforms: readonly PlatformerSurface[] = [
    { id: "start-plaza", x: -0.4, y: 0, width: 7.2, height: 0.34, worldAsset, evidenceRole: "playable-surface" },
    { id: "lower-bridge", x: 6.4, y: 0.18, width: 6.4, height: 0.34, worldAsset, evidenceRole: "bridge" },
    { id: "mid-run", x: 12.8, y: 0.42, width: 6.8, height: 0.34, worldAsset, evidenceRole: "playable-surface" },
    { id: "hazard-gap", x: 19.6, y: 0.14, width: 5.8, height: 0.34, worldAsset, evidenceRole: "bridge" },
    { id: "finish-ledges", x: 26.4, y: 0.36, width: 8.4, height: 0.34, worldAsset, evidenceRole: "finish-run" },
    { id: "final-platform", x: 34.4, y: 0.2, width: 5.6, height: 0.34, worldAsset, evidenceRole: "finish-run" }
  ];
  const fallbackMap: ShowcasePlatformerPlayableSurfaceMap = {
    assetId: worldAsset,
    assetHash: "sha256-0000000000000000000000000000000000000000000000000000000000000000",
    source: "compiler-authored",
    surfaces: [
      ...platforms.map((surface) => ({
        id: surface.id,
        x: Number((surface.x + surface.width / 2).toFixed(3)),
        y: surface.y,
        width: surface.width,
        height: surface.height,
        kind: surface.evidenceRole === "finish-run" ? "finish" as const : "platform" as const
      })),
      { id: "hazard-gap-01", x: 18.2, y: 0.52, width: 0.42, height: 0.24, kind: "hazard" as const },
      { id: "checkpoint-mid-run", x: 16.6, y: 1, width: 1.1, height: 1.1, kind: "checkpoint" as const }
    ],
    levelLength: 37.2,
    estimatedCompletionSeconds: 30,
    characterScaleRatio: 0.42,
    confidence: 0.35,
    modelAlignment: {
      source: "compiler-authored",
      modelBounds: { min: [-1, -0.05, -1], max: [1, 0.05, 1] },
      modelPoint: [0, -0.05, 0],
      gamePoint: { x: 18.2, y: 0 },
      evidence: {
        notes: "Diagnostic fallback alignment only; public platformer output requires hash-bound mesh or overlay-validated model alignment."
      }
    },
    evidence: {
      sourceAsset: `assets.${worldAsset}`,
      notes: "Compiler-authored fallback surfaces. This is retained for diagnostics only and is not sufficient for public platformer release without a hash-bound playable-surface map."
    }
  };
  return {
    id: `${spec.routeId}-authored-platformer-level`,
    start: { x: 0, y: 0.34 },
    finish: { x: 37.2, y: 0.54 },
    moveSpeed: 1.05,
    jumpVelocity: 7.4,
    lowerBound: -1.4,
    platforms,
    collectibles: [
      { id: "coin-01", x: 3.8, y: 1.0, value: 50 },
      { id: "coin-02", x: 9.6, y: 1.2, value: 50 },
      { id: "coin-03", x: 15.2, y: 1.42, value: 50 },
      { id: "coin-04", x: 22.8, y: 1.12, value: 50 },
      { id: "coin-05", x: 30.2, y: 1.32, value: 50 }
    ],
    hazards: [
      { id: "drone-01", x: 18.2, y: 0.52, width: 0.42, height: 0.24, respawn: true },
      { id: "drone-02", x: 27.4, y: 0.68, width: 0.42, height: 0.24, respawn: true }
    ],
    checkpoints: [
      { id: "checkpoint-start-run", x: 5.4, y: 0.62, radius: 1.1 },
      { id: "checkpoint-bridge", x: 10.4, y: 0.82, radius: 1.1 },
      { id: "checkpoint-mid-run", x: 16.6, y: 1.0, radius: 1.1 },
      { id: "checkpoint-hazard", x: 23.2, y: 0.8, radius: 1.1 },
      { id: "checkpoint-final", x: 31.4, y: 0.94, radius: 1.1 },
      { id: "checkpoint-finish", x: 36.4, y: 0.78, radius: 1.1 }
    ],
    playableSurfaceMap: fallbackMap,
    extractionReasons: extracted.reasons,
    extractionBlockers: extracted.blockers
  };
}

function platformerPlanFromSurfaceMap(
  spec: ShowcaseSpec,
  platformer: ShowcasePlatformerSpec,
  playableSurfaceMap: ShowcasePlatformerPlayableSurfaceMap,
  extractionReasons: readonly string[],
  extractionBlockers: readonly string[]
): PlatformerTemplatePlan {
  const playableSurfaces = playableSurfaceMap.surfaces.filter((surface) => surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving");
  const platforms: readonly PlatformerSurface[] = playableSurfaces.map((surface) => ({
    id: surface.id,
    x: Number((surface.x - surface.width / 2).toFixed(3)),
    y: surface.y,
    width: surface.width,
    height: surface.height,
    worldAsset: playableSurfaceMap.assetId,
    evidenceRole: surface.kind === "moving" ? "bridge" : "playable-surface"
  }));
  const checkpointSurfaces = playableSurfaceMap.surfaces.filter((surface) => surface.kind === "checkpoint");
  const hazardSurfaces = playableSurfaceMap.surfaces.filter((surface) => surface.kind === "hazard");
  const ground = playableSurfaces.find((surface) => surface.kind === "ground") ?? playableSurfaces[0];
  const finishSurface = playableSurfaceMap.surfaces.find((surface) => surface.kind === "finish") ?? playableSurfaces[playableSurfaces.length - 1];
  const start = ground
    ? { x: Number((ground.x - ground.width / 2 + 0.8).toFixed(3)), y: Number((ground.y + ground.height + 0.02).toFixed(3)) }
    : { x: 0, y: 0.34 };
  const finish = finishSurface
    ? { x: Number((finishSurface.x + finishSurface.width / 2).toFixed(3)), y: Number((finishSurface.y + finishSurface.height + 0.02).toFixed(3)) }
    : { x: playableSurfaceMap.levelLength, y: 0.54 };
  return {
    id: `${spec.routeId}-asset-bound-platformer-level`,
    start,
    finish,
    moveSpeed: Number((playableSurfaceMap.levelLength / playableSurfaceMap.estimatedCompletionSeconds).toFixed(3)),
    jumpVelocity: 7.4,
    lowerBound: -1.4,
    platforms,
    collectibles: [
      { id: "coin-01", x: Number((start.x + 3.2).toFixed(3)), y: Number((start.y + 0.7).toFixed(3)), value: 50 },
      { id: "coin-02", x: Number((start.x + 8.2).toFixed(3)), y: Number((start.y + 1.0).toFixed(3)), value: 50 },
      { id: "coin-03", x: Number((start.x + 14.8).toFixed(3)), y: Number((start.y + 1.2).toFixed(3)), value: 50 },
      { id: "coin-04", x: Number((Math.max(start.x + 20, finish.x - 8)).toFixed(3)), y: Number((finish.y + 0.8).toFixed(3)), value: 50 },
      { id: "coin-05", x: Number((Math.max(start.x + 24, finish.x - 3.2)).toFixed(3)), y: Number((finish.y + 1.0).toFixed(3)), value: 50 }
    ],
    hazards: hazardSurfaces.map((surface) => ({
      id: surface.id,
      x: Number((surface.x - surface.width / 2).toFixed(3)),
      y: surface.y,
      width: surface.width,
      height: surface.height,
      respawn: true as const
    })),
    checkpoints: checkpointSurfaces.map((surface) => ({
      id: surface.id,
      x: surface.x,
      y: surface.y,
      radius: Math.max(0.9, surface.width / 2)
    })),
    playableSurfaceMap,
    extractionReasons,
    extractionBlockers
  };
}

function createRacingTrackTopologyEvidence(
  spec: ShowcaseSpec,
  racing: ShowcaseRacingSpec,
  options: ShowcaseGameTemplateEvidenceOptions
): unknown {
  const plan = createRacingTemplatePlan(racing, options);
  const releaseSafeTopology = isReleaseSafeRacingTopology(racing.raceDesign.visibleTrackTopology);
  const failures = [
    ...(releaseSafeTopology ? [] : ["missing-release-safe-track-topology"]),
    ...plan.extractionBlockers,
    ...(isOverlayValidatedGeometrySource(plan.topology.source) ? [] : ["missing-overlay-validated-track-topology"]),
    ...(plan.topology.source !== "asset-mesh-extracted" && !hasRouteOverlayEvidence(plan.topology.evidence.routeOverlay)
      ? ["missing-track-topology-overlay-evidence"]
      : []),
    ...(plan.topology.assetHash.startsWith("sha256-000000") ? ["missing-track-asset-hash-binding"] : []),
    ...(plan.topology.confidence >= 0.65 ? [] : ["track-topology-confidence-too-low"]),
    ...(racing.raceDesign.routeAlignedToTrackAsset ? [] : ["route-not-aligned-to-track-asset"]),
    ...(racing.raceDesign.carTrackScaleCompatible ? [] : ["car-track-scale-incompatible"]),
    ...(racing.raceDesign.noDebugLocatorDisk ? [] : ["debug-locator-disk-present"]),
    ...(plan.authoredLapSeconds >= racing.raceDesign.minLapSeconds ? [] : ["lap-duration-too-short"]),
    ...(plan.checkpoints.length >= racing.raceDesign.minCheckpoints ? [] : ["too-few-checkpoints"])
  ];
  return {
    schema: "aura3d-racing-track-topology/1.0",
    routeId: spec.routeId,
    generatedBy: "showcase-spec-compiler",
    topologySource: racing.raceDesign.visibleTrackTopology,
    templateCapabilityStatus: releaseSafeTopology
      ? `${racing.raceDesign.visibleTrackTopology}-proven`
      : "blocked-missing-release-safe-track-topology",
    vehicleAsset: racing.vehicleAsset,
    trackAsset: racing.trackAsset,
    assetHash: plan.topology.assetHash,
    topology: plan.topology,
    meshExtraction: {
      status: createGeometryExtractionStatus(plan.topology.source, plan.extractionBlockers),
      reasons: plan.extractionReasons,
      blockers: plan.extractionBlockers
    },
    assetBinding: {
      kind: "aura-game-asset-bound-racing-route",
      layoutContractVersion: "1.0",
      generatedFrom: plan.topology.source === "asset-mesh-extracted" ? "mesh-derived-track-topology" : "hash-bound-track-topology",
      vehicleAsset: racing.vehicleAsset,
      trackAsset: racing.trackAsset,
      trackAssetHash: plan.topology.assetHash,
      topologySource: plan.topology.source,
      confidence: plan.topology.confidence,
      routeLength: Number(plan.routeLength.toFixed(3)),
      authoredLapSeconds: plan.authoredLapSeconds,
      pointCount: plan.points.length,
      checkpointCount: plan.checkpoints.length
    },
    route: {
      width: plan.width,
      routeLength: Number(plan.routeLength.toFixed(3)),
      points: plan.points,
      checkpoints: plan.checkpoints
    },
    minLapSeconds: racing.raceDesign.minLapSeconds,
    authoredLapSeconds: plan.authoredLapSeconds,
    minCheckpoints: racing.raceDesign.minCheckpoints,
    minLaps: racing.raceDesign.minLaps,
    routeAlignedToTrackAsset: racing.raceDesign.routeAlignedToTrackAsset,
    carTrackScaleCompatible: racing.raceDesign.carTrackScaleCompatible,
    noDebugLocatorDisk: racing.raceDesign.noDebugLocatorDisk,
    pass: failures.length === 0,
    failures
  };
}

function createPlatformerPlayableSurfaceEvidence(
  spec: ShowcaseSpec,
  platformer: ShowcasePlatformerSpec,
  options: ShowcaseGameTemplateEvidenceOptions
): unknown {
  const plan = createPlatformerTemplatePlan(spec, platformer, options);
  const releaseSafeSurfaceSource = isReleaseSafePlatformerSurfaceSource(platformer.levelDesign.playableSurfaceSource);
  const failures = [
    ...(releaseSafeSurfaceSource ? [] : ["missing-release-safe-playable-surfaces"]),
    ...plan.extractionBlockers,
    ...(isOverlayValidatedGeometrySource(plan.playableSurfaceMap.source) ? [] : ["missing-overlay-validated-playable-surface-map"]),
    ...(plan.playableSurfaceMap.source !== "asset-mesh-extracted" && !hasRouteOverlayEvidence(plan.playableSurfaceMap.evidence.routeOverlay)
      ? ["missing-playable-surface-overlay-evidence"]
      : []),
    ...(plan.playableSurfaceMap.assetHash.startsWith("sha256-000000") ? ["missing-world-asset-hash-binding"] : []),
    ...(plan.playableSurfaceMap.confidence >= 0.65 ? [] : ["playable-surface-confidence-too-low"]),
    ...(platformer.levelDesign.playableSurfaceLayoutValidated ? [] : ["playable-surface-layout-not-validated"]),
    ...(platformer.levelDesign.characterWorldScaleCompatible ? [] : ["character-world-scale-incompatible"]),
    ...(platformer.levelDesign.styleCompatible ? [] : ["style-incompatible"]),
    ...(platformer.levelDesign.primitivePrimaryWorldRejected ? [] : ["primitive-primary-world-not-rejected"]),
    ...(plan.checkpoints.length >= platformer.levelDesign.minCheckpoints ? [] : ["too-few-checkpoints"]),
    ...(platformer.levelDesign.requiresHazardRespawn && plan.hazards.length === 0 ? ["missing-hazard-respawn"] : []),
    ...(platformer.levelDesign.requiresFinish && plan.finish.x <= plan.start.x ? ["missing-finish-progression"] : [])
  ];
  return {
    schema: "aura3d-platformer-playable-surfaces/1.0",
    routeId: spec.routeId,
    generatedBy: "showcase-spec-compiler",
    surfaceSource: platformer.levelDesign.playableSurfaceSource,
    templateCapabilityStatus: releaseSafeSurfaceSource
      ? `${platformer.levelDesign.playableSurfaceSource}-proven`
      : "blocked-missing-release-safe-playable-surfaces",
    characterAsset: platformer.characterAsset,
    worldAssets: platformer.worldAssets,
    assetHash: plan.playableSurfaceMap.assetHash,
    surfaceMap: plan.playableSurfaceMap,
    meshExtraction: {
      status: createGeometryExtractionStatus(plan.playableSurfaceMap.source, plan.extractionBlockers),
      reasons: plan.extractionReasons,
      blockers: plan.extractionBlockers
    },
    assetBindings: platformer.worldAssets.map((worldAsset) => ({
      kind: "aura-game-asset-bound-platformer-level",
      layoutContractVersion: "1.0",
      generatedFrom: plan.playableSurfaceMap.source === "asset-mesh-extracted" ? "mesh-derived-playable-surface-map" : "hash-bound-playable-surface-map",
      characterAsset: platformer.characterAsset,
      worldAsset,
      worldAssetHash: worldAsset === plan.playableSurfaceMap.assetId ? plan.playableSurfaceMap.assetHash : undefined,
      surfaceSource: plan.playableSurfaceMap.source,
      confidence: plan.playableSurfaceMap.confidence,
      surfaceIds: plan.platforms
        .filter((surface) => surface.worldAsset === worldAsset)
        .map((surface) => surface.id)
    })),
    authoredPlayableSeconds: platformer.levelDesign.minPlayableSeconds,
    minPlayableSeconds: platformer.levelDesign.minPlayableSeconds,
    start: plan.start,
    finish: plan.finish,
    surfaces: plan.platforms,
    checkpoints: plan.checkpoints,
    hazards: plan.hazards,
    styleCompatible: platformer.levelDesign.styleCompatible,
    scaleCompatible: platformer.levelDesign.characterWorldScaleCompatible,
    primitivePrimaryWorldRejected: platformer.levelDesign.primitivePrimaryWorldRejected,
    pass: failures.length === 0,
    failures
  };
}

function createCheckpointProgresses(count: number): readonly number[] {
  return Array.from({ length: count }, (_unused, index) => Number(((index + 1) / count).toFixed(3)));
}

function isReleaseSafeRacingTopology(source: string): boolean {
  return source === "asset-bound-road-topology" || source === "mesh-road-topology";
}

function isReleaseSafePlatformerSurfaceSource(source: string): boolean {
  return source === "asset-bound-playable-surfaces" || source === "asset-derived-playable-surfaces";
}

function isOverlayValidatedGeometrySource(source: string): boolean {
  return source === "asset-mesh-extracted" || source === "manifest-authored-overlay-validated" || source === "compiler-authored-overlay-validated";
}

function createGeometryExtractionStatus(source: string, blockers: readonly string[]): "pass" | "overlay-validated" | "fail" {
  if (source === "asset-mesh-extracted") return blockers.length === 0 ? "pass" : "fail";
  if (isOverlayValidatedGeometrySource(source)) return blockers.length === 0 ? "overlay-validated" : "fail";
  return "fail";
}

function hasRouteOverlayEvidence(routeOverlay: string | undefined): boolean {
  return typeof routeOverlay === "string" && routeOverlay.length > 0;
}

function measureRouteLength(points: readonly { readonly x: number; readonly y: number }[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current) total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
}
