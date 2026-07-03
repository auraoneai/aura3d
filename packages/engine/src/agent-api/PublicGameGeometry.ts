export type PublicGameAssetCertification =
  | "not-game-ready"
  | "candidate-needs-geometry"
  | "certified-racing-track"
  | "certified-racing-vehicle"
  | "certified-platformer-world"
  | "certified-platformer-character"
  | "certified-generated-game-world";

export type PublicGameGeometrySource =
  | "asset-mesh-extracted"
  | "manifest-authored-overlay-validated"
  | "compiler-authored-overlay-validated";

export type PublicGameGeometryCategory = "racing" | "platformer";

export interface PublicGameRetainedProof {
  readonly routePrimaryScreenshot: string;
  readonly routePrimaryScreenshotSha256: string;
  readonly geometryReport: string;
  readonly manifestHash: string;
  readonly visualReview: "pass" | "fail";
  readonly assetPairPass: boolean;
  readonly blockers: readonly string[];
}

export interface PublicGameBounds2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minY?: number;
  readonly maxY?: number;
  readonly minZ?: number;
  readonly maxZ?: number;
}

export interface PublicRacingGeometryPoint {
  readonly x: number;
  readonly z: number;
  readonly width?: number;
}

export interface PublicRacingGeometryCheckpoint {
  readonly id: string;
  readonly progress: number;
  readonly width: number;
}

export interface PublicRacingGeometryContract {
  readonly trackAsset: string;
  readonly vehicleAsset: string;
  readonly trackCertification: PublicGameAssetCertification;
  readonly vehicleCertification: PublicGameAssetCertification;
  readonly geometrySource: PublicGameGeometrySource;
  readonly roadWidth: number;
  readonly roadCenterline: readonly PublicRacingGeometryPoint[];
  readonly startPose: {
    readonly x: number;
    readonly z: number;
    readonly heading: number;
  };
  readonly checkpoints: readonly PublicRacingGeometryCheckpoint[];
  readonly lap: {
    readonly finishProgress: number;
    readonly lapsToWin: number;
    readonly minLapSeconds: number;
  };
  readonly drivableBounds: PublicGameBounds2;
  readonly cameraBounds: PublicGameBounds2;
  readonly vehicleScale: {
    readonly width: number;
    readonly length: number;
  };
  readonly retainedProof: PublicGameRetainedProof;
}

export interface PublicPlatformerSurface {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "ground" | "platform" | "moving" | "hazard" | "checkpoint" | "finish";
}

export interface PublicPlatformerHazard {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly respawn: boolean;
}

export interface PublicPlatformerCheckpoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface PublicPlatformerGeometryContract {
  readonly worldAssets: readonly string[];
  readonly characterAsset: string;
  readonly worldCertification: PublicGameAssetCertification;
  readonly characterCertification: PublicGameAssetCertification;
  readonly geometrySource: PublicGameGeometrySource;
  readonly spawn: {
    readonly x: number;
    readonly y: number;
  };
  readonly surfaces: readonly PublicPlatformerSurface[];
  readonly hazards: readonly PublicPlatformerHazard[];
  readonly checkpoints: readonly PublicPlatformerCheckpoint[];
  readonly finish: {
    readonly x: number;
    readonly y: number;
  };
  readonly worldBounds: PublicGameBounds2;
  readonly cameraBounds: PublicGameBounds2;
  readonly characterScale: {
    readonly width: number;
    readonly height: number;
  };
  readonly retainedProof: PublicGameRetainedProof;
}

export interface PublicGameGeometryCertification {
  readonly kind: "aura-public-game-geometry-certification";
  readonly category: PublicGameGeometryCategory;
  readonly publicReady: boolean;
  readonly blockers: readonly string[];
  readonly certifications: {
    readonly primary: PublicGameAssetCertification;
    readonly secondary: PublicGameAssetCertification;
  };
}

export function certifyPublicRacingGeometry(contract: PublicRacingGeometryContract): PublicGameGeometryCertification {
  const blockers: string[] = [];
  if (!isCertifiedRacingTrack(contract.trackCertification)) blockers.push(`racing:track-certification:${contract.trackCertification}`);
  if (contract.vehicleCertification !== "certified-racing-vehicle") blockers.push(`racing:vehicle-certification:${contract.vehicleCertification}`);
  if (contract.roadCenterline.length < 8) blockers.push(`racing:too-few-road-centerline-points:${contract.roadCenterline.length}`);
  if (!isPositive(contract.roadWidth)) blockers.push("racing:road-width-invalid");
  if (contract.checkpoints.length < 4) blockers.push(`racing:too-few-checkpoints:${contract.checkpoints.length}`);
  if (!isFinitePoint2(contract.startPose, "z")) blockers.push("racing:start-pose-invalid");
  if (!isPositive(contract.lap.lapsToWin)) blockers.push("racing:laps-to-win-invalid");
  if (contract.lap.finishProgress < 0.9 || contract.lap.finishProgress > 1) blockers.push("racing:finish-progress-invalid");
  if (contract.lap.minLapSeconds < 30) blockers.push(`racing:min-lap-seconds-too-low:${contract.lap.minLapSeconds}`);
  if (!hasPositiveBounds(contract.drivableBounds, "z")) blockers.push("racing:drivable-bounds-invalid");
  if (!hasPositiveBounds(contract.cameraBounds, "z")) blockers.push("racing:camera-bounds-invalid");
  if (!isPositive(contract.vehicleScale.width) || !isPositive(contract.vehicleScale.length)) blockers.push("racing:vehicle-scale-invalid");
  if (isPositive(contract.roadWidth) && contract.vehicleScale.width > contract.roadWidth) blockers.push("racing:vehicle-wider-than-road");
  blockers.push(...validateRetainedProof("racing", contract.retainedProof));
  return certification("racing", blockers, contract.trackCertification, contract.vehicleCertification);
}

