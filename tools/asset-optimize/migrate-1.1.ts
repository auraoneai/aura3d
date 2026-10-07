/**
 * PRD-05 Phase 0 — manifest 1.1 migration for the root and template manifests.
 *
 *   tsx --tsconfig tsconfig.base.json tools/asset-optimize/migrate-1.1.ts --report
 *   tsx --tsconfig tsconfig.base.json tools/asset-optimize/migrate-1.1.ts --apply
 *
 * --report (default): runs the implemented §6.4 gates (G1/G3/G4/G5/G8/G11)
 * over every glb/gltf model entry whose output file exists, and writes
 * docs/project/aura3d-quality-rebuild/evidence/prd05/assets/migration-1.1.json.
 *
 * --apply additionally downgrades `release` entries that fail gates:
 *   - G5 builder-provenance failures  → quality `prototype`, role `proxy`
 *   - any other gate failure          → quality `candidate`
 * `candidate`/lower entries are recorded but not moved. The root manifest is
 * written through the CLI's canonical writer (writeAssetManifest); template
 * manifests get a minimal JSON patch to keep their diffs small.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readAssetManifest, writeAssetManifest, writeTypedAssets } from "../../packages/aura3d-cli/src/asset-manifest.js";
import type { AuraCliAssetEntry, AuraCliAssetManifest } from "../../packages/aura3d-cli/src/asset-core-types.js";
import type { AssetQualityCheck } from "../../packages/aura3d-cli/src/contracts/assetManifest.js";
import { hasStylizedFlatApproval } from "../../packages/aura3d-cli/src/admission/artDirection.js";
import { runAdmissionGates, type GateG5Result } from "../../packages/aura3d-cli/src/admission/gates.js";
import { admissionModelFromGltf, readAdmissionGltf } from "../../packages/aura3d-cli/src/admission/glb.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidencePath = "docs/project/aura3d-quality-rebuild/evidence/prd05/assets/migration-1.1.json";

interface ManifestTarget {
  /** Repo-relative path of the aura.assets.json. */
  readonly path: string;
  /** Directory the manifest's outputPaths resolve against. */
  readonly dir: string;
  /** "root" writes through writeAssetManifest; "template" gets a minimal patch. */
  readonly kind: "root" | "template";
  readonly manifest: AuraCliAssetManifest;
}

interface EntryReport {
  readonly id: string;
  readonly role?: string;
  readonly quality?: string;
  readonly fileMissing?: boolean;
  readonly checks: readonly AssetQualityCheck[];
  /** "keep" | "candidate" | "prototype-proxy" — what --apply will do to a release entry. */
  readonly action: "keep" | "candidate" | "prototype-proxy" | "not-release";
}

function loadTargets(): ManifestTarget[] {
  const targets: ManifestTarget[] = [];
  const root = join(repoRoot, "aura.assets.json");
  if (existsSync(root)) {
    targets.push({ path: "aura.assets.json", dir: repoRoot, kind: "root", manifest: JSON.parse(readFileSync(root, "utf8")) });
  }
  const templatesDir = join(repoRoot, "packages/create-aura3d/templates");
  if (existsSync(templatesDir)) {
    for (const template of readdirSync(templatesDir).sort()) {
      const manifestPath = join(templatesDir, template, "aura.assets.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AuraCliAssetManifest;
        if (!Array.isArray(manifest.assets)) continue;
        targets.push({ path: `packages/create-aura3d/templates/${template}/aura.assets.json`, dir: join(templatesDir, template), kind: "template", manifest });
      } catch (error) {
        console.warn(`skip ${manifestPath}: ${(error as Error).message}`);
      }
    }
  }
  return targets;
}

function entryContext(target: ManifestTarget, entry: AuraCliAssetEntry) {
  return {
    id: entry.id,
    role: entry.role,
    quality: entry.quality,
    sourcePath: entry.provenance?.sourcePath ?? entry.source,
    generationProvider: entry.provenance?.generation?.provider,
    derivedPresent: entry.derived !== undefined,
    stylizedFlatApproved: hasStylizedFlatApproval(target.dir, entry),
  };
}

