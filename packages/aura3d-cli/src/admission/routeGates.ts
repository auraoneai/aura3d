/**
 * PRD-05 §6.4 route admission — `assets validate --release --route apps/<app>`.
 *
 * AST-scans the route's sources for `assets.<id>` usages (the same scan
 * `assets validate` already runs) and applies every admission gate G1–G11
 * per referenced asset. The route fails when a referenced asset:
 *   - holds `quality` below the requested bar (`release` here),
 *   - holds role `proxy` (builder-provenance stand-in), or
 *   - fails any gate that could be measured now.
 *
 * G10 route coherence: more than one distinct `artDirection` id across the
 * route's assets requires each doc to declare a `mix` group (and the route
 * needs a group contact sheet ≥ 6 frames — recorded as `needsGroupSheet`).
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readAssetManifest } from "../asset-manifest.js";
import type { AuraCliAssetEntry } from "../asset-core-types.js";
import type { AssetQualityCheck } from "../contracts/assetManifest.js";
import { validateAssetSource } from "../asset-source-validation.js";
import { hasStylizedFlatApproval, readArtDirectionDocument } from "./artDirection.js";
import { admissionModelFromGltf, readAdmissionGltf } from "./glb.js";
import { runAdmissionGates, type AdmissionEntryContext, type AdmissionMeasured, type AdmissionModel, type GateG9Result } from "./gates.js";
import { measureTexelDensity } from "./texel.js";
import { measureTextureSanity } from "./textureStats.js";
import { profileForRole } from "./profiles.js";

export interface RouteAssetResult {
  readonly assetId: string;
  readonly files: readonly string[];
  readonly quality?: string;
  readonly role?: string;
  readonly checks: readonly AssetQualityCheck[];
  readonly failures: readonly string[];
  readonly rendererIssues: readonly string[];
}

export interface RouteValidationReport {
  readonly ok: boolean;
  /** CLI print contract: failures, else a summary line. */
  readonly messages: readonly string[];
  readonly route: string;
  readonly release: boolean;
  readonly assets: readonly RouteAssetResult[];
  /** Route-level failures (missing assets, quality bar, proxy roles, G10 mix). */
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
  /** Distinct art-direction ids seen; >1 without `mix` groups fails G10 route coherence. */
  readonly artDirectionIds: readonly string[];
  readonly needsGroupSheet: boolean;
}

function entryContext(entry: AuraCliAssetEntry, projectDir: string): AdmissionEntryContext {
  return {
    id: entry.id,
    role: entry.role,
    quality: entry.quality,
    sourcePath: entry.provenance?.sourcePath ?? entry.source,
    generationProvider: entry.provenance?.generation?.provider,
    derivedPresent: entry.derived !== undefined,
    stylizedFlatApproved: hasStylizedFlatApproval(projectDir, entry),
    artDirection: entry.artDirection,
  };
}

async function measuredFor(projectDir: string, entry: AuraCliAssetEntry, model: AdmissionModel, file: string, bin: Buffer | undefined, json: Parameters<typeof measureTexelDensity>[0], repoRoot: string): Promise<AdmissionMeasured> {
  const profile = profileForRole(entry.role, model.boundsSize);
  const camera = entry.gameplayCamera ?? profile?.gameplayCamera;
  return {
    texelDensity: camera ? measureTexelDensity(json, bin, { distance: camera.distance, fovDegrees: camera.fovDegrees, viewportWidth: 1920, viewportHeight: 1080 }) : undefined,
    texelDensityMobile: camera ? measureTexelDensity(json, bin, { distance: camera.distance, fovDegrees: camera.fovDegrees, viewportWidth: 390, viewportHeight: 844 }) : undefined,
    textureSanity: await measureTextureSanity(json, bin, dirname(file), repoRoot),
    derivedFileBytes: entry.derived?.measurements?.after?.fileBytes ?? entry.derived?.measurements?.after?.downloadBytes,
    gpuBytesHigh: entry.derived?.measurements?.after?.gpuBytesByTier?.high,
    drawCalls: entry.derived?.measurements?.after?.drawCalls,
    lookDev: entry.lookDev,
    auraScore: typeof entry.lookDev?.metrics?.["auraScore"] === "number" ? entry.lookDev.metrics["auraScore"] as number : undefined,
    artDirectionDoc: entry.artDirection ? readArtDirectionDocument(projectDir, entry.artDirection) ?? undefined : undefined,
  };
}

