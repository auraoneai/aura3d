/**
 * `aura3d assets admit <id> --quality prototype|candidate|release` (PRD-05 §6.4).
 *
 * Runs all eleven admission gates (G1–G11) on the entry's stored output
 * file and records an `admission` record bound to the derived (or source)
 * hash. `release` requires every gate to pass; `candidate` records failures
 * without blocking; `prototype` is the cap for builder-provenance G5
 * failures (role `proxy`).
 *
 * Phase 4: G2 (texel density), G6 (texture sanity 256²), G7 (§17.2 budgets),
 * G9 (look-dev record) and G10 (art direction) run on measured inputs built
 * by {@link measureAdmissionInputs} — async because G6 decodes images via
 * the tool-dep bridge. `admitAsset` stays synchronous and takes a
 * pre-measured {@link AdmissionMeasured} so unit tests can inject reports.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readAssetManifest, writeAssetManifest, writeTypedAssets } from "../../asset-manifest.js";
import type { AuraCliAssetEntry, AuraCliAssetRole } from "../../asset-core-types.js";
import type { AssetQualityCheck } from "../../contracts/assetManifest.js";
import { hasStylizedFlatApproval, readArtDirectionDocument } from "../../admission/artDirection.js";
import { runAdmissionGates, type AdmissionEntryContext, type AdmissionMeasured, type GateG5Result, type GateG9Result } from "../../admission/gates.js";
import { admissionModelFromGltf, readAdmissionGltf, type AdmissionGltfJson } from "../../admission/glb.js";
import type { AdmissionModel } from "../../admission/gates.js";
import { profileForRole } from "../../admission/profiles.js";
import { measureTexelDensity } from "../../admission/texel.js";
import { measureTextureSanity } from "../../admission/textureStats.js";

export interface AdmitOptions {
  readonly projectDir: string;
  readonly assetId: string;
  readonly quality: "prototype" | "candidate" | "release";
  readonly role?: AuraCliAssetRole;
  /** Repo root for the G6 tool-dep bridge (defaults to projectDir). */
  readonly repoRoot?: string;
  /** Skip the measured gates entirely (prototype plumbing; they still fail for `release`). */
  readonly skipMeasured?: boolean;
}

