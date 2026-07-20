import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mkdirSync } from "node:fs";

export type ShowcaseAssetPairCompositionCategory = "racing" | "platformer";
export type ShowcaseAssetPairCompositionCheckId =
  | "binding-overlap"
  | "contact"
  | "camera-readability"
  | "scale-contract"
  | "debug-guide-absence";

export interface ShowcaseCompositionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShowcaseAssetPairCompositionThresholds {
  readonly minBindingOverlapRatio: number;
  readonly maxContactOffsetRatio: number;
  readonly maxScreenContactDistanceRatio: number;
  readonly minPlaySpaceAreaRatio: number;
  readonly maxPlaySpaceAreaRatio: number;
  readonly minSubjectWorldRatio: number;
  readonly maxSubjectWorldRatio: number;
  readonly maxPlatformerScaleDelta: number;
}

export const SHOWCASE_ASSET_PAIR_COMPOSITION_THRESHOLDS: ShowcaseAssetPairCompositionThresholds = Object.freeze({
  minBindingOverlapRatio: 0.02,
  maxContactOffsetRatio: 1,
  maxScreenContactDistanceRatio: 0.35,
  minPlaySpaceAreaRatio: 0.04,
  maxPlaySpaceAreaRatio: 0.78,
  minSubjectWorldRatio: 0.08,
  maxSubjectWorldRatio: 0.78,
  maxPlatformerScaleDelta: 0.18
});