/**
 * Validates every `assets.<id>` referenced under `route` against the full
 * §6.4 gate set. `release=true` requires `quality === "release"` AND all
 * gates green; without `--release` the same table is reported as warnings.
 */
export async function validateRouteAssets(options: {
  readonly projectDir: string;
  readonly route: string;
  readonly release?: boolean;
  readonly repoRoot?: string;
}): Promise<RouteValidationReport> {
  const projectDir = resolve(options.projectDir);
  const routeDir = resolve(projectDir, options.route);
  const release = options.release === true;
  const manifest = readAssetManifest(projectDir);
  const failures: string[] = [];
  const warnings: string[] = [];
  if (!existsSync(routeDir)) {
    const missing = `Route directory does not exist: ${options.route}`;
    return { ok: false, messages: [missing], route: options.route, release, assets: [], failures: [missing], warnings, artDirectionIds: [], needsGroupSheet: false };
  }
  const source = validateAssetSource(projectDir, options.route, manifest);
  failures.push(...source.failures);
  warnings.push(...source.warnings);
  const assetIds = Object.keys(source.filesByAsset).sort();
  const results: RouteAssetResult[] = [];
  const repoRoot = options.repoRoot ?? projectDir;
  for (const assetId of assetIds) {
    const files = source.filesByAsset[assetId] ?? [];
    const entry = manifest.assets.find((asset) => asset.id === assetId);
    if (!entry) {
      results.push({ assetId, files, checks: [], failures: [`${assetId}: referenced by ${files.join(", ")} but absent from the manifest.`], rendererIssues: [] });
      continue;
    }
    const entryFailures: string[] = [];
    if (release && entry.quality !== "release") {
      entryFailures.push(`${assetId}: quality "${entry.quality ?? "unknown"}" is below release — run \`assets admit ${assetId} --quality release\`.`);
    }
    if (release && entry.role === "proxy") {
      entryFailures.push(`${assetId}: role "proxy" (builder provenance) cannot ship on a release route.`);
    }
    const file = resolve(projectDir, entry.derived?.outputPath ?? entry.outputPath);
    let checks: readonly AssetQualityCheck[] = [];
    let rendererIssues: readonly string[] = [];
    if ((entry.format === "glb" || entry.format === "gltf") && existsSync(file)) {
      const glb = readAdmissionGltf(file);
      const model = admissionModelFromGltf(glb.json);
      const measured = await measuredFor(projectDir, entry, model, file, glb.bin, glb.json, repoRoot);
      checks = runAdmissionGates(model, entryContext(entry, projectDir), measured);
      entryFailures.push(...checks.filter((c) => c.verdict === "fail").map((c) => `${assetId}: ${c.message}`));
      rendererIssues = checks.filter((c) => (c as GateG9Result).rendererIssue === true).map((c) => `${assetId}: ${c.message}`);
    } else if (!existsSync(file)) {
      entryFailures.push(`${assetId}: missing file ${entry.outputPath}`);
    }
    results.push({
      assetId,
      files,
      quality: entry.quality,
      role: entry.role,
      checks,
      failures: entryFailures,
      rendererIssues,
    });
    failures.push(...entryFailures);
  }
  // G10 route coherence: multiple art-direction ids need mix grouping.
  const artDirectionIds = [...new Set(results.flatMap((r) => {
    const entry = manifest.assets.find((a) => a.id === r.assetId);
    return entry?.artDirection ? [entry.artDirection] : [];
  }))].sort();
  let needsGroupSheet = false;
  if (artDirectionIds.length > 1) {
    needsGroupSheet = true;
    const missing = artDirectionIds.filter((id) => {
      const doc = readArtDirectionDocument(projectDir, id);
      return !doc?.mix;
    });
    if (missing.length > 0) {
      failures.push(`G10 route coherence: ${missing.join(", ")} lack a "mix" group entry — routes mixing >1 art directions need mix groups + a group contact sheet (≥6 frames).`);
    }
  }
  const report = {
    ok: failures.length === 0,
    messages: failures.length === 0
      ? [`Route ${options.route}: ${results.length} referenced asset(s) passed the §6.4 admission table.`]
      : failures,
    route: options.route,
    release,
    assets: results,
    failures,
    warnings,
    artDirectionIds,
    needsGroupSheet,
  };
  return report;
}
