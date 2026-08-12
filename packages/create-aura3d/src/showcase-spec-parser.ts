import type {
  ShowcaseCategoryPlan,
  ShowcaseGameAssetPairEvidence,
  ShowcaseGameGeometryEvidence,
  ShowcaseGameGeometryEvidenceAsset,
  ShowcaseGeometryEvidenceRef,
  ShowcaseGeometryEvidenceSource,
  ShowcaseGeometryModelBounds,
  ShowcasePlatformerSurfaceModelAlignment,
  ShowcasePlatformerPlayableSurface,
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcasePlatformerGameplayRequirement,
  ShowcasePlatformerPlayableSurfaceSource,
  ShowcasePlatformerSpec,
  ShowcaseRacingGameplayRequirement,
  ShowcaseRacingTopologyModelAlignment,
  ShowcaseRacingTrackTopology,
  ShowcaseRacingTrackTopologyCheckpoint,
  ShowcaseRacingTrackTopologyPoint,
  ShowcaseRacingSpec,
  ShowcaseSpec,
  ShowcaseSpecAsset,
  ShowcaseSpecAssetPolicy,
  ShowcaseSpecCapability
} from "./showcase-spec-types.js";

export function parseShowcaseSpec(input: unknown): ShowcaseSpec {
  if (!isRecord(input)) throw new Error("showcase spec must be a JSON object");
  const routeId = readString(input, "routeId");
  if (!/^showcase-[a-z0-9-]+$/.test(routeId)) throw new Error(`routeId must match showcase-[a-z0-9-]+: ${routeId}`);
  const path = readString(input, "path");
  if (path !== `/apps/${routeId}/`) throw new Error(`path must be /apps/${routeId}/`);
  const layout = readRecord(input, "layout");
  const primaryAssets = readArray(input, "primaryAssets").map(parseAsset);
  const evidence = readRecord(input, "evidence");
  const platformer = parseOptionalPlatformer(input);
  const racing = parseOptionalRacing(input);
  const categoryPlan = parseOptionalCategoryPlan(input);
  const spec: ShowcaseSpec = {
    schema: readLiteral(input, "schema", "aura3d-showcase-spec/1.0"),
    routeId,
    label: readString(input, "label"),
    category: readString(input, "category"),
    path,
    globalName: readIdentifier(input, "globalName"),
    claimLabel: readEnum(input, "claimLabel", ["createAuraApp", "prototype", "roadmap"]),
    publicStatus: readEnum(input, "publicStatus", ["release-ready candidate", "prototype-blocked", "internal-diagnostic", "removed-from-public-showcase"]),
    layout: {
      heroAsset: readString(layout, "heroAsset"),
      uiPlacement: readEnum(layout, "uiPlacement", ["left-panel", "right-panel", "bottom-bar", "none"])
    },
    ...(platformer ? { platformer } : {}),
    ...(racing ? { racing } : {}),
    ...(categoryPlan ? { categoryPlan } : {}),
    primaryAssets,
    evidence: {
      routePrimaryProbe: readString(evidence, "routePrimaryProbe"),
      routePrimaryScreenshot: readString(evidence, "routePrimaryScreenshot"),
      deployCommand: readString(evidence, "deployCommand"),
      ...optionalString(evidence, "deployEvidence"),
      deployPassed: readBoolean(evidence, "deployPassed"),
      routePrimaryPassed: readBoolean(evidence, "routePrimaryPassed"),
      ...optionalString(evidence, "gameplayProof"),
      ...optionalBoolean(evidence, "gameplayPassed"),
      ...optionalBoolean(evidence, "visualReviewPassed"),
      ...optionalString(evidence, "assetPairCompositionReport"),
      ...optionalStringRecord(evidence, "releaseAssetProbes")
    },
    capabilities: readArray(input, "capabilities").map(parseCapability)
  };
  if (!spec.primaryAssets.some((asset) => asset.id === spec.layout.heroAsset)) throw new Error("layout.heroAsset must reference a primary asset");
  validatePlatformerSpec(spec);
  validateRacingSpec(spec);
  validateCategoryPlan(spec);
  return spec;
}