export interface AdmitResult {
  readonly ok: boolean;
  readonly checks: readonly AssetQualityCheck[];
  readonly failures: readonly string[];
  /** G9 renderer-issue rows (Aura−three gap > 1.5) to surface to the caller. */
  readonly rendererIssues: readonly string[];
  readonly wroteManifest: boolean;
  readonly quality?: string;
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

/**
 * Builds the measured inputs the Phase-4 gates consume: texel density at the
 * resolved §6.4 camera (entry `gameplayCamera` override else profile
 * default, evaluated at 1920×1080 and 390×844 — the report records both
 * bands), 256² texture sanity, §17.2 budget numbers, the look-dev record
 * bound to the derived hash, and the art-direction document.
 */
export async function measureAdmissionInputs(projectDir: string, entry: AuraCliAssetEntry, model: AdmissionModel, json: AdmissionGltfJson, bin: Buffer | undefined, glbPath: string, repoRoot: string): Promise<AdmissionMeasured> {
  const profile = profileForRole(entry.role, model.boundsSize);
  const camera = entry.gameplayCamera ?? profile?.gameplayCamera;
  const texelDensity = camera
    ? measureTexelDensity(json, bin, {
        distance: camera.distance,
        fovDegrees: camera.fovDegrees,
        viewportWidth: 1920,
        viewportHeight: 1080,
      })
    : undefined;
  const texelDensityMobile = camera
    ? measureTexelDensity(json, bin, {
        distance: camera.distance,
        fovDegrees: camera.fovDegrees,
        viewportWidth: 390,
        viewportHeight: 844,
      })
    : undefined;
  const textureSanity = await measureTextureSanity(json, bin, dirname(glbPath), repoRoot);
  const derivedBytes = entry.derived?.measurements?.after?.fileBytes
    ?? entry.derived?.measurements?.after?.downloadBytes
    ?? (entry.derived?.outputPath && existsSync(resolve(projectDir, entry.derived.outputPath)) ? statSync(resolve(projectDir, entry.derived.outputPath)).size : undefined);
  return {
    texelDensity,
    texelDensityMobile,
    textureSanity,
    derivedFileBytes: derivedBytes,
    gpuBytesHigh: entry.derived?.measurements?.after?.gpuBytesByTier?.high,
    drawCalls: entry.derived?.measurements?.after?.drawCalls,
    lookDev: entry.lookDev,
    // The look-dev run may record the Aura-adapter score under metrics;
    // G9 compares it against the three-adapter review mean.
    auraScore: typeof entry.lookDev?.metrics?.["auraScore"] === "number" ? entry.lookDev.metrics["auraScore"] as number : undefined,
    artDirectionDoc: entry.artDirection ? readArtDirectionDocument(projectDir, entry.artDirection) ?? undefined : undefined,
  };
}

export function admitAsset(options: AdmitOptions, measured: AdmissionMeasured = {}): AdmitResult {
  const projectDir = resolve(options.projectDir);
  const manifest = readAssetManifest(projectDir);
  const entry = manifest.assets.find((asset) => asset.id === options.assetId);
  if (!entry) {
    return { ok: false, checks: [], failures: [`Asset "${options.assetId}" is not in the manifest.`], rendererIssues: [], wroteManifest: false };
  }
  const file = resolve(projectDir, entry.derived?.outputPath ?? entry.outputPath);
  if (!existsSync(file)) {
    return { ok: false, checks: [], failures: [`Missing asset file for "${entry.id}": ${entry.outputPath}`], rendererIssues: [], wroteManifest: false };
  }
  const checks = entry.format === "glb" || entry.format === "gltf"
    ? runAdmissionGates(admissionModelFromGltf(readAdmissionGltf(file).json), entryContext(entry, projectDir), measured)
    : [];
  const failures = checks.filter((check) => check.verdict === "fail").map((check) => check.message);
  const rendererIssues = checks.filter((check) => (check as GateG9Result).rendererIssue === true).map((check) => check.message);
  const builderCap = checks.some((check) => check.verdict === "fail" && (check as GateG5Result).builderProvenance === true);

  const hardBlock =
    (options.quality === "release" && failures.length > 0) ||
    (options.quality === "candidate" && builderCap);

  const admitted = !hardBlock;
  const nextEntry: AuraCliAssetEntry = {
    ...entry,
    quality: admitted ? options.quality : entry.quality,
    role: admitted && options.quality === "prototype" && builderCap ? "proxy" : (options.role ?? entry.role),
    admission: {
      status: admitted ? "admitted" : "rejected",
      checks,
      at: new Date().toISOString(),
      derivedHash: entry.derived?.hash,
      quality: admitted ? options.quality : entry.quality,
    },
  };
  const next = { ...manifest, assets: manifest.assets.map((asset) => (asset.id === entry.id ? nextEntry : asset)) };
  writeAssetManifest(projectDir, next);
  writeTypedAssets(projectDir, next);
  const blockReasons: string[] = [];
  if (options.quality === "release" && failures.length > 0) blockReasons.push(...failures);
  if (options.quality === "candidate" && builderCap) blockReasons.push("builder provenance caps admission at prototype (role proxy).");
  return {
    ok: admitted,
    checks,
    failures: blockReasons,
    rendererIssues,
    wroteManifest: true,
    quality: nextEntry.quality,
  };
}

/**
 * Full admit flow: measure (async) then gate. This is what the CLI runs;
 * tests that inject fake measurements call `admitAsset` directly.
 */
export async function admitAssetMeasured(options: AdmitOptions): Promise<AdmitResult> {
  const projectDir = resolve(options.projectDir);
  const manifest = readAssetManifest(projectDir);
  const entry = manifest.assets.find((asset) => asset.id === options.assetId);
  if (!entry) {
    return { ok: false, checks: [], failures: [`Asset "${options.assetId}" is not in the manifest.`], rendererIssues: [], wroteManifest: false };
  }
  const file = resolve(projectDir, entry.derived?.outputPath ?? entry.outputPath);
  if (!existsSync(file)) {
    return { ok: false, checks: [], failures: [`Missing asset file for "${entry.id}": ${entry.outputPath}`], rendererIssues: [], wroteManifest: false };
  }
  let measured: AdmissionMeasured = {};
  if (!options.skipMeasured && (entry.format === "glb" || entry.format === "gltf")) {
    const glb = readAdmissionGltf(file);
    const model = admissionModelFromGltf(glb.json);
    measured = await measureAdmissionInputs(projectDir, entry, model, glb.json, glb.bin, file, options.repoRoot ?? projectDir);
  }
  return admitAsset(options, measured);
}