export function certifyPublicPlatformerGeometry(contract: PublicPlatformerGeometryContract): PublicGameGeometryCertification {
  const blockers: string[] = [];
  if (!isCertifiedPlatformerWorld(contract.worldCertification)) blockers.push(`platformer:world-certification:${contract.worldCertification}`);
  if (contract.characterCertification !== "certified-platformer-character") blockers.push(`platformer:character-certification:${contract.characterCertification}`);
  if (contract.worldAssets.length === 0) blockers.push("platformer:world-assets-missing");
  const playableSurfaceCount = contract.surfaces.filter(isPlayableSurface).length;
  if (playableSurfaceCount < 4) blockers.push(`platformer:too-few-playable-surfaces:${playableSurfaceCount}`);
  if (contract.hazards.length === 0) blockers.push("platformer:missing-hazards");
  if (contract.checkpoints.length === 0) blockers.push("platformer:missing-checkpoints");
  if (!isFinitePoint2(contract.spawn, "y")) blockers.push("platformer:spawn-invalid");
  if (!isFinitePoint2(contract.finish, "y") || contract.finish.x <= contract.spawn.x) blockers.push("platformer:finish-invalid");
  if (!hasPositiveBounds(contract.worldBounds, "y")) blockers.push("platformer:world-bounds-invalid");
  if (!hasPositiveBounds(contract.cameraBounds, "y")) blockers.push("platformer:camera-bounds-invalid");
  if (!isPositive(contract.characterScale.width) || !isPositive(contract.characterScale.height)) blockers.push("platformer:character-scale-invalid");
  blockers.push(...validateRetainedProof("platformer", contract.retainedProof));
  return certification("platformer", blockers, contract.worldCertification, contract.characterCertification);
}

function certification(
  category: PublicGameGeometryCategory,
  blockers: readonly string[],
  primary: PublicGameAssetCertification,
  secondary: PublicGameAssetCertification
): PublicGameGeometryCertification {
  return {
    kind: "aura-public-game-geometry-certification",
    category,
    publicReady: blockers.length === 0,
    blockers,
    certifications: { primary, secondary }
  };
}

function isCertifiedRacingTrack(status: PublicGameAssetCertification): boolean {
  return status === "certified-racing-track" || status === "certified-generated-game-world";
}

function isCertifiedPlatformerWorld(status: PublicGameAssetCertification): boolean {
  return status === "certified-platformer-world" || status === "certified-generated-game-world";
}

function validateRetainedProof(category: PublicGameGeometryCategory, proof: PublicGameRetainedProof): readonly string[] {
  const blockers: string[] = [];
  if (!proof.routePrimaryScreenshot.trim()) blockers.push(`${category}:retained-proof:screenshot-missing`);
  if (!isSha256(proof.routePrimaryScreenshotSha256)) blockers.push(`${category}:retained-proof:screenshot-sha256-missing`);
  if (!proof.geometryReport.trim()) blockers.push(`${category}:retained-proof:geometry-report-missing`);
  if (!isSha256(proof.manifestHash)) blockers.push(`${category}:retained-proof:manifest-hash-missing`);
  if (proof.visualReview !== "pass") blockers.push(`${category}:retained-proof:visual-review-not-pass:${proof.visualReview}`);
  if (proof.assetPairPass !== true) blockers.push(`${category}:retained-proof:asset-pair-not-pass`);
  for (const blocker of proof.blockers) blockers.push(`${category}:retained-proof:blocker:${blocker}`);
  return blockers;
}

function isPlayableSurface(surface: PublicPlatformerSurface): boolean {
  return surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving";
}

function hasPositiveBounds(bounds: PublicGameBounds2, secondAxis: "y" | "z"): boolean {
  const minSecond = secondAxis === "y" ? bounds.minY : bounds.minZ;
  const maxSecond = secondAxis === "y" ? bounds.maxY : bounds.maxZ;
  return Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(minSecond) &&
    Number.isFinite(maxSecond) &&
    bounds.maxX > bounds.minX &&
    maxSecond !== undefined &&
    minSecond !== undefined &&
    maxSecond > minSecond;
}

function isFinitePoint2(point: { readonly x: number; readonly y?: number; readonly z?: number }, secondAxis: "y" | "z"): boolean {
  const second = secondAxis === "y" ? point.y : point.z;
  return Number.isFinite(point.x) && Number.isFinite(second);
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isSha256(value: string): boolean {
  return /^sha256-[a-f0-9]{64}$/.test(value);
}