function parseAsset(value: unknown): ShowcaseSpecAsset {
  if (!isRecord(value)) throw new Error("primary asset must be a JSON object");
  return {
    id: readAssetId(value, "id"),
    role: readString(value, "role"),
    typedRef: readTypedRef(value),
    quality: readEnum(value, "quality", ["release", "candidate", "prototype"]),
    hasDurableProvenance: readBoolean(value, "hasDurableProvenance"),
    hasRenderedProbe: readBoolean(value, "hasRenderedProbe"),
    hasOrientationEvidence: readBoolean(value, "hasOrientationEvidence"),
    hasForegroundBounds: readBoolean(value, "hasForegroundBounds"),
    ...parseOptionalAssetPolicy(value)
  };
}

function parseOptionalAssetPolicy(record: Readonly<Record<string, unknown>>): Record<"assetPolicy", ShowcaseSpecAssetPolicy> | Record<string, never> {
  const policy = record.assetPolicy;
  if (policy === undefined) return {};
  if (!isRecord(policy)) throw new Error("assetPolicy must be an object");
  return {
    assetPolicy: {
      allowReplacement: readBoolean(policy, "allowReplacement"),
      ...optionalString(policy, "replacementQuery"),
      ...optionalEnum(policy, "requiredRole", ["architecture", "building", "character", "data-station", "effect-core", "environment", "facility", "industrial", "level", "platformer-world", "stage", "track", "vehicle", "world"]),
      ...optionalEnum(policy, "minQuality", ["candidate", "release"]),
      ...optionalBoolean(policy, "requireRenderedProbe"),
      ...optionalBoolean(policy, "requireDeployPass")
    }
  };
}

function parseOptionalCategoryPlan(input: Readonly<Record<string, unknown>>): ShowcaseCategoryPlan | undefined {
  if (!("categoryPlan" in input)) return undefined;
  const categoryPlan = readRecord(input, "categoryPlan");
  const layoutConstraints = readRecord(categoryPlan, "layoutConstraints");
  const claims = readRecord(categoryPlan, "claims");
  return {
    kind: readEnum(categoryPlan, "kind", ["architecture-environment", "industrial-digital-twin", "particle-diagnostic", "data-diagnostic"]),
    primaryAsset: readAssetId(categoryPlan, "primaryAsset"),
    cameraIntent: readEnum(categoryPlan, "cameraIntent", ["architecture-hero", "industrial-overview", "diagnostic-core", "data-observatory"]),
    ...optionalEnum(categoryPlan, "backendClaim", ["webgl-particle", "native-webgpu", "fallback"]),
    layoutConstraints: {
      keepHeroReadable: readBoolean(layoutConstraints, "keepHeroReadable"),
      uiAvoidsEvidenceArea: readBoolean(layoutConstraints, "uiAvoidsEvidenceArea")
    },
    claims: {
      allowed: readArray(claims, "allowed").map((value) => readStringValue(value, "categoryPlan.claims.allowed")),
      notAllowed: readArray(claims, "notAllowed").map((value) => readStringValue(value, "categoryPlan.claims.notAllowed"))
    }
  };
}

function parseCapability(value: unknown): ShowcaseSpecCapability {
  if (!isRecord(value)) throw new Error("capability must be a JSON object");
  return {
    name: readString(value, "name"),
    status: readEnum(value, "status", ["root-proven", "partial", "internal-only", "roadmap", "unsupported"]),
    ...optionalString(value, "evidence")
  };
}

