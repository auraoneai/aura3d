/**
 * `aura3d assets admit <id> --quality prototype|candidate|release` (PRD-05 §6.4).
 *
 * Runs the implemented admission gates (G1/G3/G4/G5/G8/G11) on the entry's
 * stored output file and records an `admission` record bound to the derived
 * (or source) hash. `release` requires every gate to pass; `candidate`
 * records failures without blocking; `prototype` is the cap for
 * builder-provenance G5 failures (role `proxy`).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readAssetManifest, writeAssetManifest, writeTypedAssets } from "../../asset-manifest.js";
import type { AuraCliAssetEntry, AuraCliAssetRole } from "../../asset-core-types.js";
import type { AssetQualityCheck } from "../../contracts/assetManifest.js";
import { hasStylizedFlatApproval } from "../../admission/artDirection.js";
import { runAdmissionGates, type GateG5Result } from "../../admission/gates.js";
import { admissionModelFromGltf, readAdmissionGltf } from "../../admission/glb.js";

export interface AdmitOptions {
  readonly projectDir: string;
  readonly assetId: string;
  readonly quality: "prototype" | "candidate" | "release";
  readonly role?: AuraCliAssetRole;
}

export interface AdmitResult {
  readonly ok: boolean;
  readonly checks: readonly AssetQualityCheck[];
  readonly failures: readonly string[];
  readonly wroteManifest: boolean;
  readonly quality?: string;
}

function entryContext(entry: AuraCliAssetEntry, projectDir: string) {
  return {
    id: entry.id,
    role: entry.role,
    quality: entry.quality,
    sourcePath: entry.provenance?.sourcePath ?? entry.source,
    generationProvider: entry.provenance?.generation?.provider,
    derivedPresent: entry.derived !== undefined,
    stylizedFlatApproved: hasStylizedFlatApproval(projectDir, entry),
  };
}

export function admitAsset(options: AdmitOptions): AdmitResult {
  const projectDir = resolve(options.projectDir);
  const manifest = readAssetManifest(projectDir);
  const entry = manifest.assets.find((asset) => asset.id === options.assetId);
  if (!entry) {
    return { ok: false, checks: [], failures: [`Asset "${options.assetId}" is not in the manifest.`], wroteManifest: false };
  }
  const file = resolve(projectDir, entry.derived?.outputPath ?? entry.outputPath);
  if (!existsSync(file)) {
    return { ok: false, checks: [], failures: [`Missing asset file for "${entry.id}": ${entry.outputPath}`], wroteManifest: false };
  }
  const checks = entry.format === "glb" || entry.format === "gltf"
    ? runAdmissionGates(admissionModelFromGltf(readAdmissionGltf(file).json), entryContext(entry, projectDir))
    : [];
  const failures = checks.filter((check) => check.verdict === "fail").map((check) => check.message);
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
    wroteManifest: true,
    quality: nextEntry.quality,
  };
}
