import { numberValue, recordValue, stringValue, vectorValue } from "./showcase-spec-replacement-values.js";
import type {
  ShowcaseGeometryEvidenceRef,
  ShowcaseGeometryEvidenceSource,
  ShowcaseGeometryModelBounds,
  ShowcasePlatformerPlayableSurface,
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcasePlatformerSurfaceModelAlignment,
  ShowcaseRacingTopologyModelAlignment,
  ShowcaseRacingTrackTopology,
  ShowcaseRacingTrackTopologyCheckpoint,
  ShowcaseRacingTrackTopologyPoint
} from "./showcase-spec-types.js";

export function parseRacingTrackTopology(value: unknown): ShowcaseRacingTrackTopology | undefined {
  const record = recordValue(value);
  const assetId = stringValue(record?.assetId);
  const assetHash = stringValue(record?.assetHash);
  const source = geometrySourceValue(record?.source);
  const roadCenterline = arrayOf(record?.roadCenterline, parseRacingTrackTopologyPoint);
  const checkpoints = arrayOf(record?.checkpoints, parseRacingTrackTopologyCheckpoint);
  const estimatedLapSeconds = numberValue(record?.estimatedLapSeconds);
  const confidence = numberValue(record?.confidence);
  const modelAlignment = parseRacingModelAlignment(record?.modelAlignment);
  const evidence = parseGeometryEvidenceRef(record?.evidence);
  if (!assetId || !assetHash || !source || !roadCenterline || !checkpoints || estimatedLapSeconds === undefined || confidence === undefined || !modelAlignment || !evidence) return undefined;
  const lapLengthMeters = numberValue(record?.lapLengthMeters);
  return {
    assetId,
    assetHash,
    source,
    roadCenterline,
    checkpoints,
    ...(lapLengthMeters === undefined ? {} : { lapLengthMeters }),
    estimatedLapSeconds,
    confidence,
    modelAlignment,
    evidence
  };
}

export function parsePlatformerPlayableSurfaceMap(value: unknown): ShowcasePlatformerPlayableSurfaceMap | undefined {
  const record = recordValue(value);
  const assetId = stringValue(record?.assetId);
  const assetHash = stringValue(record?.assetHash);
  const source = geometrySourceValue(record?.source);
  const surfaces = arrayOf(record?.surfaces, parsePlatformerPlayableSurface);
  const levelLength = numberValue(record?.levelLength);
  const estimatedCompletionSeconds = numberValue(record?.estimatedCompletionSeconds);
  const characterScaleRatio = numberValue(record?.characterScaleRatio);
  const confidence = numberValue(record?.confidence);
  const modelAlignment = parsePlatformerModelAlignment(record?.modelAlignment);
  const evidence = parseGeometryEvidenceRef(record?.evidence);
  if (!assetId || !assetHash || !source || !surfaces || levelLength === undefined || estimatedCompletionSeconds === undefined || characterScaleRatio === undefined || confidence === undefined || !modelAlignment || !evidence) return undefined;
  return {
    assetId,
    assetHash,
    source,
    surfaces,
    levelLength,
    estimatedCompletionSeconds,
    characterScaleRatio,
    confidence,
    modelAlignment,
    evidence
  };
}

function arrayOf<T>(value: unknown, parse: (entry: unknown) => readonly T[]): readonly T[] | undefined {
  return Array.isArray(value) ? value.flatMap(parse) : undefined;
}

function parseRacingTrackTopologyPoint(value: unknown): readonly ShowcaseRacingTrackTopologyPoint[] {
  const record = recordValue(value);
  const x = numberValue(record?.x);
  const z = numberValue(record?.z);
  if (x === undefined || z === undefined) return [];
  const width = numberValue(record?.width);
  return [{ x, z, ...(width === undefined ? {} : { width }) }];
}

function parseRacingTrackTopologyCheckpoint(value: unknown): readonly ShowcaseRacingTrackTopologyCheckpoint[] {
  const record = recordValue(value);
  const progress = numberValue(record?.progress);
  const width = numberValue(record?.width);
  return progress === undefined || width === undefined ? [] : [{ progress, width }];
}

function parsePlatformerPlayableSurface(value: unknown): readonly ShowcasePlatformerPlayableSurface[] {
  const record = recordValue(value);
  const id = stringValue(record?.id);
  const x = numberValue(record?.x);
  const y = numberValue(record?.y);
  const width = numberValue(record?.width);
  const height = numberValue(record?.height);
  const kind = playableSurfaceKindValue(record?.kind);
  return !id || x === undefined || y === undefined || width === undefined || height === undefined || !kind
    ? []
    : [{ id, x, y, width, height, kind }];
}