function parseOptionalPlatformer(input: Readonly<Record<string, unknown>>): ShowcasePlatformerSpec | undefined {
  if (input.category !== "game-platformer" && !("platformer" in input)) return undefined;
  const platformer = readRecord(input, "platformer");
  const layoutConstraints = readRecord(platformer, "layoutConstraints");
  const levelDesign = readRecord(platformer, "levelDesign");
  const releaseAssetRequirements = readRecord(platformer, "releaseAssetRequirements");
  return {
    characterAsset: readAssetId(platformer, "characterAsset"),
    worldAssets: readArray(platformer, "worldAssets").map((value) => readAssetIdValue(value, "platformer.worldAssets")),
    cameraIntent: readEnum(platformer, "cameraIntent", ["side-scroller"]),
    layoutConstraints: {
      keepCharacterReadable: readBoolean(layoutConstraints, "keepCharacterReadable"),
      uiAvoidsEvidenceArea: readBoolean(layoutConstraints, "uiAvoidsEvidenceArea")
    },
    gameplayRequirements: readArray(platformer, "gameplayRequirements").map(parseGameplayRequirement),
    levelDesign: {
      minPlayableSeconds: readPositiveNumber(levelDesign, "minPlayableSeconds"),
      minCheckpoints: readPositiveInteger(levelDesign, "minCheckpoints"),
      requiresHazardRespawn: readBoolean(levelDesign, "requiresHazardRespawn"),
      requiresFinish: readBoolean(levelDesign, "requiresFinish"),
      authoredLevelFlow: readBoolean(levelDesign, "authoredLevelFlow"),
      playableSurfaceSource: parsePlayableSurfaceSource(levelDesign.playableSurfaceSource),
      playableSurfaceLayoutValidated: readBoolean(levelDesign, "playableSurfaceLayoutValidated"),
      ...optionalString(levelDesign, "playableSurfaceEvidence"),
      ...parseOptionalPlayableSurfaceMap(levelDesign),
      ...parseOptionalGameAssetPairEvidence(levelDesign),
      characterWorldScaleCompatible: readBoolean(levelDesign, "characterWorldScaleCompatible"),
      styleCompatible: readBoolean(levelDesign, "styleCompatible"),
      primitivePrimaryWorldRejected: readBoolean(levelDesign, "primitivePrimaryWorldRejected")
    },
    releaseAssetRequirements: {
      characterRole: readEnum(releaseAssetRequirements, "characterRole", ["character"]),
      worldRoles: readArray(releaseAssetRequirements, "worldRoles").map((value) => readEnumValue(value, "platformer.releaseAssetRequirements.worldRoles", ["level", "world", "stage"])),
      requiresOrientationEvidence: readBoolean(releaseAssetRequirements, "requiresOrientationEvidence"),
      requiresScaleNormalizationEvidence: readBoolean(releaseAssetRequirements, "requiresScaleNormalizationEvidence"),
      requiresRenderedProbe: readBoolean(releaseAssetRequirements, "requiresRenderedProbe"),
      requiresDurableProvenance: readBoolean(releaseAssetRequirements, "requiresDurableProvenance"),
      requiresSuitabilityReason: readBoolean(releaseAssetRequirements, "requiresSuitabilityReason")
    }
  };
}

function parseGameplayRequirement(value: unknown): ShowcasePlatformerGameplayRequirement {
  return readEnumValue(value, "platformer.gameplayRequirements", ["movement", "jump", "checkpoint", "progression"]);
}

function parsePlayableSurfaceSource(value: unknown): ShowcasePlatformerPlayableSurfaceSource {
  return readEnumValue(value, "platformer.levelDesign.playableSurfaceSource", [
    "asset-bound-playable-surfaces",
    "asset-derived-playable-surfaces",
    "authored-route-rectangles"
  ]);
}

function parseOptionalRacing(input: Readonly<Record<string, unknown>>): ShowcaseRacingSpec | undefined {
  if (input.category !== "game-racing" && !("racing" in input)) return undefined;
  const racing = readRecord(input, "racing");
  const layoutConstraints = readRecord(racing, "layoutConstraints");
  const raceDesign = readRecord(racing, "raceDesign");
  const releaseAssetRequirements = readRecord(racing, "releaseAssetRequirements");
  return {
    vehicleAsset: readAssetId(racing, "vehicleAsset"),
    trackAsset: readAssetId(racing, "trackAsset"),
    cameraIntent: readEnum(racing, "cameraIntent", ["track-overview"]),
    layoutConstraints: {
      keepVehicleReadable: readBoolean(layoutConstraints, "keepVehicleReadable"),
      keepTrackReadable: readBoolean(layoutConstraints, "keepTrackReadable"),
      uiAvoidsEvidenceArea: readBoolean(layoutConstraints, "uiAvoidsEvidenceArea")
    },
    gameplayRequirements: readArray(racing, "gameplayRequirements").map(parseRacingGameplayRequirement),
    raceDesign: {
      minCheckpoints: readPositiveInteger(raceDesign, "minCheckpoints"),
      minLaps: readPositiveInteger(raceDesign, "minLaps"),
      minLapSeconds: readPositiveNumber(raceDesign, "minLapSeconds"),
      routeAlignedToTrackAsset: readBoolean(raceDesign, "routeAlignedToTrackAsset"),
      visibleTrackTopology: readEnum(raceDesign, "visibleTrackTopology", [
        "asset-bound-road-topology",
        "authored-route-over-visible-track",
        "mesh-road-topology"
      ]),
      ...optionalString(raceDesign, "trackTopologyEvidence"),
      ...parseOptionalRacingTrackTopology(raceDesign),
      ...parseOptionalGameAssetPairEvidence(raceDesign),
      carTrackScaleCompatible: readBoolean(raceDesign, "carTrackScaleCompatible"),
      noDebugLocatorDisk: readBoolean(raceDesign, "noDebugLocatorDisk")
    },
    releaseAssetRequirements: {
      vehicleRole: readEnum(releaseAssetRequirements, "vehicleRole", ["vehicle"]),
      trackRole: readEnum(releaseAssetRequirements, "trackRole", ["track"]),
      requiresOrientationEvidence: readBoolean(releaseAssetRequirements, "requiresOrientationEvidence"),
      requiresScaleNormalizationEvidence: readBoolean(releaseAssetRequirements, "requiresScaleNormalizationEvidence"),
      requiresRenderedProbe: readBoolean(releaseAssetRequirements, "requiresRenderedProbe"),
      requiresDurableProvenance: readBoolean(releaseAssetRequirements, "requiresDurableProvenance"),
      requiresSuitabilityReason: readBoolean(releaseAssetRequirements, "requiresSuitabilityReason")
    }
  };
}

