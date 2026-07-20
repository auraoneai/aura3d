import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  ShowcaseGameAssetPairEvidence,
  ShowcaseGameGeometryEvidence,
  ShowcaseGeometryEvidenceSource,
  ShowcaseSpec
} from "./showcase-spec-types.js";

export interface AppliedCompositionEvidence {
  readonly spec: ShowcaseSpec;
  readonly summary?: {
    readonly report: string;
    readonly verdict: "pass" | "fail";
    readonly checks: readonly { readonly id: string; readonly verdict: "pass" | "fail" }[];
  };
}

export function applyRetainedCompositionEvidence(spec: ShowcaseSpec, projectDir = process.cwd()): AppliedCompositionEvidence {
  if (spec.category !== "game-racing" && spec.category !== "game-platformer") return { spec };
  const reportPath = spec.evidence.assetPairCompositionReport;
  if (!reportPath) return { spec };
  const report = readCompositionReport(projectDir, reportPath);
  if (!report) return { spec };
  const category = spec.category === "game-racing" ? "racing" : "platformer";
  if (report.routeId !== spec.routeId || report.category !== category) return { spec };
  const checks = readChecks(report.checks);
  const cameraMode = category === "racing" ? readRacingCameraMode(report.checks) : undefined;
  const verdict = report.verdict === "pass" && report.pass === true ? "pass" : "fail";
  const screenshot = record(report.screenshot);
  const geometry = record(report.geometry);
  const assets = Array.isArray(report.assets)
    ? report.assets.flatMap((value) => {
      const asset = record(value);
      return asset ? [asset] : [];
    })
    : [];
  if (!screenshot || !geometry) return { spec };
  const source = geometrySource(geometry.source);
  const geometryReport = stringValue(geometry.report);
  const screenshotPath = stringValue(screenshot.path);
  const screenshotSha256 = stringValue(screenshot.sha256);
  if (!source || !geometryReport || !screenshotPath || !screenshotSha256) return { spec };
  const evidenceAssets = assets.flatMap((asset) => {
    const id = stringValue(asset.id);
    const hash = stringValue(asset.manifestHash);
    return id && hash ? [{ id, hash }] : [];
  });
  const expectedAssetIds = [...spec.primaryAssets.map((asset) => asset.id)].sort();
  const reportAssetIds = [...evidenceAssets.map((asset) => asset.id)].sort();
  if (expectedAssetIds.length !== reportAssetIds.length || expectedAssetIds.some((id, index) => id !== reportAssetIds[index])) {
    return { spec };
  }
  const geometryEvidence: ShowcaseGameGeometryEvidence = {
    category,
    kind: category === "racing" ? "racing-track-topology" : "platformer-playable-surface-map",
    source,
    report: geometryReport,
    screenshotEvidence: screenshotPath,
    routePrimaryScreenshotSha256: screenshotSha256,
    assets: evidenceAssets
  };
  const evidence: ShowcaseGameAssetPairEvidence = {
    category,
    assets: evidenceAssets.map((asset) => asset.id),
    screenshotEvidence: screenshotPath,
    routePrimaryProbe: spec.evidence.routePrimaryProbe,
    screenshotSha256,
    geometryEvidence,
    compositionReport: reportPath,
    ...(cameraMode ? { cameraMode } : {}),
    checks,
    verdict,
    notes: "Derived by the asset-pair composition validator from retained screenshot, gameplay, geometry, camera, and manifest evidence.",
    blockers: stringArray(report.blockers)
  };
  const nextSpec: ShowcaseSpec = category === "racing" && spec.racing
    ? { ...spec, racing: { ...spec.racing, raceDesign: { ...spec.racing.raceDesign, assetPairEvidence: evidence } } }
    : category === "platformer" && spec.platformer
      ? { ...spec, platformer: { ...spec.platformer, levelDesign: { ...spec.platformer.levelDesign, assetPairEvidence: evidence } } }
      : spec;
  return { spec: nextSpec, summary: { report: reportPath, verdict, checks } };
}

function readCompositionReport(projectDir: string, path: string): Readonly<Record<string, unknown>> | undefined {
  if (!path || isAbsolute(path) || path.includes("\0")) return undefined;
  const root = resolve(projectDir);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(absolute)) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(absolute, "utf8"));
    return record(value);
  } catch {
    return undefined;
  }
}
function readChecks(value: unknown): readonly { readonly id: string; readonly verdict: "pass" | "fail" }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const check = record(item);
    const id = check && stringValue(check.id);
    const verdict = check?.verdict;
    return id && (verdict === "pass" || verdict === "fail") ? [{ id, verdict }] : [];
  });
}
function readRacingCameraMode(value: unknown): "chase" | "top-down" | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    const check = record(item);
    if (check?.id !== "camera-readability" || check.verdict !== "pass") continue;
    const measured = record(check.measured);
    if (measured?.selectedMode === "chase" || measured?.selectedMode === "top-down") return measured.selectedMode;
    if (measured?.cameraMode === "follow" && measured.followsSubject === true) return "chase";
    if (measured?.cameraMode === "overview" || measured?.cameraMode === "perspective" || measured?.cameraMode === "top-down") return "top-down";
  }
  return undefined;
}
function geometrySource(value: unknown): ShowcaseGeometryEvidenceSource | undefined {
  return value === "asset-mesh-extracted" || value === "manifest-authored" || value === "manifest-authored-overlay-validated" || value === "compiler-authored" || value === "compiler-authored-overlay-validated" ? value : undefined;
}
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function stringArray(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []; }