export interface ShowcaseAssetPairCompositionInput {
  readonly routeId: string;
  readonly category: ShowcaseAssetPairCompositionCategory;
  readonly screenshot: {
    readonly path: string;
    readonly sha256: string;
    readonly width: number;
    readonly height: number;
    readonly crop: ShowcaseCompositionRect;
    readonly foregroundBounds: ShowcaseCompositionRect;
    readonly foregroundClipped: boolean;
    readonly subjectBounds: ShowcaseCompositionRect;
    readonly subjectClipped: boolean;
    readonly projectedPlaySpaceBounds: ShowcaseCompositionRect;
    readonly projectedContactPoint: { readonly x: number; readonly y: number };
    readonly projectedSubjectHeight?: number;
  };
  readonly assets: readonly { readonly id: string; readonly manifestHash: string; readonly evidenceHash: string }[];
  readonly geometry: {
    readonly report: string;
    readonly assetId: string;
    readonly assetHash: string;
    readonly source: string;
    readonly modelAnchorCount: number;
  };
  readonly sceneBinding: {
    readonly assetHash: string;
    readonly geometryBinding: string;
    readonly overlay: string;
    readonly averageBindingError: number;
    readonly modelPresentationOffset: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly contact: {
    readonly proven: boolean;
    readonly normalizedOffset: number;
  };
  readonly camera: {
    readonly mode: string;
    readonly followsSubject: boolean;
  };
  readonly scale: {
    readonly characterScaleRatio?: number;
    readonly projectedTargetHeight?: number;
  };
  readonly debugGuidesAbsent: boolean;
  readonly freshnessFailures?: readonly string[];
  readonly thresholds?: Partial<ShowcaseAssetPairCompositionThresholds>;
}

export interface ShowcaseAssetPairCompositionCheck {
  readonly id: ShowcaseAssetPairCompositionCheckId;
  readonly verdict: "pass" | "fail";
  readonly tolerance: Readonly<Record<string, number | boolean | string>>;
  readonly measured: Readonly<Record<string, number | boolean | string>>;
  readonly blockers: readonly string[];
}

export interface ShowcaseAssetPairCompositionReport {
  readonly schema: "aura3d-showcase-asset-pair-composition/1.0";
  readonly routeId: string;
  readonly category: ShowcaseAssetPairCompositionCategory;
  readonly verdict: "pass" | "fail";
  readonly pass: boolean;
  readonly screenshot: { readonly path: string; readonly sha256: string; readonly width: number; readonly height: number };
  readonly geometry: ShowcaseAssetPairCompositionInput["geometry"];
  readonly assets: ShowcaseAssetPairCompositionInput["assets"];
  readonly thresholds: ShowcaseAssetPairCompositionThresholds;
  readonly checks: readonly ShowcaseAssetPairCompositionCheck[];
  readonly blockers: readonly string[];
}

export interface ValidateShowcaseAssetPairCompositionFromDiskOptions {
  readonly projectDir?: string;
  readonly routeId: string;
  readonly category: ShowcaseAssetPairCompositionCategory;
  readonly routePrimaryProbe: string;
  readonly gameplayProof: string;
  readonly geometryReport: string;
  readonly manifest?: string;
  readonly outputPath?: string;
}

export function validateShowcaseAssetPairComposition(input: ShowcaseAssetPairCompositionInput): ShowcaseAssetPairCompositionReport {
  const thresholds = { ...SHOWCASE_ASSET_PAIR_COMPOSITION_THRESHOLDS, ...(input.thresholds ?? {}) };
  const cropArea = area(input.screenshot.crop);
  const playSpaceAreaRatio = ratio(area(input.screenshot.projectedPlaySpaceBounds), cropArea);
  const subjectWorldRatio = ratio(input.screenshot.subjectBounds.height, input.screenshot.crop.height);
  const overlapRatio = input.screenshot.subjectClipped
    ? 0
    : input.category === "platformer"
      ? horizontalIntersectionRatio(input.screenshot.subjectBounds, input.screenshot.projectedPlaySpaceBounds)
      : intersectionRatio(input.screenshot.subjectBounds, input.screenshot.projectedPlaySpaceBounds);
  const subjectBase = {
    x: input.screenshot.subjectBounds.x + input.screenshot.subjectBounds.width / 2,
    y: input.screenshot.subjectBounds.y + input.screenshot.subjectBounds.height
  };
  const screenContactDistance = Math.hypot(
    subjectBase.x - input.screenshot.projectedContactPoint.x,
    subjectBase.y - input.screenshot.projectedContactPoint.y
  );
  const screenContactDistanceRatio = ratio(screenContactDistance, input.screenshot.subjectBounds.height);
  const bindingBlocker = input.category === "racing"
    ? "asset-pair:car-route-not-visibly-bound-to-road-surface"
    : "asset-pair:character-foot-contact-not-visibly-bound-to-platform-surface";
  const cameraBlocker = input.category === "racing"
    ? "asset-pair:track-camera-composition-reads-as-proof-harness"
    : "asset-pair:platform-camera-composition-not-public-quality";
  const scaleBlocker = input.category === "racing"
    ? "asset-pair:vehicle-track-scale-contract-mismatch"
    : "asset-pair:character-world-scale-and-art-direction-not-public-quality";
  const zeroPresentationOffset = input.sceneBinding.modelPresentationOffset.x === 0
    && input.sceneBinding.modelPresentationOffset.y === 0
    && input.sceneBinding.modelPresentationOffset.z === 0;
  const overlayMatches = input.geometry.source === "asset-mesh-extracted"
    ? input.sceneBinding.overlay === "" || input.sceneBinding.overlay === input.screenshot.path
    : input.sceneBinding.overlay === input.screenshot.path;
  const bindingPass = (input.freshnessFailures?.length ?? 0) === 0
    && input.sceneBinding.assetHash === input.geometry.assetHash
    && overlayMatches
    && input.geometry.modelAnchorCount > 0
    && input.sceneBinding.averageBindingError <= 0.06
    && zeroPresentationOffset
    && overlapRatio >= thresholds.minBindingOverlapRatio;
  const contactPass = input.contact.proven
    && input.contact.normalizedOffset <= thresholds.maxContactOffsetRatio
    && screenContactDistanceRatio <= thresholds.maxScreenContactDistanceRatio;
  const selectedRacingCameraMode = input.category === "racing"
    ? input.camera.followsSubject && input.camera.mode === "follow"
      ? "chase"
      : input.camera.mode === "overview" || input.camera.mode === "perspective" || input.camera.mode === "top-down"
        ? "top-down"
        : undefined
    : undefined;
  const cameraBehaviorPass = input.category === "racing" ? selectedRacingCameraMode !== undefined : input.camera.followsSubject;
  const cameraPass = !input.screenshot.foregroundClipped
    && !input.screenshot.subjectClipped
    && playSpaceAreaRatio >= thresholds.minPlaySpaceAreaRatio
    && playSpaceAreaRatio <= thresholds.maxPlaySpaceAreaRatio
    && cameraBehaviorPass;
  const characterScaleRatio = input.scale.characterScaleRatio;
  const projectedTargetHeight = input.scale.projectedTargetHeight;
  const scaleDelta = projectedTargetHeight === undefined
    ? Number.POSITIVE_INFINITY
    : Math.abs(input.screenshot.subjectBounds.height - projectedTargetHeight) / Math.max(projectedTargetHeight, 0.001);
  const platformerScalePass = input.category !== "platformer" || (
    characterScaleRatio !== undefined
    && characterScaleRatio > 0
    && characterScaleRatio <= 1.25
    && projectedTargetHeight !== undefined
    && projectedTargetHeight > 0
    && scaleDelta <= thresholds.maxPlatformerScaleDelta
  );
  const scalePass = subjectWorldRatio >= thresholds.minSubjectWorldRatio
    && subjectWorldRatio <= thresholds.maxSubjectWorldRatio
    && platformerScalePass;

  const checks: ShowcaseAssetPairCompositionCheck[] = [
    makeCheck("binding-overlap", bindingPass, {
      minOverlapRatio: thresholds.minBindingOverlapRatio,
      maxAverageBindingError: 0.06,
      requiresCurrentHashes: true,
      requiresZeroPresentationOffset: true
    }, {
      overlapRatio,
      averageBindingError: input.sceneBinding.averageBindingError,
      modelAnchorCount: input.geometry.modelAnchorCount,
      sceneAssetHashMatches: input.sceneBinding.assetHash === input.geometry.assetHash,
      overlayMatches,
      zeroPresentationOffset
    }, bindingBlocker),
    makeCheck("contact", contactPass, {
      maxNormalizedOffset: thresholds.maxContactOffsetRatio,
      maxScreenContactDistanceRatio: thresholds.maxScreenContactDistanceRatio
    }, {
      contactProven: input.contact.proven,
      normalizedOffset: input.contact.normalizedOffset,
      screenContactDistance,
      screenContactDistanceRatio
    }, bindingBlocker),
    makeCheck("camera-readability", cameraPass, {
      minPlaySpaceAreaRatio: thresholds.minPlaySpaceAreaRatio,
      maxPlaySpaceAreaRatio: thresholds.maxPlaySpaceAreaRatio,
      clippedAllowed: false,
      requiresSubjectFollow: input.category !== "racing" || selectedRacingCameraMode === "chase",
      acceptedRacingModes: "chase|top-down"
    }, {
      playSpaceAreaRatio,
      foregroundClipped: input.screenshot.foregroundClipped,
      subjectClipped: input.screenshot.subjectClipped,
      cameraMode: input.camera.mode,
      followsSubject: input.camera.followsSubject,
      ...(selectedRacingCameraMode ? { selectedMode: selectedRacingCameraMode } : {})
    }, cameraBlocker),
    makeCheck("scale-contract", scalePass, {
      minSubjectWorldRatio: thresholds.minSubjectWorldRatio,
      maxSubjectWorldRatio: thresholds.maxSubjectWorldRatio,
      maxPlatformerScaleDelta: thresholds.maxPlatformerScaleDelta
    }, {
      subjectWorldRatio,
      characterScaleRatio: characterScaleRatio ?? "not-required",
      projectedTargetHeight: projectedTargetHeight ?? "not-required",
      renderedSubjectHeight: input.screenshot.subjectBounds.height,
      scaleDelta: Number.isFinite(scaleDelta) ? scaleDelta : "missing"
    }, scaleBlocker),
    makeCheck("debug-guide-absence", input.debugGuidesAbsent, {
      visibleDebugGuidesAllowed: false
    }, {
      debugGuidesAbsent: input.debugGuidesAbsent
    }, "asset-pair:debug-guides-visible")
  ];

  const blockers = unique([
    ...(input.freshnessFailures ?? []),
    ...checks.flatMap((check) => check.blockers)
  ]);
  return {
    schema: "aura3d-showcase-asset-pair-composition/1.0",
    routeId: input.routeId,
    category: input.category,
    verdict: blockers.length === 0 ? "pass" : "fail",
    pass: blockers.length === 0,
    screenshot: {
      path: input.screenshot.path,
      sha256: input.screenshot.sha256,
      width: input.screenshot.width,
      height: input.screenshot.height
    },
    geometry: input.geometry,
    assets: input.assets,
    thresholds,
    checks,
    blockers
  };
}

export function validateShowcaseAssetPairCompositionFromDisk(
  options: ValidateShowcaseAssetPairCompositionFromDiskOptions
): ShowcaseAssetPairCompositionReport {
  const root = resolve(options.projectDir ?? process.cwd());
  const probe = readJsonObject(root, options.routePrimaryProbe, "route-primary-probe");
  const gameplay = readJsonObject(root, options.gameplayProof, "gameplay-proof");
  const geometryReport = readJsonObject(root, options.geometryReport, "geometry-report");
  const manifest = readJsonObject(root, options.manifest ?? "aura.assets.json", "manifest");
  const screenshotPath = readString(readObject(probe, "renderedProbe"), "screenshotPath");
  const screenshotAbsolute = safePath(root, screenshotPath, "screenshot");
  const screenshotSha256 = sha256(readFileSync(screenshotAbsolute));
  const renderedProbe = readObject(probe, "renderedProbe");
  const crop = readRect(renderedProbe, "analysisCrop");
  const foregroundBounds = readRect(renderedProbe, "foregroundBounds");
  const compositionProbe = readObject(probe, "compositionProbe");
  const subjectBounds = readRect(compositionProbe, "subjectBounds");
  const projectedPlaySpaceBounds = readRect(compositionProbe, "projectedPlaySpaceBounds");
  const projectedContactPoint = readPoint(compositionProbe, "projectedContactPoint");
  const evidence = readObject(readObject(gameplay, "evidence"), "before");
  const sceneContainer = readObject(evidence, options.category === "racing" ? "racing" : "platformer");
  const sceneBinding = readObject(sceneContainer, "sceneBinding");
  const geometry = geometryRecord(options.category, geometryReport);
  const manifestAssets = readArray(manifest, "assets");
  const primaryAssets = readStringArray(evidence, "primaryAssets");
  const routeProbeAssets = readArray(probe, "primaryAssets");
  const freshnessFailures: string[] = [];
  if (readString(renderedProbe, "sha256") !== screenshotSha256) freshnessFailures.push("asset-pair:stale-screenshot-hash");
  if (readString(probe, "routeId") !== options.routeId || readString(geometryReport, "routeId") !== options.routeId) {
    freshnessFailures.push("asset-pair:route-id-mismatch");
  }
  const assets = primaryAssets.map((id) => {
    const manifestAsset = manifestAssets.find((value) => isRecord(value) && value.id === id);
    const probeAsset = routeProbeAssets.find((value) => isRecord(value) && value.id === id);
    const manifestHash = isRecord(manifestAsset) && typeof manifestAsset.hash === "string" ? manifestAsset.hash : "missing";
    const evidenceHash = isRecord(probeAsset) && typeof probeAsset.manifestHash === "string" ? probeAsset.manifestHash : "missing";
    if (manifestHash !== evidenceHash) freshnessFailures.push(`asset-pair:stale-manifest-hash:${id}`);
    return { id, manifestHash, evidenceHash };
  });
  if (!assets.some((asset) => asset.id === geometry.assetId && asset.manifestHash === geometry.assetHash)) {
    freshnessFailures.push(`asset-pair:geometry-asset-hash-mismatch:${geometry.assetId}`);
  }

  const contact = compositionContact(options.category, evidence);
  const cameraEvidence = readObject(readObject(readObject(evidence, "diagnostics"), "evidence"), "camera");
  const mode = optionalString(cameraEvidence, "mode") ?? "missing";
  const levelDesign = options.category === "platformer" ? readOptionalObject(evidence, "levelDesign") : undefined;
  const gameplayEvidence = readObject(evidence, "gameplay");
  const debugGuidesAbsent = options.category === "racing"
    ? gameplayEvidence.noDebugLocatorDisk === true
    : levelDesign?.noDebugSurfaceGuides === true;
  const source = readString(geometry.record, "source");
  const modelAlignment = readObject(geometry.record, "modelAlignment");
  const anchorPairs = Array.isArray(modelAlignment.anchorPairs) ? modelAlignment.anchorPairs : [];
  const overlay = optionalString(sceneBinding, options.category === "racing" ? "routeOverlay" : "surfaceOverlay") ?? "";
  const averageBindingError = readNumber(sceneBinding, options.category === "racing" ? "averageRouteTopologyError" : "averageSurfaceBindingError");
  const characterScaleRatio = options.category === "platformer" ? optionalNumber(sceneBinding, "characterScaleRatio") : undefined;
  const projectedTargetHeight = options.category === "platformer" ? optionalNumber(compositionProbe, "projectedSubjectHeight") : undefined;
  const report = validateShowcaseAssetPairComposition({
    routeId: options.routeId,
    category: options.category,
    screenshot: {
      path: screenshotPath,
      sha256: screenshotSha256,
      width: readNumber(renderedProbe, "width"),
      height: readNumber(renderedProbe, "height"),
      crop,
      foregroundBounds,
      foregroundClipped: renderedProbe.clipped === true,
      subjectBounds,
      subjectClipped: compositionProbe.subjectClipped === true,
      projectedPlaySpaceBounds,
      projectedContactPoint,
      ...(projectedTargetHeight !== undefined ? { projectedSubjectHeight: projectedTargetHeight } : {})
    },
    assets,
    geometry: {
      report: options.geometryReport,
      assetId: geometry.assetId,
      assetHash: geometry.assetHash,
      source,
      modelAnchorCount: Math.max(anchorPairs.length, 1)
    },
    sceneBinding: {
      assetHash: readString(sceneBinding, "assetHash"),
      geometryBinding: readString(sceneBinding, "geometryBinding"),
      overlay,
      averageBindingError,
      modelPresentationOffset: readOffset(sceneBinding, "modelPresentationOffset")
    },
    contact,
    camera: {
      mode,
      followsSubject: mode === "follow" && typeof cameraEvidence.followTarget === "string"
    },
    scale: { characterScaleRatio, projectedTargetHeight },
    debugGuidesAbsent,
    freshnessFailures
  });
  if (options.outputPath) {
    const output = safePath(root, options.outputPath, "composition-output");
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function geometryRecord(category: ShowcaseAssetPairCompositionCategory, report: Readonly<Record<string, unknown>>) {
  const key = category === "racing" ? "topology" : "surfaceMap";
  const record = readObject(report, key);
  return { record, assetId: readString(record, "assetId"), assetHash: readString(record, "assetHash") };
}

function compositionContact(category: ShowcaseAssetPairCompositionCategory, evidence: Readonly<Record<string, unknown>>) {
  if (category === "racing") {
    const alignment = readObject(readObject(evidence, "raceState"), "roadAlignment");
    return { proven: alignment.onRoad === true, normalizedOffset: readNumber(alignment, "normalizedOffset") };
  }
  const diagnostics = readObject(evidence, "diagnostics");
  const alignment = readOptionalObject(diagnostics, "surfaceContactAlignment");
  const gameplay = readObject(evidence, "gameplay");
  return {
    proven: alignment?.feetOnSurface === true && gameplay.surfaceContactProven === true,
    normalizedOffset: Math.abs(optionalNumber(alignment ?? {}, "verticalGap") ?? Number.POSITIVE_INFINITY)
  };
}

function makeCheck(
  id: ShowcaseAssetPairCompositionCheckId,
  pass: boolean,
  tolerance: Readonly<Record<string, number | boolean | string>>,
  measured: Readonly<Record<string, number | boolean | string>>,
  blocker: string
): ShowcaseAssetPairCompositionCheck {
  return { id, verdict: pass ? "pass" : "fail", tolerance, measured, blockers: pass ? [] : [blocker] };
}


function horizontalIntersectionRatio(left: ShowcaseCompositionRect, right: ShowcaseCompositionRect): number {
  const x1 = Math.max(left.x, right.x);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  return ratio(Math.max(0, x2 - x1), Math.max(0, left.width));
}

function intersectionRatio(left: ShowcaseCompositionRect, right: ShowcaseCompositionRect): number {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);
  return ratio(Math.max(0, x2 - x1) * Math.max(0, y2 - y1), area(left));
}

function area(rect: ShowcaseCompositionRect): number { return Math.max(0, rect.width) * Math.max(0, rect.height); }
function ratio(value: number, total: number): number { return total > 0 ? Number((value / total).toFixed(4)) : 0; }
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }
function sha256(value: Buffer): string { return `sha256-${createHash("sha256").update(value).digest("hex")}`; }

function readJsonObject(root: string, path: string, label: string): Readonly<Record<string, unknown>> {
  const absolute = safePath(root, path, label);
  if (!existsSync(absolute)) throw new Error(`${label} is missing: ${path}`);
  const parsed: unknown = JSON.parse(readFileSync(absolute, "utf8"));
  if (!isRecord(parsed)) throw new Error(`${label} must contain a JSON object: ${path}`);
  return parsed;
}

function safePath(root: string, path: string, label: string): string {
  if (!path || isAbsolute(path) || path.includes("\0")) throw new Error(`${label} path must be repository-relative`);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`${label} path escapes the repository`);
  return absolute;
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readObject(value: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> { const result = value[key]; if (!isRecord(result)) throw new Error(`${key} must be an object`); return result; }
function readOptionalObject(value: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> | undefined { const result = value[key]; return isRecord(result) ? result : undefined; }
function readArray(value: Readonly<Record<string, unknown>>, key: string): readonly unknown[] { const result = value[key]; if (!Array.isArray(result)) throw new Error(`${key} must be an array`); return result; }
function readString(value: Readonly<Record<string, unknown>>, key: string): string { const result = value[key]; if (typeof result !== "string" || !result) throw new Error(`${key} must be a non-empty string`); return result; }
function optionalString(value: Readonly<Record<string, unknown>>, key: string): string | undefined { const result = value[key]; return typeof result === "string" ? result : undefined; }
function readNumber(value: Readonly<Record<string, unknown>>, key: string): number { const result = value[key]; if (typeof result !== "number" || !Number.isFinite(result)) throw new Error(`${key} must be finite`); return result; }
function optionalNumber(value: Readonly<Record<string, unknown>>, key: string): number | undefined { const result = value[key]; return typeof result === "number" && Number.isFinite(result) ? result : undefined; }
function readStringArray(value: Readonly<Record<string, unknown>>, key: string): readonly string[] { return readArray(value, key).map((item) => { if (typeof item !== "string") throw new Error(`${key} must contain strings`); return item; }); }
function readRect(value: Readonly<Record<string, unknown>>, key: string): ShowcaseCompositionRect { const rect = readObject(value, key); return { x: readNumber(rect, "x"), y: readNumber(rect, "y"), width: readNumber(rect, "width"), height: readNumber(rect, "height") }; }
function readPoint(value: Readonly<Record<string, unknown>>, key: string): { readonly x: number; readonly y: number } { const point = readObject(value, key); return { x: readNumber(point, "x"), y: readNumber(point, "y") }; }
function readOffset(value: Readonly<Record<string, unknown>>, key: string) { const offset = readObject(value, key); return { x: readNumber(offset, "x"), y: readNumber(offset, "y"), z: readNumber(offset, "z") }; }