function parseRacingGameplayRequirement(value: unknown): ShowcaseRacingGameplayRequirement {
  return readEnumValue(value, "racing.gameplayRequirements", ["throttle", "steering", "reset", "checkpoint", "lap", "multi-lap"]);
}

function validatePlatformerSpec(spec: ShowcaseSpec): void {
  if (spec.category !== "game-platformer") return;
  if (!spec.platformer) throw new Error("platformer must be present for game-platformer specs");
  const assetIds = new Set(spec.primaryAssets.map((asset) => asset.id));
  if (!assetIds.has(spec.platformer.characterAsset)) throw new Error("platformer.characterAsset must reference a primary asset");
  if (spec.platformer.characterAsset !== spec.layout.heroAsset) throw new Error("platformer.characterAsset must match layout.heroAsset");
  if (spec.platformer.worldAssets.length === 0) throw new Error("platformer.worldAssets must contain at least one world or stage asset");
  for (const assetId of spec.platformer.worldAssets) {
    if (!assetIds.has(assetId)) throw new Error(`platformer.worldAssets must reference primary assets: ${assetId}`);
  }
  const playableSurfaceMap = spec.platformer.levelDesign.playableSurfaceMap;
  if (playableSurfaceMap) {
    if (!spec.platformer.worldAssets.includes(playableSurfaceMap.assetId)) {
      throw new Error("platformer.levelDesign.playableSurfaceMap.assetId must reference a platformer world asset");
    }
    if (playableSurfaceMap.surfaces.length < 5) {
      throw new Error("platformer.levelDesign.playableSurfaceMap.surfaces must contain at least 5 surfaces");
    }
  }
  const assetPairEvidence = spec.platformer.levelDesign.assetPairEvidence;
  if (assetPairEvidence) {
    if (assetPairEvidence.category !== "platformer") {
      throw new Error("platformer.levelDesign.assetPairEvidence.category must be platformer");
    }
    validateAssetPairEvidenceAssets(
      assetPairEvidence.assets,
      [spec.platformer.characterAsset, ...spec.platformer.worldAssets],
      "platformer.levelDesign.assetPairEvidence.assets"
    );
  }
  if (!spec.platformer.gameplayRequirements.includes("movement")) throw new Error("platformer.gameplayRequirements must include movement");
  if (!spec.platformer.gameplayRequirements.includes("jump")) throw new Error("platformer.gameplayRequirements must include jump");
  if (!spec.platformer.gameplayRequirements.includes("checkpoint") && !spec.platformer.gameplayRequirements.includes("progression")) {
    throw new Error("platformer.gameplayRequirements must include checkpoint or progression");
  }
}

