#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const planPath = resolve(root, process.env.A3D_RELEASE_PLAN ?? "tests/reports/release-tarballs/release-plan.json");
const outputPath = resolve(root, process.env.A3D_RELEASE_ARTIFACT_MANIFEST ?? "docs/project/release-artifacts.json");
if (!existsSync(planPath)) throw new Error(`Missing release plan: ${planPath}`);

const plan = JSON.parse(readFileSync(planPath, "utf8"));
if (plan.dryRun !== true || plan.targetVersionUnpublished !== true) {
  throw new Error("Candidate artifact manifest requires a dry-run plan whose target versions are all unpublished.");
}
if (plan.packageCount !== plan.expectedPackageCount || plan.packages.length !== plan.expectedPackageCount) {
  throw new Error(`Release plan package count mismatch: ${plan.packages.length}/${plan.expectedPackageCount}`);
}
const incomplete = plan.packages.filter((entry) => !entry.tarball || !entry.sha256 || entry.unpublished !== true);
if (incomplete.length > 0) throw new Error(`Incomplete package entries: ${incomplete.map((entry) => entry.name).join(", ")}`);

const manifest = {
  schema: "aura3d-release-artifacts/2.0",
  version: plan.version,
  status: "candidate-packed-not-published",
  scope: "Aura3D 2.0.0 exact package rehearsal artifacts; registry, GitHub tag/release, and production website entries are added only after publication succeeds.",
  createdAt: plan.generatedAt,
  sourceCommit: plan.commit,
  lockfileSha256: plan.lockfileSha256,
  artifacts: plan.packages.map((entry) => ({
    type: "tarball",
    name: entry.name,
    version: entry.version,
    pathOrUrl: entry.tarball,
    sha256: entry.sha256,
    integrity: entry.integrity,
    createdAt: plan.generatedAt,
    source: "node tools/release/publish-all.mjs --dry-run"
  }))
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.artifacts.length} Aura3D ${manifest.version} candidate artifacts to ${outputPath}`);