function parseRacingModelAlignment(value: unknown): ShowcaseRacingTopologyModelAlignment | undefined {
  const record = recordValue(value);
  const source = geometrySourceValue(record?.source);
  const modelBounds = parseModelBounds(record?.modelBounds);
  const modelPoint = vectorValue(record?.modelPoint);
  const gamePointRecord = recordValue(record?.gamePoint);
  const x = numberValue(gamePointRecord?.x);
  const z = numberValue(gamePointRecord?.z);
  const evidence = parseAlignmentEvidence(record?.evidence);
  const anchorPairs = arrayOf(record?.anchorPairs, parseRacingModelAnchor);
  return !source || !modelBounds || !modelPoint || x === undefined || z === undefined || !evidence
    ? undefined
    : { source, modelBounds, modelPoint, gamePoint: { x, z }, ...(anchorPairs ? { anchorPairs } : {}), evidence };
}

function parsePlatformerModelAlignment(value: unknown): ShowcasePlatformerSurfaceModelAlignment | undefined {
  const record = recordValue(value);
  const source = geometrySourceValue(record?.source);
  const modelBounds = parseModelBounds(record?.modelBounds);
  const modelPoint = vectorValue(record?.modelPoint);
  const gamePointRecord = recordValue(record?.gamePoint);
  const x = numberValue(gamePointRecord?.x);
  const y = numberValue(gamePointRecord?.y);
  const evidence = parseAlignmentEvidence(record?.evidence);
  const anchorPairs = arrayOf(record?.anchorPairs, parsePlatformerModelAnchor);
  return !source || !modelBounds || !modelPoint || x === undefined || y === undefined || !evidence
    ? undefined
    : { source, modelBounds, modelPoint, gamePoint: { x, y }, ...(anchorPairs ? { anchorPairs } : {}), evidence };
}

function parseRacingModelAnchor(value: unknown): readonly NonNullable<ShowcaseRacingTopologyModelAlignment["anchorPairs"]>[number][] {
  const record = recordValue(value);
  const id = stringValue(record?.id);
  const modelPoint = vectorValue(record?.modelPoint);
  const gamePointRecord = recordValue(record?.gamePoint);
  const x = numberValue(gamePointRecord?.x);
  const z = numberValue(gamePointRecord?.z);
  return !id || !modelPoint || x === undefined || z === undefined ? [] : [{ id, modelPoint, gamePoint: { x, z } }];
}

function parsePlatformerModelAnchor(value: unknown): readonly NonNullable<ShowcasePlatformerSurfaceModelAlignment["anchorPairs"]>[number][] {
  const record = recordValue(value);
  const id = stringValue(record?.id);
  const modelPoint = vectorValue(record?.modelPoint);
  const gamePointRecord = recordValue(record?.gamePoint);
  const x = numberValue(gamePointRecord?.x);
  const y = numberValue(gamePointRecord?.y);
  return !id || !modelPoint || x === undefined || y === undefined ? [] : [{ id, modelPoint, gamePoint: { x, y } }];
}

function parseModelBounds(value: unknown): ShowcaseGeometryModelBounds | undefined {
  const record = recordValue(value);
  const min = vectorValue(record?.min);
  const max = vectorValue(record?.max);
  return min && max ? { min, max } : undefined;
}

function parseGeometryEvidenceRef(value: unknown): ShowcaseGeometryEvidenceRef | undefined {
  const record = recordValue(value);
  const sourceAsset = stringValue(record?.sourceAsset);
  const notes = stringValue(record?.notes);
  if (!sourceAsset || !notes) return undefined;
  const renderedProbe = stringValue(record?.renderedProbe);
  const routeOverlay = stringValue(record?.routeOverlay);
  return { sourceAsset, ...(renderedProbe ? { renderedProbe } : {}), ...(routeOverlay ? { routeOverlay } : {}), notes };
}

function parseAlignmentEvidence(value: unknown): ShowcaseRacingTopologyModelAlignment["evidence"] | undefined {
  const record = recordValue(value);
  const notes = stringValue(record?.notes);
  if (!notes) return undefined;
  const routeOverlay = stringValue(record?.routeOverlay);
  return { ...(routeOverlay ? { routeOverlay } : {}), notes };
}

function geometrySourceValue(value: unknown): ShowcaseGeometryEvidenceSource | undefined {
  return value === "asset-mesh-extracted" ||
    value === "manifest-authored" ||
    value === "manifest-authored-overlay-validated" ||
    value === "compiler-authored" ||
    value === "compiler-authored-overlay-validated"
    ? value
    : undefined;
}

function playableSurfaceKindValue(value: unknown): ShowcasePlatformerPlayableSurface["kind"] | undefined {
  return value === "ground" ||
    value === "platform" ||
    value === "moving" ||
    value === "hazard" ||
    value === "checkpoint" ||
    value === "finish"
    ? value
    : undefined;
}