function validateRacingSpec(spec: ShowcaseSpec): void {
  if (spec.category !== "game-racing") return;
  if (!spec.racing) throw new Error("racing must be present for game-racing specs");
  const assetIds = new Set(spec.primaryAssets.map((asset) => asset.id));
  if (!assetIds.has(spec.racing.vehicleAsset)) throw new Error("racing.vehicleAsset must reference a primary asset");
  if (!assetIds.has(spec.racing.trackAsset)) throw new Error("racing.trackAsset must reference a primary asset");
  if (spec.racing.vehicleAsset !== spec.layout.heroAsset) throw new Error("racing.vehicleAsset must match layout.heroAsset");
  if (spec.racing.vehicleAsset === spec.racing.trackAsset) throw new Error("racing.vehicleAsset and racing.trackAsset must be different assets");
  const trackTopology = spec.racing.raceDesign.trackTopology;
  if (trackTopology) {
    if (trackTopology.assetId !== spec.racing.trackAsset) {
      throw new Error("racing.raceDesign.trackTopology.assetId must match racing.trackAsset");
    }
    if (trackTopology.roadCenterline.length < 8) {
      throw new Error("racing.raceDesign.trackTopology.roadCenterline must contain at least 8 points");
    }
    if (trackTopology.checkpoints.length < spec.racing.raceDesign.minCheckpoints) {
      throw new Error("racing.raceDesign.trackTopology.checkpoints must cover minCheckpoints");
    }
  }
  const assetPairEvidence = spec.racing.raceDesign.assetPairEvidence;
  if (assetPairEvidence) {
    if (assetPairEvidence.category !== "racing") {
      throw new Error("racing.raceDesign.assetPairEvidence.category must be racing");
    }
    validateAssetPairEvidenceAssets(
      assetPairEvidence.assets,
      spec.primaryAssets.map((asset) => asset.id),
      "racing.raceDesign.assetPairEvidence.assets"
    );
  }
  if (!spec.racing.gameplayRequirements.includes("throttle")) throw new Error("racing.gameplayRequirements must include throttle");
  if (!spec.racing.gameplayRequirements.includes("steering")) throw new Error("racing.gameplayRequirements must include steering");
  if (!spec.racing.gameplayRequirements.includes("reset")) throw new Error("racing.gameplayRequirements must include reset");
  if (!spec.racing.gameplayRequirements.includes("checkpoint") && !spec.racing.gameplayRequirements.includes("lap")) {
    throw new Error("racing.gameplayRequirements must include checkpoint or lap");
  }
}

function validateCategoryPlan(spec: ShowcaseSpec): void {
  if (!spec.categoryPlan) return;
  if (spec.categoryPlan.kind !== spec.category) throw new Error("categoryPlan.kind must match category");
  if (spec.categoryPlan.primaryAsset !== spec.layout.heroAsset) throw new Error("categoryPlan.primaryAsset must match layout.heroAsset");
  const assetIds = new Set(spec.primaryAssets.map((asset) => asset.id));
  if (!assetIds.has(spec.categoryPlan.primaryAsset)) throw new Error("categoryPlan.primaryAsset must reference a primary asset");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(record: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`${key} must be an object`);
  return value;
}

function readArray(record: Readonly<Record<string, unknown>>, key: string): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string`);
  return value;
}

function readIdentifier(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = readString(record, key);
  if (!/^__AURA3D_[A-Z0-9_]+__$/.test(value)) {
    throw new Error(`${key} must be an Aura3D evidence global like __AURA3D_ROUTE_NAME__`);
  }
  return value;
}

function readAssetId(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = readString(record, key);
  return readAssetIdValue(value, key);
}

function readAssetIdValue(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string`);
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error(`asset id must be a valid typed asset key: ${value}`);
  return value;
}

function readStringValue(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must contain non-empty strings`);
  return value;
}

function readPositiveInteger(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = readPositiveNumber(record, key);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

function readPositiveNumber(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive number`);
  return value;
}

function parseOptionalRacingTrackTopology(record: Readonly<Record<string, unknown>>): Record<"trackTopology", ShowcaseRacingTrackTopology> | Record<string, never> {
  const topology = record.trackTopology;
  if (topology === undefined) return {};
  if (!isRecord(topology)) throw new Error("trackTopology must be an object");
  return { trackTopology: parseRacingTrackTopology(topology) };
}

function parseRacingTrackTopology(topology: Readonly<Record<string, unknown>>): ShowcaseRacingTrackTopology {
  return {
    assetId: readAssetId(topology, "assetId"),
    assetHash: readSha256(topology, "assetHash"),
    source: parseGeometryEvidenceSource(topology.source),
    roadCenterline: readArray(topology, "roadCenterline").map(parseRacingTopologyPoint),
    checkpoints: readArray(topology, "checkpoints").map(parseRacingTopologyCheckpoint),
    ...optionalPositiveNumber(topology, "lapLengthMeters"),
    estimatedLapSeconds: readPositiveNumber(topology, "estimatedLapSeconds"),
    confidence: readUnitNumber(topology, "confidence"),
    modelAlignment: parseRacingTopologyModelAlignment(readRecord(topology, "modelAlignment")),
    evidence: parseGeometryEvidenceRef(readRecord(topology, "evidence"))
  };
}