function reportEntry(target: ManifestTarget, entry: AuraCliAssetEntry): EntryReport {
  const base = { id: entry.id, role: entry.role, quality: entry.quality };
  if (entry.type !== "model" || (entry.format !== "glb" && entry.format !== "gltf")) {
    return { ...base, checks: [], action: "not-release" };
  }
  const file = resolve(target.dir, entry.outputPath);
  if (!existsSync(file)) {
    return { ...base, fileMissing: true, checks: [], action: entry.quality === "release" ? "candidate" : "not-release" };
  }
  const checks = runAdmissionGates(admissionModelFromGltf(readAdmissionGltf(file).json), entryContext(target, entry));
  const failed = checks.filter((check) => check.verdict === "fail");
  const builderCap = failed.some((check) => check.gate === "G5" && (check as GateG5Result).builderProvenance === true);
  const action =
    entry.quality !== "release" ? "not-release"
    : failed.length === 0 ? "keep"
    : builderCap ? "prototype-proxy"
    : "candidate";
  return { ...base, checks, action };
}

function applyReport(target: ManifestTarget, reports: readonly EntryReport[]): number {
  let changed = 0;
  const actionById = new Map(reports.map((report) => [report.id, report.action]));
  const assets = target.manifest.assets.map((entry) => {
    const action = actionById.get(entry.id);
    if (action === "candidate") {
      changed += 1;
      return { ...entry, quality: "candidate" as const };
    }
    if (action === "prototype-proxy") {
      changed += 1;
      return { ...entry, quality: "prototype" as const, role: "proxy" as const };
    }
    return entry;
  });
  if (changed === 0) return 0;
  const next = { ...target.manifest, assets };
  if (target.kind === "root") {
    writeAssetManifest(target.dir, next);
    // metadata.quality is emitted by typegen — regenerate so `assets typegen
    // --check`-style consumers see no drift.
    writeTypedAssets(target.dir, next);
  } else {
    writeFileSync(join(target.dir, "aura.assets.json"), `${JSON.stringify(next, null, 2)}\n`);
  }
  return changed;
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const targets = loadTargets();
  const out = {
    generatedAt: new Date().toISOString(),
    gates: ["G1", "G3", "G4", "G5", "G8", "G11"],
    manifests: [] as { path: string; assets: EntryReport[] }[],
    summary: { scanned: 0, gateEvaluated: 0, fileMissing: 0, keep: 0, downgradedToCandidate: 0, demotedToProxyPrototype: 0, nonRelease: 0 },
  };
  for (const target of targets) {
    const assets = target.manifest.assets.map((entry) => reportEntry(target, entry));
    out.manifests.push({ path: target.path, assets });
    for (const report of assets) {
      out.summary.scanned += 1;
      if (report.fileMissing) out.summary.fileMissing += 1;
      if (report.checks.length > 0) out.summary.gateEvaluated += 1;
      if (report.action === "keep") out.summary.keep += 1;
      if (report.action === "candidate") out.summary.downgradedToCandidate += 1;
      if (report.action === "prototype-proxy") out.summary.demotedToProxyPrototype += 1;
      if (report.action === "not-release") out.summary.nonRelease += 1;
    }
  }
  const reportPath = join(repoRoot, evidencePath);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${evidencePath}: ${out.summary.scanned} entries, ${out.summary.gateEvaluated} gate-evaluated, ${out.summary.fileMissing} missing files, ${out.summary.keep} release-kept, ${out.summary.downgradedToCandidate} → candidate, ${out.summary.demotedToProxyPrototype} → prototype+proxy`);

  if (apply) {
    for (const [index, target] of targets.entries()) {
      const changed = applyReport(target, out.manifests[index]!.assets);
      if (changed > 0) console.log(`${target.path}: ${changed} entr${changed === 1 ? "y" : "ies"} updated`);
    }
  }
}

main();