function parseRacingTopologyPoint(value: unknown): ShowcaseRacingTrackTopologyPoint {
  if (!isRecord(value)) throw new Error("racing.raceDesign.trackTopology.roadCenterline must contain objects");
  return {
    x: readFiniteNumber(value, "x"),
    z: readFiniteNumber(value, "z"),
    ...optionalPositiveNumber(value, "width")
  };
}

function parseRacingTopologyCheckpoint(value: unknown): ShowcaseRacingTrackTopologyCheckpoint {
  if (!isRecord(value)) throw new Error("racing.raceDesign.trackTopology.checkpoints must contain objects");
  return {
    progress: readProgress(value, "progress"),
    width: readPositiveNumber(value, "width")
  };
}

function parseOptionalPlayableSurfaceMap(record: Readonly<Record<string, unknown>>): Record<"playableSurfaceMap", ShowcasePlatformerPlayableSurfaceMap> | Record<string, never> {
  const playableSurfaceMap = record.playableSurfaceMap;
  if (playableSurfaceMap === undefined) return {};
  if (!isRecord(playableSurfaceMap)) throw new Error("playableSurfaceMap must be an object");
  return { playableSurfaceMap: parsePlayableSurfaceMap(playableSurfaceMap) };
}

function parsePlayableSurfaceMap(map: Readonly<Record<string, unknown>>): ShowcasePlatformerPlayableSurfaceMap {
  return {
    assetId: readAssetId(map, "assetId"),
    assetHash: readSha256(map, "assetHash"),
    source: parseGeometryEvidenceSource(map.source),
    surfaces: readArray(map, "surfaces").map(parsePlayableSurface),
    levelLength: readPositiveNumber(map, "levelLength"),
    estimatedCompletionSeconds: readPositiveNumber(map, "estimatedCompletionSeconds"),
    characterScaleRatio: readPositiveNumber(map, "characterScaleRatio"),
    confidence: readUnitNumber(map, "confidence"),
    modelAlignment: parsePlatformerSurfaceModelAlignment(readRecord(map, "modelAlignment")),
    evidence: parseGeometryEvidenceRef(readRecord(map, "evidence"))
  };
}

function parsePlayableSurface(value: unknown): ShowcasePlatformerPlayableSurface {
  if (!isRecord(value)) throw new Error("platformer.levelDesign.playableSurfaceMap.surfaces must contain objects");
  return {
    id: readString(value, "id"),
    x: readFiniteNumber(value, "x"),
    y: readFiniteNumber(value, "y"),
    width: readPositiveNumber(value, "width"),
    height: readPositiveNumber(value, "height"),
    kind: readEnum(value, "kind", ["ground", "platform", "moving", "hazard", "checkpoint", "finish"])
  };
}

function parseGeometryEvidenceRef(value: Readonly<Record<string, unknown>>): ShowcaseGeometryEvidenceRef {
  return {
    sourceAsset: readString(value, "sourceAsset"),
    ...optionalString(value, "renderedProbe"),
    ...optionalString(value, "routeOverlay"),
    notes: readString(value, "notes")
  };
}

function parseGeometryModelBounds(value: Readonly<Record<string, unknown>>): ShowcaseGeometryModelBounds {
  return {
    min: readVec3(value, "min"),
    max: readVec3(value, "max")
  };
}

function parseRacingTopologyModelAlignment(value: Readonly<Record<string, unknown>>): ShowcaseRacingTopologyModelAlignment {
  const gamePoint = readRecord(value, "gamePoint");
  return {
    source: parseGeometryEvidenceSource(value.source),
    modelBounds: parseGeometryModelBounds(readRecord(value, "modelBounds")),
    modelPoint: readVec3(value, "modelPoint"),
    gamePoint: {
      x: readFiniteNumber(gamePoint, "x"),
      z: readFiniteNumber(gamePoint, "z")
    },
    ...parseOptionalRacingModelAnchorPairs(value),
    evidence: parseModelAlignmentEvidence(readRecord(value, "evidence"))
  };
}

function parsePlatformerSurfaceModelAlignment(value: Readonly<Record<string, unknown>>): ShowcasePlatformerSurfaceModelAlignment {
  const gamePoint = readRecord(value, "gamePoint");
  return {
    source: parseGeometryEvidenceSource(value.source),
    modelBounds: parseGeometryModelBounds(readRecord(value, "modelBounds")),
    modelPoint: readVec3(value, "modelPoint"),
    gamePoint: {
      x: readFiniteNumber(gamePoint, "x"),
      y: readFiniteNumber(gamePoint, "y")
    },
    ...parseOptionalPlatformerModelAnchorPairs(value),
    evidence: parseModelAlignmentEvidence(readRecord(value, "evidence"))
  };
}

function parseOptionalRacingModelAnchorPairs(value: Readonly<Record<string, unknown>>): Record<"anchorPairs", ShowcaseRacingTopologyModelAlignment["anchorPairs"]> | Record<string, never> {
  const anchors = value.anchorPairs;
  if (anchors === undefined) return {};
  return {
    anchorPairs: readArray(value, "anchorPairs").map((entry) => {
      if (!isRecord(entry)) throw new Error("modelAlignment.anchorPairs must contain objects");
      const gamePoint = readRecord(entry, "gamePoint");
      return {
        id: readString(entry, "id"),
        modelPoint: readVec3(entry, "modelPoint"),
        gamePoint: {
          x: readFiniteNumber(gamePoint, "x"),
          z: readFiniteNumber(gamePoint, "z")
        }
      };
    })
  };
}

function parseOptionalPlatformerModelAnchorPairs(value: Readonly<Record<string, unknown>>): Record<"anchorPairs", ShowcasePlatformerSurfaceModelAlignment["anchorPairs"]> | Record<string, never> {
  const anchors = value.anchorPairs;
  if (anchors === undefined) return {};
  return {
    anchorPairs: readArray(value, "anchorPairs").map((entry) => {
      if (!isRecord(entry)) throw new Error("modelAlignment.anchorPairs must contain objects");
      const gamePoint = readRecord(entry, "gamePoint");
      return {
        id: readString(entry, "id"),
        modelPoint: readVec3(entry, "modelPoint"),
        gamePoint: {
          x: readFiniteNumber(gamePoint, "x"),
          y: readFiniteNumber(gamePoint, "y")
        }
      };
    })
  };
}

function parseModelAlignmentEvidence(value: Readonly<Record<string, unknown>>): { readonly routeOverlay?: string; readonly notes: string } {
  return {
    ...optionalString(value, "routeOverlay"),
    notes: readString(value, "notes")
  };
}

function parseOptionalGameAssetPairEvidence(record: Readonly<Record<string, unknown>>): Record<"assetPairEvidence", ShowcaseGameAssetPairEvidence> | Record<string, never> {
  const evidence = record.assetPairEvidence;
  if (evidence === undefined) return {};
  if (!isRecord(evidence)) throw new Error("assetPairEvidence must be an object");
  return { assetPairEvidence: parseGameAssetPairEvidence(evidence) };
}

function parseGameAssetPairEvidence(evidence: Readonly<Record<string, unknown>>): ShowcaseGameAssetPairEvidence {
  return {
    category: readEnum(evidence, "category", ["racing", "platformer"]),
    assets: readArray(evidence, "assets").map((value) => readAssetIdValue(value, "assetPairEvidence.assets")),
    screenshotEvidence: readString(evidence, "screenshotEvidence"),
    ...optionalString(evidence, "routePrimaryProbe"),
    ...optionalString(evidence, "screenshotSha256"),
    ...parseOptionalGameGeometryEvidence(evidence),
    ...optionalString(evidence, "compositionReport"),
    verdict: readEnum(evidence, "verdict", ["pass", "fail"]),
    notes: readString(evidence, "notes"),
    blockers: readArray(evidence, "blockers").map((value) => readStringValue(value, "assetPairEvidence.blockers"))
  };
}

function parseOptionalGameGeometryEvidence(record: Readonly<Record<string, unknown>>): Record<"geometryEvidence", ShowcaseGameGeometryEvidence> | Record<string, never> {
  const evidence = record.geometryEvidence;
  if (evidence === undefined) return {};
  if (!isRecord(evidence)) throw new Error("assetPairEvidence.geometryEvidence must be an object");
  return { geometryEvidence: parseGameGeometryEvidence(evidence) };
}

function parseGameGeometryEvidence(evidence: Readonly<Record<string, unknown>>): ShowcaseGameGeometryEvidence {
  return {
    category: readEnum(evidence, "category", ["racing", "platformer"]),
    kind: readEnum(evidence, "kind", ["racing-track-topology", "platformer-playable-surface-map"]),
    source: parseGeometryEvidenceSource(evidence.source),
    report: readString(evidence, "report"),
    screenshotEvidence: readString(evidence, "screenshotEvidence"),
    routePrimaryScreenshotSha256: readSha256(evidence, "routePrimaryScreenshotSha256"),
    assets: readArray(evidence, "assets").map(parseGameGeometryEvidenceAsset)
  };
}

function parseGameGeometryEvidenceAsset(value: unknown): ShowcaseGameGeometryEvidenceAsset {
  if (!isRecord(value)) throw new Error("assetPairEvidence.geometryEvidence.assets must contain objects");
  return {
    id: readAssetId(value, "id"),
    hash: readSha256(value, "hash")
  };
}

function validateAssetPairEvidenceAssets(actualAssetIds: readonly string[], expectedAssetIds: readonly string[], label: string): void {
  for (const assetId of expectedAssetIds) {
    if (!actualAssetIds.includes(assetId)) {
      throw new Error(`${label} must include ${assetId}`);
    }
  }
}

function parseGeometryEvidenceSource(value: unknown): ShowcaseGeometryEvidenceSource {
  return readEnumValue(value, "geometry evidence source", [
    "asset-mesh-extracted",
    "manifest-authored",
    "manifest-authored-overlay-validated",
    "compiler-authored",
    "compiler-authored-overlay-validated"
  ]);
}

function readSha256(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = readString(record, key);
  if (!/^sha256-[a-f0-9]{64}$/.test(value)) throw new Error(`${key} must be a sha256- hash`);
  return value;
}

function readFiniteNumber(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  return readFiniteNumberValue(value, key);
}

function readFiniteNumberValue(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  return value;
}

function readVec3(record: Readonly<Record<string, unknown>>, key: string): readonly [number, number, number] {
  const value = readArray(record, key);
  if (value.length !== 3) throw new Error(`${key} must contain exactly three numbers`);
  return [
    readFiniteNumberValue(value[0], `${key}.0`),
    readFiniteNumberValue(value[1], `${key}.1`),
    readFiniteNumberValue(value[2], `${key}.2`)
  ];
}

function readProgress(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = readFiniteNumber(record, key);
  if (value < 0 || value > 1) throw new Error(`${key} must be between 0 and 1`);
  return value;
}

function readUnitNumber(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = readFiniteNumber(record, key);
  if (value < 0 || value > 1) throw new Error(`${key} must be between 0 and 1`);
  return value;
}

function optionalPositiveNumber(record: Readonly<Record<string, unknown>>, key: string): Record<string, number> {
  if (!(key in record)) return {};
  return { [key]: readPositiveNumber(record, key) };
}

function readTypedRef(record: Readonly<Record<string, unknown>>): string {
  const id = readString(record, "id");
  const typedRef = readString(record, "typedRef");
  if (typedRef !== `assets.${id}`) throw new Error(`typedRef must equal assets.${id}`);
  return typedRef;
}

function readBoolean(record: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

function readLiteral<T extends string>(record: Readonly<Record<string, unknown>>, key: string, expected: T): T {
  const value = record[key];
  if (value !== expected) throw new Error(`${key} must be ${expected}`);
  return expected;
}

function readEnum<T extends string>(record: Readonly<Record<string, unknown>>, key: string, allowed: readonly T[]): T {
  const value = readString(record, key);
  return readEnumValue(value, key, allowed);
}

function readEnumValue<T extends string>(value: unknown, key: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string`);
  for (const allowedValue of allowed) {
    if (value === allowedValue) return allowedValue;
  }
  throw new Error(`${key} must be one of ${allowed.join(", ")}`);
}

function optionalString(record: Readonly<Record<string, unknown>>, key: string): Record<string, string> {
  const value = record[key];
  return typeof value === "string" && value.trim() ? { [key]: value } : {};
}

function optionalBoolean(record: Readonly<Record<string, unknown>>, key: string): Record<string, boolean> {
  const value = record[key];
  return typeof value === "boolean" ? { [key]: value } : {};
}

function optionalEnum<T extends string>(record: Readonly<Record<string, unknown>>, key: string, allowed: readonly T[]): Record<string, T> {
  const value = record[key];
  return value === undefined ? {} : { [key]: readEnumValue(value, key, allowed) };
}

function optionalStringRecord(record: Readonly<Record<string, unknown>>, key: string): Record<string, Readonly<Record<string, string>>> {
  const value = record[key];
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${key} must be an object`);
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    const assetId = readAssetIdValue(entryKey, `${key} key`);
    if (typeof entryValue !== "string" || !entryValue.trim()) throw new Error(`${key}.${assetId} must be a non-empty string`);
    result[assetId] = entryValue;
  }
  return { [key]: result };
}
